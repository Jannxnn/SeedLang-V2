#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstring>
#include <vector>
#include <string>
#include <unordered_map>
#include <chrono>
#include <algorithm>

static double pi_val = 3.141592653589793;

int binary_trees_test(int depth) {
    struct Node { Node* left; Node* right; };
    auto make_tree = [](auto& self, int d) -> Node* {
        if (d == 0) return new Node{nullptr, nullptr};
        return new Node{self(self, d-1), self(self, d-1)};
    };
    auto check_tree = [](auto& self, Node* node) -> int {
        if (!node->left) return 1;
        return 1 + self(self, node->left) + self(self, node->right);
    };
    int minDepth = 4, maxDepth = std::max(depth, minDepth + 2);
    int stretchDepth = maxDepth + 1;
    int checkResult = check_tree(check_tree, make_tree(make_tree, stretchDepth));
    Node* longLived = make_tree(make_tree, maxDepth);
    int totalCheck = 0;
    for (int d = minDepth; d <= maxDepth; d += 2) {
        int iterations = 1 << (maxDepth - d + minDepth);
        int check = 0;
        for (int i = 0; i < iterations; i++) check += check_tree(check_tree, make_tree(make_tree, d));
        totalCheck += check;
    }
    int longCheck = check_tree(check_tree, longLived);
    return totalCheck + longCheck + checkResult;
}

int fannkuch_test(int n) {
    std::vector<int> perm1(n), count(n, 0);
    for (int i = 0; i < n; i++) perm1[i] = i;
    int maxFlips = 0, permSign = 1, checkSum = 0;
    while (true) {
        std::vector<int> perm = perm1;
        int flipsCount = 0, k = perm[0];
        while (k != 0) {
            for (int i = 1, j = k; i < j; i++, j--) { int t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
            int t = perm[0]; perm[0] = perm[k]; perm[k] = t;
            flipsCount++; k = perm[0];
        }
        if (flipsCount > maxFlips) maxFlips = flipsCount;
        checkSum += permSign * flipsCount;
        permSign = -permSign;
        int j = 1;
        while (j < n) {
            int k2 = perm1[0]; perm1[0] = perm1[j]; perm1[j] = k2;
            if (count[j] + 1 < j + 1) { count[j]++; break; }
            count[j] = 0; j++;
        }
        if (j >= n) break;
    }
    return maxFlips * 10000 + std::abs(checkSum);
}

int nbody_test(int n) {
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
            double distSq=dx*dx+dy*dy+dz*dz, dist=std::sqrt(distSq), mag=dt/(distSq*dist);
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
            e -= (bodies[i][0]*bodies[j][0])/std::sqrt(dx*dx+dy*dy+dz*dz);
        }
    }
    return (int)(e * 1000000);
}

int mandelbrot_test(int size) {
    int sum = 0;
    for (int y = 0; y < size; y++) {
        double ci = (y * 2.0) / size - 1.0;
        for (int x = 0; x < size; x++) {
            double cr = (x * 2.0) / size - 1.5, zr=0, zi=0, zr2=0, zi2=0;
            int iter = 0;
            while (iter < 50 && zr2+zi2 <= 4.0) { zi=2*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter++; }
            sum += iter;
        }
    }
    return sum;
}

