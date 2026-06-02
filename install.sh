#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR="$SCRIPT_DIR"
PREFIX="${TURBALANCE_INSTALL_PREFIX:-/opt/turbalance-analytics}"
MODE="auto"
START=1
DRY_RUN=0
FORCE=0
WITH_SYSTEMD=0
UNINSTALL=0
REMOVE_DATA=0
APP_PORT="${TURBALANCE_APP_PORT:-8000}"
COLLECTOR_PORT="${GB100_APP_COLLECTOR_PORT:-9500}"
ENV_FILE=""
LIVE_MACHINE=0
LIVE_MACHINE_HOST_URL="${TURBALANCE_MACHINE_DEMO_URL:-}"
LIVE_MACHINE_LOOP_MS="${TURBALANCE_LIVE_MACHINE_LOOP_MS:-1000}"
LIVE_MACHINE_FAST_REFRESH="${TURBALANCE_LIVE_MACHINE_FAST_REFRESH:-1}"
LIVE_MACHINE_BUNDLE="${TURBALANCE_LIVE_MACHINE_BUNDLE:-build/demo/live-machine-bundle.json}"
NODE_BIN="${TURBALANCE_NODE_BIN:-node}"

usage() {
  cat <<'EOF'
usage: ./install.sh [options]

Deploy turbalance Analytics and the GB100/GB200 telemetry stack on a target machine.

Options:
  --mode auto|docker|k8s|static
      auto picks Docker Compose when available, otherwise static.
      docker starts DCGM Exporter, app collector, Prometheus, and Grafana.
      k8s applies the Kubernetes DaemonSet and app collector to the current kubectl context.
      static copies the analyzer and starts a lightweight static server plus app collector.

  --prefix DIR
      Installation directory. Default: /opt/turbalance-analytics

  --env-file FILE
      Environment file to copy into the install. Defaults to deploy/install/gb100-telemetry.env.example.

  --app-port PORT
      Static analyzer port for --mode static. Default: 8000

  --collector-port PORT
      App collector port for --mode static. Default: 9500

  --with-systemd
      Install systemd units for static mode or Docker Compose mode on Linux hosts.

  --live-machine
      In static mode, run the high-rate live machine bundle collector.
      With --with-systemd this creates turbalance-live-machine-collector.service.

  --live-machine-host-url URL
      URL embedded in the live machine bundle. Default: http://<primary-ip>:APP_PORT

  --live-machine-loop-ms MS
      Refresh interval for the live machine bundle collector. Default: 1000

  --node-bin PATH
      Node.js executable for --live-machine. Default: node

  --no-start
      Install files only. Do not start services.

  --dry-run
      Print the actions without changing the machine.

  --force
      Allow installing into a non-empty prefix.

  --uninstall
      Stop services created by this installer.

  --remove-data
      With --uninstall, remove the installation directory.

  --help
      Show this help text.

Examples:
  ./install.sh --mode docker --prefix /opt/turbalance-analytics
  ./install.sh --mode k8s --prefix /opt/turbalance-analytics --no-start
  ./install.sh --mode static --prefix "$HOME/turbalance-analytics"
EOF
}

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'install error: %s\n' "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

have_executable() {
  case "$1" in
    */*) [ -x "$1" ] ;;
    *) have "$1" ;;
  esac
}

primary_address() {
  if have hostname; then
    # shellcheck disable=SC2086
    set -- $(hostname -I 2>/dev/null || true)
    if [ -n "${1:-}" ]; then
      printf '%s' "$1"
      return 0
    fi
  fi
  if have ip; then
    address="$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.][0-9.]*\).*/\1/p' | head -n 1)"
    if [ -n "$address" ]; then
      printf '%s' "$address"
      return 0
    fi
  fi
  printf '%s' "127.0.0.1"
}

live_machine_url() {
  if [ -n "$LIVE_MACHINE_HOST_URL" ]; then
    printf '%s' "$LIVE_MACHINE_HOST_URL"
  else
    printf 'http://%s:%s' "$(primary_address)" "$APP_PORT"
  fi
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+'
    for arg in "$@"; do
      printf ' %s' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

run_shell() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ %s\n' "$*"
  else
    sh -c "$*"
  fi
}

compose_command() {
  if have docker && docker compose version >/dev/null 2>&1; then
    printf '%s' "docker compose"
    return 0
  fi
  if have docker-compose; then
    printf '%s' "docker-compose"
    return 0
  fi
  return 1
}

