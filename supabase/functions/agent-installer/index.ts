// Public endpoint that serves the install script and the Python agent.
// No auth: the secret is the per-server ingest token passed by the user.
// Usage:
//   GET ?file=install.sh&token=XXX  -> bash installer (curl | bash)
//   GET ?file=agent.py              -> raw Python agent
//   GET ?file=server-monitor.service&token=XXX -> systemd unit

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const INGEST_URL = `${PROJECT_URL}/functions/v1/ingest-metrics`;

const AGENT_PY = String.raw`#!/usr/bin/env python3
"""Server Monitor agent. Collects system + Docker metrics and POSTs to Lovable Cloud."""
import json
import os
import socket
import sys
import time
import platform
import subprocess
from urllib import request, error

INGEST_URL = os.environ.get("MONITOR_INGEST_URL", "__INGEST_URL__")
TOKEN = os.environ.get("MONITOR_TOKEN", "")
INTERVAL = int(os.environ.get("MONITOR_INTERVAL", "30"))
AGENT_VERSION = "1.0.0"

if not TOKEN:
    print("ERROR: MONITOR_TOKEN env var is required", file=sys.stderr)
    sys.exit(1)

try:
    import psutil  # type: ignore
except ImportError:
    print("ERROR: psutil not installed. Run: pip3 install psutil", file=sys.stderr)
    sys.exit(1)


def collect_system():
    vm = psutil.virtual_memory()
    du = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    try:
        load1, load5, load15 = os.getloadavg()
    except (AttributeError, OSError):
        load1 = load5 = load15 = 0.0
    return {
        "cpu_percent": round(psutil.cpu_percent(interval=1), 2),
        "ram_percent": round(vm.percent, 2),
        "ram_used_mb": round(vm.used / 1024 / 1024, 1),
        "ram_total_mb": round(vm.total / 1024 / 1024, 1),
        "disk_percent": round(du.percent, 2),
        "disk_used_gb": round(du.used / 1024 / 1024 / 1024, 2),
        "disk_total_gb": round(du.total / 1024 / 1024 / 1024, 2),
        "net_rx_bytes": net.bytes_recv,
        "net_tx_bytes": net.bytes_sent,
        "load_1": round(load1, 2),
        "load_5": round(load5, 2),
        "load_15": round(load15, 2),
        "uptime_seconds": int(time.time() - psutil.boot_time()),
    }


def docker_available():
    try:
        subprocess.run(["docker", "--version"], capture_output=True, timeout=2, check=True)
        return True
    except (FileNotFoundError, subprocess.SubprocessError):
        return False


def collect_docker():
    if not docker_available():
        return [], []

    containers = []
    logs = []

    try:
        ps = subprocess.run(
            ["docker", "ps", "-a", "--no-trunc",
             "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.RunningFor}}"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        rows = [l for l in ps.stdout.strip().split("\n") if l]
    except subprocess.SubprocessError as e:
        print(f"docker ps failed: {e}", file=sys.stderr)
        return [], []

    # Stats only for running containers
    stats_map = {}
    try:
        st = subprocess.run(
            ["docker", "stats", "--no-stream",
             "--format", "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}"],
            capture_output=True, text=True, timeout=15, check=True,
        )
        for line in st.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 3:
                continue
            cid, cpu, mem = parts
            cpu_v = float(cpu.replace("%", "").strip() or 0)
            mem_used = mem.split("/")[0].strip()
            mb = parse_mem_mb(mem_used)
            stats_map[cid[:12]] = (cpu_v, mb)
    except subprocess.SubprocessError:
        pass

    for row in rows:
        parts = row.split("|")
        if len(parts) < 5:
            continue
        full_id, name, image, status, state = parts[0], parts[1], parts[2], parts[3], parts[4]
        short_id = full_id[:12]
        cpu_v, ram_v = stats_map.get(short_id, (None, None))

        # Restart count via inspect (best effort)
        restart_count = 0
        try:
            insp = subprocess.run(
                ["docker", "inspect", "--format", "{{.RestartCount}}", full_id],
                capture_output=True, text=True, timeout=3, check=True,
            )
            restart_count = int(insp.stdout.strip() or 0)
        except (subprocess.SubprocessError, ValueError):
            pass

        containers.append({
            "container_id": short_id,
            "name": name,
            "image": image,
            "status": status,
            "state": state,
            "cpu_percent": cpu_v,
            "ram_mb": ram_v,
            "restart_count": restart_count,
        })

        # Last 5 log lines for running containers
        if state == "running":
            try:
                lg = subprocess.run(
                    ["docker", "logs", "--tail", "5", full_id],
                    capture_output=True, text=True, timeout=5,
                )
                for line in (lg.stdout + lg.stderr).strip().split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    level = "error" if any(k in line.lower() for k in ("error", "fatal", "panic")) else "info"
                    logs.append({"container_name": name, "level": level, "message": line[:1000]})
            except subprocess.SubprocessError:
                pass

    return containers, logs[-50:]  # cap


def parse_mem_mb(s: str) -> float:
    s = s.strip()
    units = {"B": 1/1024/1024, "KiB": 1/1024, "MiB": 1, "GiB": 1024, "TiB": 1024*1024,
             "KB": 1/1024, "MB": 1, "GB": 1024, "TB": 1024*1024}
    for u in sorted(units.keys(), key=len, reverse=True):
        if s.endswith(u):
            try:
                return round(float(s[:-len(u)].strip()) * units[u], 1)
            except ValueError:
                return 0.0
    try:
        return round(float(s) / 1024 / 1024, 1)
    except ValueError:
        return 0.0


def send(payload):
    data = json.dumps(payload).encode()
    req = request.Request(
        INGEST_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "x-ingest-token": TOKEN},
    )
    try:
        with request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode()
    except error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


def main():
    hostname = socket.gethostname()
    os_str = f"{platform.system()} {platform.release()}"
    print(f"[server-monitor] starting agent v{AGENT_VERSION} -> {INGEST_URL} every {INTERVAL}s", flush=True)
    while True:
        try:
            metrics = collect_system()
            containers, logs = collect_docker()
            payload = {
                "hostname": hostname,
                "os": os_str,
                "agent_version": AGENT_VERSION,
                "metrics": metrics,
                "containers": containers,
                "logs": logs,
            }
            status, body = send(payload)
            if status >= 400 or status == 0:
                print(f"[server-monitor] send failed status={status} body={body[:200]}", flush=True)
            else:
                print(f"[server-monitor] ok cpu={metrics['cpu_percent']}% ram={metrics['ram_percent']}% containers={len(containers)}", flush=True)
        except Exception as e:
            print(f"[server-monitor] loop error: {e}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
`;

