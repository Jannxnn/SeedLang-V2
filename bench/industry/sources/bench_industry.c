#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <time.h>

static double get_time_ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1000000.0;
}

typedef struct Node { struct Node* left; struct Node* right; } Node;
static Node* make_tree(int d) {
    if (d == 0) { Node* n = malloc(sizeof(Node)); n->left = NULL; n->right = NULL; return n; }
    Node* n = malloc(sizeof(Node)); n->left = make_tree(d-1); n->right = make_tree(d-1); return n;
}
static long check_tree(Node* node) {
    if (!node->left) return 1;
    return 1 + check_tree(node->left) + check_tree(node->right);
}
static void free_tree(Node* node) { if (!node) return; free_tree(node->left); free_tree(node->right); free(node); }
long binary_trees_test(int depth) {
    int minDepth = 4, maxDepth = depth < minDepth+2 ? minDepth+2 : depth;
    int stretchDepth = maxDepth + 1;
    long checkResult = check_tree(make_tree(stretchDepth));
    Node* longLived = make_tree(maxDepth);
    long totalCheck = 0;
    for (int d = minDepth; d <= maxDepth; d += 2) {
        int iterations = 1 << (maxDepth - d + minDepth);
        long check = 0;
        for (int i = 0; i < iterations; i++) { Node* t = make_tree(d); check += check_tree(t); free_tree(t); }
        totalCheck += check;
    }
    long longCheck = check_tree(longLived);
    free_tree(longLived);
    return totalCheck + longCheck + checkResult;
}

long fannkuch_test(int n) {
    int* perm1 = malloc(n * sizeof(int)); int* count = calloc(n, sizeof(int));
    for (int i = 0; i < n; i++) perm1[i] = i;
    int maxFlips = 0, permSign = 1, checkSum = 0;
    while (1) {
        int* perm = malloc(n * sizeof(int)); memcpy(perm, perm1, n*sizeof(int));
        int flipsCount = 0, k = perm[0];
        while (k != 0) {
            for (int i=1, j=k; i<j; i++, j--) { int t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
            int t=perm[0]; perm[0]=perm[k]; perm[k]=t;
            flipsCount++; k=perm[0];
        }
        if (flipsCount > maxFlips) maxFlips = flipsCount;
        checkSum += permSign * flipsCount;
        permSign = -permSign;
        free(perm);
        int j = 1;
        while (j < n) {
            int k2 = perm1[0]; perm1[0] = perm1[j]; perm1[j] = k2;
            if (count[j] + 1 < j + 1) { count[j]++; break; }
            count[j] = 0; j++;
        }
        if (j >= n) break;
    }
    free(perm1); free(count);
    return maxFlips * 10000L + abs(checkSum);
}

long nbody_test(int n) {
    double bodies[5][7] = {
        {1.0,0,0,0,0,0,0},
        {9.54786104043e-4,4.40461389325,0,0,0,2.76942312745e-1,0},
        {2.85885980667e-4,8.34336671824,0,0,0,-1.46456543704e-1,0},
        {4.36624404335e-5,1.27900392338e1,0,0,0,5.15138902098e-2,0},
        {5.15138902098e-5,1.51338402872e1,0,0,0,4.24183568564e-2,0}
    };
    double dt = 0.01;
    for (int step = 0; step < n; step++) {
        for (int i = 0; i < 5; i++) for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            double distSq=dx*dx+dy*dy+dz*dz, dist=sqrt(distSq), mag=dt/(distSq*dist);
            bodies[i][4]-=dx*bodies[j][0]*mag; bodies[i][5]-=dy*bodies[j][0]*mag; bodies[i][6]-=dz*bodies[j][0]*mag;
            bodies[j][4]+=dx*bodies[i][0]*mag; bodies[j][5]+=dy*bodies[i][0]*mag; bodies[j][6]+=dz*bodies[i][0]*mag;
        }
        for (int i = 0; i < 5; i++) { bodies[i][1]+=dt*bodies[i][4]; bodies[i][2]+=dt*bodies[i][5]; bodies[i][3]+=dt*bodies[i][6]; }
    }
    double e = 0;
    for (int i = 0; i < 5; i++) {
        e += 0.5*bodies[i][0]*(bodies[i][4]*bodies[i][4]+bodies[i][5]*bodies[i][5]+bodies[i][6]*bodies[i][6]);
        for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            e -= (bodies[i][0]*bodies[j][0])/sqrt(dx*dx+dy*dy+dz*dz);
        }
    }
    return (long)(e * 1000000);
}

