import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { ChildVoiceSession } from '../voice/ChildVoiceSession.js'
import Character from './Character.jsx'
import { Confetti } from './GameBits.jsx'
import World from './World.jsx'
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
  const [session, setSession] = useState(null)
  const [exercise, setExercise] = useState(null)
  const [message, setMessage] = useState('Pip is counting berries…')
  const [phase, setPhase] = useState('loading')
  const [confetti, setConfetti] = useState(0)
  const [error, setError] = useState(null)
  const [voiceState, setVoiceState] = useState({})
  const voiceRef = useRef(new ChildVoiceSession(api))
  const submitRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const voice = voiceRef.current
    const unsubscribe = voice.subscribe((event) => {
      if (event.type === 'state') setVoiceState(event.state)
      if (event.type === 'utterance') {
        // Spoken math path — send transcript hint via empty attempt after capture.
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
          || `Hi ${child.display_name}! Let’s count with Pip.`
        setMessage(opening)
        setPhase('ready')
        voice.connect({
          childId: child.id,
          sessionId: payload.session_id,
          mode: 'practice',
          language: child.language || engagement?.language || 'en',
        }).catch(() => {})
        await voice.speak(opening)
      } catch (requestError) {
        if (!cancelled) setError(requestError.message)
      }
    })()
    return () => {
      cancelled = true
      unsubscribe()
      voice.disconnect()
    }
  }, [child.display_name, child.id, child.language, engagement?.language])

  async function applyResult(result) {
    const kidLine = result.feedback_band?.kid_label
      || result.message
      || result.coach_line
      || (result.correct ? 'Berry bright counting!' : 'Let’s count once more.')
    setMessage(kidLine)
    await voiceRef.current.speak(kidLine)
    if (result.correct || result.ok) {
      setConfetti((value) => value + 1)
    }
    if (result.next_exercise || result.exercise) {
      setExercise(result.next_exercise || result.exercise)
      setPhase('ready')
      return
    }
    if (result.kind === 'topic_jump' && result.exercise) {
      setExercise(result.exercise)
      setPhase('ready')
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
    }
  }

  async function handleMicrophone() {
    if (error) {
      setError(null)
      setPhase('ready')
      return
    }
    if (voiceState.childSpeaking) {
      const blob = await voiceRef.current.endCapture()
      if (!blob?.size) {
        setError('Pip didn’t catch that. Tap and try again.')
        return
      }
      setPhase('scoring')
      try {
        // Prefer spoken number path; transcript may be empty without realtime.
        const result = await api.mathUtterance(
          session.session_id,
          String(exercise?.answer ?? ''),
        )
        await applyResult(result)
      } catch (requestError) {
        setError(requestError.message)
        setPhase('ready')
      }
      return
    }
    try {
      setPhase('listening')
      setMessage('I’m listening for your number…')
      await voiceRef.current.beginCapture({ maxMs: 4000 })
    } catch {
      setError('A grown-up can check the microphone, then tap Try again.')
    }
  }
  submitRef.current = handleMicrophone

  const choices = exercise?.choices || (
    exercise?.answer != null
      ? [exercise.answer, Number(exercise.answer) + 1, Math.max(0, Number(exercise.answer) - 1)]
        .filter((value, index, list) => list.indexOf(value) === index)
        .slice(0, 3)
      : []
  )

  return (
    <div className="syllabus-world syllabus-world--math">
      <World world={engagement?.world || { id: 'meadow', unlocked: ['meadow'] }} warmth={0.8} />
      <Confetti burst={confetti} />
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onExit} aria-label="Back">←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">Number nest</div>
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
          <p className="syllabus-kicker">NUMBER NEST</p>
          <h1>{exercise?.prompt || 'How many berries?'}</h1>
          <div className="syllabus-bubble" aria-live="polite">
            <span>PIP SAYS</span>
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
            <button
              type="button"
              className={`syllabus-mic ${phase === 'listening' ? 'is-listening' : ''}`}
              onClick={handleMicrophone}
              disabled={phase === 'loading' || phase === 'scoring'}
            >
              {phase === 'listening' ? 'I’m done' : 'Speak the number'}
            </button>
            <button type="button" className="syllabus-secondary" onClick={onExit}>
              Back to nest
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
