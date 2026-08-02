import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react'
import AnimatedCharacterArt from './AnimatedCharacterArt.jsx'
import { api } from './api.js'
import { pipVoiceBridge, DEMO_SESSION_LIMIT, DEMO_SESSION_STORAGE_KEY } from './voice/PipVoiceBridge.js'
import './landing.css'

/**
 * Pipa - one inhabited toy world.
 * Play first. Parent chapters are rooms in the same universe, not a brochure dump.
 */

const NEST_FRIENDS = [
  {
    friendId: 'sunny',
    targetSound: '/s/',
    phoneme: 's',
    elongatedSound: 'ssss',
    friendName: 'Sunny',
    exampleWord: 'sun',
    characterImagePath: '/characters/friend-stella-star.webp',
  },
  {
    friendId: 'rory',
    targetSound: '/r/',
    phoneme: 'r',
    elongatedSound: 'rrrr',
    friendName: 'Rory',
    exampleWord: 'rocket',
    characterImagePath: '/characters/friend-rory-rocket.webp',
  },
  {
    friendId: 'lulu',
    targetSound: '/l/',
    phoneme: 'l',
    elongatedSound: 'llll',
    friendName: 'Lulu',
    exampleWord: 'lion',
    characterImagePath: '/characters/friend-lulu-lion.webp',
  },
  {
    friendId: 'theo',
    targetSound: '/th/',
    phoneme: 'θ',
    elongatedSound: 'th th th',
    friendName: 'Theo',
    exampleWord: 'thunder',
    characterImagePath: '/characters/friend-theo-thunder.webp',
  },
]

const JOURNEY_OPENING = [
  {
    stepId: 'listen',
    title: "Pip's Listening Game finds their starting point",
    body: '26 picture cards. No reading. No right-or-wrong shown to the child. You get an honest sound-by-sound baseline.',
    artPath: '/characters/pip-hop.webp',
  },
  {
    stepId: 'episode',
    title: 'Every day is an episode',
    body: 'Quests, cliffhangers, five worlds to unlock. Practice literally moves the story.',
    worlds: ['Nest', 'Meadow', 'Brook', 'Forest', 'Shore'],
    artPath: '/characters/friend-rory-rocket.webp',
  },
]

const JOURNEY_TALK = {
  title: 'Then Pip starts talking back',
  body: 'Real voice conversations, scored in connected speech, with your child learning to catch their own sounds.',
  artPath: '/characters/friend-lulu-lion.webp',
}

const JOURNEY_GRAD = {
  title: 'Graduation - defined the way a therapist defines it',
  body: '90% in real conversation, self-monitoring, and you confirming we hear it at home.',
  artPath: '/characters/friend-theo-thunder.webp',
}

const PRACTICE_TARGET_WORD = 'sun'
const PRACTICE_BERRY_GOAL = 8

/** World toys open a short Pip conversation (max 3 free sessions on the page). */
const WORLD_TOYS = {
  sun: {
    topic: 'the sunny sky',
    promptWord: 'sun',
    phoneme: 's',
    opener: 'Hi! The sun is glowing. Want to say sun with me?',
  },
  rainbow: {
    topic: 'the rainbow',
    promptWord: 'rain',
    phoneme: 'r',
    opener: 'Ooh, colors! Can you say rain for me?',
  },
  plane: {
    topic: 'the flying plane',
    promptWord: 'plane',
    phoneme: 'p',
    opener: 'Look, a plane! Say plane and we can pretend to fly!',
  },
  'hill-far': {
    topic: 'the far hills',
    promptWord: 'house',
    phoneme: 'h',
    opener: 'See the hills? Say house - maybe a tiny house lives there!',
  },
  'hill-mid': {
    topic: 'the soft meadow',
    promptWord: 'leaf',
    phoneme: 'l',
    opener: 'Soft grass! Can you say leaf?',
  },
  'hill-near': {
    topic: 'the near grass',
    promptWord: 'grass',
    phoneme: 's',
    opener: 'Tickly grass! Say grass with a snake sound - ssss!',
  },
}

let sharedAudioContext = null

function playPopSound(basePitchHz = 520) {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume()
    const now = sharedAudioContext.currentTime
    const oscillator = sharedAudioContext.createOscillator()
    const gain = sharedAudioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(basePitchHz, now)
    oscillator.frequency.exponentialRampToValueAtTime(basePitchHz * 1.9, now + 0.09)
    gain.gain.setValueAtTime(0.14, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    oscillator.connect(gain)
    gain.connect(sharedAudioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.2)
  } catch {
    /* audio garnish must never break the page */
  }
}

