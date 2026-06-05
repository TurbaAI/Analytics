use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

mod probes;

#[derive(Debug, Clone)]
struct AgentConfig {
    host_id: String,
    agent_id: String,
    tenant_id: String,
    collector_url: Option<String>,
    collector_token: Option<String>,
    hmac_secret: Option<String>,
    discovery_enroll_url: Option<String>,
    discovery_enrollment_token: Option<String>,
    identity_path: Option<PathBuf>,
    sequence_path: Option<PathBuf>,
    ebpf_probe_command: Option<String>,
    interval_seconds: u64,
    max_iterations: Option<u64>,
    http_timeout_seconds: u64,
}

#[derive(Debug, Clone)]
struct AgentIdentity {
    spiffe_id: String,
    certificate_status: String,
    certificate_not_after: String,
}

fn main() {
    let config = AgentConfig::from_env();
    enroll_with_discovery(&config);
    let mut iteration = 0_u64;
    loop {
        iteration += 1;
        let now = Utc::now().to_rfc3339();
        let sequence_no = next_sequence_no(config.sequence_path.as_ref());
        let identity = load_identity(config.identity_path.as_ref());
        let batch = telemetry_batch(&config, &now, sequence_no, identity.as_ref());
        emit_or_post_batch(&config, &batch);
        if config
            .max_iterations
            .map(|max| iteration >= max)
            .unwrap_or(false)
        {
            break;
        }
        thread::sleep(Duration::from_secs(config.interval_seconds));
    }
}

impl AgentConfig {
    fn from_env() -> Self {
        Self {
            host_id: env::var("TURBALANCE_HOST_ID").unwrap_or_else(|_| hostname()),
            agent_id: env::var("TURBALANCE_AGENT_ID")
                .unwrap_or_else(|_| "ebpf-agent-dev".to_string()),
            tenant_id: env::var("TURBALANCE_TENANT_ID")
                .unwrap_or_else(|_| "demo-tenant".to_string()),
            collector_url: env::var("TURBALANCE_COLLECTOR_URL").ok(),
            collector_token: env::var("TURBALANCE_COLLECTOR_TOKEN").ok(),
            hmac_secret: env::var("TURBALANCE_COLLECTOR_HMAC_SECRET").ok(),
            discovery_enroll_url: env::var("TURBALANCE_DISCOVERY_ENROLL_URL").ok(),
            discovery_enrollment_token: env::var("TURBALANCE_DISCOVERY_ENROLLMENT_TOKEN").ok(),
            identity_path: env::var("TURBALANCE_AGENT_IDENTITY_PATH")
                .ok()
                .filter(|value| !value.is_empty())
                .map(PathBuf::from),
            sequence_path: env::var("TURBALANCE_AGENT_SEQUENCE_PATH")
                .ok()
                .filter(|value| !value.is_empty())
                .map(PathBuf::from),
            ebpf_probe_command: env::var("TURBALANCE_EBPF_PROBE_COMMAND")
                .ok()
                .filter(|value| !value.is_empty()),
            interval_seconds: parse_u64_env("TURBALANCE_AGENT_INTERVAL_SECONDS", 15).max(1),
            max_iterations: parse_max_iterations(),
            http_timeout_seconds: parse_u64_env("TURBALANCE_AGENT_HTTP_TIMEOUT_SECONDS", 10).max(1),
        }
    }
}

fn parse_max_iterations() -> Option<u64> {
    let value = env::var("TURBALANCE_AGENT_MAX_ITERATIONS").unwrap_or_else(|_| "1".to_string());
    let parsed = value.parse::<u64>().unwrap_or(1);
    if parsed == 0 {
        None
    } else {
        Some(parsed)
    }
}

fn parse_u64_env(name: &str, default: u64) -> u64 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(default)
}

fn enroll_with_discovery(config: &AgentConfig) {
    let Some(url) = config.discovery_enroll_url.as_ref() else {
        return;
    };
    let body = discovery_enrollment_body(config);
    match post_json_response(
        url,
        config.discovery_enrollment_token.as_deref(),
        None,
        &config.agent_id,
        &body,
        config.http_timeout_seconds,
    ) {
        Ok(response) => {
            eprintln!("{}", response.lines().next().unwrap_or(""));
            if let Some(path) = config.identity_path.as_ref() {
                if let Some(body) = response.split_once("\r\n\r\n").map(|(_, body)| body) {
                    if let Some(parent) = path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Err(error) = fs::write(path, body) {
                        eprintln!("identity write failed: {}", error);
                    }
                }
            }
        }
        Err(error) => eprintln!("discovery enrollment failed: {}", error),
    }
}

