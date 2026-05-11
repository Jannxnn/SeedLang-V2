const { app, BrowserWindow, ipcMain, dialog, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const vmPath = path.resolve(path.join(__dirname, '..', '..', '..', 'src', 'runtime', 'vm.js'));
let SeedLangVM = null;
try {
  const vmModule = require(vmPath);
  SeedLangVM = vmModule.SeedLangVM || vmModule.VM;
  console.log('[SeedLang] VM loaded from:', vmPath);
} catch(e) {
  console.error('[SeedLang] Could not load VM at', vmPath, ':', e.message);
}

const MENU_TEXTS = {
  en: {
    file: '&File',
    edit: '&Edit',
    view: '&View',
    window: '&Window',
    help: '&Help',
    open: 'Open File...',
    save: 'Save File...',
    quit: 'Quit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    reload: 'Reload',
    devTools: 'Toggle Developer Tools',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetZoom: 'Reset Zoom',
    fullscreen: 'Toggle Fullscreen',
    minimize: 'Minimize',
    close: 'Close',
    about: 'About SeedLang'
  },
  zh: {
    file: '文件(&F)',
    edit: '编辑(&E)',
    view: '视图(&V)',
    window: '窗口(&W)',
    help: '帮助(&H)',
    open: '打开文件...',
    save: '保存文件...',
    quit: '退出',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    reload: '重新加载',
    devTools: '切换开发者工具',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetZoom: '重置缩放',
    fullscreen: '切换全屏',
    minimize: '最小化',
    close: '关闭',
    about: '关于 SeedLang'
  }
};

let currentLang = 'en';
let mainWindow = null;

function buildMenu(lang) {
  const t = MENU_TEXTS[lang] || MENU_TEXTS.en;
  const template = [
    {
      label: t.file,
      submenu: [
        { label: t.open, accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu-action', 'open') },
        { label: t.save, accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-action', 'save') },
        { type: 'separator' },
        { label: process.platform === 'darwin' ? t.quit : '退出(&Q)', role: 'quit' }
      ]
    },
    {
      label: t.edit,
      submenu: [
        { label: t.undo, accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: t.redo, accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: t.cut, accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: t.copy, accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: t.paste, accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: t.selectAll, accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: t.view,
      submenu: [
        { label: t.reload, accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: t.devTools, accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t.zoomIn, accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: t.zoomOut, accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: t.resetZoom, accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: t.fullscreen, accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: t.window,
      submenu: [
        { label: t.minimize, accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: t.close, accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: t.help,
      submenu: [
        { label: t.about, click: () => { dialog.showMessageBoxSync(mainWindow, { title: 'SeedLang v0.4', message: 'SeedLang Desktop Frontend\nVersion 0.4\n\nA modern desktop app built with Electron.', type: 'info' }); } }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSavePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'payload must be an object';
  if (!isNonEmptyString(payload.path)) return 'path must be a non-empty string';
  if (typeof payload.content !== 'string') return 'content must be a string';
  return null;
}

function validateNotifyPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'payload must be an object';
  if (payload.title !== undefined && typeof payload.title !== 'string') return 'title must be a string';
  if (payload.body !== undefined && typeof payload.body !== 'string') return 'body must be a string';
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(buildMenu(currentLang));
  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.setContentSize(1080, 720);
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:openFile', async () => {
  try {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { path: filePath, content };
  } catch (err) { return { error: String(err) }; }
});

ipcMain.handle('desktop:openFolder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Workspace',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return { path: result.filePaths[0] };
  } catch (err) { return { error: String(err) }; }
});

ipcMain.handle('desktop:saveFile', async (_event, payload) => {
  const err = validateSavePayload(payload);
  if (err) return { ok: false, error: 'Invalid save payload: ' + err };
  try { fs.writeFileSync(payload.path, payload.content, 'utf-8'); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('desktop:notify', async (_event, payload) => {
  const err = validateNotifyPayload(payload);
  if (err) return { ok: false, error: 'Invalid notify payload: ' + err };
  if (Notification.isSupported()) new Notification({ title: payload.title || 'SeedLang', body: payload.body || '' }).show();
  return { ok: true, error: null };
});

ipcMain.handle('desktop:setLanguage', async (_event, lang) => {
  currentLang = lang || 'en';
  Menu.setApplicationMenu(buildMenu(currentLang));
  return { ok: true };
});

ipcMain.handle('seedlang:run', async (_event, code) => {
  if (!SeedLangVM) return { ok: false, error: 'SeedLang VM not loaded' };
  try {
    const vm = new SeedLangVM();
    const result = vm.run(code);
    if (result && result.success === false) {
      return {
        ok: false,
        error: result.error || 'Unknown runtime error',
        output: Array.isArray(result.output) ? result.output.join('\n') : ''
      };
    }

    // Prefer the run() return value; vm.vm.output is only a compatibility fallback.
    const outputLines = Array.isArray(result?.output)
      ? result.output
      : (Array.isArray(vm.vm?.output) ? vm.vm.output : []);
    const vmOut = outputLines.join('\n');
    return { ok: true, output: vmOut || '(no output)', lineCount: outputLines.length };
  } catch(err) {
    return { ok: false, error: err.message || String(err) };
  }
});
