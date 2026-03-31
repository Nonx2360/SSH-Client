const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },

  // Profile management
  profiles: {
    load: () => ipcRenderer.invoke('profiles:load'),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),
  },

  // Settings
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings),
  },

  // File dialogs
  dialog: {
    openImage: () => ipcRenderer.invoke('dialog:openImage'),
    openKey: () => ipcRenderer.invoke('dialog:openKey'),
  },

  // SSH
  ssh: {
    connect: (tabId, profile) => ipcRenderer.invoke('ssh:connect', { tabId, profile }),
    send: (tabId, data) => ipcRenderer.send('ssh:send', { tabId, data }),
    resize: (tabId, cols, rows) => ipcRenderer.send('ssh:resize', { tabId, cols, rows }),
    disconnect: (tabId) => ipcRenderer.invoke('ssh:disconnect', tabId),
    onData: (tabId, callback) => {
      const channel = `ssh:data:${tabId}`;
      ipcRenderer.on(channel, (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners(channel);
    },
    onClosed: (tabId, callback) => {
      const channel = `ssh:closed:${tabId}`;
      ipcRenderer.once(channel, callback);
    }
  },

  // SFTP
  sftp: {
    list: (tabId, remotePath) => ipcRenderer.invoke('sftp:list', { tabId, remotePath }),
    download: (tabId, remotePath) => ipcRenderer.invoke('sftp:download', { tabId, remotePath }),
    upload: (tabId, remotePath) => ipcRenderer.invoke('sftp:upload', { tabId, remotePath }),
    delete: (tabId, remotePath, isDir) => ipcRenderer.invoke('sftp:delete', { tabId, remotePath, isDir }),
    mkdir: (tabId, remotePath) => ipcRenderer.invoke('sftp:mkdir', { tabId, remotePath }),
  }
});
