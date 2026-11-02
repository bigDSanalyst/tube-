#!/usr/bin/env bash
set -euo pipefail

unset PUBLISHER_HMAC_KEY PUBLISHER_SECRET PUBLISHER_MANIFEST_PUBKEY_PEM PUBLISHER_AUTH_PUBKEY_PEM 2>/dev/null || true

mkdir -p /tmp/.X11-unix /tmp/tmux-65534 /tmp/v2e_trunk_home
chmod 1777 /tmp/.X11-unix
chown 65534:65534 /tmp/tmux-65534 /tmp/v2e_trunk_home
chmod 0700 /tmp/tmux-65534 /tmp/v2e_trunk_home

TRUNK_COOKIE="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
touch /tmp/v2e_trunk_home/.Xauthority /app/.v2e_master_xauth
chmod 0600 /tmp/v2e_trunk_home/.Xauthority /app/.v2e_master_xauth
xauth -f /tmp/v2e_trunk_home/.Xauthority add :99 . "$TRUNK_COOKIE"
xauth -f /app/.v2e_master_xauth add :99 . "$TRUNK_COOKIE"
chown 65534:65534 /tmp/v2e_trunk_home/.Xauthority

env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp/v2e_trunk_home XAUTHORITY=/tmp/v2e_trunk_home/.Xauthority DISPLAY=:99 \
  runuser -u nobody -- Xvfb :99 -screen 0 1024x768x24 -auth /tmp/v2e_trunk_home/.Xauthority -nolisten tcp +extension GLX +render -noreset &

for _ in $(seq 1 250); do
    [ -S /tmp/.X11-unix/X99 ] && break
    sleep 0.02
done
if [ ! -S /tmp/.X11-unix/X99 ]; then
    echo "[V2E-v8] FATAL: Xvfb :99 failed to bind /tmp/.X11-unix/X99" >&2
    exit 1
fi

env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp/v2e_trunk_home XAUTHORITY=/tmp/v2e_trunk_home/.Xauthority DISPLAY=:99 \
  runuser -u nobody -- openbox &
sleep 0.2

env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp/v2e_trunk_home XAUTHORITY=/tmp/v2e_trunk_home/.Xauthority DISPLAY=:99 TERM=xterm-256color \
  runuser -u nobody -- tmux -S /tmp/tmux-65534/v2e_trunk new-session -d -s main -x 120 -y 36

env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp/v2e_trunk_home XAUTHORITY=/tmp/v2e_trunk_home/.Xauthority DISPLAY=:99 TERM=xterm-256color \
  runuser -u nobody -- xterm -geometry 120x36+10+10 -bg "#0d1117" -fg "#58a6ff" \
  -T "V2E_TRUNK_WINDOW" -e tmux -S /tmp/tmux-65534/v2e_trunk attach-session -t main &

if [ ! -f /app/videos/demo.mp4 ]; then
    ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:duration=15 \
        -vf "drawbox=x=40:y=40:w=920:h=600:color=0x161b22@0.95:t=fill, \
             drawbox=x=980:y=480:w=260:h=200:color=0x1f6feb@0.9:t=fill, \
             drawtext=text='WORKSPACE SUBSCREEN (Click to Fork)':x=80:y=90:fontsize=28:fontcolor=white, \
             drawtext=text='echo Hello World && ls -la':x=80:y=160:fontsize=24:fontcolor=0x3fb950, \
             drawtext=text='SPEAKER STREAM (Tap to Pause)':x=995:y=560:fontsize=16:fontcolor=white" \
        -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /app/videos/demo.mp4
fi

echo "[V2E-v8] Starting FastAPI orchestrator..."
exec uvicorn app:app --host 0.0.0.0 --port 8000
