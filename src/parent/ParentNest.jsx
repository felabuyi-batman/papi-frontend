import { useEffect, useRef, useState } from 'react'
import AnimatedCharacterArt from '../AnimatedCharacterArt.jsx'
import { api, setToken } from '../api.js'
import {
  getSupabaseSession,
  resendSignupConfirmation,
  signInWithEmail,
  supabase,
  supabaseConfigured,
} from '../supabase.js'
import './parent-nest.css'
import TurnstileVerifier, { turnstileSiteKey } from './TurnstileVerifier.jsx'

export function NestShell({ children, onBrandClick, topRight, companion = true, pageClassName = '' }) {
  return (
    <div className={['nest', pageClassName].filter(Boolean).join(' ')}>
      <div className="nest__atmosphere" aria-hidden="true">
        <div className="nest__wash" />
        <div className="nest__meadow" />
      </div>

      <div className="nest__shell">
        <header className="nest__top">
          <button type="button" className="nest__brand" onClick={onBrandClick}>
            <span aria-hidden="true">p</span>
            pipa
          </button>
          {topRight}
        </header>

        <div className={`nest__stage ${companion ? 'has-companion' : ''}`}>
          <div className="nest__main">{children}</div>
          {companion && (
            <aside className="nest__companion" aria-hidden="true">
              <AnimatedCharacterArt variant="pip" alt="" floating />
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function NestBack({ children, onClick }) {
  return (
    <button type="button" className="nest__back" onClick={onClick}>
      {children}
    </button>
  )
}

export function ParentAuth({ onDone, onBack, initialMode = 'signin' }) {
  const [mode, setMode] = useState(initialMode) // signin | signup | check-email | forgot | forgot-sent
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [apiOnline, setApiOnline] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      const ok = await api.health()
      if (!cancelled) setApiOnline(ok)
    }
    probe()
    const timer = window.setInterval(probe, 4000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // Resume nest from an existing Supabase / SpeechC session (e2e + return visits).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await getSupabaseSession()
        if (session?.access_token) {
          setToken(session.access_token, session.refresh_token || null)
        } else if (!localStorage.getItem('chirp.accessToken')) {
          return
        }
        await api.me()
        if (!cancelled) onDone()
      } catch {
        // Stale token — stay on email form.
      }
    })()
    return () => { cancelled = true }
    // Intentionally once on mount — parent passes a fresh onDone each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event) {
    event?.preventDefault?.()
    setBusy(true)
    setErr(null)
    setNote(null)
    try {
      const online = await api.health()
      setApiOnline(online)
      if (!online) {
        throw new Error('Pipa’s secure service is taking a short pause. Please try again in a moment.')
      }
      // Turnstile is client bot friction; SpeechC register/login does not require it server-side.
      if (turnstileSiteKey() && !turnstileToken) {
        throw new Error('Complete the Cloudflare security check, then try again.')
      }

      const cleanEmail = String(email || '').trim().toLowerCase()
      const cleanPassword = String(password || '')
      if (!cleanEmail) {
        throw new Error('Email is required.')
      }

      if (mode === 'forgot') {
        const result = await api.forgotPassword(cleanEmail)
        // Local/dev APIs may return the link when Resend is not configured.
        if (result?.dev_reset_url && typeof window !== 'undefined') {
          try {
            const url = new URL(result.dev_reset_url, window.location.origin)
            window.history.pushState({}, '', `${url.pathname}${url.search}`)
            window.dispatchEvent(new PopStateEvent('popstate'))
            return
          } catch {
            /* fall through to inbox message */
          }
        }
        setMode('forgot-sent')
        setNote(result?.message || 'If that email has a nest, a reset link is on the way.')
        return
      }

      if (!cleanPassword) {
        throw new Error('Email and password are required.')
      }
      if (cleanPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      // Primary path: SpeechC email/password — unlocks immediately (no verification email).
      // Supabase confirm-email was stranding parents when mail never arrived and
      // unconfirmed accounts looked like a wrong password on sign-in.
      if (mode === 'signup') {
        try {
          await api.register(cleanEmail, cleanPassword)
        } catch (error) {
          const message = String(error?.message || error || '')
          if (/already registered|already exists|409/i.test(message)) {
            throw new Error('That email already has a nest. Sign in instead.')
          }
          throw error
        }
        onDone()
        return
      }

      try {
        await api.login(cleanEmail, cleanPassword)
        onDone()
        return
      } catch (speechcError) {
        // Legacy: parents who finished Supabase email confirm before this cutover.
        if (!supabaseConfigured() || !turnstileToken) throw speechcError
        try {
          await signInWithEmail(cleanEmail, cleanPassword, turnstileToken)
          await api.acceptSupabaseSession()
          onDone()
          return
        } catch (supabaseError) {
          const supabaseMessage = String(supabaseError?.message || '')
          if (/confirm your email|email not confirmed/i.test(supabaseMessage)) {
            setMode('check-email')
            setNote('Your older signup still needs the confirmation link — or create a fresh nest with Sign up.')
            setErr(supabaseMessage)
            return
          }
          throw new Error(
            'Email or password looks wrong. Use Forgot password, or Sign up again if you never finished an older confirmation email.',
          )
        }
      }
    } catch (error) {
      setErr(error.message)
      setTurnstileToken('')
      setTurnstileResetKey((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    setErr(null)
    setNote(null)
    try {
      await resendSignupConfirmation(email)
      setNote('Another confirmation email is on the way.')
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'check-email') {
    return (
      <NestShell
        onBrandClick={onBack}
        topRight={<NestBack onClick={onBack}>Back to play</NestBack>}
        pageClassName="nest--auth"
      >
        <p className="nest__kicker">Check your inbox</p>
        <h1 className="nest__title">Confirm your email.</h1>
        <p className="nest__lede">
          We may have sent a link to <strong>{email}</strong> from an older signup.
          Prefer a faster unlock? Go back and use <strong>Sign up</strong> again —
          your nest opens immediately with email and password (no inbox wait).
        </p>
        <div className="nest__panel">
          {note && <p className="nest__note">{note}</p>}
          {err && <p className="nest__error">{err}</p>}
          <button type="button" className="nest__primary" disabled={busy} onClick={resend}>
            {busy ? 'Sending…' : 'Resend confirmation'}
          </button>
          <button
            type="button"
            className="nest-auth__text-btn"
            onClick={() => setMode('signin')}
          >
            I confirmed — sign in
          </button>
        </div>
      </NestShell>
    )
  }

  if (mode === 'forgot-sent') {
    return (
      <NestShell
        onBrandClick={onBack}
        topRight={<NestBack onClick={onBack}>Back to play</NestBack>}
        pageClassName="nest--auth"
      >
        <p className="nest__kicker">Check your inbox</p>
        <h1 className="nest__title">Reset link sent.</h1>
        <p className="nest__lede">
          If <strong>{email}</strong> has a nest, open the email and choose a new password.
          The link expires in one hour.
        </p>
        <div className="nest__panel">
          {note && <p className="nest__note">{note}</p>}
          {err && <p className="nest__error">{err}</p>}
          <button type="button" className="nest__primary" onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        </div>
      </NestShell>
    )
  }

  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onBack}>Back to play</NestBack>}
      pageClassName="nest--auth"
      companion={false}
    >
      <div className="nest-auth__intro">
        <div className="nest-auth__story">
          <p className="nest__kicker">The grown-up nest</p>
          <h1 className="nest__title">
            {isForgot
              ? 'Reset your password.'
              : isSignup
                ? 'Create a calmer practice rhythm.'
                : 'Open your nest.'}
          </h1>
          <p className="nest__lede">
            {isForgot
              ? 'Enter the email for your nest. We’ll send a one-hour reset link.'
              : isSignup
                ? 'Set up one private place for practice plans, recommendations, and every small win.'
                : 'See what is clicking, what needs support, and the best next activity for your child.'}
          </p>
        </div>
        <div className="nest-auth__portrait" aria-hidden="true">
          <AnimatedCharacterArt variant="pip" alt="" floating />
        </div>
        <dl className="nest-auth__trust" aria-label="What parents can do in the nest">
          <div><dt>01</dt><dd><strong>See the pattern</strong><span>Progress without clinical clutter</span></dd></div>
          <div><dt>02</dt><dd><strong>Know what is next</strong><span>Recommendations shaped by practice</span></dd></div>
          <div><dt>03</dt><dd><strong>Stay in control</strong><span>Private by design, always parent-led</span></dd></div>
        </dl>
      </div>

      <form className="nest__panel nest-auth__panel" onSubmit={submit}>
        <div className="nest-auth__panel-head">
          <span>{isForgot ? 'Password help' : isSignup ? 'New family' : 'Parent sign in'}</span>
          <strong>{isForgot ? 'Forgot password' : isSignup ? 'Start your nest' : 'Open your nest'}</strong>
        </div>
        <label className="nest__field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {!isForgot && (
          <label className="nest__field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}

        <TurnstileVerifier
          action={isForgot ? 'forgot' : isSignup ? 'signup' : 'login'}
          onToken={setTurnstileToken}
          resetKey={turnstileResetKey}
        />

        <button
          type="submit"
          className="nest__primary"
          disabled={busy || apiOnline === false || (Boolean(turnstileSiteKey()) && !turnstileToken)}
        >
          {busy ? 'Working…' : isForgot ? 'Send reset link' : isSignup ? 'Sign up' : 'Sign in'}
        </button>

        {!isForgot && !isSignup && (
          <button
            type="button"
            className="nest-auth__text-btn"
            disabled={busy}
            onClick={() => {
              setErr(null)
              setNote(null)
              setMode('forgot')
              setPassword('')
              setTurnstileToken('')
              setTurnstileResetKey((value) => value + 1)
            }}
          >
            Forgot password?
          </button>
        )}

        <button
          type="button"
          className="nest-auth__text-btn"
          disabled={busy}
          onClick={() => {
            setErr(null)
            setNote(null)
            setMode(isForgot || isSignup ? 'signin' : 'signup')
            setTurnstileToken('')
            setTurnstileResetKey((value) => value + 1)
          }}
        >
          {isForgot
            ? 'Back to sign in'
            : isSignup
              ? 'Already have a nest? Sign in'
              : 'New here? Sign up'}
        </button>

        {apiOnline === false && (
          <p className="nest__error">
            Pipa’s secure service is taking a short pause. Please try again in a moment.
          </p>
        )}
        {err && <p className="nest__error">{err}</p>}
        <p className="nest__note">
          {isForgot
            ? 'Check spam too — the reset link expires in one hour.'
            : 'Your nest unlocks right away — keep this email and password safe for return visits.'}
        </p>
      </form>
    </NestShell>
  )
}

export function PasswordReset({ onDone, onBack }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [token, setToken] = useState('')

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '')
      setToken(params.get('token') || '')
    } catch {
      setToken('')
    }
  }, [])

  async function submit(event) {
    event?.preventDefault?.()
    setBusy(true)
    setErr(null)
    try {
      if (!token) throw new Error('This reset link is missing its token. Request a new one from Sign in.')
      if (password.length < 8) throw new Error('Password must be at least 8 characters.')
      if (password !== confirm) throw new Error('Passwords do not match.')
      await api.resetPassword(token, password)
      window.history.replaceState({}, '', '/')
      await onDone()
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onBack}>Back</NestBack>}
      pageClassName="nest--auth"
    >
      <p className="nest__kicker">Password</p>
      <h1 className="nest__title">Choose a new password.</h1>
      <p className="nest__lede">Pick something memorable for this nest — at least 8 characters.</p>
      <form className="nest__panel nest-auth__panel" onSubmit={submit}>
        <label className="nest__field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="nest__field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <button type="submit" className="nest__primary" disabled={busy || !token}>
          {busy ? 'Saving…' : 'Save password and open nest'}
        </button>
        {err && <p className="nest__error">{err}</p>}
      </form>
    </NestShell>
  )
}

