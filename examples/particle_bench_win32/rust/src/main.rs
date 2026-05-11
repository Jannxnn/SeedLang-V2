//! Same workload as `examples/clc/win32_stress_sustained.seed` and `particle_bench.cpp`.
//!
//! Build（产出与其它 exe 一样放进仓库 `build/`，方便对齐 Seed）：
//!   仓库根：`npm run compile:particle-bench-win32`
//!   输出：`build/particle_bench_rust.exe`（由脚本从 `target/release/` 复制）
//!
//! 仅 Rust：`cargo build --release`（exe 在 `target/release/particle_bench_rust.exe`）
//! 与 `win32_stress_sustained.seed` / `particle_bench.cpp` 演示默认对齐：**N 从 0 爬到 8000**（800 帧）再驻留 **400** 帧，共 **1200** 帧后停仿真并 **保留窗口**；档位轮换：`PARTICLE_BENCH_TIER_MODE=1`；全程固定 `N`：`PARTICLE_BENCH_FIXED_N`。
//! 一致性自测（抓取 stdout）：`cargo build --release --features console`
#![cfg_attr(all(windows, not(feature = "console")), windows_subsystem = "windows")]

use std::mem::zeroed;
use std::sync::{Mutex, OnceLock};

use windows::core::{w, Result, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{
    BeginPaint, EndPaint, SetDIBitsToDevice, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
    HDC, PAINTSTRUCT,
};
use windows::Win32::Media::timeBeginPeriod;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, PeekMessageW, PostQuitMessage, RegisterClassW,
    SetWindowTextW, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT, MSG,
    PM_REMOVE, SW_SHOW, WINDOW_EX_STYLE, WM_DESTROY, WM_PAINT, WM_QUIT, WNDCLASSW,
    WS_OVERLAPPEDWINDOW,
};

const W: usize = 640;
const H: usize = 480;
const BGSTEP: i32 = 2;
const MAX_PARTICLES: usize = 20000;
const PARTICLE_CYCLE_FRAMES: i64 = 600;
const TIER_SLOTS: i64 = 21;
const BENCH_RNG_MOD: i64 = 2_147_483_647;
/** Matches Seed `MAXF` when env `PARTICLE_BENCH_MAX_FRAMES` unset or 0. */
const SOURCE_MAX_FRAMES: i64 = 1200;
const DEMO_RAMP_TARGET: i64 = 8000;
const DEMO_RAMP_FRAMES: i64 = 800;

static DEBUG_MODE: OnceLock<bool> = OnceLock::new();
static TIER_MODE: OnceLock<bool> = OnceLock::new();

fn env_debug_mode() -> bool {
    *DEBUG_MODE.get_or_init(|| {
        std::env::var("PARTICLE_BENCH_DEBUG")
            .ok()
            .map(|s| s.trim() == "1")
            .unwrap_or(false)
    })
}

fn env_tier_mode() -> bool {
    *TIER_MODE.get_or_init(|| {
        std::env::var("PARTICLE_BENCH_TIER_MODE")
            .map(|s| s.trim() == "1")
            .unwrap_or(false)
    })
}

fn resolved_max_frames() -> i64 {
    let env_val = std::env::var("PARTICLE_BENCH_MAX_FRAMES")
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0);
    if env_val > 0 {
        if SOURCE_MAX_FRAMES > 0 && SOURCE_MAX_FRAMES < env_val {
            return SOURCE_MAX_FRAMES;
        }
        return env_val;
    }
    SOURCE_MAX_FRAMES
}

fn bench_rng_seed_from_env() -> i64 {
    match std::env::var("PARTICLE_BENCH_RNG_SEED") {
        Ok(s) => {
            let t = s.trim();
            if t.is_empty() {
                return 88675123;
            }
            if let Ok(v) = t.parse::<i64>() {
                if v < 0 {
                    return 88675123;
                }
                if v == 0 {
                    return 1;
                }
                let r = v % BENCH_RNG_MOD;
                return if r == 0 { 1 } else { r };
            }
            88675123
        }
        Err(_) => 88675123,
    }
}

fn bench_rng_next(rng: &mut i64) -> i64 {
    let z = *rng;
    let hi = z / 127773;
    let lo = z % 127773;
    let mut t = 16807 * lo - 2836 * hi;
    if t <= 0 {
        t += BENCH_RNG_MOD;
    }
    *rng = t;
    t
}

