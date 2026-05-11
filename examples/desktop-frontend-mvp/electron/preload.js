const { contextBridge, ipcRenderer } = require('electron');

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

contextBridge.exposeInMainWorld('desktop', {
  openFile: () => ipcRenderer.invoke('desktop:openFile'),
  openFolder: () => ipcRenderer.invoke('desktop:openFolder'),
  saveFile: (path, content) => {
    if (typeof path !== 'string' || typeof content !== 'string') {
      return Promise.resolve({ ok: false, error: 'saveFile expects (string, string)' });
    }
    return ipcRenderer.invoke('desktop:saveFile', { path, content });
  },
  notify: (title, body) => {
    return ipcRenderer.invoke('desktop:notify', {
      title: safeString(title, 'SeedLang'),
      body: safeString(body, '')
    });
  },
  setLanguage: (lang) => ipcRenderer.invoke('desktop:setLanguage', lang),
  runCode: (code) => ipcRenderer.invoke('seedlang:run', safeString(code, ''))
});
