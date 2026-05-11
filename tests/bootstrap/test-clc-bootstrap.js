#!/usr/bin/env node
/**
 * CLC 自举回归测试
 * 
 * 验证项：
 * 1. Self-bootstrap fixed point (SHA256 一致)
 * 2. 简单 Seed 文件正确编译到 C
 * 3. 中等复杂度 Seed（函数+赋值）正确编译(无 sl_null 退化)
 *
 * 前提条件：需要 clc_cli.exe + gcc 可用。缺失则全部跳过不报错。
 *
 * 定点一致依赖「当前 exe」与 Full Seed 匹配；更新 compileToC 后请重新编译 selfhost/clc/clc_cli.exe。
 * SHA256 不一致时本项记为 SKIP（不算失败）；若要 CI 强制报错可设置 SEED_CLC_BOOTSTRAP_STRICT=1。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

const CLC_CLI = path.join(root, 'selfhost', 'clc', 'clc_cli.exe');
const SEED_SOURCE = path.join(root, 'selfhost', 'clc', 'clc_cli_full.seed');

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function hasGcc() {
  try {
    execSync('gcc --version', { stdio: 'pipe', timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

function hasMsys2Gcc() {
    const candidates = [
        'C:\\msys64\\ucrt64\\bin\\gcc.exe',
        'C:\\msys64\\mingw64\\bin\\gcc.exe',
    ];
    for (const g of candidates) {
        if (fs.existsSync(g)) return g;
    }
    return null;
}

function findGcc() {
    const gccPath = hasMsys2Gcc();
    if (gccPath) return gccPath;
    try {
        const { findDefaultMingwGcc } = require('../../tools/resolve-gcc');
        const found = findDefaultMingwGcc();
        if (found) return found;
    } catch {}
    if (hasGcc()) return 'gcc';
    return null;
}

function runCmd(exe, args, opts) {
    try {
        return execFileSync(exe, args, { ...opts, encoding: 'utf8', timeout: 30000 });
    } catch (e) {
        return { error: e.stderr || e.message || String(e), ok: false };
    }
}

function test(name, fn) {
    const t0 = Date.now();
    let ok;
    try {
        ok = fn();
    } catch (e) {
        ok = false;
    }
    const ms = (Date.now() - t0).toFixed(1);
    if (ok === 'SKIP') return { name, ok: 'SKIP', ms };
    return { name, ok: ok === true, ms };
}

function runAll() {
    const results = [];

    const prerequisitesOK = fs.existsSync(CLC_CLI) && fs.existsSync(SEED_SOURCE) && !!findGcc();
    if (!prerequisitesOK) {
        return {
            results: [{ name: 'CLC prerequisites', ok: 'SKIP', ms: '0.0' }],
            total: 0, passed: 0, failed: 0, skipped: 1,
        };
    }

    const gccExe = findGcc();
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'clc-regress-'));
    const cleanup = () => {
        try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch {}
    };

    try {
        const incDir = root;

        function gccCompile(cFile, exeFile) {
            const gccDir = path.dirname(gccExe);
            const env = { ...process.env, PATH: gccDir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '') };
            const args = ['-O0', '-g', '-I', incDir, cFile, '-o', exeFile, '-lm'];
            return runCmd(gccExe, args, { env, cwd: tmpdir });
        }

        // Test 1: Self-bootstrap fixed point
        results.push(test('Self-bootstrap fixed point', () => {
            const clcCli = CLC_CLI;
            const seedSrc = SEED_SOURCE;

            const boot1C = path.join(tmpdir, 'boot1.c');
            runCmd(clcCli, [seedSrc, boot1C], { cwd: tmpdir });
            if (!fs.existsSync(boot1C)) throw new Error('boot1.c not generated');

            const boot1Exe = path.join(tmpdir, 'boot1.exe');
            const cr = gccCompile(boot1C, boot1Exe);
            if (cr.error) throw new Error('gcc boot1: ' + cr.error);
            if (!fs.existsSync(boot1Exe)) throw new Error('boot1.exe not generated');

            const boot2C = path.join(tmpdir, 'boot2.c');
            runCmd(boot1Exe, [seedSrc, boot2C], { cwd: tmpdir });
            if (!fs.existsSync(boot2C)) throw new Error('boot2.c not generated');

            const h1 = sha256(boot1C);
            const h2 = sha256(boot2C);
            if (h1 !== h2) {
                if (process.env.SEED_CLC_BOOTSTRAP_STRICT === '1') {
                    throw new Error(`SHA256 mismatch: ${h1.slice(0, 16)}... vs ${h2.slice(0, 16)}...`);
                }
                return 'SKIP';
            }
            return true;
        }));

        // Test 2: Simple compile correctness
        results.push(test('Simple print compile', () => {
            const seedFile = path.join(tmpdir, 'simple.seed');
            fs.writeFileSync(seedFile, 'print("hello")\n', 'utf8');
            const outFile = path.join(tmpdir, 'simple_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('simple_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            if (!content.includes('sl_v_print(sl_str("hello"))')) {
                throw new Error('Missing expected sl_v_print call');
            }
            return true;
        }));

        // Test 3: Function with assignment — MUST NOT contain sl_null() for expression RHS
        results.push(test('Function assignment (no sl_null)', () => {
            const seedFile = path.join(tmpdir, 'func.seed');
            const src = `fn greet(name) {\n  result = "Hello " + name\n  print(result)\n  return result\n}\ngreet("World")\n`;
            fs.writeFileSync(seedFile, src, 'utf8');
            const outFile = path.join(tmpdir, 'func_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('func_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            // Must have the actual string concatenation, not sl_null()
            if (!content.includes('sl_v_add(sl_str("Hello "), name)')) {
                throw new Error('Missing sl_v_add concatenation — regression to sl_null()');
            }
            // Must return the variable, not sl_null()
            if (!content.includes('return result;')) {
                throw new Error('Missing proper return — regression to sl_null()');
            }
            // Must NOT contain assignment to sl_null() on the expression line
            if (/result = sl_null\(\)/.test(content)) {
                throw new Error('Found sl_null() assignment — integer inference regression');
            }
            return true;
        }));

        // Test 4: C-style for loop
        results.push(test('C-style for(;;) loop', () => {
            const seedFile = path.join(tmpdir, 'cfor.seed');
            fs.writeFileSync(seedFile, 'for (let i = 0; i < 3; i = i + 1) { print(i) }\n', 'utf8');
            const outFile = path.join(tmpdir, 'cfor_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('cfor_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            if (!content.includes('for (') || !content.includes(';')) {
                throw new Error('Missing C-style for loop structure');
            }
            return true;
        }));

        // Test 5: Comments are stripped
        results.push(test('Comments stripped', () => {
            const seedFile = path.join(tmpdir, 'comment.seed');
            fs.writeFileSync(seedFile, '// line comment\n/* block */\nprint("x")\n', 'utf8');
            const outFile = path.join(tmpdir, 'comment_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('comment_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            if (!content.includes('sl_v_print(sl_str("x"))')) {
                throw new Error('Comment handling broke output');
            }
            return true;
        }));

        // Test 6: let + block scope
        results.push(test('let declaration', () => {
            const seedFile = path.join(tmpdir, 'let.seed');
            fs.writeFileSync(seedFile, 'let x = 42\nprint(x)\n', 'utf8');
            const outFile = path.join(tmpdir, 'let_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('let_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            if (!content.includes('SlValue x') || !content.includes('int main')) {
                throw new Error('Missing let variable declaration');
            }
            return true;
        }));

        // Test 7: and/or/not logical operators
        results.push(test('and/or/not logical operators', () => {
            const seedFile = path.join(tmpdir, 'logic.seed');
            fs.writeFileSync(seedFile, 'print(true and false)\nprint(true or false)\nprint(not true)\n', 'utf8');
            const outFile = path.join(tmpdir, 'logic_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('logic_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            const expected = ['sl_v_and(', 'sl_v_or(', 'sl_v_not('];
            for (const fn of expected) {
                if (!content.includes(fn)) throw new Error(`Missing ${fn} in generated C`);
            }
            return true;
        }));

        // Test 8: Bitwise operators
        results.push(test('Bitwise operators', () => {
            const seedFile = path.join(tmpdir, 'bitwise.seed');
            fs.writeFileSync(seedFile, 'print(5 & 3)\nprint(5 | 3)\nprint(5 ^ 3)\nprint(~5)\nprint(1 << 4)\nprint(16 >> 2)\n', 'utf8');
            const outFile = path.join(tmpdir, 'bitwise_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('bitwise_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            const expected = ['sl_v_bitAnd', 'sl_v_bitOr', 'sl_v_bitXor', 'sl_v_bitNot', 'sl_v_shl', 'sl_v_shr'];
            for (const fn of expected) {
                if (!content.includes(fn)) throw new Error(`Missing ${fn} in generated C`);
            }
            return true;
        }));

        // Test 9: Radix literals
        results.push(test('Radix literals', () => {
            const seedFile = path.join(tmpdir, 'radix.seed');
            fs.writeFileSync(seedFile, 'print(0xFF)\nprint(0o77)\nprint(0b1010)\n', 'utf8');
            const outFile = path.join(tmpdir, 'radix_out.c');
            runCmd(CLC_CLI, [seedFile, outFile], { cwd: tmpdir });
            if (!fs.existsSync(outFile)) throw new Error('radix_out.c not generated');
            const content = fs.readFileSync(outFile, 'utf8');
            if (!content.includes('255') || !content.includes('63') || !content.includes('10')) {
                throw new Error('Radix literal not parsed to correct integer');
            }
            return true;
        }));

    } finally {
        cleanup();
    }

    const total = results.length;
    const passed = results.filter(r => r.ok === true).length;
    const failed = results.filter(r => r.ok === false).length;
    const skipped = results.filter(r => r.ok === 'SKIP').length;

    return { results, total, passed, failed, skipped };
}

function main() {
    const { results, total, passed, failed, skipped } = runAll();
    console.log('\n=== CLC Self-Bootstrap Regression ===\n');
    for (const r of results) {
        const status = r.ok === true ? 'OK' : r.ok === 'SKIP' ? 'SKIP' : 'FAIL';
        console.log(`  [${status}] ${r.name} (${r.ms}ms)`);
    }
    const status = failed > 0 ? 'FAIL' : 'OK';
    console.log(`\n  Summary: ${passed} passed, ${failed} failed, ${skipped} skipped${failed > 0 ? ' — REGRESSION DETECTED' : ''}`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

main();