fn particles_for_frame(fr: i64) -> i64 {
    if env_tier_mode() {
        let slot = (fr / PARTICLE_CYCLE_FRAMES) % TIER_SLOTS;
        return if slot == 0 { 500 } else { slot * 1000 };
    }
    if let Ok(s) = std::env::var("PARTICLE_BENCH_FIXED_N") {
        if let Ok(n) = s.trim().parse::<i64>() {
            if n >= 0 {
                return n.clamp(0, MAX_PARTICLES as i64);
            }
        }
    }
    if env_debug_mode() {
        return 5000;
    }
    if fr < DEMO_RAMP_FRAMES {
        let denom = DEMO_RAMP_FRAMES - 1;
        if denom < 1 {
            return DEMO_RAMP_TARGET;
        }
        return (fr * DEMO_RAMP_TARGET) / denom;
    }
    DEMO_RAMP_TARGET
}

fn bg_color(x: i32, y: i32, t: i32) -> u32 {
    let bb = (x * 59 + t * 13).rem_euclid(220);
    let gg = (y * 47 + t * 29).rem_euclid(220);
    let rr = (x + y * 3 + t * 7).rem_euclid(220);
    (4278190080u64 + bb as u64 + (gg as u64) * 256 + (rr as u64) * 65536) as u32
}

fn ball_color(i: i32) -> u32 {
    let bb = (i.wrapping_mul(193049)).rem_euclid(230);
    let gg = (i.wrapping_mul(7919)).rem_euclid(230);
    let rr = (i.wrapping_mul(503)).rem_euclid(230);
    (4278190080u64 + bb as u64 + (gg as u64) * 256 + (rr as u64) * 65536) as u32
}

struct Bench {
    hwnd: HWND,
    pixels: Vec<u32>,
    bx: Vec<i32>,
    by: Vec<i32>,
    bvx: Vec<i32>,
    bvy: Vec<i32>,
    br: Vec<i32>,
    frame: i64,
    diag: i64,
    last_perf: i64,
    smooth_fps: i64,
    fps_min: i64,
    fps_max: i64,
    fps_sum: i64,
    fps_samples: i64,
    debug: bool,
    /// Stopped on frame cap; keep window until user closes.
    bench_stopped: bool,
}

impl Bench {
    fn new(hwnd: HWND) -> Self {
        let debug = env_debug_mode();
        if debug {
            if std::env::var("PARTICLE_BENCH_FIXED_N").is_err() {
                std::env::set_var("PARTICLE_BENCH_FIXED_N", "5000");
            }
            if std::env::var("PARTICLE_BENCH_MAX_FRAMES").is_err() {
                std::env::set_var("PARTICLE_BENCH_MAX_FRAMES", "300");
            }
        }
        let mut rng = bench_rng_seed_from_env();
        let mut bx = Vec::with_capacity(MAX_PARTICLES);
        let mut by = Vec::with_capacity(MAX_PARTICLES);
        let mut bvx = Vec::with_capacity(MAX_PARTICLES);
        let mut bvy = Vec::with_capacity(MAX_PARTICLES);
        let mut br = Vec::with_capacity(MAX_PARTICLES);
        for _ in 0..MAX_PARTICLES {
            let wspan = (W as i64) - 48;
            let hspan = (H as i64) - 48;
            bx.push((24 + bench_rng_next(&mut rng) % wspan) as i32);
            by.push((24 + bench_rng_next(&mut rng) % hspan) as i32);
            bvx.push((bench_rng_next(&mut rng) % 10 - 5) as i32);
            bvy.push((bench_rng_next(&mut rng) % 10 - 5) as i32);
            br.push((4 + bench_rng_next(&mut rng) % 7) as i32);
        }
        Self {
            hwnd,
            pixels: vec![0u32; W * H],
            bx,
            by,
            bvx,
            bvy,
            br,
            frame: 0,
            diag: 0,
            last_perf: 0,
            smooth_fps: 0,
            fps_min: 999999,
            fps_max: 0,
            fps_sum: 0,
            fps_samples: 0,
            debug,
            bench_stopped: false,
        }
    }

