FROM python:3.11-slim-bookworm
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11-utils xauth xdotool openbox tmux xterm \
    tesseract-ocr libtesseract-dev \
    ffmpeg libgl1 libglib2.0-0 \
    procps curl bubblewrap \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY entrypoint.sh /app/entrypoint.sh
COPY module_cache.py /app/module_cache.py
COPY app.py /app/app.py
COPY static /app/static

RUN chmod +x /app/entrypoint.sh && mkdir -p /app/videos /app/checkpoints /app/manifests
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
