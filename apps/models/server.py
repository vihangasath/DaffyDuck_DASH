"""HTTP front for the Datathon models (standard library only; the model libraries load with the models).

  GET  /health           which models are loaded
  POST /predict/task1    {"rows": [...]} → {"model", "predictions": [{delivery_id, pred_service_min, pred_late_prob}]}
  POST /forecast/task2a  {"rows": [...]} → {"model", "predictions": [{row_id, pred_total_volume_m3, pred_chilled_volume_m3}]}

A task whose files aren't in artifacts/ yet answers 503, and the API keeps its baseline for it.
Loaders are retried on each request until they succeed, so adding a file needs no restart.
"""

from __future__ import annotations

import json
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import predict

_loaded: dict[str, object] = {}
LOADERS = {"task1": predict.load_task1, "task2a": predict.load_task2a}
ROUTES = {"/predict/task1": "task1", "/forecast/task2a": "task2a"}


def model(task: str):
    if task not in _loaded:
        fn = LOADERS[task]()
        if fn is None:
            return None
        _loaded[task] = fn
    return _loaded[task]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path != "/health":
            return self._send(404, {"error": "Not found."})
        self._send(200, {"ok": True, "model": predict.MODEL_NAME, "loaded": {t: model(t) is not None for t in LOADERS}})

    def do_POST(self) -> None:
        task = ROUTES.get(self.path)
        if not task:
            return self._send(404, {"error": "Not found."})
        try:
            rows = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)) or 0) or b"{}").get("rows", [])
        except (ValueError, AttributeError):
            return self._send(400, {"error": "Send JSON: {\"rows\": [...]}."})
        fn = model(task)
        if fn is None:
            return self._send(503, {"error": f"No {task} model yet: add its files to {predict.ARTIFACTS}."})
        try:
            self._send(200, {"model": predict.MODEL_NAME, "predictions": fn(rows)})
        except Exception as err:  # a model bug must not take the service down
            traceback.print_exc()
            self._send(500, {"error": f"{task} model failed: {err}"})

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Waypoint models on :{port} · artifacts in {predict.ARTIFACTS}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
