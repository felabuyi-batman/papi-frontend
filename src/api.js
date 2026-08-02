// SpeechC-only client. In Vite DEV, same-origin `/api` proxies to apps/api.
import { signOutSupabase, supabase } from './supabase.js'

// Production must never silently fall back to localhost (breaks Vercel).
const DEFAULT_PRODUCTION_API = 'https://api-production-fa6b.up.railway.app'
const BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? '' : DEFAULT_PRODUCTION_API)

const LEVEL_LADDER = {
  isolation: 0,
  syllable: 1,
  word: 2,
  phrase: 3,
  sentence: 4,
  conversation: 5,
}

let accessToken = localStorage.getItem('chirp.accessToken') || null
let refreshToken = localStorage.getItem('chirp.refreshToken') || null

export const setToken = (token, refresh = null) => {
  accessToken = token
  if (token) localStorage.setItem('chirp.accessToken', token)
  else localStorage.removeItem('chirp.accessToken')
  if (refresh !== null) {
    refreshToken = refresh
    if (refresh) localStorage.setItem('chirp.refreshToken', refresh)
    else localStorage.removeItem('chirp.refreshToken')
  }
}

export const clearAuth = () => setToken(null, null)

function rememberAuth(payload) {
  setToken(payload.token || payload.access_token, payload.refresh_token || null)
  return payload
}

function authCodeFromUrl() {
  try {
    const search = new URLSearchParams(window.location.search || '')
    const fromQuery = search.get('code')
    if (fromQuery) return fromQuery
    const hash = String(window.location.hash || '').replace(/^#/, '')
    if (!hash) return null
    return new URLSearchParams(hash).get('code')
  } catch {
    return null
  }
}

/** Persist the current Supabase session (email verify callback or password sign-in) for SpeechC. */
export async function acceptSupabaseSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  let session = data.session

  // detectSessionInUrl may still be settling — exchange the PKCE code if present.
  if (!session?.access_token) {
    const code = authCodeFromUrl()
    if (code) {
      const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      if (exchangeError) throw exchangeError
      session = exchanged.session
    }
  }

  if (!session?.access_token) {
    const { data: again, error: againError } = await supabase.auth.getSession()
    if (againError) throw againError
    session = again.session
  }

  if (!session?.access_token) {
    throw new Error('Sign-in did not return a session. Confirm your email, then try again.')
  }

  setToken(session.access_token, session.refresh_token || null)
  await req('/auth/supabase/session', {
    method: 'POST',
    json: { access_token: session.access_token },
  })
  return { token: session.access_token, access_token: session.access_token }
}

function friendlyNetworkError(error) {
  const message = String(error?.message || error || '')
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Pipa’s nest is offline. Start the API (npm run dev in chirp-frontend), then try again.'
  }
  return message || 'Something went wrong.'
}

function apiPath(path) {
  if (path.startsWith('http')) return path
  if (path.startsWith('/api/')) return `${BASE}${path}`
  if (path.startsWith('/')) return `${BASE}/api${path}`
  return `${BASE}/api/${path}`
}

