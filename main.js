const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client } = require('ssh2');
const Store = require('electron-store');
const crypto = require('crypto');

// ─── Encryption helpers ───────────────────────────────────────────────────────
// Derive a 32-byte key via SHA-256 so length is always correct
const ENCRYPTION_KEY = crypto.createHash('sha256').update('sakura-ssh-secret-key').digest();
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  // ENCRYPTION_KEY is already a Buffer from sha256 digest — use it directly
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text; // Return as-is if decryption fails (legacy plain text)
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────
const store = new Store({
  name: 'sakura-ssh-data',
  defaults: {
    profiles: [],
    settings: {
      backgroundImage: null,
      fontsize: 14,
      showParticles: true,
      accentColor: '#FF9ECD'
    }
  }
});

// ─── Active SSH sessions ───────────────────────────────────────────────────────
const sessions = {}; // tabId -> { client, stream }

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0A0A1A',
    icon: path.join(__dirname, 'src', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Close all sessions
  Object.values(sessions).forEach(s => {
    try { s.stream?.end(); s.client?.end(); } catch (e) {}
  });
  app.quit();
});

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// ─── Profile IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('profiles:load', () => {
  return store.get('profiles', []);
});

ipcMain.handle('profiles:save', (_, profile) => {
  const profiles = store.get('profiles', []);
  const encProfile = {
    ...profile,
    password: encrypt(profile.password || ''),
    passphrase: encrypt(profile.passphrase || '')
  };
  if (profile.id) {
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx !== -1) profiles[idx] = encProfile;
    else profiles.push(encProfile);
  } else {
    encProfile.id = crypto.randomUUID();
    profiles.push(encProfile);
  }
  store.set('profiles', profiles);
  return encProfile;
});

ipcMain.handle('profiles:delete', (_, id) => {
  let profiles = store.get('profiles', []);
  profiles = profiles.filter(p => p.id !== id);
  store.set('profiles', profiles);
  return true;
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:load', () => {
  return store.get('settings');
});

ipcMain.handle('settings:save', (_, settings) => {
  store.set('settings', settings);
  return true;
});

// ─── File dialog IPC ──────────────────────────────────────────────────────────
ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Background Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const imgPath = result.filePaths[0];
  const data = fs.readFileSync(imgPath);
  const ext = path.extname(imgPath).substring(1);
  return `data:image/${ext};base64,` + data.toString('base64');
});

ipcMain.handle('dialog:openKey', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select SSH Private Key',
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ─── SSH Connect IPC ──────────────────────────────────────────────────────────
ipcMain.handle('ssh:connect', (event, { tabId, profile }) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    const connConfig = {
      host: profile.host,
      port: parseInt(profile.port) || 22,
      username: profile.username,
      readyTimeout: 20000,
      keepaliveInterval: 5000,
      // Broad algorithm support for compatibility with modern OpenSSH servers
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256',
          'diffie-hellman-group16-sha512',
          'diffie-hellman-group18-sha512',
          'diffie-hellman-group14-sha1',
        ],
        cipher: [
          'aes128-gcm@openssh.com',
          'aes256-gcm@openssh.com',
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes256-cbc',
          'aes128-cbc',
        ],
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa',
        ],
        hmac: [
          'hmac-sha2-256-etm@openssh.com',
          'hmac-sha2-512-etm@openssh.com',
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1',
        ],
      },
    };

    const password = decrypt(profile.password);
    const passphrase = decrypt(profile.passphrase);

    if (profile.authType === 'key' && profile.keyPath) {
      try {
        connConfig.privateKey = fs.readFileSync(profile.keyPath);
        if (passphrase) connConfig.passphrase = passphrase;
      } catch (e) {
        return reject(new Error('Cannot read key file: ' + e.message));
      }
    } else {
      connConfig.password = password;
    }

    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols: 80, rows: 30 }, (err, stream) => {
        if (err) {
          conn.end();
          return reject(new Error(err.message));
        }
        sessions[tabId] = { client: conn, stream };
        stream.on('data', (data) => {
          mainWindow.webContents.send(`ssh:data:${tabId}`, data.toString('binary'));
        });
        stream.stderr.on('data', (data) => {
          mainWindow.webContents.send(`ssh:data:${tabId}`, data.toString('binary'));
        });
        stream.on('close', () => {
          mainWindow.webContents.send(`ssh:closed:${tabId}`);
          delete sessions[tabId];
        });
        resolve({ success: true });
      });
    });

    conn.on('error', (err) => {
      reject(new Error(err.message));
    });

    conn.connect(connConfig);
  });
});

