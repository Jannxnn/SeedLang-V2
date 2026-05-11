const LOCALES = {
  en: {
    app: { title: 'SeedLang IDE', route: 'Route', sidebarTitle: 'SeedLang' },
    nav: { home: 'Home', editor: 'Editor', settings: 'Settings' },
    actions: { openFile: 'Open File', saveFile: 'Save File', notify: 'Notify', commandPalette: 'Command Palette' },
    home: { title: 'SeedLang IDE', desc: 'Write, compile, and run SeedLang code with real-time output.', stateInfo: (t, a) => `Theme=${t} | AutoSave=${a ? 'on' : 'off'}` },
    editor: { title: 'Code Editor', noFile: 'No file opened.', newFile: 'New File', newFileName: 'Untitled.seed', placeholder: '// Write SeedLang code here...', runCode: 'Run Code', clearOutput: 'Clear Output', outputLabel: 'Output', outputHint: '// Click "Run Code" or press Ctrl+Enter to execute', selectWorkspace: 'Select Workspace', noWorkspace: 'No workspace' },
    output: { success: 'Success', error: 'Error', running: 'Running...' },
    examples: { hello: 'Hello World', helloDesc: 'Basic print and functions', fib: 'Fibonacci', fibDesc: 'Recursion and loops', cls: 'Class & OOP', clsDesc: 'Object-oriented programming', async: 'Async & Coro', asyncDesc: 'Async functions & coroutines', array: 'Array Ops', arrayDesc: 'map, filter, reduce', game: 'Game Logic', gameDesc: 'Game mechanics in SeedLang' },
    settings: { title: 'Settings', theme: 'Theme', themeDark: 'Dark', themeLight: 'Light', themeDesc: 'Choose your preferred color scheme', autoSave: 'Auto save (demo)', autoSaveDesc: 'Automatically save changes', language: 'Language / 语言', languageDesc: 'Select display language', langEn: 'English', langZh: '中文' },
    palette: { placeholder: 'Type command...', goHome: 'Go: Home', goEditor: 'Go: Editor', goSettings: 'Go: Settings', fileOpen: 'File: Open', fileSave: 'File: Save', appNotify: 'App: Notify' },
    notice: { noBridge: '[Desktop bridge unavailable] Running outside Electron', openFailed: e => `Open failed: ${e}`, needFileFirst: 'Open a file first.', saveFailed: e => `Save failed: ${e}`, saved: p => `Saved: ${p}`, editorNeedsFile: 'Editor requires a file. Use Open File first.', notifyBody: 'Desktop frontend bridge is working.' }
  },
  zh: {
    app: { title: 'SeedLang IDE', route: '路由', sidebarTitle: 'SeedLang' },
    nav: { home: '首页', editor: '编辑器', settings: '设置' },
    actions: { openFile: '打开文件', saveFile: '保存文件', notify: '通知', commandPalette: '命令面板' },
    home: { title: 'SeedLang IDE', desc: '编写、编译并运行 SeedLang 代码，实时查看输出结果。', stateInfo: (t, a) => `主题=${t} | 自动保存=${a ? '开' : '关'}` },
    editor: { title: '代码编辑器', noFile: '未打开任何文件。', newFile: '新建文件', newFileName: '未命名.seed', placeholder: '// 在此编写 SeedLang 代码...', runCode: '运行代码', clearOutput: '清空输出', outputLabel: '输出', outputHint: '// 点击"运行代码"或按 Ctrl+Enter 执行', selectWorkspace: '选择工作区', noWorkspace: '未选择工作区' },
    output: { success: '成功', error: '错误', running: '运行中...' },
    examples: { hello: 'Hello World', helloDesc: '基础 print 和函数', fib: '斐波那契', fibDesc: '递归与循环', cls: '类与面向对象', clsDesc: '面向对象编程', async: '异步与协程', asyncDesc: '异步函数与协程', array: '数组操作', arrayDesc: 'map、filter、reduce', game: '游戏逻辑', gameDesc: 'SeedLang 游戏机制' },
    settings: { title: '设置', theme: '主题', themeDark: '深色', themeLight: '浅色', themeDesc: '选择你喜欢的配色方案', autoSave: '自动保存（演示）', autoSaveDesc: '自动保存更改内容', language: 'Language / 语言', languageDesc: '选择显示语言', langEn: 'English', langZh: '中文' },
    palette: { placeholder: '输入命令...', goHome: '前往：首页', goEditor: '前往：编辑器', goSettings: '前往：设置', fileOpen: '文件：打开', fileSave: '文件：保存', appNotify: '应用：通知' },
    notice: { noBridge: '[桌面桥接不可用] 当前未在 Electron 中运行', openFailed: e => `打开失败：${e}`, needFileFirst: '请先打开一个文件。', saveFailed: e => `保存失败：${e}`, saved: p => `已保存：${p}`, editorNeedsFile: '编辑器需要先打开文件。请使用"打开文件"按钮。', notifyBody: '桌面前端桥接运行正常。' }
  }
};
let currentLang = 'en';
function t(key) {
  const keys = key.split('.');
  let val = LOCALES[currentLang];
  for (const k of keys) { if (val && typeof val === 'object' && k in val) val = val[k]; else return key; }
  return typeof val === 'function' ? val : (typeof val === 'string' ? val : key);
}
function setLanguage(lang) { if (LOCALES[lang]) currentLang = lang; }

