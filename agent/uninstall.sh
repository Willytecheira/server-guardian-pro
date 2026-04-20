#!/usr/bin/env bash
# Quick uninstaller
set -euo pipefail
if [ "$EUID" -ne 0 ]; then echo "Run as root"; exit 1; fi

systemctl disable --now server-guardian.service 2>/dev/null || true
rm -f /etc/systemd/system/server-guardian.service
rm -rf /etc/server-guardian
systemctl daemon-reload
echo "Agent stopped and removed."
echo "Source code at /opt/server-guardian was kept; remove manually if desired."
