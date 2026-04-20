# Server Guardian Pro - Agent

Lightweight Python agent that collects system + Docker metrics and reports them
to the Server Guardian Pro dashboard (Lovable Cloud).

## What it collects

- **System**: CPU %, RAM (used / total / %), Disk (used / total / %), network bytes (rx/tx), load average (1/5/15), uptime
- **Docker** (if installed): all containers (state, image, CPU %, RAM MB, restart count)
- **Container logs**: last 5 lines per running container, error level auto-detected

Reports every 30 seconds (configurable).

## Requirements

- Linux with systemd
- Python 3.7+
- `git` (for installation/updates)
- `docker` (optional, only needed if you want container metrics)
- root access (for systemd service install)

Tested on: Debian 11/12, Ubuntu 20.04/22.04/24.04, RHEL/Rocky/Alma 8/9, Alpine.

## Install

1. Get your **per-server token** from the dashboard:
   *Settings → create a server → copy the ingest token*

2. Clone this repo and run the installer on the target server:

```bash
sudo git clone https://github.com/Willytecheira/server-guardian-pro.git /opt/server-guardian
cd /opt/server-guardian/agent
sudo MONITOR_TOKEN=<paste-token-here> ./install.sh
```

The installer will:
- install `python3`, `pip`, `git` and `psutil`
- write `/etc/server-guardian/agent.env` with your token
- install and enable a `server-guardian.service` systemd unit
- start the agent

You should see the server appear as **online** in the dashboard within ~30 s.

## Update

```bash
cd /opt/server-guardian
sudo git pull
sudo systemctl restart server-guardian
```

## Useful commands

```bash
journalctl -u server-guardian -f          # live logs
systemctl status server-guardian          # status
systemctl restart server-guardian         # restart after editing env
sudo nano /etc/server-guardian/agent.env  # change token / interval
```

## Uninstall

```bash
sudo /opt/server-guardian/agent/uninstall.sh
# Optional: also remove the cloned repo
sudo rm -rf /opt/server-guardian
```

## Configuration

Environment variables (set in `/etc/server-guardian/agent.env`):

| Variable             | Required | Default                                                     | Description                       |
|----------------------|----------|-------------------------------------------------------------|-----------------------------------|
| `MONITOR_TOKEN`      | yes      | —                                                           | Per-server ingest token           |
| `MONITOR_INGEST_URL` | no       | `https://flbofahkdtzfhsgehntt.supabase.co/functions/v1/ingest-metrics` | Override the ingest endpoint |
| `MONITOR_INTERVAL`   | no       | `30`                                                        | Seconds between reports           |

After editing the env file, `sudo systemctl restart server-guardian`.

## Security notes

- The token authenticates the server to the dashboard. Treat it like a password.
- The env file is `chmod 600` and only readable by root.
- The agent only sends data outbound (HTTPS). It does not open any ports.
- No SSH or remote-execution capabilities are included.