function createStore(initialState) {
  const saved = {};
  try {
    const raw = localStorage.getItem('seedlang-store');
    if (raw) Object.assign(saved, JSON.parse(raw));
  } catch(e) {}
  const state = { ...initialState, ...saved };
  const listeners = [];
  function persist() { try { localStorage.setItem('seedlang-store', JSON.stringify(state)); } catch(e) {} }
  return {
    getState() { return state; },
    setState(patch) {
      Object.assign(state, patch);
      persist();
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.push(fn); fn(state); }
  };
}

const store = createStore({ route: 'home', currentPath: null, theme: 'dark', autoSave: false, lang: 'en', notice: '' });

function createRouter(store) {
  return {
    navigate(targetRoute) {
      const s = store.getState();
      if (targetRoute === 'editor' && !s.currentPath) { store.setState({ route: 'home', notice: t('notice.editorNeedsFile') }); return false; }
      store.setState({ route: targetRoute, notice: '' }); return true;
    }
  };
}
const router = createRouter(store);

const refs = {
  title: document.getElementById('title'),
  routeLabel: document.getElementById('routeLabel'),
  routeNotice: document.getElementById('routeNotice'),
  pathLabel: document.getElementById('pathLabel'),
  stateInfo: document.getElementById('stateInfo'),
  navButtons: Array.from(document.querySelectorAll('.nav-btn')),
  themeSelect: document.getElementById('themeSelect'),
  autoSaveToggle: document.getElementById('autoSaveToggle')
};

function renderViews(route) {
  ['home', 'editor', 'settings'].forEach(name => {
    const el = document.getElementById('view-' + name);
    if (el) el.classList.toggle('hidden', name !== route);
  });
}

function renderApp(s) {
  renderViews(s.route);
  refs.title.textContent = t('app.title');
  refs.routeLabel.textContent = t('app.route') + ': ' + s.route;
  refs.routeNotice.textContent = s.notice || '';
  document.body.dataset.theme = s.theme;
  refs.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.route === s.route));
  refs.stateInfo.textContent = t('home.stateInfo')(s.theme, s.autoSave);
  refs.pathLabel.querySelector('.path-text').textContent = s.currentPath || t('editor.noFile');
  refs.themeSelect.value = s.theme;
  refs.autoSaveToggle.checked = s.autoSave;
}

let commands = [];

function refreshCommands() {
  commands = [
    { id: 'go-home', title: t('palette.goHome'), run: () => router.navigate('home') },
    { id: 'go-editor', title: t('palette.goEditor'), run: () => router.navigate('editor') },
    { id: 'go-settings', title: t('palette.goSettings'), run: () => router.navigate('settings') },
    { id: 'open-file', title: t('palette.fileOpen'), run: () => openFile() },
    { id: 'save-file', title: t('palette.fileSave'), run: () => saveFile() },
    { id: 'notify', title: t('palette.appNotify'), run: () => doNotify() }
  ];
}

