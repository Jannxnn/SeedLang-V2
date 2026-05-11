/* CLC WARNINGS:
 *   CONST: pending=0 vdCount=2
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <time.h>
#include <sys/stat.h>
#ifdef _WIN32
#include <direct.h>
#endif

#define SL_NULL 0
#define SL_INT 1
#define SL_DBL 2
#define SL_STR 3
#define SL_ARR 4
#define SL_MAP 5
#define SL_BOOL 6
#define SL_PTR 7

typedef struct {
    int type;
    union {
        long long ival;
        double dval;
        char* sval;
        struct SlArray_s* aval;
        struct SlMap_s* mval;
        void* pval;
    };
} SlValue;

static inline SlValue sl_null() { SlValue v; v.type = SL_NULL; v.ival = 0; return v; }
static inline SlValue sl_int(long long i) { SlValue v; v.type = SL_INT; v.ival = i; return v; }
static inline SlValue sl_dbl(double d) { SlValue v; v.type = SL_DBL; v.dval = d; return v; }
static inline SlValue sl_str(char* s) { SlValue v; v.type = SL_STR; v.sval = strdup(s); return v; }
static inline SlValue sl_box_arr(struct SlArray_s* a) { SlValue v; v.type = SL_ARR; v.aval = a; return v; }
static inline SlValue sl_map(struct SlMap_s* m) { SlValue v; v.type = SL_MAP; v.mval = m; return v; }
static inline SlValue sl_bool(long long b) { SlValue v; v.type = SL_BOOL; v.ival = b ? 1 : 0; return v; }
static inline SlValue sl_ptr(void* p) { SlValue v; v.type = SL_PTR; v.pval = p; return v; }

static inline long long sl_to_int(SlValue v) {
    if (v.type == SL_INT || v.type == SL_BOOL) return v.ival;
    if (v.type == SL_DBL) return (long long)v.dval;
    if (v.type == SL_STR) return atoll(v.sval);
    return 0;
}
static inline double sl_to_dbl(SlValue v) {
    if (v.type == SL_DBL) return v.dval;
    if (v.type == SL_INT || v.type == SL_BOOL) return (double)v.ival;
    if (v.type == SL_STR) return atof(v.sval);
    return 0.0;
}
static inline char* sl_to_str(SlValue v) {
    if (v.type == SL_STR) return v.sval;
    if (v.type == SL_NULL) return "null";
    if (v.type == SL_BOOL) return v.ival ? "true" : "false";
    return NULL;
}
static inline long long sl_to_bool(SlValue v) {
    if (v.type == SL_NULL) return 0;
    if (v.type == SL_BOOL || v.type == SL_INT) return v.ival != 0;
    if (v.type == SL_DBL) return v.dval != 0.0;
    if (v.type == SL_STR) return v.sval && v.sval[0] != '\0';
    return 1;
}

typedef struct SlArray_s {
    int encoding;
    union {
        unsigned char* u8;
        unsigned short* u16;
        int* i32;
        long long* i64;
        double* f64;
        SlValue* data;
    };
    int len;
    int cap;
    int refcount;
} SlArray;

#define SL_ENC_U8 1
#define SL_ENC_U16 2
#define SL_ENC_I32 3
#define SL_ENC_I64 4
#define SL_ENC_F64 5
#define SL_ENC_MIXED 6

#ifndef SL_LIKELY
#define SL_LIKELY(x) __builtin_expect(!!(x), 1)
#endif

static SlArray* sl_arr_retain(SlArray* a);
static struct SlMap_s* sl_map_retain(struct SlMap_s* m);

static int sl_enc_size(int enc) {
    switch (enc) {
        case SL_ENC_U8: return 1;
        case SL_ENC_U16: return 2;
        case SL_ENC_I32: return 4;
        case SL_ENC_I64: return 8;
        case SL_ENC_F64: return 8;
        case SL_ENC_MIXED: return (int)sizeof(SlValue);
    }
    return 8;
}

static int sl_val_fits(long long val) {
    if (val >= 0 && val <= 255) return SL_ENC_U8;
    if (val >= 0 && val <= 65535) return SL_ENC_U16;
    if (val >= -2147483648LL && val <= 2147483647LL) return SL_ENC_I32;
    return SL_ENC_I64;
}

static void sl_arr_grow(SlArray* a) {
    if (a->len < a->cap) return;
    a->cap = a->cap * 2;
    switch (a->encoding) {
        case SL_ENC_U8: a->u8 = (unsigned char*)realloc(a->u8, a->cap); break;
        case SL_ENC_U16: a->u16 = (unsigned short*)realloc(a->u16, a->cap * 2); break;
        case SL_ENC_I32: a->i32 = (int*)realloc(a->i32, a->cap * 4); break;
        case SL_ENC_I64: a->i64 = (long long*)realloc(a->i64, a->cap * 8); break;
        case SL_ENC_F64: a->f64 = (double*)realloc(a->f64, a->cap * 8); break;
        case SL_ENC_MIXED: a->data = (SlValue*)realloc(a->data, a->cap * sizeof(SlValue)); break;
    }
}

static void sl_arr_upgrade(SlArray* a, int new_enc) {
    if (new_enc <= a->encoding) return;
    int old_enc = a->encoding;
    int n = a->len;
    int new_cap = a->cap;
    void* old_ptr = a->u8;
    switch (new_enc) {
        case SL_ENC_U16: {
            unsigned short* new_buf = (unsigned short*)malloc(new_cap * 2);
            if (old_enc == SL_ENC_U8) { for (int i = 0; i < n; i++) new_buf[i] = (unsigned short)a->u8[i]; }
            free(old_ptr);
            a->u16 = new_buf;
            break;
        }
        case SL_ENC_I32: {
            int* new_buf = (int*)malloc(new_cap * 4);
            if (old_enc == SL_ENC_U8) { for (int i = 0; i < n; i++) new_buf[i] = (int)a->u8[i]; }
            else if (old_enc == SL_ENC_U16) { for (int i = 0; i < n; i++) new_buf[i] = (int)a->u16[i]; }
            free(old_ptr);
            a->i32 = new_buf;
            break;
        }
        case SL_ENC_I64: {
            long long* new_buf = (long long*)malloc(new_cap * 8);
            if (old_enc == SL_ENC_U8) { for (int i = 0; i < n; i++) new_buf[i] = (long long)a->u8[i]; }
            else if (old_enc == SL_ENC_U16) { for (int i = 0; i < n; i++) new_buf[i] = (long long)a->u16[i]; }
            else if (old_enc == SL_ENC_I32) { for (int i = 0; i < n; i++) new_buf[i] = (long long)a->i32[i]; }
            free(old_ptr);
            a->i64 = new_buf;
            break;
        }
        case SL_ENC_F64: {
            double* new_buf = (double*)malloc(new_cap * 8);
            if (old_enc == SL_ENC_U8) { for (int i = 0; i < n; i++) new_buf[i] = (double)a->u8[i]; }
            else if (old_enc == SL_ENC_U16) { for (int i = 0; i < n; i++) new_buf[i] = (double)a->u16[i]; }
            else if (old_enc == SL_ENC_I32) { for (int i = 0; i < n; i++) new_buf[i] = (double)a->i32[i]; }
            else if (old_enc == SL_ENC_I64) { for (int i = 0; i < n; i++) new_buf[i] = (double)a->i64[i]; }
            free(old_ptr);
            a->f64 = new_buf;
            break;
        }
        case SL_ENC_MIXED: {
            SlValue* new_buf = (SlValue*)malloc(new_cap * sizeof(SlValue));
            if (old_enc == SL_ENC_U8) { for (int i = 0; i < n; i++) { new_buf[i].type = SL_INT; new_buf[i].ival = (long long)a->u8[i]; } }
            else if (old_enc == SL_ENC_U16) { for (int i = 0; i < n; i++) { new_buf[i].type = SL_INT; new_buf[i].ival = (long long)a->u16[i]; } }
            else if (old_enc == SL_ENC_I32) { for (int i = 0; i < n; i++) { new_buf[i].type = SL_INT; new_buf[i].ival = (long long)a->i32[i]; } }
            else if (old_enc == SL_ENC_I64) { for (int i = 0; i < n; i++) { new_buf[i].type = SL_INT; new_buf[i].ival = a->i64[i]; } }
            else if (old_enc == SL_ENC_F64) { for (int i = 0; i < n; i++) { new_buf[i].type = SL_DBL; new_buf[i].dval = a->f64[i]; } }
            free(old_ptr);
            a->data = new_buf;
            break;
        }
    }
    a->encoding = new_enc;
}

static inline SlArray* sl_arr_new(int initial_cap) {
    SlArray* a = (SlArray*)malloc(sizeof(SlArray));
    a->encoding = SL_ENC_U8;
    a->u8 = (unsigned char*)malloc(initial_cap);
    a->len = 0;
    a->cap = initial_cap;
    a->refcount = 1;
    return a;
}

static inline long long sl_arr_get(SlArray* a, int i) {
    switch (a->encoding) {
        case SL_ENC_U8: return (long long)a->u8[i];
        case SL_ENC_U16: return (long long)a->u16[i];
        case SL_ENC_I32: return (long long)a->i32[i];
        case SL_ENC_I64: return a->i64[i];
        case SL_ENC_F64: return (long long)a->f64[i];
        case SL_ENC_MIXED: {
            SlValue v = a->data[i];
            switch (v.type) {
                case SL_INT: return v.ival;
                case SL_DBL: return (long long)v.dval;
                case SL_STR: return (long long)v.sval;
                case SL_MAP: return (long long)v.mval;
                case SL_ARR: return (long long)v.aval;
                case SL_PTR: return (long long)(uintptr_t)v.pval;
                default: return v.ival;
            }
        }
    }
    return 0;
}

static inline SlValue sl_arr_getval(SlArray* a, int i) {
    switch (a->encoding) {
        case SL_ENC_U8: return sl_int((long long)a->u8[i]);
        case SL_ENC_U16: return sl_int((long long)a->u16[i]);
        case SL_ENC_I32: return sl_int((long long)a->i32[i]);
        case SL_ENC_I64: return sl_int(a->i64[i]);
        case SL_ENC_F64: return sl_dbl(a->f64[i]);
        case SL_ENC_MIXED: return a->data[i];
    }
    return sl_int(0);
}

static inline double sl_arr_get_dbl(SlArray* a, int i) {
    switch (a->encoding) {
        case SL_ENC_U8: return (double)a->u8[i];
        case SL_ENC_U16: return (double)a->u16[i];
        case SL_ENC_I32: return (double)a->i32[i];
        case SL_ENC_I64: return (double)a->i64[i];
        case SL_ENC_F64: return a->f64[i];
        case SL_ENC_MIXED: {
            SlValue v = a->data[i];
            switch (v.type) {
                case SL_INT: return (double)v.ival;
                case SL_DBL: return v.dval;
                default: return 0.0;
            }
        }
    }
    return 0.0;
}

static inline void sl_arr_set_dbl(SlArray* a, int i, double val) {
    switch (a->encoding) {
        case SL_ENC_F64: a->f64[i] = val; break;
        case SL_ENC_MIXED: a->data[i].type = SL_DBL; a->data[i].dval = val; break;
        default: sl_arr_upgrade(a, SL_ENC_F64); a->f64[i] = val; break;
    }
}

static inline void sl_arr_set_int(SlArray* a, int i, long long val) {
    if (a->encoding < SL_ENC_MIXED) {
        int needed = sl_val_fits(val);
        if (needed > a->encoding) sl_arr_upgrade(a, needed);
    }
    switch (a->encoding) {
        case SL_ENC_U8: a->u8[i] = (unsigned char)val; break;
        case SL_ENC_U16: a->u16[i] = (unsigned short)val; break;
        case SL_ENC_I32: a->i32[i] = (int)val; break;
        case SL_ENC_I64: a->i64[i] = val; break;
        case SL_ENC_F64: a->f64[i] = (double)val; break;
        case SL_ENC_MIXED: a->data[i].type = SL_INT; a->data[i].ival = val; break;
    }
}

static inline void sl_arr_set(SlArray* a, int i, SlValue val) {
    if (a->encoding != SL_ENC_MIXED && val.type != SL_INT) sl_arr_upgrade(a, SL_ENC_MIXED);
    if (a->encoding == SL_ENC_MIXED) { a->data[i] = val; return; }
    sl_arr_set_int(a, i, val.ival);
}

static inline void sl_arr_push_int(SlArray* a, long long val) {
    if (a->encoding < SL_ENC_MIXED) {
        int needed = sl_val_fits(val);
        if (needed > a->encoding) sl_arr_upgrade(a, needed);
    }
    sl_arr_grow(a);
    switch (a->encoding) {
        case SL_ENC_U8: a->u8[a->len++] = (unsigned char)val; break;
        case SL_ENC_U16: a->u16[a->len++] = (unsigned short)val; break;
        case SL_ENC_I32: a->i32[a->len++] = (int)val; break;
        case SL_ENC_I64: a->i64[a->len++] = val; break;
        case SL_ENC_F64: a->f64[a->len++] = (double)val; break;
        case SL_ENC_MIXED: a->data[a->len].type = SL_INT; a->data[a->len].ival = val; a->len++; break;
    }
}

static inline void sl_arr_push_dbl(SlArray* a, double val) {
    if (a->encoding < SL_ENC_F64) sl_arr_upgrade(a, SL_ENC_F64);
    else if (a->encoding == SL_ENC_F64) {}
    else if (a->encoding == SL_ENC_MIXED) {}
    else sl_arr_upgrade(a, SL_ENC_MIXED);
    sl_arr_grow(a);
    if (a->encoding == SL_ENC_F64) { a->f64[a->len++] = val; }
    else { a->data[a->len].type = SL_DBL; a->data[a->len].dval = val; a->len++; }
}

static inline void sl_arr_push(SlArray* a, SlValue val) {
    if (val.type == SL_INT) { sl_arr_push_int(a, val.ival); return; }
    if (val.type == SL_DBL) { sl_arr_push_dbl(a, val.dval); return; }
    if (a->encoding != SL_ENC_MIXED) sl_arr_upgrade(a, SL_ENC_MIXED);
    sl_arr_grow(a);
    a->data[a->len++] = val;
}

static void sl_arr_ensure(SlArray* a, int need) {
    if (a->cap >= need) { if (need > a->len) a->len = need; return; }
    a->cap = need;
    switch (a->encoding) {
        case SL_ENC_U8: a->u8 = (unsigned char*)realloc(a->u8, a->cap); break;
        case SL_ENC_U16: a->u16 = (unsigned short*)realloc(a->u16, a->cap * 2); break;
        case SL_ENC_I32: a->i32 = (int*)realloc(a->i32, a->cap * 4); break;
        case SL_ENC_I64: a->i64 = (long long*)realloc(a->i64, a->cap * 8); break;
        case SL_ENC_F64: a->f64 = (double*)realloc(a->f64, a->cap * 8); break;
        case SL_ENC_MIXED: a->data = (SlValue*)realloc(a->data, a->cap * sizeof(SlValue)); break;
    }
    if (need > a->len) a->len = need;
}

static void sl_arr_ensure_enc(SlArray* a, int need, int encoding) {
    if (a->encoding != encoding) {
        free(a->u8);
        a->encoding = encoding;
        a->cap = need > a->cap ? need : a->cap;
        switch (encoding) {
            case SL_ENC_U8: a->u8 = (unsigned char*)malloc(a->cap); break;
            case SL_ENC_U16: a->u16 = (unsigned short*)malloc(a->cap * 2); break;
            case SL_ENC_I32: a->i32 = (int*)malloc(a->cap * 4); break;
            case SL_ENC_I64: a->i64 = (long long*)malloc(a->cap * 8); break;
            case SL_ENC_F64: a->f64 = (double*)malloc(a->cap * 8); break;
            case SL_ENC_MIXED: a->data = (SlValue*)malloc(a->cap * sizeof(SlValue)); break;
        }
    } else if (a->cap < need) {
        a->cap = need;
        switch (a->encoding) {
            case SL_ENC_U8: a->u8 = (unsigned char*)realloc(a->u8, a->cap); break;
            case SL_ENC_U16: a->u16 = (unsigned short*)realloc(a->u16, a->cap * 2); break;
            case SL_ENC_I32: a->i32 = (int*)realloc(a->i32, a->cap * 4); break;
            case SL_ENC_I64: a->i64 = (long long*)realloc(a->i64, a->cap * 8); break;
            case SL_ENC_F64: a->f64 = (double*)realloc(a->f64, a->cap * 8); break;
            case SL_ENC_MIXED: a->data = (SlValue*)realloc(a->data, a->cap * sizeof(SlValue)); break;
        }
    }
}

static inline void sl_arr_push_int_nogrow(SlArray* a, long long val) {
    if (a->encoding < SL_ENC_MIXED) {
        int needed = sl_val_fits(val);
        if (needed > a->encoding) sl_arr_upgrade(a, needed);
    }
    switch (a->encoding) {
        case SL_ENC_U8: a->u8[a->len++] = (unsigned char)val; break;
        case SL_ENC_U16: a->u16[a->len++] = (unsigned short)val; break;
        case SL_ENC_I32: a->i32[a->len++] = (int)val; break;
        case SL_ENC_I64: a->i64[a->len++] = val; break;
        case SL_ENC_F64: a->f64[a->len++] = (double)val; break;
        case SL_ENC_MIXED: a->data[a->len].type = SL_INT; a->data[a->len].ival = val; a->len++; break;
    }
}

static inline void sl_arr_push_int_fast(SlArray* a, long long val) {
    switch (a->encoding) {
        case SL_ENC_U8: a->u8[a->len++] = (unsigned char)val; break;
        case SL_ENC_U16: a->u16[a->len++] = (unsigned short)val; break;
        case SL_ENC_I32: a->i32[a->len++] = (int)val; break;
        case SL_ENC_I64: a->i64[a->len++] = val; break;
        case SL_ENC_F64: a->f64[a->len++] = (double)val; break;
        case SL_ENC_MIXED: a->data[a->len].type = SL_INT; a->data[a->len].ival = val; a->len++; break;
    }
}

static inline void sl_arr_push_dbl_nogrow(SlArray* a, double val) {
    if (a->encoding < SL_ENC_F64) sl_arr_upgrade(a, SL_ENC_F64);
    else if (a->encoding == SL_ENC_F64) {}
    else if (a->encoding == SL_ENC_MIXED) {}
    else sl_arr_upgrade(a, SL_ENC_MIXED);
    if (a->encoding == SL_ENC_F64) { a->f64[a->len++] = val; }
    else { a->data[a->len].type = SL_DBL; a->data[a->len].dval = val; a->len++; }
}

static long long sl_arr_len(SlArray* a) { return (long long)a->len; }

static SlArray* sl_arr_from(SlValue* vals, int count) {
    SlArray* a = (SlArray*)malloc(sizeof(SlArray));
    a->encoding = SL_ENC_MIXED;
    a->data = (SlValue*)malloc(sizeof(SlValue) * (count > 0 ? count : 16));
    for (int i = 0; i < count; i++) a->data[i] = vals[i];
    a->len = count;
    a->cap = count > 0 ? count : 16;
    a->refcount = 1;
    return a;
}

static SlArray* sl_arr_from_ints(long long* vals, int count) {
    int min_enc = SL_ENC_U8;
    for (int i = 0; i < count; i++) {
        int needed = sl_val_fits(vals[i]);
        if (needed > min_enc) min_enc = needed;
    }
    SlArray* a = (SlArray*)malloc(sizeof(SlArray));
    a->encoding = min_enc;
    a->cap = count > 0 ? count : 16;
    switch (min_enc) {
        case SL_ENC_U8: a->u8 = (unsigned char*)malloc(a->cap); for (int i = 0; i < count; i++) a->u8[i] = (unsigned char)vals[i]; break;
        case SL_ENC_U16: a->u16 = (unsigned short*)malloc(a->cap * 2); for (int i = 0; i < count; i++) a->u16[i] = (unsigned short)vals[i]; break;
        case SL_ENC_I32: a->i32 = (int*)malloc(a->cap * 4); for (int i = 0; i < count; i++) a->i32[i] = (int)vals[i]; break;
        case SL_ENC_I64: a->i64 = (long long*)malloc(a->cap * 8); for (int i = 0; i < count; i++) a->i64[i] = vals[i]; break;
        default: a->i64 = (long long*)malloc(a->cap * 8); for (int i = 0; i < count; i++) a->i64[i] = vals[i]; a->encoding = SL_ENC_I64; break;
    }
    a->len = count;
    a->refcount = 1;
    return a;
}

static char* sl_strcat(const char* a, const char* b) {
    int la = (int)strlen(a), lb = (int)strlen(b);
    char* r = (char*)malloc(la + lb + 1);
    memcpy(r, a, la);
    memcpy(r + la, b, lb + 1);
    return r;
}

static char* sl_itoa(long long val) {
    char* buf = (char*)malloc(32);
    snprintf(buf, 32, "%lld", val);
    return buf;
}

static char* sl_dtoa(double val) {
    char* buf = (char*)malloc(64);
    snprintf(buf, 64, "%g", val);
    return buf;
}

#include <setjmp.h>
static jmp_buf sl_catch_buf[64];
static int sl_catch_depth = 0;
static long long sl_exception_val = 0;

static SlArray* sl_arr_map(SlArray* arr, long long (*fn)(long long)) {
    SlArray* result = sl_arr_new(arr->len > 0 ? arr->len : 16);
    for (int i = 0; i < arr->len; i++) sl_arr_push_int(result, fn(sl_arr_get(arr, i)));
    return result;
}

static SlArray* sl_arr_filter(SlArray* arr, long long (*fn)(long long)) {
    SlArray* result = sl_arr_new(arr->len > 0 ? arr->len : 16);
    for (int i = 0; i < arr->len; i++) if (fn(sl_arr_get(arr, i))) sl_arr_push(result, sl_arr_getval(arr, i));
    return result;
}

static long long sl_arr_reduce(SlArray* arr, long long (*fn)(long long, long long), long long init) {
    long long acc = init;
    for (int i = 0; i < arr->len; i++) acc = fn(acc, sl_arr_get(arr, i));
    return acc;
}

static long long sl_min(long long a, long long b) { return a < b ? a : b; }
static long long sl_max(long long a, long long b) { return a > b ? a : b; }
static long long sl_clamp(long long v, long long lo, long long hi) { return v < lo ? lo : (v > hi ? hi : v); }

static long long sl_arr_pop(SlArray* a) {
    if (a->len <= 0) return 0;
    return sl_arr_get(a, --a->len);
}

static long long sl_arr_shift(SlArray* a) {
    if (a->len <= 0) return 0;
    long long val = sl_arr_get(a, 0);
    for (int i = 1; i < a->len; i++) sl_arr_set_int(a, i - 1, sl_arr_get(a, i));
    a->len--;
    return val;
}

static SlArray* sl_arr_reverse(SlArray* a) {
    for (int i = 0; i < a->len / 2; i++) {
        long long tmp = sl_arr_get(a, i);
        sl_arr_set_int(a, i, sl_arr_get(a, a->len - 1 - i));
        sl_arr_set_int(a, a->len - 1 - i, tmp);
    }
    return sl_arr_retain(a);
}

static int sl_arr_cmp(const void* a, const void* b) {
    long long va = sl_to_int(*(const SlValue*)a), vb = sl_to_int(*(const SlValue*)b);
    return (va > vb) - (va < vb);
}

static int sl_u8_cmp(const void* a, const void* b) { return (int)(*(const unsigned char*)a) - (int)(*(const unsigned char*)b); }
static int sl_u16_cmp(const void* a, const void* b) { return (int)(*(const unsigned short*)a) - (int)(*(const unsigned short*)b); }
static int sl_i32_cmp(const void* a, const void* b) { int va = *(const int*)a, vb = *(const int*)b; return (va > vb) - (va < vb); }
static int sl_int_cmp(const void* a, const void* b) { long long va = *(const long long*)a, vb = *(const long long*)b; return (va > vb) - (va < vb); }
static int sl_dbl_cmp(const void* a, const void* b) { double va = *(const double*)a, vb = *(const double*)b; return (va > vb) - (va < vb); }

static SlArray* sl_arr_sort(SlArray* a) {
    switch (a->encoding) {
        case SL_ENC_U8: qsort(a->u8, a->len, 1, sl_u8_cmp); break;
        case SL_ENC_U16: qsort(a->u16, a->len, 2, sl_u16_cmp); break;
        case SL_ENC_I32: qsort(a->i32, a->len, 4, sl_i32_cmp); break;
        case SL_ENC_I64: qsort(a->i64, a->len, 8, sl_int_cmp); break;
        case SL_ENC_F64: qsort(a->f64, a->len, 8, sl_dbl_cmp); break;
        case SL_ENC_MIXED: qsort(a->data, a->len, sizeof(SlValue), sl_arr_cmp); break;
    }
    return sl_arr_retain(a);
}

static long long sl_arr_indexOf(SlArray* a, long long val) {
    for (int i = 0; i < a->len; i++) if (sl_arr_get(a, i) == val) return (long long)i;
    return -1;
}

static long long sl_arr_includes(SlArray* a, long long val) {
    for (int i = 0; i < a->len; i++) if (sl_arr_get(a, i) == val) return 1;
    return 0;
}

static char* sl_arr_join(SlArray* a, const char* sep) {
    if (a->len == 0) { char* r = (char*)malloc(1); r[0] = '\0'; return r; }
    int seplen = (int)strlen(sep);
    int total = 32 * a->len + seplen * (a->len - 1) + 1;
    char* r = (char*)malloc(total);
    int pos = 0;
    for (int i = 0; i < a->len; i++) {
        if (i > 0) { memcpy(r + pos, sep, seplen); pos += seplen; }
        pos += snprintf(r + pos, total - pos, "%lld", sl_arr_get(a, i));
    }
    return r;
}

static SlArray* sl_arr_range(long long a, long long b, long long step) {
    long long start, end, s;
    if (b == 0 && step == 0) { start = 0; end = a; s = 1; }
    else if (step == 0) { start = a; end = b; s = 1; }
    else { start = a; end = b; s = step; }
    if (s == 0) s = 1;
    int count = 0;
    if (s > 0) { for (long long i = start; i < end; i += s) count++; }
    else { for (long long i = start; i > end; i += s) count++; }
    SlArray* arr = sl_arr_new(count > 0 ? count : 16);
    if (s > 0) { for (long long i = start; i < end; i += s) sl_arr_push_int(arr, i); }
    else { for (long long i = start; i > end; i += s) sl_arr_push_int(arr, i); }
    return arr;
}

static SlArray* sl_arr_slice(SlArray* a, long long start, long long end) {
    int s = (int)start, e = (int)end;
    if (s < 0) s = a->len + s;
    if (e <= 0) e = a->len + e;
    if (s < 0) s = 0;
    if (e > a->len) e = a->len;
    if (s >= e) return sl_arr_new(16);
    SlArray* r = sl_arr_new(e - s);
    for (int i = s; i < e; i++) sl_arr_push(r, sl_arr_getval(a, i));
    return r;
}

static SlArray* sl_arr_concat(SlArray* a, SlArray* b) {
    SlArray* r = sl_arr_new(a->len + b->len);
    for (int i = 0; i < a->len; i++) sl_arr_push(r, sl_arr_getval(a, i));
    for (int i = 0; i < b->len; i++) sl_arr_push(r, sl_arr_getval(b, i));
    return r;
}

static SlArray* sl_arr_unique(SlArray* a) {
    SlArray* r = sl_arr_new(a->len > 0 ? a->len : 16);
    for (int i = 0; i < a->len; i++) {
        int found = 0;
        long long vi = sl_arr_get(a, i);
        for (int j = 0; j < r->len; j++) { if (sl_arr_get(r, j) == vi) { found = 1; break; } }
        if (!found) sl_arr_push(r, sl_arr_getval(a, i));
    }
    return r;
}

static long long sl_arr_find(SlArray* a, long long (*fn)(long long)) {
    for (int i = 0; i < a->len; i++) if (fn(sl_arr_get(a, i))) return sl_arr_get(a, i);
    return 0;
}

static long long sl_arr_findIndex(SlArray* a, long long (*fn)(long long)) {
    for (int i = 0; i < a->len; i++) if (fn(sl_arr_get(a, i))) return (long long)i;
    return -1;
}

static long long sl_arr_every(SlArray* a, long long (*fn)(long long)) {
    for (int i = 0; i < a->len; i++) if (!fn(sl_arr_get(a, i))) return 0;
    return 1;
}

static long long sl_arr_some(SlArray* a, long long (*fn)(long long)) {
    for (int i = 0; i < a->len; i++) if (fn(sl_arr_get(a, i))) return 1;
    return 0;
}

static void sl_arr_forEach(SlArray* a, long long (*fn)(long long)) {
    for (int i = 0; i < a->len; i++) fn(sl_arr_get(a, i));
}

static SlArray* sl_arr_flat(SlArray* a) {
    if (a->encoding != SL_ENC_MIXED) return sl_arr_slice(a, 0, 0);
    SlArray* result = sl_arr_new(a->len > 0 ? a->len : 16);
    for (int i = 0; i < a->len; i++) {
        SlValue val = sl_arr_getval(a, i);
        if (val.type == SL_ARR && val.aval != NULL) {
            SlArray* inner = val.aval;
            for (int j = 0; j < inner->len; j++) sl_arr_push(result, sl_arr_getval(inner, j));
        } else {
            sl_arr_push(result, val);
        }
    }
    return result;
}

static SlArray* sl_arr_fill(SlArray* a, SlValue val, long long start, long long end) {
    int s = (int)start, e = (int)end;
    if (s < 0) s = a->len + s;
    if (e <= 0) e = a->len;
    if (s < 0) s = 0;
    if (e > a->len) e = a->len;
    if (val.type == SL_INT) {
        for (int i = s; i < e; i++) sl_arr_set_int(a, i, val.ival);
    } else {
        if (a->encoding != SL_ENC_MIXED) sl_arr_upgrade(a, SL_ENC_MIXED);
        for (int i = s; i < e; i++) sl_arr_set(a, i, val);
    }
    return sl_arr_retain(a);
}

static long long sl_arr_sum(SlArray* a) {
    if (a->encoding == SL_ENC_F64) {
        double s = 0;
        for (int i = 0; i < a->len; i++) s += a->f64[i];
        return (long long)s;
    }
    long long s = 0;
    for (int i = 0; i < a->len; i++) s += sl_arr_get(a, i);
    return s;
}
static double sl_arr_avg(SlArray* a) {
    if (a->len == 0) return 0.0;
    if (a->encoding == SL_ENC_F64) {
        double s = 0;
        for (int i = 0; i < a->len; i++) s += a->f64[i];
        return s / a->len;
    }
    long long s = 0;
    for (int i = 0; i < a->len; i++) s += sl_arr_get(a, i);
    return (double)s / a->len;
}

static void sl_arr_unshift(SlArray* a, SlValue val) {
    if (val.type == SL_INT) {
        sl_arr_push_int(a, 0);
        for (int i = a->len - 1; i > 0; i--) sl_arr_set_int(a, i, sl_arr_get(a, i - 1));
        sl_arr_set_int(a, 0, val.ival);
    } else {
        if (a->encoding != SL_ENC_MIXED) sl_arr_upgrade(a, SL_ENC_MIXED);
        sl_arr_grow(a);
        for (int i = a->len; i > 0; i--) a->data[i] = a->data[i-1];
        a->data[0] = val;
        a->len++;
    }
}

static long long sl_arr_lastIndexOf(SlArray* a, long long val) {
    for (int i = a->len - 1; i >= 0; i--) if (sl_arr_get(a, i) == val) return (long long)i;
    return -1;
}

static void sl_sleep(long long ms) {
#ifdef _WIN32
    __declspec(dllimport) void __stdcall Sleep(unsigned long);
    Sleep((unsigned long)ms);
#else
    #include <unistd.h>
    usleep((useconds_t)ms * 1000);
#endif
}

static long long sl_toBool(long long v) { return v != 0 ? 1 : 0; }

static char* sl_readFile(const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) return strdup("");
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    char* buf = (char*)malloc(sz + 1);
    fread(buf, 1, sz, f);
    buf[sz] = '\0';
    fclose(f);
    return buf;
}

static long long sl_writeFile(const char* path, const char* content) {
    FILE* f = fopen(path, "w");
    if (!f) return 0;
    fputs(content, f);
    fclose(f);
    return 1;
}

static long long sl_fileExists(const char* path) {
#ifdef _WIN32
    struct _stat st;
    return _stat(path, &st) == 0 ? 1 : 0;
#else
    struct stat st;
    return stat(path, &st) == 0 ? 1 : 0;
#endif
}

static long long sl_mkdir(const char* path) {
#ifdef _WIN32
    return _mkdir(path) == 0 ? 1 : 0;
#else
    return mkdir(path, 0755) == 0 ? 1 : 0;
#endif
}

static long long sl_remove(const char* path) {
    return remove(path) == 0 ? 1 : 0;
}

#ifdef _WIN32
#include <io.h>
static SlArray* sl_listDir(const char* path) {
    SlArray* result = sl_arr_new(16);
    char pattern[512];
    snprintf(pattern, sizeof(pattern), "%s\\*", path);
    intptr_t hFile;
    struct _finddata_t fileinfo;
    hFile = _findfirst(pattern, &fileinfo);
    if (hFile == -1) return result;
    do {
        if (strcmp(fileinfo.name, ".") != 0 && strcmp(fileinfo.name, "..") != 0) {
            char* name = strdup(fileinfo.name);
            sl_arr_push(result, sl_str(name));
        }
    } while (_findnext(hFile, &fileinfo) == 0);
    _findclose(hFile);
    return result;
}
#else
#include <dirent.h>
static SlArray* sl_listDir(const char* path) {
    SlArray* result = sl_arr_new(16);
    DIR* d = opendir(path);
    if (!d) return result;
    struct dirent* entry;
    while ((entry = readdir(d)) != NULL) {
        if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
            char* name = strdup(entry->d_name);
            sl_arr_push(result, sl_str(name));
        }
    }
    closedir(d);
    return result;
}
#endif

static char* sl_dateFormat(long long timestamp, const char* fmt) {
    time_t t = (time_t)timestamp;
    struct tm* tm_info = localtime(&t);
    char buf[256];
    strftime(buf, sizeof(buf), fmt, tm_info);
    return strdup(buf);
}

static char* sl_str_trimStart(const char* s) {
    while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
    return strdup(s);
}

static char* sl_str_trimEnd(const char* s) {
    long long len = (long long)strlen(s);
    while (len > 0 && (s[len-1] == ' ' || s[len-1] == '\t' || s[len-1] == '\n' || s[len-1] == '\r')) len--;
    char* r = (char*)malloc(len + 1);
    memcpy(r, s, len);
    r[len] = '\0';
    return r;
}

static char* sl_str_padStart(const char* s, long long targetLen, const char* padStr) {
    long long sLen = (long long)strlen(s);
    long long pLen = (long long)strlen(padStr);
    if (sLen >= targetLen) return strdup(s);
    long long padTotal = targetLen - sLen;
    char* r = (char*)malloc(targetLen + 1);
    long long ri = 0;
    for (long long i = 0; i < padTotal; i++) r[ri++] = padStr[i % pLen];
    for (long long i = 0; i < sLen; i++) r[ri++] = s[i];
    r[ri] = '\0';
    return r;
}

static char* sl_str_padEnd(const char* s, long long targetLen, const char* padStr) {
    long long sLen = (long long)strlen(s);
    long long pLen = (long long)strlen(padStr);
    if (sLen >= targetLen) return strdup(s);
    long long padTotal = targetLen - sLen;
    char* r = (char*)malloc(targetLen + 1);
    long long ri = 0;
    for (long long i = 0; i < sLen; i++) r[ri++] = s[i];
    for (long long i = 0; i < padTotal; i++) r[ri++] = padStr[i % pLen];
    r[ri] = '\0';
    return r;
}

static long long sl_str_lastIndexOf(const char* s, const char* sub) {
    long long sLen = (long long)strlen(s);
    long long subLen = (long long)strlen(sub);
    if (subLen == 0 || subLen > sLen) return -1;
    for (long long i = sLen - subLen; i >= 0; i--) {
        if (strncmp(s + i, sub, subLen) == 0) return i;
    }
    return -1;
}

static char* sl_str_upper(const char* s) {
    int len = (int)strlen(s);
    char* r = (char*)malloc(len + 1);
    for (int i = 0; i < len; i++) r[i] = (s[i] >= 'a' && s[i] <= 'z') ? s[i] - 32 : s[i];
    r[len] = '\0';
    return r;
}

static char* sl_str_lower(const char* s) {
    int len = (int)strlen(s);
    char* r = (char*)malloc(len + 1);
    for (int i = 0; i < len; i++) r[i] = (s[i] >= 'A' && s[i] <= 'Z') ? s[i] + 32 : s[i];
    r[len] = '\0';
    return r;
}

static char* sl_str_trim(const char* s) {
    while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
    int len = (int)strlen(s);
    while (len > 0 && (s[len-1] == ' ' || s[len-1] == '\t' || s[len-1] == '\n' || s[len-1] == '\r')) len--;
    char* r = (char*)malloc(len + 1);
    memcpy(r, s, len);
    r[len] = '\0';
    return r;
}

static char* sl_str_replace(const char* str, const char* old, const char* rep) {
    int oldlen = (int)strlen(old), replen = (int)strlen(rep), slen = (int)strlen(str);
    int count = 0;
    const char* p = str;
    while ((p = strstr(p, old)) != NULL) { count++; p += oldlen > 0 ? oldlen : 1; }
    int newlen = slen + count * (replen - oldlen) + 1;
    char* r = (char*)malloc(newlen);
    char* dst = r;
    p = str;
    while (*p) {
        if (strncmp(p, old, oldlen) == 0) { memcpy(dst, rep, replen); dst += replen; p += oldlen; }
        else *dst++ = *p++;
    }
    *dst = '\0';
    return r;
}

static char* sl_str_substring(const char* s, long long start, long long end) {
    int len = (int)strlen(s);
    int a = (int)start, b = (int)end;
    if (a < 0) a = 0;
    if (b < 0) b = len;
    if (a > len) a = len;
    if (b > len) b = len;
    if (a > b) { int t = a; a = b; b = t; }
    int slen = b - a;
    char* r = (char*)malloc(slen + 1);
    memcpy(r, s + a, slen);
    r[slen] = '\0';
    return r;
}

static SlArray* sl_str_split(const char* s, const char* sep) {
    SlArray* r = sl_arr_new(16);
    int seplen = (int)strlen(sep);
    if (seplen == 0) {
        int len = (int)strlen(s);
        for (int i = 0; i < len; i++) {
            char* ch = (char*)malloc(2); ch[0] = s[i]; ch[1] = '\0';
            sl_arr_push(r, sl_str(ch));
        }
        return r;
    }
    const char* p = s;
    while (*p) {
        const char* found = strstr(p, sep);
        if (!found) {
            sl_arr_push(r, sl_str(sl_str_substring(p, 0, -1)));
            break;
        }
        int seglen = (int)(found - p);
        char* seg = (char*)malloc(seglen + 1);
        memcpy(seg, p, seglen); seg[seglen] = '\0';
        sl_arr_push(r, sl_str(seg));
        p = found + seplen;
    }
    return r;
}

static char* sl_str_charAt(const char* s, long long idx) {
    int i = (int)idx;
    int len = (int)strlen(s);
    if (i < 0 || i >= len) { char* r = (char*)malloc(1); r[0] = '\0'; return r; }
    char* r = (char*)malloc(2);
    r[0] = s[i]; r[1] = '\0';
    return r;
}

static long long sl_codePointAt(const char* s, long long idx) {
    int i = (int)idx;
    int len = (int)strlen(s);
    if (i < 0 || i >= len) return -1;
    return (long long)(unsigned char)s[i];
}

static long long sl_str_startsWith(const char* s, const char* prefix) {
    return strncmp(s, prefix, strlen(prefix)) == 0 ? 1 : 0;
}

static long long sl_str_endsWith(const char* s, const char* suffix) {
    int slen = (int)strlen(s), suflen = (int)strlen(suffix);
    if (suflen > slen) return 0;
    return strcmp(s + slen - suflen, suffix) == 0 ? 1 : 0;
}

static char* sl_str_repeat(const char* s, long long count) {
    int slen = (int)strlen(s);
    int total = slen * (int)count;
    char* r = (char*)malloc(total + 1);
    r[0] = '\0';
    for (int i = 0; i < (int)count; i++) memcpy(r + i * slen, s, slen);
    r[total] = '\0';
    return r;
}

static long long sl_str_indexOf(const char* s, const char* sub) {
    const char* found = strstr(s, sub);
    return found ? (long long)(found - s) : -1;
}

static long long sl_str_includes(const char* s, const char* sub) {
    return strstr(s, sub) != NULL ? 1 : 0;
}

static char* sl_toString(long long val) { return sl_itoa(val); }

static long long sl_toNumber(const char* s) { return atoll(s); }

static char* sl_type(SlValue val) {
    if (val.type == SL_NULL) return "null";
    if (val.type == SL_INT) return "number";
    if (val.type == SL_DBL) return "number";
    if (val.type == SL_STR) return "string";
    if (val.type == SL_ARR) return "array";
    if (val.type == SL_MAP) return "object";
    if (val.type == SL_BOOL) return "boolean";
    return "unknown";
}

static long long sl_time() {
    return (long long)time(NULL);
}

typedef struct SlMap_s {
    char** keys;
    SlValue* vals;
    int len;
    int cap;
    int refcount;
} SlMap;

static void sl_map_release(SlMap* m);

static SlArray* sl_arr_retain(SlArray* a) {
    if (a) a->refcount++;
    return a;
}

static void sl_arr_release(SlArray* a) {
    if (!a) return;
    if (--a->refcount <= 0) {
        if (a->encoding == SL_ENC_MIXED) {
            for (int i = 0; i < a->len; i++) {
                SlValue v = a->data[i];
                if (v.type == SL_STR && v.sval) { free(v.sval); }
                else if (v.type == SL_ARR && v.aval) sl_arr_release(v.aval);
                else if (v.type == SL_MAP && v.mval) sl_map_release(v.mval);
            }
            free(a->data);
        } else {
            free(a->u8);
        }
        free(a);
    }
}

static SlMap* sl_map_retain(SlMap* m) {
    if (m) m->refcount++;
    return m;
}

static void sl_map_release(SlMap* m) {
    if (!m) return;
    if (--m->refcount <= 0) {
        for (int i = 0; i < m->len; i++) {
            free(m->keys[i]);
            if (m->vals[i].type == SL_STR && m->vals[i].sval) { free(m->vals[i].sval); m->vals[i].sval = NULL; }
            else if (m->vals[i].type == SL_ARR && m->vals[i].aval) sl_arr_release(m->vals[i].aval);
            else if (m->vals[i].type == SL_MAP && m->vals[i].mval) sl_map_release(m->vals[i].mval);
        }
        free(m->keys);
        free(m->vals);
        free(m);
    }
}

static SlValue sl_value_retain(SlValue v) {
    if (v.type == SL_ARR && v.aval) v.aval->refcount++;
    else if (v.type == SL_MAP && v.mval) v.mval->refcount++;
    return v;
}

/** Map slot ownership: refcounted children get an extra retain; scalars/strings are stored as-is. */
static SlValue sl_map_store_value(SlValue val) {
    if (val.type == SL_ARR && val.aval) val.aval->refcount++;
    else if (val.type == SL_MAP && val.mval) val.mval->refcount++;
    return val;
}

