#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { assertValidSourceBundle } = require("../lib/source-bundle-validator.js");

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input || process.env.TURBALANCE_REDFISH_INPUT || "";
const baseUrl = args.url || args["base-url"] || process.env.TURBALANCE_REDFISH_URL || "";
const runId = args["run-id"] || process.env.TURBALANCE_REDFISH_RUN_ID || "";
const hostId = args["host-id"] || process.env.TURBALANCE_REDFISH_HOST_ID || "";
const user = args.user || process.env.TURBALANCE_REDFISH_USER || "";
const password = args.password || process.env.TURBALANCE_REDFISH_PASSWORD || "";
const bearerToken = args["bearer-token"] || args.token || process.env.TURBALANCE_REDFISH_BEARER_TOKEN || "";
const timeoutMs = numeric(args.timeout || args["timeout-ms"] || process.env.TURBALANCE_REDFISH_TIMEOUT_MS) || 15000;
const memberLimit = numeric(args["member-limit"] || process.env.TURBALANCE_REDFISH_MEMBER_LIMIT) || 32;
const insecure = Boolean(args.insecure || process.env.TURBALANCE_REDFISH_INSECURE);
const outputPath = args.out || process.env.TURBALANCE_REDFISH_EXPORT_OUTPUT || "";
const outputDir = args["out-dir"] || process.env.TURBALANCE_REDFISH_EXPORT_OUT_DIR || "";

if (!inputPath && !baseUrl) {
  process.stderr.write("usage: fetch-redfish-source-export.js --url https://bmc.example/redfish/v1 --run-id RUN_ID [--user USER --password PASS | --bearer-token TOKEN] [--insecure] [--out bundle.json] [--out-dir provider-inputs]\n");
  process.exit(1);
}