export function AuthCallback({ onDone, onBack }) {
  const [message, setMessage] = useState('Confirming your email…')
  const [err, setErr] = useState(null)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    let cancelled = false
    let finished = false

    const finish = async () => {
      if (finished || cancelled) return
      finished = true
      try {
        const session = await api.acceptSupabaseSession()
        if (cancelled) return
        if (!session?.access_token && !session?.token) {
          throw new Error('Email confirmation did not finish. Try signing in.')
        }
        setMessage('Nest unlocked. Gathering your hatchlings…')
        await onDoneRef.current()
      } catch (error) {
        finished = false
        if (!cancelled) setErr(error.message)
      }
    }

    // Prefer auth-state change (handles PKCE settle); also try immediately.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        finish()
      }
    })
    finish()

    return () => {
      cancelled = true
      subscription?.unsubscribe?.()
    }
  }, [])

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onBack}>Back</NestBack>}
    >
      <p className="nest__kicker">Email</p>
      <h1 className="nest__title">Welcome to the nest.</h1>
      <div className="nest__panel">
        {err ? <p className="nest__error">{err}</p> : <p className="nest__note">{message}</p>}
        {err && (
          <button type="button" className="nest__primary" onClick={onBack}>
            Back to sign in
          </button>
        )}
      </div>
    </NestShell>
  )
}