is_empty_dir() {
  [ ! -d "$1" ] && return 0
  [ -z "$(find "$1" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)" ]
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        MODE="${2:-}"
        shift 2
        ;;
      --prefix)
        PREFIX="${2:-}"
        shift 2
        ;;
      --env-file)
        ENV_FILE="${2:-}"
        shift 2
        ;;
      --app-port)
        APP_PORT="${2:-}"
        shift 2
        ;;
      --collector-port)
        COLLECTOR_PORT="${2:-}"
        shift 2
        ;;
      --with-systemd)
        WITH_SYSTEMD=1
        shift
        ;;
      --live-machine)
        LIVE_MACHINE=1
        shift
        ;;
      --live-machine-host-url)
        LIVE_MACHINE_HOST_URL="${2:-}"
        shift 2
        ;;
      --live-machine-loop-ms)
        LIVE_MACHINE_LOOP_MS="${2:-}"
        shift 2
        ;;
      --node-bin)
        NODE_BIN="${2:-}"
        shift 2
        ;;
      --no-start)
        START=0
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --force)
        FORCE=1
        shift
        ;;
      --uninstall)
        UNINSTALL=1
        shift
        ;;
      --remove-data)
        REMOVE_DATA=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "unknown option: $1"
        ;;
    esac
  done

  case "$MODE" in
    auto|docker|k8s|static) ;;
    *) fail "--mode must be auto, docker, k8s, or static" ;;
  esac

  [ -n "$PREFIX" ] || fail "--prefix cannot be empty"
  [ -n "$APP_PORT" ] || fail "--app-port cannot be empty"
  [ -n "$COLLECTOR_PORT" ] || fail "--collector-port cannot be empty"
  [ -n "$LIVE_MACHINE_LOOP_MS" ] || fail "--live-machine-loop-ms cannot be empty"
  [ -n "$NODE_BIN" ] || fail "--node-bin cannot be empty"
}

detect_mode() {
  if [ "$MODE" != "auto" ]; then
    return 0
  fi
  if compose_command >/dev/null 2>&1; then
    MODE="docker"
  else
    MODE="static"
  fi
}

check_prereqs() {
  case "$MODE" in
    docker)
      compose_command >/dev/null 2>&1 || fail "Docker Compose is required for --mode docker"
      ;;
    k8s)
      have kubectl || fail "kubectl is required for --mode k8s"
      ;;
    static)
      have python3 || fail "python3 is required for --mode static"
      if [ "$LIVE_MACHINE" -eq 1 ]; then
        have_executable "$NODE_BIN" || fail "$NODE_BIN is required for --live-machine"
      fi
      ;;
  esac
  if [ "$WITH_SYSTEMD" -eq 1 ] && [ "$DRY_RUN" -ne 1 ] && ! have systemctl; then
    fail "--with-systemd requires systemctl"
  fi
}

copy_tree() {
  if [ "$FORCE" -ne 1 ] && ! is_empty_dir "$PREFIX"; then
    fail "$PREFIX is not empty; use --force to install there"
  fi

  log "Installing files from $SOURCE_DIR to $PREFIX"
  run mkdir -p "$PREFIX"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would copy repository files, excluding .git, build, node_modules, and transient OS files."
    return 0
  fi

  if have rsync; then
    rsync -a \
      --exclude '.git' \
      --exclude 'build' \
      --exclude 'node_modules' \
      --exclude '.DS_Store' \
      "$SOURCE_DIR"/ "$PREFIX"/
  else
    (cd "$SOURCE_DIR" && tar \
      --exclude './.git' \
      --exclude './build' \
      --exclude './node_modules' \
      --exclude './.DS_Store' \
      -cf - .) | (cd "$PREFIX" && tar -xf -)
  fi
}

write_env() {
  src="$ENV_FILE"
  if [ -z "$src" ]; then
    src="$SOURCE_DIR/deploy/install/gb100-telemetry.env.example"
  fi
  dest="$PREFIX/deploy/install/gb100-telemetry.env"
  run mkdir -p "$PREFIX/deploy/install"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would write $dest from $src"
    return 0
  fi
  if [ -f "$src" ]; then
    cp "$src" "$dest"
  elif [ -f "$PREFIX/deploy/install/gb100-telemetry.env.example" ]; then
    cp "$PREFIX/deploy/install/gb100-telemetry.env.example" "$dest"
  else
    cat > "$dest" <<EOF
DCGM_EXPORTER_INTERVAL=1000
DCGM_REMOTE_HOSTENGINE_INFO=
ENABLE_NVML_COLLECTOR=false
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
TURBALANCE_APP_PORT=$APP_PORT
GB100_APP_COLLECTOR_PORT=$COLLECTOR_PORT
EOF
  fi
  cat >> "$dest" <<EOF

# Values written by install.sh for this installation.
TURBALANCE_APP_PORT=$APP_PORT
GB100_APP_COLLECTOR_PORT=$COLLECTOR_PORT
TURBALANCE_NODE_BIN=$NODE_BIN
TURBALANCE_MACHINE_DEMO_URL=$(live_machine_url)
TURBALANCE_LIVE_MACHINE_LOOP_MS=$LIVE_MACHINE_LOOP_MS
TURBALANCE_LIVE_MACHINE_FAST_REFRESH=$LIVE_MACHINE_FAST_REFRESH
TURBALANCE_LIVE_MACHINE_BUNDLE=$LIVE_MACHINE_BUNDLE
EOF
}

