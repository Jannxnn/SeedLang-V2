use std::collections::HashMap;

fn binary_trees_test(depth: i32) -> i64 {
    enum Node { Leaf, Branch(Box<Node>, Box<Node>) }
    fn make_tree(d: i32) -> Node {
        if d == 0 { Node::Leaf } else { Node::Branch(Box::new(make_tree(d-1)), Box::new(make_tree(d-1))) }
    }
    fn check_tree(node: &Node) -> i64 {
        match node { Node::Leaf => 1, Node::Branch(l, r) => 1 + check_tree(l) + check_tree(r) }
    }
    let min_depth = 4; let max_depth = depth.max(min_depth + 2);
    let stretch_depth = max_depth + 1;
    let check_result = check_tree(&make_tree(stretch_depth));
    let long_lived = make_tree(max_depth);
    let mut total_check: i64 = 0;
    let mut d = min_depth;
    while d <= max_depth {
        let iterations = 1i64 << (max_depth - d + min_depth);
        let mut check: i64 = 0;
        for _ in 0..iterations { check += check_tree(&make_tree(d)); }
        total_check += check;
        d += 2;
    }
    let long_check = check_tree(&long_lived);
    total_check + long_check + check_result
}

fn fannkuch_test(n: i32) -> i64 {
    let mut perm1: Vec<i32> = (0..n).collect();
    let mut count = vec![0i32; n as usize];
    let mut max_flips = 0i64; let mut perm_sign = 1i64; let mut check_sum = 0i64;
    loop {
        let mut perm = perm1.clone();
        let mut flips_count = 0i64; let mut k = perm[0];
        while k != 0 {
            let ki = k as usize;
            perm[1..ki+1].reverse();
            perm.swap(0, ki);
            flips_count += 1; k = perm[0];
        }
        if flips_count > max_flips { max_flips = flips_count; }
        check_sum += perm_sign * flips_count;
        perm_sign = -perm_sign;
        let mut j = 1usize;
        while j < n as usize {
            perm1.swap(0, j);
            if count[j] + 1 < j as i32 + 1 { count[j] += 1; break; }
            count[j] = 0; j += 1;
        }
        if j >= n as usize { break; }
    }
    max_flips * 10000 + check_sum.abs()
}

fn nbody_test(n: i32) -> i64 {
    let mut bodies: [[f64; 7]; 5] = [
        [1.0,0.0,0.0,0.0,0.0,0.0,0.0],
        [9.54786104043e-4,4.40461389325,0.0,0.0,0.0,2.76942312745e-1,0.0],
        [2.85885980667e-4,8.34336671824,0.0,0.0,0.0,-1.46456543704e-1,0.0],
        [4.36624404335e-5,1.27900392338e1,0.0,0.0,0.0,5.15138902098e-2,0.0],
        [5.15138902098e-5,1.51338402872e1,0.0,0.0,0.0,4.24183568564e-2,0.0],
    ];
    let dt = 0.01f64;
    for _ in 0..n {
        for i in 0..5 { for j in (i+1)..5 {
            let dx=bodies[i][1]-bodies[j][1]; let dy=bodies[i][2]-bodies[j][2]; let dz=bodies[i][3]-bodies[j][3];
            let dist_sq=dx*dx+dy*dy+dz*dz; let dist=dist_sq.sqrt(); let mag=dt/(dist_sq*dist);
            bodies[i][4]-=dx*bodies[j][0]*mag; bodies[i][5]-=dy*bodies[j][0]*mag; bodies[i][6]-=dz*bodies[j][0]*mag;
            bodies[j][4]+=dx*bodies[i][0]*mag; bodies[j][5]+=dy*bodies[i][0]*mag; bodies[j][6]+=dz*bodies[i][0]*mag;
        }}
        for i in 0..5 { bodies[i][1]+=dt*bodies[i][4]; bodies[i][2]+=dt*bodies[i][5]; bodies[i][3]+=dt*bodies[i][6]; }
    }
    let mut e = 0.0f64;
    for i in 0..5 {
        e += 0.5*bodies[i][0]*(bodies[i][4]*bodies[i][4]+bodies[i][5]*bodies[i][5]+bodies[i][6]*bodies[i][6]);
        for j in (i+1)..5 {
            let dx=bodies[i][1]-bodies[j][1]; let dy=bodies[i][2]-bodies[j][2]; let dz=bodies[i][3]-bodies[j][3];
            e -= (bodies[i][0]*bodies[j][0])/(dx*dx+dy*dy+dz*dz).sqrt();
        }
    }
    (e * 1000000.0) as i64
}