function applyI18n() {
  setLanguage(store.getState().lang);
  const logoText = document.querySelector('.logo-text');
  if (logoText) logoText.textContent = t('app.sidebarTitle');

  function setBtnText(id, textKey) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const icon = btn.querySelector('.btn-icon');
    btn.textContent = t(textKey);
    if (icon) btn.insertBefore(icon, btn.firstChild);
  }
  setBtnText('openBtn', 'actions.openFile');
  setBtnText('saveBtn', 'actions.saveFile');
  setBtnText('notifyBtn', 'actions.notify');
  setBtnText('commandBtn', 'actions.commandPalette');
  refs.navButtons[0].textContent = t('nav.home');
  refs.navButtons[1].textContent = t('nav.editor');
  refs.navButtons[2].textContent = t('nav.settings');
  document.getElementById('editor').placeholder = t('editor.placeholder');

  const s = store.getState();
  refs.title.textContent = t('app.title');
  const homeTitle = document.getElementById('homeTitle');
  if (homeTitle) homeTitle.textContent = t('home.title');
  const homeDesc = document.getElementById('homeDesc');
  if (homeDesc) homeDesc.textContent = t('home.desc');
  const editorTitle = document.getElementById('editorTitle');
  if (editorTitle) editorTitle.textContent = t('editor.title');
  const runBtnText = document.getElementById('runBtnText');
  if (runBtnText) runBtnText.textContent = t('editor.runCode');
  const clearBtn = document.getElementById('clearOutputBtn');
  if (clearBtn) clearBtn.textContent = t('editor.clearOutput');
  const newFileBtn = document.getElementById('newFileBtn');
  if (newFileBtn) newFileBtn.textContent = t('editor.newFile');
  const selectWorkspaceBtn = document.getElementById('selectWorkspaceBtn');
  if (selectWorkspaceBtn) selectWorkspaceBtn.textContent = t('editor.selectWorkspace');
  const outputLabel = document.getElementById('outputLabel');
  if (outputLabel) outputLabel.textContent = t('editor.outputLabel');
  document.querySelector('#view-settings h3').textContent = t('settings.title');
  const settingInfos = document.querySelectorAll('.setting-info');
  if (settingInfos[0]) { settingInfos[0].querySelector('strong').textContent = t('settings.theme'); settingInfos[0].querySelector('small').textContent = t('settings.themeDesc'); }
  const themeOpts = refs.themeSelect.options;
  themeOpts[0].text = t('settings.themeDark'); themeOpts[0].value = 'dark';
  themeOpts[1].text = t('settings.themeLight'); themeOpts[1].value = 'light';
  if (settingInfos[1]) { settingInfos[1].querySelector('strong').textContent = t('settings.autoSave'); settingInfos[1].querySelector('small').textContent = t('settings.autoSaveDesc'); }
  if (settingInfos[2]) { settingInfos[2].querySelector('strong').textContent = t('settings.language'); settingInfos[2].querySelector('small').textContent = t('settings.languageDesc'); }
  const exampleMap = [['hello','hello'],['fibonacci','fib'],['class','cls'],['async','async'],['array','array'],['game','game']];
  document.querySelectorAll('.example-card').forEach(card => {
    const key = card.dataset.example;
    const found = exampleMap.find(e => e[0] === key);
    if (found) {
      const strong = card.querySelector('strong');
      const small = card.querySelector('small');
      if (strong) strong.textContent = t('examples.' + found[1]);
      if (small) small.textContent = t('examples.' + found[1] + 'Desc');
    }
  });
  refreshCommands();
  if (typeof updateWorkspaceUI === 'function') updateWorkspaceUI();
}

const editor = document.getElementById('editor');
const lineNumbers = document.getElementById('lineNumbers');

function updateLineNumbers() {
  if (!editor || !lineNumbers) return;
  const lines = (editor.value || '').split('\n').length;
  let html = '';
  for (let i = 1; i <= lines; i++) html += '<span>' + i + '</span>';
  lineNumbers.innerHTML = html;
}

if (editor) {
  editor.addEventListener('input', updateLineNumbers);
  editor.addEventListener('scroll', () => { if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop; });
  updateLineNumbers();
}

