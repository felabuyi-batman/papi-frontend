/**
 * Regression judges for the SpeechC child-dashboard conversational loop.
 * These fail if we regress to band-label retries / muted fallback capture /
 * ladder stages that ignore conversation recommendations.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  SESSION_PHASES,
  sessionReducer,
  stageForSession,
} from '../src/child/sessionMachine.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const readSrc = (relativePath) => readFileSync(path.join(root, '..', relativePath), 'utf8')

test('normalizeUtterance prefers SpeechC coach copy over band "Let\'s try again"', () => {
  const apiSource = readSrc('src/api.js')
  const normalizeBlock = apiSource.slice(
    apiSource.indexOf('function normalizeUtterance'),
    apiSource.indexOf('export const api'),
  )
  assert.match(normalizeBlock, /result\.ai_feedback/)
  assert.match(normalizeBlock, /coach_turns/)
  // Band kid_label must be the fallback, not the first preference.
  const aiIndex = normalizeBlock.indexOf('result.ai_feedback')
  const bandIndex = normalizeBlock.indexOf('band.kid_label')
  assert.ok(aiIndex > -1 && bandIndex > -1, 'both coach and band sources present')
  assert.ok(aiIndex < bandIndex, 'ai_feedback must win over band.kid_label')
})

test('fallback capture unmutes the microphone track', () => {
  const voiceSource = readSrc('src/voice/ChildVoiceSession.js')
  const beginBlock = voiceSource.slice(
    voiceSource.indexOf('async beginCapture'),
    voiceSource.indexOf('async endCapture'),
  )
  assert.match(beginBlock, /localTrack\.enabled = true/)
  assert.doesNotMatch(beginBlock, /localTrack\.enabled = this\.connected/)
  assert.match(voiceSource, /#startBrowserSpeechCapture/)
  assert.match(voiceSource, /latestChildTranscript/)
})

test('OpenAI Realtime text is rendered by ElevenLabs with child barge-in', () => {
  const voiceSource = readSrc('src/voice/ChildVoiceSession.js')
  const landingVoiceSource = readSrc('src/voice/PipVoiceBridge.js')
  assert.match(voiceSource, /response\.output_text\.delta/)
  assert.match(voiceSource, /#speakWithCoachTts\(completedText\)/)
  assert.match(voiceSource, /this\.#interruptCoachSpeech\(\)/)
  assert.match(voiceSource, /type: 'response\.cancel'/)
  const speakBlock = voiceSource.slice(
    voiceSource.indexOf('async speak(text)'),
    voiceSource.indexOf('setHandsFree(enabled)'),
  )
  assert.match(speakBlock, /return this\.#speakWithCoachTts\(line\)/)
  assert.doesNotMatch(speakBlock, /output_modalities: \['audio'\]/)
  assert.match(voiceSource, /this\.remoteAudio\.muted = true/)
  assert.match(landingVoiceSource, /api\.coachTts\(line\)/)
  assert.match(landingVoiceSource, /this\.remoteAudioElement\.muted = true/)
  assert.match(landingVoiceSource, /await this\.#speakWithCoachTts\(completedText\)/)
})

test('conversation recommendation is not flattened into drill stages', () => {
  assert.equal(
    stageForSession({
      recommendedMode: 'conversation',
      session: { practice_mode: 'model_imitate', target: { ladder_level: 0 } },
    }),
    'conversation',
  )
  assert.equal(
    stageForSession({
      recommendedMode: 'live',
      session: { target: { ladder_level: 2 } },
    }),
    'live',
  )
  assert.equal(
    stageForSession({
      recommendedMode: 'drill',
      session: { target: { ladder_level: 3 } },
    }),
    'phrase',
  )
})

test('feedback and modeling can auto-open listening without recoverable error', () => {
  let state = { ...sessionReducer({ phase: SESSION_PHASES.loading }, { type: 'reset' }), phase: SESSION_PHASES.feedback }
  state = sessionReducer(state, { type: 'transition', phase: SESSION_PHASES.listening })
  assert.equal(state.phase, SESSION_PHASES.listening)
  assert.equal(state.error, null)

  state = sessionReducer(
    { ...state, phase: SESSION_PHASES.modeling },
    { type: 'transition', phase: SESSION_PHASES.listening },
  )
  assert.equal(state.phase, SESSION_PHASES.listening)
})

test('PracticeSession stays voice-first for conversation turns', () => {
  const practiceSource = readSrc('src/child/PracticeSession.jsx')
  assert.match(practiceSource, /shouldUseSelfRating = false/)
  assert.doesNotMatch(practiceSource, /syllabus-mic/)
  assert.match(practiceSource, /automaticResponses: conversationalStage/)
  assert.match(practiceSource, /restoreHandsFreeListening/)
  assert.match(practiceSource, /beginCapture\(\{ maxMs: 5200 \}\)/)
})

test('Realtime conversation produces one synchronized teaching response per child turn', () => {
  const voiceSource = readSrc('src/voice/ChildVoiceSession.js')
  const practiceSource = readSrc('src/child/PracticeSession.jsx')
  const speechStartedBlock = voiceSource.slice(
    voiceSource.indexOf("payload.type === 'input_audio_buffer.speech_started'"),
    voiceSource.indexOf("payload.type === 'input_audio_buffer.speech_stopped'"),
  )

  assert.match(speechStartedBlock, /if \(!this\.automaticResponses\)/)
  assert.match(voiceSource, /processedToolCallIds\.has\(callKey\)/)
  assert.match(voiceSource, /session: \{ instructions: toolResult\.instructions \}/)
  assert.match(practiceSource, /event\.type === 'tool-result'/)
  assert.match(practiceSource, /result\.reply_hint/)
  assert.match(practiceSource, /result\.lesson_complete/)
})