static void sl_value_release(SlValue v) {
    if (v.type == SL_ARR && v.aval) sl_arr_release(v.aval);
    else if (v.type == SL_MAP && v.mval) sl_map_release(v.mval);
    else if (v.type == SL_STR && v.sval) { free(v.sval); }
}

static void sl_release_str(char* s) { if (s) free(s); }
static void sl_release_arr(SlArray* a) { sl_arr_release(a); }
static void sl_release_map(SlMap* m) { sl_map_release(m); }

static SlMap* sl_map_new(int initial_cap) {
    SlMap* m = (SlMap*)malloc(sizeof(SlMap));
    m->keys = (char**)malloc(sizeof(char*) * initial_cap);
    m->vals = (SlValue*)malloc(sizeof(SlValue) * initial_cap);
    m->len = 0;
    m->cap = initial_cap;
    m->refcount = 1;
    return m;
}

static void sl_map_set(SlMap* m, const char* key, SlValue val) {
    for (int i = 0; i < m->len; i++) {
        if (strcmp(m->keys[i], key) == 0) {
            SlValue old = m->vals[i];
            if (old.type == val.type) {
                if (val.type == SL_ARR && old.aval == val.aval) return;
                if (val.type == SL_MAP && old.mval == val.mval) return;
                if (val.type == SL_STR && old.sval == val.sval) return;
            }
            sl_value_release(old);
            m->vals[i] = sl_map_store_value(val);
            return;
        }
    }
    if (m->len >= m->cap) {
        m->cap = m->cap * 2;
        m->keys = (char**)realloc(m->keys, sizeof(char*) * m->cap);
        m->vals = (SlValue*)realloc(m->vals, sizeof(SlValue) * m->cap);
    }
    m->keys[m->len] = strdup(key);
    m->vals[m->len] = sl_map_store_value(val);
    m->len++;
}

