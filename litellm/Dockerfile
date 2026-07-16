FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir litellm[proxy]

EXPOSE 4000

CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000"]
