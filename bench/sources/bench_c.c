#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

long long fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

int main(int argc, char *argv[]) {
    if (argc < 2) { fprintf(stderr, "Usage: bench <test>\n"); return 1; }
    const char *test = argv[1];

    if (strcmp(test, "fib") == 0) {
        printf("%lld\n", fib(35));
    } else if (strcmp(test, "loop") == 0) {
        long long total = 0;
        for (long long i = 0; i < 100000000LL; i++) total += i;
        printf("%lld\n", total);
    } else if (strcmp(test, "array") == 0) {
        long long *arr = (long long *)malloc(1000000 * sizeof(long long));
        for (int i = 0; i < 1000000; i++) arr[i] = i;
        printf("%d\n", 1000000);
        free(arr);
    } else if (strcmp(test, "nested") == 0) {
        long long total = 0;
        for (int i = 0; i < 500; i++)
            for (int j = 0; j < 500; j++)
                total += (long long)i * j;
        printf("%lld\n", total);
    } else if (strcmp(test, "string") == 0) {
        char *s = (char *)malloc(100001);
        s[0] = '\0';
        int len = 0;
        for (int i = 0; i < 100000; i++) { s[len++] = 'a'; s[len] = '\0'; }
        printf("%d\n", len);
        free(s);
    } else if (strcmp(test, "math") == 0) {
        double total = 0.0;
        for (int i = 0; i < 1000000; i++) total += sqrt((double)(i + 1));
        printf("%.0f\n", total);
    }
    return 0;
}
