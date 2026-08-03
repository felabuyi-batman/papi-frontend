import assert from 'node:assert/strict'
import test from 'node:test'
import {
  childSafeFeedback,
  initialSessionState,
  sessionModeForRecommendation,
  sessionReducer,
  SESSION_PHASES,
  stageForSession,
} from '../src/child/sessionMachine.js'

test('routes every backend recommendation without duplicating clinical decisions', () => {
  assert.equal(sessionModeForRecommendation('pairs'), 'pairs')
  assert.equal(sessionModeForRecommendation('conversation'), 'conversation')
  assert.equal(sessionModeForRecommendation('live'), 'conversation')
  assert.equal(sessionModeForRecommendation('drill'), 'drill')
  assert.equal(sessionModeForRecommendation('math'), 'math')

  assert.equal(stageForSession({ recommendedMode: 'pairs', session: {} }), 'pairs')
  assert.equal(stageForSession({ recommendedMode: 'live', session: {} }), 'live')
  assert.equal(stageForSession({ recommendedMode: 'graduation', session: {} }), 'graduation')
  assert.equal(stageForSession({ recommendedMode: 'free_play', session: {} }), 'free_play')
  assert.equal(stageForSession({ recommendedMode: 'math', session: {} }), 'math')
})

test('maps SpeechC ladder levels to their child interaction', () => {
  const stageAt = (ladderLevel, practiceMode = 'drill') => stageForSession({
    recommendedMode: 'drill',
    session: {
      practice_mode: practiceMode,
      target: { ladder_level: ladderLevel },
    },
  })

  assert.equal(stageAt(0, 'model_imitate'), 'model_imitate')
  assert.equal(stageAt(1, 'model_imitate'), 'model_imitate')
  assert.equal(stageAt(2), 'word_naming')
  assert.equal(stageAt(3), 'phrase')
  assert.equal(stageAt(4), 'sentence')
  assert.equal(stageAt(5), 'conversation')
  assert.equal(
    stageForSession({ recommendedMode: 'conversation', session: { target: { ladder_level: 0 } } }),
    'conversation',
  )
})

test('state machine follows one bounded turn and rejects stuck transitions', () => {
  const transition = (state, phase) => sessionReducer(state, {
    type: 'transition',
    phase,
  })
  let state = initialSessionState
  for (const phase of [
    SESSION_PHASES.opening,
    SESSION_PHASES.modeling,
    SESSION_PHASES.ready,
    SESSION_PHASES.listening,
    SESSION_PHASES.scoring,
    SESSION_PHASES.feedback,
    SESSION_PHASES.reward,
    SESSION_PHASES.ready,
  ]) {
    state = transition(state, phase)
    assert.equal(state.phase, phase)
  }

  state = transition(state, SESSION_PHASES.reward)
  assert.equal(state.phase, SESSION_PHASES.recoverableError)
  assert.match(state.error, /lost the turn/i)
  state = sessionReducer(state, { type: 'recover' })
  assert.equal(state.phase, SESSION_PHASES.ready)
})

test('conversation self-rating transitions to quiet scoring', () => {
  let state = {
    ...initialSessionState,
    phase: SESSION_PHASES.listening,
  }
  state = sessionReducer(state, { type: 'transition', phase: SESSION_PHASES.scoring })
  state = sessionReducer(state, { type: 'transition', phase: SESSION_PHASES.selfRating })
  state = sessionReducer(state, { type: 'transition', phase: SESSION_PHASES.scoring })
  assert.equal(state.phase, SESSION_PHASES.scoring)
})

test('feedback never exposes numerical or negative clinical language', () => {
  assert.equal(
    childSafeFeedback({ outcome: 'incorrect', coach: { kid_line: 'Watch Pip’s beak!' } }, 'sun'),
    'Watch Pip’s beak!',
  )
  const fallback = childSafeFeedback({ outcome: 'incorrect' }, 'sun')
  assert.doesNotMatch(fallback, /wrong|incorrect|score|percent|\d+/i)
})
