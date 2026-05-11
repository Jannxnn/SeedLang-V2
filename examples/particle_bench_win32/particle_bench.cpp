/*
 * Native Win32 particle bench — same physics/render pattern as examples/clc/win32_stress_sustained.seed
 * (640×480, BGSTEP sparse bg, O(n²) swap-on-overlap collisions, filled circles, diag checksum).
 *
 * Build（与 Seed CLC 同款 MinGW 链接，推荐）仓库根执行：
 *   npm run compile:particle-bench-win32
 * 输出：build/particle_bench_cpp.exe（及 Rust → build/particle_bench_rust.exe）
 *
 * 手动示例（MSYS2 MinGW64）：
 *   g++ -O3 -std=c++17 examples/particle_bench_win32/particle_bench.cpp tools/clc/sl_win32_rt.c ^
 *       -Itools/clc -mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm -o build/particle_bench_cpp.exe
 *
 * Title bar shows N / smoothed FPS / collisions / frame for side-by-side recording vs Seed exe.
 *
 * 与 `win32_stress_sustained.seed` 演示默认对齐：**N 从 0 线性爬到 8000**（800 帧），再在 **8000 驻留 400** 帧；源码帧上限 **1200**（`PARTICLE_BENCH_MAX_FRAMES` 可缩短并与上限取较小值）。档位轮换：`PARTICLE_BENCH_TIER_MODE=1`。全程固定 N：`PARTICLE_BENCH_FIXED_N`。
 * Park–Miller 随机初始化（默认种子 88675123），`PARTICLE_BENCH_RNG_SEED` 覆盖；跑满帧数后 **保持窗口**（标题栏数值保留）直到用户关闭，并打印 frame / collisions / diag（与 Seed 一致）。
 */

#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <vector>
#include <cmath>
#include <cstdlib>

extern "C" {
#include "sl_win32_public.h"
}

