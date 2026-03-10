import path from 'path'
import { app, ipcMain, session, shell, Tray, Menu, nativeImage, BrowserWindow, Notification, globalShortcut, clipboard } from 'electron'
import { createWindow } from './helpers'
import { autoUpdater } from 'electron-updater'
import Store from 'electron-store'
import fs from 'fs'
import http from 'http'

// --- Configuration Reading ---
const configPath = path.join(__dirname, '../config.json');
let appConfig: any = {}
try {
  appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
} catch (e) {
  console.error("No config.json found or invalid format.")
}

// Environment Determination (Prefer config.json, fallback to Node env)
const isProd = appConfig.IS_PROD !== undefined
  ? appConfig.IS_PROD === true || appConfig.IS_PROD === 'true'
  : process.env.NODE_ENV === 'production'

// Set Windows App User Model ID — controls the name shown in notifications
if (process.platform === 'win32') {
  app.setAppUserModelId('com.bloumechat.app')
}

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

    if (action) {
      // Pass both action, id, and any query parameters (like ?token=...)
      const queryParams = Object.fromEntries(parsed.searchParams.entries())
      mainWindow.webContents.send('deep-link', { action, id, queryParams })
    }
  } catch (e) {
    console.error('Failed to parse deep link:', url)
  }
}

// --- Auto-launch helper ---
function setAutoLaunch(enable: boolean) {
  try {
    const settings: any = {
      openAtLogin: enable,
      path: app.getPath('exe'),
      args: ['--hidden']
    }

    if (!app.isPackaged) {
      // In development, we need to pass the app path as the first argument to electron.exe
      settings.args = [app.getAppPath(), '--hidden']
    }

    app.setLoginItemSettings(settings)
    settingsStore.set('autoLaunch', enable)
  } catch (error) {
    console.error('Failed to set auto-launch:', error)
  }
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
  const allowedPermissions = [
    'media',
    'mediaKeySystem',
    'display-capture',
    'notifications',
    'fullscreen',
    'clipboard-read',
    'clipboard-sanitized-write'
  ]

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return allowedPermissions.includes(permission)
  })

  // Explicitly handle display capture requests (Screen Share)
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    // Automatically select the first available desktop (usually the entire screen)
    // In a full implementation, you'd show a custom picker UI, but this allows basic screen sharing
    import('electron').then(({ desktopCapturer }) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        // Just grab the first screen for simplicity, or find the primary display
        const screenSource = sources.find(s => s.id.startsWith('screen')) || sources[0]
        if (screenSource) {
          callback({ video: screenSource, audio: 'loopback' })
        } else {
          console.error("No screen sources found")
        }
      }).catch(err => {
        console.error("Failed to get desktop sources:", err)
      })
    })
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
      devTools: !isProd
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
  const isExternalUrl = (url: string) => {
    const port = isProd ? prodPort : (process.argv[2] || 8899);
    const origin = isProd ? `http://127.0.0.1:${port}` : `http://localhost:${port}`;
    const localOrigin = `http://127.0.0.1:${port}`;
    const remoteOrigin = appConfig.NEXT_PUBLIC_SITE_URL;

    // Check if it's a web link and NOT an internal or remote origin
    if (url.startsWith('https:') || url.startsWith('http:')) {
      const isInternal = url.startsWith(origin) || url.startsWith(localOrigin);
      const isRemote = remoteOrigin && url.startsWith(remoteOrigin);
      return !isInternal && !isRemote;
    }
    return false;
  };

  // Handle window.location.href changes (Top-level navigation)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle navigations within iframes (e.g., Stripe Redirects)
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (isExternalUrl(event.url)) {
      event.preventDefault();
      shell.openExternal(event.url);
    }
  });

  // Handle window.open and target="_blank"
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // --- Notification bridge with taskbar flash ---
  const appIconPath = isProd
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')
  const appIcon = nativeImage.createFromPath(appIconPath)

  ipcMain.on('show-notification', (event, data: { title: string; body: string; icon?: string; channelPublicId: string; serverPublicId?: string; authorPublicId?: string }) => {
    const notification = new Notification({
      title: data.title,
      body: data.body,
      icon: data.icon ? nativeImage.createFromDataURL(data.icon) : appIcon
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
        serverPublicId: data.serverPublicId,
        authorPublicId: data.authorPublicId
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

  // --- Heal / Apply Auto-Launch Settings on Startup ---
  // This ensures the registry path is updated if the app was moved or updated
  const storedAutoLaunch = settingsStore.get('autoLaunch', false)
  if (storedAutoLaunch) {
    setAutoLaunch(true)
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
  if (server) {
    server.close(() => {
      console.log('Local server closed.')
    })
  }
})

// Handle Windows shutdown/logout (session-end)
if (process.platform === 'win32') {
  ; (app as any).on('session-end', () => {
    isAppQuitting = true
    app.quit()
  })
}

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

// --- Clipboard IPC ---
ipcMain.on('write-clipboard', (_event, text: string) => {
  clipboard.writeText(text)
})

// --- Zoom IPC ---
ipcMain.handle('get-zoom-level', () => mainWindow?.webContents.getZoomLevel() || 0)

// --- Auto-Updater IPC Bridge ---
let isUpdateIgnored = false;

// Disable strict SSL checks for auto-updater to bypass untrusted root cert errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
autoUpdater.requestHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
autoUpdater.autoDownload = false; // Require explicit user interaction to download

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
ipcMain.on('quit-and-install', () => { autoUpdater.quitAndInstall(true, true) })
ipcMain.on('start-download', () => { autoUpdater.downloadUpdate() })
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
