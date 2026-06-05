#!/bin/sh
set -eu

context_switches="$(awk '/^ctxt / { print $2 }' /proc/stat 2>/dev/null || printf '0')"
processes_forked="$(awk '/^processes / { print $2 }' /proc/stat 2>/dev/null || printf '0')"
tcp_retransmits="$(awk '
  /^Tcp:/ && !seen_header { for (i = 1; i <= NF; i++) names[i] = $i; seen_header = 1; next }
  /^Tcp:/ && seen_header {
    for (i = 1; i <= NF; i++) if (names[i] == "RetransSegs") { print $i; found = 1 }
  }
  END { if (!found) print 0 }
' /proc/net/snmp 2>/dev/null || printf '0')"
rx_drops="$(awk -F'[: ]+' 'NR > 2 && $2 != "lo" { drops += $6 } END { print drops + 0 }' /proc/net/dev 2>/dev/null || printf '0')"
tx_drops="$(awk -F'[: ]+' 'NR > 2 && $2 != "lo" { drops += $14 } END { print drops + 0 }' /proc/net/dev 2>/dev/null || printf '0')"

printf 'ebpf.sched.context_switches_total=%s\n' "$context_switches"
printf 'ebpf.sched.processes_forked_total=%s\n' "$processes_forked"
printf 'ebpf.net.tcp_retransmits_total=%s\n' "$tcp_retransmits"
printf 'ebpf.net.rx_drops_total=%s\n' "$rx_drops"
printf 'ebpf.net.tx_drops_total=%s\n' "$tx_drops"