write_state() {
  state="$PREFIX/deploy/install/install-state.json"
  live_machine_json=false
  [ "$LIVE_MACHINE" -eq 1 ] && live_machine_json=true
  run mkdir -p "$PREFIX/deploy/install"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would write $state"
    return 0
  fi
  cat > "$state" <<EOF
{
  "schemaVersion": "turbalance.install.v1",
  "installedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "sourceDir": "$SOURCE_DIR",
  "prefix": "$PREFIX",
  "mode": "$MODE",
  "appPort": "$APP_PORT",
  "collectorPort": "$COLLECTOR_PORT",
  "liveMachine": $live_machine_json,
  "liveMachineHostUrl": "$(live_machine_url)",
  "liveMachineBundle": "$LIVE_MACHINE_BUNDLE"
}
EOF
}

start_static_processes() {
  run mkdir -p "$PREFIX/.run" "$PREFIX/build/demo" "$PREFIX/build/gb100-runtime"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Would start static analyzer on :$APP_PORT and app collector on :$COLLECTOR_PORT"
    if [ "$LIVE_MACHINE" -eq 1 ]; then
      log "Would start live machine bundle collector writing $LIVE_MACHINE_BUNDLE"
    fi
    return 0
  fi

  if [ -f "$PREFIX/.run/turbalance-analytics.pid" ] && kill -0 "$(cat "$PREFIX/.run/turbalance-analytics.pid")" >/dev/null 2>&1; then
    log "Static analyzer already running with PID $(cat "$PREFIX/.run/turbalance-analytics.pid")"
  else
    (cd "$PREFIX" && nohup python3 -m http.server "$APP_PORT" --bind 0.0.0.0 > "$PREFIX/build/gb100-runtime/static-server.log" 2>&1 & echo $! > "$PREFIX/.run/turbalance-analytics.pid")
  fi

  if [ -f "$PREFIX/.run/gb100-app-collector.pid" ] && kill -0 "$(cat "$PREFIX/.run/gb100-app-collector.pid")" >/dev/null 2>&1; then
    log "GB100 app collector already running with PID $(cat "$PREFIX/.run/gb100-app-collector.pid")"
  else
    (cd "$PREFIX" && nohup python3 collectors/app_telemetry_exporter.py --listen 0.0.0.0 --port "$COLLECTOR_PORT" > "$PREFIX/build/gb100-runtime/app-collector.log" 2>&1 & echo $! > "$PREFIX/.run/gb100-app-collector.pid")
  fi

  if [ "$LIVE_MACHINE" -eq 1 ]; then
    if [ -f "$PREFIX/.run/turbalance-live-machine-collector.pid" ] && kill -0 "$(cat "$PREFIX/.run/turbalance-live-machine-collector.pid")" >/dev/null 2>&1; then
      log "Live machine collector already running with PID $(cat "$PREFIX/.run/turbalance-live-machine-collector.pid")"
    else
      (cd "$PREFIX" && nohup "$NODE_BIN" scripts/collect-local-machine-bundle.js --out "$LIVE_MACHINE_BUNDLE" --host-url "$(live_machine_url)" --loop-ms "$LIVE_MACHINE_LOOP_MS" --fast-refresh "$LIVE_MACHINE_FAST_REFRESH" > "$PREFIX/build/gb100-runtime/live-machine-collector.log" 2>&1 & echo $! > "$PREFIX/.run/turbalance-live-machine-collector.pid")
    fi
  fi
}

