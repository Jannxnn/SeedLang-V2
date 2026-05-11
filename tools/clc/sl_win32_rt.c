/*
 * Seed CLC Win32 GUI runtime: window + 32bpp DIB + message loop.
 * Linked with compileToC output when using --subsystem windows.
 *
 * User translation unit implements: int sl_user_main(int argc, char *argv[]);
 *
 * Headless / CI: set environment variable SEED_WIN32_AUTOCLOSE=1 to exit shortly
 * after the first paint (WM_TIMER), so automated runs do not block on the message loop.
 *
 * See docs/CLC_WIN32_PLAN.txt
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <windows.h>
#include <mmsystem.h>

#ifdef __SSE2__
#include <emmintrin.h>
#define SL_SIMD_SSE2 1
#else
#define SL_SIMD_SSE2 0
#endif

#include <math.h>

#include "sl_win32_public.h"

extern int sl_user_main(int argc, char *argv[]);
#define SL_WIN32_FB_W 640
#define SL_WIN32_FB_H 480

#ifndef SL_WIN32_TIMER_AUTOCLOSE
#define SL_WIN32_TIMER_AUTOCLOSE 77
#endif

static HWND g_hwnd;
static HBITMAP g_hbm;
uint32_t *g_pixels;
int g_fb_w;
int g_fb_h;
uint32_t *sl_win32_fb_pixels = 0;
int sl_win32_fb_w = 0;
int sl_win32_fb_h = 0;
static int g_sl_win32_poll_used;
static int g_sl_win32_quit;
static int g_sl_win32_autoclose_timer_armed;

static HFONT g_sl_win32_text_font;

static void sl_win32_free_text_font(void)
{
  if (g_sl_win32_text_font) {
    DeleteObject(g_sl_win32_text_font);
    g_sl_win32_text_font = NULL;
  }
}

static void sl_win32_ensure_text_font(void)
{
  if (g_sl_win32_text_font)
    return;
  g_sl_win32_text_font = CreateFontA(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, ANSI_CHARSET,
                                     OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                                     FIXED_PITCH | FF_MODERN, "Consolas");
  if (!g_sl_win32_text_font)
    g_sl_win32_text_font = (HFONT)GetStockObject(ANSI_FIXED_FONT);
}

static int g_dirty_x0;
static int g_dirty_y0;
static int g_dirty_x1;
static int g_dirty_y1;
static int g_dirty_active;

static uint32_t g_key_state[8];
static int g_mouse_x;
static int g_mouse_y;
static int g_mouse_buttons;
static int g_mouse_wheel;

static int sl_win32_autoclose_enabled(void);

void *sl_win32_fiber_create(void *closure_fn)
{
  (void)closure_fn;
  return NULL;
}

int sl_win32_is_key_down(int vk)
{
  if ((unsigned)vk >= 256) return 0;
  return (g_key_state[vk >> 5] >> (vk & 31)) & 1;
}

int sl_win32_mouse_x(void) { return g_mouse_x; }
int sl_win32_mouse_y(void) { return g_mouse_y; }

int sl_win32_is_mouse_down(int button)
{
  return (g_mouse_buttons >> button) & 1;
}

int sl_win32_mouse_wheel(void)
{
  int v = g_mouse_wheel;
  g_mouse_wheel = 0;
  return v;
}

static void sl_fill_uint32(uint32_t *dst, uint32_t color, size_t count)
{
  size_t i = 0;
#if SL_SIMD_SSE2
  if (color == 0) {
    memset(dst, 0, count * sizeof(uint32_t));
    return;
  }
  {
    __m128i v = _mm_set1_epi32((int32_t)color);
    while (i + 16 <= count) {
      _mm_storeu_si128((__m128i *)(dst + i), v);
      _mm_storeu_si128((__m128i *)(dst + i + 4), v);
      _mm_storeu_si128((__m128i *)(dst + i + 8), v);
      _mm_storeu_si128((__m128i *)(dst + i + 12), v);
      i += 16;
    }
    while (i + 4 <= count) {
      _mm_storeu_si128((__m128i *)(dst + i), v);
      i += 4;
    }
  }
#else
  while (i + 8 <= count) {
    dst[i] = color;
    dst[i + 1] = color;
    dst[i + 2] = color;
    dst[i + 3] = color;
    dst[i + 4] = color;
    dst[i + 5] = color;
    dst[i + 6] = color;
    dst[i + 7] = color;
    i += 8;
  }
#endif
  while (i < count)
    dst[i++] = color;
}

static void sl_dirty_mark(int x0, int y0, int x1, int y1)
{
  if (!g_dirty_active)
    return;
  if (x0 < g_dirty_x0)
    g_dirty_x0 = x0;
  if (y0 < g_dirty_y0)
    g_dirty_y0 = y0;
  if (x1 > g_dirty_x1)
    g_dirty_x1 = x1;
  if (y1 > g_dirty_y1)
    g_dirty_y1 = y1;
}

void sl_dirty_begin(void)
{
  g_dirty_x0 = g_fb_w;
  g_dirty_y0 = g_fb_h;
  g_dirty_x1 = 0;
  g_dirty_y1 = 0;
  g_dirty_active = 1;
}

void sl_dirty_end(void) { g_dirty_active = 0; }

void sl_win32_clear_dirty(uint32_t color)
{
  if (!g_pixels || g_fb_w <= 0 || g_fb_h <= 0)
    return;
  if (!g_dirty_active || g_dirty_x1 <= g_dirty_x0 || g_dirty_y1 <= g_dirty_y0) {
    sl_win32_clear(color);
    return;
  }
  int y0 = g_dirty_y0 < 0 ? 0 : g_dirty_y0;
  int y1 = g_dirty_y1 > g_fb_h ? g_fb_h : g_dirty_y1;
  int x0 = g_dirty_x0 < 0 ? 0 : g_dirty_x0;
  int x1 = g_dirty_x1 > g_fb_w ? g_fb_w : g_dirty_x1;
  if (y0 >= y1 || x0 >= x1)
    return;
  size_t span_w = (size_t)(x1 - x0);
  uint32_t *row = g_pixels + (size_t)y0 * (size_t)g_fb_w + x0;
  for (int y = y0; y < y1; y++) {
    sl_fill_uint32(row, color, span_w);
    row += g_fb_w;
  }
}

void sl_win32_clear(uint32_t color)
{
  if (!g_pixels || g_fb_w <= 0 || g_fb_h <= 0)
    return;
  size_t total = (size_t)g_fb_w * (size_t)g_fb_h;
  sl_fill_uint32(g_pixels, color, total);
}

void sl_win32_fill_span(int x, int y, int w, uint32_t color)
{
  if (!g_pixels || g_fb_w <= 0 || g_fb_h <= 0 || w <= 0)
    return;
  if (y < 0 || y >= g_fb_h)
    return;
  int x0 = x;
  int x1 = x + w;
  if (x0 < 0)
    x0 = 0;
  if (x1 > g_fb_w)
    x1 = g_fb_w;
  if (x0 >= x1)
    return;
  sl_dirty_mark(x0, y, x1 - 1, y);
  uint32_t *row = g_pixels + (size_t)y * (size_t)g_fb_w + x0;
  sl_fill_uint32(row, color, (size_t)(x1 - x0));
}

void sl_win32_fill_rect(int x, int y, int w, int h, uint32_t color)
{
  if (w <= 0 || h <= 0)
    return;
  for (int row = 0; row < h; row++)
    sl_win32_fill_span(x, y + row, w, color);
}

void sl_win32_fill_circle(int cx, int cy, int r, uint32_t color)
{
  if (r <= 0 || !g_pixels || g_fb_w <= 0 || g_fb_h <= 0)
    return;
  if (r == 1) {
    if ((unsigned)cx < (unsigned)g_fb_w && (unsigned)cy < (unsigned)g_fb_h) {
      g_pixels[(size_t)cy * (size_t)g_fb_w + cx] = color;
      sl_dirty_mark(cx, cy, cx, cy);
    }
    return;
  }
  long long r2 = (long long)r * r;
  for (int dy = -r; dy <= r; dy++) {
    int y = cy + dy;
    if ((unsigned)y >= (unsigned)g_fb_h) continue;
    long long rem = r2 - (long long)dy * dy;
    if (rem < 0) continue;
    int xmax = (int)sqrt((double)rem);
    int x0 = cx - xmax;
    int x1 = cx + xmax;
    if (x0 < 0) x0 = 0;
    if (x1 >= g_fb_w) x1 = g_fb_w - 1;
    if (x0 > x1) continue;
    sl_dirty_mark(x0, y, x1, y);
    sl_fill_uint32(g_pixels + (size_t)y * (size_t)g_fb_w + x0, color, (size_t)(x1 - x0 + 1));
  }
}

#define SL_CLUSTER_MAX_SPANS 131072
#define SL_CLUSTER_MAX_Y 2048

typedef struct {
  int y;
  int x_start;
  int x_end;
  uint32_t color;
} SlSpanCluster;

static SlSpanCluster *g_cluster_spans;
static int g_cluster_count;
static int g_cluster_capacity;
static int g_cluster_mode;

void sl_cluster_begin(void)
{
  g_cluster_count = 0;
  g_cluster_mode = 0;
}

void sl_cluster_begin_direct(void)
{
  g_cluster_count = 0;
  g_cluster_mode = 1;
}

static void sl_cluster_ensure_capacity(int needed)
{
  if (needed <= g_cluster_capacity)
    return;
  int new_cap = g_cluster_capacity ? g_cluster_capacity * 2 : 4096;
  while (new_cap < needed)
    new_cap *= 2;
  if (new_cap > SL_CLUSTER_MAX_SPANS)
    new_cap = SL_CLUSTER_MAX_SPANS;
  g_cluster_spans =
      (SlSpanCluster *)realloc(g_cluster_spans, (size_t)new_cap * sizeof(SlSpanCluster));
  g_cluster_capacity = new_cap;
}

static void sl_cluster_write_span(int y, int x_start, int x_end, uint32_t color)
{
  if (!g_pixels || y < 0 || y >= g_fb_h)
    return;
  int xs = x_start < 0 ? 0 : x_start;
  int xe = x_end >= g_fb_w ? g_fb_w - 1 : x_end;
  if (xs > xe)
    return;
  sl_dirty_mark(xs, y, xe, y);
  uint32_t *row = g_pixels + (size_t)y * (size_t)g_fb_w;
  sl_fill_uint32(row + xs, color, (size_t)(xe - xs + 1));
}

void sl_cluster_add_span(int y, int x_start, int x_end, uint32_t color)
{
  if (x_start > x_end)
    return;
  if (g_cluster_mode == 1) {
    sl_cluster_write_span(y, x_start, x_end, color);
    return;
  }
  sl_cluster_ensure_capacity(g_cluster_count + 1);
  if (g_cluster_count >= g_cluster_capacity)
    return;
  g_cluster_spans[g_cluster_count].y = y;
  g_cluster_spans[g_cluster_count].x_start = x_start;
  g_cluster_spans[g_cluster_count].x_end = x_end;
  g_cluster_spans[g_cluster_count].color = color;
  g_cluster_count++;
}

void sl_cluster_add_rect(int x, int y, int w, int h, uint32_t color)
{
  if (w <= 0 || h <= 0)
    return;
  if (g_cluster_mode == 1) {
    for (int row = 0; row < h; row++)
      sl_cluster_write_span(y + row, x, x + w - 1, color);
    return;
  }
  sl_cluster_ensure_capacity(g_cluster_count + h);
  for (int row = 0; row < h; row++) {
    if (g_cluster_count >= g_cluster_capacity)
      return;
    g_cluster_spans[g_cluster_count].y = y + row;
    g_cluster_spans[g_cluster_count].x_start = x;
    g_cluster_spans[g_cluster_count].x_end = x + w - 1;
    g_cluster_spans[g_cluster_count].color = color;
    g_cluster_count++;
  }
}

void sl_cluster_add_circle(int cx, int cy, int r, uint32_t color)
{
  if (r <= 0)
    return;
  long long r2 = (long long)r * r;
  if (g_cluster_mode == 1) {
    if (!g_pixels || g_fb_w <= 0 || g_fb_h <= 0)
      return;
    for (int dy = -r; dy <= r; dy++) {
      int y = cy + dy;
      if ((unsigned)y >= (unsigned)g_fb_h) continue;
      long long dx_sq = r2 - (long long)dy * dy;
      if (dx_sq < 0) continue;
      int xmax = (int)sqrt((double)dx_sq);
      int x0 = cx - xmax, x1 = cx + xmax;
      if (x0 < 0) x0 = 0;
      if (x1 >= g_fb_w) x1 = g_fb_w - 1;
      if (x0 > x1) continue;
      sl_dirty_mark(x0, y, x1, y);
      sl_fill_uint32(g_pixels + (size_t)y * (size_t)g_fb_w + x0, color, (size_t)(x1 - x0 + 1));
    }
    return;
  }
  int span_estimate = r * 2 + 1;
  sl_cluster_ensure_capacity(g_cluster_count + span_estimate);
  for (int dy = -r; dy <= r; dy++) {
    long long dx_sq = r2 - (long long)dy * dy;
    if (dx_sq < 0)
      continue;
    int xmax = (int)floor(sqrt((double)dx_sq));
    if (g_cluster_count >= g_cluster_capacity)
      return;
    g_cluster_spans[g_cluster_count].y = cy + dy;
    g_cluster_spans[g_cluster_count].x_start = cx - xmax;
    g_cluster_spans[g_cluster_count].x_end = cx + xmax;
    g_cluster_spans[g_cluster_count].color = color;
    g_cluster_count++;
  }
}

static int sl_span_cmp(const void *a, const void *b)
{
  const SlSpanCluster *sa = (const SlSpanCluster *)a;
  const SlSpanCluster *sb = (const SlSpanCluster *)b;
  if (sa->y != sb->y)
    return sa->y - sb->y;
  if (sa->x_start != sb->x_start)
    return sa->x_start - sb->x_start;
  return (int)((long long)sa->color - (long long)sb->color);
}

void sl_cluster_flush(void)
{
  if (!g_pixels || g_cluster_count <= 0)
    return;
  qsort(g_cluster_spans, (size_t)g_cluster_count, sizeof(SlSpanCluster), sl_span_cmp);
  int i = 0;
  while (i < g_cluster_count) {
    int y = g_cluster_spans[i].y;
    uint32_t col = g_cluster_spans[i].color;
    int xs = g_cluster_spans[i].x_start;
    int xe = g_cluster_spans[i].x_end;
    int j = i + 1;
    while (j < g_cluster_count && g_cluster_spans[j].y == y && g_cluster_spans[j].color == col) {
      if (g_cluster_spans[j].x_start > xe + 1)
        break;
      if (g_cluster_spans[j].x_end > xe)
        xe = g_cluster_spans[j].x_end;
      j++;
    }
    sl_cluster_write_span(y, xs, xe, col);
    i = j;
  }
  g_cluster_count = 0;
}

static int sl_win32_create_dib(int w, int h)
{
  BITMAPINFO bi;
  memset(&bi, 0, sizeof(bi));
  bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bi.bmiHeader.biWidth = w;
  bi.bmiHeader.biHeight = -h;
  bi.bmiHeader.biPlanes = 1;
  bi.bmiHeader.biBitCount = 32;
  bi.bmiHeader.biCompression = BI_RGB;
  HDC hdc = GetDC(NULL);
  void *bits = NULL;
  g_hbm = CreateDIBSection(hdc, &bi, DIB_RGB_COLORS, &bits, NULL, 0);
  ReleaseDC(NULL, hdc);
  if (!g_hbm || !bits)
    return 0;
  g_pixels = (uint32_t *)bits;
  g_fb_w = w;
  g_fb_h = h;
  sl_win32_fb_pixels = g_pixels;
  sl_win32_fb_w = g_fb_w;
  sl_win32_fb_h = g_fb_h;
  return 1;
}

uint32_t *sl_win32_pixel_buffer(int *out_w, int *out_h)
{
  if (out_w)
    *out_w = g_fb_w;
  if (out_h)
    *out_h = g_fb_h;
  return g_pixels;
}

void *sl_win32_hwnd(void) { return (void *)g_hwnd; }

void sl_win32_set_window_title_stats(long long n, long long fps, long long coll, long long diag, long long fr)
{
  HWND h = g_hwnd;
  if (!h)
    return;
  char buf[256];
  snprintf(buf, sizeof(buf), "Seed stress | N=%lld fps=%lld coll=%lld diag=%lld fr=%lld", n, fps, coll, diag, fr);
  SetWindowTextA(h, buf);
}

void sl_win32_draw_text(int x, int y, uint32_t color, const char *s)
{
  char buf[384];
  size_t bi = 0;
  const char *p = s ? s : "";
  while (bi < sizeof(buf) - 1 && p[bi]) {
    buf[bi] = p[bi];
    bi++;
  }
  buf[bi] = '\0';
  if (!g_hbm || !g_pixels || buf[0] == '\0')
    return;
  HDC hdc_scr = GetDC(NULL);
  if (!hdc_scr)
    return;
  HDC hdc_mem = CreateCompatibleDC(hdc_scr);
  if (!hdc_mem) {
    ReleaseDC(NULL, hdc_scr);
    return;
  }
  HGDIOBJ old_bm = SelectObject(hdc_mem, g_hbm);
  SetBkMode(hdc_mem, TRANSPARENT);
  {
    uint32_t c = color;
    SetTextColor(hdc_mem, RGB((int)((c >> 16) & 255), (int)((c >> 8) & 255), (int)(c & 255)));
  }
  sl_win32_ensure_text_font();
  SelectObject(hdc_mem, g_sl_win32_text_font);
  TextOutA(hdc_mem, x, y, buf, (int)strlen(buf));
  SelectObject(hdc_mem, old_bm);
  DeleteDC(hdc_mem);
  ReleaseDC(NULL, hdc_scr);
}

void sl_win32_draw_int(int x, int y, uint32_t color, long long n)
{
  char buf[32];
  snprintf(buf, sizeof(buf), "%lld", (long long)n);
  sl_win32_draw_text(x, y, color, buf);
}

long long sl_win32_perf_millis(void)
{
  static LARGE_INTEGER freq;
  static int has_freq;
  LARGE_INTEGER counter;
  if (!has_freq) {
    if (!QueryPerformanceFrequency(&freq) || freq.QuadPart == 0)
      return (long long)GetTickCount64();
    has_freq = 1;
  }
  if (!QueryPerformanceCounter(&counter))
    return (long long)GetTickCount64();
  return (long long)(counter.QuadPart * 1000LL / freq.QuadPart);
}

long long sl_win32_env_int(const char *key, long long default_val)
{
  char buf[96];
  DWORD n = GetEnvironmentVariableA(key, buf, sizeof(buf));
  if (n == 0 || n >= sizeof(buf))
    return default_val;
  const char *p = buf;
  while (*p == ' ' || *p == '\t')
    p++;
  if (*p == '\0')
    return default_val;
  char *end = NULL;
  long long v = strtoll(p, &end, 10);
  if (end == p)
    return default_val;
  while (*end == ' ' || *end == '\t' || *end == '\r' || *end == '\n')
    end++;
  if (*end != '\0')
    return default_val;
  return v;
}

int sl_win32_poll_events(void)
{
  MSG msg;
  g_sl_win32_poll_used = 1;
  while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
    if (msg.message == WM_QUIT) {
      g_sl_win32_quit = 1;
      return 0;
    }
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  return g_sl_win32_quit ? 0 : 1;
}

void sl_win32_present(void)
{
  if (!g_hwnd)
    return;
  if (g_dirty_active && g_dirty_x0 < g_dirty_x1 && g_dirty_y0 < g_dirty_y1) {
    RECT r;
    r.left = g_dirty_x0 < 0 ? 0 : g_dirty_x0;
    r.top = g_dirty_y0 < 0 ? 0 : g_dirty_y0;
    r.right = g_dirty_x1 > g_fb_w ? g_fb_w : g_dirty_x1;
    r.bottom = g_dirty_y1 > g_fb_h ? g_fb_h : g_dirty_y1;
    InvalidateRect(g_hwnd, &r, FALSE);
  } else {
    InvalidateRect(g_hwnd, NULL, FALSE);
  }
  if (sl_win32_autoclose_enabled() && !g_sl_win32_autoclose_timer_armed) {
    g_sl_win32_autoclose_timer_armed = 1;
    {
      char abuf[16];
      DWORD an = GetEnvironmentVariableA("SEED_WIN32_AUTOCLOSE_MS", abuf, sizeof(abuf));
      UINT ams = an > 0 ? (UINT)atoi(abuf) : 300;
      if (SetTimer(g_hwnd, SL_WIN32_TIMER_AUTOCLOSE, ams, NULL) == 0)
        g_sl_win32_autoclose_timer_armed = 0;
    }
  }
}

static int sl_win32_autoclose_enabled(void)
{
  char buf[16];
  DWORD n = GetEnvironmentVariableA("SEED_WIN32_AUTOCLOSE", buf, sizeof(buf));
  return n > 0 && buf[0] == '1';
}

static LRESULT CALLBACK SlWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
  switch (msg) {
  case WM_ERASEBKGND:
    return 1;
  case WM_CLOSE:
    DestroyWindow(hwnd);
    return 0;
  case WM_KEYDOWN:
  case WM_SYSKEYDOWN: {
    unsigned vk = (unsigned)wParam;
    if (vk < 256) g_key_state[vk >> 5] |= (1u << (vk & 31));
    return 0;
  }
  case WM_KEYUP:
  case WM_SYSKEYUP: {
    unsigned vk = (unsigned)wParam;
    if (vk < 256) g_key_state[vk >> 5] &= ~(1u << (vk & 31));
    return 0;
  }
  case WM_LBUTTONDOWN:
    g_mouse_buttons |= 1;
    return 0;
  case WM_LBUTTONUP:
    g_mouse_buttons &= ~1;
    return 0;
  case WM_RBUTTONDOWN:
    g_mouse_buttons |= 2;
    return 0;
  case WM_RBUTTONUP:
    g_mouse_buttons &= ~2;
    return 0;
  case WM_MBUTTONDOWN:
    g_mouse_buttons |= 4;
    return 0;
  case WM_MBUTTONUP:
    g_mouse_buttons &= ~4;
    return 0;
  case WM_MOUSEMOVE:
    g_mouse_x = (int)(short)LOWORD(lParam);
    g_mouse_y = (int)(short)HIWORD(lParam);
    return 0;
  case WM_MOUSEWHEEL:
    g_mouse_wheel += (int)(short)HIWORD(wParam);
    return 0;
  case WM_TIMER:
    if (wParam == SL_WIN32_TIMER_AUTOCLOSE && sl_win32_autoclose_enabled())
      PostQuitMessage(0);
    return 0;
  case WM_PAINT: {
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hwnd, &ps);
    if (g_pixels && g_fb_w > 0 && g_fb_h > 0) {
      BITMAPINFO bi;
      memset(&bi, 0, sizeof(bi));
      bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
      bi.bmiHeader.biWidth = g_fb_w;
      bi.bmiHeader.biHeight = -g_fb_h;
      bi.bmiHeader.biPlanes = 1;
      bi.bmiHeader.biBitCount = 32;
      bi.bmiHeader.biCompression = BI_RGB;
      StretchDIBits(hdc, 0, 0, g_fb_w, g_fb_h, 0, 0, g_fb_w, g_fb_h, g_pixels, &bi,
                    DIB_RGB_COLORS, SRCCOPY);
    }
    EndPaint(hwnd, &ps);
    return 0;
  }
  case WM_DESTROY:
    g_sl_win32_quit = 1;
    sl_win32_free_text_font();
    if (g_hbm) {
      DeleteObject(g_hbm);
      g_hbm = NULL;
      g_pixels = NULL;
      g_fb_w = 0;
      g_fb_h = 0;
      sl_win32_fb_pixels = NULL;
      sl_win32_fb_w = 0;
      sl_win32_fb_h = 0;
    }
    PostQuitMessage(0);
    return 0;
  default:
    return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

static BOOL sl_win32_register_class(HINSTANCE inst)
{
  WNDCLASSEXW wc;
  ATOM a;
  memset(&wc, 0, sizeof(wc));
  wc.cbSize = sizeof(wc);
  wc.style = CS_HREDRAW | CS_VREDRAW;
  wc.lpfnWndProc = SlWndProc;
  wc.hInstance = inst;
  wc.hCursor = LoadCursor(NULL, IDC_ARROW);
  wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
  wc.lpszClassName = L"SeedClcWndClass";
  a = RegisterClassExW(&wc);
  if (a == 0 && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
    return FALSE;
  return TRUE;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmdline, int show)
{
  MSG msg;
  int code;
  static char arg0[] = "seed";
  char *argv[] = { arg0 };
  (void)prev;
  (void)cmdline;
  (void)show;

  timeBeginPeriod(1);
  SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS);
  SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
  SetProcessAffinityMask(GetCurrentProcess(), 0x1);

  if (!sl_win32_register_class(inst))
    return 1;

  RECT rc = { 0, 0, SL_WIN32_FB_W, SL_WIN32_FB_H };
  AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
  g_hwnd = CreateWindowExW(0, L"SeedClcWndClass", L"Seed CLC", WS_OVERLAPPEDWINDOW, CW_USEDEFAULT,
                           CW_USEDEFAULT, rc.right - rc.left, rc.bottom - rc.top, NULL, NULL, inst,
                           NULL);
  if (!g_hwnd)
    return 2;

  if (!sl_win32_create_dib(SL_WIN32_FB_W, SL_WIN32_FB_H)) {
    DestroyWindow(g_hwnd);
    g_hwnd = NULL;
    return 3;
  }

  ShowWindow(g_hwnd, SW_SHOW);
  UpdateWindow(g_hwnd);

  code = sl_user_main(1, argv);

  {
    int exitCode = 0;
    if (!g_sl_win32_poll_used) {
      for (;;) {
        int r = (int)GetMessageW(&msg, NULL, 0, 0);
        if (r == 0) {
          exitCode = (int)msg.wParam;
          break;
        }
        if (r < 0) {
          g_hwnd = NULL;
          return 4;
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
    } else {
      while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
        if (msg.message == WM_QUIT) {
          exitCode = (int)msg.wParam;
          break;
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
      }
    }
    g_hwnd = NULL;
    (void)code;
    timeEndPeriod(1);
    SetPriorityClass(GetCurrentProcess(), NORMAL_PRIORITY_CLASS);
    SetProcessAffinityMask(GetCurrentProcess(), (DWORD_PTR)-1);
    return exitCode;
  }
}