static SlValue sl_map_get(SlMap* m, const char* key, SlValue def) {
    for (int i = 0; i < m->len; i++) {
        if (strcmp(m->keys[i], key) == 0) return m->vals[i];
    }
    return def;
}

static long long sl_map_has(SlMap* m, const char* key) {
    for (int i = 0; i < m->len; i++) {
        if (strcmp(m->keys[i], key) == 0) return 1;
    }
    return 0;
}

static SlArray* sl_map_keys(SlMap* m) {
    SlArray* r = sl_arr_new(m->len > 0 ? m->len : 4);
    for (int i = 0; i < m->len; i++) sl_arr_push(r, sl_str(m->keys[i]));
    return r;
}

static SlArray* sl_map_values(SlMap* m) {
    SlArray* r = sl_arr_new(m->len > 0 ? m->len : 4);
    for (int i = 0; i < m->len; i++) sl_arr_push(r, m->vals[i]);
    return r;
}

static void sl_map_merge(SlMap* dst, SlMap* src) {
    for (int i = 0; i < src->len; i++) {
        int found = 0;
        for (int j = 0; j < dst->len; j++) {
            if (strcmp(dst->keys[j], src->keys[i]) == 0) {
                SlValue old = dst->vals[j];
                SlValue nv = src->vals[i];
                if (old.type == nv.type) {
                    if (nv.type == SL_ARR && old.aval == nv.aval) { found = 1; break; }
                    if (nv.type == SL_MAP && old.mval == nv.mval) { found = 1; break; }
                    if (nv.type == SL_STR && old.sval == nv.sval) { found = 1; break; }
                }
                sl_value_release(old);
                if (nv.type == SL_STR && nv.sval) {
                    SlValue w;
                    w.type = SL_STR;
                    w.sval = strdup(nv.sval);
                    dst->vals[j] = w;
                } else {
                    dst->vals[j] = sl_map_store_value(nv);
                }
                found = 1;
                break;
            }
        }
        if (!found) {
            SlValue v = src->vals[i];
            if (v.type == SL_STR && v.sval) {
                SlValue w;
                w.type = SL_STR;
                w.sval = strdup(v.sval);
                sl_map_set(dst, src->keys[i], w);
            } else {
                sl_map_set(dst, src->keys[i], v);
            }
        }
    }
}

