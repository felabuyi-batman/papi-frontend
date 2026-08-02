import { useState } from 'react'
import AnimatedCharacterArt from '../AnimatedCharacterArt.jsx'

/**
 * The supplied Pip artwork is the visual source of truth. State classes add
 * responsive movement without redrawing or visually competing with the character.
 */
export default function Character({ state = 'idle', onTap, size = 300 }) {
  const [isPoked, setIsPoked] = useState(false)

  function handlePipTap() {
    setIsPoked(true)
    window.setTimeout(() => setIsPoked(false), 650)
    onTap?.()
  }

  const artwork = state === 'celebrate' || state === 'listening'
    ? '/characters/pip-star.webp'
    : '/characters/pip-hop.webp'

  return (
    <button
      type="button"
      className={`pip-character pip-character--${state} ${isPoked ? 'is-poked' : ''}`}
      style={{ '--pip-size': `${size}px` }}
      onClick={handlePipTap}
      aria-label="Pip the bird. Tap Pip to hear a chirp."
    >
      <AnimatedCharacterArt
        src={artwork}
        alt="Pip, a bright yellow bird friend"
        talking={state === 'model'}
      />
      {state === 'listening' && <span className="pip-character__listening" aria-hidden="true"><i /><i /><i /></span>}
      {state === 'celebrate' && <span className="pip-character__spark pip-character__spark--one" aria-hidden="true">✦</span>}
      {state === 'celebrate' && <span className="pip-character__spark pip-character__spark--two" aria-hidden="true">✦</span>}
    </button>
  )
}
