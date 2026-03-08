import path from 'path'
import { app, ipcMain, session, shell, Tray, Menu, nativeImage, BrowserWindow, Notification, globalShortcut } from 'electron'
import { createWindow } from './helpers'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import fs from 'fs'
import http from 'http'

const isProd = process.env.NODE_ENV === 'production'

// FIX: Allow cookies in iframes for local development (SameSite issue)
// This solves the infinite challenge loop when the site is embedded in the app
app.commandLine.appendSwitch('disable-features', 'SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure');

// --- Custom Protocol: bloumechat:// ---
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bloumechat', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('bloumechat')
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// Determine config path
const configPath = path.join(__dirname, '../config.json');

let appConfig: Record<string, string> = {}
try {
  appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (e) {
  console.error("No config.json found or invalid format.")
}

// Persistent settings store
const settingsStore = new Store<{
  autoLaunch: boolean
  zoomLevel: number
  wasMaximized: boolean
  trayNoticeShown: boolean
}>({ name: 'bloumechat-settings' })

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let server: http.Server | null = null;
let prodPort: number = 0;
let isAppQuitting = false;

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
        reject(err);
      } else {
        reject(err);
      }
    });
  });
}

// --- Handle deep link from protocol (bloumechat://channel/xxx) ---
function handleDeepLink(url: string) {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()

  // Parse the protocol URL: bloumechat://channel/<publicId> or bloumechat://server/<publicId>
  try {
    const parsed = new URL(url)
    const action = parsed.hostname // 'channel', 'server', etc.
    const id = parsed.pathname.replace(/^\//, '')

    if (action && id) {
      mainWindow.webContents.send('deep-link', { action, id })
    }
  } catch (e) {
    console.error('Failed to parse deep link:', url)
  }
}

// --- Auto-launch helper ---
function setAutoLaunch(enable: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
    args: ['--hidden']
  })
  settingsStore.set('autoLaunch', enable)
}

// --- Build tray context menu (dynamic for auto-launch toggle) ---
function buildTrayMenu() {
  const isAutoLaunch = settingsStore.get('autoLaunch', false)

  return Menu.buildFromTemplate([
    { label: 'Ouvrir BloumeChat', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    {
      label: 'Lancer au démarrage',
      type: 'checkbox',
      checked: isAutoLaunch,
      click: (menuItem) => {
        setAutoLaunch(menuItem.checked)
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    { type: 'separator' },
    { label: 'Vérifier les mises à jour', click: () => autoUpdater.checkForUpdatesAndNotify() },
    { label: 'Recharger', click: () => mainWindow?.webContents.reload() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { isAppQuitting = true; app.quit() } }
  ])
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
      webSecurity: true,
      devTools: false
    },
  })

  // --- Restore maximized state ---
  if (settingsStore.get('wasMaximized', false)) {
    mainWindow.maximize()
  }

  // --- Restore zoom level ---
  const savedZoom = settingsStore.get('zoomLevel', 0)
  mainWindow.webContents.setZoomLevel(savedZoom)

  // --- Tray Setup ---
  const trayIconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = isProd
    ? path.join(process.resourcesPath, trayIconFile)
    : path.join(app.getAppPath(), 'resources', trayIconFile)
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 })
  tray = new Tray(trayIcon)
  tray.setToolTip('BloumeChat')
  tray.setContextMenu(buildTrayMenu())

  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.focus()
    else mainWindow?.show()
  })

  if (isProd) {
    await mainWindow.loadURL(`http://127.0.0.1:${prodPort}/home`)
  } else {
    const devPort = process.argv[2] || 8899;
    await mainWindow.loadURL(`http://localhost:${devPort}/home`)
  }

  // --- Handle Links and Navigation ---
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

  // --- Notification bridge with taskbar flash ---
  ipcMain.on('show-notification', (event, data: { title: string; body: string; icon?: string; channelPublicId: string; serverPublicId?: string }) => {
    const notification = new Notification({
      title: data.title,
      body: data.body,
      icon: data.icon ? nativeImage.createFromDataURL(data.icon) : undefined
    })

    // Flash taskbar when app is not focused
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true)
    }

    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.flashFrame(false) // Stop flashing on click
      mainWindow?.webContents.send('notification-click', {
        channelPublicId: data.channelPublicId,
        serverPublicId: data.serverPublicId
      })
    })

    notification.show()
  })

  // --- Unread badge count from iframe ---
  ipcMain.on('set-badge-count', (_event, count: number) => {
    if (process.platform === 'win32' && mainWindow) {
      if (count > 0) {
        const badgeIcon = createBadgeIcon(count)
        if (badgeIcon) {
          mainWindow.setOverlayIcon(badgeIcon, `${count} message(s) non lu(s)`)
        }
      } else {
        mainWindow.setOverlayIcon(null, '')
      }
    }
    app.setBadgeCount(count)
  })

  // Stop flashing when window is focused
  mainWindow.on('focus', () => {
    mainWindow?.flashFrame(false)
  })

  // --- Global Shortcut: Ctrl+Shift+B to toggle BloumeChat ---
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (mainWindow?.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  // --- Zoom: Ctrl+Plus / Ctrl+Minus / Ctrl+0 ---
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && !input.shift) {
      if (input.key === '=' || input.key === '+') {
        event.preventDefault()
        const current = mainWindow?.webContents.getZoomLevel() || 0
        const newZoom = Math.min(current + 0.5, 5)
        mainWindow?.webContents.setZoomLevel(newZoom)
        settingsStore.set('zoomLevel', newZoom)
      } else if (input.key === '-') {
        event.preventDefault()
        const current = mainWindow?.webContents.getZoomLevel() || 0
        const newZoom = Math.max(current - 0.5, -3)
        mainWindow?.webContents.setZoomLevel(newZoom)
        settingsStore.set('zoomLevel', newZoom)
      } else if (input.key === '0') {
        event.preventDefault()
        mainWindow?.webContents.setZoomLevel(0)
        settingsStore.set('zoomLevel', 0)
      }
    }
  })

  autoUpdater.checkForUpdatesAndNotify()

  app.on('before-quit', () => { isAppQuitting = true })

  // --- Save maximized state & show tray notice on close ---
  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault()

      // Save maximized state before hiding
      settingsStore.set('wasMaximized', mainWindow?.isMaximized() || false)

      mainWindow?.hide()

      // Show tray notification only the first time
      if (!settingsStore.get('trayNoticeShown', false)) {
        tray?.displayBalloon({
          iconType: 'info',
          title: 'BloumeChat',
          content: 'BloumeChat continue de tourner en arrière-plan. Cliquez sur l\'icône pour rouvrir.',
        })
        settingsStore.set('trayNoticeShown', true)
      }
    }
  })

  // --- Handle --hidden flag (auto-launch starts hidden) ---
  if (process.argv.includes('--hidden')) {
    mainWindow.hide()
  }

})()