static SlArray* sl_map_entries(SlMap* m) {
    SlArray* r = sl_arr_new(m->len > 0 ? m->len : 4);
    for (int i = 0; i < m->len; i++) {
        SlMap* entry = sl_map_new(2);
        sl_map_set(entry, "key", sl_str(m->keys[i]));
        sl_map_set(entry, "value", m->vals[i]);
        sl_arr_push(r, sl_map(entry));
    }
    return r;
}

static long long sl_map_size(SlMap* m) {
    return (long long)m->len;
}

static void sl_map_clear(SlMap* m) {
    for (int i = 0; i < m->len; i++) {
        free(m->keys[i]);
        sl_value_release(m->vals[i]);
    }
    m->len = 0;
}

static long long sl_map_delete(SlMap* m, const char* key) {
    for (int i = 0; i < m->len; i++) {
        if (strcmp(m->keys[i], key) == 0) {
            free(m->keys[i]);
            sl_value_release(m->vals[i]);
            for (int j = i; j < m->len - 1; j++) {
                m->keys[j] = m->keys[j + 1];
                m->vals[j] = m->vals[j + 1];
            }
            m->len--;
            return 1;
        }
    }
    return 0;
}

static SlMap* sl_map_from_entries(SlArray* arr) {
    SlMap* m = sl_map_new(arr->len > 0 ? arr->len : 4);
    for (long long i = 0; i < arr->len; i++) {
        SlValue v = sl_arr_getval(arr, i);
        if (v.type == SL_MAP && v.mval) {
            SlValue kv = sl_map_get(v.mval, "key", sl_int(0));
            SlValue vv = sl_map_get(v.mval, "value", sl_int(0));
            char kbuf[32];
            const char* kstr;
            if (kv.type == SL_STR && kv.sval) kstr = kv.sval;
            else { snprintf(kbuf, sizeof(kbuf), "%lld", sl_to_int(kv)); kstr = kbuf; }
            sl_map_set(m, kstr, vv);
        }
    }
    return m;
}

typedef struct SlSet_s {
    SlValue* items;
    long long len;
    long long cap;
    int refcount;
} SlSet;

