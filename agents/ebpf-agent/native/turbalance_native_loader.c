// SPDX-License-Identifier: Apache-2.0
#include <bpf/bpf.h>
#include <bpf/libbpf.h>
#include <errno.h>
#include <getopt.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

enum metric_key {
  METRIC_SCHED_SWITCHES = 0,
  METRIC_PROCESSES_FORKED = 1,
  METRIC_TCP_RETRANSMITS = 2,
  METRIC_NET_XMIT_EVENTS = 3,
  METRIC_BLOCK_COMPLETIONS = 4,
  METRIC_COUNT = 5,
};

static volatile sig_atomic_t keep_running = 1;

static const char *metric_names[] = {
  "ebpf.sched.context_switches_total",
  "ebpf.sched.processes_forked_total",
  "ebpf.net.tcp_retransmits_total",
  "ebpf.net.xmit_events_total",
  "ebpf.block.request_completions_total",
};

static void on_signal(int signum) {
  (void)signum;
  keep_running = 0;
}

static void usage(const char *program) {
  fprintf(stderr,
          "Usage: %s [--object <file>] [--interval <seconds>] [--once]\\n"
          "\\n"
          "Loads turbalance_native.bpf.o, attaches tracepoints, and prints metric.name=value lines.\\n",
          program);
}

static int print_metrics(int map_fd) {
  for (__u32 key = 0; key < METRIC_COUNT; key++) {
    __u64 value = 0;
    int err = bpf_map_lookup_elem(map_fd, &key, &value);
    if (err != 0) {
      fprintf(stderr, "failed to read counter %u: %s\\n", key, strerror(errno));
      return 1;
    }
    printf("%s=%llu\\n", metric_names[key], (unsigned long long)value);
  }
  fflush(stdout);
  return 0;
}

int main(int argc, char **argv) {
  const char *object_path = getenv("TURBALANCE_EBPF_OBJECT");
  int interval_seconds = 15;
  bool once = false;

  if (!object_path || object_path[0] == '\\0') {
    object_path = "/opt/turbalance/native/turbalance_native.bpf.o";
  }

  static const struct option options[] = {
    {"object", required_argument, NULL, 'o'},
    {"interval", required_argument, NULL, 'i'},
    {"once", no_argument, NULL, '1'},
    {"help", no_argument, NULL, 'h'},
    {NULL, 0, NULL, 0},
  };

  int option = 0;
  while ((option = getopt_long(argc, argv, "o:i:1h", options, NULL)) != -1) {
    switch (option) {
      case 'o':
        object_path = optarg;
        break;
      case 'i':
        interval_seconds = atoi(optarg);
        if (interval_seconds < 1) interval_seconds = 1;
        break;
      case '1':
        once = true;
        break;
      case 'h':
        usage(argv[0]);
        return 0;
      default:
        usage(argv[0]);
        return 2;
    }
  }

  signal(SIGINT, on_signal);
  signal(SIGTERM, on_signal);
  libbpf_set_strict_mode(LIBBPF_STRICT_ALL);

  struct bpf_object *object = bpf_object__open_file(object_path, NULL);
  if (!object) {
    fprintf(stderr, "failed to open %s\\n", object_path);
    return 1;
  }

  int err = bpf_object__load(object);
  if (err != 0) {
    fprintf(stderr, "failed to load %s: %s\\n", object_path, strerror(-err));
    bpf_object__close(object);
    return 1;
  }

  struct bpf_program *program = NULL;
  bpf_object__for_each_program(program, object) {
    struct bpf_link *link = bpf_program__attach(program);
    if (!link) {
      fprintf(stderr, "failed to attach %s\\n", bpf_program__name(program));
      bpf_object__close(object);
      return 1;
    }
  }

  struct bpf_map *map = bpf_object__find_map_by_name(object, "counters");
  if (!map) {
    fprintf(stderr, "failed to find counters map\\n");
    bpf_object__close(object);
    return 1;
  }
  int map_fd = bpf_map__fd(map);

  if (once) {
    struct timespec wait_time = { .tv_sec = 1, .tv_nsec = 0 };
    nanosleep(&wait_time, NULL);
    int status = print_metrics(map_fd);
    bpf_object__close(object);
    return status;
  }

  while (keep_running) {
    if (print_metrics(map_fd) != 0) {
      bpf_object__close(object);
      return 1;
    }
    sleep((unsigned int)interval_seconds);
  }

  bpf_object__close(object);
  return 0;
}