install_systemd_units() {
  [ "$WITH_SYSTEMD" -eq 1 ] || return 0
  [ "$DRY_RUN" -eq 1 ] || [ "$(id -u)" -eq 0 ] || fail "--with-systemd must be run as root or through sudo"

  if [ "$MODE" = "docker" ]; then
    compose="$(compose_command)"
    unit="/etc/systemd/system/turbalance-gb100-telemetry.service"
    if [ "$DRY_RUN" -eq 1 ]; then
      log "Would write $unit"
    else
      cat > "$unit" <<EOF
[Unit]
Description=turbalance GB100 telemetry Docker Compose stack
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PREFIX
EnvironmentFile=-$PREFIX/deploy/install/gb100-telemetry.env
ExecStart=/bin/sh -lc 'cd "$PREFIX" && $compose -f deploy/docker/docker-compose.yml --env-file deploy/install/gb100-telemetry.env up -d'
ExecStop=/bin/sh -lc 'cd "$PREFIX" && $compose -f deploy/docker/docker-compose.yml --env-file deploy/install/gb100-telemetry.env down'

[Install]
WantedBy=multi-user.target
EOF
    fi
    run systemctl daemon-reload
    run systemctl enable turbalance-gb100-telemetry.service
    [ "$START" -eq 0 ] || run systemctl restart turbalance-gb100-telemetry.service
    return 0
  fi

  if [ "$MODE" = "static" ]; then
    analytics_unit="/etc/systemd/system/turbalance-analytics.service"
    collector_unit="/etc/systemd/system/turbalance-gb100-app-collector.service"
    live_machine_unit="/etc/systemd/system/turbalance-live-machine-collector.service"
    if [ "$DRY_RUN" -eq 1 ]; then
      log "Would write $analytics_unit and $collector_unit"
      if [ "$LIVE_MACHINE" -eq 1 ]; then
        log "Would write $live_machine_unit"
      fi
    else
      cat > "$analytics_unit" <<EOF
[Unit]
Description=turbalance Analytics static app
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$PREFIX
EnvironmentFile=-$PREFIX/deploy/install/gb100-telemetry.env
ExecStart=/bin/sh -lc 'python3 -m http.server "\${TURBALANCE_APP_PORT:-$APP_PORT}" --bind 0.0.0.0'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
      cat > "$collector_unit" <<EOF
[Unit]
Description=GB100 app telemetry collector
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$PREFIX
EnvironmentFile=-$PREFIX/deploy/install/gb100-telemetry.env
ExecStart=/bin/sh -lc 'python3 collectors/app_telemetry_exporter.py --listen 0.0.0.0 --port "\${GB100_APP_COLLECTOR_PORT:-$COLLECTOR_PORT}"'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
      if [ "$LIVE_MACHINE" -eq 1 ]; then
        cat > "$live_machine_unit" <<EOF
[Unit]
Description=turbalance live machine bundle collector
After=network-online.target turbalance-analytics.service
Wants=network-online.target

[Service]
WorkingDirectory=$PREFIX
EnvironmentFile=-$PREFIX/deploy/install/gb100-telemetry.env
ExecStartPre=/bin/mkdir -p $PREFIX/build/demo
ExecStart=/bin/sh -lc 'exec "\${TURBALANCE_NODE_BIN:-$NODE_BIN}" scripts/collect-local-machine-bundle.js --out "\${TURBALANCE_LIVE_MACHINE_BUNDLE:-$LIVE_MACHINE_BUNDLE}" --host-url "\${TURBALANCE_MACHINE_DEMO_URL:-$(live_machine_url)}" --loop-ms "\${TURBALANCE_LIVE_MACHINE_LOOP_MS:-$LIVE_MACHINE_LOOP_MS}" --fast-refresh "\${TURBALANCE_LIVE_MACHINE_FAST_REFRESH:-$LIVE_MACHINE_FAST_REFRESH}"'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
      fi
    fi
    run systemctl daemon-reload
    run systemctl enable turbalance-analytics.service turbalance-gb100-app-collector.service
    if [ "$LIVE_MACHINE" -eq 1 ]; then
      run systemctl enable turbalance-live-machine-collector.service
    fi
    if [ "$START" -ne 0 ]; then
      run systemctl restart turbalance-analytics.service turbalance-gb100-app-collector.service
      if [ "$LIVE_MACHINE" -eq 1 ]; then
        run systemctl restart turbalance-live-machine-collector.service
      fi
    fi
  fi
}

deploy_docker() {
  compose="$(compose_command)"
  if [ "$WITH_SYSTEMD" -eq 1 ]; then
    install_systemd_units
    return 0
  fi
  [ "$START" -eq 0 ] && return 0
  run_shell "cd '$PREFIX' && $compose -f deploy/docker/docker-compose.yml --env-file deploy/install/gb100-telemetry.env up -d"
}