static SlSet* sl_set_new() {
    SlSet* s = (SlSet*)malloc(sizeof(SlSet));
    s->items = (SlValue*)malloc(sizeof(SlValue) * 8);
    s->len = 0;
    s->cap = 8;
    s->refcount = 1;
    return s;
}

static void sl_set_release(SlSet* s) {
    if (!s) return;
    s->refcount--;
    if (s->refcount <= 0) {
        for (long long i = 0; i < s->len; i++) sl_value_release(s->items[i]);
        free(s->items);
        free(s);
    }
}

static long long sl_set_has(SlSet* s, SlValue val) {
    for (long long i = 0; i < s->len; i++) {
        SlValue it = s->items[i];
        if (it.type == val.type) {
            if (val.type == SL_INT && it.ival == val.ival) return 1;
            if (val.type == SL_DBL && it.dval == val.dval) return 1;
            if (val.type == SL_STR && it.sval && val.sval && strcmp(it.sval, val.sval) == 0) return 1;
        }
    }
    return 0;
}

static void sl_set_add(SlSet* s, SlValue val) {
    if (sl_set_has(s, val)) return;
    if (s->len >= s->cap) {
        s->cap = s->cap * 2;
        s->items = (SlValue*)realloc(s->items, sizeof(SlValue) * s->cap);
    }
    s->items[s->len++] = sl_map_store_value(val);
}

static long long sl_set_delete(SlSet* s, SlValue val) {
    for (long long i = 0; i < s->len; i++) {
        SlValue it = s->items[i];
        int match = 0;
        if (it.type == val.type) {
            if (val.type == SL_INT && it.ival == val.ival) match = 1;
            if (val.type == SL_DBL && it.dval == val.dval) match = 1;
            if (val.type == SL_STR && it.sval && val.sval && strcmp(it.sval, val.sval) == 0) match = 1;
        }
        if (match) {
            sl_value_release(s->items[i]);
            for (long long j = i; j < s->len - 1; j++) s->items[j] = s->items[j + 1];
            s->len--;
            return 1;
        }
    }
    return 0;
}

static long long sl_set_size(SlSet* s) {
    return s->len;
}

static SlArray* sl_set_toArray(SlSet* s) {
    SlArray* r = sl_arr_new(s->len > 0 ? s->len : 4);
    for (long long i = 0; i < s->len; i++) sl_arr_push(r, s->items[i]);
    return r;
}

static void sl_set_clear(SlSet* s) {
    for (long long i = 0; i < s->len; i++) sl_value_release(s->items[i]);
    s->len = 0;
}

static SlSet* sl_set_from_array(SlArray* arr) {
    SlSet* s = sl_set_new();
    for (long long i = 0; i < arr->len; i++) sl_set_add(s, sl_arr_getval(arr, i));
    return s;
}

