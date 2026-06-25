#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = parseArgs(process.argv.slice(2));
const root = path.join(__dirname, "..");
const helperImage = args["helper-image"] || process.env.DGX_FABRIC_HELPER_IMAGE || "nvcr.io/nvidia/pytorch:26.03-py3";
const out = args.out || "";
const apply = flagArg(args.apply);
const validate = flagArg(args.validate) || apply;
const mtu = String(args.mtu || process.env.DGX_FABRIC_MTU || "9000");
const rootMode = args["root-mode"] || process.env.DGX_FABRIC_ROOT_MODE || "docker";
const dockerRoot = rootMode === "docker";

const hosts = {
  jensen: {
    hostname: "DGX-jensen",
    remote: args.jensen || process.env.DGX_JENSEN_REMOTE || "user@192.168.10.42",
    meshIp: "10.77.0.42",
    links: [
      { id: "jl0", peer: "lisa", iface: "enp1s0f1np1", address: "10.77.1.0/31", peerAddress: "10.77.1.1" },
      { id: "jl1", peer: "lisa", iface: "enP2p1s0f1np1", address: "10.77.1.2/31", peerAddress: "10.77.1.3" }
    ]
  },
  lisa: {
    hostname: "DGX-lisa",
    remote: args.lisa || process.env.DGX_LISA_REMOTE || "user@192.168.10.38",
    meshIp: "10.77.0.38",
    links: [
      { id: "jl0", peer: "jensen", iface: "enp1s0f0np0", address: "10.77.1.1/31", peerAddress: "10.77.1.0" },
      { id: "jl1", peer: "jensen", iface: "enP2p1s0f0np0", address: "10.77.1.3/31", peerAddress: "10.77.1.2" }
    ]
  }
};

const excludedHosts = {
  pat: {
    hostname: "DGX-pat",
    remote: args.pat || process.env.DGX_PAT_REMOTE || "user@192.168.10.27",
    meshIp: "10.77.0.27",
    reason: "offline-rma"
  }
};

const hostOrder = ["jensen", "lisa"];

main();

function main() {
  if (flagArg(args.help)) {
    usage();
    return;
  }

  const report = {
    status: apply ? "applied" : validate ? "validated" : "dry-run",
    generatedAt: new Date().toISOString(),
    helperImage,
    mtu,
    rootMode,
    hosts: hostOrder.map((name) => redactHost(name)),
    excludedHosts: Object.entries(excludedHosts).map(([name, host]) => ({
      name,
      hostname: host.hostname,
      remote: host.remote,
      meshIp: host.meshIp,
      reason: host.reason
    }))
  };

  if (!apply && !validate) {
    writeReport(report);
    return;
  }

  if (apply) {
    report.applyResults = hostOrder.map((name) => applyHost(name));
  }
  if (validate) {
    report.validationResults = hostOrder.map((name) => validateHost(name));
  }

  const failed = [
    ...(report.applyResults || []),
    ...(report.validationResults || [])
  ].filter((result) => !result.ok);
  if (failed.length) {
    report.status = "failed";
    process.exitCode = 1;
  }

  writeReport(report);
}

function usage() {
  console.log(`Usage: node scripts/configure-dgx-fabric.js [options]

Configures the active two-node DGX 400G fabric while DGX-pat is offline for RMA:
  DGX-jensen user@192.168.10.42
  DGX-lisa   user@192.168.10.38

Options:
  --apply                 Apply NetworkManager profiles and host aliases
  --validate              Validate existing or newly applied fabric config
  --jensen <ssh-target>   Override Jensen SSH target
  --lisa <ssh-target>     Override Lisa SSH target
  --mtu <bytes>           Fabric MTU (${mtu})
  --helper-image <image>  Docker root-helper image (${helperImage})
  --out <path>            Write JSON report
  --help                  Show this help
`);
}

function redactHost(name) {
  const host = hosts[name];
  return {
    name,
    hostname: host.hostname,
    remote: host.remote,
    meshIp: host.meshIp,
    links: host.links
  };
}

