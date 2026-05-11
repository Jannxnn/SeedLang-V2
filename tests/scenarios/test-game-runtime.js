// 游戏运行时场景测试：验证 GameRuntime 的实体组件系统、碰撞检测、渲染管线、事件循环

const { GameRuntime } = require('../../dist/runtime/game.js');

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

function runGameWithRuntime(source) {
    const runtime = new GameRuntime();
    runtime.runGame(source);
    return runtime;
}

console.log('========================================');
console.log('  SeedLang Game Runtime Scenario Tests');
console.log('========================================\n');

test('scene.create + scene.load + scene.list works', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Level-1")
loaded = scene.load(sid)
allScenes = scene.list()
print(loaded)
print(len(allScenes))
`);
    assertEqual(runtime.getOutput(), ['true', '1']);
    assertTrue(runtime.getCurrentScene() !== null, 'current scene should be set');
});

test('physics.setGravity updates current scene gravity', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Gravity-Test")
scene.load(sid)
gy = 0 - 12.5
physics.setGravity(0 gy)
print("ok")
`);
    const scene = runtime.getScenes().get(runtime.getCurrentScene());
    assertTrue(!!scene, 'scene should exist');
    assertEqual(scene.gravity.x, 0);
    assertEqual(scene.gravity.y, -12.5);
});

test('entity.create attaches object to current scene', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Entity-Scene")
scene.load(sid)
eid = entity.create("Player" {position: {x: 2 y: 3 z: 4}})
print(eid)
`);
    const output = runtime.getOutput();
    assertEqual(output.length, 1);
    const entityId = output[0];
    const obj = runtime.getObjects().get(entityId);
    assertTrue(!!obj, 'entity should exist in object map');
    assertEqual(obj.position, { x: 2, y: 3, z: 4 });
});

test('entity.setPosition updates transform', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Move-Scene")
scene.load(sid)
eid = entity.create("NPC")
entity.setPosition(eid 10 20 30)
print(eid)
`);
    const entityId = runtime.getOutput()[0];
    const obj = runtime.getObjects().get(entityId);
    assertEqual(obj.position, { x: 10, y: 20, z: 30 });
});

test('physics.applyForce updates acceleration', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Force-Scene")
scene.load(sid)
eid = entity.create("Ball")
fy = 0 - 2
physics.applyForce(eid 3.5 fy)
print(eid)
`);
    const entityId = runtime.getOutput()[0];
    const obj = runtime.getObjects().get(entityId);
    assertEqual(obj.acceleration.x, 3.5);
    assertEqual(obj.acceleration.y, -2);
});

test('entity.destroy removes object', () => {
    const runtime = runGameWithRuntime(`
sid = scene.create("Destroy-Scene")
scene.load(sid)
eid = entity.create("Temp")
removed = entity.destroy(eid)
print(removed)
`);
    assertEqual(runtime.getOutput(), ['true']);
    assertEqual(runtime.getObjects().size, 0);
});

test('input/ui/camera/event APIs return expected values', () => {
    const runtime = runGameWithRuntime(`
print(input.isKeyDown("W"))
uiId = ui.createText("Hello" 10 20)
camOk = camera.setPosition(1 2 3)
eventOk = event.emit("spawned")
print(uiId)
print(camOk)
print(eventOk)
`);
    const output = runtime.getOutput();
    assertEqual(output[0], 'false');
    assertTrue(output[1].startsWith('ui_text_'), 'ui id should have ui_text_ prefix');
    assertEqual(output[2], 'true');
    assertEqual(output[3], 'true');
});

test('audio APIs are callable', () => {
    const runtime = runGameWithRuntime(`
musicOk = audio.playMusic("bgm-main")
soundId = audio.playSound("hit")
volOk = audio.setMasterVolume(0.6)
print(musicOk)
print(soundId)
print(volOk)
`);
    const output = runtime.getOutput();
    assertEqual(output[0], 'true');
    assertTrue(output[1].startsWith('sound_'), 'sound id should have sound_ prefix');
    assertEqual(output[2], 'true');
});

test('scene.load throws for unknown id', () => {
    let caught = false;
    try {
        runGameWithRuntime(`
scene.load("not-found")
`);
    } catch (e) {
        caught = true;
        assertTrue(String(e.message).includes('Scene not found'), 'should throw scene not found');
    }
    assertTrue(caught, 'error should be thrown');
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
    console.log('\n[SUCCESS] All Game runtime scenario tests passed!');
}