static long long sl_json_skip_ws(const char* s, long long i) {
    while (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r') i++;
    return i;
}

static long long sl_json_parse_value(const char* s, long long i, SlValue* out);

static long long sl_json_parse_string(const char* s, long long i, char** out) {
    if (s[i] != '"') return -1;
    i++;
    char buf[4096]; int bi = 0;
    while (s[i] && s[i] != '"') {
        if (s[i] == '\\') {
            i++;
            if (s[i] == 'n') buf[bi++] = '\n';
            else if (s[i] == 't') buf[bi++] = '\t';
            else if (s[i] == 'r') buf[bi++] = '\r';
            else if (s[i] == '"') buf[bi++] = '"';
            else if (s[i] == '\\') buf[bi++] = '\\';
            else if (s[i] == '/') buf[bi++] = '/';
            else buf[bi++] = s[i];
        } else {
            buf[bi++] = s[i];
        }
        i++;
    }
    if (s[i] == '"') i++;
    buf[bi] = '\0';
    *out = strdup(buf);
    return i;
}

static long long sl_json_parse_number(const char* s, long long i, SlValue* out) {
    long long start = i;
    if (s[i] == '-') i++;
    while (s[i] >= '0' && s[i] <= '9') i++;
    if (s[i] == '.' || s[i] == 'e' || s[i] == 'E') {
        char* end = NULL;
        double fval = strtod(s + start, &end);
        *out = sl_dbl(fval);
        if (end) i = (long long)(end - s);
    } else {
        long long val = 0;
        long long j = start;
        long long neg = 0;
        if (s[j] == '-') { neg = 1; j++; }
        while (s[j] >= '0' && s[j] <= '9') { val = val * 10 + (s[j] - '0'); j++; }
        *out = sl_int(neg ? -val : val);
    }
    return i;
}

static long long sl_json_parse_array(const char* s, long long i, SlArray** out) {
    if (s[i] != '[') return -1;
    i++;
    SlArray* arr = sl_arr_new(8);
    i = sl_json_skip_ws(s, i);
    if (s[i] == ']') { i++; *out = arr; return i; }
    while (1) {
        SlValue val = sl_null();
        i = sl_json_parse_value(s, i, &val);
        if (i < 0) { sl_arr_push(arr, sl_null()); break; }
        sl_arr_push(arr, val);
        i = sl_json_skip_ws(s, i);
        if (s[i] == ']') { i++; break; }
        if (s[i] == ',') i++;
        i = sl_json_skip_ws(s, i);
    }
    *out = arr;
    return i;
}

static long long sl_json_parse_object(const char* s, long long i, SlMap** out) {
    if (s[i] != '{') return -1;
    i++;
    SlMap* map = sl_map_new(8);
    i = sl_json_skip_ws(s, i);
    if (s[i] == '}') { i++; *out = map; return i; }
    while (1) {
        i = sl_json_skip_ws(s, i);
        char* key = NULL;
        i = sl_json_parse_string(s, i, &key);
        if (i < 0 || !key) break;
        i = sl_json_skip_ws(s, i);
        if (s[i] == ':') i++;
        i = sl_json_skip_ws(s, i);
        SlValue val = sl_null();
        i = sl_json_parse_value(s, i, &val);
        if (i < 0) { free(key); break; }
        sl_map_set(map, key, val);
        free(key);
        i = sl_json_skip_ws(s, i);
        if (s[i] == '}') { i++; break; }
        if (s[i] == ',') i++;
    }
    *out = map;
    return i;
}

static long long sl_json_parse_value(const char* s, long long i, SlValue* out) {
    i = sl_json_skip_ws(s, i);
    if (s[i] == '"') {
        char* str = NULL;
        i = sl_json_parse_string(s, i, &str);
        *out = sl_str(str);
    } else if (s[i] == '{') {
        SlMap* obj = NULL;
        i = sl_json_parse_object(s, i, &obj);
        *out = sl_map(obj);
    } else if (s[i] == '[') {
        SlArray* arr = NULL;
        i = sl_json_parse_array(s, i, &arr);
        *out = sl_box_arr(arr);
    } else if (s[i] == 't') {
        i += 4; *out = sl_bool(1);
    } else if (s[i] == 'f') {
        i += 5; *out = sl_bool(0);
    } else if (s[i] == 'n') {
        i += 4; *out = sl_null();
    } else {
        i = sl_json_parse_number(s, i, out);
    }
    return i;
}

static SlMap* sl_json_parse(const char* s) {
    long long i = 0;
    i = sl_json_skip_ws(s, i);
    if (s[i] == '{') {
        SlMap* obj = NULL;
        i = sl_json_parse_object(s, i, &obj);
        if (obj) return obj;
    }
    return sl_map_new(4);
}

static void sl_json_stringify_map(SlMap* map, char* buf, int* bi, int bufsz);
static void sl_json_stringify_array(SlArray* arr, char* buf, int* bi, int bufsz);

static void sl_json_stringify_value(SlValue v, char* buf, int* bi, int bufsz) {
    if (v.type == SL_STR && v.sval) {
        buf[(*bi)++] = '"';
        int slen = (int)strlen(v.sval);
        if (*bi + slen + 4 < bufsz) { memcpy(buf + *bi, v.sval, slen); *bi += slen; }
        buf[(*bi)++] = '"';
    } else if (v.type == SL_DBL) {
        *bi += snprintf(buf + *bi, bufsz - *bi, "%.6f", v.dval);
    } else if (v.type == SL_BOOL) {
        const char* bs = v.ival ? "true" : "false";
        int blen = (int)strlen(bs);
        memcpy(buf + *bi, bs, blen); *bi += blen;
    } else if (v.type == SL_NULL) {
        memcpy(buf + *bi, "null", 4); *bi += 4;
    } else if (v.type == SL_ARR && v.aval) {
        sl_json_stringify_array(v.aval, buf, bi, bufsz);
    } else if (v.type == SL_MAP && v.mval) {
        sl_json_stringify_map(v.mval, buf, bi, bufsz);
    } else {
        *bi += snprintf(buf + *bi, bufsz - *bi, "%lld", sl_to_int(v));
    }
}

static void sl_json_stringify_map(SlMap* map, char* buf, int* bi, int bufsz) {
    buf[(*bi)++] = '{';
    for (int i = 0; i < map->len; i++) {
        if (i > 0) { buf[(*bi)++] = ','; buf[(*bi)++] = ' '; }
        buf[(*bi)++] = '"';
        int klen = (int)strlen(map->keys[i]);
        memcpy(buf + *bi, map->keys[i], klen); *bi += klen;
        buf[(*bi)++] = '"'; buf[(*bi)++] = ':'; buf[(*bi)++] = ' ';
        sl_json_stringify_value(map->vals[i], buf, bi, bufsz);
    }
    buf[(*bi)++] = '}';
}

static void sl_json_stringify_array(SlArray* arr, char* buf, int* bi, int bufsz) {
    buf[(*bi)++] = '[';
    for (int i = 0; i < arr->len; i++) {
        if (i > 0) { buf[(*bi)++] = ','; buf[(*bi)++] = ' '; }
        sl_json_stringify_value(sl_arr_getval(arr, i), buf, bi, bufsz);
    }
    buf[(*bi)++] = ']';
}

static char* sl_json_stringify(SlMap* map) {
    char* buf = (char*)malloc(16384);
    int bi = 0;
    sl_json_stringify_map(map, buf, &bi, 16384);
    buf[bi] = '\0';
    return buf;
}

static char* sl_json_stringify_arr(SlArray* arr) {
    char* buf = (char*)malloc(16384);
    int bi = 0;
    sl_json_stringify_array(arr, buf, &bi, 16384);
    buf[bi] = '\0';
    return buf;
}

static char* sl_toString_str(const char* s) { return strdup(s); }
static char* sl_toString_d(double val) { return sl_dtoa(val); }

static long long sl_isString(SlValue val) { return val.type == SL_STR ? 1 : 0; }
static long long sl_isMap(SlValue val) { return val.type == SL_MAP ? 1 : 0; }
static long long sl_isArray(SlValue val) { return val.type == SL_ARR ? 1 : 0; }
static long long sl_isNumber(SlValue val) { return (val.type == SL_INT || val.type == SL_DBL) ? 1 : 0; }

static char* sl_format(const char* fmt, SlArray* args) {
    char* buf = (char*)malloc(8192);
    int bi = 0;
    int ai = 0;
    for (int i = 0; fmt[i] && bi < 8000; i++) {
        if (fmt[i] == '{' && fmt[i+1] == '}') {
            if (ai < args->len) {
                SlValue val = sl_arr_getval(args, ai++);
                if (val.type == SL_STR && val.sval) {
                    int slen = (int)strlen(val.sval);
                    if (bi + slen < 8000) { memcpy(buf + bi, val.sval, slen); bi += slen; }
                } else if (val.type == SL_DBL) {
                    bi += snprintf(buf + bi, 8192 - bi, "%.6f", val.dval);
                } else {
                    bi += snprintf(buf + bi, 8192 - bi, "%lld", sl_to_int(val));
                }
            }
            i++;
        } else {
            buf[bi++] = fmt[i];
        }
    }
    buf[bi] = '\0';
    return buf;
}

static char* sl_getEnv(const char* key) {
    char* val = getenv(key);
    return val ? strdup(val) : strdup("");
}

static long long sl_setEnv(const char* key, const char* val) {
#ifdef _WIN32
    return _putenv_s(key, val) == 0 ? 1 : 0;
#else
    return setenv(key, val, 1) == 0 ? 1 : 0;
#endif
}

static SlArray* sl_args(int argc, char* argv[]) {
    SlArray* a = sl_arr_new(argc > 0 ? argc : 1);
    for (int i = 0; i < argc; i++) sl_arr_push(a, sl_str(strdup(argv[i])));
    return a;
}

static long long sl_str_eq(const char* a, const char* b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    return strcmp(a, b) == 0 ? 1 : 0;
}

static long long sl_str_ne(const char* a, const char* b) {
    return sl_str_eq(a, b) ? 0 : 1;
}

static long long sl_str_lt(const char* a, const char* b) {
    if (!a || !b) return 0;
    return strcmp(a, b) < 0 ? 1 : 0;
}

static long long sl_str_gt(const char* a, const char* b) {
    if (!a || !b) return 0;
    return strcmp(a, b) > 0 ? 1 : 0;
}

static long long sl_str_le(const char* a, const char* b) {
    if (!a || !b) return 0;
    return strcmp(a, b) <= 0 ? 1 : 0;
}

static long long sl_str_ge(const char* a, const char* b) {
    if (!a || !b) return 0;
    return strcmp(a, b) >= 0 ? 1 : 0;
}

static char* sl_str_replaceAll(const char* s, const char* old, const char* rep) {
    int slen = strlen(s);
    int olen = strlen(old);
    int rlen = strlen(rep);
    char* buf = (char*)malloc(slen * 4 + 1);
    int bi = 0;
    int i = 0;
    while (i <= slen - olen) {
        if (strncmp(s + i, old, olen) == 0) {
            memcpy(buf + bi, rep, rlen); bi += rlen;
            i += olen;
        } else {
            buf[bi++] = s[i++];
        }
    }
    while (i < slen) buf[bi++] = s[i++];
    buf[bi] = '\0';
    return buf;
}

typedef struct {
    long long (*fn)(void*, long long);
    void* ctx;
} SlClosure;

typedef struct {
    long long (*fn2)(void*, long long, long long);
    void* ctx;
} SlClosure2;

static long long sl_closure_call1(SlClosure c, long long arg) {
    return c.fn(c.ctx, arg);
}

static long long sl_closure_call0(SlClosure c) {
    return c.fn(c.ctx, 0);
}

static long long sl_closure_call2(SlClosure2 c, long long a1, long long a2) {
    return c.fn2(c.ctx, a1, a2);
}

static SlArray* sl_arr_map_closure(SlArray* arr, SlClosure cl) {
    SlArray* result = sl_arr_new(arr->len > 0 ? arr->len : 16);
    for (int i = 0; i < arr->len; i++) sl_arr_push_int(result, cl.fn(cl.ctx, sl_arr_get(arr, i)));
    return result;
}

static SlArray* sl_arr_filter_closure(SlArray* arr, SlClosure cl) {
    SlArray* result = sl_arr_new(arr->len > 0 ? arr->len : 16);
    for (int i = 0; i < arr->len; i++) if (cl.fn(cl.ctx, sl_arr_get(arr, i))) sl_arr_push(result, sl_arr_getval(arr, i));
    return result;
}

static long long sl_arr_reduce_closure(SlArray* arr, long long init, SlClosure2 cl) {
    long long acc = init;
    for (int i = 0; i < arr->len; i++) acc = cl.fn2(cl.ctx, acc, sl_arr_get(arr, i));
    return acc;
}

static SlArray* sl_arr_find_closure(SlArray* arr, SlClosure cl) {
    for (int i = 0; i < arr->len; i++) if (cl.fn(cl.ctx, sl_arr_get(arr, i))) { SlValue v = sl_arr_getval(arr, i); return sl_arr_from(&v, 1); }
    return sl_arr_new(16);
}

static long long sl_arr_findIndex_closure(SlArray* arr, SlClosure cl) {
    for (int i = 0; i < arr->len; i++) if (cl.fn(cl.ctx, sl_arr_get(arr, i))) return (long long)i;
    return -1;
}

static long long sl_arr_every_closure(SlArray* arr, SlClosure cl) {
    for (int i = 0; i < arr->len; i++) if (!cl.fn(cl.ctx, sl_arr_get(arr, i))) return 0;
    return 1;
}

static long long sl_arr_some_closure(SlArray* arr, SlClosure cl) {
    for (int i = 0; i < arr->len; i++) if (cl.fn(cl.ctx, sl_arr_get(arr, i))) return 1;
    return 0;
}

static void sl_arr_forEach_closure(SlArray* arr, SlClosure cl) {
    for (int i = 0; i < arr->len; i++) cl.fn(cl.ctx, sl_arr_get(arr, i));
}

#ifdef SL_GPU

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

typedef void* cl_platform_id;
typedef void* cl_device_id;
typedef void* cl_context;
typedef void* cl_command_queue;
typedef void* cl_mem;
typedef void* cl_program;
typedef void* cl_kernel;
typedef unsigned int cl_uint;
typedef int cl_int;
typedef unsigned long long size_t;
#define CL_MEM_READ_ONLY 1
#define CL_MEM_WRITE_ONLY 2
#define CL_MEM_READ_WRITE 3
#define CL_MEM_COPY_HOST_PTR (1 << 5)
#define CL_TRUE 1
#define CL_FALSE 0
#define CL_DEVICE_TYPE_GPU 2
#define CL_DEVICE_TYPE_ALL 0xFFFFFFFF
#define CL_PROFILING_COMMAND_START 0
#define CL_PROFILING_COMMAND_END 1

typedef cl_int (*clGetPlatformIDs_t)(cl_uint, cl_platform_id*, cl_uint*);
typedef cl_int (*clGetDeviceIDs_t)(cl_platform_id, unsigned long long, cl_uint, cl_device_id*, cl_uint*);
typedef cl_context (*clCreateContext_t)(void*, cl_uint, cl_device_id*, void*, void*, cl_int*);
typedef cl_command_queue (*clCreateCommandQueue_t)(cl_context, cl_device_id, unsigned long long, cl_int*);
typedef cl_mem (*clCreateBuffer_t)(cl_context, unsigned long long, size_t, void*, cl_int*);
typedef cl_program (*clCreateProgramWithSource_t)(cl_context, cl_uint, const char**, const size_t*, cl_int*);
typedef cl_int (*clBuildProgram_t)(cl_program, cl_uint, cl_device_id*, const char*, void*, void*);
typedef cl_kernel (*clCreateKernel_t)(cl_program, const char*, cl_int*);
typedef cl_int (*clSetKernelArg_t)(cl_kernel, cl_uint, size_t, const void*);
typedef cl_int (*clEnqueueNDRangeKernel_t)(cl_command_queue, cl_kernel, cl_uint, const size_t*, const size_t*, const size_t*, cl_uint, const void*, void*);
typedef cl_int (*clEnqueueReadBuffer_t)(cl_command_queue, cl_mem, cl_uint, size_t, size_t, void*, cl_uint, const void*, void*);
typedef cl_int (*clEnqueueWriteBuffer_t)(cl_command_queue, cl_mem, cl_uint, size_t, size_t, const void*, cl_uint, const void*, void*);
typedef cl_int (*clFinish_t)(cl_command_queue);
typedef cl_int (*clReleaseMemObject_t)(cl_mem);
typedef cl_int (*clReleaseKernel_t)(cl_kernel);
typedef cl_int (*clReleaseProgram_t)(cl_program);
typedef cl_int (*clReleaseCommandQueue_t)(cl_command_queue);
typedef cl_int (*clReleaseContext_t)(cl_context);

static struct {
    int initialized;
    int available;
    cl_platform_id platform;
    cl_device_id device;
    cl_context ctx;
    cl_command_queue queue;
    clGetPlatformIDs_t GetPlatformIDs;
    clGetDeviceIDs_t GetDeviceIDs;
    clCreateContext_t CreateContext;
    clCreateCommandQueue_t CreateCommandQueue;
    clCreateBuffer_t CreateBuffer;
    clCreateProgramWithSource_t CreateProgramWithSource;
    clBuildProgram_t BuildProgram;
    clCreateKernel_t CreateKernel;
    clSetKernelArg_t SetKernelArg;
    clEnqueueNDRangeKernel_t EnqueueNDRangeKernel;
    clEnqueueReadBuffer_t EnqueueReadBuffer;
    clEnqueueWriteBuffer_t EnqueueWriteBuffer;
    clFinish_t Finish;
    clReleaseMemObject_t ReleaseMemObject;
    clReleaseKernel_t ReleaseKernel;
    clReleaseProgram_t ReleaseProgram;
    clReleaseCommandQueue_t ReleaseCommandQueue;
    clReleaseContext_t ReleaseContext;
} sl_gpu;

static void sl_gpu_init() {
    if (sl_gpu.initialized) return;
    sl_gpu.initialized = 1;
    sl_gpu.available = 0;

#ifdef _WIN32
    HMODULE h = LoadLibraryA("OpenCL.dll");
    if (!h) return;
    sl_gpu.GetPlatformIDs = (clGetPlatformIDs_t)GetProcAddress(h, "clGetPlatformIDs");
    sl_gpu.GetDeviceIDs = (clGetDeviceIDs_t)GetProcAddress(h, "clGetDeviceIDs");
    sl_gpu.CreateContext = (clCreateContext_t)GetProcAddress(h, "clCreateContext");
    sl_gpu.CreateCommandQueue = (clCreateCommandQueue_t)GetProcAddress(h, "clCreateCommandQueue");
    sl_gpu.CreateBuffer = (clCreateBuffer_t)GetProcAddress(h, "clCreateBuffer");
    sl_gpu.CreateProgramWithSource = (clCreateProgramWithSource_t)GetProcAddress(h, "clCreateProgramWithSource");
    sl_gpu.BuildProgram = (clBuildProgram_t)GetProcAddress(h, "clBuildProgram");
    sl_gpu.CreateKernel = (clCreateKernel_t)GetProcAddress(h, "clCreateKernel");
    sl_gpu.SetKernelArg = (clSetKernelArg_t)GetProcAddress(h, "clSetKernelArg");
    sl_gpu.EnqueueNDRangeKernel = (clEnqueueNDRangeKernel_t)GetProcAddress(h, "clEnqueueNDRangeKernel");
    sl_gpu.EnqueueReadBuffer = (clEnqueueReadBuffer_t)GetProcAddress(h, "clEnqueueReadBuffer");
    sl_gpu.EnqueueWriteBuffer = (clEnqueueWriteBuffer_t)GetProcAddress(h, "clEnqueueWriteBuffer");
    sl_gpu.Finish = (clFinish_t)GetProcAddress(h, "clFinish");
    sl_gpu.ReleaseMemObject = (clReleaseMemObject_t)GetProcAddress(h, "clReleaseMemObject");
    sl_gpu.ReleaseKernel = (clReleaseKernel_t)GetProcAddress(h, "clReleaseKernel");
    sl_gpu.ReleaseProgram = (clReleaseProgram_t)GetProcAddress(h, "clReleaseProgram");
    sl_gpu.ReleaseCommandQueue = (clReleaseCommandQueue_t)GetProcAddress(h, "clReleaseCommandQueue");
    sl_gpu.ReleaseContext = (clReleaseContext_t)GetProcAddress(h, "clReleaseContext");
#else
    void* h = dlopen("libOpenCL.so", 1);
    if (!h) return;
    sl_gpu.GetPlatformIDs = (clGetPlatformIDs_t)dlsym(h, "clGetPlatformIDs");
    sl_gpu.GetDeviceIDs = (clGetDeviceIDs_t)dlsym(h, "clGetDeviceIDs");
    sl_gpu.CreateContext = (clCreateContext_t)dlsym(h, "clCreateContext");
    sl_gpu.CreateCommandQueue = (clCreateCommandQueue_t)dlsym(h, "clCreateCommandQueue");
    sl_gpu.CreateBuffer = (clCreateBuffer_t)dlsym(h, "clCreateBuffer");
    sl_gpu.CreateProgramWithSource = (clCreateProgramWithSource_t)dlsym(h, "clCreateProgramWithSource");
    sl_gpu.BuildProgram = (clBuildProgram_t)dlsym(h, "clBuildProgram");
    sl_gpu.CreateKernel = (clCreateKernel_t)dlsym(h, "clCreateKernel");
    sl_gpu.SetKernelArg = (clSetKernelArg_t)dlsym(h, "clSetKernelArg");
    sl_gpu.EnqueueNDRangeKernel = (clEnqueueNDRangeKernel_t)dlsym(h, "clEnqueueNDRangeKernel");
    sl_gpu.EnqueueReadBuffer = (clEnqueueReadBuffer_t)dlsym(h, "clEnqueueReadBuffer");
    sl_gpu.EnqueueWriteBuffer = (clEnqueueWriteBuffer_t)dlsym(h, "clEnqueueWriteBuffer");
    sl_gpu.Finish = (clFinish_t)dlsym(h, "clFinish");
    sl_gpu.ReleaseMemObject = (clReleaseMemObject_t)dlsym(h, "clReleaseMemObject");
    sl_gpu.ReleaseKernel = (clReleaseKernel_t)dlsym(h, "clReleaseKernel");
    sl_gpu.ReleaseProgram = (clReleaseProgram_t)dlsym(h, "clReleaseProgram");
    sl_gpu.ReleaseCommandQueue = (clReleaseCommandQueue_t)dlsym(h, "clReleaseCommandQueue");
    sl_gpu.ReleaseContext = (clReleaseContext_t)dlsym(h, "clReleaseContext");
#endif
    if (!sl_gpu.GetPlatformIDs || !sl_gpu.GetDeviceIDs || !sl_gpu.CreateContext) return;

    cl_uint nplat = 0;
    if (sl_gpu.GetPlatformIDs(1, &sl_gpu.platform, &nplat) != 0 || nplat == 0) return;
    cl_uint ndev = 0;
    if (sl_gpu.GetDeviceIDs(sl_gpu.platform, CL_DEVICE_TYPE_GPU, 1, &sl_gpu.device, &ndev) != 0 || ndev == 0) {
        if (sl_gpu.GetDeviceIDs(sl_gpu.platform, CL_DEVICE_TYPE_ALL, 1, &sl_gpu.device, &ndev) != 0 || ndev == 0) return;
    }
    cl_int err = 0;
    sl_gpu.ctx = sl_gpu.CreateContext(NULL, 1, &sl_gpu.device, NULL, NULL, &err);
    if (err != 0 || !sl_gpu.ctx) return;
    sl_gpu.queue = sl_gpu.CreateCommandQueue(sl_gpu.ctx, sl_gpu.device, 0, &err);
    if (err != 0 || !sl_gpu.queue) { sl_gpu.ReleaseContext(sl_gpu.ctx); return; }
    sl_gpu.available = 1;
}

static cl_program sl_gpu_compile(const char* source) {
    cl_int err = 0;
    const char* src = source;
    size_t len = strlen(source);
    cl_program prog = sl_gpu.CreateProgramWithSource(sl_gpu.ctx, 1, &src, &len, &err);
    if (err != 0 || !prog) return NULL;
    err = sl_gpu.BuildProgram(prog, 1, &sl_gpu.device, NULL, NULL, NULL);
    if (err != 0) { sl_gpu.ReleaseProgram(prog); return NULL; }
    return prog;
}

static long long sl_gpu_arr_sum(SlArray* a) {
    if (!sl_gpu.available || a->len < 1024) {
        long long s = 0;
        for (int i = 0; i < a->len; i++) s += sl_arr_get(a, i);
        return s;
    }
    int n = a->len;
    int* host = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) host[i] = (int)sl_arr_get(a, i);
    const char* src =
        "__kernel void gpu_sum(__global int* data, __global long long* out, int n) {\n"
        "    int gid = get_global_id(0);\n"
        "    long long s = 0;\n"
        "    for (int i = gid; i < n; i += get_global_size(0)) s += (long long)data[i];\n"
        "    out[gid] = s;\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { long long s = 0; for (int i = 0; i < n; i++) s += host[i]; free(host); return s; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_sum", &err);
    cl_mem buf_in = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), host, &err);
    int wg = 256;
    long long* partial = (long long*)calloc(wg, sizeof(long long));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, wg * sizeof(long long), NULL, &err);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_in);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(int), &n);
    size_t global = wg;
    size_t local = 1;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, wg * sizeof(long long), partial, 0, NULL, NULL);
    long long total = 0;
    for (int i = 0; i < wg; i++) total += partial[i];
    sl_gpu.ReleaseMemObject(buf_in);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(host);
    free(partial);
    return total;
}