namespace {

constexpr int W = 640;
constexpr int H = 480;
constexpr int BGSTEP = 2;
constexpr int MAX_PARTICLES = 20000;
constexpr int PARTICLE_CYCLE_FRAMES = 600;
constexpr int TIER_SLOTS = 21;
/** Matches Seed `MAXF`: default auto-stop cap when env PARTICLE_BENCH_MAX_FRAMES unset or 0. */
constexpr long long kSourceMaxFrames = 1200;
constexpr long long kDemoRampTarget = 8000;
constexpr long long kDemoRampFrames = 800;
constexpr long long kBenchRngMod = 2147483647LL;

static long long g_bench_rng_state = 1;

inline void bench_rng_reset_from_env() {
  char buf[96];
  DWORD n = GetEnvironmentVariableA("PARTICLE_BENCH_RNG_SEED", buf, sizeof(buf));
  long long s = -1;
  if (n > 0 && n < sizeof(buf)) {
    buf[n] = '\0';
    char *p = buf;
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n')
      ++p;
    if (*p != '\0') {
      char *end = nullptr;
      long long v = std::strtoll(p, &end, 10);
      if (end != p) {
        while (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')
          ++end;
        if (*end == '\0')
          s = v;
      }
    }
  }
  if (s < 0)
    g_bench_rng_state = 88675123;
  else if (s == 0)
    g_bench_rng_state = 1;
  else {
    long long r = s % kBenchRngMod;
    g_bench_rng_state = (r == 0) ? 1 : r;
  }
}

inline long long bench_rng_next() {
  long long z = g_bench_rng_state;
  long long hi = z / 127773;
  long long lo = z % 127773;
  long long t = 16807 * lo - 2836 * hi;
  if (t <= 0)
    t += kBenchRngMod;
  g_bench_rng_state = t;
  return t;
}

inline long long env_fixed_particle_n() {
  static bool done = false;
  static long long val = -1;
  if (!done) {
    done = true;
    char buf[96];
    DWORD n = GetEnvironmentVariableA("PARTICLE_BENCH_FIXED_N", buf, sizeof(buf));
    if (n > 0 && n < sizeof(buf)) {
      char *end = nullptr;
      long long v = std::strtoll(buf, &end, 10);
      if (end != buf) {
        while (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')
          ++end;
        if (*end == '\0')
          val = v;
      }
    }
  }
  return val;
}

inline bool env_tier_mode() {
  static bool done = false;
  static bool val = false;
  if (!done) {
    done = true;
    char buf[16];
    DWORD n = GetEnvironmentVariableA("PARTICLE_BENCH_TIER_MODE", buf, sizeof(buf));
    val = (n > 0 && buf[0] == '1');
  }
  return val;
}

inline long long particles_for_frame(long long fr) {
  if (env_tier_mode()) {
    long long slot = (fr / PARTICLE_CYCLE_FRAMES) % TIER_SLOTS;
    if (slot == 0)
      return 500;
    return slot * 1000;
  }
  long long fx = env_fixed_particle_n();
  if (fx >= 0) {
    if (fx > MAX_PARTICLES)
      return MAX_PARTICLES;
    return fx;
  }
  if (fr < kDemoRampFrames) {
    long long denom = kDemoRampFrames - 1;
    if (denom < 1)
      return kDemoRampTarget;
    return (fr * kDemoRampTarget) / denom;
  }
  return kDemoRampTarget;
}

inline long long env_max_frames() {
  static bool done = false;
  static long long val = 0;
  if (!done) {
    done = true;
    char buf[96];
    DWORD n = GetEnvironmentVariableA("PARTICLE_BENCH_MAX_FRAMES", buf, sizeof(buf));
    if (n > 0 && n < sizeof(buf)) {
      char *end = nullptr;
      long long v = std::strtoll(buf, &end, 10);
      if (end != buf) {
        while (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')
          ++end;
        if (*end == '\0')
          val = v;
      }
    }
  }
  return val;
}

inline bool env_debug_mode() {
  static bool done = false;
  static bool val = false;
  if (!done) {
    done = true;
    char buf[16];
    DWORD n = GetEnvironmentVariableA("PARTICLE_BENCH_DEBUG", buf, sizeof(buf));
    val = (n > 0 && buf[0] == '1');
  }
  return val;
}

inline uint32_t bg_color(int x, int y, int t) {
  int bb = (x * 59 + t * 13) % 220;
  int gg = (y * 47 + t * 29) % 220;
  int rr = (x + y * 3 + t * 7) % 220;
  return (uint32_t)(4278190080LL + bb + gg * 256 + rr * 65536);
}

inline uint32_t ball_color(int i) {
  int bb = (i * 193049) % 230;
  int gg = (i * 7919) % 230;
  int rr = (i * 503) % 230;
  return (uint32_t)(4278190080LL + bb + gg * 256 + rr * 65536);
}

inline void set_px(uint32_t *pix, int x, int y, uint32_t c) {
  if ((unsigned)x < (unsigned)W && (unsigned)y < (unsigned)H)
    pix[(size_t)y * (size_t)W + (size_t)x] = c;
}

void draw_background(uint32_t *pix, int t) {
  for (int y = 0; y < H; y += BGSTEP) {
    for (int x = 0; x < W; x += BGSTEP)
      set_px(pix, x, y, bg_color(x, y, t));
  }
}

void step(std::vector<int> &bx, std::vector<int> &by, std::vector<int> &bvx,
          std::vector<int> &bvy, const std::vector<int> &br, long long n) {
  for (long long i = 0; i < n; i++) {
    bx[(size_t)i] += bvx[(size_t)i];
    by[(size_t)i] += bvy[(size_t)i];
    int r = br[(size_t)i];
    if (bx[(size_t)i] < r) {
      bx[(size_t)i] = r;
      bvx[(size_t)i] = -bvx[(size_t)i];
    }
    if (bx[(size_t)i] > W - r) {
      bx[(size_t)i] = W - r;
      bvx[(size_t)i] = -bvx[(size_t)i];
    }
    if (by[(size_t)i] < r) {
      by[(size_t)i] = r;
      bvy[(size_t)i] = -bvy[(size_t)i];
    }
    if (by[(size_t)i] > H - r) {
      by[(size_t)i] = H - r;
      bvy[(size_t)i] = -bvy[(size_t)i];
    }
  }
}

int collide_resolve(std::vector<int> &bx, std::vector<int> &by, std::vector<int> &bvx,
                    std::vector<int> &bvy, const std::vector<int> &br, long long n) {
  int collisions = 0;
  for (long long i = 0; i < n; i++) {
    for (long long j = i + 1; j < n; j++) {
      int dx = bx[(size_t)j] - bx[(size_t)i];
      int dy = by[(size_t)j] - by[(size_t)i];
      long long d2 = (long long)dx * dx + (long long)dy * dy;
      int md = br[(size_t)i] + br[(size_t)j];
      if (d2 > 0 && d2 < (long long)md * md) {
        collisions++;
        int sx = bvx[(size_t)i];
        bvx[(size_t)i] = bvx[(size_t)j];
        bvx[(size_t)j] = sx;
        int sy = bvy[(size_t)i];
        bvy[(size_t)i] = bvy[(size_t)j];
        bvy[(size_t)j] = sy;
        if (dx > 0) {
          bx[(size_t)i] -= 2;
          bx[(size_t)j] += 2;
        }
        if (dx < 0) {
          bx[(size_t)i] += 2;
          bx[(size_t)j] -= 2;
        }
        if (dx == 0) {
          if (dy > 0) {
            by[(size_t)i] -= 2;
            by[(size_t)j] += 2;
          }
          if (dy < 0) {
            by[(size_t)i] += 2;
            by[(size_t)j] -= 2;
          }
        }
      }
    }
  }
  return collisions;
}

void render_disks(uint32_t *pix, const std::vector<int> &bx, const std::vector<int> &by,
                  const std::vector<int> &br, long long n) {
  for (long long i = 0; i < n; i++) {
    int cx = bx[(size_t)i];
    int cy = by[(size_t)i];
    int r = br[(size_t)i];
    uint32_t col = ball_color((int)i);
    for (int dy = -r; dy <= r; dy++) {
      for (int dx = -r; dx <= r; dx++) {
        if ((long long)dx * dx + (long long)dy * dy <= (long long)r * r) {
          set_px(pix, cx + dx, cy + dy, col);
        }
      }
    }
  }
}

long long energy_proxy(const std::vector<int> &bvx, const std::vector<int> &bvy, long long n) {
  long long s = 0;
  for (long long i = 0; i < n; i++) {
    long long vx = bvx[(size_t)i];
    long long vy = bvy[(size_t)i];
    s += vx * vx + vy * vy;
  }
  return s;
}

long long secondary_heat() {
  long long acc = 0;
  for (int k = 0; k < 24; k++) {
    for (int u = 0; u < 160; u++)
      acc += (long long)((u * u + k * k * 3) % 997);
  }
  return acc;
}

void init_balls(std::vector<int> &bx, std::vector<int> &by, std::vector<int> &bvx,
                std::vector<int> &bvy, std::vector<int> &br) {
  bench_rng_reset_from_env();
  bx.resize((size_t)MAX_PARTICLES);
  by.resize((size_t)MAX_PARTICLES);
  bvx.resize((size_t)MAX_PARTICLES);
  bvy.resize((size_t)MAX_PARTICLES);
  br.resize((size_t)MAX_PARTICLES);
  for (int i = 0; i < MAX_PARTICLES; i++) {
    bx[(size_t)i] = (int)(24 + bench_rng_next() % (W - 48));
    by[(size_t)i] = (int)(24 + bench_rng_next() % (H - 48));
    bvx[(size_t)i] = (int)(bench_rng_next() % 10 - 5);
    bvy[(size_t)i] = (int)(bench_rng_next() % 10 - 5);
    br[(size_t)i] = (int)(4 + bench_rng_next() % 7);
  }
}

} // namespace

extern "C" int sl_user_main(int argc, char **argv) {
  (void)argc;
  (void)argv;

  bool debug = env_debug_mode();
  if (debug) {
    if (env_fixed_particle_n() < 0) {
      char def[] = "5000";
      SetEnvironmentVariableA("PARTICLE_BENCH_FIXED_N", def);
    }
    if (env_max_frames() <= 0) {
      char def[] = "300";
      SetEnvironmentVariableA("PARTICLE_BENCH_MAX_FRAMES", def);
    }
  }

  std::vector<int> bx, by, bvx, bvy, br;
  init_balls(bx, by, bvx, bvy, br);

  long long frame = 0;
  long long diag = 0;
  long long last_perf = 0;
  long long smooth_fps = 0;
  long long inst_fps = 0;
  long long fps_min = 999999, fps_max = 0, fps_sum = 0, fps_samples = 0;

  int iw = 0, ih = 0;
  uint32_t *pix = sl_win32_pixel_buffer(&iw, &ih);
  if (!pix || iw != W || ih != H)
    return 1;

  long long env_cap = env_max_frames();
  long long max_frames;
  if (env_cap > 0) {
    max_frames = env_cap;
    if (kSourceMaxFrames > 0 && kSourceMaxFrames < max_frames)
      max_frames = kSourceMaxFrames;
  } else {
    max_frames = kSourceMaxFrames;
  }
  int last_coll = 0;
  bool hold_after_stop = false;

  while (sl_win32_poll_events()) {
    long long now_ms = sl_win32_perf_millis();
    if (last_perf > 0) {
      long long dtm = now_ms - last_perf;
      if (dtm < 1)
        dtm = 1;
      long long inst = 1000 / dtm;
      smooth_fps = (smooth_fps * 24 + inst) / 25;
      inst_fps = inst;
      if (debug && inst_fps > 0) {
        fps_samples++;
        fps_sum += inst_fps;
        if (inst_fps < fps_min) fps_min = inst_fps;
        if (inst_fps > fps_max) fps_max = inst_fps;
      }
    }
    last_perf = now_ms;

    long long pc = particles_for_frame(frame);

    draw_background(pix, (int)frame);
    step(bx, by, bvx, bvy, br, pc);
    int collisions = collide_resolve(bx, by, bvx, bvy, br, pc);
    render_disks(pix, bx, by, br, pc);
    long long ep = energy_proxy(bvx, bvy, pc);
    long long sh = secondary_heat();
    diag = (diag * 1315423911LL + (long long)collisions * 911382323LL + ep + sh + frame +
            bx[0]) %
           2147483647LL;
    last_coll = collisions;

    HWND hw = (HWND)sl_win32_hwnd();
    if (hw) {
      wchar_t title[192];
      swprintf(title, 192, L"ParticleBench C++ | N=%lld fps=%lld coll=%d diag=%lld fr=%lld", pc,
               smooth_fps, collisions, diag, frame);
      SetWindowTextW(hw, title);
    }

    sl_win32_present();
    frame++;
    if (max_frames > 0 && frame >= max_frames) {
      hold_after_stop = true;
      break;
    }
  }

  printf("%lld\n", frame);
  printf("%d\n", last_coll);
  printf("%lld\n", diag);
  if (debug && fps_samples > 0) {
    printf("%lld\n", fps_min);
    printf("%lld\n", fps_max);
    printf("%lld\n", fps_sum / fps_samples);
  }
  if (hold_after_stop) {
    while (sl_win32_poll_events()) {
    }
  }
  return 0;
}
