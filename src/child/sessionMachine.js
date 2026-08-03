export const SESSION_PHASES = Object.freeze({
  loading: 'loading',
  opening: 'opening',
  modeling: 'modeling',
  ready: 'ready',
  listening: 'listening',
  scoring: 'scoring',
  feedback: 'feedback',
  selfRating: 'self-rating',
  reward: 'reward',
  complete: 'complete',
  recoverableError: 'recoverable-error',
})

export const initialSessionState = Object.freeze({
  phase: SESSION_PHASES.loading,
  message: 'Pip is finding today’s adventure…',
  recoverTo: SESSION_PHASES.ready,
  error: null,
  turn: 0,
})

const ALLOWED = {
  [SESSION_PHASES.loading]: [SESSION_PHASES.opening, SESSION_PHASES.recoverableError],
  [SESSION_PHASES.opening]: [
    SESSION_PHASES.modeling,
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.modeling]: [
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.ready]: [
    SESSION_PHASES.modeling,
    SESSION_PHASES.listening,
    SESSION_PHASES.complete,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.listening]: [
    SESSION_PHASES.scoring,
    SESSION_PHASES.ready,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.scoring]: [
    SESSION_PHASES.feedback,
    SESSION_PHASES.selfRating,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.feedback]: [
    SESSION_PHASES.reward,
    SESSION_PHASES.modeling,
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.complete,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.selfRating]: [
    SESSION_PHASES.scoring,
    SESSION_PHASES.feedback,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.reward]: [
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.complete,
    SESSION_PHASES.recoverableError,
  ],
  [SESSION_PHASES.complete]: [],
  [SESSION_PHASES.recoverableError]: [
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.complete,
  ],
}

export function sessionReducer(state, action) {
  if (action.type === 'reset') {
    return { ...initialSessionState, ...action.state }
  }
  if (action.type === 'error') {
    return {
      ...state,
      phase: SESSION_PHASES.recoverableError,
      error: action.error || 'Pip hiccuped. Tap to try again.',
      recoverTo: action.recoverTo || SESSION_PHASES.ready,
    }
  }
  if (action.type === 'recover') {
    return {
      ...state,
      phase: state.recoverTo || SESSION_PHASES.ready,
      error: null,
    }
  }
  if (action.type !== 'transition') return state

  const nextPhase = action.phase
  const allowed = ALLOWED[state.phase] || []
  if (!allowed.includes(nextPhase)) {
    return {
      ...state,
      phase: SESSION_PHASES.recoverableError,
      error: 'Pip lost the turn. Tap to continue.',
      recoverTo: SESSION_PHASES.ready,
    }
  }
  return {
    ...state,
    phase: nextPhase,
    message: action.message ?? state.message,
    error: null,
    turn: action.incrementTurn ? state.turn + 1 : state.turn,
  }
}

export function sessionModeForRecommendation(recommendedMode) {
  if (recommendedMode === 'math') return 'math'
  if (recommendedMode === 'pairs') return 'pairs'
  if (recommendedMode === 'conversation' || recommendedMode === 'live') {
    return 'conversation'
  }
  return 'drill'
}

export function stageForSession({ recommendedMode, session }) {
  if (recommendedMode === 'graduation') return 'graduation'
  if (recommendedMode === 'free_play') return 'free_play'
  if (recommendedMode === 'math') return 'math'
  if (recommendedMode === 'pairs' || session?.mode === 'pairs') return 'pairs'
  if (recommendedMode === 'live') return 'live'
  // Honor SpeechC conversation recommendation before ladder drill gates.
  if (recommendedMode === 'conversation' || session?.mode === 'conversation') {
    return 'conversation'
  }

  // Backend ladder: isolation=0, syllable=1, word=2, phrase=3, sentence=4, conversation=5
  const ladderLevel = session?.target?.ladder_level ?? 0
  const practiceMode = session?.practice_mode
  if (practiceMode === 'model_imitate' || ladderLevel <= 1) return 'model_imitate'
  if (ladderLevel === 2) return 'word_naming'
  if (ladderLevel === 3) return 'phrase'
  if (ladderLevel === 4) return 'sentence'
  if (ladderLevel >= 5) return 'conversation'
  return 'word_naming'
}

export function childSafeFeedback(result, word) {
  const coachLine = String(result?.coach?.kid_line || '').trim()
  if (coachLine) return coachLine
  if (result?.outcome === 'correct' && result?.celebrate !== false) {
    return `I loved hearing ${word}!`
  }
  if (result?.outcome === 'incorrect') {
    return `Watch me once more: ${word}.`
  }
  return 'Thanks for that try. Let’s keep flying!'
}
