#!/usr/bin/env python3
"""Subnet-scoped discovery and credential-gated live-agent deployment."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shlex
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDES = [
    ".git",
    "build",
    "node_modules",
    "frontend/react/node_modules",
    ".DS_Store",
    "__pycache__",
    "*.pyc",
]


def main() -> int:
    args = parse_args()
    credentials = load_credentials(args.credentials_file, args.user)
    discovered = scan_subnet(args) if args.scan else []
    forced = list(args.discovered_host or [])
    known_remotes = list(args.remote or []) + [entry["remote"] for entry in credentials if entry.get("remote")]
    candidate_hosts = sorted(set(discovered + forced + [remote_host(remote) for remote in known_remotes if remote_host(remote)]), key=ip_sort_key)
    monitored = monitored_hosts(args.live_bundle)
    candidates = [candidate_for_host(host, args, credentials, known_remotes, monitored) for host in candidate_hosts]
    eligible = [candidate for candidate in candidates if candidate["deploymentEligible"]]
    deployment = deploy_hosts(eligible, args) if eligible else None
    report = {
        "status": "applied" if args.apply and deployment and deployment["ok"] else "failed" if args.apply and deployment else "blocked" if args.apply else "dry-run",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if args.apply else "dry-run",
        "subnet": args.subnet,
        "port": args.port,
        "scanEnabled": args.scan,
        "credentialsFile": redact_path(args.credentials_file) if args.credentials_file else "",
        "liveBundle": args.live_bundle,
        "summary": {
            "discoveredHosts": len(discovered),
            "candidateHosts": len(candidates),
            "credentialedHosts": sum(1 for candidate in candidates if candidate["credentialStatus"] == "ok"),
            "monitoredHosts": sum(1 for candidate in candidates if candidate["alreadyMonitored"]),
            "deploymentEligibleHosts": len(eligible),
        },
        "commands": {
            "dryRun": render_self_command(args, apply=False),
            "apply": render_self_command(args, apply=True),
        },
        "candidates": candidates,
        "deployment": deployment,
    }
    write_report(report, args.out)
    return 1 if report["status"] == "failed" else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover SSH hosts and deploy the Turbalance live-machine agent when credentials already work.")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--scan", default=os.environ.get("TURBALANCE_DISCOVERY_SCAN", "true"))
    parser.add_argument("--subnet", default=os.environ.get("TURBALANCE_DISCOVERY_SUBNET", "192.168.10.0/24"))
    parser.add_argument("--range", default=os.environ.get("TURBALANCE_DISCOVERY_RANGE", "1-254"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("TURBALANCE_DISCOVERY_SSH_PORT", "22")))
    parser.add_argument("--user", default=os.environ.get("TURBALANCE_DISCOVERY_USER", ""))
    parser.add_argument("--remote", action="append", default=[])
    parser.add_argument("--discovered-host", action="append", default=[])
    parser.add_argument("--credentials-file", default=os.environ.get("TURBALANCE_DISCOVERY_CREDENTIALS_FILE", ""))
    parser.add_argument("--live-bundle", default=os.environ.get("TURBALANCE_LIVE_MACHINE_BUNDLE", "build/demo/live-machine-bundle.json"))
    parser.add_argument("--probe-timeout-ms", type=int, default=int(os.environ.get("TURBALANCE_DISCOVERY_PROBE_TIMEOUT_MS", "220")))
    parser.add_argument("--ssh-timeout-seconds", type=int, default=int(os.environ.get("TURBALANCE_DISCOVERY_SSH_TIMEOUT_SECONDS", "5")))
    parser.add_argument("--concurrency", type=int, default=int(os.environ.get("TURBALANCE_DISCOVERY_CONCURRENCY", "32")))
    parser.add_argument("--collector-url", default=os.environ.get("TURBALANCE_COLLECTOR_URL", ""))
    parser.add_argument("--host-url", default=os.environ.get("TURBALANCE_MACHINE_DEMO_URL", ""))
    parser.add_argument("--remote-root", default=os.environ.get("TURBALANCE_REMOTE_ROOT", "/home/user/turbalance-analytics"))
    parser.add_argument("--systemd-mode", choices=["user", "system"], default=os.environ.get("TURBALANCE_SYSTEMD_MODE", "user"))
    parser.add_argument("--tenant-id", default=os.environ.get("TURBALANCE_TENANT_ID", "dgx-lab"))
    parser.add_argument("--benchmarks", nargs="?", const="true", default=os.environ.get("TURBALANCE_DISCOVERY_BENCHMARKS", "true"))
    parser.add_argument("--out", default=os.environ.get("TURBALANCE_DISCOVERY_DEPLOY_REPORT", "build/auto-discovery/latest-report.json"))
    parsed = parser.parse_args()
    parsed.scan = str(parsed.scan).lower() in {"1", "true", "yes", "on"}
    parsed.benchmarks = str(parsed.benchmarks).lower() in {"1", "true", "yes", "on"}
    parsed.remote = split_values(parsed.remote)
    parsed.discovered_host = split_values(parsed.discovered_host)
    return parsed


def load_credentials(file_path: str, default_user: str) -> list[dict[str, str]]:
    if not file_path:
        return []
    full_path = (ROOT / file_path).resolve()
    if not full_path.exists():
        return []
    body = json.loads(full_path.read_text())
    defaults = body.get("defaults", {})
    entries = body.get("hosts") or body.get("credentials") or []
    credentials = []
    for entry in entries:
        host = str(entry.get("host") or remote_host(entry.get("remote", "")) or "").strip()
        user = entry.get("user") or defaults.get("user") or default_user
        remote = entry.get("remote") or (f"{user}@{host}" if user and host else "")
        if host or remote:
            credentials.append({
                "host": host,
                "hostname": entry.get("hostname", ""),
                "remote": remote,
                "role": entry.get("role", ""),
            })
    return credentials


def scan_subnet(args: argparse.Namespace) -> list[str]:
    prefix = subnet_prefix(args.subnet)
    hosts = [f"{prefix}{item}" for item in parse_range(args.range)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.concurrency, 128))) as executor:
        results = list(executor.map(lambda host: host if tcp_open(host, args.port, args.probe_timeout_ms / 1000) else "", hosts))
    return [host for host in results if host]


def candidate_for_host(host: str, args: argparse.Namespace, credentials: list[dict[str, str]], known_remotes: list[str], monitored: set[str]) -> dict[str, object]:
    credential = credential_for_host(host, args, credentials, known_remotes)
    remote = credential.get("remote", "")
    already_monitored = normalize_host(host) in monitored or normalize_host(credential.get("hostname", "")) in monitored
    credential_check = check_ssh(remote, args) if remote else {"status": "missing", "detail": "No user/remote mapping"}
    eligible = credential_check["status"] == "ok" and not already_monitored
    return {
        "host": host,
        "hostname": credential.get("hostname", ""),
        "remote": remote,
        "role": credential.get("role") or target_role(host, credential.get("hostname", "")),
        "discovered": True,
        "alreadyMonitored": already_monitored,
        "credentialStatus": credential_check["status"],
        "credentialDetail": credential_check["detail"],
        "deploymentEligible": eligible,
        "deploymentPlan": "install-or-refresh-live-machine-agent" if eligible else "skip-already-monitored" if already_monitored else "skip-no-credential",
    }


def credential_for_host(host: str, args: argparse.Namespace, credentials: list[dict[str, str]], known_remotes: list[str]) -> dict[str, str]:
    normalized = normalize_host(host)
    for entry in credentials:
        if normalized in {normalize_host(entry.get("host", "")), normalize_host(entry.get("hostname", "")), normalize_host(remote_host(entry.get("remote", "")))}:
            return entry
    for remote in known_remotes:
        if normalize_host(remote_host(remote)) == normalized:
            return {"host": host, "hostname": "", "remote": remote, "role": ""}
    return {"host": host, "hostname": "", "remote": f"{args.user}@{host}" if args.user else "", "role": ""}


def check_ssh(remote: str, args: argparse.Namespace) -> dict[str, str]:
    result = run([
        "ssh",
        "-o", "BatchMode=yes",
        "-o", f"ConnectTimeout={max(1, args.ssh_timeout_seconds)}",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=1",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", str(args.port),
        remote,
        "printf turbalance-ssh-ok",
    ], timeout=max(2, args.ssh_timeout_seconds + 1))
    if result.returncode == 0 and "turbalance-ssh-ok" in result.stdout:
        return {"status": "ok", "detail": "BatchMode SSH accepted"}
    detail = (result.stderr or f"SSH exited {result.returncode}").strip()[-240:]
    return {"status": "missing", "detail": detail}


def deploy_hosts(candidates: list[dict[str, object]], args: argparse.Namespace) -> dict[str, object]:
    results = []
    for candidate in candidates:
        remote = str(candidate["remote"])
        env = agent_env(candidate, args)
        unit = user_service_unit(args.remote_root) if args.systemd_mode == "user" else system_service_unit(args.remote_root)
        steps = [
            ("prepare-directories", ssh(remote, prepare_command(args, candidate))),
            ("sync-repository", rsync(remote, args.remote_root)),
            ("install-agent-env", ssh(remote, install_text_command(agent_env_path(args), env, "600", sudo=args.systemd_mode == "system"))),
            ("install-agent-service", ssh(remote, install_text_command(agent_service_path(args), unit, "644", sudo=args.systemd_mode == "system"))),
            ("systemd-reload", ssh(remote, systemd_command(args, "daemon-reload"))),
            ("enable-live-agent", ssh(remote, systemd_command(args, "enable --now turbalance-live-machine-agent.service"))),
            ("restart-live-agent", ssh(remote, systemd_command(args, "restart turbalance-live-machine-agent.service"))),
        ]
        step_results = []
        for name, command in steps:
            if not args.apply:
                step_results.append({"step": name, "ok": True, "status": "planned", "command": redact_command(command)})
                continue
            completed = run(["sh", "-lc", command], timeout=90)
            step_results.append({
                "step": name,
                "ok": completed.returncode == 0,
                "status": completed.returncode,
                "stdout": completed.stdout[-2000:],
                "stderr": completed.stderr[-2000:],
            })
            if completed.returncode != 0:
                break
        results.append({"remote": remote, "host": candidate["host"], "steps": step_results})
    return {
        "ok": all(all(step["ok"] for step in result["steps"]) for result in results),
        "mode": "apply" if args.apply else "dry-run",
        "targets": results,
    }


def agent_env(candidate: dict[str, object], args: argparse.Namespace) -> str:
    home = f"/home/{str(candidate['remote']).split('@')[0]}" if "@" in str(candidate["remote"]) else "$HOME"
    state_dir = f"{home}/.local/state/turbalance/live-machine-agent" if args.systemd_mode == "user" else "/var/lib/turbalance/live-machine-agent"
    values = {
        "TURBALANCE_TENANT_ID": args.tenant_id,
        "TURBALANCE_HOST_ID": candidate["host"],
        "TURBALANCE_AGENT_ID": f"{safe_id(candidate['host'])}-live-machine-push",
        "TURBALANCE_COLLECTOR_URL": args.collector_url,
        "TURBALANCE_MACHINE_DEMO_URL": args.host_url,
        "TURBALANCE_AGENT_LOOP_MS": "1000",
        "TURBALANCE_AGENT_POST_TIMEOUT_MS": "10000",
        "TURBALANCE_AGENT_SEQUENCE_PATH": f"{state_dir}/sequence-no",
        "TURBALANCE_AGENT_SPOOL_DIR": f"{state_dir}/spool" if args.systemd_mode == "user" else "/var/spool/turbalance/live-machine-agent",
        "TURBALANCE_AGENT_MAX_REPLAY": "25",
        "TURBALANCE_GPU_BACKEND": "auto",
        "TURBALANCE_DGX_INTERCONNECT_INTERFACE": "enp1s0f1np1" if candidate.get("role") == "spark" else "",
        "TURBALANCE_DGX_INTERCONNECT_SUBNET_PREFIX": "192.168.100." if candidate.get("role") == "spark" else "",
        "TURBALANCE_MACHINE_BENCHMARKS": "1" if args.benchmarks else "0",
        "TURBALANCE_PI_BENCHMARKS": "0",
        "TURBALANCE_BENCHMARK_TTL_MS": "900000",
        "TURBALANCE_BENCHMARK_DURATION_MS": "250",
        "TURBALANCE_BENCHMARK_BUFFER_MIB": "16",
        "TURBALANCE_BENCHMARK_DISK_MIB": "32",
    }
    return "".join(f"{key}={shell_env(value)}\n" for key, value in values.items())


def prepare_command(args: argparse.Namespace, candidate: dict[str, object]) -> str:
    if args.systemd_mode == "system":
        parent = str(Path(args.remote_root).parent)
        return "; ".join([
            "set -e",
            f"sudo -n mkdir -p {quote(args.remote_root)} {quote(args.remote_root + '/build')} /etc/turbalance /var/lib/turbalance/live-machine-agent /var/spool/turbalance/live-machine-agent",
            f"sudo -n chown -R \"$USER\":\"$USER\" {quote(parent)}",
        ])
    user = str(candidate["remote"]).split("@")[0]
    home = f"/home/{user}"
    state_dir = f"{home}/.local/state/turbalance/live-machine-agent"
    return "; ".join([
        "set -e",
        f"mkdir -p {quote(args.remote_root)} {quote(args.remote_root + '/build')} {quote(home + '/.config/turbalance')} {quote(home + '/.config/systemd/user')} {quote(state_dir + '/spool')}",
        f"chmod 700 {quote(state_dir)} {quote(state_dir + '/spool')}",
    ])


def rsync(remote: str, remote_root: str) -> str:
    parts = [
        "rsync", "-az", "--timeout", "30",
        "-e", "ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 -o StrictHostKeyChecking=accept-new",
    ]
    for item in EXCLUDES:
        parts.extend(["--exclude", item])
    parts.extend([str(ROOT) + "/", f"{remote}:{remote_root}/"])
    return " ".join(quote(part) for part in parts)


def install_text_command(path: str, body: str, mode: str, sudo: bool) -> str:
    import base64
    encoded = base64.b64encode(body.encode()).decode()
    if sudo:
        return f"printf %s {quote(encoded)} | base64 -d | sudo -n tee {quote(path)} >/dev/null && sudo -n chmod {quote(mode)} {quote(path)}"
    return f"mkdir -p {quote(str(Path(path).parent))} && printf %s {quote(encoded)} | base64 -d > {quote(path)} && chmod {quote(mode)} {quote(path)}"


def user_service_unit(remote_root: str) -> str:
    return "\n".join([
        "[Unit]",
        "Description=Turbalance live machine telemetry push agent",
        "After=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        "EnvironmentFile=-%h/.config/turbalance/live-machine-agent.env",
        f"WorkingDirectory={remote_root}",
        f"ExecStart=/usr/bin/env node {remote_root}/scripts/push-live-machine-telemetry.js",
        "Restart=always",
        "RestartSec=5",
        "TimeoutStopSec=20",
        "KillSignal=SIGINT",
        "NoNewPrivileges=true",
        "PrivateTmp=true",
        "",
        "[Install]",
        "WantedBy=default.target",
        "",
    ])


def system_service_unit(remote_root: str) -> str:
    unit_path = ROOT / "deploy/systemd/turbalance-live-machine-agent.service"
    if unit_path.exists():
        return unit_path.read_text().replace("/opt/turbalance/Analytics", remote_root)
    return user_service_unit(remote_root)


def agent_env_path(args: argparse.Namespace) -> str:
    return "/etc/turbalance/live-machine-agent.env" if args.systemd_mode == "system" else "$HOME/.config/turbalance/live-machine-agent.env"


def agent_service_path(args: argparse.Namespace) -> str:
    return "/etc/systemd/system/turbalance-live-machine-agent.service" if args.systemd_mode == "system" else "$HOME/.config/systemd/user/turbalance-live-machine-agent.service"


def systemd_command(args: argparse.Namespace, command: str) -> str:
    return f"sudo -n systemctl {command}" if args.systemd_mode == "system" else f"systemctl --user {command}"


def ssh(remote: str, command: str) -> str:
    return " ".join([
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "ServerAliveInterval=10",
        "-o", "ServerAliveCountMax=2",
        "-o", "StrictHostKeyChecking=accept-new",
        quote(remote),
        quote(command),
    ])


def monitored_hosts(live_bundle: str) -> set[str]:
    path = (ROOT / live_bundle).resolve()
    hosts: set[str] = set()
    if not path.exists():
        return hosts
    try:
        bundle = json.loads(path.read_text())
    except Exception:
        return hosts
    for run in bundle.get("ingestion", {}).get("runs", []) + bundle.get("runs", []):
        context = run.get("sourceContext") or run.get("source", {}).get("context", {})
        for value in [run.get("name"), run.get("cluster"), context.get("hostname"), context.get("node"), context.get("host"), context.get("networkLocalAddress")]:
            if value:
                hosts.add(normalize_host(str(value)))
    for value in bundle.get("metadata", {}).get("observedHosts", []):
        hosts.add(normalize_host(str(value)))
    return hosts


def render_self_command(args: argparse.Namespace, apply: bool) -> str:
    parts = [
        "python3", "scripts/auto-discover-deploy.py",
        "--subnet", args.subnet,
        "--range", args.range,
    ]
    if args.user:
        parts.extend(["--user", args.user])
    if args.credentials_file:
        parts.extend(["--credentials-file", args.credentials_file])
    if args.collector_url:
        parts.extend(["--collector-url", args.collector_url])
    if args.host_url:
        parts.extend(["--host-url", args.host_url])
    parts.extend(["--remote-root", args.remote_root, "--systemd-mode", args.systemd_mode, "--out", args.out])
    if args.benchmarks:
        parts.append("--benchmarks")
    if apply:
        parts.append("--apply")
    return " ".join(quote(part) for part in parts)


def write_report(report: dict[str, object], out: str) -> None:
    body = json.dumps(report, indent=2) + "\n"
    if out:
        path = (ROOT / out).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
        path.chmod(0o600)
    sys.stdout.write(body)


def tcp_open(host: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def subnet_prefix(subnet: str) -> str:
    if subnet.endswith("/24"):
        subnet = subnet[:-3]
    parts = subnet.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3]) + "."
    if len(parts) == 3:
        return subnet + "."
    raise ValueError(f"only /24 subnets are supported, got {subnet}")


def parse_range(value: str) -> list[int]:
    items: set[int] = set()
    for part in value.split(","):
        if not part.strip():
            continue
        pieces = part.split("-", 1)
        start = int(pieces[0])
        end = int(pieces[1]) if len(pieces) == 2 else start
        for item in range(max(1, start), min(254, end) + 1):
            items.add(item)
    return sorted(items)


def split_values(values: list[str]) -> list[str]:
    return [entry.strip() for value in values for entry in str(value).split(",") if entry.strip()]


def remote_host(remote: str) -> str:
    value = str(remote or "").strip()
    return value.split("@", 1)[1] if "@" in value else value


def target_role(host: str, hostname: str) -> str:
    label = f"{host} {hostname}"
    if "pi" in label.lower():
        return "pi"
    if any(token in label.lower() for token in ("dgx", "spark")) or host in {"192.168.10.20", "192.168.10.21", "192.168.10.27", "192.168.10.33", "192.168.10.38", "192.168.10.42"}:
        return "spark"
    return "nuc"


def ip_sort_key(value: str) -> str:
    return ".".join(part.zfill(3) for part in str(value).split("."))


def normalize_host(value: str) -> str:
    return str(value or "").strip().lower()


def safe_id(value: object) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in str(value)).strip("-") or "host"


def shell_env(value: object) -> str:
    text = str(value or "")
    return text if not text or all(char.isalnum() or char in "_./:@-" for char in text) else json.dumps(text)


def quote(value: object) -> str:
    return shlex.quote(str(value))


def redact_command(value: str) -> str:
    return value


def redact_path(value: str) -> str:
    return str(value)


def run(argv: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=ROOT, text=True, capture_output=True, timeout=timeout)


if __name__ == "__main__":
    raise SystemExit(main())
