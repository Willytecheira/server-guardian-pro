#!/usr/bin/env python3
"""Server Guardian Pro - monitoring agent.
Collects system + Docker metrics and POSTs them to Lovable Cloud.

Configuration via environment variables (set by systemd unit):
  MONITOR_TOKEN       (required) per-server ingest token
  MONITOR_INGEST_URL  (required) full URL to the ingest-metrics edge function
  MONITOR_INTERVAL    (optional) seconds between reports, default 30
"""
import json
import os
import socket
import sys
import time
import platform
import subprocess
from urllib import request, error

INGEST_URL = os.environ.get("MONITOR_INGEST_URL", "").strip()
TOKEN = os.environ.get("MONITOR_TOKEN", "").strip()
INTERVAL = int(os.environ.get("MONITOR_INTERVAL", "30"))
AGENT_VERSION = "1.0.0"

if not TOKEN or not INGEST_URL:
    print("ERROR: MONITOR_TOKEN and MONITOR_INGEST_URL env vars are required", file=sys.stderr)
    sys.exit(1)

try:
    import psutil  # type: ignore
except ImportError:
    print("ERROR: psutil not installed. Run: pip3 install -r requirements.txt", file=sys.stderr)
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


def parse_mem_mb(s: str) -> float:
    s = s.strip()
    units = {
        "B": 1 / 1024 / 1024, "KiB": 1 / 1024, "MiB": 1, "GiB": 1024, "TiB": 1024 * 1024,
        "KB": 1 / 1024, "MB": 1, "GB": 1024, "TB": 1024 * 1024,
    }
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


def collect_docker():
    if not docker_available():
        return [], []

    containers = []
    logs = []

    try:
        ps = subprocess.run(
            ["docker", "ps", "-a", "--no-trunc",
             "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        rows = [l for l in ps.stdout.strip().split("\n") if l]
    except subprocess.SubprocessError as e:
        print(f"docker ps failed: {e}", file=sys.stderr)
        return [], []

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
            stats_map[cid[:12]] = (cpu_v, parse_mem_mb(mem_used))
    except subprocess.SubprocessError:
        pass

    for row in rows:
        parts = row.split("|")
        if len(parts) < 5:
            continue
        full_id, name, image, status, state = parts[0], parts[1], parts[2], parts[3], parts[4]
        short_id = full_id[:12]
        cpu_v, ram_v = stats_map.get(short_id, (None, None))

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

    return containers, logs[-50:]


def send(payload):
    data = json.dumps(payload).encode()
    req = request.Request(
        INGEST_URL, data=data, method="POST",
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
    print(f"[guardian] starting agent v{AGENT_VERSION} -> {INGEST_URL} every {INTERVAL}s", flush=True)
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
                print(f"[guardian] send failed status={status} body={body[:200]}", flush=True)
            else:
                print(f"[guardian] ok cpu={metrics['cpu_percent']}% ram={metrics['ram_percent']}% containers={len(containers)}", flush=True)
        except Exception as e:
            print(f"[guardian] loop error: {e}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