const EXAMPLES = {
  hello: `// Hello World
fn greet(name) {
  print("Hello " + name + "! Welcome to SeedLang.")
}

greet("World")
greet("SeedLang")

x = 42
pi = 3.14159
print("The answer is " + x)
print("Pi is approximately " + pi)
print("abs(-7) = " + abs(-7))
print("sqrt(16) = " + sqrt(16))`,

  fibonacci: `// Fibonacci - Loops and iteration
fn fib(n) {
  a = 0
  b = 1
  i = 0
  while (i < n) {
    temp = a + b
    a = b
    b = temp
    i = i + 1
  }
  return b
}

print("=== Fibonacci Sequence ===")
fibs = []
for (i = 0; i < 12; i = i + 1) { push(fibs fib(i)) }
print("fib(0..11): " + fibs)

fn factorial(n) {
  result = 1
  i = 2
  while (i <= n) {
    result = result * i
    i = i + 1
  }
  return result
}
print("factorial(5) = " + factorial(5))
print("factorial(10) = " + factorial(10))`,

  cls: `// Class & OOP
class Animal {
  init(name sound) {
    this.name = name
    this.sound = sound
  }
  speak() {
    print(this.name + " says " + this.sound)
  }
}

class Dog extends Animal {
  init(name) {
    super.init(name "Woof!")
    this.tricks = []
  }
  learn(trick) {
    push(this.tricks trick)
    print(this.name + " learned: " + trick)
  }
  showTricks() {
    print(this.name + " tricks: " + len(this.tricks))
    for t in this.tricks { print("  - " + t) }
  }
}

dog = Dog("Buddy")
dog.speak()
dog.learn("sit")
dog.learn("fetch")
dog.learn("roll over")
dog.showTricks()

cat = Animal("Whiskers" "Meow!")
cat.speak()`,

  async: `// Async & Coro - Asynchronous and coroutines
async fn fetchData(url) {
  print("Fetching " + url + "...")
  result = "Data from " + url
  return result
}

coro countUp(n) {
  for (i = 1; i <= n; i = i + 1) {
    yield i
  }
}

print("=== Coroutine Output ===")
gen = countUp(5)
for v in gen { print("  yielded: " + v) }

print("")
print("=== Array Operations ===")
nums = [1 2 3 4 5]
doubled = map(nums (x) => x * 2)
print("Original: " + nums)
print("Doubled: " + doubled)

evens = filter(nums (x) => x % 2 == 0)
print("Evens: " + evens)

total = reduce(nums 0 (acc x) => acc + x)
print("Sum: " + total)`,

  array: `// Array Operations - map filter reduce sort
nums = [64 25 12 22 11 8 41 3 55 17]

print("Original: " + nums)
print("Length: " + len(nums))

squared = map(nums (x) => x * x)
print("Squared: " + squared)

big = filter(nums (x) => x > 20)
print("> 20: " + big)

sum = reduce(nums 0 (a b) => a + b)
print("Sum: " + sum)

sorted = sort(nums)
print("Sorted: " + sorted)

reversed = reverse(nums)
print("Reversed: " + reversed)

idx = indexOf(nums 41)
print("Index of 41: " + idx)

msg = "  Hello SeedLang World!  "
print("Trimmed: '" + trim(msg) + "'")
print("Upper: " + upper(msg))
print("Lower: " + lower(msg))
print("Length: " + len(msg))`,

  game: `// Game Logic - RPG battle system
class Character {
  init(name hp atk def) {
    this.name = name
    this.hp = hp
    this.maxHp = hp
    this.atk = atk
    this.def = def
    this.alive = true
  }
  takeDamage(dmg) {
    actual = max(0 dmg - this.def)
    this.hp = this.hp - actual
    print(this.name + " takes " + actual + " damage! HP: " + this.hp + "/" + this.maxHp)
    if (this.hp <= 0) {
      this.alive = false
      print(this.name + " has been defeated!")
    }
  }
  isAlive() { return this.alive }
}

class Hero extends Character {
  init(name) {
    super.init(name 100 25 5)
    this.level = 1
    this.xp = 0
  }
  gainXP(amount) {
    this.xp = this.xp + amount
    print(this.name + " gains " + amount + " XP! Total: " + this.xp)
    if (this.xp >= this.level * 100) {
      this.level = this.level + 1
      this.atk = this.atk + 5
      this.maxHp = this.maxHp + 20
      this.hp = this.maxHp
      print("*** LEVEL UP! *** " + this.name + " is now level " + this.level + "!")
    }
  }
}

class Monster extends Character {
  init(name hp atk) {
    super.init(name hp atk 2)
  }
}

print("=== Battle Start ===")
hero = Hero("Knight")
goblin = Monster("Goblin" 30 10)
orc = Monster("Orc" 60 18)

enemies = [goblin orc]

for enemy in enemies {
  print("")
  print("--- " + hero.name + " vs " + enemy.name + " ---")
  rounds = 0
  while (hero.isAlive() && enemy.isAlive()) {
    rounds = rounds + 1
    heroDmg = floor(random() * hero.atk) + 5
    enemyDmg = floor(random() * enemy.atk) + 3
    enemy.takeDamage(heroDmg)
    if (enemy.isAlive()) { hero.takeDamage(enemyDmg) }
    if (rounds > 20) { print("Draw!"); break }
  }
  if (hero.isAlive()) {
    xpGain = 50 * (indexOf(enemies enemy) + 1)
    hero.gainXP(xpGain)
  }
}

print("")
print("=== Battle End ===")
print(hero.name + " Lv." + hero.level + " | HP: " + hero.hp + "/" + hero.maxHp + " | XP: " + hero.xp)`
};

