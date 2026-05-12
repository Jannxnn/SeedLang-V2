/*
 * Public hooks for CLC Win32 GUI (link with sl_win32_rt.c).
 * Compile with -I path/to/tools/clc to include this header from hand-built C.
 *
 * sl_win32_pixel_buffer: BGRA top-down DIB (same layout as StretchDIBits BI_RGB 32bpp).
 * sl_win32_present: schedules WM_PAINT after you change pixels.
 * sl_win32_poll_events: non-blocking PeekMessage pump; returns 1 to continue, 0 after WM_QUIT / close.
 * sl_win32_hwnd: HWND as void* for SetWindowTextW / overlays (NULL before window exists).
 */
#ifndef SL_WIN32_PUBLIC_H
#define SL_WIN32_PUBLIC_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void sl_win32_present(void);
uint32_t *sl_win32_pixel_buffer(int *out_w, int *out_h);
int sl_win32_poll_events(void);
long long sl_win32_perf_millis(void);
void *sl_win32_hwnd(void);
/** Parse decimal int from process env `key`; on missing/invalid returns default_val. */
long long sl_win32_env_int(const char *key, long long default_val);
/** Updates the window caption (UTF-8 -> SetWindowTextW). */
void sl_win32_set_window_title_utf8(const char *utf8);
/** snprintf(fmt, a..e) then set caption; fmt must contain exactly five "%lld" (or compatible) placeholders. */
void sl_win32_set_window_title_fmt(const char *fmt, long long a, long long b, long long c, long long d, long long e);
/** Default stress-harness caption (Chinese labels: particle / FPS / collisions / checksum / frame). */
void sl_win32_set_window_title_stats(long long n, long long fps, long long coll, long long diag, long long fr);

void sl_win32_clear(uint32_t color);
void sl_win32_fill_span(int x, int y, int w, uint32_t color);
void sl_win32_fill_rect(int x, int y, int w, int h, uint32_t color);
void sl_win32_fill_circle(int cx, int cy, int r, uint32_t color);

/** GDI text onto the 32bpp framebuffer (UTF-8 -> TextOutW). */
void sl_win32_draw_text(int x, int y, uint32_t color, const char *text);
void sl_win32_draw_int(int x, int y, uint32_t color, long long value);

void sl_cluster_begin(void);
void sl_cluster_begin_direct(void);
void sl_cluster_add_span(int y, int x_start, int x_end, uint32_t color);
void sl_cluster_add_rect(int x, int y, int w, int h, uint32_t color);
void sl_cluster_add_circle(int cx, int cy, int r, uint32_t color);
void sl_cluster_flush(void);

void sl_dirty_begin(void);
void sl_dirty_end(void);
void sl_win32_clear_dirty(uint32_t color);

/** Fast direct pixel buffer access — avoids function-call overhead of sl_win32_pixel_buffer().
 *  These are the same values that sl_win32_pixel_buffer() returns. */
extern uint32_t *sl_win32_fb_pixels;
extern int sl_win32_fb_w;
extern int sl_win32_fb_h;

/** Unchecked pixel write — caller guarantees x/y in bounds. No branch, no function call overhead. */
static inline void sl_win32_set_pixel_unsafe(int x, int y, uint32_t c) {
  sl_win32_fb_pixels[y * (unsigned)sl_win32_fb_w + x] = c;
}

void *sl_win32_fiber_create(void *closure_fn);

int sl_win32_is_key_down(int vk);
int sl_win32_mouse_x(void);
int sl_win32_mouse_y(void);
int sl_win32_is_mouse_down(int button);
int sl_win32_mouse_wheel(void);

#define SL_VK_LEFT    0x25
#define SL_VK_UP      0x26
#define SL_VK_RIGHT   0x27
#define SL_VK_DOWN    0x28
#define SL_VK_SPACE   0x20
#define SL_VK_RETURN  0x0D
#define SL_VK_ESCAPE  0x1B
#define SL_VK_TAB     0x09
#define SL_VK_SHIFT   0x10
#define SL_VK_CONTROL 0x11
#define SL_VK_MENU    0x12
#define SL_VK_BACK    0x08
#define SL_VK_DELETE  0x2E
#define SL_VK_0       0x30
#define SL_VK_1       0x31
#define SL_VK_2       0x32
#define SL_VK_3       0x33
#define SL_VK_4       0x34
#define SL_VK_5       0x35
#define SL_VK_6       0x36
#define SL_VK_7       0x37
#define SL_VK_8       0x38
#define SL_VK_9       0x39
#define SL_VK_A       0x41
#define SL_VK_B       0x42
#define SL_VK_C       0x43
#define SL_VK_D       0x44
#define SL_VK_E       0x45
#define SL_VK_F       0x46
#define SL_VK_G       0x47
#define SL_VK_H       0x48
#define SL_VK_I       0x49
#define SL_VK_J       0x4A
#define SL_VK_K       0x4B
#define SL_VK_L       0x4C
#define SL_VK_M       0x4D
#define SL_VK_N       0x4E
#define SL_VK_O       0x4F
#define SL_VK_P       0x50
#define SL_VK_Q       0x51
#define SL_VK_R       0x52
#define SL_VK_S       0x53
#define SL_VK_T       0x54
#define SL_VK_U       0x55
#define SL_VK_V       0x56
#define SL_VK_W       0x57
#define SL_VK_X       0x58
#define SL_VK_Y       0x59
#define SL_VK_Z       0x5A

#ifdef __cplusplus
}
#endif

#endif
