#!/bin/sh
set -eu

bool() {
  if "$@" >/dev/null 2>&1; then
    printf '1'
  else
    printf '0'
  fi
}

path_exists() {
  test -e "$1"
}

tracing_exists() {
  test -e /sys/kernel/tracing || test -e /sys/kernel/debug/tracing
}

command_exists() {
  command -v "$1"
}

cap_sys_admin() {
  cap_eff="$(awk '/^CapEff:/ { print $2 }' /proc/self/status 2>/dev/null || printf '0')"
  case "$cap_eff" in
    ''|*[!0-9A-Fa-f]*) printf '0' ;;
    *)
      value=$((16#$cap_eff))
      if [ $((value & 2097152)) -ne 0 ]; then
        printf '1'
      else
        printf '0'
      fi
      ;;
  esac
}

kernel_major="$(uname -r 2>/dev/null | awk -F. '{ print $1 + 0 }' || printf '0')"
kernel_minor="$(uname -r 2>/dev/null | awk -F. '{ print $2 + 0 }' || printf '0')"

printf 'ebpf.kernel.major=%s\n' "$kernel_major"
printf 'ebpf.kernel.minor=%s\n' "$kernel_minor"
printf 'ebpf.kernel.btf_available=%s\n' "$(bool path_exists /sys/kernel/btf/vmlinux)"
printf 'ebpf.bpffs.mounted=%s\n' "$(bool path_exists /sys/fs/bpf)"
printf 'ebpf.tracingfs.mounted=%s\n' "$(bool tracing_exists)"
printf 'ebpf.cgroup_v2.available=%s\n' "$(bool path_exists /sys/fs/cgroup/cgroup.controllers)"
printf 'ebpf.tool.bpftool.available=%s\n' "$(bool command_exists bpftool)"
printf 'ebpf.tool.clang.available=%s\n' "$(bool command_exists clang)"
printf 'ebpf.cap.sys_admin.effective=%s\n' "$(cap_sys_admin)"
