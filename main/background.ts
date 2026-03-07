import path from 'path'
import { app, ipcMain, session, shell, Tray, Menu, nativeImage, BrowserWindow, Notification } from 'electron'
import { createWindow } from './helpers'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import http from 'http'

const isProd = process.env.NODE_ENV === 'production'

// FIX: Allow cookies in iframes for local development (SameSite issue)
// This solves the infinite challenge loop when the site is embedded in the app
app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');

// Determine config path
const configPath = path.join(__dirname, '../config.json');

let appConfig: Record<string, string> = {}
try {
  appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (e) {
  console.error("No config.json found or invalid format.")
}

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let server: http.Server | null = null;
let prodPort: number = 0;

if (!isProd) {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const PROD_PORT = 15999; // Fixed port for stable Origin and data persistence

async function startLocalServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let pathname = new URL(req.url || '', `http://${req.headers.host}`).pathname;

      // Normalize pathname for Next.js static export
      if (pathname === '/' || pathname === '') pathname = '/home/index.html';
      else if (pathname === '/home' || pathname === '/home/') pathname = '/home/index.html';
      else if (pathname === '/update' || pathname === '/update/') pathname = '/update/index.html';
      else if (!pathname.includes('.')) {
        if (fs.existsSync(path.join(__dirname, pathname + '.html'))) {
          pathname += '.html';
        } else if (fs.existsSync(path.join(__dirname, pathname + '/index.html'))) {
          pathname += '/index.html';
        }
      }

      const filePath = path.join(__dirname, pathname);
      const extname = String(path.extname(filePath)).toLowerCase();
      const contentType = MIME_TYPES[extname] || 'application/octet-stream';

      fs.readFile(filePath, (error, content) => {
        if (error) {
          if (error.code === 'ENOENT') {
            res.writeHead(404);
            res.end('File not found');
          } else {
            res.writeHead(500);
            res.end('Internal server error: ' + error.code);
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(PROD_PORT, '127.0.0.1', () => {
      console.log(`Production server running at http://127.0.0.1:${PROD_PORT}`);
      resolve(PROD_PORT);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PROD_PORT} is already in use. Persistence might be affected if we fallback.`);
        // Note: In a real app we might try another port, but for Bloumechat consistency we want this one.
        reject(err);
      } else {
        reject(err);
      }
    });
  });
}

; (async () => {
  await app.whenReady()

  if (isProd) {
    prodPort = await startLocalServer();
  }

  // Define allowed media permissions
  const allowedPermissions = ['media', 'mediaKeySystem', 'display-capture', 'notifications', 'fullscreen']

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return allowedPermissions.includes(permission)
  })

  mainWindow = createWindow('main', {
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:main',
      webSecurity: true
    },
  })

  // Tray Setup
  const iconPath = path.join(__dirname, '../resources/icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Ouvrir Bloumechat', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() }
  ])
  tray.setToolTip('Bloumechat')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.focus()
    else mainWindow?.show()
  })

  if (isProd) {
    await mainWindow.loadURL(`http://127.0.0.1:${prodPort}/home`)
  } else {
    const devPort = process.argv[2] || 8899;
    await mainWindow.loadURL(`http://localhost:${devPort}/home`)
    mainWindow.webContents.openDevTools()
  }

  // Handle Links and Navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const port = isProd ? prodPort : (process.argv[2] || 8899);
    const origin = `http://127.0.0.1:${port}`;
    const localOrigin = `http://localhost:${port}`;

    if (url.startsWith('https:') || url.startsWith('http:')) {
      if (!url.startsWith(origin) && !url.startsWith(localOrigin)) {
        shell.openExternal(url)
        return { action: 'deny' }
      }
    }
    return { action: 'allow' }
  })

  // Event bridge for notifications click
  ipcMain.on('show-notification', (event, data: { title: string; body: string; icon?: string; channelPublicId: string; serverPublicId?: string }) => {
    const notification = new Notification({
      title: data.title,
      body: data.body,
      icon: data.icon ? nativeImage.createFromDataURL(data.icon) : undefined
    })

    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('notification-click', {
        channelPublicId: data.channelPublicId,
        serverPublicId: data.serverPublicId
      })
    })

    notification.show()
  })

  autoUpdater.checkForUpdatesAndNotify()

  let isAppQuitting = false
  app.on('before-quit', () => { isAppQuitting = true })

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

})()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window-minimize', () => { BrowserWindow.getFocusedWindow()?.minimize() })
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.on('window-close', () => { BrowserWindow.getFocusedWindow()?.close() })
ipcMain.handle('get-env', (event, key: string) => appConfig[key] || process.env[key])

// --- Auto-Updater IPC Bridge ---
autoUpdater.on('checking-for-update', () => mainWindow?.webContents.send('update-status', { status: 'checking' }))
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  mainWindow?.webContents.send('update-status', { status: 'available', info });
  // Automatic redirect to update page
  const port = isProd ? prodPort : (process.argv[2] || 8899);
  const updateUrl = isProd
    ? `http://127.0.0.1:${port}/update`
    : `http://localhost:${port}/update`;
  mainWindow?.loadURL(updateUrl);
})
autoUpdater.on('update-not-available', (info) => mainWindow?.webContents.send('update-status', { status: 'not-available', info }))
autoUpdater.on('error', (err) => mainWindow?.webContents.send('update-status', { status: 'error', message: err.message }))
autoUpdater.on('download-progress', (progressObj) => mainWindow?.webContents.send('update-status', { status: 'downloading', progress: progressObj }))
autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update-status', { status: 'downloaded', info }))
ipcMain.on('quit-and-install', () => { autoUpdater.quitAndInstall() })
ipcMain.on('check-for-updates', () => { autoUpdater.checkForUpdatesAndNotify() })
