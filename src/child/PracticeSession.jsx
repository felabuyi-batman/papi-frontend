import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { api } from '../api.js'
import { ChildVoiceSession } from '../voice/ChildVoiceSession.js'
import Character from './Character.jsx'
import {
  BerryFlight,
  Basket,
  Confetti,
  FriendBird,
  HatchOverlay,
  sfx,
} from './GameBits.jsx'
import {
  childSafeFeedback,
  initialSessionState,
  sessionModeForRecommendation,
  sessionReducer,
  SESSION_PHASES,
  stageForSession,
} from './sessionMachine.js'
import World from './World.jsx'
import { childCopy, languageDirection } from './i18n.js'
import './child-world.css'

function stageLabel(stage, copy) {
  const stageIndex = ['model_imitate', 'word_naming', 'pairs', 'phrase', 'sentence', 'conversation', 'live'].indexOf(stage)
  return copy.stages[stageIndex] || copy.stages[0]
}

function promptLine(stage, promptWord, cue, copy) {
  const promptIndex = { model_imitate: 0, word_naming: 1, phrase: 2, sentence: 3, pairs: 4 }[stage]
  if (promptIndex != null) return copy.prompts[promptIndex](promptWord)
  if (stage === 'conversation' || stage === 'live') {
    return promptWord || 'Tell Pip what happened next.'
  }
  return cue || `Say ${promptWord}.`
}

function Picture({ picture, word }) {
  const pictureUrl = api.pictureUrl(picture)
  if (pictureUrl) {
    return (
      <img
        className="syllabus-picture"
        src={pictureUrl}
        alt={picture.word || word}
        draggable="false"
      />
    )
  }
  return <span className="syllabus-emoji" aria-hidden="true">{picture?.emoji || '✨'}</span>
}

function PairChoice({ pair, selected, onSelect, disabled }) {
  if (!pair) return null
  const choices = [
    { word: pair.target, picture: pair.target_picture },
    { word: pair.foil, picture: pair.foil_picture },
  ]
  return (
    <div className="pair-choice" aria-label="Choose the picture Pip named">
      {choices.map((choice) => (
        <button
          key={choice.word}
          type="button"
          className={`pair-choice__card ${selected === choice.word ? 'is-selected' : ''}`}
          onClick={() => onSelect(choice.word)}
          disabled={disabled}
        >
          <Picture picture={choice.picture} word={choice.word} />
          <strong>{choice.word}</strong>
        </button>
      ))}
    </div>
  )
}

function SelfRating({ onRate }) {
  return (
    <div className="self-rating" role="group" aria-label="How did that sound to you?">
      <p>Did you hear your special sound?</p>
      <div>
        <button type="button" onClick={() => onRate(true)}>I heard it</button>
        <button type="button" onClick={() => onRate(false)}>Not yet</button>
      </div>
    </div>
  )
}

