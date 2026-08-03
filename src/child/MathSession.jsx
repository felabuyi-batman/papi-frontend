import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { ChildVoiceSession } from '../voice/ChildVoiceSession.js'
import Character from './Character.jsx'
import { Confetti } from './GameBits.jsx'
import World from './World.jsx'
import { childCopy, languageDirection } from './i18n.js'
import './child-world.css'

function QuantityDots({ count }) {
  const n = Math.max(0, Math.min(12, Number(count) || 0))
  return (
    <div className="math-dots" aria-hidden="true">
      {Array.from({ length: n }, (_, index) => (
        <span key={index} className="math-dot" />
      ))}
    </div>
  )
}

export default function MathSession({ child, engagement, onExit }) {
  const language = child.language || engagement?.language || 'en'
  const copy = childCopy(language)
  const [session, setSession] = useState(null)
  const [exercise, setExercise] = useState(null)
  const [message, setMessage] = useState(copy.thinking)
  const [phase, setPhase] = useState('loading')
  const [confetti, setConfetti] = useState(0)
  const [error, setError] = useState(null)
  const [voiceState, setVoiceState] = useState({})
  const voiceRef = useRef(new ChildVoiceSession(api))
  const processTurnRef = useRef(null)
  const listeningRestartRef = useRef(null)
  const turnInFlightRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const voice = voiceRef.current
    const unsubscribe = voice.subscribe((event) => {
      if (event.type === 'state') setVoiceState(event.state)
      if (event.type === 'utterance') {
        processTurnRef.current?.(event.blob)
      }
    })
    ;(async () => {
      try {
        const payload = await api.mathStart(child.id)
        if (cancelled) return
        setSession(payload)
        setExercise(payload.exercise)
        const opening = payload.episode?.cold_open
          || payload.ui?.welcome
          || copy.countOpening(child.display_name)
        setMessage(opening)
        setPhase('ready')
        await voice.speak(opening)
        if (!cancelled) listeningRestartRef.current?.()
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      }
    })()
    return () => {
      cancelled = true
      unsubscribe()
      voice.disconnect()
    }
  }, [child.display_name, child.id, copy, language])

  async function startListening() {
    if (!session?.session_id || turnInFlightRef.current) return
    try {
      setError(null)
      setPhase('listening')
      setMessage(copy.listening)
      await voiceRef.current.beginCapture({ maxMs: 5200 })
    } catch {
      setError(copy.reconnecting)
      window.setTimeout(() => listeningRestartRef.current?.(), 1200)
    }
  }
  listeningRestartRef.current = startListening

  async function applyResult(result) {
    const kidLine = result.feedback_band?.kid_label
      || result.message
      || result.coach_line
      || (result.correct ? copy.countWin : copy.countAgain)
    setMessage(kidLine)
    await voiceRef.current.speak(kidLine)
    if (result.correct || result.ok) {
      setConfetti((value) => value + 1)
    }
    if (result.next_exercise || result.exercise) {
      setExercise(result.next_exercise || result.exercise)
      setPhase('listening')
      return
    }
    if (result.kind === 'topic_jump' && result.exercise) {
      setExercise(result.exercise)
      setPhase('listening')
    }
  }

  async function chooseAnswer(answer) {
    if (!session?.session_id || phase === 'scoring') return
    setPhase('scoring')
    try {
      const result = await api.mathAttempt(session.session_id, answer)
      await applyResult(result)
    } catch (requestError) {
      setError(requestError.message)
      setPhase('ready')
    } finally {
      window.setTimeout(() => listeningRestartRef.current?.(), 250)
    }
  }

  async function processSpokenTurn(blob) {
    if (!blob?.size || !session?.session_id || turnInFlightRef.current) return
    turnInFlightRef.current = true
    setPhase('scoring')
    setMessage(copy.thinking)
    try {
      const result = await api.mathAudioUtterance(
        session.session_id,
        blob,
        voiceRef.current.latestChildTranscript(),
      )
      await applyResult(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      turnInFlightRef.current = false
      window.setTimeout(() => listeningRestartRef.current?.(), 250)
    }
  }
  processTurnRef.current = processSpokenTurn

  const choices = exercise?.choices || (
    exercise?.answer != null
      ? [exercise.answer, Number(exercise.answer) + 1, Math.max(0, Number(exercise.answer) - 1)]
        .filter((value, index, list) => list.indexOf(value) === index)
        .slice(0, 3)
      : []
  )

  return (
    <div className="syllabus-world syllabus-world--math" lang={language} dir={languageDirection(language)}>
      <World world={engagement?.world || { id: 'meadow', unlocked: ['meadow'] }} warmth={0.8} />
      <Confetti burst={confetti} />
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onExit} aria-label={copy.back}>←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">{copy.numberNest}</div>
      </header>

      <main className="syllabus-playground">
        <section className="syllabus-pip-zone">
          <Character
            state={
              phase === 'scoring'
                ? 'gentle'
                : phase === 'listening'
                  ? 'listening'
                  : voiceState.speaking
                    ? 'model'
                    : 'idle'
            }
            size={300}
          />
        </section>

        <section className="syllabus-challenge">
          <p className="syllabus-kicker">{copy.numberKicker}</p>
          <h1>{exercise?.prompt || copy.defaultMathPrompt}</h1>
          <div className="syllabus-bubble" aria-live="polite">
            <span>{copy.coachSays}</span>
            {error || message}
          </div>

          {exercise && (
            <div className="math-board">
              <QuantityDots count={exercise.quantity ?? exercise.left_quantity ?? exercise.answer} />
              {exercise.numeral_alive != null && (
                <strong className="math-numeral">{exercise.numeral_alive}</strong>
              )}
              {choices.length > 0 && (
                <div className="math-choices">
                  {choices.map((choice) => (
                    <button
                      key={String(choice)}
                      type="button"
                      className="math-choice"
                      disabled={phase === 'scoring' || phase === 'loading'}
                      onClick={() => chooseAnswer(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="syllabus-controls">
            <div className={`hands-free-orb ${phase === 'listening' ? 'is-listening' : ''}`} role="status">
              <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
              <strong>{phase === 'scoring' ? copy.thinking : copy.noTap}</strong>
            </div>
            <button type="button" className="syllabus-secondary" onClick={onExit}>
              {copy.back}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