    fn set_px(&mut self, x: i32, y: i32, c: u32) {
        if x >= 0 && y >= 0 && (x as usize) < W && (y as usize) < H {
            self.pixels[y as usize * W + x as usize] = c;
        }
    }

    fn draw_background(&mut self, t: i32) {
        let mut y = 0;
        while y < H as i32 {
            let mut x = 0;
            while x < W as i32 {
                let c = bg_color(x, y, t);
                self.set_px(x, y, c);
                x += BGSTEP;
            }
            y += BGSTEP;
        }
    }

    fn step(&mut self, n: i64) {
        let n = n as usize;
        for i in 0..n {
            self.bx[i] += self.bvx[i];
            self.by[i] += self.bvy[i];
            let r = self.br[i];
            if self.bx[i] < r {
                self.bx[i] = r;
                self.bvx[i] = -self.bvx[i];
            }
            if self.bx[i] > (W as i32) - r {
                self.bx[i] = (W as i32) - r;
                self.bvx[i] = -self.bvx[i];
            }
            if self.by[i] < r {
                self.by[i] = r;
                self.bvy[i] = -self.bvy[i];
            }
            if self.by[i] > (H as i32) - r {
                self.by[i] = (H as i32) - r;
                self.bvy[i] = -self.bvy[i];
            }
        }
    }

    fn collide_resolve(&mut self, n: i64) -> i32 {
        let n = n as usize;
        let mut collisions = 0;
        for i in 0..n {
            for j in (i + 1)..n {
                let dx = self.bx[j] - self.bx[i];
                let dy = self.by[j] - self.by[i];
                let d2 = (dx as i64) * (dx as i64) + (dy as i64) * (dy as i64);
                let md = self.br[i] + self.br[j];
                if d2 > 0 && d2 < (md as i64) * (md as i64) {
                    collisions += 1;
                    let sx = self.bvx[i];
                    self.bvx[i] = self.bvx[j];
                    self.bvx[j] = sx;
                    let sy = self.bvy[i];
                    self.bvy[i] = self.bvy[j];
                    self.bvy[j] = sy;
                    if dx > 0 {
                        self.bx[i] -= 2;
                        self.bx[j] += 2;
                    }
                    if dx < 0 {
                        self.bx[i] += 2;
                        self.bx[j] -= 2;
                    }
                    if dx == 0 {
                        if dy > 0 {
                            self.by[i] -= 2;
                            self.by[j] += 2;
                        }
                        if dy < 0 {
                            self.by[i] += 2;
                            self.by[j] -= 2;
                        }
                    }
                }
            }
        }
        collisions
    }

    fn render_disks(&mut self, n: i64) {
        let n = n as usize;
        for i in 0..n {
            let cx = self.bx[i];
            let cy = self.by[i];
            let r = self.br[i];
            let col = ball_color(i as i32);
            for dy in -r..=r {
                for dx in -r..=r {
                    if (dx as i64) * (dx as i64) + (dy as i64) * (dy as i64)
                        <= (r as i64) * (r as i64)
                    {
                        self.set_px(cx + dx, cy + dy, col);
                    }
                }
            }
        }
    }

    fn energy_proxy(&self, n: i64) -> i64 {
        let n = n as usize;
        let mut s = 0i64;
        for i in 0..n {
            let vx = self.bvx[i] as i64;
            let vy = self.bvy[i] as i64;
            s += vx * vx + vy * vy;
        }
        s
    }

    fn secondary_heat() -> i64 {
        let mut acc = 0i64;
        for k in 0..24 {
            for u in 0..160 {
                acc += ((u * u + k * k * 3) % 997) as i64;
            }
        }
        acc
    }