static SlArray* sl_gpu_arr_map(SlArray* a, const char* op) {
    if (!sl_gpu.available || a->len < 1024) return NULL;
    int n = a->len;
    int* host = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) host[i] = (int)sl_arr_get(a, i);
    char src[1024];
    snprintf(src, sizeof(src),
        "__kernel void gpu_map(__global int* in, __global int* out, int n) {\n"
        "    int i = get_global_id(0);\n"
        "    if (i < n) out[i] = %s(in[i]);\n"
        "}\n", op);
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(host); return NULL; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_map", &err);
    cl_mem buf_in = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), host, &err);
    int* result = (int*)malloc(n * sizeof(int));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, n * sizeof(int), NULL, &err);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_in);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(int), &n);
    size_t global = ((n + 255) / 256) * 256;
    size_t local = 256;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, n * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(n);
    sl_arr_ensure_enc(out, n, SL_ENC_I32);
    for (int i = 0; i < n; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu.ReleaseMemObject(buf_in);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(host);
    free(result);
    return out;
}

static long long sl_gpu_available() {
    sl_gpu_init();
    return sl_gpu.available ? 1 : 0;
}

static SlArray* sl_gpu_arr_range(long long start, long long end, long long step) {
    if (!sl_gpu.available) return sl_arr_range(start, end, step);
    int n = (int)((end - start) / step);
    if (n <= 0) return sl_arr_new(16);
    if (n < 1024) return sl_arr_range(start, end, step);
    const char* src =
        "__kernel void gpu_range(__global int* out, int start, int step, int n) {\n"
        "    int i = get_global_id(0);\n"
        "    if (i < n) out[i] = start + i * step;\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) return sl_arr_range(start, end, step);
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_range", &err);
    int* result = (int*)malloc(n * sizeof(int));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, n * sizeof(int), NULL, &err);
    int istart = (int)start, istep = (int)step;
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(int), &istart);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(int), &istep);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &n);
    size_t global = ((n + 255) / 256) * 256;
    size_t local = 256;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, n * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(n);
    sl_arr_ensure_enc(out, n, SL_ENC_I32);
    for (int i = 0; i < n; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(result);
    return out;
}

static SlArray* sl_gpu_arr_scale(SlArray* a, long long factor) {
    if (!sl_gpu.available || a->len < 1024) return NULL;
    int n = a->len;
    int* host = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) host[i] = (int)sl_arr_get(a, i);
    const char* src =
        "__kernel void gpu_scale(__global int* in, __global int* out, int factor, int n) {\n"
        "    int i = get_global_id(0);\n"
        "    if (i < n) out[i] = in[i] * factor;\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(host); return NULL; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_scale", &err);
    cl_mem buf_in = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), host, &err);
    int* result = (int*)malloc(n * sizeof(int));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, n * sizeof(int), NULL, &err);
    int ifactor = (int)factor;
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_in);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(int), &ifactor);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &n);
    size_t global = ((n + 255) / 256) * 256;
    size_t local = 256;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, n * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(n);
    sl_arr_ensure_enc(out, n, SL_ENC_I32);
    for (int i = 0; i < n; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu.ReleaseMemObject(buf_in);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(host);
    free(result);
    return out;
}

static SlArray* sl_gpu_arr_add(SlArray* a, SlArray* b) {
    if (!sl_gpu.available || a->len < 1024 || a->len != b->len) return NULL;
    int n = a->len;
    int* ha = (int*)malloc(n * sizeof(int));
    int* hb = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) { ha[i] = (int)sl_arr_get(a, i); hb[i] = (int)sl_arr_get(b, i); }
    const char* src =
        "__kernel void gpu_add(__global int* a, __global int* b, __global int* out, int n) {\n"
        "    int i = get_global_id(0);\n"
        "    if (i < n) out[i] = a[i] + b[i];\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(ha); free(hb); return NULL; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_add", &err);
    cl_mem buf_a = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), ha, &err);
    cl_mem buf_b = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), hb, &err);
    int* result = (int*)malloc(n * sizeof(int));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, n * sizeof(int), NULL, &err);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_a);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_b);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &n);
    size_t global = ((n + 255) / 256) * 256;
    size_t local = 256;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, n * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(n);
    sl_arr_ensure_enc(out, n, SL_ENC_I32);
    for (int i = 0; i < n; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu.ReleaseMemObject(buf_a);
    sl_gpu.ReleaseMemObject(buf_b);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(ha);
    free(hb);
    free(result);
    return out;
}

static SlArray* sl_gpu_arr_multiply(SlArray* a, SlArray* b) {
    if (!sl_gpu.available || a->len < 1024 || a->len != b->len) return NULL;
    int n = a->len;
    int* ha = (int*)malloc(n * sizeof(int));
    int* hb = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) { ha[i] = (int)sl_arr_get(a, i); hb[i] = (int)sl_arr_get(b, i); }
    const char* src =
        "__kernel void gpu_mul(__global int* a, __global int* b, __global int* out, int n) {\n"
        "    int i = get_global_id(0);\n"
        "    if (i < n) out[i] = a[i] * b[i];\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(ha); free(hb); return NULL; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_mul", &err);
    cl_mem buf_a = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), ha, &err);
    cl_mem buf_b = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), hb, &err);
    int* result = (int*)malloc(n * sizeof(int));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, n * sizeof(int), NULL, &err);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_a);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_b);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &n);
    size_t global = ((n + 255) / 256) * 256;
    size_t local = 256;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, n * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(n);
    sl_arr_ensure_enc(out, n, SL_ENC_I32);
    for (int i = 0; i < n; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu.ReleaseMemObject(buf_a);
    sl_gpu.ReleaseMemObject(buf_b);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(ha);
    free(hb);
    free(result);
    return out;
}

static long long sl_gpu_arr_dot(SlArray* a, SlArray* b) {
    if (!sl_gpu.available || a->len < 1024 || a->len != b->len) {
        long long s = 0;
        for (int i = 0; i < a->len && i < b->len; i++) s += sl_arr_get(a, i) * sl_arr_get(b, i);
        return s;
    }
    int n = a->len;
    int* ha = (int*)malloc(n * sizeof(int));
    int* hb = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) { ha[i] = (int)sl_arr_get(a, i); hb[i] = (int)sl_arr_get(b, i); }
    const char* src =
        "__kernel void gpu_dot(__global int* a, __global int* b, __global long long* out, int n) {\n"
        "    int gid = get_global_id(0);\n"
        "    long long s = 0;\n"
        "    for (int i = gid; i < n; i += get_global_size(0)) s += (long long)a[i] * b[i];\n"
        "    out[gid] = s;\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { long long s = 0; for (int i = 0; i < n; i++) s += (long long)ha[i] * hb[i]; free(ha); free(hb); return s; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_dot", &err);
    cl_mem buf_a = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), ha, &err);
    cl_mem buf_b = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, n * sizeof(int), hb, &err);
    int wg = 256;
    long long* partial = (long long*)calloc(wg, sizeof(long long));
    cl_mem buf_out = sl_gpu.CreateBuffer(sl_gpu.ctx, CL_MEM_WRITE_ONLY, wg * sizeof(long long), NULL, &err);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_a);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_b);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(cl_mem), &buf_out);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &n);
    size_t global = wg;
    size_t local = 1;
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 1, NULL, &global, &local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_out, CL_TRUE, 0, wg * sizeof(long long), partial, 0, NULL, NULL);
    long long total = 0;
    for (int i = 0; i < wg; i++) total += partial[i];
    sl_gpu.ReleaseMemObject(buf_a);
    sl_gpu.ReleaseMemObject(buf_b);
    sl_gpu.ReleaseMemObject(buf_out);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(ha);
    free(hb);
    free(partial);
    return total;
}

#define SL_GPU_POOL_SIZE 16
static struct {
    cl_mem bufs[SL_GPU_POOL_SIZE];
    int sizes[SL_GPU_POOL_SIZE];
    int used[SL_GPU_POOL_SIZE];
    int count;
} sl_gpu_pool;

static cl_mem sl_gpu_pool_alloc(cl_context ctx, unsigned long long flags, int bytes, void* host) {
    for (int i = 0; i < sl_gpu_pool.count; i++) {
        if (!sl_gpu_pool.used[i] && sl_gpu_pool.sizes[i] >= bytes) {
            sl_gpu_pool.used[i] = 1;
            if (host) sl_gpu.EnqueueWriteBuffer(sl_gpu.queue, sl_gpu_pool.bufs[i], CL_TRUE, 0, bytes, host, 0, NULL, NULL);
            return sl_gpu_pool.bufs[i];
        }
    }
    cl_int err = 0;
    cl_mem buf = sl_gpu.CreateBuffer(ctx, flags, bytes, host, &err);
    if (err != 0 || !buf) return NULL;
    if (sl_gpu_pool.count < SL_GPU_POOL_SIZE) {
        sl_gpu_pool.bufs[sl_gpu_pool.count] = buf;
        sl_gpu_pool.sizes[sl_gpu_pool.count] = bytes;
        sl_gpu_pool.used[sl_gpu_pool.count] = 1;
        sl_gpu_pool.count++;
    }
    return buf;
}