function playChirpSound() {
  playPopSound(660)
  setTimeout(() => playPopSound(920), 90)
}

async function pipSpeak(text, options) {
  return pipVoiceBridge.say(text, options)
}

const BURST_COLOURS = ['#ffd84d', '#ff4fa0', '#7ee256', '#ffffff', '#35c5ff']

function StarBurst({ burstId }) {
  const prefersReducedMotion = useReducedMotion()
  if (burstId === 0 || prefersReducedMotion) return null

  return (
    <span className="star-burst" key={burstId} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, pieceIndex) => {
        const angle = (Math.PI * 2 * pieceIndex) / 8 - Math.PI / 2
        const distance = 56 + (pieceIndex % 3) * 18
        return (
          <motion.span
            key={pieceIndex}
            className="star-burst__piece"
            style={{ color: BURST_COLOURS[pieceIndex % BURST_COLOURS.length] }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: 1.1,
              opacity: 0,
            }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          >
            ✦
          </motion.span>
        )
      })}
    </span>
  )
}

function PipaWordmark({ className }) {
  return (
    <a href="#top" className={className} aria-label="Pipa, back to top">
      <span aria-hidden="true">p</span>
      pipa!
    </a>
  )
}

function StoreAvailability({ className = '' }) {
  return (
    <div
      className={`store-availability ${className}`.trim()}
      aria-label="Pipa mobile apps coming soon"
    >
      <span className="store-availability__badge store-availability__badge--ios">
        <img src="/brand/apple.svg" alt="" width="16" height="16" />
        <span>App Store soon</span>
      </span>
      <span className="store-availability__badge store-availability__badge--android">
        <img src="/brand/google-play.svg" alt="" width="16" height="16" />
        <span>Google Play soon</span>
      </span>
    </div>
  )
}