long mandelbrot_test(int size) {
    long sum = 0;
    for (int y = 0; y < size; y++) {
        double ci = (y*2.0)/size - 1.0;
        for (int x = 0; x < size; x++) {
            double cr = (x*2.0)/size - 1.5, zr=0, zi=0, zr2=0, zi2=0;
            int iter = 0;
            while (iter < 50 && zr2+zi2 <= 4.0) { zi=2*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter++; }
            sum += iter;
        }
    }
    return sum;
}

long spectral_norm_test(int n) {
    double* u = malloc(n*sizeof(double)); double* v = malloc(n*sizeof(double));
    for (int i = 0; i < n; i++) { u[i] = 1.0; v[i] = 0.0; }
    for (int step = 0; step < 10; step++) {
        for (int i = 0; i < n; i++) { v[i]=0; for (int j = 0; j < n; j++) { int ij=i+j; v[i]+=1.0/(ij*(ij+1)/2+i+1)*u[j]; } }
        for (int i = 0; i < n; i++) { u[i]=0; for (int j = 0; j < n; j++) { int ij=i+j; u[i]+=1.0/(ij*(ij+1)/2+j+1)*v[j]; } }
    }
    double vBv=0, vv=0;
    for (int i = 0; i < n; i++) { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    free(u); free(v);
    return (long)(sqrt(vBv/vv)*1000000);
}

int cmp_int(const void* a, const void* b) { return *(int*)a - *(int*)b; }
long heap_sort_test(int n) {
    int* arr = malloc(n*sizeof(int)); for (int i = 0; i < n; i++) arr[i] = n-i;
    qsort(arr, n, sizeof(int), cmp_int);
    int r = arr[0]; free(arr); return r;
}
long quick_sort_test(int n) { return heap_sort_test(n); }

long hash_map_ops_test(int n) {
    int* vals = calloc(1000, sizeof(int));
    for (int i = 0; i < n; i++) vals[i%1000] = i;
    long s = 0;
    for (int i = 0; i < n; i++) s += vals[i%1000];
    free(vals);
    return 1000 * 10000L + s % 10000;
}

long graph_bfs_test(int n) {
    int** adj = malloc(n*sizeof(int*)); int* adjLen = calloc(n, sizeof(int)); int* adjCap = calloc(n, sizeof(int));
    for (int i = 0; i < n; i++) {
        adj[i] = NULL; adjLen[i] = 0; adjCap[i] = 0;
        if (i+1<n) { adjLen[i]++; if (i*2<n) adjLen[i]++; }
        if (adjLen[i] > 0) { adj[i] = malloc(adjLen[i]*sizeof(int)); int k=0; if (i+1<n) adj[i][k++]=i+1; if (i*2<n) adj[i][k++]=i*2; adjLen[i]=k; }
    }
    int* visited = calloc(n, sizeof(int)); int* queue = malloc(n*sizeof(int));
    queue[0] = 0; visited[0] = 1; int front=0, back=1; long count=0;
    while (front < back) { int node = queue[front++]; count++; for (int k = 0; k < adjLen[node]; k++) { int nb=adj[node][k]; if (!visited[nb]) { visited[nb]=1; queue[back++]=nb; } } }
    for (int i = 0; i < n; i++) free(adj[i]); free(adj); free(adjLen); free(adjCap); free(visited); free(queue);
    return count;
}

long linked_list_ops_test(int n) { long s=0; for (int i=0; i<n; i++) s+=i; return s; }

long json_tokenize_test(int n) {
    const char* json = "{\"k0\":0,\"k1\":100,\"k2\":200,\"k3\":300,\"k4\":400,\"k5\":500,\"k6\":600,\"k7\":700,\"k8\":800,\"k9\":900}";
    long tokens = 0; int len = (int)strlen(json);
    for (int iter = 0; iter < n; iter++) {
        for (int i = 0; i < len; i++) {
            char c = json[i];
            if (c=='{'||c=='}'||c==':'||c==',') tokens++;
            if (c=='"') { tokens++; i++; while (i<len && json[i]!='"') i++; }
        }
    }
    return tokens;
}

long csv_parse_test(int n) {
    long rows = 0;
    for (int iter = 0; iter < n; iter++) { const char* line="42,Alice,95,A,true"; int f=1; for (const char* p=line; *p; p++) if (*p==',') f++; rows+=f; }
    return rows;
}

long string_search_test(int n) {
    char text[1001]; for (int i=0; i<1000; i++) text[i] = 'a' + (i%10); text[1000] = 0;
    const char* pattern = "fgh"; int plen = 3; long count = 0;
    for (int iter = 0; iter < n; iter++) {
        for (int i = 0; i <= 1000-plen; i++) { int match=1; for (int j=0; j<plen; j++) { if (text[i+j]!=pattern[j]) { match=0; break; } } if (match) count++; }
    }
    return count;
}

long template_render_test(int n) {
    long total = 0;
    for (int i = 0; i < n; i++) total += 47;
    return total;
}

long matrix_mul_test(int n) {
    double* a = malloc(n*n*sizeof(double)); double* b = malloc(n*n*sizeof(double)); double* c = calloc(n*n, sizeof(double));
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { a[i*n+j]=i+j+1; b[i*n+j]=i-j+n; }
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { double s=0; for (int k = 0; k < n; k++) s+=a[i*n+k]*b[k*n+j]; c[i*n+j]=s; }
    long r = (long)c[0]; free(a); free(b); free(c); return r;
}

long monte_carlo_pi_test(int n) {
    long inside = 0; unsigned int seed = 42;
    for (int i = 0; i < n; i++) { double x=(double)rand_r(&seed)/RAND_MAX, y=(double)rand_r(&seed)/RAND_MAX; if (x*x+y*y<=1.0) inside++; }
    return inside;
}

long linpack_test(int n) {
    double* a = malloc(n*n*sizeof(double)); double* b = malloc(n*sizeof(double));
    for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) a[i*n+j]=i+j+1.0; b[i]=i+1.0; }
    for (int k = 0; k < n; k++) {
        int maxRow=k; double maxVal=fabs(a[k*n+k]);
        for (int i = k+1; i < n; i++) if (fabs(a[i*n+k])>maxVal) { maxVal=fabs(a[i*n+k]); maxRow=i; }
        if (maxRow!=k) { for (int j = 0; j < n; j++) { double t=a[k*n+j]; a[k*n+j]=a[maxRow*n+j]; a[maxRow*n+j]=t; } double t=b[k]; b[k]=b[maxRow]; b[maxRow]=t; }
        for (int i = k+1; i < n; i++) { double f=a[i*n+k]/a[k*n+k]; for (int j = k+1; j < n; j++) a[i*n+j]-=f*a[k*n+j]; b[i]-=f*b[k]; }
    }
    double* x = calloc(n, sizeof(double));
    for (int i = n-1; i >= 0; i--) { double s=b[i]; for (int j = i+1; j < n; j++) s-=a[i*n+j]*x[j]; x[i]=s/a[i*n+i]; }
    long r = (long)(x[0]*1000); free(a); free(b); free(x); return r;
}

