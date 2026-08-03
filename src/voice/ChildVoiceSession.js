const FALLBACK_SPEAK = (text) => {
  if (!('speechSynthesis' in window)) return Promise.resolve({ fallback: true })
  window.speechSynthesis.cancel()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.88
    utterance.pitch = 1.18
    const finish = () => resolve({ fallback: true })
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
    window.setTimeout(finish, Math.min(9000, 900 + String(text).length * 55))
  })
}

function preferredAudioType() {
  if (!globalThis.MediaRecorder) return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus'
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return ''
}

/**
 * One authenticated voice module for every child stage.
 *
 * UI callers only learn connect/speak/capture/disconnect. WebRTC, VAD,
 * MediaRecorder compatibility, response timeouts, and speech synthesis remain
 * implementation details here.
 */
export class ChildVoiceSession {
  constructor(apiClient) {
    this.api = apiClient
    this.peerConnection = null
    this.dataChannel = null
    this.remoteAudio = null
    this.mediaStream = null
    this.localTrack = null
    this.recorder = null
    this.captureChunks = []
    this.captureTimer = null
    this.captureResolve = null
    this.responseWaiters = new Set()
    this.listeners = new Set()
    this.connectPromise = null
    this.connected = false
    this.fallback = false
    this.handsFree = false
    this.speaking = false
    this.childSpeaking = false
    this.transcript = []
    this.sessionId = null
    this.language = 'en'
    this.ttsAudio = null
    this.browserSpeechRecognition = null
    this.browserCaptureTranscript = ''
  }

