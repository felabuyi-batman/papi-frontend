import { useEffect, useState } from 'react'
import { api } from '../api.js'

const LADDER_STEPS = 8

/** 14-day accuracy sparkline in plain SVG. Gaps = no practice that day. */
function Sparkline({ series }) {
  const w = 180, h = 36
  const pts = series
    .map((d, i) => d.accuracy === null ? null
      : `${(i / (series.length - 1)) * w},${h - d.accuracy * (h - 6) - 3}`)
    .filter(Boolean)
  return (
    <svg width={w} height={h} aria-label="14-day accuracy trend">
      <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="var(--rule)" />
      {pts.length > 1 && (
        <polyline points={pts.join(' ')} fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      )}
      {series.map((d, i) => d.accuracy === null ? null : (
        <circle key={i} cx={(i / (series.length - 1)) * w}
          cy={h - d.accuracy * (h - 6) - 3} r="2.5" fill="var(--ink)" />
      ))}
    </svg>
  )
}

export default function Dashboard({ child, onPractice, onScreener, onBack }) {
  const [data, setData] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [carryover, setCarryover] = useState(null)
  const [weekly, setWeekly] = useState(null)
  const [err, setErr] = useState(null)

  const load = async () => {
    try {
      const [progress, eng, carry, report] = await Promise.all([
        api.progress(child.id),
        api.engagement(child.id),
        api.carryover(child.id).catch(() => null),
        api.weeklyReport(child.id).catch(() => null),
      ])
      setData(progress)
      setEngagement(eng)
      setCarryover(carry)
      setWeekly(report)
      setErr(null)
    } catch (e) {
      setErr(e.message)
    }
  }
  useEffect(() => { load() }, [child.id])

  if (err) return <div className="parent-page"><p className="mono">{err}</p></div>
  if (!data) return <div className="parent-page"><p className="mono">loading…</p></div>

  const pipLabel = engagement?.pip?.label || engagement?.pip?.stage || 'Egg Sitter'
  const streakDays = engagement?.streak?.current ?? 0
  const quest = engagement?.daily_quest
  const greeting = engagement?.greeting || engagement?.comeback

  return (
    <div className="parent-page">
      <header className="parent-header">
        <div className="brand-lockup brand-lockup--dark"><span className="brand-mark">p</span> pipa!</div>
        <button className="quiet-btn" onClick={onBack}>← All children</button>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">THIS WEEK&rsquo;S FLIGHT LOG</p>
          <h1><em>{data.child}</em> is finding<br />their voice.</h1>
          <p className="dashboard-summary">{data.weekly_trials} brave sound attempts this week. Small, daily practice creates the biggest change.</p>
          {greeting && <p className="dashboard-summary" style={{ marginTop: 8 }}>{greeting}</p>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            <button className="big-friendly" onClick={onPractice}>Practice with Pip <span>→</span></button>
            {onScreener && (
              <button className="quiet-btn" onClick={onScreener}>Pip&rsquo;s Listening Game</button>
            )}
          </div>
        </div>
        <div className="dashboard-pip-card">
          <span className="sticker sticker--sun">{String(pipLabel).toUpperCase()}</span>
          <img src="/pip-character.jpg" alt="Pip, the practice companion" />
          <span className="dashboard-pip-line">
            {streakDays > 0 ? `${streakDays}-day streak` : 'Ready when you are'}
            {quest ? ` · quest ${quest.progress ?? 0}/${quest.goal ?? 10}` : ''}
          </span>
        </div>
      </section>

      {data.flags.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <p className="eyebrow" style={{ color: 'var(--flag)' }}>needs a human — not the app</p>
          {data.flags.map((f) => (
            <div className="flag-card" key={f.id}>
              <span className="mono">{f.kind.replace(/_/g, ' ')}</span>
              <p style={{ margin: '6px 0 10px' }}>{f.detail}</p>
              <button className="quiet-btn" onClick={() => api.resolveFlag(f.id).then(load)}>
                mark reviewed
              </button>
            </div>
          ))}
        </section>
      )}

      {weekly?.highlights?.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-heading"><div><p className="eyebrow">WEEKLY REPORT</p><h2>What grew</h2></div></div>
          <ul className="mono" style={{ lineHeight: 1.7 }}>
            {weekly.highlights.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section>
      )}

      <div className="section-heading"><div><p className="eyebrow">SOUND GARDEN</p><h2>Skills taking root</h2></div><p>Isolation → syllable → word → phrase → sentence → conversation</p></div>
      {data.targets.map((t) => (
        <div className="target-row" key={t.phoneme}>
          <div>
            <div className="phoneme-glyph">/{t.phoneme}/</div>
            <div className="mono" style={{ color: 'var(--ink-40)' }}>{t.status}</div>
          </div>
          <div>
            <div className="mono">{t.level_name.replace('_', ' ')}</div>
            <div className="ladder-track">
              {Array.from({ length: LADDER_STEPS }).map((_, i) => (
                <span key={i} className={`ladder-step ${i <= t.ladder_level ? 'done' : ''}`} />
              ))}
            </div>
          </div>
          <div>
            <div className="mono-big">
              {t.recent_accuracy === null ? '—' : `${Math.round(t.recent_accuracy * 100)}%`}
            </div>
            <div className="mono" style={{ color: 'var(--ink-40)' }}>{t.total_trials} trials</div>
          </div>
          <Sparkline series={t.series} />
        </div>
      ))}

      {carryover?.home_missions?.length > 0 && (
        <section style={{ marginTop: 40, marginBottom: 24 }}>
          <div className="section-heading"><div><p className="eyebrow">HOME MISSIONS</p><h2>Carry it into life</h2></div></div>
          <ul style={{ lineHeight: 1.7 }}>
            {carryover.home_missions.map((m, i) => (
              <li key={i}>{typeof m === 'string' ? m : m.mission || m.prompt || m.title}</li>
            ))}
          </ul>
        </section>
      )}

      {carryover?.targets?.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-heading"><div><p className="eyebrow">GRADUATION</p><h2>Ready to graduate?</h2></div></div>
          {carryover.targets.map((t) => (
            <div className="target-row" key={t.phoneme} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div className="phoneme-glyph">/{t.phoneme}/</div>
                <div className="mono">{t.ready_to_graduate ? 'ready to graduate' : 'still practicing'}</div>
              </div>
              {!t.criteria?.parent_confirmed?.met && (
                <button className="quiet-btn" onClick={() => api.parentConfirm(child.id, t.phoneme).then(load)}>
                  We hear it at home
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="clinical-note">
        <span>For grown-ups</span>
        <p>
          Pipa supplements a speech-language pathologist. It never replaces one.
          Share this page at your next appointment.
        </p>
      </div>
    </div>
  )
}