(async () => {
  const warnings = [];
  const snapshots = inputPath
    ? snapshotsFromInput(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")))
    : [await collectRedfishSnapshot({ baseUrl, bearerToken, user, password, timeoutMs, memberLimit, insecure, warnings })];
  const samples = snapshots.map((snapshot, index) => normalizeRedfishSnapshot(snapshot, {
    runId: snapshot.runId || runId || snapshot.hostId || hostId || `redfish-${index + 1}`,
    hostId: snapshot.hostId || hostId,
    redfishBaseUrl: snapshot.redfishBaseUrl || baseUrl,
    warnings
  })).filter((sample) => sample.runId);
  const bundle = {
    schemaVersion: "turba.source_bundle.v1",
    generatedAt: new Date().toISOString(),
    sources: {
      redfish: samples
    }
  };
  const validation = assertValidSourceBundle(bundle, { requireSourceExport: true });

  if (outputPath) {
    writeJsonFile(outputPath, bundle);
  }
  if (outputDir) {
    writeJsonFile(path.join(outputDir, "redfish.json"), samples);
  }

  if (!outputPath && !outputDir) {
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    redfishBaseUrl: redactUrl(baseUrl),
    inputPath: inputPath ? path.resolve(inputPath) : "",
    outputPath: outputPath ? path.resolve(outputPath) : "",
    outputDir: outputDir ? path.resolve(outputDir) : "",
    sourceCounts: validation.sourceCounts,
    warnings: unique(warnings)
  }, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

async function collectRedfishSnapshot(options) {
  const rootUrl = serviceRootUrl(options.baseUrl);
  const serviceRoot = await requestJson(rootUrl, options);
  const systems = await fetchCollection(serviceRoot.Systems?.["@odata.id"] || "/redfish/v1/Systems", rootUrl, options);
  const chassis = await fetchCollection(serviceRoot.Chassis?.["@odata.id"] || "/redfish/v1/Chassis", rootUrl, options);
  const managers = await fetchCollection(serviceRoot.Managers?.["@odata.id"] || "/redfish/v1/Managers", rootUrl, options);
  const firmwareInventory = await fetchCollection(serviceRoot.UpdateService?.FirmwareInventory?.["@odata.id"] || "/redfish/v1/UpdateService/FirmwareInventory", rootUrl, options);
  const eventService = await requestOptionalJson(serviceRoot.EventService?.["@odata.id"] || "/redfish/v1/EventService", rootUrl, options);
  const telemetryService = await requestOptionalJson(serviceRoot.TelemetryService?.["@odata.id"] || "/redfish/v1/TelemetryService", rootUrl, options);

  return {
    redfishBaseUrl: rootUrl,
    serviceRoot,
    systems: await enrichSystems(systems.members, rootUrl, options),
    chassis: await enrichChassis(chassis.members, rootUrl, options),
    managers: await enrichManagers(managers.members, rootUrl, options),
    firmwareInventory: firmwareInventory.members,
    eventService,
    telemetryService
  };
}

async function enrichSystems(systems, rootUrl, options) {
  const limit = Math.min(options.memberLimit, systems.length);
  const enriched = [];

  for (const system of systems.slice(0, limit)) {
    const logServices = await fetchCollection(system.LogServices?.["@odata.id"], rootUrl, options);
    const logs = [];
    for (const service of logServices.members.slice(0, options.memberLimit)) {
      const entries = await fetchCollection(service.Entries?.["@odata.id"], rootUrl, options);
      logs.push(...entries.members.slice(0, options.memberLimit));
    }
    enriched.push({
      ...system,
      Processors: await fetchCollection(system.Processors?.["@odata.id"], rootUrl, options).then((collection) => collection.members),
      Memory: await fetchCollection(system.Memory?.["@odata.id"], rootUrl, options).then((collection) => collection.members),
      EthernetInterfaces: await fetchCollection(system.EthernetInterfaces?.["@odata.id"], rootUrl, options).then((collection) => collection.members),
      Storage: await fetchCollection(system.Storage?.["@odata.id"], rootUrl, options).then((collection) => collection.members),
      LogEntries: logs
    });
  }

  return enriched;
}

async function enrichChassis(chassis, rootUrl, options) {
  const limit = Math.min(options.memberLimit, chassis.length);
  const enriched = [];

  for (const item of chassis.slice(0, limit)) {
    enriched.push({
      ...item,
      Thermal: await requestOptionalJson(item.Thermal?.["@odata.id"], rootUrl, options),
      Power: await requestOptionalJson(item.Power?.["@odata.id"], rootUrl, options),
      Sensors: await fetchCollection(item.Sensors?.["@odata.id"], rootUrl, options).then((collection) => collection.members)
    });
  }

  return enriched;
}

async function enrichManagers(managers, rootUrl, options) {
  const limit = Math.min(options.memberLimit, managers.length);
  const enriched = [];

  for (const manager of managers.slice(0, limit)) {
    enriched.push({
      ...manager,
      NetworkProtocol: await requestOptionalJson(manager.NetworkProtocol?.["@odata.id"], rootUrl, options)
    });
  }

  return enriched;
}

async function fetchCollection(odataId, rootUrl, options) {
  if (!odataId) return { collection: null, members: [] };
  const collection = await requestOptionalJson(odataId, rootUrl, options);
  if (!collection) return { collection: null, members: [] };
  const memberRefs = Array.isArray(collection.Members) ? collection.Members : [];
  const members = [];

  for (const memberRef of memberRefs.slice(0, options.memberLimit)) {
    const member = await requestOptionalJson(memberRef?.["@odata.id"], rootUrl, options);
    if (member) members.push(member);
  }

  return { collection, members };
}

async function requestOptionalJson(odataId, rootUrl, options) {
  if (!odataId) return null;
  try {
    return await requestJson(resolveRedfishUrl(odataId, rootUrl), options);
  } catch (error) {
    options.warnings.push(`${odataId} skipped: ${error.message}`);
    return null;
  }
}

function requestJson(target, options) {
  const url = new URL(target);
  const client = url.protocol === "https:" ? https : http;
  const headers = compactObject({
    accept: "application/json",
    authorization: authorizationHeader(options)
  });

  return new Promise((resolve, reject) => {
    const request = client.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers,
      timeout: options.timeoutMs,
      rejectUnauthorized: url.protocol === "https:" ? !options.insecure : undefined
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${redactUrl(target)} returned ${response.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body || "{}"));
        } catch (error) {
          reject(new Error(`${redactUrl(target)} did not return valid JSON`));
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`${redactUrl(target)} timed out after ${options.timeoutMs} ms`));
    });
    request.on("error", reject);
    request.end();
  });
}