fn discovery_enrollment_body(config: &AgentConfig) -> String {
    format!(
        "{{\"hostId\":\"{}\",\"hostname\":\"{}\",\"agentId\":\"{}\",\"capabilities\":{{\"heartbeat\":true,\"ebpf\":{},\"procfs\":true,\"daemon\":true}},\"labels\":{{\"agent_runtime\":\"rust\",\"transport\":\"http-json\"}}}}",
        escape(&config.host_id),
        escape(&hostname()),
        escape(&config.agent_id),
        if cfg!(target_os = "linux") { "true" } else { "false" }
    )
}

fn emit_or_post_batch(config: &AgentConfig, batch: &str) {
    if let Some(url) = config.collector_url.as_ref() {
        match post_json(
            url,
            config.collector_token.as_deref(),
            config.hmac_secret.as_deref(),
            &config.agent_id,
            batch,
            config.http_timeout_seconds,
        ) {
            Ok(response) => eprintln!("{}", response),
            Err(error) => {
                eprintln!("collector post failed: {}", error);
                println!("{}", batch);
            }
        }
    } else {
        println!("{}", batch);
    }
}

fn telemetry_batch(
    config: &AgentConfig,
    now: &str,
    sequence_no: u64,
    identity: Option<&AgentIdentity>,
) -> String {
    let mut metrics = vec![
        metric("agent.uptime_seconds", uptime_seconds(), "seconds", "gauge"),
        metric(
            "agent.loop.interval_seconds",
            config.interval_seconds as f64,
            "seconds",
            "gauge",
        ),
        metric("host.load_average_1m", load_average_1m(), "", "gauge"),
        metric("host.cpu.count", cpu_count(), "cores", "gauge"),
    ];
    if let Some(memory_used_pct) = memory_used_pct() {
        metrics.push(metric(
            "host.memory_used_pct",
            memory_used_pct,
            "percent",
            "percent",
        ));
    }
    if let Some(memory_available_bytes) = memory_available_bytes() {
        metrics.push(metric(
            "host.memory_available_bytes",
            memory_available_bytes,
            "bytes",
            "gauge",
        ));
    }
    if let Some((rx_bytes, tx_bytes)) = network_bytes() {
        metrics.push(metric(
            "host.network_rx_bytes_total",
            rx_bytes,
            "bytes",
            "counter",
        ));
        metrics.push(metric(
            "host.network_tx_bytes_total",
            tx_bytes,
            "bytes",
            "counter",
        ));
    }
    if let Some((read_bytes, written_bytes)) = disk_bytes() {
        metrics.push(metric(
            "host.disk_read_bytes_total",
            read_bytes,
            "bytes",
            "counter",
        ));
        metrics.push(metric(
            "host.disk_written_bytes_total",
            written_bytes,
            "bytes",
            "counter",
        ));
    }
    if let Some(identity) = identity {
        metrics.push(metric_with_labels(
            "agent.identity.present",
            1.0,
            "",
            "gauge",
            &[
                ("spiffe_id", identity.spiffe_id.as_str()),
                ("certificate_status", identity.certificate_status.as_str()),
                (
                    "certificate_not_after",
                    identity.certificate_not_after.as_str(),
                ),
            ],
        ));
    } else {
        metrics.push(metric("agent.identity.present", 0.0, "", "gauge"));
    }
    for probe in probes::probe_statuses() {
        let labels = &[
            ("probe", probe.name),
            (
                "status",
                if probe.available {
                    "available"
                } else {
                    "pending"
                },
            ),
            ("reason", probe.reason.as_str()),
        ];
        metrics.push(metric_with_labels(
            &format!("agent.probe.{}.available", probe.name),
            if probe.available { 1.0 } else { 0.0 },
            "",
            "gauge",
            labels,
        ));
        metrics.push(metric_with_labels(
            &format!("agent.probe.{}.pending", probe.name),
            if probe.available { 0.0 } else { 1.0 },
            "",
            "gauge",
            labels,
        ));
    }
    if let Some(command) = config.ebpf_probe_command.as_ref() {
        metrics.extend(external_probe_metrics(command));
    }
    format!(
        "{{\"schemaVersion\":\"turba.telemetry_batch.v1\",\"tenantId\":\"{}\",\"hostId\":\"{}\",\"agentId\":\"{}\",\"sequenceNo\":{},\"eventTs\":\"{}\",\"samples\":[{{\"sensorType\":\"host_heartbeat\",\"source\":\"ebpf-agent\",\"eventTs\":\"{}\",\"metrics\":[{}]}}]}}",
        escape(&config.tenant_id),
        escape(&config.host_id),
        escape(&config.agent_id),
        sequence_no,
        now,
        now,
        metrics.join(",")
    )
}

