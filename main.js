const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(app.getPath('documents'), '知识管理系统数据'));
const dataDirectory = app.getPath('userData');
const dataFile = path.join(dataDirectory, 'knowledge-data.json');
const backupDataFile = path.join(dataDirectory, 'knowledge-data.backup.json');
const temporaryDataFile = path.join(dataDirectory, 'knowledge-data.tmp.json');
const imageDirectory = path.join(dataDirectory, 'images');
const ensureStorage = () => { fs.mkdirSync(imageDirectory, { recursive: true }); };
const safeImageName = id => `${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
const readValidData = file => {
  try { const content = fs.readFileSync(file, 'utf8'); JSON.parse(content); return content; }
  catch { return ''; }
};

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.loadFile(path.join(__dirname, '知识管理系统.html'));
}

ipcMain.on('storage:read-data', event => {
  event.returnValue = readValidData(dataFile) || readValidData(backupDataFile);
});
ipcMain.on('storage:write-data', (event, content) => {
  try {
    ensureStorage();
    const nextContent = String(content);
    JSON.parse(nextContent);
    if (readValidData(dataFile)) fs.copyFileSync(dataFile, backupDataFile);
    fs.writeFileSync(temporaryDataFile, nextContent, 'utf8');
    fs.renameSync(temporaryDataFile, dataFile);
    event.returnValue = true;
  }
  catch { event.returnValue = false; }
});
ipcMain.handle('storage:write-image', async (_event, id, bytes, mimeType) => {
  try { ensureStorage(); fs.writeFileSync(path.join(imageDirectory, safeImageName(id)), Buffer.from(bytes)); return { ok: true, mimeType: String(mimeType || 'image/jpeg') }; }
  catch { return { ok: false }; }
});
ipcMain.handle('storage:read-image', async (_event, id) => {
  try {
    const file = path.join(imageDirectory, safeImageName(id));
    if (!fs.existsSync(file)) return null;
    return { bytes: fs.readFileSync(file), mimeType: 'image/jpeg' };
  } catch { return null; }
});

app.whenReady().then(() => {
  ensureStorage();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
