BUILD_DIR ?= build
BPF_CLANG ?= clang
CC ?= cc
BPFTOOL ?= bpftool
VMLINUX_BTF ?= /sys/kernel/btf/vmlinux

BPF_CFLAGS := -g -O2 -target bpf -D__TARGET_ARCH_$(shell uname -m | sed 's/x86_64/x86/' | sed 's/aarch64/arm64/')
LOADER_CFLAGS := -Wall -Wextra -O2
LOADER_LDLIBS := $(shell pkg-config --libs libbpf 2>/dev/null || printf -- '-lbpf')

.PHONY: all clean vmlinux

all: $(BUILD_DIR)/turbalance_native.bpf.o $(BUILD_DIR)/turbalance-native-loader

vmlinux: $(BUILD_DIR)/vmlinux.h

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/vmlinux.h: | $(BUILD_DIR)
	$(BPFTOOL) btf dump file $(VMLINUX_BTF) format c > $@

$(BUILD_DIR)/turbalance_native.bpf.o: turbalance_native.bpf.c $(BUILD_DIR)/vmlinux.h
	$(BPF_CLANG) $(BPF_CFLAGS) -I$(BUILD_DIR) -c $< -o $@

$(BUILD_DIR)/turbalance-native-loader: turbalance_native_loader.c | $(BUILD_DIR)
	$(CC) $(LOADER_CFLAGS) $< -o $@ $(LOADER_LDLIBS)

clean:
	rm -rf $(BUILD_DIR)
