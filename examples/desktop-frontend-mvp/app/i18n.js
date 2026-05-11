const LOCALES = {
  en: {
    app: {
      title: 'SeedLang Desktop Frontend v0.4',
      route: 'Route',
      sidebarTitle: 'SeedLang'
    },
    nav: {
      home: 'Home',
      editor: 'Editor',
      settings: 'Settings'
    },
    actions: {
      openFile: 'Open File',
      saveFile: 'Save File',
      notify: 'Notify',
      commandPalette: 'Command Palette'
    },
    home: {
      overview: 'Overview',
      description: 'This is v0.4 scaffold with route pages and a route guard.',
      stateInfo: (theme, autoSave) => `Theme=${theme} | AutoSave=${autoSave ? 'on' : 'off'}`
    },
    editor: {
      title: 'Editor',
      noFile: 'No file opened.',
      placeholder: 'File content...'
    },
    settings: {
      title: 'Settings',
      theme: 'Theme',
      themeDark: 'Dark',
      themeLight: 'Light',
      autoSave: 'Auto save (demo)',
      language: 'Language / 语言',
      langEn: 'English',
      langZh: '中文'
    },
    palette: {
      placeholder: 'Type command...',
      goHome: 'Go: Home',
      goEditor: 'Go: Editor',
      goSettings: 'Go: Settings',
      fileOpen: 'File: Open',
      fileSave: 'File: Save',
      appNotify: 'App: Notify'
    },
    notice: {
      noBridge: '[Desktop bridge unavailable] Running outside Electron',
      openFailed: (err) => `Open failed: ${err}`,
      needFileFirst: 'Open a file first.',
      saveFailed: (err) => `Save failed: ${err}`,
      saved: (path) => `Saved: ${path}`,
      editorNeedsFile: 'Editor requires a file. Use Open File first.',
      notifyBody: 'Desktop frontend bridge is working.'
    }
  },
  zh: {
    app: {
      title: 'SeedLang 桌面前端 v0.4',
      route: '路由',
      sidebarTitle: 'SeedLang'
    },
    nav: {
      home: '首页',
      editor: '编辑器',
      settings: '设置'
    },
    actions: {
      openFile: '打开文件',
      saveFile: '保存文件',
      notify: '通知',
      commandPalette: '命令面板'
    },
    home: {
      overview: '概览',
      description: '这是 v0.4 版本，包含路由页面和路由守卫。',
      stateInfo: (theme, autoSave) => `主题=${theme} | 自动保存=${autoSave ? '开' : '关'}`
    },
    editor: {
      title: '编辑器',
      noFile: '未打开任何文件。',
      placeholder: '文件内容...'
    },
    settings: {
      title: '设置',
      theme: '主题',
      themeDark: '深色',
      themeLight: '浅色',
      autoSave: '自动保存（演示）',
      language: 'Language / 语言',
      langEn: 'English',
      langZh: '中文'
    },
    palette: {
      placeholder: '输入命令...',
      goHome: '前往：首页',
      goEditor: '前往：编辑器',
      goSettings: '前往：设置',
      fileOpen: '文件：打开',
      fileSave: '文件：保存',
      appNotify: '应用：通知'
    },
    notice: {
      noBridge: '[桌面桥接不可用] 当前未在 Electron 中运行',
      openFailed: (err) => `打开失败：${err}`,
      needFileFirst: '请先打开一个文件。',
      saveFailed: (err) => `保存失败：${err}`,
      saved: (path) => `已保存：${path}`,
      editorNeedsFile: '编辑器需要先打开文件。请使用"打开文件"按钮。',
      notifyBody: '桌面前端桥接运行正常。'
    }
  }
};

let currentLang = 'en';

export function t(key) {
  const keys = key.split('.');
  let val = LOCALES[currentLang];
  for (const k of keys) {
    if (val && typeof val === 'object' && k in val) { val = val[k]; } else { return key; }
  }
  return typeof val === 'function' ? val : (typeof val === 'string' ? val : key);
}

export function setLanguage(lang) {
  if (LOCALES[lang]) currentLang = lang;
}

export function getLanguage() {
  return currentLang;
}

export function getLocales() {
  return Object.keys(LOCALES);
}