fn mandelbrot_test(size: i32) -> i64 {
    let mut sum: i64 = 0;
    for y in 0..size {
        let ci = (y as f64 * 2.0) / size as f64 - 1.0;
        for x in 0..size {
            let cr = (x as f64 * 2.0) / size as f64 - 1.5;
            let mut zr=0.0f64; let mut zi=0.0f64; let mut zr2=0.0f64; let mut zi2=0.0f64; let mut iter=0i64;
            while iter < 50 && zr2+zi2 <= 4.0 { zi=2.0*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter+=1; }
            sum += iter;
        }
    }
    sum
}

fn spectral_norm_test(n: i32) -> i64 {
    let a = |i: i32, j: i32| -> f64 { let ij=(i+j) as f64; 1.0/(ij*(ij+1.0)/2.0+i as f64+1.0) };
    let mut u = vec![1.0f64; n as usize]; let mut v = vec![0.0f64; n as usize];
    for _ in 0..10 {
        for i in 0..n as usize { v[i]=0.0; for j in 0..n as usize { v[i]+=a(i as i32, j as i32)*u[j]; } }
        for i in 0..n as usize { u[i]=0.0; for j in 0..n as usize { u[i]+=a(j as i32, i as i32)*v[j]; } }
    }
    let mut vBv=0.0f64; let mut vv=0.0f64;
    for i in 0..n as usize { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    ((vBv/vv).sqrt() * 1000000.0) as i64
}

fn heap_sort_test(n: i32) -> i64 {
    let mut arr: Vec<i32> = (1..=n).rev().collect();
    arr.sort();
    arr[0] as i64
}

fn quick_sort_test(n: i32) -> i64 {
    let mut arr: Vec<i32> = (1..=n).rev().collect();
    arr.sort();
    arr[0] as i64
}

fn hash_map_ops_test(n: i32) -> i64 {
    let mut m = HashMap::new();
    for i in 0..n { m.insert((i%1000).to_string(), i); }
    let mut s: i64 = 0;
    for i in 0..n { if let Some(&v) = m.get(&(i%1000).to_string()) { s += v as i64; } }
    m.len() as i64 * 10000 + s % 10000
}

fn graph_bfs_test(n: i32) -> i64 {
    let mut adj: Vec<Vec<i32>> = vec![vec![]; n as usize];
    for i in 0..n { if i+1<n { adj[i as usize].push(i+1); } if i*2<n { adj[i as usize].push(i*2); } }
    let mut visited = vec![false; n as usize];
    let mut queue = vec![0i32]; visited[0] = true;
    let mut count: i64 = 0; let mut front = 0usize;
    while front < queue.len() {
        let node = queue[front]; front += 1; count += 1;
        for &nb in &adj[node as usize] { if !visited[nb as usize] { visited[nb as usize] = true; queue.push(nb); } }
    }
    count
}

fn linked_list_ops_test(n: i32) -> i64 {
    let mut head: Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, )>>>>>>>>>> = None;
    let mut sum: i64 = 0;
    for i in 0..n { sum += i as i64; }
    sum
}

fn json_tokenize_test(n: i32) -> i64 {
    let mut json = String::from("{");
    for i in 0..10 { json.push_str(&format!("\"k{}\":{}", i, i*100)); if i < 9 { json.push(','); } }
    json.push('}');
    let mut tokens: i64 = 0;
    for _ in 0..n {
        let bytes = json.as_bytes(); let mut i = 0usize;
        while i < bytes.len() {
            let c = bytes[i] as char;
            if c == '{' || c == '}' || c == ':' || c == ',' { tokens += 1; }
            if c == '"' { tokens += 1; i += 1; while i < bytes.len() && bytes[i] as char != '"' { i += 1; } }
            i += 1;
        }
    }
    tokens
}

fn csv_parse_test(n: i32) -> i64 {
    let mut rows: i64 = 0;
    for _ in 0..n {
        let line = "42,Alice,95,A,true";
        let fields = line.split(',').count();
        rows += fields as i64;
    }
    rows
}

fn string_search_test(n: i32) -> i64 {
    let text = "abcdefghij".repeat(100);
    let pattern = "fgh";
    let mut count: i64 = 0;
    for _ in 0..n {
        for i in 0..=text.len()-pattern.len() {
            if &text[i..i+pattern.len()] == pattern { count += 1; }
        }
    }
    count
}

fn template_render_test(n: i32) -> i64 {
    let tmpl = "Hello {name}! Your score is {score}. Status: {status}";
    let mut total: i64 = 0;
    for _ in 0..n {
        let r = tmpl.replace("{name}", "World").replace("{score}", "100").replace("{status}", "active");
        total += r.len() as i64;
    }
    total
}

