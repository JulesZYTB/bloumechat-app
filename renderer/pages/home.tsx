import React, { useEffect, useState } from 'react'
import Head from 'next/head'

export default function HomePage() {
  const [siteUrl, setSiteUrl] = useState('')
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // In production, we'd use the real URL. In dev, we use localhost.
    // Fetch dynamically from main process over IPC since renderer doesn't have reliable process.env
    const fetchEnv = async () => {
      // @ts-ignore
      const baseUrl = await window.ipc.getEnv('NEXT_PUBLIC_SITE_URL') || 'https://bloumechat.com'
      setSiteUrl(`${baseUrl}/app`)
    }
    fetchEnv()

    // Listen for theme changes from the iframe (Bloumechat main site)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'THEME_CHANGED') {
        const theme = event.data.theme
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      } else if (event.data?.type === 'SHOW_NOTIFICATION') {
        // @ts-ignore
        window.ipc.showNotification(event.data.notification)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleMessage)

      // Listen for notification clicks from main process
      // @ts-ignore
      const unsubscribe = window.ipc.onNotificationClick((data: any) => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'NAVIGATE',
            channelPublicId: data.channelPublicId,
            serverPublicId: data.serverPublicId
          }, '*')
        }
      })

      return () => {
        window.removeEventListener('message', handleMessage)
        unsubscribe()
      }
    }
  }, [])

  const handleBack = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'NAV_BACK' }, '*')
    }
  }

  const handleForward = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'NAV_FORWARD' }, '*')
    }
  }

  return (
    <React.Fragment>
      <Head>
        <title>Bloumechat</title>
      </Head>

      {/* Custom Title Bar */}
      <div
        className="fixed top-0 left-0 w-full h-[30px] bg-background/60 backdrop-blur-xl flex items-center justify-between z-[9999] border-b border-foreground/5 select-none"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Side: Navigation Buttons */}
        <div className="flex-1 flex items-center space-x-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleBack}
            className="w-9 h-[30px] flex items-center justify-center hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title="Précédent"
          >
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M 7,2 L 3,5 L 7,8" />
            </svg>
          </button>

          <button
            onClick={handleForward}
            className="w-9 h-[30px] flex items-center justify-center hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title="Suivant"
          >
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M 3,2 L 7,5 L 3,8" />
            </svg>
          </button>
        </div>

        {/* Center: Logo + Text */}
        <div className="flex items-center justify-center space-x-1.5 flex-1">
          <img src="/images/logo.png" alt="Logo" className="w-3.5 h-3.5 pointer-events-none" />
          <span className="text-[12px] font-semibold text-foreground/90 pointer-events-none tracking-tight">BloumeChat</span>
        </div>

        {/* Right Side: Window Controls */}
        <div className="flex items-center justify-end flex-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* @ts-ignore */}
          <button
            // @ts-ignore
            onClick={() => window.ipc.minimize()}
            className="w-9 h-[30px] flex items-center justify-center hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
          >
            <svg viewBox="0 0 10 10" className="w-2 h-2" stroke="currentColor" strokeWidth="1"><path d="M 0,5 L 10,5" /></svg>
          </button>

          <button
            // @ts-ignore
            onClick={() => window.ipc.maximize()}
            className="w-9 h-[30px] flex items-center justify-center hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
          >
            <svg viewBox="0 0 10 10" className="w-2 h-2" stroke="currentColor" strokeWidth="1" fill="none"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
          </button>

          <button
            // @ts-ignore
            onClick={() => window.ipc.close()}
            className="w-10 h-[30px] flex items-center justify-center hover:bg-red-500 hover:text-white text-muted-foreground transition-colors focus:outline-none"
          >
            <svg viewBox="0 0 10 10" className="w-2 h-2" stroke="currentColor" strokeWidth="1.2"><path d="M 0,0 L 10,10 M 10,0 L 0,10" /></svg>
          </button>
        </div>
      </div>

      {/* Loading Screen / Embedded Main Site */}
      {!siteUrl ? (
        <div className="flex h-screen w-screen items-center justify-center bg-background pt-[30px]">
          <div className="flex flex-col items-center space-y-4 animate-pulse-slow">
            <img src="/images/logo.png" alt="Bloumechat" className="w-32 h-32 animate-bounce-subtle" />
            <h1 className="text-2xl font-bold text-primary">Chargement de Bloumechat...</h1>
          </div>
        </div>
      ) : (
        <div className="w-screen h-screen pt-[30px] bg-background overflow-hidden relative">
          <iframe
            ref={iframeRef}
            src={siteUrl}
            allow="camera; microphone; display-capture; fullscreen"
            className="w-full h-full border-none absolute top-[30px] left-0 right-0 bottom-0"
            style={{
              height: 'calc(100vh - 30px)',
              backgroundColor: 'hsl(var(--background))'
            }}
          />
        </div>
      )}
    </React.Fragment>
  )
}