fn external_probe_metrics(command: &str) -> Vec<String> {
    match Command::new("/bin/sh").arg("-lc").arg(command).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut metrics = Vec::new();
            for line in stdout.lines() {
                let Some((name, value)) = line.split_once('=') else {
                    continue;
                };
                let Ok(value) = value.trim().parse::<f64>() else {
                    continue;
                };
                metrics.push(metric_with_labels(
                    name.trim(),
                    value,
                    "",
                    "gauge",
                    &[("source", "external-ebpf")],
                ));
            }
            metrics.push(metric_with_labels(
                "agent.external_ebpf_probe.success",
                1.0,
                "",
                "gauge",
                &[("source", "external-ebpf")],
            ));
            metrics
        }
        Ok(output) => {
            let reason = std::str::from_utf8(&output.stderr)
                .unwrap_or("external eBPF probe command failed")
                .trim()
                .to_string();
            vec![metric_with_labels(
                "agent.external_ebpf_probe.success",
                0.0,
                "",
                "gauge",
                &[("reason", reason.as_str())],
            )]
        }
        Err(error) => {
            let reason = error.to_string();
            vec![metric_with_labels(
                "agent.external_ebpf_probe.success",
                0.0,
                "",
                "gauge",
                &[("reason", reason.as_str())],
            )]
        }
    }
}

fn next_sequence_no(path: Option<&PathBuf>) -> u64 {
    let Some(path) = path else {
        return Utc::now().timestamp_millis().max(0) as u64;
    };
    let current = fs::read_to_string(path)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(0);
    let next = current.saturating_add(1);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Err(error) = fs::write(path, next.to_string()) {
        eprintln!("sequence write failed: {}", error);
    }
    next
}

fn load_identity(path: Option<&PathBuf>) -> Option<AgentIdentity> {
    let body = fs::read_to_string(path?).ok()?;
    Some(AgentIdentity {
        spiffe_id: json_string_field(&body, "spiffeId").unwrap_or_default(),
        certificate_status: json_string_field(&body, "certificateStatus").unwrap_or_default(),
        certificate_not_after: json_string_field(&body, "certificateNotAfter").unwrap_or_default(),
    })
}

fn json_string_field(body: &str, field: &str) -> Option<String> {
    let needle = format!("\"{}\"", field);
    let start = body.find(&needle)?;
    let after_key = &body[start + needle.len()..];
    let after_colon = after_key.split_once(':')?.1.trim_start();
    let after_quote = after_colon.strip_prefix('"')?;
    let mut value = String::new();
    let mut escaped = false;
    for char in after_quote.chars() {
        if escaped {
            value.push(char);
            escaped = false;
            continue;
        }
        if char == '\\' {
            escaped = true;
            continue;
        }
        if char == '"' {
            return Some(value);
        }
        value.push(char);
    }
    None
}

fn metric(name: &str, value: f64, unit: &str, kind: &str) -> String {
    metric_with_labels(name, value, unit, kind, &[])
}

fn metric_with_labels(
    name: &str,
    value: f64,
    unit: &str,
    kind: &str,
    labels: &[(&str, &str)],
) -> String {
    let labels_json = if labels.is_empty() {
        "{}".to_string()
    } else {
        format!(
            "{{{}}}",
            labels
                .iter()
                .map(|(key, value)| format!("\"{}\":\"{}\"", escape(key), escape(value)))
                .collect::<Vec<String>>()
                .join(",")
        )
    };
    format!(
        "{{\"name\":\"{}\",\"value\":{},\"unit\":\"{}\",\"kind\":\"{}\",\"labels\":{}}}",
        escape(name),
        value,
        escape(unit),
        escape(kind),
        labels_json
    )
}

fn hostname() -> String {
    fs::read_to_string("/proc/sys/kernel/hostname")
        .or_else(|_| fs::read_to_string("/etc/hostname"))
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|_| "local-host".to_string())
}

fn uptime_seconds() -> f64 {
    fs::read_to_string("/proc/uptime")
        .ok()
        .and_then(|body| {
            body.split_whitespace()
                .next()
                .and_then(|value| value.parse::<f64>().ok())
        })
        .unwrap_or(0.0)
}

fn load_average_1m() -> f64 {
    fs::read_to_string("/proc/loadavg")
        .ok()
        .and_then(|body| {
            body.split_whitespace()
                .next()
                .and_then(|value| value.parse::<f64>().ok())
        })
        .unwrap_or(0.0)
}

fn cpu_count() -> f64 {
    fs::read_to_string("/proc/stat")
        .ok()
        .map(|body| {
            body.lines()
                .filter(|line| line.starts_with("cpu") && line[3..].starts_with(char::is_numeric))
                .count() as f64
        })
        .filter(|value| *value > 0.0)
        .unwrap_or(1.0)
}

fn memory_used_pct() -> Option<f64> {
    let body = fs::read_to_string("/proc/meminfo").ok()?;
    let total = meminfo_kib(&body, "MemTotal:")?;
    let available = meminfo_kib(&body, "MemAvailable:")?;
    if total <= 0.0 {
        return None;
    }
    Some(((total - available) / total) * 100.0)
}

