import { createStore } from './store.js';
import { renderApp } from './views.js';
import { createCommands } from './commands.js';
import { createRouter } from './router.js';
import { t, setLanguage } from './i18n.js';

const store = createStore({
  route: 'home',
  currentPath: null,
  theme: 'dark',
  autoSave: false,
  lang: 'en',
  notice: ''
});
const router = createRouter(store);

const openBtn = document.getElementById('openBtn');
const saveBtn = document.getElementById('saveBtn');
const notifyBtn = document.getElementById('notifyBtn');
const commandBtn = document.getElementById('commandBtn');
const pathLabel = document.getElementById('pathLabel');
const editor = document.getElementById('editor');
const title = document.getElementById('title');
const routeLabel = document.getElementById('routeLabel');
const routeNotice = document.getElementById('routeNotice');
const stateInfo = document.getElementById('stateInfo');
const themeSelect = document.getElementById('themeSelect');
const autoSaveToggle = document.getElementById('autoSaveToggle');
const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
const commandPalette = document.getElementById('commandPalette');
const commandInput = document.getElementById('commandInput');
const commandList = document.getElementById('commandList');

const refs = {
  title,
  routeLabel,
  routeNotice,
  pathLabel,
  stateInfo,
  navButtons,
  themeSelect,
  autoSaveToggle
};

function renderPalette(filter = '') {
  const q = filter.trim().toLowerCase();
  const items = commands.filter((c) => c.title.toLowerCase().includes(q));
  commandList.innerHTML = '';
  items.forEach((cmd) => {
    const btn = document.createElement('button');
    btn.className = 'command-item';
    btn.textContent = cmd.title;
    btn.addEventListener('click', async () => {
      await cmd.run();
      togglePalette(false);
    });
    commandList.appendChild(btn);
  });
}

function togglePalette(show) {
  commandPalette.classList.toggle('hidden', !show);
  if (show) {
    commandInput.value = '';
    renderPalette('');
    commandInput.placeholder = t('palette.placeholder');
    commandInput.focus();
  }
}

function applyI18n() {
  const s = store.getState();
  setLanguage(s.lang);
  document.querySelector('.sidebar h2').textContent = t('app.sidebarTitle');
  openBtn.textContent = t('actions.openFile');
  saveBtn.textContent = t('actions.saveFile');
  notifyBtn.textContent = t('actions.notify');
  commandBtn.textContent = t('actions.commandPalette');
  navButtons[0].textContent = t('nav.home');
  navButtons[1].textContent = t('nav.editor');
  navButtons[2].textContent = t('nav.settings');
  editor.placeholder = t('editor.placeholder');
  store.setState({});
}

const hasDesktop = typeof window !== 'undefined' && typeof window.desktop === 'object';

async function openFile() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  const result = await window.desktop.openFile();
  if (!result) return;
  if (result.error) {
    store.setState({ notice: t('notice.openFailed')(result.error) });
    return;
  }
  store.setState({ currentPath: result.path, notice: '' });
  router.navigate('editor');
  editor.value = result.content;
}

async function saveFile() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  const state = store.getState();
  if (!state.currentPath) {
    store.setState({ notice: t('notice.needFileFirst') });
    return;
  }
  const result = await window.desktop.saveFile(state.currentPath, editor.value);
  if (!result.ok) {
    store.setState({ notice: t('notice.saveFailed')(result.error) });
    return;
  }
  store.setState({ notice: t('notice.saved')(state.currentPath) });
}

async function notify() {
  if (!hasDesktop) { store.setState({ notice: t('notice.noBridge') }); return; }
  await window.desktop.notify('SeedLang', t('notice.notifyBody'));
}

const commands = createCommands(
  { openFile, saveFile, notify },
  (route) => router.navigate(route)
);

openBtn.addEventListener('click', openFile);
saveBtn.addEventListener('click', saveFile);
notifyBtn.addEventListener('click', notify);
commandBtn.addEventListener('click', () => togglePalette(true));

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    router.navigate(btn.dataset.route);
  });
});

themeSelect.addEventListener('change', () => store.setState({ theme: themeSelect.value }));
autoSaveToggle.addEventListener('change', () => store.setState({ autoSave: autoSaveToggle.checked }));

let langSelect = null;

document.addEventListener('keydown', (event) => {
  const isK = event.key.toLowerCase() === 'k';
  const hasShortcut = event.ctrlKey || event.metaKey;
  if (isK && hasShortcut) {
    event.preventDefault();
    togglePalette(commandPalette.classList.contains('hidden'));
  }
  if (event.key === 'Escape') togglePalette(false);
});

commandInput.addEventListener('input', () => renderPalette(commandInput.value));
commandPalette.addEventListener('click', (event) => {
  if (event.target === commandPalette) togglePalette(false);
});

store.subscribe((s) => {
  if (langSelect && langSelect.value !== s.lang) {
    langSelect.value = s.lang;
    applyI18n();
  }
  renderApp(s, refs);
});

setTimeout(() => {
  langSelect = document.getElementById('langSelect');
  if (langSelect) {
    langSelect.addEventListener('change', () => store.setState({ lang: langSelect.value }));
    applyI18n();
  }
}, 0);
