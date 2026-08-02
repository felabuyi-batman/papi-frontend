import { useEffect, useId, useState } from 'react'
import './character-life.css'

function RiggedPipCharacter({ alt, talking, floating, className, onAnimationEnd }) {
  const [isBlinking, setIsBlinking] = useState(false)
  const gradientIdPrefix = useId().replaceAll(':', '')

  useEffect(() => {
    let blinkTimeout
    let finishBlinkTimeout

    function scheduleBlink() {
      blinkTimeout = window.setTimeout(() => {
        setIsBlinking(true)
        finishBlinkTimeout = window.setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 150)
      }, 2000 + Math.random() * 2800)
    }

    scheduleBlink()
    return () => {
      window.clearTimeout(blinkTimeout)
      window.clearTimeout(finishBlinkTimeout)
    }
  }, [])

  return (
    <span
      className={[
        'character-life',
        'character-life--pip-rig',
        floating ? 'is-floating' : '',
        talking ? 'is-talking' : '',
        className,
      ].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
    >
      <span className="character-life__rig">
        <img
          className="character-life__rig-body"
          src="/characters/pip-rig-body.png"
          alt={alt}
        />
        <svg
          className={`character-life__rig-lids ${isBlinking ? 'is-blinking' : ''}`}
          viewBox="0 0 1024 1024"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${gradientIdPrefix}-left-lid`} x1="0" y1="0" x2=".3" y2="1">
              <stop offset="0%" stopColor="#F2AE47" />
              <stop offset="100%" stopColor="#CE9139" />
            </linearGradient>
            <linearGradient id={`${gradientIdPrefix}-right-lid`} x1="0" y1="0" x2=".3" y2="1">
              <stop offset="0%" stopColor="#FFCE5E" />
              <stop offset="100%" stopColor="#E2AC46" />
            </linearGradient>
          </defs>
          <ellipse
            className="character-life__rig-lid character-life__rig-lid--left"
            cx="426"
            cy="409"
            rx="79"
            ry="83"
            fill={`url(#${gradientIdPrefix}-left-lid)`}
          />
          <ellipse
            className="character-life__rig-lid character-life__rig-lid--right"
            cx="596"
            cy="408"
            rx="79"
            ry="83"
            fill={`url(#${gradientIdPrefix}-right-lid)`}
          />
        </svg>
        <img
          className="character-life__rig-beak character-life__rig-beak--upper"
          src="/characters/pip-rig-beak-upper.png"
          alt=""
        />
        <img
          className="character-life__rig-beak character-life__rig-beak--lower"
          src="/characters/pip-rig-beak-lower.png"
          alt=""
        />
      </span>
    </span>
  )
}

/**
 * Pip uses the supplied hinged artwork rig. Hatchlings retain a lightweight
 * blink layer because their source art does not include separate facial assets.
 */
export default function AnimatedCharacterArt({
  src,
  alt = '',
  variant = 'pip',
  talking = false,
  floating = true,
  flapping = false,
  className = '',
  onAnimationEnd,
}) {
  if (variant === 'pip') {
    return (
      <RiggedPipCharacter
        alt={alt}
        talking={talking}
        floating={floating}
        className={className}
        onAnimationEnd={onAnimationEnd}
      />
    )
  }

  // Eggs blink only. Friends stay as supplied artwork — no fake beak overlays.
  const showBlink = variant === 'egg'

  return (
    <span
      className={[
        'character-life',
        `character-life--${variant}`,
        floating ? 'is-floating' : '',
        flapping ? 'is-flapping' : '',
        className,
      ].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
    >
      {flapping && (
        <>
          <span className="character-life__wing character-life__wing--left" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span className="character-life__wing character-life__wing--right" aria-hidden="true">
            <i /><i /><i />
          </span>
        </>
      )}
      <img className="character-life__art" src={src} alt={alt} />
      {showBlink && (
        <span className="character-life__eyes" aria-hidden="true">
          <i /><i />
        </span>
      )}
    </span>
  )
}
