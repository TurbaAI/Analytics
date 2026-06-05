// SPDX-License-Identifier: Apache-2.0
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>

char LICENSE[] SEC("license") = "Apache-2.0";

enum metric_key {
  METRIC_SCHED_SWITCHES = 0,
  METRIC_PROCESSES_FORKED = 1,
  METRIC_TCP_RETRANSMITS = 2,
  METRIC_NET_XMIT_EVENTS = 3,
  METRIC_BLOCK_COMPLETIONS = 4,
  METRIC_COUNT = 5,
};

struct {
  __uint(type, BPF_MAP_TYPE_ARRAY);
  __uint(max_entries, METRIC_COUNT);
  __type(key, __u32);
  __type(value, __u64);
} counters SEC(".maps");

static __always_inline void increment_counter(__u32 key) {
  __u64 *value = bpf_map_lookup_elem(&counters, &key);
  if (value) {
    __sync_fetch_and_add(value, 1);
  }
}

SEC("tracepoint/sched/sched_switch")
int handle_sched_switch(void *ctx) {
  increment_counter(METRIC_SCHED_SWITCHES);
  return 0;
}

SEC("tracepoint/sched/sched_process_fork")
int handle_sched_process_fork(void *ctx) {
  increment_counter(METRIC_PROCESSES_FORKED);
  return 0;
}

SEC("tracepoint/tcp/tcp_retransmit_skb")
int handle_tcp_retransmit_skb(void *ctx) {
  increment_counter(METRIC_TCP_RETRANSMITS);
  return 0;
}

SEC("tracepoint/net/net_dev_xmit")
int handle_net_dev_xmit(void *ctx) {
  increment_counter(METRIC_NET_XMIT_EVENTS);
  return 0;
}

SEC("tracepoint/block/block_rq_complete")
int handle_block_rq_complete(void *ctx) {
  increment_counter(METRIC_BLOCK_COMPLETIONS);
  return 0;
}