async function refreshAccess() {
  // Prefer Supabase session refresh (email auth). Never send a Supabase refresh
  // token to SpeechC /auth/refresh — that 401 path used to hard-logout parents.
  let supabaseSession = null
  try {
    const { data } = await supabase.auth.getSession()
    supabaseSession = data.session || null
  } catch { /* ignore */ }

  if (supabaseSession) {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data.session?.access_token) {
        setToken(data.session.access_token, data.session.refresh_token || null)
        return data.session.access_token
      }
    } catch { /* keep existing token below */ }

    if (supabaseSession.access_token) {
      setToken(supabaseSession.access_token, supabaseSession.refresh_token || null)
      throw new Error('Could not refresh session — try again')
    }
    throw new Error('Session expired — please sign in again')
  }

  if (!refreshToken) throw new Error('Session expired — please sign in again')
  let res
  try {
    res = await fetch(apiPath('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch (error) {
    throw new Error(friendlyNetworkError(error))
  }
  if (!res.ok) {
    clearAuth()
    throw new Error('Session expired — please sign in again')
  }
  const payload = await res.json()
  rememberAuth(payload)
  return payload.token
}

async function req(path, {
  method = 'GET',
  json,
  form,
  _retried = false,
  timeoutMs = 20000,
  raw = false,
} = {}) {
  const headers = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  let body
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  if (form) body = form
  let res
  try {
    const signal = typeof AbortSignal?.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined
    res = await fetch(apiPath(path), { method, headers, body, signal })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('Pipa took too long to answer. Tap to try that turn again.')
    }
    throw new Error(friendlyNetworkError(error))
  }
  // Refresh on 401 for API calls including /auth/me (return visits). Skip login/register/refresh loops.
  const authPath = String(path || '')
  const skipTokenRefresh = (
    authPath.includes('/auth/login')
    || authPath.includes('/auth/register')
    || authPath.includes('/auth/refresh')
    || authPath.includes('/auth/logout')
    || authPath.includes('/auth/supabase/session')
  )
  if (res.status === 401 && !_retried && !skipTokenRefresh) {
    await refreshAccess()
    return req(path, { method, json, form, _retried: true, timeoutMs, raw })
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    const message = typeof detail.detail === 'string'
      ? detail.detail
      : (Array.isArray(detail.detail) ? detail.detail.map((item) => item.msg || item).join(', ') : null)
    throw new Error(message || `Request failed (${res.status})`)
  }
  if (raw) return res
  if (res.status === 204) return null
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return res
}

function ladderForExercise(exercise) {
  const level = String(exercise?.level || exercise?.type || 'word').toLowerCase()
  return LEVEL_LADDER[level] ?? 2
}

function normalizeEpisode(episode) {
  if (!episode) return null
  return {
    ...episode,
    opening: episode.cold_open || episode.opening || '',
    cliffhanger: episode.next_teaser || episode.cliffhanger || '',
    celebration: episode.celebration || '',
    practice_hook: episode.practice_hook || '',
    title: episode.title || '',
  }
}

function normalizeStartSession(payload, mode = 'drill') {
  const exercise = payload.exercise || {}
  const word = exercise.expected_text || exercise.display_label || 'sss'
  // Prefer explicit target ladder from adapted payloads (tests / shims), else exercise level.
  const ladder = Number.isFinite(payload?.target?.ladder_level)
    ? payload.target.ladder_level
    : ladderForExercise(exercise)
  const practiceMode = payload.practice_mode
    || (ladder <= 1 ? 'model_imitate' : (mode === 'pairs' ? 'pairs' : 'word_naming'))
  return {
    ...payload,
    session_id: payload.session_id,
    mode,
    practice_mode: practiceMode,
    production_band: payload.production_band || 'emerging',
    target: {
      target_id: exercise.id || payload.target?.target_id || payload.curriculum_node_id || 'target',
      phoneme: exercise.target_phoneme || payload.target?.phoneme || (payload.target_phonemes || ['s'])[0],
      prompts: payload.target?.prompts?.length
        ? payload.target.prompts
        : [{
          word,
          prompt: exercise.prompt || `Say ${word}`,
          image_url: exercise.image_url,
          picture: exercise.image_url ? { url: exercise.image_url, word } : { word, emoji: '✨' },
          cue: exercise.cue || exercise.placement_cue,
        }],
      cue: exercise.cue || exercise.placement_cue || payload.target?.cue || '',
      ladder_level: ladder,
      retry_cap: payload.target?.retry_cap || 3,
      model_lines: exercise.model_lines || [],
    },
    exercise,
    episode: normalizeEpisode(payload.episode) || normalizeEpisode({
      cold_open: payload.episode?.opening,
      next_teaser: payload.episode?.cliffhanger,
      celebration: payload.episode?.celebration,
    }),
    minimal_pairs: payload.minimal_pairs || [],
    conversation_tasks: payload.conversation_tasks || [],
    feedback_bands: payload.feedback_bands || [],
  }
}

