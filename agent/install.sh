#!/usr/bin/env bash
# Server Guardian Pro - agent installer
# Run AFTER cloning the repo:
#   git clone https://github.com/Willytecheira/server-guardian-pro.git /opt/server-guardian
#   cd /opt/server-guardian/agent
#   sudo MONITOR_TOKEN=xxx ./install.sh
#
# Required env vars:
#   MONITOR_TOKEN       per-server ingest token (from Settings page)
# Optional:
#   MONITOR_INGEST_URL  defaults to the project's ingest-metrics function
#   MONITOR_INTERVAL    default 30 (seconds)

set -euo pipefail

DEFAULT_INGEST_URL="https://flbofahkdtzfhsgehntt.supabase.co/functions/v1/ingest-metrics"
INSTALL_DIR="/opt/server-guardian"
ENV_DIR="/etc/server-guardian"
ENV_FILE="$ENV_DIR/agent.env"
SERVICE_SRC="$(cd "$(dirname "$0")" && pwd)/server-guardian.service"
SERVICE_DST="/etc/systemd/system/server-guardian.service"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./install.sh)"; exit 1
fi

if [ -z "${MONITOR_TOKEN:-}" ]; then
  echo "ERROR: MONITOR_TOKEN env var is required"
  echo "Usage: sudo MONITOR_TOKEN=xxxxx ./install.sh"
  exit 1
fi

INGEST_URL="${MONITOR_INGEST_URL:-$DEFAULT_INGEST_URL}"
INTERVAL="${MONITOR_INTERVAL:-30}"

echo "==> Server Guardian Pro - agent installer"
echo "    ingest URL: $INGEST_URL"
echo "    interval:   ${INTERVAL}s"

echo "==> Installing dependencies (python3, pip)"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq python3 python3-pip git ca-certificates
elif command -v dnf >/dev/null; then
  dnf install -y -q python3 python3-pip git
elif command -v yum >/dev/null; then
  yum install -y -q python3 python3-pip git
elif command -v apk >/dev/null; then
  apk add --no-cache python3 py3-pip git
else
  echo "Unsupported package manager. Install python3 + pip + git manually."; exit 1
fi

echo "==> Installing Python deps (psutil)"
python3 -m pip install --quiet --break-system-packages -r "$(dirname "$0")/requirements.txt" 2>/dev/null \
  || python3 -m pip install --quiet -r "$(dirname "$0")/requirements.txt"

echo "==> Writing env file at $ENV_FILE"
mkdir -p "$ENV_DIR"
chmod 750 "$ENV_DIR"
cat > "$ENV_FILE" <<EOF
MONITOR_TOKEN=$MONITOR_TOKEN
MONITOR_INGEST_URL=$INGEST_URL
MONITOR_INTERVAL=$INTERVAL
EOF
chmod 600 "$ENV_FILE"

echo "==> Installing systemd unit"
cp "$SERVICE_SRC" "$SERVICE_DST"
chmod 644 "$SERVICE_DST"

systemctl daemon-reload
systemctl enable server-guardian.service
systemctl restart server-guardian.service

sleep 2
systemctl --no-pager --lines=15 status server-guardian.service || true

cat <<EOF

==> Done.

Useful commands:
  journalctl -u server-guardian -f          # live logs
  systemctl restart server-guardian         # restart
  systemctl status server-guardian          # status

To update the agent later:
  cd $INSTALL_DIR && git pull && systemctl restart server-guardian
EOF