deploy_k8s() {
  [ "$START" -eq 0 ] && return 0
  run kubectl apply -f "$PREFIX/deploy/kubernetes/namespace.yaml"
  run_shell "kubectl -n gb100-telemetry create configmap gb100-dcgm-fields --from-file=gb100-dcgm-fields.csv='$PREFIX/metrics/gb100-dcgm-fields.csv' --dry-run=client -o yaml | kubectl apply -f -"
  run_shell "kubectl -n gb100-telemetry create configmap gb100-metric-capabilities --from-file=gb100-metric-capabilities.json='$PREFIX/metrics/gb100-metric-capabilities.json' --dry-run=client -o yaml | kubectl apply -f -"
  run_shell "kubectl -n gb100-telemetry create configmap gb100-app-collector-source --from-file=app_telemetry_exporter.py='$PREFIX/collectors/app_telemetry_exporter.py' --from-file=facility_adapter.py='$PREFIX/collectors/facility_adapter.py' --from-file=nvml_confidential_collector.py='$PREFIX/collectors/nvml_confidential_collector.py' --dry-run=client -o yaml | kubectl apply -f -"
  run kubectl apply -f "$PREFIX/deploy/kubernetes/gb100-dcgm-exporter-daemonset.yaml"
  run kubectl apply -f "$PREFIX/deploy/kubernetes/gb100-app-collector-deployment.yaml"
}

deploy_static() {
  if [ "$WITH_SYSTEMD" -eq 1 ]; then
    install_systemd_units
    return 0
  fi
  [ "$START" -eq 0 ] || start_static_processes
}

stop_pid_file() {
  pid_file="$1"
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      run kill "$pid"
    fi
    run rm -f "$pid_file"
  fi
}

uninstall() {
  log "Stopping turbalance services from $PREFIX"
  if [ -f "$PREFIX/deploy/docker/docker-compose.yml" ] && compose_command >/dev/null 2>&1; then
    compose="$(compose_command)"
    run_shell "cd '$PREFIX' && $compose -f deploy/docker/docker-compose.yml --env-file deploy/install/gb100-telemetry.env down"
  fi
  stop_pid_file "$PREFIX/.run/turbalance-analytics.pid"
  stop_pid_file "$PREFIX/.run/gb100-app-collector.pid"
  stop_pid_file "$PREFIX/.run/turbalance-live-machine-collector.pid"
  if have systemctl; then
    run systemctl stop turbalance-gb100-telemetry.service turbalance-analytics.service turbalance-gb100-app-collector.service turbalance-live-machine-collector.service 2>/dev/null || true
    run systemctl disable turbalance-gb100-telemetry.service turbalance-analytics.service turbalance-gb100-app-collector.service turbalance-live-machine-collector.service 2>/dev/null || true
  fi
  if [ "$REMOVE_DATA" -eq 1 ]; then
    run rm -rf "$PREFIX"
  fi
}

print_summary() {
  log ""
  log "Installation complete."
  log "Mode: $MODE"
  log "Prefix: $PREFIX"
  case "$MODE" in
    docker)
      log "Prometheus: http://127.0.0.1:9090"
      log "Grafana: http://127.0.0.1:3000"
      log "DCGM Exporter: http://127.0.0.1:9400/metrics"
      log "App collector: http://127.0.0.1:9500/metrics"
      ;;
    static)
      log "Analyzer: http://127.0.0.1:$APP_PORT"
      log "App collector: http://127.0.0.1:$COLLECTOR_PORT/metrics"
      if [ "$LIVE_MACHINE" -eq 1 ]; then
        log "Live machine bundle: $PREFIX/$LIVE_MACHINE_BUNDLE"
        log "Live machine URL: $(live_machine_url)"
      fi
      ;;
    k8s)
      log "Kubernetes namespace: gb100-telemetry"
      log "Check pods: kubectl -n gb100-telemetry get pods"
      ;;
  esac
  log "Validate on the target host: $PREFIX/bin/gb100-telemetry-report --out-dir $PREFIX/build/gb100-support"
}

main() {
  parse_args "$@"
  detect_mode

  if [ "$UNINSTALL" -eq 1 ]; then
    uninstall
    exit 0
  fi

  check_prereqs
  copy_tree
  write_env
  write_state

  case "$MODE" in
    docker) deploy_docker ;;
    k8s) deploy_k8s ;;
    static) deploy_static ;;
  esac

  print_summary
}

main "$@"
