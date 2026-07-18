// macOS PREVIEW ONLY — not shipped to Tizen. An Electron window with an embedded
// browser that loads phimmoie.fm and injects the SAME userScript.js the TizenBrew
// mods module injects on the TV. Lets you verify the ad-block on your Mac first.
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  win.loadURL('https://phimmoie.fm/');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
