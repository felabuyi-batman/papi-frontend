import { useEffect, useRef, useState } from 'react'
import AnimatedCharacterArt from '../AnimatedCharacterArt.jsx'
import { api, setToken } from '../api.js'
import {
  getSupabaseSession,
  resendSignupConfirmation,
  signInWithEmail,
  signUpWithEmail,
  supabase,
  supabaseConfigured,
} from '../supabase.js'
import './parent-nest.css'

export function NestShell({ children, onBrandClick, topRight, companion = true }) {
  return (
    <div className="nest">
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

export function ParentAuth({ onDone, onBack }) {
  const [mode, setMode] = useState('signin') // signin | signup | check-email
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [note, setNote] = useState(null)
  const [apiOnline, setApiOnline] = useState(null)

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

  async function finishWithSession() {
    await api.acceptSupabaseSession()
    onDone()
  }

  async function submit(event) {
    event?.preventDefault?.()
    setBusy(true)
    setErr(null)
    setNote(null)
    try {
      if (!supabaseConfigured()) {
        throw new Error('Sign-in is not configured yet (missing Supabase keys).')
      }
      const online = await api.health()
      setApiOnline(online)
      if (!online) {
        throw new Error('Pip’s nest is offline. Keep this tab open - we’re retrying the API.')
      }

      if (mode === 'signup') {
        const result = await signUpWithEmail(email, password)
        if (result.needsEmailConfirmation) {
          setMode('check-email')
          setNote('We sent a confirmation link. Open it to unlock your nest.')
          return
        }
        await finishWithSession()
        return
      }

      await signInWithEmail(email, password)
      await finishWithSession()
    } catch (error) {
      setErr(error.message)
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
      >
        <p className="nest__kicker">Check your inbox</p>
        <h1 className="nest__title">Confirm your email.</h1>
        <p className="nest__lede">
          We sent a link to <strong>{email}</strong>. Tap it — it opens your nest automatically.
          If nothing opens, come back here and sign in.
        </p>
        <div className="nest__panel">
          {note && <p className="nest__note">{note}</p>}
          {err && <p className="nest__error">{err}</p>}
          <button type="button" className="nest__primary" disabled={busy} onClick={resend}>
            {busy ? 'Sending…' : 'Resend confirmation'}
          </button>
          <button
            type="button"
            className="nest__back nest__field--quiet"
            onClick={() => setMode('signin')}
          >
            I confirmed — sign in
          </button>
        </div>
      </NestShell>
    )
  }

  const isSignup = mode === 'signup'

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={<NestBack onClick={onBack}>Back to play</NestBack>}
    >
      <p className="nest__kicker">Grown-ups</p>
      <h1 className="nest__title">{isSignup ? 'Create your nest.' : 'Open your nest.'}</h1>
      <p className="nest__lede">
        {isSignup
          ? 'Sign up with email. We’ll send a confirmation link before anything private opens.'
          : 'Sign in with the email you verified. Private progress for parents — Pipa keeps practice playful for kids.'}
      </p>

      <form className="nest__panel" onSubmit={submit}>
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

        <button
          type="submit"
          className="nest__primary"
          disabled={busy || apiOnline === false}
        >
          {busy ? 'Working…' : isSignup ? 'Sign up' : 'Sign in'}
        </button>

        <button
          type="button"
          className="nest__back nest__field--quiet"
          disabled={busy}
          onClick={() => {
            setErr(null)
            setNote(null)
            setMode(isSignup ? 'signin' : 'signup')
          }}
        >
          {isSignup ? 'Already have a nest? Sign in' : 'New here? Sign up'}
        </button>

        {apiOnline === false && (
          <p className="nest__error">
            Nest offline. Run <code>npm run dev</code> in chirp-frontend.
          </p>
        )}
        {err && <p className="nest__error">{err}</p>}
        <p className="nest__note">
          Email verification is required. Voice is scored and discarded by default.
        </p>
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

  useEffect(() => {
    if (isDemo) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const [progress, eng] = await Promise.all([
          api.progress(child.id),
          api.engagement(child.id),
        ])
        if (cancelled) return
        setData(progress)
        setEngagement(eng)
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

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={(
        <NestBack onClick={onBack}>
          {isDemo ? 'Back to Pipa' : 'All children'}
        </NestBack>
      )}
    >
      <p className="nest__kicker">{isDemo ? 'Dashboard preview' : 'Today'}</p>
      <h1 className="nest__title">
        <em>{child.display_name}</em>
        {' '}is finding their voice.
      </h1>
      <p className="nest__lede">{greeting || 'Ready when you are.'}</p>

      <div className="nest__panel">
        <div className="nest__meta">
          <span>{String(pipLabel)}</span>
        </div>

        {err && <p className="nest__error">{err}</p>}
        {!data && !err && <p className="nest__note">Waking Pip…</p>}

        {data && (
          <>
            <dl className="nest__metrics">
              <div>
                <dt>Tries this week</dt>
                <dd>{data.weekly_trials ?? 0}</dd>
              </div>
              <div>
                <dt>Day streak</dt>
                <dd>{streakDays}</dd>
              </div>
              <div>
                <dt>Daily quest</dt>
                <dd>{quest ? `${quest.progress ?? 0}/${quest.goal ?? 10}` : '-'}</dd>
              </div>
            </dl>

            <div className="nest__actions">
              <button type="button" className="nest__primary" onClick={onPractice}>
                {isDemo
                  ? 'Create your family nest'
                  : EXPERIENCE_LABELS[engagement?.recommended_mode] || 'Practice with Pip'}
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
            )}

            <p className="nest__clinical">
              {isDemo
                ? 'Sample progress for the preview. Your real nest stays private.'
                : 'Pipa supplements a speech-language pathologist. It never replaces one.'}
            </p>
          </>
        )}
      </div>
    </NestShell>
  )
}
