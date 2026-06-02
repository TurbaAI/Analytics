# Installer And Package Guide

This repo can be deployed directly from a checkout or packaged into a tarball for another machine.

## Build A Portable Package

```sh
make package-gb100
```

The package builder writes a tarball under `build/packages/`. Copy that tarball to the target host, then unpack it:

```sh
tar -xzf turbalance-gb100-telemetry-*.tar.gz
cd turbalance-gb100-telemetry-*
```

## Install Modes

### Docker Mode

Docker mode starts DCGM Exporter, the app collector, Prometheus, and Grafana:

```sh
sudo ./install.sh --mode docker --prefix /opt/turbalance-analytics
```

URLs:

- Analyzer files: `/opt/turbalance-analytics/index.html`
- Prometheus: `http://127.0.0.1:9090`
- Grafana: `http://127.0.0.1:3000`
- DCGM Exporter: `http://127.0.0.1:9400/metrics`
- App collector: `http://127.0.0.1:9500/metrics`

Use `--with-systemd` on Linux hosts if the Docker Compose stack should restart after boot:

```sh
sudo ./install.sh --mode docker --prefix /opt/turbalance-analytics --with-systemd
```

### Kubernetes Mode

Kubernetes mode copies the package locally, creates ConfigMaps from the custom allowlist and collector source, and applies the DaemonSet and collector Deployment to the current `kubectl` context:

```sh
sudo ./install.sh --mode k8s --prefix /opt/turbalance-analytics
kubectl -n gb100-telemetry get pods
```

This mode expects GPU nodes with the NVIDIA driver stack, NVIDIA container runtime, and a Kubernetes device-plugin or GPU Operator path already installed.

### Static Mode

Static mode works on any machine with `python3`. It copies the analyzer and starts a lightweight HTTP server plus the app collector. It does not run DCGM Exporter, Prometheus, or Grafana.

```sh
./install.sh --mode static --prefix "$HOME/turbalance-analytics"
```

URLs:

- Analyzer: `http://127.0.0.1:8000`
- App collector: `http://127.0.0.1:9500/metrics`

Use `--no-start` to install files only:

```sh
./install.sh --mode static --prefix "$HOME/turbalance-analytics" --no-start
```

## Configuration

The installer writes `deploy/install/gb100-telemetry.env` under the install prefix. Start from:

```sh
deploy/install/gb100-telemetry.env.example
```

Important settings:

- `DCGM_EXPORTER_INTERVAL`: default `1000` ms.
- `DCGM_REMOTE_HOSTENGINE_INFO`: blank for embedded hostengine, or `host:port` for a remote hostengine.
- `ENABLE_NVML_COLLECTOR`: optional confidential-computing collector.
- `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`: change before exposing Grafana outside localhost.

## Validate A Target Host

After installing on the target machine:

```sh
/opt/turbalance-analytics/bin/gb100-telemetry-report \
  --out-dir /opt/turbalance-analytics/build/gb100-support
```

For a local checkout:

```sh
make validate-gpu
```

The report records GPU inventory, driver/CUDA/DCGM versions, scrape health, available DCGM fields, unavailable fields, unsupported metrics, and recommended next actions.

## Uninstall

```sh
sudo ./install.sh --prefix /opt/turbalance-analytics --uninstall
```

Remove the install directory too:

```sh
sudo ./install.sh --prefix /opt/turbalance-analytics --uninstall --remove-data
```
