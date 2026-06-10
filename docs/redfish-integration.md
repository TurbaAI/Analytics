# Redfish Bridge

Redfish support adds a management-plane hardware source lane to turbalance. It is designed to complement host telemetry, DCGM/NVML GPU telemetry, Kubernetes, scheduler evidence, Grafana handoff links, and provider billing/SLO overlays.

Use Redfish when a BMC can expose inventory, health rollups, power, thermals, firmware, event-service state, or telemetry-service state without logging into the operating system.

## Source Lane

Redfish exports use `sources.redfish` in `turba-source-bundle.v1`:

```json
{
  "sources": {
    "redfish": [
      {
        "runId": "run-7421",
        "hostId": "h100-a1-01",
        "sourceSystem": "redfish",
        "redfishBaseUrl": "https://bmc-h100-a1-01.example/redfish/v1",
        "systems": [],
        "chassis": [],
        "managers": [],
        "firmwareInventory": [],
        "metrics": {
          "redfish_unhealthy_resources_total": 2,
          "redfish_power_watts": 4850,
          "redfish_inlet_temp_celsius": 31
        },
        "health": {
          "rollup": "Warning"
        }
      }
    ]
  }
}
```

The dashboard importer preserves Redfish context in `sourceContext` and only maps it into normalized reliability pressure when Redfish reports warning/critical health, unhealthy resources, concerning thermal/power readings, or critical/warning log entries.

## Direct BMC Collection

Collect from a BMC:

```sh
node scripts/fetch-redfish-source-export.js \
  --url https://bmc-h100-a1-01.example/redfish/v1 \
  --run-id run-7421 \
  --host-id h100-a1-01 \
  --user readonly-redfish \
  --password "$REDFISH_PASSWORD" \
  --out build/redfish-source-bundle.json
```

For private lab BMC certificates, use `--insecure` during bring-up only:

```sh
node scripts/fetch-redfish-source-export.js \
  --url https://192.0.2.10/redfish/v1 \
  --run-id run-7421 \
  --insecure
```

For CI, demos, or source-owner handoff reviews, normalize a saved snapshot:

```sh
node scripts/fetch-redfish-source-export.js \
  --input fixtures/redfish-source-snapshot.json \
  --out build/redfish-source-bundle.json
```

## Provider Pilot Workflow

To write `redfish.json` into an all-lanes provider pilot input directory:

```sh
node scripts/fetch-redfish-source-export.js \
  --url https://bmc-h100-a1-01.example/redfish/v1 \
  --run-id provider-run-9001 \
  --out-dir fixtures/provider-pilot-export-inputs
```

If the customer exposes a read-only source gateway, use the generic collector:

```sh
node scripts/fetch-source-system-export.js \
  --system redfish \
  --url https://source-gateway.example/redfish/snapshots \
  --bearer-token "$SOURCE_GATEWAY_TOKEN" \
  --out-dir fixtures/provider-pilot-export-inputs
```

Then build and validate the source bundle:

```sh
node scripts/build-provider-pilot-bundle.js fixtures/provider-pilot-export-inputs > provider-pilot-bundle.json
node scripts/validate-source-bundle.js --require-source-export provider-pilot-bundle.json
```

## Security Notes

- Use read-only BMC accounts with the narrowest Redfish privileges available.
- Prefer a customer-owned source gateway over direct browser or laptop access to BMC networks.
- Keep BMC credentials out of bundles; the exporter redacts auth material and only stores source URLs/IDs needed for provenance.
- Redacted workspace exports replace Redfish base URLs, service UUIDs, firmware versions, component labels, and warnings with deterministic placeholders.
- Treat Redfish as management-plane evidence. Continue using DCGM/NVML for GPU counters, eBPF/OpenTelemetry for host/kernel telemetry, and scheduler/Grafana/provider lanes for workload context.

## Validation

Redfish support is covered by:

- `tests/redfish-source-exporter.test.js`
- `tests/source-system-collectors.test.js`
- `tests/provider-pilot-bundler.test.js`
- `tests/source-bundle-validation.test.js`
- `tests/source-bundle-validator.test.js`
- `tests/schemas.test.js`