const NEST_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'ar', label: 'العربية' },
  { id: 'zh', label: '中文' },
]

export function ParentAddChild({ onDone, onBack }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState('2021')
  const [month, setMonth] = useState('6')
  const [language, setLanguage] = useState('en')
  const [retain, setRetain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function create(event) {
    event?.preventDefault?.()
    setBusy(true)
    setErr(null)
    try {
      await api.consent()
      const created = await api.createChild({
        display_name: name.trim(),
        birth_year: Number(year),
        birth_month: Number(month),
        language,
        audio_retention: retain ? '30d' : 'none',
      })
      onDone(created.child_id)
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onBack}>Back</NestBack>}
    >
      <p className="nest__kicker">New hatchling</p>
      <h1 className="nest__title">Who’s joining Pip?</h1>
      <p className="nest__lede">
        Just a nickname, birth month, and nest language. One pack at a time.
      </p>

      <form className="nest__panel" onSubmit={create}>
        <label className="nest__field">
          <span>First name or nickname</span>
          <input
            placeholder="e.g. Situ"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
          />
        </label>

        <div className="nest__pair">
          <label className="nest__field">
            <span>Birth year</span>
            <input inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label className="nest__field">
            <span>Birth month</span>
            <input inputMode="numeric" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>

        <label className="nest__field">
          <span>Nest language</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {NEST_LANGUAGES.map((pack) => (
              <option key={pack.id} value={pack.id}>{pack.label}</option>
            ))}
          </select>
        </label>

        <label className="nest__check">
          <input type="checkbox" checked={retain} onChange={(event) => setRetain(event.target.checked)} />
          Keep practice recordings for 30 days so an SLP can review them
        </label>

        <button className="nest__primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Building nest…' : 'I consent - meet Pip'}
        </button>

        {err && <p className="nest__error">{err}</p>}
        <p className="nest__note">You can delete everything anytime.</p>
      </form>
    </NestShell>
  )
}