int spectral_norm_test(int n) {
    auto a = [](int i, int j) -> double { int ij=i+j; return 1.0/(ij*(ij+1)/2+i+1); };
    std::vector<double> u(n,1.0), v(n,0.0);
    for (int step = 0; step < 10; step++) {
        for (int i = 0; i < n; i++) { v[i]=0; for (int j = 0; j < n; j++) v[i]+=a(i,j)*u[j]; }
        for (int i = 0; i < n; i++) { u[i]=0; for (int j = 0; j < n; j++) u[i]+=a(j,i)*v[j]; }
    }
    double vBv=0, vv=0;
    for (int i = 0; i < n; i++) { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    return (int)(std::sqrt(vBv/vv)*1000000);
}

int heap_sort_test(int n) {
    std::vector<int> arr(n); for (int i = 0; i < n; i++) arr[i] = n - i;
    std::make_heap(arr.begin(), arr.end());
    std::sort_heap(arr.begin(), arr.end());
    return arr[0];
}

int quick_sort_test(int n) {
    std::vector<int> arr(n); for (int i = 0; i < n; i++) arr[i] = n - i;
    std::sort(arr.begin(), arr.end());
    return arr[0];
}

int hash_map_ops_test(int n) {
    std::unordered_map<std::string, int> m;
    for (int i = 0; i < n; i++) { m[std::to_string(i%1000)] = i; }
    int s = 0;
    for (int i = 0; i < n; i++) { auto it = m.find(std::to_string(i%1000)); if (it != m.end()) s += it->second; }
    return (int)m.size() * 10000 + s % 10000;
}

int graph_bfs_test(int n) {
    std::vector<std::vector<int>> adj(n);
    for (int i = 0; i < n; i++) { if (i+1<n) adj[i].push_back(i+1); if (i*2<n) adj[i].push_back(i*2); }
    std::vector<bool> visited(n, false);
    std::vector<int> queue; queue.push_back(0); visited[0] = true;
    int count = 0, front = 0;
    while (front < (int)queue.size()) {
        int node = queue[front++]; count++;
        for (int nb : adj[node]) { if (!visited[nb]) { visited[nb] = true; queue.push_back(nb); } }
    }
    return count;
}

int linked_list_ops_test(int n) {
    struct Node { int val; Node* next; };
    Node* head = nullptr;
    for (int i = 0; i < n; i++) head = new Node{i, head};
    int s = 0; for (Node* c = head; c; c = c->next) s += c->val;
    return s;
}

int json_tokenize_test(int n) {
    std::string json = "{";
    for (int i = 0; i < 10; i++) {
        json += "\"k" + std::to_string(i) + "\":" + std::to_string(i*100);
        if (i < 9) json += ",";
    }
    json += "}";
    int tokens = 0;
    for (int iter = 0; iter < n; iter++) {
        for (size_t i = 0; i < json.size(); i++) {
            char c = json[i];
            if (c=='{'||c=='}'||c==':'||c==',') tokens++;
            if (c=='"') { tokens++; i++; while (i<json.size()&&json[i]!='"') i++; }
        }
    }
    return tokens;
}

int csv_parse_test(int n) {
    int rows = 0;
    for (int iter = 0; iter < n; iter++) {
        const char* line = "42,Alice,95,A,true";
        int fields = 1; for (const char* p = line; *p; p++) if (*p==',') fields++;
        rows += fields;
    }
    return rows;
}

int string_search_test(int n) {
    std::string text; for (int i = 0; i < 100; i++) text += "abcdefghij";
    std::string pattern = "fgh";
    int count = 0;
    for (int iter = 0; iter < n; iter++) {
        for (size_t i = 0; i <= text.size()-pattern.size(); i++) {
            bool match = true;
            for (size_t j = 0; j < pattern.size(); j++) { if (text[i+j]!=pattern[j]) { match=false; break; } }
            if (match) count++;
        }
    }
    return count;
}

int template_render_test(int n) {
    const char* tmpl = "Hello {name}! Your score is {score}. Status: {status}";
    int total = 0;
    for (int i = 0; i < n; i++) {
        std::string r = tmpl;
        size_t pos;
        while ((pos = r.find("{name}")) != std::string::npos) r.replace(pos, 6, "World");
        while ((pos = r.find("{score}")) != std::string::npos) r.replace(pos, 7, "100");
        while ((pos = r.find("{status}")) != std::string::npos) r.replace(pos, 8, "active");
        total += (int)r.size();
    }
    return total;
}

int matrix_mul_test(int n) {
    std::vector<std::vector<double>> a(n,std::vector<double>(n)), b(n,std::vector<double>(n)), c(n,std::vector<double>(n,0));
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { a[i][j]=i+j+1; b[i][j]=i-j+n; }
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { double s=0; for (int k = 0; k < n; k++) s+=a[i][k]*b[k][j]; c[i][j]=s; }
    return (int)c[0][0];
}

int monte_carlo_pi_test(int n) {
    int inside = 0;
    for (int i = 0; i < n; i++) { double x=(double)rand()/RAND_MAX, y=(double)rand()/RAND_MAX; if (x*x+y*y<=1.0) inside++; }
    return inside;
}

int linpack_test(int n) {
    std::vector<std::vector<double>> a(n,std::vector<double>(n));
    std::vector<double> b(n);
    for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) a[i][j]=i+j+1.0; b[i]=i+1.0; }
    for (int k = 0; k < n; k++) {
        int maxRow=k; double maxVal=fabs(a[k][k]);
        for (int i = k+1; i < n; i++) if (fabs(a[i][k])>maxVal) { maxVal=fabs(a[i][k]); maxRow=i; }
        if (maxRow!=k) { std::swap(a[k],a[maxRow]); std::swap(b[k],b[maxRow]); }
        for (int i = k+1; i < n; i++) { double f=a[i][k]/a[k][k]; for (int j = k+1; j < n; j++) a[i][j]-=f*a[k][j]; b[i]-=f*b[k]; }
    }
    std::vector<double> x(n,0);
    for (int i = n-1; i >= 0; i--) { double s=b[i]; for (int j = i+1; j < n; j++) s-=a[i][j]*x[j]; x[i]=s/a[i][i]; }
    return (int)(x[0]*1000);
}