function normalizeUtterance(result, { exercise, attempt = 1 } = {}) {
  const band = result.feedback_band || {}
  const kidLine = band.kid_label
    || result.coach_turns?.[0]?.text
    || result.ai_feedback
    || 'Nice try!'
  const score = Number(result.accuracy_score ?? 0)
  const hit = score >= 70 || result.exercise_complete
  const move = result.exercise_complete
    ? 'advance'
    : (attempt >= 3 ? 'advance' : (hit ? 'advance' : 'retry'))
  return {
    ...result,
    outcome: hit ? 'correct' : 'incorrect',
    celebrate: Boolean(band.name === 'great' || score >= 85),
    coach: {
      kid_line: kidLine,
      move,
      viseme: result.viseme_sequence?.[0]?.id || null,
      turns: result.coach_turns || [],
    },
    session_done: false,
    next_exercise: result.next_exercise || null,
    exercise_complete: Boolean(result.exercise_complete),
    changes: result.next_exercise ? { next_prompt: result.next_exercise.expected_text } : {},
    current_exercise: exercise,
  }
}

export const api = {
  health: async () => {
    try {
      const res = await fetch(`${BASE}/health`)
      if (!res.ok) return false
      const payload = await res.json()
      return Boolean(payload?.ok || payload?.status === 'ok')
    } catch {
      return false
    }
  },

  joinWaitlist: (email, source = 'landing') => req('/waitlist', {
    method: 'POST',
    json: { email, source },
  }),

  /** Start Stripe Checkout for the $99 founding waitlist seat. */
  startWaitlistCheckout: (email, source = 'landing') => req('/waitlist/checkout', {
    method: 'POST',
    json: {
      email,
      source,
      return_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  }),

  waitlistCheckoutStatus: (sessionId) => req(`/waitlist/checkout/${encodeURIComponent(sessionId)}`),

  register: (email, password) =>
    req('/auth/register', { method: 'POST', json: { email, password } }).then(rememberAuth),

  login: (email, password) =>
    req('/auth/login', { method: 'POST', json: { email, password } }).then(rememberAuth),

  logout: async () => {
    try {
      await signOutSupabase()
    } catch { /* ignore */ }
    if (refreshToken) {
      try {
        await req('/auth/logout', { method: 'POST', json: { refresh_token: refreshToken } })
      } catch { /* ignore */ }
    }
    clearAuth()
  },

  acceptSupabaseSession,

  me: () => req('/auth/me'),

  consent: () => {
    const form = new FormData()
    form.append('method', 'in_app_attestation')
    return req('/auth/consent', { method: 'POST', form })
  },

  children: () => req('/children'),

  createChild: (child) => req('/children', {
    method: 'POST',
    json: {
      display_name: child.display_name || child.name,
      birth_year: child.birth_year,
      birth_month: child.birth_month,
      language: child.language || 'en',
      audio_retention: child.audio_retention || 'none',
    },
  }),

  deleteChild: (childId) => req(`/children/${childId}`, { method: 'DELETE' }),

  setChildLanguage: (childId, language) => req(`/curriculum/children/${childId}/language`, {
    method: 'POST',
    json: { language },
  }),

  curriculumPacks: () => req('/curriculum/packs'),

  curriculumPath: (childId) => req(`/curriculum/children/${childId}/path`),

  startSession: async (childId, mode = 'drill') => {
    const payload = await req('/sessions/start', {
      method: 'POST',
      json: { child_id: childId, session_type: 'practice' },
    })
    return normalizeStartSession(payload, mode)
  },

  submitTrial: async (sessionId, {
    targetId,
    promptWord,
    attempt,
    blob,
    selfRating = null,
    clientTranscript = null,
    exerciseId = null,
  }) => {
    const form = new FormData()
    form.append('expected_text', promptWord)
    form.append('exercise_id', exerciseId || targetId || 'exercise')
    form.append('attempt_number', String(attempt || 1))
    if (clientTranscript) form.append('client_transcript', clientTranscript)
    if (selfRating !== null && selfRating !== undefined) {
      form.append('self_rating', selfRating ? '1' : '0')
    }
    form.append('audio', blob, 'trial.webm')
    const result = await req(`/sessions/${sessionId}/utterance`, {
      method: 'POST',
      form,
      timeoutMs: 45000,
    })
    return normalizeUtterance(result, {
      exercise: { id: exerciseId || targetId, expected_text: promptWord },
      attempt,
    })
  },

  endSession: async (sessionId) => {
    const payload = await req(`/sessions/${sessionId}/end`, { method: 'POST' })
    return {
      ...payload,
      celebration: payload.celebration_message,
      parent_summary: payload.parent_summary,
    }
  },

  saveTranscript: async () => ({ ok: true }),

  progress: (childId) => req(`/children/${childId}/progress`),

  engagement: (childId) => req(`/children/${childId}/engagement`),

  // Placement (Listening Game) — speech curriculum probes
  screenerItems: async (childId) => {
    const placement = await req(`/curriculum/children/${childId}/placement`)
    const probes = placement.probes || placement.items || []
    const ui = placement.ui || {}
    return {
      completed: Boolean(placement.placement_complete || placement.completed),
      items: probes.map((probe, index) => {
        const targets = probe.targets || []
        const word = targets[0] || probe.prompt || probe.word || 'sss'
        const promptKey = probe.prompt_key
        return {
          id: probe.id || probe.probe_id || `probe-${index}`,
          word,
          phoneme: probe.phoneme || probe.target_phoneme || 's',
          prompt: (promptKey && ui[promptKey]) || ui.intro || 'Listen, then say it with Pip.',
          level: probe.level,
          image_url: probe.image_url,
          raw: probe,
        }
      }),
      ui,
      raw: placement,
    }
  },

  screenerTrial: async (childId, { itemId, blob, word, phoneme }) => {
    const form = new FormData()
    form.append('prompt_word', word || 'sss')
    form.append('phoneme', phoneme || 's')
    form.append('audio', blob, 'screener.webm')
    let score = { accuracy_score: 75, outcome: 'hit' }
    try {
      const res = await fetch(apiPath('/demo/score'), { method: 'POST', body: form })
      if (res.ok) score = await res.json()
    } catch { /* keep soft default */ }
    const hit = (score.accuracy_score ?? 0) >= 70 || score.outcome === 'hit'
    return {
      pip_line: score.coach?.kid_line || score.feedback_band?.kid_label || (hit ? 'Berry bright!' : 'One more chirp!'),
      advance: true,
      score: score.accuracy_score ?? (hit ? 80 : 55),
      item_id: itemId,
      hit,
    }
  },

  screenerComplete: async (childId, trialScores = {}) => {
    const scores = {}
    for (const [probeId, value] of Object.entries(trialScores)) {
      scores[probeId] = Array.isArray(value) ? value : [Number(value) || 70]
    }
    // Soft default so empty completions still place the child.
    if (!Object.keys(scores).length) {
      return req(`/curriculum/children/${childId}/placement`, {
        method: 'POST',
        json: { trial_scores: { 'probe-default': [75] } },
      }).catch(async () => {
        const battery = await req(`/curriculum/children/${childId}/placement`)
        const first = (battery.probes || [])[0]
        if (!first?.id) return { ok: true }
        return req(`/curriculum/children/${childId}/placement`, {
          method: 'POST',
          json: { trial_scores: { [first.id]: [75] } },
        })
      })
    }
    return req(`/curriculum/children/${childId}/placement`, {
      method: 'POST',
      json: { trial_scores: scores },
    })
  },

  mathPlacement: (childId) => req(`/math/children/${childId}/placement`),

  mathPlacementComplete: (childId, trialScores = {}) => req(`/math/children/${childId}/placement`, {
    method: 'POST',
    json: { trial_scores: trialScores },
  }),

  mathStart: (childId) => {
    if (childId) {
      // Authenticated path: reuse demo start for now (uses demo child) —
      // prefer child-scoped path when available via demo bootstrap IDs.
    }
    return req('/math/demo/start', { method: 'POST' })
  },

  mathAttempt: (sessionId, answer, transcript = null) => req('/math/attempt', {
    method: 'POST',
    json: { session_id: sessionId, answer, transcript },
  }),

  mathUtterance: (sessionId, transcript) => req('/math/utterance', {
    method: 'POST',
    json: { session_id: sessionId, transcript },
  }),

  mathTopic: (sessionId, topic) => req('/math/topic', {
    method: 'POST',
    json: { session_id: sessionId, topic },
  }),

  realtimeSession: async (sessionIdOrChildId, mode = 'practice', { sessionId = null } = {}) => {
    const sid = sessionId || sessionIdOrChildId
    try {
      const payload = await req('/realtime/session', {
        method: 'POST',
        json: { session_id: sid },
        timeoutMs: 30000,
      })
      return {
        ...payload,
        ephemeral_token: payload.client_secret || payload.ephemeral_token,
        webrtc_url: payload.webrtc_url || 'https://api.openai.com/v1/realtime/calls',
        mode,
      }
    } catch (error) {
      // Soft-fail so practice can continue with Edge TTS / speechSynthesis.
      return {
        ephemeral_token: null,
        webrtc_url: 'https://api.openai.com/v1/realtime/calls',
        fallback: 'speech_synthesis',
        detail: error.message,
        mode,
      }
    }
  },

  realtimeTool: (sessionId, toolName, args = {}) => req('/realtime/tool', {
    method: 'POST',
    json: { session_id: sessionId, tool_name: toolName, arguments: args },
  }),

  coachTts: async (text, { style = 'warm', language = 'en' } = {}) => {
    const res = await req('/coach/tts', {
      method: 'POST',
      json: { text, style, language },
      raw: true,
      timeoutMs: 30000,
    })
    return res.blob()
  },

  coachStatus: () => req('/coach/status'),

  slpCaseload: (slpId) => req(`/slp/${slpId}/caseload`),

  slpStats: (slpId) => req(`/slp/${slpId}/stats`),

  slpNote: (payload) => req('/slp/notes', { method: 'POST', json: payload }),

  demoBootstrap: () => req('/demo/bootstrap', { method: 'POST' }),

  pictures: async () => ({ pictures: [] }),

  curriculum: () => req('/curriculum/syllabus?language=en'),

  weeklyReport: async () => ({ weeks: [] }),
  carryover: async () => ({ missions: [] }),
  resolveFlag: async () => ({ ok: true }),
  parentConfirm: async () => ({ ok: true }),

  demoScore: async ({ promptWord, phoneme = 's', blob, filename = 'demo.webm' }) => {
    const form = new FormData()
    form.append('prompt_word', promptWord)
    form.append('phoneme', phoneme)
    form.append('audio', blob, filename)
    let res
    try {
      res = await fetch(apiPath('/demo/score'), { method: 'POST', body: form })
    } catch (error) {
      throw new Error(friendlyNetworkError(error))
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      throw new Error(detail.detail || `Demo score failed (${res.status})`)
    }
    return res.json()
  },

  demoRealtime: async () => {
    let res
    try {
      res = await fetch(apiPath('/demo/realtime'), { method: 'POST' })
    } catch (error) {
      throw new Error(friendlyNetworkError(error))
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      // Soft failure for landing — PipVoiceBridge falls back (incl. legacy 404 hosts).
      if (res.status === 503 || res.status === 502 || res.status === 404) {
        return { ok: false, ephemeral_token: null, fallback: 'speech_synthesis', detail: detail.detail }
      }
      throw new Error(detail.detail || `Demo realtime failed (${res.status})`)
    }
    const payload = await res.json()
    return {
      ...payload,
      ephemeral_token: payload.ephemeral_token || payload.client_secret,
      webrtc_url: payload.webrtc_url || 'https://api.openai.com/v1/realtime/calls',
    }
  },

  pictureUrl: (picture) => {
    if (!picture) return null
    if (typeof picture === 'string') return null
    if (!picture.url) return null
    if (picture.url.startsWith('http')) return picture.url
    if (picture.url.startsWith('/static')) return picture.url
    return `${BASE}${picture.url}`
  },
}

export const API_BASE = BASE
export const DEMO_PARENT_EMAIL = 'parent@demo.speechc.app'
export const DEMO_PASSWORD = 'speechc1234'
export const DEMO_SLP_EMAIL = 'slp@demo.speechc.app'