// --- Handle second instance (single instance lock + deep link) ---
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  // Handle deep link from second instance
  const deepLinkUrl = commandLine.find(arg => arg.startsWith('bloumechat://'))
  if (deepLinkUrl) {
    handleDeepLink(deepLinkUrl)
  }
})

// Handle deep link on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.on('window-minimize', () => { BrowserWindow.getFocusedWindow()?.minimize() })
ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.on('window-close', () => { BrowserWindow.getFocusedWindow()?.close() })
ipcMain.handle('get-env', (event, key: string) => appConfig[key] || process.env[key])

// --- Auto-Launch IPC ---
ipcMain.handle('get-auto-launch', () => settingsStore.get('autoLaunch', false))
ipcMain.on('set-auto-launch', (_event, enable: boolean) => setAutoLaunch(enable))

// --- Zoom IPC ---
ipcMain.handle('get-zoom-level', () => mainWindow?.webContents.getZoomLevel() || 0)

// --- Auto-Updater IPC Bridge ---
let isUpdateIgnored = false;

autoUpdater.on('checking-for-update', () => mainWindow?.webContents.send('update-status', { status: 'checking' }))
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  mainWindow?.webContents.send('update-status', { status: 'available', info });

  if (isUpdateIgnored) return;

  // Automatic redirect to update page ONLY if not already there
  const currentUrl = mainWindow?.webContents.getURL();
  if (currentUrl && !currentUrl.includes('/update')) {
    const port = isProd ? prodPort : (process.argv[2] || 8899);
    const updateUrl = isProd
      ? `http://127.0.0.1:${port}/update`
      : `http://localhost:${port}/update`;
    mainWindow?.loadURL(updateUrl);
  }
})

ipcMain.on('ignore-update', () => {
  isUpdateIgnored = true;
})
autoUpdater.on('update-not-available', (info) => mainWindow?.webContents.send('update-status', { status: 'not-available', info }))
autoUpdater.on('error', (err) => mainWindow?.webContents.send('update-status', { status: 'error', message: err.message }))
autoUpdater.on('download-progress', (progressObj) => mainWindow?.webContents.send('update-status', { status: 'downloading', progress: progressObj }))
autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('update-status', { status: 'downloaded', info }))
ipcMain.on('quit-and-install', () => { autoUpdater.quitAndInstall() })
ipcMain.on('check-for-updates', () => { autoUpdater.checkForUpdatesAndNotify() })
ipcMain.on('simulate-update', () => {
  mainWindow?.webContents.send('update-status', {
    status: 'available',
    info: { version: '9.9.9' }
  })
})

// --- Badge Icon Generator (SVG-based, no native deps) ---
function createBadgeIcon(count: number): Electron.NativeImage | null {
  try {
    const label = count > 99 ? '99+' : String(count)
    const size = 16
    const fontSize = label.length > 2 ? 8 : 10

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#e53e3e"/>
        <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
              fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="${fontSize}">
          ${label}
        </text>
      </svg>
    `.trim()

    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    return nativeImage.createFromDataURL(dataUrl)
  } catch (e) {
    console.error('Failed to create badge icon:', e)
    return null
  }
}