const SERVICE_TPL = (token: string) => `[Unit]
Description=Server Monitor Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
Environment="MONITOR_TOKEN=${token}"
Environment="MONITOR_INGEST_URL=${INGEST_URL}"
Environment="MONITOR_INTERVAL=30"
ExecStart=/usr/bin/python3 /opt/server-monitor/agent.py
Restart=always
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
`;

const INSTALL_SH = (token: string) => {
  const base = `${PROJECT_URL}/functions/v1/agent-installer`;
  return `#!/usr/bin/env bash
set -euo pipefail

TOKEN="${token}"
BASE="${base}"
INSTALL_DIR="/opt/server-monitor"

echo "==> Server Monitor agent installer"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo bash)"; exit 1
fi

echo "==> Installing dependencies (python3, pip, psutil)"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq python3 python3-pip curl ca-certificates
elif command -v dnf >/dev/null; then
  dnf install -y -q python3 python3-pip curl
elif command -v yum >/dev/null; then
  yum install -y -q python3 python3-pip curl
elif command -v apk >/dev/null; then
  apk add --no-cache python3 py3-pip curl
else
  echo "Unsupported package manager. Install python3 + pip manually."; exit 1
fi

python3 -m pip install --quiet --break-system-packages psutil 2>/dev/null \\
  || python3 -m pip install --quiet psutil

echo "==> Downloading agent"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$BASE?file=agent.py" -o "$INSTALL_DIR/agent.py"
chmod 755 "$INSTALL_DIR/agent.py"

echo "==> Installing systemd service"
curl -fsSL "$BASE?file=server-monitor.service&token=$TOKEN" -o /etc/systemd/system/server-monitor.service
chmod 644 /etc/systemd/system/server-monitor.service

systemctl daemon-reload
systemctl enable server-monitor.service
systemctl restart server-monitor.service

sleep 2
systemctl --no-pager --lines=10 status server-monitor.service || true

echo ""
echo "==> Done. Tail logs with:  journalctl -u server-monitor -f"
`;
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const file = url.searchParams.get("file") || "install.sh";
  const token = url.searchParams.get("token") || "";

  if (file === "agent.py") {
    return new Response(AGENT_PY.replace("__INGEST_URL__", INGEST_URL), {
      headers: { ...corsHeaders, "Content-Type": "text/x-python; charset=utf-8" },
    });
  }

  if (file === "server-monitor.service") {
    if (!token) return new Response("token required", { status: 400, headers: corsHeaders });
    return new Response(SERVICE_TPL(token), {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (file === "install.sh") {
    if (!token) return new Response("token required", { status: 400, headers: corsHeaders });
    return new Response(INSTALL_SH(token), {
      headers: { ...corsHeaders, "Content-Type": "text/x-shellscript; charset=utf-8" },
    });
  }

  return new Response("unknown file", { status: 404, headers: corsHeaders });
});
