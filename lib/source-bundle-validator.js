"use strict";

const KNOWN_SOURCE_KEYS = [
  "prometheus",
  "dcgm",
  "kubernetes",
  "scheduler",
  "grafana",
  "ebpf",
  "provider",
  "opportunities"
];

const TRACE_KEYS = ["ncclTraces", "traces", "nccl"];
const ROOT_ARRAY_KEYS = ["scheduler", "grafana", "opportunities", ...TRACE_KEYS];

function validateSourceBundle(payload, options = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return result(["payload must be a JSON object"], warnings, {});
  }

  const sourceRoot = sourceExportsRoot(payload);
  const sources = extractSourceArrays(sourceRoot);
  const traces = extractTraceArrays(payload, sourceRoot);
  const sourceCounts = Object.fromEntries(
    [...KNOWN_SOURCE_KEYS, "ncclTraces"].map((key) => [key, key === "ncclTraces" ? traces.length : sources[key].length])
  );

  validateKnownArrays(payload, errors);
  validateIngestion(payload.ingestion || (payload.schemaVersion === "turba.ingestion.v1" ? payload : null), errors);
  validateBareRuns(payload, errors);

  KNOWN_SOURCE_KEYS.forEach((key) => {
    validateRunIdSamples(sources[key], sourcePath(payload, key), errors);
  });
  validateRunIdSamples(traces, tracePath(payload, sourceRoot), errors);

  if (!hasRecognizedPayload(payload, sources, traces)) {
    errors.push("payload must include ingestion, runs, source exports, or NCCL traces");
  }

  if (options.requireSourceExport && !hasAnySource(sources, traces)) {
    errors.push("payload must include at least one source export or NCCL trace");
  }

  if (Object.values(sourceCounts).every((count) => count === 0) && !payload.ingestion && !payload.runs && payload.schemaVersion !== "turba.ingestion.v1") {
    warnings.push("no source samples were found");
  }

  return result(errors, warnings, {
    sourceCounts,
    runIds: Array.from(runIdsFor(sources, traces)).sort()
  });
}

function assertValidSourceBundle(payload, options = {}) {
  const validation = validateSourceBundle(payload, options);
  if (!validation.ok) {
    const error = new Error(validation.errors.join("; "));
    error.validation = validation;
    throw error;
  }
  return validation;
}

function sourceExportsRoot(payload) {
  return payload.sources || payload.sourceExports || payload || {};
}

function extractSourceArrays(sourceRoot) {
  return Object.fromEntries(
    KNOWN_SOURCE_KEYS.map((key) => [key, Array.isArray(sourceRoot?.[key]) ? sourceRoot[key] : []])
  );
}

function extractTraceArrays(payload, sourceRoot) {
  for (const key of TRACE_KEYS) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  for (const key of TRACE_KEYS) {
    if (Array.isArray(sourceRoot?.[key])) return sourceRoot[key];
  }

  return [];
}

function validateKnownArrays(payload, errors) {
  [
    { label: "sources", value: payload.sources },
    { label: "sourceExports", value: payload.sourceExports },
    { label: "root", value: payload }
  ].filter((root) => isPlainObject(root.value)).forEach((root) => {
    [...KNOWN_SOURCE_KEYS, ...ROOT_ARRAY_KEYS].forEach((key) => {
      if (key in root.value && !Array.isArray(root.value[key])) {
        errors.push(`${root.label === "root" ? key : `${root.label}.${key}`} must be an array`);
      }
    });
  });
}

function validateIngestion(ingestion, errors) {
  if (!ingestion) return;
  if (!isPlainObject(ingestion)) {
    errors.push("ingestion must be an object");
    return;
  }
  if (ingestion.schemaVersion !== "turba.ingestion.v1") {
    errors.push("ingestion.schemaVersion must be turba.ingestion.v1");
  }
  if (!Array.isArray(ingestion.runs)) {
    errors.push("ingestion.runs must be an array");
    return;
  }
  if (ingestion.runs.length === 0) {
    errors.push("ingestion.runs must contain at least one run");
  }
  ingestion.runs.forEach((run, index) => {
    if (!isPlainObject(run)) {
      errors.push(`ingestion.runs[${index + 1}] must be an object`);
    } else if (!stringValue(run.id)) {
      errors.push(`ingestion.runs[${index + 1}] is missing id`);
    }
  });
}

function validateBareRuns(payload, errors) {
  if (!("runs" in payload) || payload.schemaVersion === "turba.ingestion.v1") return;
  if (!Array.isArray(payload.runs)) {
    errors.push("runs must be an array");
    return;
  }
  payload.runs.forEach((run, index) => {
    if (!isPlainObject(run)) {
      errors.push(`runs[${index + 1}] must be an object`);
    } else if (!stringValue(run.id)) {
      errors.push(`runs[${index + 1}] is missing id`);
    }
  });
}

function validateRunIdSamples(samples, path, errors) {
  if (!Array.isArray(samples)) return;
  samples.forEach((sample, index) => {
    if (!isPlainObject(sample)) {
      errors.push(`${path}[${index + 1}] must be an object`);
    } else if (!stringValue(sample.runId)) {
      errors.push(`${path}[${index + 1}] is missing runId`);
    }
  });
}

function hasRecognizedPayload(payload, sources, traces) {
  return payload.schemaVersion === "turba.ingestion.v1"
    || isPlainObject(payload.ingestion)
    || Array.isArray(payload.runs)
    || hasAnySource(sources, traces)
    || ROOT_ARRAY_KEYS.some((key) => Array.isArray(payload[key]));
}

function hasAnySource(sources, traces) {
  return Object.values(sources).some((samples) => samples.length > 0) || traces.length > 0;
}

function runIdsFor(sources, traces) {
  const ids = new Set();
  [...Object.values(sources), traces].flat().forEach((sample) => {
    const runId = stringValue(sample?.runId);
    if (runId) ids.add(runId);
  });
  return ids;
}

function sourcePath(payload, key) {
  if (isPlainObject(payload.sources) && key in payload.sources) return `sources.${key}`;
  if (isPlainObject(payload.sourceExports) && key in payload.sourceExports) return `sourceExports.${key}`;
  return key;
}

function tracePath(payload, sourceRoot) {
  for (const key of TRACE_KEYS) {
    if (Array.isArray(payload?.[key])) return key;
  }
  for (const key of TRACE_KEYS) {
    if (Array.isArray(sourceRoot?.[key])) return `sources.${key}`;
  }
  return "ncclTraces";
}

function result(errors, warnings, meta) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ...meta
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value) {
  return String(value || "").trim();
}

module.exports = {
  KNOWN_SOURCE_KEYS,
  TRACE_KEYS,
  assertValidSourceBundle,
  validateSourceBundle
};