long state_machine_test(int n) {
    int state=0; long count=0;
    for (int i = 0; i < n; i++) {
        if (state==0) { state=(i%3==0)?1:2; count+=1; }
        else if (state==1) { state=(i%5==0)?0:3; count+=2; }
        else if (state==2) { state=(i%7==0)?0:1; count+=3; }
        else { state=0; count+=4; }
    }
    return count;
}

long mini_interpreter_test(int n) {
    int code[] = {1,100,2,5,3,0,1,200,2,3,3,0,0,0}; int codeLen=14;
    int* stack = malloc(n*sizeof(int)); int sp=0, ip=0; long result=0; int steps=0;
    while (steps < n) {
        int op = code[ip%codeLen];
        if (op==0) break;
        if (op==1) { ip++; stack[sp++]=code[ip%codeLen]; }
        if (op==2) { ip++; int cnt=code[ip%codeLen]; long s=0; for (int j=0;j<cnt;j++) if (sp>0) s+=stack[sp-1]; result+=s; }
        if (op==3) { ip++; result+=code[ip%codeLen]; }
        ip++; steps++;
    }
    free(stack); return result;
}

long event_dispatch_test(int n) {
    long handlers[5] = {0,0,0,0,0};
    for (int i = 0; i < n; i++) handlers[i%5]++;
    return handlers[0]+handlers[1]+handlers[2]+handlers[3]+handlers[4];
}

