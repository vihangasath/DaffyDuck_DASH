# Datathon model service. Built by `docker compose --profile models up` (see docker-compose.yml).
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY predict.py server.py ./
# artifacts/ is mounted read-only by docker compose, so new model files need no rebuild.
ENV PORT=8000 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server.py"]
