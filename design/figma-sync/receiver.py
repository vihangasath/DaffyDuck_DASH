# Saves screen captures POSTed from the browser (capture.js) to ./captures/<name>.json.
import json, os, re
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captures")

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        path = os.path.join(os.path.dirname(OUT), "capture.js")
        body = open(path, "rb").read()
        self.send_response(200); self._cors()
        self.send_header("Content-Type", "text/javascript"); self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", self.path.strip("/")) or "capture"
        body = self.rfile.read(int(self.headers["Content-Length"]))
        with open(os.path.join(OUT, name + ".json"), "wb") as f:
            f.write(body)
        self.send_response(200); self._cors(); self.end_headers()
        self.wfile.write(json.dumps({"saved": name, "bytes": len(body)}).encode())

    def log_message(self, *a):
        pass

HTTPServer(("127.0.0.1", 8765), H).serve_forever()