const outputArea = document.getElementById('outputArea');
const outputStatus = document.getElementById('outputStatus');

function setOutput(text, status) {
  if (!outputArea) return;
  outputArea.textContent = text;
  if (outputStatus) {
    outputStatus.textContent = status ? t('output.' + status) : '';
    outputStatus.className = 'output-status' + (status ? ' ' + status : '');
  }
}

function runSeedLangCode() {
  if (!editor) return;
  const code = editor.value.trim();
  if (!code) { setOutput(t('editor.outputHint'), ''); return; }

  setOutput('', 'running');

  if (hasDesktop && window.desktop.runCode) {
    window.desktop.runCode(code).then(result => {
      if (result.ok) {
        setOutput(result.output || '(no output)', 'success');
      } else {
        setOutput('Error: ' + (result.error || 'Unknown error'), 'error');
      }
      updateLineNumbers();
    }).catch(err => {
      setOutput('Error: ' + (err && err.message ? err.message : String(err)), 'error');
      updateLineNumbers();
    });
  } else {
    setTimeout(() => { setOutput('[SeedLang VM not available - run inside Electron]', 'error'); }, 100);
  }
}

document.getElementById('runBtn').addEventListener('click', runSeedLangCode);
document.getElementById('clearOutputBtn').addEventListener('click', () => { setOutput(t('editor.outputHint'), ''); });

let currentWorkspace = null;
let currentFilePath = null;

function updateWorkspaceUI() {
  const wsBar = document.querySelector('.workspace-bar');
  const wsPath = document.getElementById('workspacePath');
  const newFileBtn = document.getElementById('newFileBtn');
  if (wsBar && wsPath) {
    if (currentWorkspace) {
      wsBar.classList.add('has-workspace');
      const parts = currentWorkspace.replace(/\\/g, '/').split('/');
      wsPath.textContent = parts.length > 2 ? '.../' + parts.slice(-2).join('/') : currentWorkspace;
    } else {
      wsBar.classList.remove('has-workspace');
      wsPath.textContent = t('editor.noWorkspace');
    }
  }
  if (newFileBtn) newFileBtn.disabled = !currentWorkspace;
}

async function selectWorkspace() {
  if (!hasDesktop || !window.desktop.openFolder) return;
  const result = await window.desktop.openFolder();
  if (result && result.path) {
    currentWorkspace = result.path;
    updateWorkspaceUI();
  }
}

function newFile() {
  if (!editor) return;
  if (!currentWorkspace) { setOutput('[Select a workspace first]', 'error'); return; }
  editor.value = '';
  currentFilePath = null;
  setPathName(t('editor.newFileName'), false);
  setOutput(t('editor.outputHint'), '');
  updateLineNumbers();
}

function setPathName(name, isReal) {
  if (isReal) { currentFilePath = name; } else { currentFilePath = null; }
  const pathLabel = document.getElementById('pathLabel');
  if (!pathLabel) return;
  const textSpan = pathLabel.querySelector('.path-text');
  if (textSpan) textSpan.textContent = name;
}

function startRename() {
  const pathLabel = document.getElementById('pathLabel');
  if (!pathLabel || pathLabel.classList.contains('renaming')) return;
  const textSpan = pathLabel.querySelector('.path-text');
  const input = pathLabel.querySelector('.rename-input');
  if (!textSpan || !input) return;
  input.value = textSpan.textContent.replace(/\.seed$/, '');
  pathLabel.classList.add('renaming');
  input.focus();
  input.select();
}

function endRename(save) {
  const pathLabel = document.getElementById('pathLabel');
  if (!pathLabel) return;
  const textSpan = pathLabel.querySelector('.path-text');
  const input = pathLabel.querySelector('.rename-input');
  if (!textSpan || !input) return;
  if (save && input.value.trim()) {
    let name = input.value.trim();
    if (!name.endsWith('.seed')) name += '.seed';
    setPathName(name, false);
  }
  pathLabel.classList.remove('renaming');
}

document.getElementById('newFileBtn').addEventListener('click', newFile);
document.getElementById('selectWorkspaceBtn').addEventListener('click', selectWorkspace);
updateWorkspaceUI();