int state_machine_test(int n) {
    int state=0, count=0;
    for (int i = 0; i < n; i++) {
        if (state==0) { state=(i%3==0)?1:2; count+=1; }
        else if (state==1) { state=(i%5==0)?0:3; count+=2; }
        else if (state==2) { state=(i%7==0)?0:1; count+=3; }
        else { state=0; count+=4; }
    }
    return count;
}

int mini_interpreter_test(int n) {
    int code[] = {1,100,2,5,3,0,1,200,2,3,3,0,0,0};
    int codeLen = 14;
    std::vector<int> stack; int ip=0, result=0, steps=0;
    while (steps < n) {
        int op = code[ip%codeLen];
        if (op==0) break;
        if (op==1) { ip++; stack.push_back(code[ip%codeLen]); }
        if (op==2) { ip++; int cnt=code[ip%codeLen]; int s=0; for (int j=0;j<cnt;j++) if (!stack.empty()) s+=stack.back(); result+=s; }
        if (op==3) { ip++; result+=code[ip%codeLen]; }
        ip++; steps++;
    }
    return result;
}

int event_dispatch_test(int n) {
    int handlers[5] = {0,0,0,0,0};
    for (int i = 0; i < n; i++) handlers[i%5]++;
    return handlers[0]+handlers[1]+handlers[2]+handlers[3]+handlers[4];
}

void bench_stable(const char* name, int arg, int (*fn)(int)) {
    const int minSamples=5, maxSamples=40;
    const double minTotalMs=200.0, minSampleMs=0.05;
    std::vector<double> samples; double totalMs=0; int innerIters=1;
    int out = fn(arg);
    while (innerIters < (1<<20)) {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        auto end = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(end-start).count();
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while ((int)samples.size() < minSamples || (totalMs < minTotalMs && (int)samples.size() < maxSamples)) {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        auto end = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(end-start).count();
        samples.push_back(elapsed/innerIters); totalMs += elapsed;
    }
    std::sort(samples.begin(), samples.end());
    double median = samples.size()%2 ? samples[samples.size()/2] : (samples[samples.size()/2-1]+samples[samples.size()/2])*0.5;
    printf("%s(%d)=%d %.6fms\n", name, arg, out, median);
}

int main() {
    printf("=== C++ Industry Benchmark ===\n");
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
