import { useEffect, useState } from 'react'

/* ------------------------------------------------------------------ sound
 * WebAudio chimes — no asset pipeline, instant, and tuned to be sweet not
 * slot-machine. Correct = rising major third; basket full = arpeggio;
 * gentle = single soft low tone (acknowledgment, never a buzzer). */
let ctx
function tone(freq, t0, dur, type = 'sine', gain = 0.18) {
  const o = ctx.createOscillator(); const g = ctx.createGain()
  o.type = type; o.frequency.value = freq
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t0); o.stop(t0 + dur + 0.05)
}
export const sfx = {
  init() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)() },
  correct() { this.init(); const t = ctx.currentTime; tone(523, t, 0.18); tone(659, t + 0.1, 0.25) },
  basket() { this.init(); const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.3)) },
  gentle() { this.init(); tone(330, ctx.currentTime, 0.35, 'triangle', 0.1) },
  chirp() { this.init(); const t = ctx.currentTime; tone(1400, t, 0.08, 'square', 0.05); tone(1750, t + 0.09, 0.07, 'square', 0.05) },
}

/* ------------------------------------------------------------- berry arc */
export function BerryFlight({ trigger }) {
  // re-mounts on each trigger to replay the arc
  return trigger ? (
    <svg key={trigger} width="40" height="40" viewBox="0 0 40 40" className="berry-flight" aria-hidden="true">
      <circle cx="20" cy="22" r="13" fill="#d84a6b" />
      <circle cx="15" cy="18" r="4" fill="#f08fa8" />
      <path d="M20 9 q3 -6 8 -6 q-2 6 -8 6" fill="#4a9e5c" />
    </svg>
  ) : null
}

/* ---------------------------------------------------------------- basket */
export function Basket({ filled, capacity }) {
  return (
    <div className="basket-wrap" aria-label={`Berry basket: ${filled} of ${capacity}`}>
      <svg width="120" height="86" viewBox="0 0 120 86">
        {/* berries inside, stacked in rows */}
        {Array.from({ length: filled }).map((_, i) => (
          <circle key={i} className="berry-pop"
            cx={26 + (i % 5) * 17 + (Math.floor(i / 5) % 2) * 8}
            cy={46 - Math.floor(i / 5) * 12}
            r="8" fill={['#d84a6b', '#c73f60', '#e05a7a'][i % 3]} />
        ))}
        <path d="M14 40 L106 40 L96 78 Q60 86 24 78 Z" fill="var(--nest)" />
        <path d="M14 40 L106 40 L103 50 L17 50 Z" fill="#9a7148" />
        {/* weave lines */}
        <path d="M24 58 h74 M28 68 h66" stroke="#8a6440" strokeWidth="2.5" fill="none" />
        <path d="M34 44 v32 M56 44 v36 M78 44 v34 M98 44 v28" stroke="#8a6440" strokeWidth="2" fill="none" opacity="0.6" />
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------- confetti */
export function Confetti({ burst }) {
  if (!burst) return null
  const colors = ['#ffc93c', '#d84a6b', '#8ab6e8', '#7bbf72', '#e88ac2']
  return (
    <div key={burst} className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 26 }).map((_, i) => (
        <span key={i} className="confetti-bit" style={{
          left: `${8 + Math.random() * 84}%`,
          background: colors[i % colors.length],
          width: 6 + Math.random() * 7,
          height: 8 + Math.random() * 8,
          animationDelay: `${Math.random() * 0.25}s`,
          animationDuration: `${1 + Math.random() * 0.8}s`,
          ['--drift']: `${(Math.random() - 0.5) * 120}px`,
          ['--spin']: `${360 + Math.random() * 540}deg`,
        }} />
      ))}
    </div>
  )
}

/* ----------------------------------------------- friend birds collection */
const FRIENDS = [
  { name: 'Stella', src: '/characters/friend-stella-star.webp' },
  { name: 'Rory', src: '/characters/friend-rory-rocket.webp' },
  { name: 'Lulu', src: '/characters/friend-lulu-lion.webp' },
  { name: 'Theo', src: '/characters/friend-theo-thunder.webp' },
]

export function FriendBird({ index, size = 54, hatching = false }) {
  const friend = FRIENDS[index % FRIENDS.length]
  return (
    <img
      src={friend.src}
      width={size}
      height={size}
      className={hatching ? 'friend-hatch' : ''}
      alt={`${friend.name}, one of Pip’s friends`}
    />
  )
}

export function friendName(index) { return FRIENDS[index % FRIENDS.length].name }

/* --------------------------------------------- hatch celebration overlay */
export function HatchOverlay({ friendIndex, onDone }) {
  const [cracked, setCracked] = useState(false)
  useEffect(() => {
    sfx.basket()
    const t1 = setTimeout(() => setCracked(true), 900)
    const t2 = setTimeout(onDone, 3400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])
  return (
    <div className="hatch-overlay" role="dialog" aria-label="A new friend hatched!">
      <Confetti burst={cracked ? 1 : 0} />
      {!cracked ? (
        <svg width="130" height="150" viewBox="0 0 130 150" className="egg-wobble">
          <ellipse cx="65" cy="85" rx="46" ry="58" fill="#fdf6e3" stroke="#e8ddc0" strokeWidth="3" />
          <path d="M40 70 l12 10 l10 -12 l12 12 l12 -10" stroke="#d9cba4" strokeWidth="3" fill="none" />
        </svg>
      ) : (
        <div className="hatch-reveal">
          <FriendBird index={friendIndex} size={110} hatching />
          <p className="hatch-name">{friendName(friendIndex)} hatched!</p>
        </div>
      )}
    </div>
  )
}
