#include <cuda_runtime.h>

#include <chrono>
#include <cstdio>
#include <cstdlib>

__global__ void spin_kernel(float *values, unsigned long long iterations) {
  const unsigned int index = blockIdx.x * blockDim.x + threadIdx.x;
  float value = static_cast<float>((index % 1024) + 1) * 0.001f;

  for (unsigned long long i = 0; i < iterations; ++i) {
    value = fmaf(value, 1.000001f, 0.000001f);
    value = fmaf(value, 0.999999f, 0.000003f);
  }

  values[index] = value;
}

static void check(cudaError_t result, const char *label) {
  if (result != cudaSuccess) {
    std::fprintf(stderr, "%s: %s\n", label, cudaGetErrorString(result));
    std::exit(1);
  }
}

int main(int argc, char **argv) {
  const int seconds = argc > 1 ? std::atoi(argv[1]) : 180;
  const int blocks = argc > 2 ? std::atoi(argv[2]) : 8192;
  const int threads = argc > 3 ? std::atoi(argv[3]) : 256;
  const unsigned long long iterations = argc > 4 ? std::strtoull(argv[4], nullptr, 10) : 20000ULL;
  const int count = blocks * threads;

  float *values = nullptr;
  check(cudaSetDevice(0), "cudaSetDevice");
  check(cudaMalloc(&values, static_cast<size_t>(count) * sizeof(float)), "cudaMalloc");

  const auto started = std::chrono::steady_clock::now();
  int launches = 0;
  while (std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now() - started).count() < seconds) {
    spin_kernel<<<blocks, threads>>>(values, iterations);
    check(cudaGetLastError(), "spin_kernel launch");
    check(cudaDeviceSynchronize(), "cudaDeviceSynchronize");
    ++launches;
    if (launches % 10 == 0) {
      std::printf("spark1 cuda spin launches=%d\n", launches);
      std::fflush(stdout);
    }
  }

  check(cudaFree(values), "cudaFree");
  std::printf("spark1 cuda spin complete launches=%d\n", launches);
  return 0;
}