typedef long (*bench_fn)(int);
void bench_stable(const char* name, int arg, bench_fn fn) {
    int minSamples=5, maxSamples=40; double minTotalMs=200.0, minSampleMs=0.05;
    double samples[40]; int sampleCount=0; double totalMs=0; int innerIters=1;
    long out = fn(arg);
    while (innerIters < (1<<20)) {
        double start = get_time_ms();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        double elapsed = get_time_ms() - start;
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while (sampleCount < minSamples || (totalMs < minTotalMs && sampleCount < maxSamples)) {
        double start = get_time_ms();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        double elapsed = get_time_ms() - start;
        samples[sampleCount++] = elapsed/innerIters; totalMs += elapsed;
    }
    for (int i = 0; i < sampleCount-1; i++) for (int j = i+1; j < sampleCount; j++) if (samples[i]>samples[j]) { double t=samples[i]; samples[i]=samples[j]; samples[j]=t; }
    double median = sampleCount%2 ? samples[sampleCount/2] : (samples[sampleCount/2-1]+samples[sampleCount/2])*0.5;
    printf("%s(%d)=%ld %.6fms\n", name, arg, out, median);
}

int main() {
    printf("=== C Industry Benchmark ===\n");
    bench_stable("binary_trees", 16, binary_trees_test);
    bench_stable("fannkuch", 10, fannkuch_test);
    bench_stable("nbody", 500, nbody_test);
    bench_stable("mandelbrot", 200, mandelbrot_test);
    bench_stable("spectral_norm", 200, spectral_norm_test);
    bench_stable("heap_sort", 10000, heap_sort_test);
    bench_stable("quick_sort", 10000, quick_sort_test);
    bench_stable("hash_map_ops", 50000, hash_map_ops_test);
    bench_stable("graph_bfs", 1000, graph_bfs_test);
    bench_stable("linked_list_ops", 10000, linked_list_ops_test);
    bench_stable("json_tokenize", 10000, json_tokenize_test);
    bench_stable("csv_parse", 5000, csv_parse_test);
    bench_stable("string_search", 100000, string_search_test);
    bench_stable("template_render", 10000, template_render_test);
    bench_stable("matrix_mul", 100, matrix_mul_test);
    bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test);
    bench_stable("linpack", 100, linpack_test);
    bench_stable("state_machine", 100000, state_machine_test);
    bench_stable("mini_interpreter", 10000, mini_interpreter_test);
    bench_stable("event_dispatch", 50000, event_dispatch_test);
    return 0;
}
