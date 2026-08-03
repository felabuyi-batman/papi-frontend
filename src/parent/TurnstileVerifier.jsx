import { useEffect, useRef } from 'react'

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script'
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const DEVELOPMENT_SITE_KEY = '1x00000000000000000000AA'

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID)
    const script = existingScript || document.createElement('script')
    const handleLoad = () => resolve(window.turnstile)
    const handleError = () => reject(new Error('Cloudflare verification could not load.'))
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    if (!existingScript) {
      script.id = TURNSTILE_SCRIPT_ID
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })
}

export function turnstileSiteKey() {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY
    || (import.meta.env.DEV ? DEVELOPMENT_SITE_KEY : '')
}

export default function TurnstileVerifier({ action, onToken, resetKey }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const siteKey = turnstileSiteKey()

  useEffect(() => {
    let cancelled = false
    if (!siteKey || !containerRef.current) return undefined
    loadTurnstile().then((turnstile) => {
      if (cancelled || !turnstile || !containerRef.current) return
      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        size: 'flexible',
        appearance: 'always',
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }).catch(() => onToken(''))
    return () => {
      cancelled = true
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
      widgetIdRef.current = null
    }
  }, [action, onToken, resetKey, siteKey])

  if (!siteKey) {
    return (
      <p className="nest__error" role="alert">
        Secure sign-in is unavailable until the Cloudflare Turnstile site key is configured.
      </p>
    )
  }

  return (
    <div className="nest__turnstile" ref={containerRef} />
  )
}