export default function PracticeSession({
  child,
  engagement,
  recommendedMode = 'drill',
  onExit,
  onSessionComplete,
}) {
  const language = child.language || engagement?.language || 'en'
  const copy = childCopy(language)
  const [machine, dispatch] = useReducer(sessionReducer, initialSessionState)
  const [session, setSession] = useState(null)
  const [voiceState, setVoiceState] = useState({
    connected: false,
    fallback: false,
    speaking: false,
    childSpeaking: false,
  })
  const [promptIndex, setPromptIndex] = useState(0)
  const [pairIndex, setPairIndex] = useState(0)
  const [selectedPairWord, setSelectedPairWord] = useState(null)
  const [attempt, setAttempt] = useState(1)
  const [feedback, setFeedback] = useState('')
  const [coachViseme, setCoachViseme] = useState('')
  const [pendingRatingBlob, setPendingRatingBlob] = useState(null)
  const [berries, setBerries] = useState(0)
  const [berryFlight, setBerryFlight] = useState(0)
  const [confetti, setConfetti] = useState(0)
  const [hatchFriendIndex, setHatchFriendIndex] = useState(null)
  const [recap, setRecap] = useState(null)
  const voiceRef = useRef(new ChildVoiceSession(api))
  const endRequestedRef = useRef(false)
  const turnSubmissionInProgressRef = useRef(false)
  const processTurnRef = useRef(null)

  const stage = useMemo(
    () => stageForSession({ recommendedMode, session }),
    [recommendedMode, session],
  )
  const prompts = session?.target?.prompts || []
  const pair = session?.minimal_pairs?.[pairIndex % Math.max(1, session?.minimal_pairs?.length || 1)]
  const conversationTasks = session?.conversation_tasks || []
  const currentPrompt = stage === 'pairs'
    ? { word: pair?.target || session?.target?.prompts?.[0]?.word, picture: pair?.target_picture }
    : (stage === 'conversation' || stage === 'live')
      ? {
        word: conversationTasks[promptIndex % Math.max(1, conversationTasks.length)]?.child_prompt
          || prompts[promptIndex % Math.max(1, prompts.length)]?.word,
      }
      : prompts[promptIndex % Math.max(1, prompts.length)]
  const promptWord = currentPrompt?.word || session?.target?.phoneme || 'your sound'
  const pipLine = feedback || promptLine(stage, promptWord, session?.target?.cue, copy)
  // Keep conversation/live voice-first — self-rating buttons break the turn flow.
  const shouldUseSelfRating = false
  const isListening = machine.phase === SESSION_PHASES.listening
  const isBusy = [
    SESSION_PHASES.loading,
    SESSION_PHASES.opening,
    SESSION_PHASES.modeling,
    SESSION_PHASES.scoring,
    SESSION_PHASES.feedback,
    SESSION_PHASES.reward,
  ].includes(machine.phase)

  const restoreHandsFreeListening = useCallback(async (readyMessage = copy.listening) => {
    const realtimeConnected = voiceRef.current.snapshot.connected
    voiceRef.current.setHandsFree(realtimeConnected)
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.listening,
      message: readyMessage,
    })
    if (!realtimeConnected) {
      try {
        await voiceRef.current.beginCapture({ maxMs: 5200 })
      } catch {
        dispatch({ type: 'transition', phase: SESSION_PHASES.ready, message: copy.reconnecting })
      }
    }
  }, [copy.listening, copy.reconnecting])

  const finishSession = useCallback(async () => {
    if (!session || endRequestedRef.current) return
    endRequestedRef.current = true
    voiceRef.current.setHandsFree(false)
    try {
      const transcript = voiceRef.current.getTranscript()
      if (transcript.length) await api.saveTranscript(session.session_id, transcript)
      const finalRecap = await api.endSession(session.session_id, berries)
      setRecap(finalRecap)
    } catch (error) {
      setRecap({ recap: 'Every brave try helped Pip’s meadow grow.' })
    }
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.complete,
      message: session.episode?.cliffhanger || 'The meadow will be waiting tomorrow.',
    })
    setConfetti((value) => value + 1)
    onSessionComplete?.()
  }, [berries, onSessionComplete, session])

  const moveToNextTurn = useCallback(async (result) => {
    const move = result?.coach?.move
    const retryCap = session?.target?.retry_cap || 3
    const shouldRetry = ['retry', 'model', 'place'].includes(move)
      && attempt < retryCap
      && !result?.session_done
      && !result?.exercise_complete

    if (result?.session_done || machine.turn >= 7) {
      await finishSession()
      return
    }
    if (shouldRetry) {
      setAttempt((value) => value + 1)
      setFeedback(childSafeFeedback(result, promptWord))
      dispatch({
        type: 'transition',
        phase: SESSION_PHASES.modeling,
        message: 'Watch Pip’s little clue.',
      })
      await voiceRef.current.speak(result?.coach?.kid_line || session?.target?.cue || promptWord)
      // Hands-free conversation reopens its listening window. Tap-to-talk modes
      // return to ready so silence is never submitted as another child turn.
      await restoreHandsFreeListening(copy.listening)
      return
    }

    const nextExercise = result?.next_exercise
    if (nextExercise) {
      const word = nextExercise.expected_text || nextExercise.display_label || promptWord
      setSession((current) => ({
        ...current,
        exercise: nextExercise,
        target: {
          ...(current?.target || {}),
          target_id: nextExercise.id || current?.target?.target_id,
          phoneme: nextExercise.target_phoneme || current?.target?.phoneme,
          prompts: [{
            word,
            prompt: nextExercise.prompt || `Say ${word}`,
            image_url: nextExercise.image_url,
            cue: nextExercise.cue || nextExercise.placement_cue,
          }],
          cue: nextExercise.cue || nextExercise.placement_cue || current?.target?.cue,
          model_lines: nextExercise.model_lines || [],
        },
      }))
    }

    setAttempt(1)
    setFeedback('')
    setCoachViseme('')
    setSelectedPairWord(null)
    setPromptIndex(0)
    setPairIndex((value) => value + 1)
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.ready,
      incrementTurn: true,
      message: copy.newAdventure,
    })
    await restoreHandsFreeListening(copy.listening)
  }, [attempt, copy.listening, finishSession, machine.turn, promptWord, restoreHandsFreeListening, session])

  const submitTurn = useCallback(async (blob, selfRating = null) => {
    if (!blob?.size || !session) {
      dispatch({
        type: 'error',
        error: copy.silence,
      })
      await restoreHandsFreeListening(copy.listening)
      return
    }
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.scoring,
      message: 'Pip is listening to your brave try…',
    })
    try {
      const result = await api.submitTrial(session.session_id, {
        targetId: session.target.target_id,
        exerciseId: session.exercise?.id || session.target.target_id,
        promptWord,
        attempt,
        blob,
        selfRating,
        clientTranscript: voiceRef.current.latestChildTranscript?.()
          || voiceRef.current.getTranscript().slice(-1)[0]?.text
          || null,
      })
      const childLine = childSafeFeedback(result, promptWord)
      setFeedback(childLine)
      setCoachViseme(result?.coach?.viseme || '')
      if (result.celebrate) {
        const nextBerryCount = berries + 1
        setBerries(nextBerryCount)
        setBerryFlight((value) => value + 1)
        if (nextBerryCount % 5 === 0) {
          setHatchFriendIndex((nextBerryCount / 5 - 1) % 4)
        }
        if (result?.changes?.advanced || result?.changes?.mastered) {
          setConfetti((value) => value + 1)
        }
        sfx.correct()
      } else {
        sfx.gentle()
      }
      dispatch({
        type: 'transition',
        phase: SESSION_PHASES.feedback,
        message: childLine,
      })
      await voiceRef.current.speak(childLine)
      if (result.celebrate) {
        dispatch({
          type: 'transition',
          phase: SESSION_PHASES.reward,
          message: 'The meadow grew from that try!',
        })
        await new Promise((resolve) => window.setTimeout(resolve, 550))
      }
      await moveToNextTurn(result)
    } catch (error) {
      dispatch({
        type: 'error',
        error: error.message,
        recoverTo: SESSION_PHASES.ready,
      })
    }
  }, [attempt, berries, copy.listening, copy.silence, moveToNextTurn, promptWord, restoreHandsFreeListening, session])
  processTurnRef.current = async (blob) => {
    if (turnSubmissionInProgressRef.current) return
    turnSubmissionInProgressRef.current = true
    // Pause VAD only while we score/speak; restore after the turn so live chat continues.
    voiceRef.current.setHandsFree(false)
    if (shouldUseSelfRating) {
      setPendingRatingBlob(blob)
      dispatch({
        type: 'transition',
        phase: SESSION_PHASES.scoring,
        message: 'Pip heard your story.',
      })
      dispatch({
        type: 'transition',
        phase: SESSION_PHASES.selfRating,
        message: 'One quick check with your listening ears.',
      })
    } else {
      try {
        await submitTurn(blob)
      } finally {
        turnSubmissionInProgressRef.current = false
      }
    }
  }

  useEffect(() => {
    const voice = voiceRef.current
    return voice.subscribe((event) => {
      if (event.type === 'state') setVoiceState(event.state)
      if (event.type === 'utterance') processTurnRef.current?.(event.blob)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const voice = voiceRef.current
    const sessionMode = sessionModeForRecommendation(recommendedMode)
    ;(async () => {
      try {
        const sessionPayload = await api.startSession(child.id, sessionMode)
        if (cancelled) return
        setSession(sessionPayload)
        dispatch({
          type: 'transition',
          phase: SESSION_PHASES.opening,
          message: sessionPayload.episode?.opening || engagement?.greeting || 'Pip found today’s adventure!',
        })
        const resolvedStage = stageForSession({ recommendedMode, session: sessionPayload })
        const conversationalStage = resolvedStage === 'live' || resolvedStage === 'conversation'
        const voiceConnection = voice.connect({
          childId: child.id,
          sessionId: sessionPayload.session_id,
          mode: conversationalStage ? 'conversation' : 'practice',
          automaticResponses: conversationalStage,
          language: child.language || engagement?.language || 'en',
        })
        await voice.speak(
          sessionPayload.episode?.opening
          || engagement?.greeting
          || `Hi ${child.display_name}! Let’s play with sounds.`,
        )
        if (cancelled) return
        if (
          !conversationalStage
          && (resolvedStage === 'model_imitate' || sessionPayload.exercise?.model_lines?.length)
        ) {
          dispatch({
            type: 'transition',
            phase: SESSION_PHASES.modeling,
            message: copy.modeling,
          })
          const modelLine = String(
            sessionPayload.exercise?.model_lines?.[0]
            || sessionPayload.target?.prompts?.[0]?.word
            || sessionPayload.target?.phoneme
            || 'sss',
          )
          await voice.speak(modelLine)
        }
        if (cancelled) return
        const connectionState = await voiceConnection
        if (cancelled) return
        const handsFreeReady = connectionState.connected
        voice.setHandsFree(handsFreeReady)
        if (handsFreeReady) {
          dispatch({
            type: 'transition',
            phase: SESSION_PHASES.listening,
            message: copy.listening,
          })
        } else {
          await restoreHandsFreeListening(copy.listening)
        }
      } catch (error) {
        if (!cancelled) dispatch({ type: 'error', error: error.message })
      }
    })()
    return () => {
      cancelled = true
      voice.disconnect()
    }
  }, [child.id, child.display_name, copy.listening, copy.modeling, engagement?.greeting, engagement?.language, recommendedMode, restoreHandsFreeListening])

  useEffect(() => {
    const nextPrompt = prompts[(promptIndex + 1) % Math.max(1, prompts.length)]
    if (!nextPrompt?.picture?.url) return undefined
    const image = new Image()
    image.src = api.pictureUrl(nextPrompt.picture)
    return undefined
  }, [promptIndex, prompts])

  const handleSelfRating = async (rating) => {
    const blob = pendingRatingBlob
    setPendingRatingBlob(null)
    try {
      await submitTurn(blob, rating)
    } finally {
      turnSubmissionInProgressRef.current = false
    }
  }

  const modelAgain = async () => {
    if (isBusy || !session) return
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.modeling,
      message: 'Pip will show it one more time.',
    })
    await voiceRef.current.speak(promptLine(stage, promptWord, session.target?.cue, copy))
    dispatch({
      type: 'transition',
      phase: SESSION_PHASES.ready,
      message: 'Now it’s your turn.',
    })
  }

  if (machine.phase === SESSION_PHASES.complete) {
    return (
      <div className="syllabus-world syllabus-world--complete" lang={language} dir={languageDirection(language)}>
        <World world={engagement?.world} warmth={1} />
        <Confetti burst={confetti} />
        <main className="session-complete">
          <Character state="celebrate" size={280} />
          <p className="syllabus-kicker">{copy.practiceComplete}</p>
          <h1>{copy.completeTitle}</h1>
          <p>{recap?.celebration || recap?.celebration_message || recap?.recap || machine.message}</p>
          {recap?.parent_summary && (
            <p className="session-parent-summary">{recap.parent_summary}</p>
          )}
          {session?.episode?.cliffhanger && (
            <div className="session-cliffhanger">
              <span>{copy.nextTime}</span>
              {session.episode.cliffhanger}
            </div>
          )}
          <button type="button" className="syllabus-primary" onClick={onExit}>
            {copy.flyBack}
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className={`syllabus-world syllabus-world--${stage}`} lang={language} dir={languageDirection(language)}>
      <World world={engagement?.world} warmth={Math.min(1, berries / 8)} />
      <Confetti burst={confetti} />
      {hatchFriendIndex !== null && (
        <HatchOverlay
          friendIndex={hatchFriendIndex}
          onDone={() => setHatchFriendIndex(null)}
        />
      )}
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onExit} aria-label={copy.leave}>←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">
          <i aria-hidden="true" />
            {stageLabel(stage, copy)}
        </div>
      </header>

      <main className="syllabus-playground">
        <section className="syllabus-pip-zone" aria-label="Pip’s side of the meadow">
          <div className="syllabus-friends" aria-hidden="true">
            {(engagement?.friends || []).slice(0, 3).map((friend, index) => (
              <FriendBird key={friend.id} index={index} size={70} />
            ))}
          </div>
          <Character
            state={
              voiceState.speaking || machine.phase === SESSION_PHASES.modeling
                ? 'model'
                : voiceState.childSpeaking || isListening
                  ? 'listening'
                  : machine.phase === SESSION_PHASES.reward
                    ? 'celebrate'
                    : 'idle'
            }
            onTap={modelAgain}
            size={330}
          />
          <div className="syllabus-basket">
            <Basket filled={Math.min(berries, 10)} capacity={10} />
            <BerryFlight trigger={berryFlight} />
          </div>
        </section>

        <section className="syllabus-challenge">
          <p className="syllabus-kicker">
            {session?.production_band?.replaceAll?.('_', ' ') || 'TODAY’S SOUND ADVENTURE'}
          </p>
          <div className="syllabus-bubble" aria-live="polite">
                <span>{copy.coachSays}</span>
            {machine.phase === SESSION_PHASES.recoverableError ? machine.error : pipLine}
            {coachViseme && machine.phase !== SESSION_PHASES.recoverableError && (
              <small className="coach-viseme">{coachViseme}</small>
            )}
          </div>

          {stage === 'pairs' ? (
            <PairChoice
              pair={pair}
              selected={selectedPairWord}
              onSelect={(word) => {
                setSelectedPairWord(word)
                voiceRef.current.speak(word)
              }}
              disabled={isBusy}
            />
          ) : (
            <div className={`syllabus-prompt-card syllabus-prompt-card--${stage}`}>
              <Picture picture={currentPrompt?.picture} word={promptWord} />
              <strong>{promptWord}</strong>
              {session?.target?.cue && stage === 'model_imitate' && (
                <small>{session.target.cue}</small>
              )}
            </div>
          )}

          {machine.phase === SESSION_PHASES.selfRating ? (
            <SelfRating onRate={handleSelfRating} />
          ) : (
            <div className="syllabus-controls">
              <div className={`hands-free-orb ${isListening ? 'is-listening' : ''}`} role="status">
                <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                <strong>{isBusy ? copy.thinking : copy.noTap}</strong>
              </div>
              <button
                type="button"
                className="syllabus-hear-again"
                onClick={modelAgain}
                disabled={isBusy}
              >
                {copy.hearAgain}
              </button>
            </div>
          )}
          {voiceState.fallback && (
            <p className="voice-fallback-note">
              {copy.reconnecting}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