const pathLabelEl = document.getElementById('pathLabel');
if (pathLabelEl) {
  pathLabelEl.addEventListener('click', startRename);
  const renameInput = pathLabelEl.querySelector('.rename-input');
  if (renameInput) {
    renameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); endRename(true); }
      if (e.key === 'Escape') { e.preventDefault(); endRename(false); }
    });
    renameInput.addEventListener('blur', () => endRename(true));
  }
}

document.querySelectorAll('.example-card').forEach(card => {
  card.addEventListener('click', () => {
    const key = card.dataset.example;
    if (EXAMPLES[key] && editor) {
      editor.value = EXAMPLES[key];
      currentFilePath = null;
      setPathName('example: ' + key, false);
      setOutput(t('editor.outputHint'), '');
      updateLineNumbers();
      router.navigate('editor');
    }
  });
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const s = store.getState();
    if (s.route === 'editor') { e.preventDefault(); runSeedLangCode(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    const s = store.getState();
    if (s.route === 'editor') { e.preventDefault(); newFile(); }
  }
});

const hasDesktop = typeof window !== 'undefined' && typeof window.desktop === 'object';
const commandPalette = document.getElementById('commandPalette');
const commandInput = document.getElementById('commandInput');
const commandList = document.getElementById('commandList');

function renderPalette(filter) {
  const q = filter.trim().toLowerCase();
  const items = commands.filter(c => c.title.toLowerCase().includes(q));
  commandList.innerHTML = '';
  items.forEach(cmd => {
    const btn = document.createElement('button');
    btn.className = 'command-item'; btn.textContent = cmd.title;
    btn.addEventListener('click', async () => { await cmd.run(); togglePalette(false); });
    commandList.appendChild(btn);
  });
}

function togglePalette(show) {
  commandPalette.classList.toggle('hidden', !show);
  if (show) { commandInput.value = ''; renderPalette(''); commandInput.placeholder = t('palette.placeholder'); commandInput.focus(); }
}

async function openFile() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  const result = await window.desktop.openFile();
  if (!result) return;
  if (result.error) { store.setState({ notice: t('notice.openFailed')(result.error) }); return; }
  currentFilePath = result.path;
  store.setState({ currentPath: result.path, notice: '' });
  router.navigate('editor');
  document.getElementById('editor').value = result.content;
  setOutput(t('editor.outputHint'), '');
  updateLineNumbers();
}

async function saveFile() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  const s = store.getState();
  if (!s.currentPath) { store.setState({ notice: t('notice.needFileFirst') }); return; }
  const result = await window.desktop.saveFile(s.currentPath, document.getElementById('editor').value);
  if (!result.ok) { store.setState({ notice: t('notice.saveFailed')(result.error) }); return; }
  store.setState({ notice: t('notice.saved')(s.currentPath) });
}

async function doNotify() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  await window.desktop.notify('SeedLang', t('notice.notifyBody'));
}

refreshCommands();

document.getElementById('openBtn').addEventListener('click', openFile);
document.getElementById('saveBtn').addEventListener('click', saveFile);
document.getElementById('notifyBtn').addEventListener('click', doNotify);
document.getElementById('commandBtn').addEventListener('click', () => togglePalette(true));

refs.navButtons.forEach(btn => btn.addEventListener('click', () => router.navigate(btn.dataset.route)));

refs.themeSelect.addEventListener('change', () => store.setState({ theme: refs.themeSelect.value }));
refs.autoSaveToggle.addEventListener('change', () => store.setState({ autoSave: refs.autoSaveToggle.checked }));

const langSelect = document.getElementById('langSelect');
if (langSelect) {
  langSelect.addEventListener('change', () => {
    const newLang = langSelect.value;
    store.setState({ lang: newLang });
    document.title = 'SeedLang [' + newLang.toUpperCase() + ']';
  });
}

commandInput.addEventListener('input', () => renderPalette(commandInput.value));
commandPalette.addEventListener('click', e => { if (e.target === commandPalette) togglePalette(false); });

document.addEventListener('keydown', e => {
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); togglePalette(commandPalette.classList.contains('hidden')); }
  if (e.key === 'Escape') togglePalette(false);
});

let lastLang = store.getState().lang;
store.subscribe((s) => {
  if (s.lang !== lastLang) {
    lastLang = s.lang;
    applyI18n();
    if (hasDesktop) window.desktop.setLanguage(s.lang);
  }
  renderApp(s);
});
applyI18n();
document.title = 'SeedLang [' + currentLang.toUpperCase() + ']';
if (hasDesktop) window.desktop.setLanguage(currentLang);
window.__langChange = (lang) => { store.setState({ lang: lang }); };
