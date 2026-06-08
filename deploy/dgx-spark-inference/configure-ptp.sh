#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-status}"
PTP_IFACE="${PTP_IFACE:-enp1s0f1np1}"
PTP_DIR="${PTP_DIR:-$HOME/turbalance-ptp}"
PTP_IMAGE="${PTP_IMAGE:-turbalance/linuxptp:24.04}"
PTP_CONTAINER="${PTP_CONTAINER:-turbalance-linuxptp}"
PTP_DOMAIN="${PTP_DOMAIN:-0}"
PTP_TRANSPORT="${PTP_TRANSPORT:-L2}"
PTP_PRIORITY_MASTER="${PTP_PRIORITY_MASTER:-10}"
PTP_PRIORITY_SLAVE="${PTP_PRIORITY_SLAVE:-128}"

usage() {
  cat <<'USAGE'
Usage:
  configure-ptp.sh master   # SPARK1 grandmaster on the DGX interconnect
  configure-ptp.sh slave    # SPARK2 slave on the DGX interconnect
  configure-ptp.sh status
  configure-ptp.sh stop

Environment:
  PTP_IFACE=enp1s0f1np1
  PTP_TRANSPORT=L2
  PTP_DOMAIN=0
  PTP_DIR=$HOME/turbalance-ptp
  PTP_IMAGE=turbalance/linuxptp:24.04
  PTP_CONTAINER=turbalance-linuxptp
USAGE
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for the rootless linuxptp deployment path" >&2
    exit 1
  fi
}

phc_device() {
  local phc_index
  phc_index="$(ethtool -T "$PTP_IFACE" 2>/dev/null | awk -F': ' '/PTP Hardware Clock/ { print $2; exit }')"
  if [[ -z "$phc_index" || "$phc_index" == "none" ]]; then
    echo "No PTP hardware clock reported for $PTP_IFACE" >&2
    exit 1
  fi
  echo "/dev/ptp${phc_index}"
}

build_image() {
  if docker image inspect "$PTP_IMAGE" >/dev/null 2>&1; then
    return
  fi

  mkdir -p "$PTP_DIR/image"
  cat > "$PTP_DIR/image/Dockerfile" <<'DOCKERFILE'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends linuxptp ethtool iproute2 procps ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENTRYPOINT []
DOCKERFILE
  docker build -t "$PTP_IMAGE" "$PTP_DIR/image"
}

write_config() {
  local role="$1"
  local priority="$PTP_PRIORITY_SLAVE"
  local slave_only=1
  if [[ "$role" == "master" ]]; then
    priority="$PTP_PRIORITY_MASTER"
    slave_only=0
  fi

  mkdir -p "$PTP_DIR"
  cat > "$PTP_DIR/ptp4l.conf" <<CONFIG
[global]
twoStepFlag 1
domainNumber ${PTP_DOMAIN}
priority1 ${priority}
priority2 ${priority}
slaveOnly ${slave_only}
time_stamping hardware
network_transport ${PTP_TRANSPORT}
delay_mechanism E2E
tx_timestamp_timeout 20
summary_interval 1
logging_level 6
CONFIG

  cat > "$PTP_DIR/run-linuxptp.sh" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail

ptp4l -f /opt/turbalance-ptp/ptp4l.conf -i "$PTP_IFACE" -m &
ptp4l_pid="$!"

cleanup() {
  kill "$ptp4l_pid" "$phc2sys_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

sleep 3
if [[ "$PTP_ROLE" == "master" ]]; then
  phc2sys -s CLOCK_REALTIME -c "$PTP_PHC_DEVICE" -O 0 -R 4 -N 5 -m &
else
  phc2sys -s "$PTP_IFACE" -c CLOCK_REALTIME -O 0 -R 4 -N 5 -m -w &
fi
phc2sys_pid="$!"

wait -n "$ptp4l_pid" "$phc2sys_pid"
RUNNER
  chmod +x "$PTP_DIR/run-linuxptp.sh"
}

start_ptp() {
  local role="$1"
  if [[ "$role" != "master" && "$role" != "slave" ]]; then
    usage
    exit 1
  fi

  require_docker
  local phc
  phc="$(phc_device)"
  build_image
  write_config "$role"

  docker rm -f "$PTP_CONTAINER" >/dev/null 2>&1 || true
  docker run -d \
    --name "$PTP_CONTAINER" \
    --restart unless-stopped \
    --network host \
    --privileged \
    -e PTP_ROLE="$role" \
    -e PTP_IFACE="$PTP_IFACE" \
    -e PTP_PHC_DEVICE="$phc" \
    -v /dev:/dev \
    -v "$PTP_DIR:/opt/turbalance-ptp" \
    "$PTP_IMAGE" \
    /opt/turbalance-ptp/run-linuxptp.sh

  echo "Started $PTP_CONTAINER as $role on $PTP_IFACE using $phc"
  sleep 5
  status_ptp
}

status_ptp() {
  require_docker
  docker ps --filter "name=^/${PTP_CONTAINER}$" --format 'container={{.Names}} status={{.Status}} image={{.Image}}' || true
  if docker inspect "$PTP_CONTAINER" >/dev/null 2>&1; then
    echo
    docker exec "$PTP_CONTAINER" pgrep -a 'ptp4l|phc2sys' || true
    echo
    docker exec "$PTP_CONTAINER" pmc -u -b 0 "GET TIME_STATUS_NP" || true
    echo
    docker logs --tail 25 "$PTP_CONTAINER" || true
  fi
}

stop_ptp() {
  require_docker
  docker rm -f "$PTP_CONTAINER" >/dev/null 2>&1 || true
  echo "Stopped $PTP_CONTAINER"
}

case "$ROLE" in
  master|slave)
    start_ptp "$ROLE"
    ;;
  status)
    status_ptp
    ;;
  stop)
    stop_ptp
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
