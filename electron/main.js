const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Prevent main process dialog crashes on non-fatal backend warnings
process.on('uncaughtException', (err) => {
  console.warn('[Main Process Warning]:', err.message || err);
});

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function updateSplashStatus(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status-update', message);
  }
}

function checkBackendHealth(retries = 30, delay = 800) {
  return new Promise((resolve) => {
    let attempts = 0;

    const interval = setInterval(() => {
      attempts++;
      updateSplashStatus(`Connecting to local AI engine (Attempt ${attempts}/${retries})...`);

      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      });

      req.on('error', () => {
        if (attempts >= retries) {
          clearInterval(interval);
          // Resolve anyway so window opens even if backend takes longer
          resolve(false);
        }
      });

      req.setTimeout(600, () => {
        req.destroy();
      });
    }, delay);
  });
}

function startBackend() {
  const isDev = !app.isPackaged;
  updateSplashStatus('Launching local Python FastAPI engine...');

  if (isDev) {
    // In local development, launch via local venv python
    const venvPython = process.platform === 'win32'
      ? path.join(__dirname, '..', 'backend', '.venv', 'Scripts', 'python.exe')
      : path.join(__dirname, '..', 'backend', '.venv', 'bin', 'python');

    const backendDir = path.join(__dirname, '..', 'backend');

    if (fs.existsSync(venvPython)) {
      try {
        backendProcess = spawn(
          venvPython,
          ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
          { cwd: backendDir, env: { ...process.env, PYTHONUNBUFFERED: '1' } }
        );

        backendProcess.on('error', (err) => console.warn('[Backend Spawn Info]:', err.message));
        backendProcess.stdout?.on('data', (data) => console.log(`[Backend]: ${data}`));
        backendProcess.stderr?.on('data', (data) => console.error(`[Backend Err]: ${data}`));
      } catch (err) {
        console.warn('Backend spawn error in dev mode (may already be running):', err);
      }
    }
  } else {
    // In production bundled package, run the compiled binary in extraResources
    const binaryName = process.platform === 'win32' ? 'ossilith-backend.exe' : 'ossilith-backend';
    const binaryPath = path.join(process.resourcesPath, 'backend', binaryName);

    if (fs.existsSync(binaryPath)) {
      try {
        backendProcess = spawn(binaryPath, [], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        backendProcess.on('error', (err) => console.warn('[Bundled Backend Info]:', err.message));
        backendProcess.stdout?.on('data', (data) => console.log(`[Backend]: ${data}`));
        backendProcess.stderr?.on('data', (data) => console.error(`[Backend Err]: ${data}`));
      } catch (err) {
        console.warn('Failed to spawn bundled backend binary:', err);
      }
    } else {
      console.log(`Standalone binary not bundled at ${binaryPath}. Connecting to running FastAPI service on port ${BACKEND_PORT}...`);
    }
  }
}


const CLOUD_TUNNEL_FALLBACK = 'https://ranging-washing-replace-marker.trycloudflare.com';


function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Ossilith Surgical CAD',
    backgroundColor: '#fffefc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webgl: true,
    },
  });

  const localUrl = `http://localhost:${FRONTEND_PORT}`;

  // Try loading local server first
  mainWindow.loadURL(localUrl).catch(() => {
    console.warn(`Local frontend not yet available at ${localUrl}. Trying fallback...`);
  });

  // Handle failed loads gracefully (prevent white screen)
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.warn(`Failed to load ${localUrl} (${errorCode}: ${errorDescription}). Attempting recovery...`);
    
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Retry local first
        http.get(localUrl, (res) => {
          if (res.statusCode === 200) {
            mainWindow.loadURL(localUrl);
          } else {
            mainWindow.loadURL(CLOUD_TUNNEL_FALLBACK);
          }
        }).on('error', () => {
          console.log(`Connecting to cloud interface at ${CLOUD_TUNNEL_FALLBACK}...`);
          mainWindow.loadURL(CLOUD_TUNNEL_FALLBACK);
        });
      }
    }, 1500);
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}


// ── Native IPC Handlers ─────────────────────────────────────

ipcMain.handle('select-dicom-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Patient DICOM Series Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

// ── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(async () => {
  createSplashWindow();
  startBackend();
  await checkBackendHealth();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

function cleanupBackend() {
  if (backendProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      console.warn('Error during backend cleanup:', e);
    }
    backendProcess = null;
  }
}

app.on('before-quit', cleanupBackend);

app.on('window-all-closed', () => {
  cleanupBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