static void sl_gpu_pool_release(cl_mem buf) {
    for (int i = 0; i < sl_gpu_pool.count; i++) {
        if (sl_gpu_pool.bufs[i] == buf) {
            sl_gpu_pool.used[i] = 0;
            return;
        }
    }
    sl_gpu.ReleaseMemObject(buf);
}

static void sl_gpu_pool_cleanup() {
    for (int i = 0; i < sl_gpu_pool.count; i++) {
        sl_gpu.ReleaseMemObject(sl_gpu_pool.bufs[i]);
    }
    sl_gpu_pool.count = 0;
}

static SlArray* sl_gpu_matmul(SlArray* a, SlArray* b, int M, int N, int P) {
    if (!sl_gpu.available) return NULL;
    int aSz = M * N, bSz = N * P, cSz = M * P;
    int* ha = (int*)malloc(aSz * sizeof(int));
    int* hb = (int*)malloc(bSz * sizeof(int));
    for (int i = 0; i < aSz; i++) ha[i] = (int)sl_arr_get(a, i);
    for (int i = 0; i < bSz; i++) hb[i] = (int)sl_arr_get(b, i);
    const char* src =
        "__kernel void gpu_matmul(__global int* A, __global int* B, __global int* C, int M, int N, int P) {\n"
        "    int row = get_global_id(0);\n"
        "    int col = get_global_id(1);\n"
        "    if (row < M && col < P) {\n"
        "        int sum = 0;\n"
        "        for (int k = 0; k < N; k++) sum += A[row * N + k] * B[k * P + col];\n"
        "        C[row * P + col] = sum;\n"
        "    }\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(ha); free(hb); return NULL; }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_matmul", &err);
    cl_mem buf_a = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, aSz * sizeof(int), ha);
    cl_mem buf_b = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, bSz * sizeof(int), hb);
    int* result = (int*)malloc(cSz * sizeof(int));
    cl_mem buf_c = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_WRITE_ONLY, cSz * sizeof(int), NULL);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_a);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_b);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(cl_mem), &buf_c);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &M);
    sl_gpu.SetKernelArg(kernel, 4, sizeof(int), &N);
    sl_gpu.SetKernelArg(kernel, 5, sizeof(int), &P);
    size_t global[2] = { ((M + 15) / 16) * 16, ((P + 15) / 16) * 16 };
    size_t local[2] = { 16, 16 };
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 2, NULL, global, local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_c, CL_TRUE, 0, cSz * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(cSz);
    sl_arr_ensure_enc(out, cSz, SL_ENC_I32);
    for (int i = 0; i < cSz; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu_pool_release(buf_a);
    sl_gpu_pool_release(buf_b);
    sl_gpu_pool_release(buf_c);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(ha);
    free(hb);
    free(result);
    return out;
}

static SlArray* sl_gpu_matmul_tiled(SlArray* a, SlArray* b, int M, int N, int P) {
    if (!sl_gpu.available) return NULL;
    int aSz = M * N, bSz = N * P, cSz = M * P;
    int* ha = (int*)malloc(aSz * sizeof(int));
    int* hb = (int*)malloc(bSz * sizeof(int));
    for (int i = 0; i < aSz; i++) ha[i] = (int)sl_arr_get(a, i);
    for (int i = 0; i < bSz; i++) hb[i] = (int)sl_arr_get(b, i);
    const char* src =
        "__kernel void gpu_matmul_tiled(__global int* A, __global int* B, __global int* C, int N, int P, __local int* Asub, __local int* Bsub) {\n"
        "    int row = get_global_id(0);\n"
        "    int col = get_global_id(1);\n"
        "    int localRow = get_local_id(0);\n"
        "    int localCol = get_local_id(1);\n"
        "    int sum = 0;\n"
        "    int TILE = 16;\n"
        "    for (int t = 0; t < (N + TILE - 1) / TILE; t++) {\n"
        "        int aCol = t * TILE + localCol;\n"
        "        int bRow = t * TILE + localRow;\n"
        "        Asub[localRow * TILE + localCol] = (row < M && aCol < N) ? A[row * N + aCol] : 0;\n"
        "        Bsub[localRow * TILE + localCol] = (bRow < N && col < P) ? B[bRow * P + col] : 0;\n"
        "        barrier(CLK_LOCAL_MEM_FENCE);\n"
        "        for (int k = 0; k < TILE; k++) sum += Asub[localRow * TILE + k] * Bsub[k * TILE + localCol];\n"
        "        barrier(CLK_LOCAL_MEM_FENCE);\n"
        "    }\n"
        "    if (row < M && col < P) C[row * P + col] = sum;\n"
        "}\n";
    cl_program prog = sl_gpu_compile(src);
    if (!prog) { free(ha); free(hb); return sl_gpu_matmul(a, b, M, N, P); }
    cl_int err = 0;
    cl_kernel kernel = sl_gpu.CreateKernel(prog, "gpu_matmul_tiled", &err);
    cl_mem buf_a = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, aSz * sizeof(int), ha);
    cl_mem buf_b = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, bSz * sizeof(int), hb);
    int* result = (int*)malloc(cSz * sizeof(int));
    cl_mem buf_c = sl_gpu_pool_alloc(sl_gpu.ctx, CL_MEM_WRITE_ONLY, cSz * sizeof(int), NULL);
    sl_gpu.SetKernelArg(kernel, 0, sizeof(cl_mem), &buf_a);
    sl_gpu.SetKernelArg(kernel, 1, sizeof(cl_mem), &buf_b);
    sl_gpu.SetKernelArg(kernel, 2, sizeof(cl_mem), &buf_c);
    sl_gpu.SetKernelArg(kernel, 3, sizeof(int), &N);
    sl_gpu.SetKernelArg(kernel, 4, sizeof(int), &P);
    sl_gpu.SetKernelArg(kernel, 5, 16 * 16 * sizeof(int), NULL);
    sl_gpu.SetKernelArg(kernel, 6, 16 * 16 * sizeof(int), NULL);
    size_t global[2] = { ((M + 15) / 16) * 16, ((P + 15) / 16) * 16 };
    size_t local[2] = { 16, 16 };
    sl_gpu.EnqueueNDRangeKernel(sl_gpu.queue, kernel, 2, NULL, global, local, 0, NULL, NULL);
    sl_gpu.Finish(sl_gpu.queue);
    sl_gpu.EnqueueReadBuffer(sl_gpu.queue, buf_c, CL_TRUE, 0, cSz * sizeof(int), result, 0, NULL, NULL);
    SlArray* out = sl_arr_new(cSz);
    sl_arr_ensure_enc(out, cSz, SL_ENC_I32);
    for (int i = 0; i < cSz; i++) sl_arr_push_int_fast(out, (long long)result[i]);
    sl_gpu_pool_release(buf_a);
    sl_gpu_pool_release(buf_b);
    sl_gpu_pool_release(buf_c);
    sl_gpu.ReleaseKernel(kernel);
    sl_gpu.ReleaseProgram(prog);
    free(ha);
    free(hb);
    free(result);
    return out;
}

#ifdef SL_CUDA
#include <cuda_runtime.h>

static struct {
    int initialized;
    int available;
    int device_count;
    int device_id;
    cudaStream_t stream;
} sl_cuda;

static void sl_cuda_init() {
    if (sl_cuda.initialized) return;
    sl_cuda.initialized = 1;
    sl_cuda.available = 0;
    cudaError_t err = cudaGetDeviceCount(&sl_cuda.device_count);
    if (err != cudaSuccess || sl_cuda.device_count == 0) return;
    sl_cuda.device_id = 0;
    cudaSetDevice(sl_cuda.device_id);
    cudaStreamCreate(&sl_cuda.stream);
    sl_cuda.available = 1;
}

static long long sl_cuda_available() {
    sl_cuda_init();
    return sl_cuda.available ? 1 : 0;
}

static long long sl_cuda_arr_sum(SlArray* a) {
    if (!sl_cuda.available || a->len < 1024) {
        long long s = 0;
        for (int i = 0; i < a->len; i++) s += sl_arr_get(a, i);
        return s;
    }
    int n = a->len;
    int* host = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) host[i] = (int)sl_arr_get(a, i);
    int* d_in; long long* d_out;
    cudaMalloc(&d_in, n * sizeof(int));
    cudaMalloc(&d_out, 256 * sizeof(long long));
    cudaMemcpy(d_in, host, n * sizeof(int), cudaMemcpyHostToDevice);
    long long* partial = (long long*)calloc(256, sizeof(long long));
    cudaMemcpy(d_out, partial, 256 * sizeof(long long), cudaMemcpyHostToDevice);
    cudaStreamSynchronize(sl_cuda.stream);
    cudaMemcpy(partial, d_out, 256 * sizeof(long long), cudaMemcpyDeviceToHost);
    long long total = 0;
    for (int i = 0; i < 256; i++) total += partial[i];
    cudaFree(d_in);
    cudaFree(d_out);
    free(host);
    free(partial);
    return total;
}

static SlArray* sl_cuda_matmul(SlArray* a, SlArray* b, int M, int N, int P) {
    if (!sl_cuda.available) return NULL;
    int aSz = M * N, bSz = N * P, cSz = M * P;
    float* ha = (float*)malloc(aSz * sizeof(float));
    float* hb = (float*)malloc(bSz * sizeof(float));
    float* hc = (float*)malloc(cSz * sizeof(float));
    for (int i = 0; i < aSz; i++) ha[i] = (float)sl_arr_get(a, i);
    for (int i = 0; i < bSz; i++) hb[i] = (float)sl_arr_get(b, i);
    #ifdef USE_CUDA
    {
        void* cublasDll = LoadLibraryA("cublas64_12.dll");
        if (!cublasDll) cublasDll = LoadLibraryA("cublas64_11.dll");
        if (!cublasDll) cublasDll = LoadLibraryA("cublas64_10.dll");
        if (!cublasDll) { free(ha); free(hb); free(hc); return NULL; }
        typedef int (*cublasCreate_t)(void**);
        typedef int (*cublasDestroy_t)(void*);
        typedef int (*cublasSgemm_t)(void*, int, int, int, int, const float*, const float*, int, const float*, int, const float*, float*, int);
        cublasCreate_t cublasCreate = (cublasCreate_t)GetProcAddress((HMODULE)cublasDll, "cublasCreate_v2");
        cublasDestroy_t cublasDestroy = (cublasDestroy_t)GetProcAddress((HMODULE)cublasDll, "cublasDestroy_v2");
        cublasSgemm_t cublasSgemm = (cublasSgemm_t)GetProcAddress((HMODULE)cublasDll, "cublasSgemm_v2");
        if (cublasCreate && cublasSgemm && cublasDestroy) {
            void* handle;
            cublasCreate(&handle);
            float alpha = 1.0f, beta = 0.0f;
            cublasSgemm(handle, 0, 0, P, M, N, &alpha, hb, P, ha, N, &beta, hc, P);
            cublasDestroy(handle);
        }
        FreeLibrary((HMODULE)cublasDll);
    }
    #else
    {
        #pragma omp parallel for collapse(2) schedule(static) if(cSz > 4096)
        for (int i = 0; i < M; i++) {
            for (int j = 0; j < P; j++) {
                float s = 0.0f;
                for (int k = 0; k < N; k++) s += ha[i * N + k] * hb[k * P + j];
                hc[i * P + j] = s;
            }
        }
    }
    #endif
    SlArray* out = sl_arr_new(cSz);
    sl_arr_ensure_enc(out, cSz, SL_ENC_I32);
    for (int i = 0; i < cSz; i++) sl_arr_push_int_fast(out, (long long)hc[i]);
    free(ha); free(hb); free(hc);
    return out;
}
#endif

#endif

int main(int argc, char* argv[]) {
    char* sl_s = strdup("");;
    long long sl_i = 0;;
    { SlStrBuf _sb_s = sl_sb_new(sl_s); sl_sb_ensure(&_sb_s, 100000 + _sb_s.len + 1); long long _wl_i = sl_i;
      while (_wl_i < 100000) {
        _sb_s.data[_sb_s.len++] = 'a';;
        _wl_i++;
      }
      _sb_s.data[_sb_s.len] = '\0';
      sl_s = sl_sb_to_str(&_sb_s);
      sl_i = _wl_i;
    }
    printf("%lld\n", (long long)((long long)strlen(sl_s)));
    sl_release_str(sl_s);
    return 0;
}