fn memory_available_bytes() -> Option<f64> {
    let body = fs::read_to_string("/proc/meminfo").ok()?;
    Some(meminfo_kib(&body, "MemAvailable:")? * 1024.0)
}

fn meminfo_kib(body: &str, key: &str) -> Option<f64> {
    body.lines()
        .find(|line| line.starts_with(key))
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<f64>().ok())
}

fn network_bytes() -> Option<(f64, f64)> {
    let body = fs::read_to_string("/proc/net/dev").ok()?;
    let mut rx = 0.0;
    let mut tx = 0.0;
    for line in body.lines().skip(2) {
        let mut parts = line.split(':');
        let interface = parts.next()?.trim();
        if interface == "lo" {
            continue;
        }
        let fields: Vec<&str> = parts.next()?.split_whitespace().collect();
        if fields.len() >= 16 {
            rx += fields[0].parse::<f64>().unwrap_or(0.0);
            tx += fields[8].parse::<f64>().unwrap_or(0.0);
        }
    }
    Some((rx, tx))
}

fn disk_bytes() -> Option<(f64, f64)> {
    let body = fs::read_to_string("/proc/diskstats").ok()?;
    let mut read_sectors = 0.0;
    let mut written_sectors = 0.0;
    for line in body.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 10 {
            continue;
        }
        let device = fields[2];
        if device.starts_with("loop") || device.starts_with("ram") {
            continue;
        }
        read_sectors += fields[5].parse::<f64>().unwrap_or(0.0);
        written_sectors += fields[9].parse::<f64>().unwrap_or(0.0);
    }
    Some((read_sectors * 512.0, written_sectors * 512.0))
}

fn post_json(
    url: &str,
    token: Option<&str>,
    hmac_secret: Option<&str>,
    agent_id: &str,
    body: &str,
    timeout_seconds: u64,
) -> Result<String, String> {
    let response = post_json_response(url, token, hmac_secret, agent_id, body, timeout_seconds)?;
    Ok(response.lines().next().unwrap_or("").to_string())
}

fn post_json_response(
    url: &str,
    token: Option<&str>,
    hmac_secret: Option<&str>,
    agent_id: &str,
    body: &str,
    timeout_seconds: u64,
) -> Result<String, String> {
    let (host, port, path) = parse_http_url(url)?;
    let mut stream =
        TcpStream::connect((host.as_str(), port)).map_err(|error| error.to_string())?;
    let timeout = Some(Duration::from_secs(timeout_seconds));
    stream
        .set_read_timeout(timeout)
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(timeout)
        .map_err(|error| error.to_string())?;
    let auth = token
        .map(|value| format!("Authorization: Bearer {}\r\n", header_value(value)))
        .unwrap_or_default();
    let signature_headers = hmac_secret
        .map(|secret| signed_headers(secret, agent_id, body.as_bytes()))
        .unwrap_or_default();
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\n{}{}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path,
        header_value(&host),
        auth,
        signature_headers,
        body.as_bytes().len(),
        body
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    Ok(response)
}

fn signed_headers(secret: &str, agent_id: &str, body: &[u8]) -> String {
    let timestamp = Utc::now().timestamp().max(0).to_string();
    let nonce = format!(
        "{}-{}",
        agent_id,
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let signature = hmac_signature(secret, &timestamp, &nonce, body);
    format!(
        "X-Turbalance-Agent-Id: {}\r\nX-Turbalance-Timestamp: {}\r\nX-Turbalance-Nonce: {}\r\nX-Turbalance-Signature: v1={}\r\n",
        header_value(agent_id),
        timestamp,
        header_value(&nonce),
        signature
    )
}

fn hmac_signature(secret: &str, timestamp: &str, nonce: &str, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts arbitrary key length");
    mac.update(timestamp.as_bytes());
    mac.update(b".");
    mac.update(nonce.as_bytes());
    mac.update(b".");
    mac.update(body);
    hex_lower(&mac.finalize().into_bytes())
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>()
}

fn parse_http_url(url: &str) -> Result<(String, u16, String), String> {
    let rest = url.strip_prefix("http://").ok_or_else(|| {
        "only http:// collector URLs are supported by the dependency-light agent scaffold"
            .to_string()
    })?;
    let (authority, path) = rest
        .split_once('/')
        .map(|(left, right)| (left, format!("/{}", right)))
        .unwrap_or((rest, "/".to_string()));
    let (host, port) = authority
        .split_once(':')
        .map(|(left, right)| (left.to_string(), right.parse::<u16>().unwrap_or(80)))
        .unwrap_or((authority.to_string(), 80));
    Ok((host, port, path))
}

fn escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn header_value(value: &str) -> String {
    value
        .chars()
        .filter(|char| *char != '\r' && *char != '\n')
        .collect()
}