function applyHost(name) {
  const host = hosts[name];
  const script = renderRootApplyScript(name);
  const result = runRootScript(host.remote, script);
  return commandResult(name, "apply", result);
}

function validateHost(name) {
  const host = hosts[name];
  const script = renderValidationScript(name);
  const result = ssh(host.remote, script);
  return commandResult(name, "validate", result);
}

function commandResult(host, step, result) {
  return {
    host,
    step,
    ok: result.status === 0,
    status: result.status ?? -1,
    stdout: String(result.stdout || "").slice(-8000),
    stderr: String(result.stderr || "").slice(-8000),
    error: result.error ? result.error.message : undefined
  };
}

function runRootScript(remote, script) {
  const command = dockerRoot
    ? [
      "docker run --rm -i --privileged --network host -v /:/host",
      shellQuote(helperImage),
      "chroot /host /bin/bash -s"
    ].join(" ")
    : "sudo -n /bin/bash -s";
  return ssh(remote, command, script);
}

function ssh(remote, command, input = "") {
  return spawnSync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "ServerAliveInterval=10",
    "-o", "ServerAliveCountMax=2",
    "-o", "StrictHostKeyChecking=accept-new",
    remote,
    command
  ], {
    cwd: root,
    encoding: "utf8",
    input,
    maxBuffer: 50 * 1024 * 1024
  });
}

function renderRootApplyScript(name) {
  const host = hosts[name];
  const ifaceList = unique(host.links.map((link) => link.iface)).join(",");
  const peerRoutes = peerRouteLines(name).join("\n");
  const hostsBlock = renderHostsBlock();
  const linkCommands = host.links.map((link) => {
    const connectionName = `turba-dgx-fabric-${link.id}`;
    return `
nmcli connection delete ${shellQuote(connectionName)} >/dev/null 2>&1 || true
nmcli connection add type ethernet ifname ${shellQuote(link.iface)} con-name ${shellQuote(connectionName)} \\
  ipv4.method manual ipv4.addresses ${shellQuote(link.address)} ipv4.never-default yes \\
  ipv6.method disabled 802-3-ethernet.mtu ${shellQuote(mtu)} connection.autoconnect yes
nmcli connection up ${shellQuote(connectionName)}
`;
  }).join("\n");

  return `set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

nmcli -t -f NAME connection show | awk -F: '$1 ~ /^turba-dgx-fabric-/ { print $1 }' | while IFS= read -r connection; do
  [ -n "$connection" ] || continue
  nmcli connection delete "$connection" >/dev/null 2>&1 || true
done

for iface in ${host.links.map((link) => shellQuote(link.iface)).join(" ")}; do
  ip link set "$iface" up
  ip link set "$iface" mtu ${shellQuote(mtu)}
done

nmcli connection delete turba-dgx-fabric-loopback >/dev/null 2>&1 || true
nmcli connection add type dummy ifname dgxmesh0 con-name turba-dgx-fabric-loopback \\
  ipv4.method manual ipv4.addresses ${shellQuote(`${host.meshIp}/32`)} ipv4.never-default yes \\
  ipv6.method disabled connection.autoconnect yes
nmcli connection up turba-dgx-fabric-loopback

${linkCommands}

install -d -m 0755 /etc/NetworkManager/dispatcher.d /etc/turbalance /etc/profile.d
cat > /etc/NetworkManager/dispatcher.d/90-turba-dgx-fabric-routes <<'ROUTES'
#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
case "\${2:-manual}" in
  up|vpn-up|connectivity-change|dhcp4-change|reapply|manual) ;;
  *) exit 0 ;;
esac
${peerRoutes}
ROUTES
chmod 0755 /etc/NetworkManager/dispatcher.d/90-turba-dgx-fabric-routes
/etc/NetworkManager/dispatcher.d/90-turba-dgx-fabric-routes dgxmesh0 manual

cat > /etc/turbalance/dgx-fabric.env <<'ENV'
DGX_FABRIC_NODE=${name}
DGX_FABRIC_MESH_IP=${host.meshIp}
DGX_FABRIC_INTERFACES=${ifaceList}
DGX_FABRIC_MTU=${mtu}
NCCL_SOCKET_IFNAME=${ifaceList}
UCX_NET_DEVICES=${ifaceList}
OMPI_MCA_btl_tcp_if_include=${ifaceList}
GLOO_SOCKET_IFNAME=${ifaceList}
TP_SOCKET_IFNAME=${ifaceList}
ENV

cat > /etc/profile.d/turba-dgx-fabric.sh <<'PROFILE'
# Turbalance DGX 400G fabric defaults.
export DGX_FABRIC_NODE=${name}
export DGX_FABRIC_MESH_IP=${host.meshIp}
export DGX_FABRIC_INTERFACES=${ifaceList}
export DGX_FABRIC_MTU=${mtu}
export NCCL_SOCKET_IFNAME=${ifaceList}
export UCX_NET_DEVICES=${ifaceList}
export OMPI_MCA_btl_tcp_if_include=${ifaceList}
export GLOO_SOCKET_IFNAME=${ifaceList}
export TP_SOCKET_IFNAME=${ifaceList}
PROFILE
chmod 0644 /etc/profile.d/turba-dgx-fabric.sh /etc/turbalance/dgx-fabric.env

tmp_hosts="$(mktemp)"
awk '
  /^# BEGIN TURBALANCE DGX FABRIC$/ { skip=1; next }
  /^# END TURBALANCE DGX FABRIC$/ { skip=0; next }
  skip != 1 { print }
' /etc/hosts > "$tmp_hosts"
cat >> "$tmp_hosts" <<'HOSTS'
${hostsBlock}
HOSTS
cat "$tmp_hosts" > /etc/hosts
rm -f "$tmp_hosts"

for dev in dgxmesh0 ${host.links.map((link) => link.iface).join(" ")}; do
  ip -br addr show "$dev" || true
done
ip route show table main | grep '10[.]77[.]0[.]' || true
`;
}