export function ParentRoster({ children, onPick, onAdd, onBack, onSignOut }) {
  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onSignOut}>Sign out</NestBack>}
    >
      <p className="nest__kicker">Your nest</p>
      <h1 className="nest__title">Who’s ready to practice?</h1>
      <p className="nest__lede">Pick a child to open today’s nest.</p>

      <div className="nest__panel">
        <div className="nest__kids">
          {children.map((child) => {
            const activeSounds = (child.targets || [])
              .filter((target) => target.status === 'active')
              .map((target) => `/${target.phoneme}/`)
              .join(' ')
            return (
              <button
                key={child.id}
                type="button"
                className="nest__kid"
                onClick={() => onPick(child)}
              >
                <span className="nest__kid-mark" aria-hidden="true">
                  {child.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="nest__kid-copy">
                  <strong>{child.display_name}</strong>
                  <small>{activeSounds || 'Listening game next'}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="nest__secondary" onClick={onAdd}>
          Add a child
        </button>
      </div>
    </NestShell>
  )
}

const LADDER_STEPS = 8
const EXPERIENCE_LABELS = {
  drill: 'Practice with Pip',
  pairs: 'Play Sound Detective',
  conversation: 'Tell Pip a story',
  live: 'Talk live with Pip',
  math: 'Visit the number nest',
  graduation: 'Open the graduation',
  free_play: 'Explore the meadow',
}

const DEMO_PROGRESS = {
  weekly_trials: 84,
  targets: [
    { phoneme: 's', ladder_level: 4, recent_accuracy: .78 },
    { phoneme: 'r', ladder_level: 2, recent_accuracy: .63 },
  ],
}

const DEMO_ENGAGEMENT = {
  recommended_mode: 'drill',
  greeting: 'Sam found a secret sound trail in the meadow.',
  pip: { label: 'Meadow Hatchling' },
  streak: { current: 6 },
  daily_quest: { progress: 7, goal: 10 },
}

export function ParentDashboard({
  child,
  onPractice,
  onScreener,
  onMath,
  onBack,
  isDemo = false,
}) {
  const [data, setData] = useState(isDemo ? DEMO_PROGRESS : null)
  const [engagement, setEngagement] = useState(isDemo ? DEMO_ENGAGEMENT : null)
  const [language, setLanguage] = useState(child.language || 'en')
  const [err, setErr] = useState(null)
  const [langBusy, setLangBusy] = useState(false)
  const [billing, setBilling] = useState(null)
  const [billingBusy, setBillingBusy] = useState(false)

  useEffect(() => {
    if (isDemo) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const [progress, eng, billingOverview] = await Promise.all([
          api.progress(child.id),
          api.engagement(child.id),
          api.billingOverview().catch(() => null),
        ])
        if (cancelled) return
        setData(progress)
        setEngagement(eng)
        setBilling(billingOverview)
        setLanguage(eng.language || child.language || 'en')
        setErr(null)
      } catch (error) {
        if (!cancelled) setErr(error.message)
      }
    })()
    return () => { cancelled = true }
  }, [child.id, child.language, isDemo])

  const pipLabel = engagement?.pip?.label || engagement?.pip?.stage || 'Egg Sitter'
  const streakDays = engagement?.streak?.count ?? engagement?.streak?.current ?? data?.streak ?? 0
  const quest = engagement?.daily_quest
  const greeting = engagement?.greeting || engagement?.comeback
  const insights = data?.insights || {}
  const averageClarity = insights.avg_clarity ?? data?.average_score
  const practiceMinutes = insights.practice_minutes_est ?? 0
  const improvingSounds = insights.improving_sounds || []
  const practiceSounds = insights.needs_practice_sounds || []
  const recentTries = insights.recent_tries || []
  const recommendations = [
    practiceSounds.length
      ? `Give /${practiceSounds[0]}/ a short, playful turn while energy is high.`
      : 'Keep sessions short and finish while the game still feels fun.',
    improvingSounds.length
      ? `Celebrate /${improvingSounds[0]}/ in everyday words — the pattern is strengthening.`
      : 'Repeat successful words naturally at meals or story time.',
    'Aim for one calm five-minute visit today; consistency beats long sessions.',
  ]

  async function changeLanguage(nextLanguage) {
    if (isDemo || nextLanguage === language) return
    setLangBusy(true)
    setErr(null)
    try {
      await api.setChildLanguage(child.id, nextLanguage)
      setLanguage(nextLanguage)
      onScreener?.()
    } catch (error) {
      setErr(error.message)
    } finally {
      setLangBusy(false)
    }
  }

  async function manageAccess() {
    if (!billing?.email) return
    setBillingBusy(true)
    setErr(null)
    try {
      const checkout = await api.startWaitlistCheckout(billing.email, 'parent-dashboard')
      if (checkout.checkout_url) window.location.assign(checkout.checkout_url)
      else setBilling((current) => ({ ...current, active: true, status: 'paid' }))
    } catch (error) {
      setErr(error.message)
    } finally {
      setBillingBusy(false)
    }
  }

  return (
    <NestShell
      onBrandClick={onBack}
      companion={false}
      topRight={(
        <NestBack onClick={onBack}>
          {isDemo ? 'Back to Pipa' : 'All children'}
        </NestBack>
      )}
    >
      <div className="nest-dashboard">
        <section className="nest-dashboard__hero">
          <div>
            <p className="nest__kicker">{isDemo ? 'Dashboard preview' : 'Family field notes · Today'}</p>
            <h1 className="nest__title"><em>{child.display_name}</em> is finding their voice.</h1>
            <p className="nest__lede">{insights.parent_summary || greeting || 'Ready when you are.'}</p>
          </div>
          <div className="nest-dashboard__pip">
            <span>Pip’s growth stage</span>
            <strong>{String(pipLabel)}</strong>
            <small>{streakDays ? `${streakDays} day rhythm` : 'A fresh start today'}</small>
          </div>
        </section>

        <div className="nest__panel nest-dashboard__panel">

        {err && <p className="nest__error">{err}</p>}
        {!data && !err && <p className="nest__note">Waking Pip…</p>}

        {data && (
          <>
            <dl className="nest__metrics nest-dashboard__metrics">
              <div>
                <dt>Tries this week</dt>
                <dd>{data.weekly_trials ?? 0}</dd>
              </div>
              <div>
                <dt>Day streak</dt>
                <dd>{streakDays}</dd>
              </div>
              <div>
                <dt>Practice time</dt>
                <dd>{practiceMinutes}<small> min</small></dd>
              </div>
              <div>
                <dt>Average clarity</dt>
                <dd>{averageClarity == null ? '—' : `${Math.round(averageClarity <= 1 ? averageClarity * 100 : averageClarity)}%`}</dd>
              </div>
            </dl>

            <div className="nest-dashboard__grid">
              <section className="nest-dashboard__focus">
                <span className="nest-dashboard__eyebrow">Recommended next</span>
                <h2>{EXPERIENCE_LABELS[engagement?.recommended_mode] || 'Practice with Pip'}</h2>
                <p>{recommendations[0]}</p>
                <button type="button" className="nest__primary" onClick={onPractice}>
                  {isDemo ? 'Create your family nest' : 'Start the next adventure'}
                </button>
              </section>

              <section className="nest-dashboard__recommendations">
                <span className="nest-dashboard__eyebrow">For this week</span>
                <h2>Little moves, real momentum</h2>
                <ol>{recommendations.map((recommendation, recommendationIndex) => (
                  <li key={recommendation}><span>{recommendationIndex + 1}</span>{recommendation}</li>
                ))}</ol>
              </section>
            </div>

            <div className="nest__actions nest-dashboard__actions">
              <button type="button" className="nest__primary" onClick={onPractice}>
                Practice with Pip
              </button>
              {onScreener && (
                <button type="button" className="nest__secondary" onClick={onScreener}>
                  Pip’s Listening Game
                </button>
              )}
              {onMath && !isDemo && (
                <button type="button" className="nest__secondary" onClick={onMath}>
                  Number nest
                </button>
              )}
            </div>

            {!isDemo && (
              <label className="nest__field nest__field--quiet">
                <span>Nest language</span>
                <select
                  value={language}
                  disabled={langBusy}
                  onChange={(event) => changeLanguage(event.target.value)}
                >
                  {NEST_LANGUAGES.map((pack) => (
                    <option key={pack.id} value={pack.id}>{pack.label}</option>
                  ))}
                </select>
              </label>
            )}

            {(data.targets || []).length > 0 && (
              <section className="nest-dashboard__section">
                <div className="nest-dashboard__section-title"><span className="nest-dashboard__eyebrow">Sound map</span><h2>Where confidence is growing</h2></div>
                <div className="nest__sounds" aria-label="Sound progress">
                {data.targets.map((target) => {
                  const accuracy = target.recent_accuracy
                  const pct = accuracy == null
                    ? null
                    : (accuracy <= 1 ? Math.round(accuracy * 100) : Math.round(accuracy))
                  return (
                    <div className="nest__sound" key={target.phoneme}>
                      <span className="nest__sound-glyph">/{target.phoneme}/</span>
                      <span className="nest__ladder" aria-hidden="true">
                        {Array.from({ length: LADDER_STEPS }).map((_, stepIndex) => (
                          <i key={stepIndex} className={stepIndex <= target.ladder_level ? 'is-on' : ''} />
                        ))}
                      </span>
                      <span className="nest__sound-pct">
                        {pct == null ? '-' : `${pct}%`}
                      </span>
                    </div>
                  )
                })}
                </div>
              </section>
            )}

            <div className="nest-dashboard__lower">
              <section className="nest-dashboard__section">
                <span className="nest-dashboard__eyebrow">Recent moments</span>
                <h2>Latest tries</h2>
                {recentTries.length ? (
                  <ul className="nest-dashboard__tries">{recentTries.slice(0, 4).map((attemptItem, attemptIndex) => (
                    <li key={`${attemptItem.created_at || attemptIndex}`}>
                      <strong>{attemptItem.word || attemptItem.expected_text || 'Practice turn'}</strong>
                      <span>{attemptItem.score == null ? 'Captured' : `${Math.round(attemptItem.score)}% clarity`}</span>
                    </li>
                  ))}</ul>
                ) : <p className="nest__note">The first practice moments will appear here.</p>}
              </section>

              {!isDemo && billing && (
                <section className="nest-dashboard__section nest-dashboard__plan">
                  <span className="nest-dashboard__eyebrow">Family access</span>
                  <h2>{billing.plan_name}</h2>
                  <p>{billing.active ? 'Your founding access is active.' : 'One payment. No recurring charge.'}</p>
                  <div><strong>{billing.active ? 'Active' : `$${((billing.amount_cents || 0) / 100).toFixed(0)}`}</strong><span>{billing.recurring ? ' billed regularly' : ' lifetime founding access'}</span></div>
                  {!billing.active && <button type="button" className="nest__secondary" disabled={billingBusy} onClick={manageAccess}>{billingBusy ? 'Opening secure checkout…' : 'Update family access'}</button>}
                </section>
              )}
            </div>

            <p className="nest__clinical">
              {isDemo
                ? 'Sample progress for the preview. Your real nest stays private.'
                : 'Pipa supplements a speech-language pathologist. It never replaces one.'}
            </p>
          </>
        )}
        </div>
      </div>
    </NestShell>
  )
}