function normalizeRedfishSnapshot(snapshot, options) {
  if (snapshot.sources?.redfish?.[0]) {
    return compactSample({
      ...snapshot.sources.redfish[0],
      runId: snapshot.sources.redfish[0].runId || options.runId
    });
  }

  const serviceRoot = snapshot.serviceRoot || {};
  const systems = arrayPayload(snapshot.systems).map(toSystemSummary);
  const chassis = arrayPayload(snapshot.chassis).map(toChassisSummary);
  const managers = arrayPayload(snapshot.managers).map(toManagerSummary);
  const firmwareInventory = arrayPayload(snapshot.firmwareInventory).map(toFirmwareSummary);
  const logEntries = arrayPayload(snapshot.systems).flatMap((system) => arrayPayload(system.LogEntries || system.logEntries));
  const unhealthyResources = [
    ...systems.map((system) => ({ type: "system", id: system.id, health: system.health, state: system.state })),
    ...chassis.map((item) => ({ type: "chassis", id: item.id, health: item.health, state: item.state })),
    ...managers.map((manager) => ({ type: "manager", id: manager.id, health: manager.health, state: manager.state })),
    ...firmwareInventory.map((firmware) => ({ type: "firmware", id: firmware.id, health: firmware.health, state: firmware.state }))
  ].filter(isUnhealthy);
  const metrics = compactMetrics({
    redfish_systems_total: systems.length,
    redfish_chassis_total: chassis.length,
    redfish_managers_total: managers.length,
    redfish_unhealthy_resources_total: unhealthyResources.length,
    redfish_power_watts: sumFinite(chassis.map((item) => item.powerWatts)),
    redfish_power_limit_watts: sumFinite(chassis.map((item) => item.powerLimitWatts)),
    redfish_inlet_temp_celsius: maxFinite(chassis.map((item) => item.inletTempCelsius)),
    redfish_exhaust_temp_celsius: maxFinite(chassis.map((item) => item.exhaustTempCelsius)),
    redfish_max_temp_celsius: maxFinite(chassis.map((item) => item.maxTempCelsius)),
    redfish_fan_count: sumFinite(chassis.map((item) => item.fanCount)),
    redfish_critical_log_entries_total: countCriticalLogs(logEntries)
  });
  const healthRollup = healthRollupFor([...systems, ...chassis, ...managers, ...firmwareInventory]);

  return compactSample({
    runId: options.runId,
    hostId: options.hostId || snapshot.hostId,
    sourceSystem: "redfish",
    collectedAt: new Date().toISOString(),
    redfishBaseUrl: options.redfishBaseUrl || snapshot.redfishBaseUrl,
    serviceRoot: compactObject({
      redfishVersion: serviceRoot.RedfishVersion || serviceRoot.redfishVersion,
      uuid: serviceRoot.UUID || serviceRoot.uuid,
      name: serviceRoot.Name || serviceRoot.name,
      vendor: serviceRoot.Vendor || serviceRoot.vendor,
      product: serviceRoot.Product || serviceRoot.product
    }),
    systems,
    chassis,
    managers,
    firmwareInventory,
    eventService: toServiceSummary(snapshot.eventService),
    telemetryService: toServiceSummary(snapshot.telemetryService),
    metrics,
    health: compactObject({
      rollup: healthRollup,
      unhealthyResources,
      warnings: unique(options.warnings || snapshot.warnings || [])
    }),
    sourceContext: compactObject({
      redfishBaseUrl: options.redfishBaseUrl || snapshot.redfishBaseUrl,
      redfishServiceUuid: serviceRoot.UUID || serviceRoot.uuid,
      redfishVersion: serviceRoot.RedfishVersion || serviceRoot.redfishVersion,
      redfishHealthRollup: healthRollup,
      redfishSystemCount: systems.length,
      redfishChassisCount: chassis.length,
      redfishManagerCount: managers.length,
      redfishPowerState: firstString(systems.map((system) => system.powerState)),
      redfishBiosVersion: firstString(systems.map((system) => system.biosVersion)),
      redfishManagerFirmwareVersion: firstString(managers.map((manager) => manager.firmwareVersion)),
      redfishUnhealthyResources: unhealthyResources.length
    })
  });
}

