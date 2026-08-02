/**
 * Landing voice bridge — Pip talks (OpenAI Realtime WebRTC) while child speech
 * is scored quietly (Whisper). No provider names leak to the UI.
 */
import { api } from '../api.js'

const FALLBACK_SPEAK = (text) => {
  if (!('speechSynthesis' in window)) return Promise.resolve()
  window.speechSynthesis.cancel()
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.88
    utterance.pitch = 1.2
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
    window.setTimeout(resolve, Math.min(8000, 800 + text.length * 55))
  })
}

class PipVoiceBridge {
  constructor() {
    this.peerConnection = null
    this.dataChannel = null
    this.localAudioTrack = null
    this.mediaStream = null
    this.remoteAudioElement = null
    this.ephemeralToken = null
    this.webrtcUrl = 'https://api.openai.com/v1/realtime/calls'
    this.connectPromise = null
    this.responseWaiters = []
    this.busy = false
    this.assistantTurns = 0
    this.sessionActive = false
  }

  get isBusy() {
    return this.busy || this.sessionActive
  }

  async ensureConnected() {
    if (this.dataChannel?.readyState === 'open') return true
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = (async () => {
      const session = await api.demoRealtime()
      if (!session?.ephemeral_token) return false
      this.ephemeralToken = session.ephemeral_token
      this.webrtcUrl = session.webrtc_url || this.webrtcUrl

      const peerConnection = new RTCPeerConnection()
      this.peerConnection = peerConnection

      this.remoteAudioElement = document.createElement('audio')
      this.remoteAudioElement.autoplay = true
      this.remoteAudioElement.setAttribute('playsinline', 'true')
      peerConnection.ontrack = (event) => {
        this.remoteAudioElement.srcObject = event.streams[0]
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const [track] = this.mediaStream.getAudioTracks()
      this.localAudioTrack = track
      track.enabled = false
      peerConnection.addTrack(track, this.mediaStream)

      const dataChannel = peerConnection.createDataChannel('oai-events')
      this.dataChannel = dataChannel
      dataChannel.addEventListener('message', (event) => this.#onServerEvent(event))

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      const sdpResponse = await fetch(this.webrtcUrl, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${this.ephemeralToken}`,
          'Content-Type': 'application/sdp',
        },
      })
      if (!sdpResponse.ok) {
        throw new Error(`voice connect failed (${sdpResponse.status})`)
      }
      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: await sdpResponse.text(),
      })

      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('voice channel timeout')), 12000)
        if (dataChannel.readyState === 'open') {
          window.clearTimeout(timeout)
          resolve()
          return
        }
        dataChannel.addEventListener('open', () => {
          window.clearTimeout(timeout)
          resolve()
        }, { once: true })
      })

      return true
    })().catch((error) => {
      console.warn('[PipVoiceBridge] connect failed', error)
      this.disconnect()
      return false
    }).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  #onServerEvent(event) {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }
    if (payload.type === 'response.done' || payload.type === 'response.cancelled') {
      this.assistantTurns += 1
      const waiters = this.responseWaiters.splice(0)
      waiters.forEach((resolve) => resolve(payload))
    }
    if (payload.type === 'input_audio_buffer.speech_stopped' && this._scoreHook) {
      this._scoreHook()
    }
  }

  #send(event) {
    if (this.dataChannel?.readyState !== 'open') return false
    this.dataChannel.send(JSON.stringify(event))
    return true
  }

  async say(text) {
    const line = String(text || '').trim()
    if (!line) return { ok: true }

    const connected = await this.ensureConnected()
    if (!connected) {
      await FALLBACK_SPEAK(line)
      return { ok: true, fallback: true }
    }

    if (this.localAudioTrack) this.localAudioTrack.enabled = false

    const done = new Promise((resolve) => {
      this.responseWaiters.push(resolve)
      window.setTimeout(() => resolve({ type: 'timeout' }), 14000)
    })

    const sent = this.#send({
      type: 'response.create',
      response: {
        instructions:
          `Speak this to a young child in your warm Pip voice, then stop and wait.\n\n${line}`,
      },
    })
    if (!sent) {
      await FALLBACK_SPEAK(line)
      return { ok: true, fallback: true }
    }
    await done
    return { ok: true }
  }

  async #scoreClip({ promptWord, phoneme, ms = 2200 }) {
    if (!this.mediaStream) return null
    const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
    const recorder = preferredType
      ? new MediaRecorder(this.mediaStream, { mimeType: preferredType })
      : new MediaRecorder(this.mediaStream)
    const chunks = []
    const stopped = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }
      recorder.onstop = () => resolve()
    })
    recorder.start()
    await new Promise((resolve) => window.setTimeout(resolve, ms))
    if (recorder.state === 'recording') recorder.stop()
    await stopped
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
    if (blob.size < 800) return null
    try {
      return await api.demoScore({
        promptWord,
        phoneme,
        blob,
        filename: 'play-turn.webm',
      })
    } catch {
      return null
    }
  }

  /**
   * One free-play conversation: Pip chats about a toy/word, child talks back,
   * quiet scoring happens in the background. Ends after a few turns or timeout.
   */
  async playConversation({
    topic,
    promptWord,
    phoneme,
    opener,
    onStatus,
    maxAssistantTurns = 3,
    maxMs = 50000,
  }) {
    this.busy = true
    this.sessionActive = true
    this.assistantTurns = 0
    let lastScore = null
    let scoring = false

    try {
      const connected = await this.ensureConnected()
      onStatus?.('talking')

      if (!connected) {
        await FALLBACK_SPEAK(opener)
        onStatus?.('listening')
        lastScore = await this.#scoreClip({ promptWord, phoneme, ms: 2800 })
        await FALLBACK_SPEAK(
          lastScore?.outcome === 'correct'
            ? 'Yay! That was so brave. Bye for now!'
            : 'Thanks for playing with me! See you soon!',
        )
        onStatus?.('done')
        return { score: lastScore, turns: 1 }
      }

      if (this.localAudioTrack) this.localAudioTrack.enabled = true

      this._scoreHook = async () => {
        if (scoring) return
        scoring = true
        onStatus?.('listening')
        const score = await this.#scoreClip({ promptWord, phoneme, ms: 1800 })
        if (score) lastScore = score
        scoring = false
      }

      const done = new Promise((resolve) => {
        this.responseWaiters.push(resolve)
        window.setTimeout(() => resolve({ type: 'timeout' }), 16000)
      })
      this.#send({
        type: 'response.create',
        response: {
          instructions:
            `Start a tiny playful chat about ${topic}. `
            + `Open with something like: "${opener}" `
            + `Invite them to say the word "${promptWord}" naturally in the chat. `
            + `Keep replies to one short sentence. Wait for them to talk.`,
        },
      })
      await done
      onStatus?.('listening')

      const startedAt = Date.now()
      while (
        this.assistantTurns < maxAssistantTurns
        && Date.now() - startedAt < maxMs
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 900))
      }

      if (this.localAudioTrack) this.localAudioTrack.enabled = false
      this._scoreHook = null

      onStatus?.('talking')
      const closing = lastScore?.outcome === 'correct'
        ? `What a fun chat! I loved hearing "${promptWord}". Bye for now!`
        : `That was fun talking about ${topic}! Come play again soon!`
      await this.say(closing)
      onStatus?.('done')
      return { score: lastScore, turns: this.assistantTurns }
    } catch (error) {
      if (this.localAudioTrack) this.localAudioTrack.enabled = false
      this._scoreHook = null
      onStatus?.('done')
      if (error?.name === 'NotAllowedError') {
        return { score: { outcome: 'uncertain', engine: 'mic_denied' }, turns: 0 }
      }
      return { score: { outcome: 'uncertain', engine: 'error' }, turns: 0 }
    } finally {
      this.sessionActive = false
      this.busy = false
    }
  }

  disconnect() {
    this._scoreHook = null
    try { this.dataChannel?.close() } catch { /* ignore */ }
    try { this.peerConnection?.close() } catch { /* ignore */ }
    try { this.localAudioTrack?.stop() } catch { /* ignore */ }
    try { this.mediaStream?.getTracks().forEach((track) => track.stop()) } catch { /* ignore */ }
    this.dataChannel = null
    this.peerConnection = null
    this.localAudioTrack = null
    this.mediaStream = null
    this.ephemeralToken = null
    this.responseWaiters = []
    this.sessionActive = false
    this.busy = false
  }
}

export const pipVoiceBridge = new PipVoiceBridge()
export const DEMO_SESSION_LIMIT = 3
export const DEMO_SESSION_STORAGE_KEY = 'pipa.demoSessionsUsed'