  #browserSpeechRecognitionConstructor() {
    return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null
  }

  #startBrowserSpeechCapture() {
    this.browserCaptureTranscript = ''
    const RecognitionConstructor = this.#browserSpeechRecognitionConstructor()
    if (!RecognitionConstructor) return
    try {
      this.#stopBrowserSpeechCapture()
      const recognition = new RecognitionConstructor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = String(this.language || 'en').startsWith('en')
        ? 'en-US'
        : String(this.language || 'en')
      recognition.onresult = (event) => {
        let transcriptText = ''
        for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
          transcriptText += event.results[resultIndex][0]?.transcript || ''
        }
        this.browserCaptureTranscript = transcriptText.trim()
      }
      recognition.onerror = () => {
        /* Browser ASR is a best-effort client_transcript; Whisper remains primary. */
      }
      recognition.start()
      this.browserSpeechRecognition = recognition
    } catch {
      this.browserSpeechRecognition = null
    }
  }

  #stopBrowserSpeechCapture() {
    const recognition = this.browserSpeechRecognition
    this.browserSpeechRecognition = null
    if (!recognition) return
    try {
      recognition.onresult = null
      recognition.onerror = null
      recognition.stop()
    } catch {
      try { recognition.abort() } catch { /* no-op */ }
    }
  }

  #rememberChildTranscript(text) {
    const transcriptText = String(text || '').trim()
    if (!transcriptText) return
    const lastEntry = this.transcript[this.transcript.length - 1]
    if (lastEntry?.role === 'child' && lastEntry.text === transcriptText) return
    this.transcript.push({ role: 'child', text: transcriptText })
    this.emit({ type: 'child-transcript', text: transcriptText })
  }

  get snapshot() {
    return {
      connected: this.connected,
      fallback: this.fallback,
      speaking: this.speaking,
      childSpeaking: this.childSpeaking,
      handsFree: this.handsFree,
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener({ type: 'state', state: this.snapshot })
    return () => this.listeners.delete(listener)
  }

  emit(event) {
    for (const listener of this.listeners) listener(event)
  }

  emitState() {
    this.emit({ type: 'state', state: this.snapshot })
  }

  async connect({
    childId,
    sessionId = null,
    mode = 'practice',
    automaticResponses = false,
    language = 'en',
  }) {
    this.sessionId = sessionId || this.sessionId
    this.language = language || 'en'
    if (this.connected && this.dataChannel?.readyState === 'open') return this.snapshot
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = this.#connectRealtime({
      childId,
      sessionId: this.sessionId,
      mode,
      automaticResponses,
      language: this.language,
    })
      .catch((error) => {
        this.fallback = true
        this.connected = false
        this.emit({ type: 'recoverable-error', message: error.message })
        this.emitState()
        return this.snapshot
      })
      .finally(() => {
        this.connectPromise = null
      })
    return this.connectPromise
  }

  async #connectRealtime({ childId, sessionId, mode, automaticResponses, language }) {
    const config = await this.api.realtimeSession(sessionId || childId, mode, { sessionId })
    if (!config?.ephemeral_token) {
      this.fallback = true
      this.connected = false
      this.emitState()
      return this.snapshot
    }

    await this.#ensureMicrophone()
    const peerConnection = new RTCPeerConnection()
    this.peerConnection = peerConnection
    this.remoteAudio = document.createElement('audio')
    this.remoteAudio.autoplay = true
    this.remoteAudio.setAttribute('playsinline', 'true')
    peerConnection.ontrack = (event) => {
      this.remoteAudio.srcObject = event.streams[0]
    }
    peerConnection.addTrack(this.localTrack, this.mediaStream)

    const dataChannel = peerConnection.createDataChannel('oai-events')
    this.dataChannel = dataChannel
    dataChannel.addEventListener('message', (event) => this.#handleServerEvent(event))
    dataChannel.addEventListener('close', () => {
      this.connected = false
      this.emitState()
    })

    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    const sdpResponse = await fetch(
      config.webrtc_url || 'https://api.openai.com/v1/realtime/calls',
      {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${config.ephemeral_token}`,
          'Content-Type': 'application/sdp',
        },
      },
    )
    if (!sdpResponse.ok) {
      throw new Error(`Pip’s live voice could not connect (${sdpResponse.status}).`)
    }
    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: await sdpResponse.text(),
    })
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('Pip’s live voice took too long to connect.')),
        12000,
      )
      const opened = () => {
        window.clearTimeout(timer)
        resolve()
      }
      if (dataChannel.readyState === 'open') opened()
      else dataChannel.addEventListener('open', opened, { once: true })
    })

    this.connected = true
    this.fallback = false
    this.localTrack.enabled = false
    this.#send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-mini-transcribe',
              language: String(language || 'en').split('-')[0],
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 650,
              create_response: Boolean(automaticResponses),
              interrupt_response: true,
            },
          },
        },
      },
    })
    this.emitState()
    return this.snapshot
  }

  async #speakWithCoachTts(text) {
    try {
      const blob = await this.api.coachTts(text, { language: this.language })
      const url = URL.createObjectURL(blob)
      await new Promise((resolve) => {
        try { this.ttsAudio?.pause() } catch { /* no-op */ }
        const audio = new Audio(url)
        this.ttsAudio = audio
        this.speaking = true
        this.emitState()
        const finish = () => {
          this.speaking = false
          this.emitState()
          URL.revokeObjectURL(url)
          resolve({ ok: true, fallback: 'coach_tts' })
        }
        audio.onended = finish
        audio.onerror = finish
        audio.play().catch(finish)
      })
      return { ok: true, fallback: 'coach_tts' }
    } catch {
      await FALLBACK_SPEAK(text)
      return { ok: true, fallback: true }
    }
  }

  async #ensureMicrophone() {
    if (this.mediaStream?.active && this.localTrack?.readyState === 'live') return
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    ;[this.localTrack] = this.mediaStream.getAudioTracks()
    if (!this.localTrack) throw new Error('No microphone was found.')
    this.localTrack.enabled = false
  }

  #handleServerEvent(event) {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }

    if (
      payload.type === 'response.output_audio_transcript.delta'
      || payload.type === 'response.audio_transcript.delta'
    ) {
      this.emit({ type: 'pip-transcript-delta', text: payload.delta || '' })
    }
    if (
      payload.type === 'conversation.item.input_audio_transcription.completed'
      && payload.transcript
    ) {
      this.transcript.push({ role: 'child', text: payload.transcript })
      this.emit({ type: 'child-transcript', text: payload.transcript })
    }
    if (
      payload.type === 'response.output_audio_transcript.done'
      || payload.type === 'response.audio_transcript.done'
    ) {
      const text = String(payload.transcript || '').trim()
      if (text) this.transcript.push({ role: 'pip', text })
    }
    if (payload.type === 'output_audio_buffer.started') {
      this.speaking = true
      this.childSpeaking = false
      if (this.localTrack) this.localTrack.enabled = false
      this.#abortCapture()
      this.emitState()
    }
    if (
      payload.type === 'output_audio_buffer.stopped'
      || payload.type === 'response.done'
      || payload.type === 'response.cancelled'
    ) {
      this.speaking = false
      if (this.localTrack) this.localTrack.enabled = this.handsFree
      for (const resolve of this.responseWaiters) resolve(payload)
      this.responseWaiters.clear()
      this.emitState()
    }
    if (payload.type === 'input_audio_buffer.speech_started' && this.handsFree) {
      this.childSpeaking = true
      this.beginCapture({ maxMs: 5000 }).catch(() => {})
      this.emitState()
    }
    if (payload.type === 'input_audio_buffer.speech_stopped' && this.handsFree) {
      this.childSpeaking = false
      this.endCapture().then((blob) => {
        if (blob?.size) this.emit({ type: 'utterance', blob })
      })
      this.emitState()
    }
    if (payload.type === 'error') {
      const message = payload.error?.message || 'Pip’s voice hiccuped.'
      this.emit({ type: 'recoverable-error', message })
    }
    if (
      payload.type === 'response.function_call_arguments.done'
      || payload.type === 'response.output_item.done'
    ) {
      const name = payload.name || payload.item?.name
      const callId = payload.call_id || payload.item?.call_id
      let args = {}
      try {
        args = JSON.parse(payload.arguments || payload.item?.arguments || '{}')
      } catch { args = {} }
      if (name && this.sessionId && this.api.realtimeTool) {
        this.api.realtimeTool(this.sessionId, name, args)
          .then((toolResult) => {
            this.emit({ type: 'tool-result', name, result: toolResult })
            if (callId && this.#send({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify(toolResult?.result || toolResult || { ok: true }),
              },
            })) {
              this.#send({ type: 'response.create' })
            }
          })
          .catch(() => {})
      }
    }
  }

  #send(payload) {
    if (this.dataChannel?.readyState !== 'open') return false
    this.dataChannel.send(JSON.stringify(payload))
    return true
  }

  async speak(text) {
    const line = String(text || '').trim()
    if (!line) return { ok: true }
    this.transcript.push({ role: 'pip', text: line })
    if (!this.connected || !this.#send({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions:
          `Speak this aloud to a young child in your warm Pip voice. `
          + `Use one short turn, then stop and wait.\n\n${line}`,
      },
    })) {
      return this.#speakWithCoachTts(line)
    }

    if (this.localTrack) this.localTrack.enabled = false
    this.speaking = true
    this.emitState()
    return new Promise((resolve) => {
      let settled = false
      const finish = (payload) => {
        if (settled) return
        settled = true
        this.responseWaiters.delete(finish)
        this.speaking = false
        if (this.localTrack) this.localTrack.enabled = this.handsFree
        this.emitState()
        resolve({ ok: true, payload })
      }
      this.responseWaiters.add(finish)
      window.setTimeout(() => finish({ type: 'timeout' }), 14000)
    })
  }

  setHandsFree(enabled) {
    this.handsFree = Boolean(enabled && this.connected)
    if (this.localTrack) {
      this.localTrack.enabled = this.handsFree && !this.speaking
    }
    if (!this.handsFree) this.#abortCapture()
    this.emitState()
  }

  async beginCapture({ maxMs = 4200 } = {}) {
    await this.#ensureMicrophone()
    if (!globalThis.MediaRecorder) {
      throw new Error('This browser cannot record a turn. Try Safari or Chrome.')
    }
    if (this.recorder?.state === 'recording') return false
    const mimeType = preferredAudioType()
    const recorder = mimeType
      ? new MediaRecorder(this.mediaStream, { mimeType })
      : new MediaRecorder(this.mediaStream)
    this.recorder = recorder
    this.captureChunks = []
    recorder.ondataavailable = (event) => {
      if (event.data?.size) this.captureChunks.push(event.data)
    }
    recorder.start()
    this.childSpeaking = true
    // Always unmute for capture — fallback/tap-to-talk used to leave the track
    // disabled when Realtime was offline, so MediaRecorder uploaded silence.
    if (this.localTrack) this.localTrack.enabled = true
    this.#startBrowserSpeechCapture()
    this.emitState()
    window.clearTimeout(this.captureTimer)
    this.captureTimer = window.setTimeout(() => {
      this.endCapture().then((blob) => {
        if (blob?.size) {
          this.emit({ type: 'utterance', blob })
        }
      })
    }, maxMs)
    return true
  }

  async endCapture() {
    window.clearTimeout(this.captureTimer)
    this.#stopBrowserSpeechCapture()
    const recorder = this.recorder
    if (!recorder || recorder.state !== 'recording') return null
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve
    })
    recorder.stop()
    await stopped
    this.childSpeaking = false
    if (this.localTrack) this.localTrack.enabled = this.handsFree && !this.speaking
    this.emitState()
    const blob = new Blob(this.captureChunks, {
      type: recorder.mimeType || 'audio/webm',
    })
    this.recorder = null
    this.captureChunks = []
    this.#rememberChildTranscript(this.browserCaptureTranscript)
    this.browserCaptureTranscript = ''
    return blob
  }

  #abortCapture() {
    window.clearTimeout(this.captureTimer)
    this.#stopBrowserSpeechCapture()
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null
      this.recorder.stop()
    }
    this.recorder = null
    this.captureChunks = []
    this.childSpeaking = false
    this.browserCaptureTranscript = ''
  }

  latestChildTranscript() {
    for (let index = this.transcript.length - 1; index >= 0; index -= 1) {
      if (this.transcript[index]?.role === 'child') {
        return this.transcript[index].text || null
      }
    }
    return this.browserCaptureTranscript || null
  }

  getTranscript() {
    return [...this.transcript]
  }

  disconnect() {
    this.setHandsFree(false)
    this.#abortCapture()
    window.speechSynthesis?.cancel()
    try { this.ttsAudio?.pause() } catch { /* no-op */ }
    this.ttsAudio = null
    for (const resolve of this.responseWaiters) resolve({ type: 'cancelled' })
    this.responseWaiters.clear()
    try { this.dataChannel?.close() } catch { /* no-op */ }
    try { this.peerConnection?.close() } catch { /* no-op */ }
    try { this.mediaStream?.getTracks().forEach((track) => track.stop()) } catch { /* no-op */ }
    this.dataChannel = null
    this.peerConnection = null
    this.mediaStream = null
    this.localTrack = null
    this.connected = false
    this.speaking = false
    this.childSpeaking = false
    this.emitState()
  }
}