function toSystemSummary(system) {
  const status = system.Status || system.status || {};
  return compactObject({
    id: system.Id || system.id,
    name: system.Name || system.name,
    manufacturer: system.Manufacturer || system.manufacturer,
    model: system.Model || system.model,
    serialNumber: system.SerialNumber || system.serialNumber,
    partNumber: system.PartNumber || system.partNumber,
    sku: system.SKU || system.sku,
    biosVersion: system.BiosVersion || system.BIOSVersion || system.biosVersion,
    powerState: system.PowerState || system.powerState,
    health: status.HealthRollup || status.Health || system.health,
    state: status.State || system.state,
    processorSummary: summarizeNested(system.ProcessorSummary || system.processorSummary),
    memorySummary: summarizeNested(system.MemorySummary || system.memorySummary),
    processorCount: arrayPayload(system.Processors || system.processors).length || undefined,
    memoryDeviceCount: arrayPayload(system.Memory || system.memory).length || undefined,
    networkInterfaceCount: arrayPayload(system.EthernetInterfaces || system.ethernetInterfaces).length || undefined,
    storageControllerCount: arrayPayload(system.Storage || system.storage).length || undefined,
    criticalLogEntries: countCriticalLogs(system.LogEntries || system.logEntries)
  });
}

function toChassisSummary(chassis) {
  const status = chassis.Status || chassis.status || {};
  const thermal = chassis.Thermal || chassis.thermal || {};
  const power = chassis.Power || chassis.power || {};
  const temperatures = arrayPayload(thermal.Temperatures || thermal.temperatures);
  const fans = arrayPayload(thermal.Fans || thermal.fans);
  const sensors = arrayPayload(chassis.Sensors || chassis.sensors).map(toSensorSummary);
  const powerControl = arrayPayload(power.PowerControl || power.powerControl);

  return compactObject({
    id: chassis.Id || chassis.id,
    name: chassis.Name || chassis.name,
    chassisType: chassis.ChassisType || chassis.chassisType,
    manufacturer: chassis.Manufacturer || chassis.manufacturer,
    model: chassis.Model || chassis.model,
    serialNumber: chassis.SerialNumber || chassis.serialNumber,
    partNumber: chassis.PartNumber || chassis.partNumber,
    sku: chassis.SKU || chassis.sku,
    powerState: chassis.PowerState || chassis.powerState,
    health: status.HealthRollup || status.Health || chassis.health,
    state: status.State || chassis.state,
    powerWatts: firstFinite([
      ...powerControl.map((entry) => entry.PowerConsumedWatts || entry.powerConsumedWatts),
      ...powerControl.map((entry) => entry.PowerMetrics?.AverageConsumedWatts || entry.powerMetrics?.averageConsumedWatts)
    ]),
    powerLimitWatts: firstFinite(powerControl.map((entry) => entry.PowerLimit?.LimitInWatts || entry.powerLimitWatts)),
    inletTempCelsius: firstTemperature(temperatures, ["inlet", "intake"]),
    exhaustTempCelsius: firstTemperature(temperatures, ["exhaust", "outlet"]),
    maxTempCelsius: maxFinite(temperatures.map((entry) => entry.ReadingCelsius || entry.readingCelsius)),
    fanCount: fans.length || sensors.filter((sensor) => String(sensor.type || "").toLowerCase().includes("fan")).length || undefined,
    sensors: sensors.length > 0 ? sensors : undefined
  });
}

function toManagerSummary(manager) {
  const status = manager.Status || manager.status || {};
  return compactObject({
    id: manager.Id || manager.id,
    name: manager.Name || manager.name,
    managerType: manager.ManagerType || manager.managerType,
    firmwareVersion: manager.FirmwareVersion || manager.firmwareVersion,
    model: manager.Model || manager.model,
    health: status.HealthRollup || status.Health || manager.health,
    state: status.State || manager.state,
    networkProtocol: summarizeNested(manager.NetworkProtocol || manager.networkProtocol)
  });
}

function toFirmwareSummary(firmware) {
  const status = firmware.Status || firmware.status || {};
  return compactObject({
    id: firmware.Id || firmware.id,
    name: firmware.Name || firmware.name,
    version: firmware.Version || firmware.version,
    softwareId: firmware.SoftwareId || firmware.softwareId,
    updateable: firmware.Updateable ?? firmware.updateable,
    health: status.HealthRollup || status.Health || firmware.health,
    state: status.State || firmware.state
  });
}