    /// Returns `true` when the frame cap was just reached (window stays open).
    fn tick(&mut self) -> bool {
        if self.bench_stopped {
            return false;
        }
        let now_ms = unsafe { GetTickCount64() as i64 };
        let mut inst_fps: i64 = 0;
        if self.last_perf > 0 {
            let mut dtm = now_ms - self.last_perf;
            if dtm < 1 {
                dtm = 1;
            }
            let inst = 1000 / dtm;
            self.smooth_fps = (self.smooth_fps * 24 + inst) / 25;
            inst_fps = inst;
            if self.debug && inst_fps > 0 {
                self.fps_samples += 1;
                self.fps_sum += inst_fps;
                if inst_fps < self.fps_min {
                    self.fps_min = inst_fps;
                }
                if inst_fps > self.fps_max {
                    self.fps_max = inst_fps;
                }
            }
        }
        self.last_perf = now_ms;

        let pc = particles_for_frame(self.frame);
        self.draw_background(self.frame as i32);
        self.step(pc);
        let collisions = self.collide_resolve(pc);
        self.render_disks(pc);
        let ep = self.energy_proxy(pc);
        let sh = Self::secondary_heat();
        self.diag = (self.diag * 1315423911
            + (collisions as i64) * 911382323
            + ep
            + sh
            + self.frame
            + self.bx[0] as i64)
            % 2147483647;

        let title = format!(
            "ParticleBench Rust | N={pc} fps={} coll={collisions} diag={} fr={}",
            self.smooth_fps, self.diag, self.frame
        );
        let mut wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            let _ = SetWindowTextW(self.hwnd, PCWSTR(wide.as_mut_ptr()));
        }

        self.frame += 1;

        let cap = resolved_max_frames();
        if cap > 0 && self.frame >= cap {
            println!("{}", self.frame);
            println!("{collisions}");
            println!("{}", self.diag);
            if self.debug && self.fps_samples > 0 {
                println!("{}", self.fps_min);
                println!("{}", self.fps_max);
                println!("{}", self.fps_sum / self.fps_samples);
            }
            self.bench_stopped = true;
            return true;
        }
        false
    }
}

static APP: Mutex<Option<Bench>> = Mutex::new(None);

unsafe fn paint_pixels(hdc: HDC, pixels: &[u32]) {
    let mut hdr: BITMAPINFOHEADER = zeroed();
    hdr.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    hdr.biWidth = W as i32;
    hdr.biHeight = -(H as i32);
    hdr.biPlanes = 1;
    hdr.biBitCount = 32;
    hdr.biCompression = BI_RGB.0 as u32;
    let mut bi: BITMAPINFO = zeroed();
    bi.bmiHeader = hdr;
    let _ = SetDIBitsToDevice(
        hdc,
        0,
        0,
        W as u32,
        H as u32,
        0,
        0,
        0,
        H as u32,
        pixels.as_ptr().cast(),
        &bi,
        DIB_RGB_COLORS,
    );
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    match msg {
        WM_PAINT => {
            let mut ps = PAINTSTRUCT::default();
            let hdc = BeginPaint(hwnd, &mut ps);
            if let Ok(guard) = APP.lock() {
                if let Some(b) = guard.as_ref() {
                    paint_pixels(hdc, &b.pixels);
                }
            }
            let _ = EndPaint(hwnd, &ps);
            windows::Win32::Foundation::LRESULT(0)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            windows::Win32::Foundation::LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn main() -> Result<()> {
    unsafe {
        let _ = timeBeginPeriod(1);
    }

    let instance = unsafe { GetModuleHandleW(None)? };

    let wc = WNDCLASSW {
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wnd_proc),
        hInstance: instance.into(),
        lpszClassName: w!("ParticleBenchRustWndClass"),
        ..Default::default()
    };
    unsafe {
        let _ = RegisterClassW(&wc);
    }

    let hwnd = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("ParticleBenchRustWndClass"),
            w!("ParticleBench Rust"),
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            (W as i32) + 80,
            (H as i32) + 100,
            None,
            None,
            instance,
            None,
        )
    };

    {
        let mut g = APP.lock().unwrap();
        *g = Some(Bench::new(hwnd));
    }

    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        windows::Win32::Graphics::Gdi::InvalidateRect(hwnd, None, false);
    }

    let mut bench_capped = false;
    loop {
        unsafe {
            let mut msg = MSG::default();
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).into() {
                if msg.message == WM_QUIT {
                    return Ok(());
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        if !bench_capped {
            let hit_cap = {
                let mut g = APP.lock().unwrap();
                if let Some(b) = g.as_mut() {
                    b.tick()
                } else {
                    false
                }
            };
            if hit_cap {
                bench_capped = true;
            }
        }

        unsafe {
            windows::Win32::Graphics::Gdi::InvalidateRect(hwnd, None, false);
        }
    }
}
