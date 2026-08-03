import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { ChildVoiceSession } from '../voice/ChildVoiceSession.js'
import Character from './Character.jsx'
import World from './World.jsx'
import { childCopy, languageDirection } from './i18n.js'
import './child-world.css'

/**
 * Pip's Listening Game keeps clinical outcomes private. Backend `pip_line`,
 * `advance`, and `cue_mode` drive the child reaction, with one bounded retry
 * so an uncertain score can never trap a child on one picture.
 */
export default function ScreenerSession({ child, onDone, onSkip }) {
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [attempt, setAttempt] = useState(1)
  const [phase, setPhase] = useState('loading')
  const [pipLine, setPipLine] = useState('Pip is setting up the listening game…')
  const [error, setError] = useState(null)
  const [voiceState, setVoiceState] = useState({})
  const scoresRef = useRef({})
  const voiceRef = useRef(new ChildVoiceSession(api))
  const submitTurnRef = useRef(null)
  const captureTimerRef = useRef(null)
  const copy = childCopy(child.language)

  const item = items[index]
  const pictureUrl = item ? api.pictureUrl(item.picture) : null
  const emoji = typeof item?.picture === 'object' ? item.picture?.emoji : item?.picture

  useEffect(() => {
    let cancelled = false
    const voice = voiceRef.current
    const unsubscribe = voice.subscribe((event) => {
      if (event.type === 'state') setVoiceState(event.state)
      if (event.type === 'utterance') submitTurnRef.current?.(event.blob)
    })
    ;(async () => {
      try {
        const payload = await api.screenerItems(child.id)
        if (cancelled) return
        if (payload.completed) {
          onDone()
          return
        }
        setItems(payload.items || [])
        const opening = copy.opening(child.display_name)
        setPipLine(opening)
        setPhase('prompt')
        voice.connect({
          childId: child.id,
          mode: 'meet',
          language: child.language || 'en',
        }).catch(() => {})
        await voice.speak(opening)
        if (!cancelled) beginHandsFreeCapture()
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      }
    })()
    return () => {
      cancelled = true
      unsubscribe()
      voice.disconnect()
      window.clearTimeout(captureTimerRef.current)
    }
  }, [child.id, child.display_name, onDone])

  async function beginHandsFreeCapture() {
    try {
      setPhase('recording')
      setPipLine(copy.listening)
      await voiceRef.current.beginCapture({ maxMs: 4000 })
    } catch {
      setError(copy.reconnecting)
      captureTimerRef.current = window.setTimeout(beginHandsFreeCapture, 1600)
    }
  }

  async function advanceToNextItem() {
    const next = index + 1
    setAttempt(1)
    if (next >= items.length) {
      setPhase('done')
      const closing = copy.taughtMe
      setPipLine(closing)
      await voiceRef.current.speak(closing)
      await api.screenerComplete(child.id, scoresRef.current)
      window.setTimeout(onDone, 900)
      return
    }
    setIndex(next)
    setPhase('prompt')
    const nextLine = items[next]?.prompt || copy.nextPicture
    setPipLine(nextLine)
    await voiceRef.current.speak(nextLine)
    await beginHandsFreeCapture()
  }

  async function submit(blob) {
    if (!blob?.size) {
      setError(copy.silence)
      captureTimerRef.current = window.setTimeout(beginHandsFreeCapture, 900)
      return
    }
    setPhase('saving')
    setPipLine(copy.remembering)
    try {
      const result = await api.screenerTrial(child.id, {
        itemId: item.id,
        blob,
        word: item.word,
        phoneme: item.phoneme,
      })
      const prior = scoresRef.current[item.id] || []
      scoresRef.current[item.id] = [...prior, Number(result.score) || 70]
      setPipLine(result.pip_line || 'Thanks for teaching me!')
      await voiceRef.current.speak(result.pip_line || 'Thanks for teaching me!')

      if (!result.advance && attempt < 2) {
        setAttempt(2)
        setPhase('prompt')
        await beginHandsFreeCapture()
        return
      }
      await advanceToNextItem()
    } catch (requestError) {
      setError(requestError.message)
      setPhase('prompt')
      captureTimerRef.current = window.setTimeout(beginHandsFreeCapture, 1200)
    }
  }
  submitTurnRef.current = submit

  return (
    <div className="syllabus-world syllabus-world--screener" dir={languageDirection(child.language)}>
      <World world={{ current: 'nest', unlocked: ['nest'] }} />
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onSkip} aria-label="Skip for now">←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">
          {items.length ? `${Math.min(index + 1, items.length)} / ${items.length}` : copy.listeningGame}
        </div>
      </header>

      <main className="syllabus-playground">
        <section className="syllabus-pip-zone">
          <Character
            state={
              phase === 'saving'
                ? 'gentle'
                : phase === 'recording'
                  ? 'listening'
                  : voiceState.speaking
                    ? 'model'
                    : phase === 'done'
                      ? 'celebrate'
                      : 'idle'
            }
            size={330}
          />
        </section>

        <section className="syllabus-challenge">
          <p className="syllabus-kicker">{copy.listeningGame}</p>
          <h1 className="screener-title">{copy.whatSee}</h1>
          <div className="syllabus-bubble" aria-live="polite">
            <span>{copy.coachSays}</span>
            {error || pipLine}
          </div>

          {item && phase !== 'done' && (
            <div className="syllabus-prompt-card">
              {pictureUrl ? (
                <img
                  src={pictureUrl}
                  alt={item.word || 'Picture to name'}
                  className="syllabus-picture"
                />
              ) : (
                <span className="syllabus-emoji" aria-hidden="true">{emoji || '✨'}</span>
              )}
              <strong>{item.word}</strong>
            </div>
          )}

          {phase !== 'done' && phase !== 'loading' && (
            <div className="syllabus-controls">
              <div className={`screener-voice-status ${phase === 'recording' ? 'is-listening' : ''}`}>
                <span aria-hidden="true"><i /><i /><i /><i /><i /></span>
                <strong>
                  {phase === 'recording'
                      ? copy.sayPicture
                      : phase === 'saving'
                      ? copy.thinking
                      : copy.noTap}
                </strong>
              </div>
              <div className={`handsfree-orb ${phase === 'recording' ? 'is-listening' : ''}`} aria-hidden="true"><i /><i /><i /></div>
            </div>
          )}
          {phase === 'done' && (
            <p className="syllabus-bubble">{copy.building(child.display_name)}</p>
          )}
        </section>
      </main>
    </div>
  )
}