function toSensorSummary(sensor) {
  const status = sensor.Status || sensor.status || {};
  return compactObject({
    id: sensor.Id || sensor.id,
    name: sensor.Name || sensor.name,
    type: sensor.ReadingType || sensor.ReadingUnits || sensor.type,
    reading: numeric(sensor.Reading || sensor.reading),
    units: sensor.ReadingUnits || sensor.units,
    physicalContext: sensor.PhysicalContext || sensor.physicalContext,
    health: status.HealthRollup || status.Health || sensor.health,
    state: status.State || sensor.state
  });
}

function toServiceSummary(service) {
  if (!service) return undefined;
  const status = service.Status || service.status || {};
  return compactObject({
    id: service.Id || service.id,
    name: service.Name || service.name,
    serviceEnabled: service.ServiceEnabled ?? service.serviceEnabled,
    health: status.HealthRollup || status.Health || service.health,
    state: status.State || service.state
  });
}

function snapshotsFromInput(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.sources?.redfish)) return payload.sources.redfish.map((sample) => ({ sources: { redfish: [sample] } }));
  if (Array.isArray(payload.sourceExports?.redfish)) return payload.sourceExports.redfish.map((sample) => ({ sources: { redfish: [sample] } }));
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  return [payload];
}

function serviceRootUrl(value) {
  const url = new URL(value);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/redfish/v1";
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function resolveRedfishUrl(odataId, rootUrl) {
  if (!odataId) return "";
  const root = new URL(rootUrl);
  if (/^https?:\/\//i.test(odataId)) return odataId;
  if (odataId.startsWith("/")) return `${root.origin}${odataId}`;
  return new URL(odataId, `${root.toString().replace(/\/+$/, "")}/`).toString();
}

function authorizationHeader(options) {
  if (options.bearerToken) return `Bearer ${options.bearerToken}`;
  if (options.user || options.password) {
    return `Basic ${Buffer.from(`${options.user}:${options.password}`).toString("base64")}`;
  }
  return "";
}

function summarizeNested(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return compactObject(value);
}

function compactSample(sample) {
  return {
    ...compactObject(sample),
    sourceContext: compactObject(sample.sourceContext || {})
  };
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, entry]) => (
      entry !== undefined
      && entry !== null
      && entry !== ""
      && !(typeof entry === "number" && Number.isNaN(entry))
      && !(Array.isArray(entry) && entry.length === 0)
      && !(typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0)
    ))
  );
}

function compactMetrics(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, entry]) => Number.isFinite(entry))
  );
}

function arrayPayload(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.Members)) return value.Members;
  if (Array.isArray(value?.members)) return value.members;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstFinite(values) {
  return values.map(numeric).find(Number.isFinite);
}

function maxFinite(values) {
  const finite = values.map(numeric).filter(Number.isFinite);
  return finite.length ? Math.max(...finite) : undefined;
}

function sumFinite(values) {
  const finite = values.map(numeric).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) : undefined;
}

function firstString(values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || undefined;
}

function firstTemperature(temperatures, labels) {
  const match = temperatures.find((entry) => {
    const haystack = `${entry.Name || ""} ${entry.PhysicalContext || ""}`.toLowerCase();
    return labels.some((label) => haystack.includes(label));
  });
  return numeric(match?.ReadingCelsius || match?.readingCelsius);
}

function countCriticalLogs(entries) {
  return arrayPayload(entries).filter((entry) => {
    const severity = String(entry.Severity || entry.severity || "").toLowerCase();
    return severity.includes("critical") || severity.includes("warning");
  }).length;
}

function healthRollupFor(resources) {
  if (resources.some((resource) => String(resource.health || "").toLowerCase() === "critical")) return "Critical";
  if (resources.some((resource) => String(resource.health || "").toLowerCase() === "warning")) return "Warning";
  if (resources.some((resource) => String(resource.health || "").trim())) return "OK";
  return undefined;
}

function isUnhealthy(resource) {
  const health = String(resource.health || "").toLowerCase();
  const state = String(resource.state || "").toLowerCase();
  return health === "warning"
    || health === "critical"
    || state === "disabled"
    || state === "unavailableoffline"
    || state === "absent";
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return String(value);
  }
}

function writeJsonFile(filePath, value) {
  const fullPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    parsed[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "1";
  }
  return parsed;
}
