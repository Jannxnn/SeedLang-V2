// Web 运行时场景测试：验证 WebRuntime 的 DOM 操作、事件处理、HTTP 请求、路由管理等 Web 特性

const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebRuntime } = require('../../dist/runtime/web.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg} Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(msg || 'Assertion failed');
    }
}

function runWebWithOutput(source) {
    const runtime = new WebRuntime();
    runtime.runWeb(source);
    return { runtime, output: runtime.getOutput() };
}

console.log('========================================');
console.log('  SeedLang Web Runtime Scenario Tests');
console.log('========================================\n');

test('template.render supports basic placeholder', () => {
    const { output } = runWebWithOutput(`
tpl = "Hello, {{name}}!"
result = template.render(tpl {name: "Seed"})
print(result)
`);
    assertEqual(output, ['Hello, Seed!']);
});

test('template.render supports nested placeholder', () => {
    const { output } = runWebWithOutput(`
tpl = "User: {{user.name}} / Role: {{user.role}}"
result = template.render(tpl {user: {name: "Alice" role: "admin"}})
print(result)
`);
    assertEqual(output, ['User: Alice / Role: admin']);
});

test('template.assetTag supports css/js', () => {
    const { output } = runWebWithOutput(`
cssTag = template.assetTag("css" "/app.css")
jsTag = template.assetTag("js" "/app.js")
print(cssTag)
print(jsTag)
`);
    assertEqual(output, [
        '<link rel="stylesheet" href="/app.css" />',
        '<script src="/app.js"></script>'
    ]);
});

test('setState/getState round-trip works', () => {
    const { output } = runWebWithOutput(`
setState("mode" "dev")
setState("count" 3)
print(getState("mode"))
print(getState("count"))
`);
    assertEqual(output, ['dev', '3']);
});

test('createElement + render returns html', () => {
    const { output } = runWebWithOutput(`
el = createElement("div" {id: "root" className: "app"} ["Hello"])
html = render(el)
print(html)
`);
    assertEqual(output, ['<div id="root" class="app">Hello</div>']);
});

test('window/location/document values are readable', () => {
    const { output } = runWebWithOutput(`
print(location.hostname)
print(window.innerWidth)
print(document.title)
`);
    assertEqual(output, ['localhost', '1024', 'SeedLang App']);
});

test('template.load and template.renderFile work with real file', () => {
    const tempFile = path.join(os.tmpdir(), `seed_web_tpl_${Date.now()}.html`);
    fs.writeFileSync(tempFile, 'Welcome {{user}} - {{site}}', 'utf8');
    const normalized = tempFile.replace(/\\/g, '/');

    try {
        const { output } = runWebWithOutput(`
raw = template.load("${normalized}")
rendered = template.renderFile("${normalized}" {user: "Bob" site: "Seed"})
print(raw)
print(rendered)
`);
        assertEqual(output, ['Welcome {{user}} - {{site}}', 'Welcome Bob - Seed']);
    } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
});

test('localStorage/sessionStorage/history APIs are callable', () => {
    const { output } = runWebWithOutput(`
localStorage.setItem("token" "abc")
sessionStorage.setItem("k" "v")
history.pushState("state" "title" "/dashboard")
print("ok")
`);
    assertEqual(output, ['ok']);
});

test('document helper calls are callable', () => {
    const { output } = runWebWithOutput(`
document.getElementById("root")
document.querySelector(".app")
print("done")
`);
    assertEqual(output, ['done']);
});

console.log('\n========================================');
console.log('           Test Summary');
console.log('========================================');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log('========================================');

if (failed > 0) {
    console.log('\nFailed tests:');
    for (const e of errors) {
        console.log(`  - ${e.name}: ${e.error}`);
    }
    process.exit(1);
} else {
    console.log('\n[SUCCESS] All Web runtime scenario tests passed!');
}