ipcMain.on('ssh:send', (_, { tabId, data }) => {
  const session = sessions[tabId];
  if (session && session.stream) {
    session.stream.write(data);
  }
});

ipcMain.on('ssh:resize', (_, { tabId, cols, rows }) => {
  const session = sessions[tabId];
  if (session && session.stream) {
    session.stream.setWindow(rows, cols, 0, 0);
  }
});

ipcMain.handle('ssh:disconnect', (_, tabId) => {
  const session = sessions[tabId];
  if (session) {
    try { session.stream?.end(); session.client?.end(); } catch (e) {}
    delete sessions[tabId];
  }
  return true;
});

// ─── SFTP IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('sftp:list', (_, { tabId, remotePath }) => {
  return new Promise((resolve, reject) => {
    const session = sessions[tabId];
    if (!session) return reject({ message: 'No active SSH session' });
    session.client.sftp((err, sftp) => {
      if (err) return reject({ message: err.message });
      sftp.readdir(remotePath, (err, list) => {
        if (err) return reject({ message: err.message });
        resolve(list.map(item => ({
          name: item.filename,
          longname: item.longname,
          isDir: item.attrs.isDirectory(),
          size: item.attrs.size,
          mtime: item.attrs.mtime,
          mode: item.attrs.mode
        })));
      });
    });
  });
});

ipcMain.handle('sftp:download', (_, { tabId, remotePath }) => {
  return new Promise(async (resolve, reject) => {
    const session = sessions[tabId];
    if (!session) return reject({ message: 'No active SSH session' });
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.basename(remotePath)
    });
    if (result.canceled) return resolve({ canceled: true });
    session.client.sftp((err, sftp) => {
      if (err) return reject({ message: err.message });
      sftp.fastGet(remotePath, result.filePath, (err) => {
        if (err) return reject({ message: err.message });
        resolve({ success: true, localPath: result.filePath });
      });
    });
  });
});

ipcMain.handle('sftp:upload', (_, { tabId, remotePath }) => {
  return new Promise(async (resolve, reject) => {
    const session = sessions[tabId];
    if (!session) return reject({ message: 'No active SSH session' });
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled) return resolve({ canceled: true });
    session.client.sftp((err, sftp) => {
      if (err) return reject({ message: err.message });
      const uploads = result.filePaths.map(localPath => {
        return new Promise((res, rej) => {
          const remoteFile = remotePath.endsWith('/') 
            ? remotePath + path.basename(localPath)
            : remotePath + '/' + path.basename(localPath);
          sftp.fastPut(localPath, remoteFile, (err) => {
            if (err) rej(err); else res(remoteFile);
          });
        });
      });
      Promise.all(uploads)
        .then(files => resolve({ success: true, files }))
        .catch(e => reject({ message: e.message }));
    });
  });
});

ipcMain.handle('sftp:delete', (_, { tabId, remotePath, isDir }) => {
  return new Promise((resolve, reject) => {
    const session = sessions[tabId];
    if (!session) return reject({ message: 'No active SSH session' });
    session.client.sftp((err, sftp) => {
      if (err) return reject({ message: err.message });
      const op = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp);
      op(remotePath, (err) => {
        if (err) return reject({ message: err.message });
        resolve({ success: true });
      });
    });
  });
});

ipcMain.handle('sftp:mkdir', (_, { tabId, remotePath }) => {
  return new Promise((resolve, reject) => {
    const session = sessions[tabId];
    if (!session) return reject({ message: 'No active SSH session' });
    session.client.sftp((err, sftp) => {
      if (err) return reject({ message: err.message });
      sftp.mkdir(remotePath, (err) => {
        if (err) return reject({ message: err.message });
        resolve({ success: true });
      });
    });
  });
});