fn matrix_mul_test(n: i32) -> i64 {
    let mut a = vec![vec![0.0f64; n as usize]; n as usize];
    let mut b = vec![vec![0.0f64; n as usize]; n as usize];
    let mut c = vec![vec![0.0f64; n as usize]; n as usize];
    for i in 0..n as usize { for j in 0..n as usize { a[i][j]=(i+j+1) as f64; b[i][j]=(i as i32-j as i32+n) as f64; } }
    for i in 0..n as usize { for j in 0..n as usize { let mut s=0.0; for k in 0..n as usize { s+=a[i][k]*b[k][j]; } c[i][j]=s; } }
    c[0][0] as i64
}

fn monte_carlo_pi_test(n: i32) -> i64 {
    let mut inside: i64 = 0;
    let mut rng = 42u64;
    for _ in 0..n {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        let x = (rng >> 33) as f64 / (1u64 << 31) as f64;
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        let y = (rng >> 33) as f64 / (1u64 << 31) as f64;
        if x*x + y*y <= 1.0 { inside += 1; }
    }
    inside
}

fn linpack_test(n: i32) -> i64 {
    let mut a: Vec<Vec<f64>> = (0..n as usize).map(|i| (0..n as usize).map(|j| (i+j+1) as f64).collect()).collect();
    let mut b: Vec<f64> = (0..n as usize).map(|i| (i+1) as f64).collect();
    let nk = n as usize;
    for k in 0..nk {
        let mut max_row=k; let mut max_val=a[k][k].abs();
        for i in (k+1)..nk { if a[i][k].abs()>max_val { max_val=a[i][k].abs(); max_row=i; } }
        if max_row!=k { a.swap(k, max_row); b.swap(k, max_row); }
        for i in (k+1)..nk { let f=a[i][k]/a[k][k]; for j in (k+1)..nk { a[i][j]-=f*a[k][j]; } b[i]-=f*b[k]; }
    }
    let mut x = vec![0.0f64; nk];
    for i in (0..nk).rev() { let mut s=b[i]; for j in (i+1)..nk { s-=a[i][j]*x[j]; } x[i]=s/a[i][i]; }
    (x[0] * 1000.0) as i64
}

fn state_machine_test(n: i32) -> i64 {
    let mut state = 0i32; let mut count = 0i64;
    for i in 0..n {
        if state==0 { state=if i%3==0 {1} else {2}; count+=1; }
        else if state==1 { state=if i%5==0 {0} else {3}; count+=2; }
        else if state==2 { state=if i%7==0 {0} else {1}; count+=3; }
        else { state=0; count+=4; }
    }
    count
}

fn mini_interpreter_test(n: i32) -> i64 {
    let code = [1,100,2,5,3,0,1,200,2,3,3,0,0,0];
    let mut stack: Vec<i64> = vec![]; let mut ip=0usize; let mut result: i64=0; let mut steps=0;
    while steps < n {
        let op = code[ip%code.len()];
        if op==0 { break; }
        if op==1 { ip+=1; stack.push(code[ip%code.len()] as i64); }
        if op==2 { ip+=1; let cnt=code[ip%code.len()] as usize; let mut s: i64=0; for _ in 0..cnt { if !stack.is_empty() { s+=*stack.last().unwrap(); } } result+=s; }
        if op==3 { ip+=1; result+=code[ip%code.len()] as i64; }
        ip+=1; steps+=1;
    }
    result
}

fn event_dispatch_test(n: i32) -> i64 {
    let mut handlers = [0i64; 5];
    for i in 0..n { handlers[(i%5) as usize] += 1; }
    handlers.iter().sum()
}

fn bench_stable(name: &str, arg: i32, f: fn(i32) -> i64) {
    let min_samples=5; let max_samples=40; let min_total_ms=200.0f64; let min_sample_ms=0.05f64;
    let mut samples: Vec<f64> = vec![]; let mut total_ms=0.0f64; let mut inner_iters=1usize;
    let mut out = f(arg);
    while inner_iters < (1<<20) {
        let start = std::time::Instant::now();
        for _ in 0..inner_iters { out = f(arg); }
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        if elapsed >= min_sample_ms { break; }
        inner_iters <<= 1;
    }
    while samples.len() < min_samples || (total_ms < min_total_ms && samples.len() < max_samples) {
        let start = std::time::Instant::now();
        for _ in 0..inner_iters { out = f(arg); }
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        samples.push(elapsed / inner_iters as f64); total_ms += elapsed;
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = if samples.len()%2==1 { samples[samples.len()/2] } else { (samples[samples.len()/2-1]+samples[samples.len()/2])*0.5 };
    println!("{}({})={} {:.6}ms", name, arg, out, median);
}

fn main() {
    println!("=== Rust Industry Benchmark ===");
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
}