function peerRouteLines(name) {
  const host = hosts[name];
  return unique(host.links.map((link) => link.peer)).map((peer) => {
    const peerLinks = host.links.filter((link) => link.peer === peer);
    const nexthops = peerLinks
      .map((link) => `nexthop via ${link.peerAddress} dev ${link.iface} weight 1`)
      .join(" ");
    return `ip route replace ${hosts[peer].meshIp}/32 ${nexthops}`;
  });
}

function renderHostsBlock() {
  const lines = [
    "# BEGIN TURBALANCE DGX FABRIC",
    ...hostOrder.map((name) => `${hosts[name].meshIp} dgx-${name}-fabric ${hosts[name].hostname.toLowerCase()}-fabric`)
  ];
  for (const name of hostOrder) {
    for (const link of hosts[name].links) {
      const address = link.address.split("/")[0];
      lines.push(`${address} dgx-${name}-${link.id}`);
    }
  }
  lines.push("# END TURBALANCE DGX FABRIC");
  return lines.join("\n");
}

function renderValidationScript(name) {
  const host = hosts[name];
  const linkChecks = host.links.map((link) => {
    return `printf 'ping ${link.iface} ${link.peerAddress}: '; ping -c 2 -W 2 -I ${shellQuote(link.iface)} ${shellQuote(link.peerAddress)} >/dev/null && echo ok || { echo fail; exit 1; }`;
  }).join("\n");
  const meshChecks = unique(host.links.map((link) => link.peer)).map((peer) => {
    return `printf 'ping mesh dgx-${peer}-fabric (${hosts[peer].meshIp}): '; ping -c 2 -W 2 ${shellQuote(hosts[peer].meshIp)} >/dev/null && echo ok || { echo fail; exit 1; }`;
  }).join("\n");
  return `set -euo pipefail
echo "host=$(hostname)"
for dev in dgxmesh0 ${host.links.map((link) => link.iface).join(" ")}; do
  ip -br addr show "$dev" || true
done
${linkChecks}
${meshChecks}
`;
}

function writeReport(report) {
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (out) {
    const fullPath = path.resolve(root, out);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  }
  process.stdout.write(body);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function flagArg(value) {
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function unique(values) {
  return [...new Set(values)];
}
