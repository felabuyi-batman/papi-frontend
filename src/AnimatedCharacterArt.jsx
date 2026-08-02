import { useEffect, useId, useRef, useState } from 'react'
import './character-life.css'

/**
 * Exact Pip rig from pip_talking-3.html:
 * body + hinged upper/lower beak layers. Idle bob and talk jaw run on the
 * whole rig (never the body alone), matching the attached demo.
 */
function RiggedPipCharacter({ alt, talking, floating, className, onAnimationEnd }) {
  const [isBlinking, setIsBlinking] = useState(false)
  const gradientIdPrefix = useId().replaceAll(':', '')
  const rigRef = useRef(null)
  const beakLowerRef = useRef(null)
  const lidsRef = useRef(null)
  const lidLeftRef = useRef(null)
  const lidRightRef = useRef(null)
  const talkingRef = useRef(Boolean(talking))
  const floatingRef = useRef(floating !== false)

  useEffect(() => {
    talkingRef.current = Boolean(talking)
  }, [talking])

  useEffect(() => {
    floatingRef.current = floating !== false
  }, [floating])

  useEffect(() => {
    let blinkTimeout
    let blinkFrameId = 0
    let cancelled = false

    function applyBlink(blinkValue) {
      if (!lidLeftRef.current || !lidRightRef.current || !lidsRef.current) return
      lidsRef.current.setAttribute('opacity', blinkValue > 0.02 ? '1' : '0')
      lidLeftRef.current.setAttribute(
        'transform',
        `translate(426 326) scale(1 ${blinkValue.toFixed(3)}) translate(-426 -326)`,
      )
      lidRightRef.current.setAttribute(
        'transform',
        `translate(596 325) scale(1 ${blinkValue.toFixed(3)}) translate(-596 -325)`,
      )
    }

    function doBlink() {
      if (cancelled) return
      setIsBlinking(true)
      const startedAt = performance.now()
      function stepBlink(now) {
        if (cancelled) return
        const elapsed = (now - startedAt) / 150
        const blinkValue = elapsed < 0.5 ? elapsed * 2 : Math.max(0, 1 - (elapsed - 0.5) * 2)
        applyBlink(blinkValue)
        if (elapsed < 1) {
          blinkFrameId = window.requestAnimationFrame(stepBlink)
        } else {
          applyBlink(0)
          setIsBlinking(false)
          scheduleBlink()
        }
      }
      blinkFrameId = window.requestAnimationFrame(stepBlink)
    }

    function scheduleBlink() {
      if (cancelled) return
      blinkTimeout = window.setTimeout(doBlink, 2000 + Math.random() * 2800)
    }

    applyBlink(0)
    scheduleBlink()
    return () => {
      cancelled = true
      window.clearTimeout(blinkTimeout)
      window.cancelAnimationFrame(blinkFrameId)
    }
  }, [])

  useEffect(() => {
    const startedAt = performance.now()
    let jaw = 0
    let jawTarget = 0
    let hop = 0
    let frameId = 0
    let jawIntervalId = 0
    let lastTalking = false
    let jawTick = 0

    function stopJawChatter() {
      if (jawIntervalId) {
        window.clearInterval(jawIntervalId)
        jawIntervalId = 0
      }
      jawTarget = 0
    }

    function startJawChatter() {
      stopJawChatter()
      jawTick = 0
      // Same cadence as pip_talking-3.html — update jaw target on an interval, not every frame.
      jawIntervalId = window.setInterval(() => {
        jawTarget = (jawTick++ % 2 === 0)
          ? (0.55 + Math.random() * 0.45)
          : (0.05 + Math.random() * 0.13)
      }, 110)
    }

    function frame(now) {
      const seconds = (now - startedAt) / 1000
      const isTalking = talkingRef.current
      const isFloating = floatingRef.current

      if (isTalking && !lastTalking) startJawChatter()
      if (!isTalking && lastTalking) stopJawChatter()
      lastTalking = isTalking

      jaw += (jawTarget - jaw) * (jawTarget > jaw ? 0.55 : 0.18)
      hop += (0 - hop) * 0.12
      if (jaw < 0.002) jaw = 0

      const breathe = isFloating ? Math.sin(seconds * 2.1) * 0.012 : 0
      const bob = isTalking
        ? Math.sin(seconds * 10) * 0.9
        : (isFloating ? Math.sin(seconds * 2.1) * 0.5 : 0)
      const sway = isTalking ? Math.sin(seconds * 4.4) * 0.8 : 0

      if (rigRef.current) {
        rigRef.current.style.transform = (
          `translateY(${(bob + hop).toFixed(2)}px) `
          + `rotate(${sway.toFixed(2)}deg) `
          + `scale(${(1 + breathe).toFixed(4)}, ${(1 - breathe).toFixed(4)})`
        )
      }
      if (beakLowerRef.current) {
        // Exact hinge motion from pip_talking-3.html — lower beak only.
        beakLowerRef.current.style.transform = (
          `translateY(${(jaw * 16).toFixed(2)}px) rotate(${(jaw * 3).toFixed(2)}deg)`
        )
      }

      frameId = window.requestAnimationFrame(frame)
    }

    frameId = window.requestAnimationFrame(frame)
    return () => {
      window.cancelAnimationFrame(frameId)
      stopJawChatter()
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
      <span className="character-life__rig" ref={rigRef}>
        <span className="character-life__rig-shadow" aria-hidden="true" />
        <img
          className="character-life__rig-body"
          src="/characters/pip-rig-body.png?v=talking-3"
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
          <g ref={lidsRef} opacity="0">
            <ellipse
              ref={lidLeftRef}
              className="character-life__rig-lid character-life__rig-lid--left"
              cx="426"
              cy="409"
              rx="79"
              ry="83"
              fill={`url(#${gradientIdPrefix}-left-lid)`}
            />
            <ellipse
              ref={lidRightRef}
              className="character-life__rig-lid character-life__rig-lid--right"
              cx="596"
              cy="408"
              rx="79"
              ry="83"
              fill={`url(#${gradientIdPrefix}-right-lid)`}
            />
          </g>
        </svg>
        <img
          className="character-life__rig-beak character-life__rig-beak--upper"
          src="/characters/pip-rig-beak-upper.png?v=talking-3"
          alt=""
        />
        <img
          ref={beakLowerRef}
          className="character-life__rig-beak character-life__rig-beak--lower"
          src="/characters/pip-rig-beak-lower.png?v=talking-3"
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