function WaitlistForm({ source = 'landing-hero' }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | paid | already | cancel | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const waitlist = params.get('waitlist')
    const sessionId = params.get('session_id')
    if (!waitlist) return undefined

    let cancelled = false
    ;(async () => {
      if (waitlist === 'cancel') {
        setStatus('cancel')
        setMessage('Checkout paused — your seat is still open when you’re ready.')
        window.history.replaceState({}, '', window.location.pathname || '/')
        return
      }
      if (waitlist === 'success' && sessionId) {
        setStatus('saving')
        setMessage('Confirming your founding seat…')
        try {
          const result = await api.waitlistCheckoutStatus(sessionId)
          if (cancelled) return
          if (result.paid) {
            setStatus('paid')
            setMessage('Seat secured. You’re on the founding list — welcome to the nest.')
          } else {
            setStatus('error')
            setMessage('Payment is still settling. Refresh in a moment.')
          }
        } catch (error) {
          if (!cancelled) {
            setStatus('error')
            setMessage(error.message || 'Could not confirm payment yet.')
          }
        }
        window.history.replaceState({}, '', window.location.pathname || '/')
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!email.trim() || status === 'saving') return
    setStatus('saving')
    setMessage('')
    try {
      const result = await api.startWaitlistCheckout(email.trim(), source)
      if (result.already_paid) {
        setStatus('already')
        setMessage('This email already has a founding seat.')
        return
      }
      if (!result.checkout_url) {
        throw new Error('Checkout did not open. Try again in a moment.')
      }
      setMessage('Opening secure checkout…')
      window.location.assign(result.checkout_url)
    } catch (error) {
      setStatus('error')
      setMessage(error.message || 'The nest missed that. Please try again.')
    }
  }

  const locked = status === 'paid' || status === 'already'

  return (
    <form className={`landing-waitlist ${locked ? 'is-secured' : ''}`} onSubmit={submit}>
      <label htmlFor={`waitlist-email-${source}`}>Secure a founding seat</label>
      <div>
        <input
          id={`waitlist-email-${source}`}
          type="email"
          autoComplete="email"
          placeholder="Parent email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={locked || status === 'saving'}
        />
        <button type="submit" disabled={locked || status === 'saving'}>
          {status === 'saving' ? 'Working…' : locked ? 'Seat secured' : 'Secure seat · $99'}
        </button>
      </div>
      <p aria-live="polite">
        {message || 'One-time $99 holds your family’s place. Card via Stripe — no spam nest mail.'}
      </p>
    </form>
  )
}

function WorldAtmosphere({ scrollYProgress, isBlooming, berryCount, onToyInteract }) {
  const prefersReducedMotion = useReducedMotion()
  const [toyPulse, setToyPulse] = useState(null)
  const skyShift = useTransform(
    scrollYProgress,
    [0, 0.2, 0.4, 0.65, 1],
    [
      'linear-gradient(180deg, #4a9dff 0%, #5ed0ff 46%, #b8f7ff 100%)',
      'linear-gradient(180deg, #7ab8ff 0%, #a8e4f5 48%, #ffe9b0 100%)',
      'linear-gradient(180deg, #ff9ec8 0%, #ffd084 52%, #fff0c2 100%)',
      'linear-gradient(180deg, #6b4dff 0%, #3a2480 55%, #1a1040 100%)',
      'linear-gradient(180deg, #241a5e 0%, #e02c86 55%, #ff4fa0 100%)',
    ],
  )
  const hillY = useTransform(scrollYProgress, [0, 0.45], ['0%', '12%'])
  const sunX = useTransform(scrollYProgress, [0, 0.5], ['0%', '18%'])
  const rainbowOpacity = useTransform(scrollYProgress, [0, 0.08, 0.16], [1, 0.55, 0])

  function pokeToy(toyId) {
    setToyPulse(toyId)
    window.setTimeout(() => setToyPulse((current) => (current === toyId ? null : current)), 500)
    onToyInteract?.(toyId)
  }

  return (
    <div className={`world-atmosphere ${isBlooming ? 'is-blooming' : ''}`}>
      <motion.div
        className="world-atmosphere__sky"
        style={prefersReducedMotion ? undefined : { background: skyShift }}
        aria-hidden="true"
      />
      <motion.button
        type="button"
        className={`world-atmosphere__sun ${toyPulse === 'sun' ? 'is-poked' : ''}`}
        aria-label="Poke the sun"
        onClick={() => pokeToy('sun')}
        style={prefersReducedMotion ? undefined : { x: sunX }}
      >
        <img src="/characters/prop-sun.webp" alt="" />
      </motion.button>
      <motion.button
        type="button"
        className={`world-atmosphere__rainbow ${toyPulse === 'rainbow' ? 'is-poked' : ''}`}
        aria-label="Poke the rainbow"
        onClick={() => pokeToy('rainbow')}
        style={prefersReducedMotion ? undefined : { opacity: rainbowOpacity }}
      >
        <img src="/characters/prop-rainbow.webp" alt="" />
      </motion.button>
      <img
        className="world-atmosphere__cloud world-atmosphere__cloud--a"
        src="/illustrations/cloud-fluff.svg"
        alt=""
        aria-hidden="true"
      />
      <img
        className="world-atmosphere__cloud world-atmosphere__cloud--b"
        src="/illustrations/cloud-fluff-b.svg"
        alt=""
        aria-hidden="true"
      />
      <button
        type="button"
        className={`world-atmosphere__plane ${toyPulse === 'plane' ? 'is-poked' : ''}`}
        aria-label="Poke the plane"
        onClick={() => pokeToy('plane')}
      >
        <img src="/illustrations/plane-fly.svg" alt="" />
      </button>
      <motion.div
        className="world-atmosphere__hills"
        style={prefersReducedMotion ? undefined : { y: hillY }}
      >
        <button
          type="button"
          className={`hill hill--far ${toyPulse === 'hill-far' ? 'is-poked' : ''}`}
          aria-label="Poke the far hill"
          onClick={() => pokeToy('hill-far')}
        />
        <button
          type="button"
          className={`hill hill--mid ${toyPulse === 'hill-mid' ? 'is-poked' : ''}`}
          aria-label="Poke the middle hill"
          onClick={() => pokeToy('hill-mid')}
        />
        <button
          type="button"
          className={`hill hill--near ${toyPulse === 'hill-near' ? 'is-poked' : ''}`}
          aria-label="Poke the near hill"
          onClick={() => pokeToy('hill-near')}
        />
        <div className="meadow-berries" aria-hidden="true">
          {Array.from({ length: berryCount }).map((_, berryIndex) => (
            <span
              key={berryIndex}
              className="meadow-berry"
              style={{
                '--berry-i': berryIndex,
                left: `${12 + ((berryIndex * 11) % 76)}%`,
                bottom: `${18 + (berryIndex % 4) * 10}%`,
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function WorldPip({
  isVisible,
  isListening,
  isScoring = false,
  isModeling,
  bubbleText,
  scoreOutOfTen,
  triesCount,
  onPipTap,
  pokeBurstCount,
  isPoked,
  onPokeAnimationEnd,
}) {
  const prefersReducedMotion = useReducedMotion()
  const [isNarrowViewport, setIsNarrowViewport] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 860px)')
    const syncViewport = () => setIsNarrowViewport(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  return (
    <motion.div
      className={`world-pip ${isNarrowViewport ? 'is-mobile' : 'is-desktop'} ${isVisible ? 'is-visible' : 'is-hidden'}`}
      aria-hidden={!isVisible}
      initial={false}
      animate={
        prefersReducedMotion
          ? { opacity: isVisible ? 1 : 0 }
          : { opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 28, scale: isVisible ? 1 : 0.92 }
      }
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="world-pip__bubble" aria-live="polite">
        {bubbleText}
      </p>
      <button
        type="button"
        className={`world-pip__hit ${isPoked ? 'is-poked' : ''} ${isListening || isScoring ? 'is-listening' : ''} ${isModeling ? 'is-modeling' : ''}`}
        onClick={onPipTap}
        onAnimationEnd={onPokeAnimationEnd}
        aria-label={
          isModeling
            ? 'Pip is talking'
            : isListening
              ? 'Your turn - talk to Pip'
              : 'Tap Pip to play'
        }
      >
        <AnimatedCharacterArt
          src="/characters/pip-hop.webp"
          variant="pip"
          talking={isModeling}
          flapping
        />
        <StarBurst burstId={pokeBurstCount} />
        {(isListening || isScoring || isModeling) && <span className="world-pip__ring" aria-hidden="true" />}
      </button>
      {triesCount > 0 && (
        <p className="world-pip__score" aria-live="polite">
          about <strong>{scoreOutOfTen}</strong> in 10
        </p>
      )}
    </motion.div>
  )
}

function readSessionsUsed() {
  const raw = Number(window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY) || '0')
  return Number.isFinite(raw) ? Math.max(0, Math.min(DEMO_SESSION_LIMIT, raw)) : 0
}

function writeSessionsUsed(count) {
  window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, String(count))
}

function usePlaySession({ sessionsUsed, onSessionFinished, onBlocked }) {
  const [status, setStatus] = useState('idle') // idle|talking|listening|done

  async function playWithPip({ topic, promptWord, phoneme, opener }) {
    if (status !== 'idle' && status !== 'done') return null
    if (sessionsUsed >= DEMO_SESSION_LIMIT) {
      onBlocked?.()
      return null
    }
    if (pipVoiceBridge.isBusy) return null

    setStatus('talking')
    const result = await pipVoiceBridge.playConversation({
      topic,
      promptWord,
      phoneme,
      opener,
      onStatus: (next) => setStatus(next === 'done' ? 'idle' : next),
      maxAssistantTurns: 3,
      maxMs: 45000,
    })
    setStatus('idle')
    onSessionFinished?.(result)
    return result
  }

  return { status, playWithPip, isActive: status === 'talking' || status === 'listening' }
}

function CrackedEgg({ nestFriend, cardIndex, isAwake, onWake, onHatched, playWithPip, isVoiceLocked }) {
  const prefersReducedMotion = useReducedMotion()
  const [isHatched, setIsHatched] = useState(false)
  const [burstCount, setBurstCount] = useState(0)
  const [isJumping, setIsJumping] = useState(false)
  const [isActive, setIsActive] = useState(false)

  async function handlePrimary() {
    if (isVoiceLocked || isActive) return

    if (!isHatched) {
      setIsActive(true)
      const result = await playWithPip({
        topic: nestFriend.friendName,
        promptWord: nestFriend.exampleWord,
        phoneme: nestFriend.phoneme,
        opener: `Hi! I'm waiting in this egg. Say ${nestFriend.exampleWord} and maybe I'll hatch!`,
      })
      setIsActive(false)
      if (result?.score?.outcome === 'correct' || (result?.turns ?? 0) > 0) {
        setIsHatched(true)
        setBurstCount((count) => count + 1)
        onHatched?.(nestFriend)
      }
      return
    }

    onWake(nestFriend)
    setBurstCount((count) => count + 1)
    setIsJumping(true)
    setIsActive(true)
    await playWithPip({
      topic: nestFriend.friendName,
      promptWord: nestFriend.exampleWord,
      phoneme: nestFriend.phoneme,
      opener: `It's ${nestFriend.friendName}! Let's chat - try saying ${nestFriend.exampleWord}.`,
    })
    setIsActive(false)
  }

  return (
    <motion.div
      className={`voice-egg ${isAwake ? 'is-awake' : ''} ${isHatched ? 'is-hatched' : ''} ${isActive ? 'is-listening' : ''}`}
      style={{ '--egg-tint': cardIndex }}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 36, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16, delay: cardIndex * 0.06 }}
    >
      <button
        type="button"
        className="voice-egg__stage"
        onClick={handlePrimary}
        aria-label={
          isHatched
            ? `Talk with ${nestFriend.friendName}`
            : `Talk to hatch ${nestFriend.friendName}`
        }
      >
        <span className={`voice-egg__visual ${isHatched ? '' : 'is-tinted'}`}>
          <AnimatedCharacterArt
            src={isHatched ? nestFriend.characterImagePath : '/characters/prop-hatching-egg.webp'}
            variant={isHatched ? 'friend' : 'egg'}
            talking={false}
            floating={false}
            className={`${isHatched ? 'is-friend' : 'is-egg'} ${isJumping ? 'is-jumping' : ''}`}
            onAnimationEnd={() => setIsJumping(false)}
          />
        </span>
        <StarBurst burstId={burstCount} />
        {isAwake && isHatched && (
          <span className="voice-egg__bubble" aria-hidden="true">
            {nestFriend.elongatedSound}!
          </span>
        )}
      </button>
      <p className="voice-egg__label">{isHatched ? nestFriend.friendName : nestFriend.exampleWord}</p>
    </motion.div>
  )
}

function ParentChapters({ scoreOutOfTen, triesCount, hitsCount, berryCount }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="parent-chapters" id="grownups">
      <section className="room room--story" id="journey" aria-labelledby="journey-heading">
        <div className="room__inner">
          <h2 id="journey-heading">
            From first listen
            <em> to graduation</em>
          </h2>
          <div className="story-beats">
            {JOURNEY_OPENING.map((step, stepIndex) => (
              <motion.article
                key={step.stepId}
                className={`story-beat ${stepIndex % 2 ? 'is-flip' : ''}`}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <img src={step.artPath} alt="" className="story-beat__art" />
                <div className="story-beat__copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {step.worlds && (
                    <ul className="world-path">
                      {step.worlds.map((worldName) => (
                        <li key={worldName}>{worldName}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.article>
            ))}
          </div>

          <motion.article
            className="story-banner"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src={JOURNEY_TALK.artPath} alt="" />
            <div>
              <h3>{JOURNEY_TALK.title}</h3>
              <p>{JOURNEY_TALK.body}</p>
            </div>
          </motion.article>

          <motion.article
            className="story-grad"
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src={JOURNEY_GRAD.artPath} alt="" />
            <h3>{JOURNEY_GRAD.title}</h3>
            <p>{JOURNEY_GRAD.body}</p>
          </motion.article>
        </div>
      </section>

      <section className="room room--proof" id="proof" aria-labelledby="proof-heading">
        <div className="room__inner room__inner--proof">
          <div className="proof-copy">
            <h2 id="proof-heading">
              Progress you
              <em> can prove</em>
            </h2>
            <p className="proof-line">
              Pipa re-tests on words your child never practiced - so the progress you see is real
              speech change, not memorization.
            </p>
          </div>
          <div className={`proof-dial ${triesCount > 0 ? 'has-score' : ''}`} aria-live="polite">
            <img className="proof-dial__sun" src="/characters/prop-sun.webp" alt="" />
            <p className="proof-dial__score">
              {triesCount === 0 ? '?' : scoreOutOfTen}
              <span>in 10</span>
            </p>
            {triesCount === 0 ? (
              <p className="proof-dial__hint">Scroll up, tap Pip, and talk. Your play score shows up here.</p>
            ) : (
              <p className="proof-dial__hint">
                Live from Pip · {hitsCount} clear of {triesCount} · {berryCount} berries
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="room room--dose" id="dose" aria-labelledby="dose-heading">
        <div className="room__inner room__inner--dose">
          <div className="dose-copy">
            <h2 id="dose-heading">
              Practice that fits
              <em> a real afternoon</em>
            </h2>
            <p className="dose-line">
              Structured the way motor-learning research says practice works. Sessions end on a
              cliffhanger, not a tantrum.
            </p>
          </div>
          <img className="dose-prop" src="/characters/prop-rainbow.webp" alt="" />
          <ul className="dose-mega">
            <li>
              <strong>30</strong>
              <span>min a day</span>
            </li>
            <li>
              <strong>12</strong>
              <span>min sittings</span>
            </li>
            <li>
              <strong>~200</strong>
              <span>scored reps</span>
            </li>
            <li>
              <strong>6×</strong>
              <span>vs weekly alone</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="room room--slp" id="therapists" aria-labelledby="slp-heading">
        <div className="room__inner room__inner--slp">
          <div className="slp-lead">
            <h2 id="slp-heading">
              Earn a place
              <em> on the caseload</em>
            </h2>
            <a className="slp-cta" href="mailto:hello@pipa.app?subject=SLP%20early%20access">
              Free for SLPs - bring your caseload
            </a>
          </div>
          <ol className="slp-ledger">
            <li>
              <span className="slp-ledger__mark" aria-hidden="true" />
              <div>
                <h3>Caseload, needs-attention-first</h3>
                <p>See which of your 60 kids need you this week.</p>
              </div>
            </li>
            <li>
              <span className="slp-ledger__mark" aria-hidden="true" />
              <div>
                <h3>Escalation flags</h3>
                <p>Pipa tells you when a pattern needs your eyes - it never guesses.</p>
              </div>
            </li>
            <li>
              <span className="slp-ledger__mark" aria-hidden="true" />
              <div>
                <h3>Dismissal-grade graduation</h3>
                <p>90% in conversation, self-monitoring, parent confirmation.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="room room--trust" id="trust" aria-labelledby="trust-heading">
        <div className="room__inner room__inner--trust">
          <div className="trust-head">
            <h2 id="trust-heading">
              Answers before
              <em> you ask</em>
            </h2>
            <img className="trust-head__art" src="/characters/pip-star.webp" alt="" />
          </div>
          <div className="trust-rows">
            <article>
              <h3>Private by default</h3>
              <p>Voice scored and discarded. Delete everything anytime.</p>
            </article>
            <article>
              <h3>Every conversation on the record</h3>
              <p>Live Pip chats are transcribed, visible to you, and safety-screened.</p>
            </article>
            <article>
              <h3>Honest scope</h3>
              <p>
                Speech sound disorders - kids who talk but are hard to understand. See a
                professional for childhood apraxia, stuttering, language delay, or hearing concerns.
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>
  )
}

function ChorusMember({ memberName, characterImagePath, chorusIndex, phoneme, promptWord, playWithPip, isVoiceLocked }) {
  const [burstCount, setBurstCount] = useState(0)
  const [isJumping, setIsJumping] = useState(false)
  const [isActive, setIsActive] = useState(false)

  async function handleChorusTap() {
    if (isVoiceLocked || isActive) return
    setBurstCount((count) => count + 1)
    setIsJumping(true)
    setIsActive(true)
    await playWithPip({
      topic: memberName,
      promptWord,
      phoneme,
      opener: `Hi! I'm ${memberName}. Want to talk? Try saying ${promptWord}!`,
    })
    setIsActive(false)
  }

  return (
    <li style={{ '--chorus-index': chorusIndex }}>
      <button
        type="button"
        className={`chirp-chorus__member ${isActive ? 'is-listening' : ''}`}
        onClick={handleChorusTap}
        aria-label={`Talk with ${memberName}`}
      >
        <img
          src={characterImagePath}
          alt=""
          className={isJumping ? 'is-jumping' : ''}
          onAnimationEnd={() => setIsJumping(false)}
        />
        <StarBurst burstId={burstCount} />
      </button>
    </li>
  )
}

export default function Landing({ onGrownUps, onTryDemo, onSlp }) {
  const pageRef = useRef(null)
  const [awakeFriend, setAwakeFriend] = useState(null)
  const [pipPokeCount, setPipPokeCount] = useState(0)
  const [isPipPoked, setIsPipPoked] = useState(false)
  const [berryCount, setBerryCount] = useState(0)
  const [triesCount, setTriesCount] = useState(0)
  const [hitsCount, setHitsCount] = useState(0)
  const [isBlooming, setIsBlooming] = useState(false)
  const [bubbleText, setBubbleText] = useState('Tap me to play')
  const [hatchedFriendIds, setHatchedFriendIds] = useState(() => new Set())
  const [isPipOnStage, setIsPipOnStage] = useState(true)
  const [sessionsUsed, setSessionsUsed] = useState(() => (
    typeof window === 'undefined' ? 0 : readSessionsUsed()
  ))

  const { scrollYProgress } = useScroll({
    target: pageRef,
    offset: ['start start', 'end end'],
  })

  const scoreOutOfTen =
    triesCount === 0 ? 0 : Math.max(1, Math.min(10, Math.round((hitsCount / triesCount) * 10)))
  const hatchedCount = hatchedFriendIds.size
  const sessionsLeft = Math.max(0, DEMO_SESSION_LIMIT - sessionsUsed)
  const isVoiceLocked = sessionsLeft <= 0

  const { status, playWithPip, isActive } = usePlaySession({
    sessionsUsed,
    onBlocked: () => setBubbleText('Free play is all done - grab the app for more adventures'),
    onSessionFinished: (result) => {
      setSessionsUsed((previousUsed) => {
        const nextUsed = Math.min(DEMO_SESSION_LIMIT, previousUsed + 1)
        writeSessionsUsed(nextUsed)
        const left = DEMO_SESSION_LIMIT - nextUsed
        if (left <= 0) {
          setBubbleText('Thanks for playing! Get the app to keep going')
        } else if (result?.score?.engine === 'mic_denied') {
          setBubbleText('Ask a grown-up to allow the microphone')
        } else {
          setBubbleText(left === 1 ? 'One chat left - tap again' : `${left} chats left - tap again`)
        }
        return nextUsed
      })
      setTriesCount((count) => count + 1)
      if (result?.score?.outcome === 'correct') {
        setHitsCount((count) => count + 1)
        setBerryCount((count) => Math.min(PRACTICE_BERRY_GOAL, count + 1))
        setIsBlooming(true)
        window.setTimeout(() => setIsBlooming(false), 900)
      }
    },
  })

  async function guardedPlay(config) {
    if (isVoiceLocked) {
      setBubbleText('Free play is all done - grab the app for more adventures')
      return null
    }
    setBubbleText('Pip is talking…')
    return playWithPip(config)
  }

  useEffect(() => {
    pipVoiceBridge.ensureConnected().catch(() => {})
    return () => pipVoiceBridge.disconnect()
  }, [])

  useEffect(() => {
    const heroSection = document.getElementById('play')
    if (!heroSection) return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsPipOnStage(entry.isIntersecting && entry.intersectionRatio >= 0.35)
      },
      { threshold: [0.2, 0.35, 0.55, 0.75] },
    )
    observer.observe(heroSection)
    return () => observer.disconnect()
  }, [])

  async function handlePipTap() {
    setPipPokeCount((count) => count + 1)
    setIsPipPoked(true)
    await guardedPlay({
      topic: 'Pip and the sun sound',
      promptWord: PRACTICE_TARGET_WORD,
      phoneme: 's',
      opener: `Hi friend! Let's play. Can you say ${PRACTICE_TARGET_WORD}?`,
    })
  }

  async function handleToyInteract(toyId) {
    const toy = WORLD_TOYS[toyId]
    if (!toy) return
    await guardedPlay({
      topic: toy.topic,
      promptWord: toy.promptWord,
      phoneme: toy.phoneme,
      opener: toy.opener,
    })
  }

  function handleEggHatched(nestFriend) {
    setHatchedFriendIds((previousIds) => {
      if (previousIds.has(nestFriend.friendId)) return previousIds
      const nextIds = new Set(previousIds)
      nextIds.add(nestFriend.friendId)
      return nextIds
    })
  }

  const bubbleLive =
    status === 'talking' ? 'Pip is talking…'
      : status === 'listening' ? 'Your turn - talk to Pip'
        : bubbleText

  return (
    <div
      className={`chirp-land ${isBlooming ? 'is-blooming' : ''} ${isActive ? 'is-listening' : ''}`}
      id="top"
      ref={pageRef}
    >
      <WorldAtmosphere
        scrollYProgress={scrollYProgress}
        isBlooming={isBlooming}
        berryCount={berryCount}
        onToyInteract={handleToyInteract}
      />

      <WorldPip
        isVisible={isPipOnStage}
        isListening={status === 'listening'}
        isScoring={false}
        isModeling={status === 'talking'}
        bubbleText={bubbleLive}
        scoreOutOfTen={scoreOutOfTen}
        triesCount={triesCount}
        pokeBurstCount={pipPokeCount}
        isPoked={isPipPoked}
        onPipTap={handlePipTap}
        onPokeAnimationEnd={() => setIsPipPoked(false)}
      />

      <header className="chirp-nav">
        <PipaWordmark className="chirp-wordmark" />
        <nav aria-label="Main navigation">
          <a href="#play">Play</a>
          <a href="#nest">Nest</a>
          <a href="#journey">Story</a>
          <a href="#proof">Proof</a>
          <a href="#therapists">SLPs</a>
        </nav>
        <div className="chirp-nav__actions">
          {typeof onSlp === 'function' && (
            <button
              type="button"
              className="chirp-nav__demo"
              onClick={onSlp}
            >
              For SLPs
            </button>
          )}
          {typeof onTryDemo === 'function' && (
            <button
              type="button"
              className="chirp-nav__demo"
              onClick={onTryDemo}
            >
              Preview nest
            </button>
          )}
          {typeof onGrownUps === 'function' && (
            <button
              type="button"
              className="chirp-nav__grownups"
              onClick={onGrownUps}
            >
              Grown-ups
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="stage-hero" id="play" aria-label="Meet Pip">
          <div className="stage-hero__copy">
            <p className="stage-hero__brand">pipa!</p>
            <h1>
              Speech practice your kid begs for.
              <em> Progress you can prove.</em>
            </h1>
            <p className="stage-hero__sub">
              Tap Pip or a friend and talk. Three free chats on us.
            </p>
            <p className="stage-hero__plays" aria-live="polite">
              {isVoiceLocked
                ? 'Free chats used up'
                : `${sessionsLeft} free chat${sessionsLeft === 1 ? '' : 's'} left`}
            </p>
            <div className="stage-hero__ctaRow">
              {typeof onGrownUps === 'function' && (
                <button
                  type="button"
                  className="stage-hero__grownups"
                  onClick={onGrownUps}
                >
                  Open the parent nest
                </button>
              )}
              {typeof onTryDemo === 'function' && (
                <button
                  type="button"
                  className="stage-hero__demo"
                  onClick={onTryDemo}
                >
                  Preview the dashboard
                </button>
              )}
            </div>
            <WaitlistForm />
            <StoreAvailability className="store-availability--hero" />
          </div>
        </section>

        <section className="stage-nest" id="nest" aria-label="Hatch nest friends">
          <h2 className="stage-nest__title">
            Say the word.
            <em> Hatch a friend.</em>
          </h2>
          <p className="stage-nest__clinician">
            Built on the methods SLPs use - prescribed alongside therapy, never instead of it.
          </p>
          <div className="voice-egg-rail">
            {NEST_FRIENDS.map((nestFriend, cardIndex) => (
              <CrackedEgg
                key={nestFriend.friendId}
                nestFriend={nestFriend}
                cardIndex={cardIndex}
                isAwake={awakeFriend?.friendId === nestFriend.friendId}
                onWake={setAwakeFriend}
                onHatched={handleEggHatched}
                playWithPip={guardedPlay}
                isVoiceLocked={isVoiceLocked || isActive}
              />
            ))}
          </div>
          <p className="stage-nest__whisper" aria-live="polite">
            {awakeFriend
              ? `${awakeFriend.friendName} · ${awakeFriend.targetSound}`
              : `Talk to hatch a friend · ${hatchedCount}/${NEST_FRIENDS.length}`}
          </p>
        </section>

        <ParentChapters
          scoreOutOfTen={scoreOutOfTen}
          triesCount={triesCount}
          hitsCount={hitsCount}
          berryCount={berryCount}
        />

        <section className="stage-finale" aria-label="Meet the nest">
          <h2>
            Let&rsquo;s make
            <br />
            <em>some noise!</em>
          </h2>
          <ul className="chirp-chorus">
            {[
              { memberName: 'Pip', characterImagePath: '/characters/pip-hop.webp', phoneme: 's', promptWord: 'sun' },
              ...NEST_FRIENDS.map((friend) => ({
                memberName: friend.friendName,
                characterImagePath: friend.characterImagePath,
                phoneme: friend.phoneme,
                promptWord: friend.exampleWord,
              })),
            ].map((member, chorusIndex) => (
              <ChorusMember
                key={member.characterImagePath}
                memberName={member.memberName}
                characterImagePath={member.characterImagePath}
                chorusIndex={chorusIndex}
                phoneme={member.phoneme}
                promptWord={member.promptWord}
                playWithPip={guardedPlay}
                isVoiceLocked={isVoiceLocked || isActive}
              />
            ))}
          </ul>
          <StoreAvailability className="store-availability--finale" />
        </section>
      </main>

      <footer className="chirp-footer">
        <PipaWordmark className="chirp-wordmark chirp-wordmark--onInk" />
        <p>Home practice for speech sound disorders.</p>
        <nav className="chirp-footer__legal" aria-label="Legal">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms</a>
        </nav>
      </footer>
    </div>
  )
}
