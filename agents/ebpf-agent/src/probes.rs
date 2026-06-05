#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ProbeStatus {
    pub name: &'static str,
    pub available: bool,
    pub reason: String,
}

pub fn probe_statuses() -> Vec<ProbeStatus> {
    platform_probe_statuses()
}

#[cfg(target_os = "linux")]
fn platform_probe_statuses() -> Vec<ProbeStatus> {
    let bpffs_ready = Path::new("/sys/fs/bpf").exists();
    let tracing_ready = Path::new("/sys/kernel/tracing").exists()
        || Path::new("/sys/kernel/debug/tracing").exists();
    let cgroup_v2_ready = Path::new("/sys/fs/cgroup/cgroup.controllers").exists();
    let kernel = fs::read_to_string("/proc/sys/kernel/osrelease")
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|_| "unknown-kernel".to_string());
    vec![
        ProbeStatus {
            name: "sched_switch",
            available: bpffs_ready && tracing_ready,
            reason: if bpffs_ready && tracing_ready {
                format!("kernel {kernel}; bpffs and tracingfs are mounted; aya-rs loader boundary is ready")
            } else {
                format!("kernel {kernel}; requires mounted bpffs and tracingfs before sched_switch eBPF loading")
            },
        },
        ProbeStatus {
            name: "tcp_retransmit",
            available: bpffs_ready && tracing_ready,
            reason: if bpffs_ready && tracing_ready {
                format!("kernel {kernel}; tcp tracepoint prerequisites detected")
            } else {
                format!("kernel {kernel}; /proc network counters are active while tcp eBPF prerequisites are missing")
            },
        },
        ProbeStatus {
            name: "block_io_latency",
            available: bpffs_ready && tracing_ready,
            reason: if bpffs_ready && tracing_ready {
                format!("kernel {kernel}; block tracepoint prerequisites detected")
            } else {
                format!("kernel {kernel}; storage eBPF probe requires bpffs and tracingfs")
            },
        },
        ProbeStatus {
            name: "cgroup_attribution",
            available: cgroup_v2_ready,
            reason: if cgroup_v2_ready {
                "cgroup v2 controllers detected; attribution labels can be wired to eBPF samples"
                    .to_string()
            } else {
                "cgroup v2 controllers not detected; container attribution remains pending"
                    .to_string()
            },
        },
    ]
}

#[cfg(not(target_os = "linux"))]
fn platform_probe_statuses() -> Vec<ProbeStatus> {
    vec![ProbeStatus {
        name: "linux_ebpf",
        available: false,
        reason: "eBPF probes require Linux; agent transport can still emit dev heartbeat telemetry"
            .to_string(),
    }]
}
