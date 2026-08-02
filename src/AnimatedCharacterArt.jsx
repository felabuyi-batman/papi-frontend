import { useEffect, useId, useRef, useState } from 'react'
import './character-life.css'

/**
 * Per-artwork eyelid geometry (image pixel space). Only eyelids animate —
 * no body bob, wings, or fake beaks on these sprites.
 */
const CHARACTER_EYELID_LAYOUTS = {
  '/characters/prop-hatching-egg.webp': {
    viewBox: '0 0 553 822',
    left: { cx: 197, cy: 317, rx: 36, ry: 40, hingeY: 276, fill: '#F4C53A' },
    right: { cx: 361, cy: 314, rx: 36, ry: 40, hingeY: 273, fill: '#F4C53A' },
  },
  '/characters/friend-stella-star.webp': {
    viewBox: '0 0 782 833',
    left: { cx: 310, cy: 408, rx: 34, ry: 35, hingeY: 375, fill: '#F5C93A' },
    right: { cx: 502, cy: 408, rx: 34, ry: 35, hingeY: 375, fill: '#F5C93A' },
  },
  '/characters/friend-rory-rocket.webp': {
    viewBox: '0 0 549 860',
    left: { cx: 222, cy: 395, rx: 27, ry: 28, hingeY: 368, fill: '#E8DDD2' },
    right: { cx: 322, cy: 395, rx: 29, ry: 30, hingeY: 366, fill: '#E8DDD2' },
  },
  '/characters/friend-lulu-lion.webp': {
    viewBox: '0 0 607 830',
    left: { cx: 214, cy: 305, rx: 33, ry: 34, hingeY: 273, fill: '#F6D45A' },
    right: { cx: 374, cy: 305, rx: 33, ry: 34, hingeY: 273, fill: '#F6D45A' },
  },
  '/characters/friend-theo-thunder.webp': {
    viewBox: '0 0 827 721',
    left: { cx: 303, cy: 292, rx: 48, ry: 50, hingeY: 244, fill: '#A9D0F5' },
    right: { cx: 493, cy: 290, rx: 47, ry: 49, hingeY: 243, fill: '#A9D0F5' },
  },
  '/characters/pip-hop.webp': {
    viewBox: '0 0 673 780',
    left: { cx: 272, cy: 275, rx: 33, ry: 34, hingeY: 243, fill: '#F4C53A' },
    right: { cx: 413, cy: 275, rx: 33, ry: 34, hingeY: 243, fill: '#F4C53A' },
  },
  '/characters/pip-star.webp': {
    viewBox: '0 0 632 764',
    left: { cx: 266, cy: 307, rx: 35, ry: 36, hingeY: 273, fill: '#F4C53A' },
    right: { cx: 416, cy: 307, rx: 35, ry: 36, hingeY: 273, fill: '#F4C53A' },
  },
}

function resolveCharacterSourcePath(src = '') {
  if (!src) return ''
  try {
    return new URL(src, 'https://local.invalid').pathname
  } catch {
    return src.split('?')[0]
  }
}

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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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
      if (cancelled || prefersReducedMotion) return
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
 * Flat character artwork with eyelid overlays that blink on a staggered loop.
 */
function BlinkingArtworkCharacter({
  src,
  alt,
  variantClassName,
  className,
  onAnimationEnd,
  blinkDelayMs = 0,
  eyelidLayout,
}) {
  const lidsRef = useRef(null)
  const lidLeftRef = useRef(null)
  const lidRightRef = useRef(null)
  const leftEye = eyelidLayout.left
  const rightEye = eyelidLayout.right

  useEffect(() => {
    let blinkTimeout
    let blinkFrameId = 0
    let cancelled = false
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function applyBlink(blinkValue) {
      if (!lidLeftRef.current || !lidRightRef.current || !lidsRef.current) return
      lidsRef.current.setAttribute('opacity', blinkValue > 0.02 ? '1' : '0')
      const scale = blinkValue.toFixed(3)
      lidLeftRef.current.setAttribute(
        'transform',
        `translate(${leftEye.cx} ${leftEye.hingeY}) scale(1 ${scale}) translate(${-leftEye.cx} ${-leftEye.hingeY})`,
      )
      lidRightRef.current.setAttribute(
        'transform',
        `translate(${rightEye.cx} ${rightEye.hingeY}) scale(1 ${scale}) translate(${-rightEye.cx} ${-rightEye.hingeY})`,
      )
    }

    function doBlink() {
      if (cancelled) return
      const startedAt = performance.now()
      function stepBlink(now) {
        if (cancelled) return
        const elapsed = (now - startedAt) / 160
        const blinkValue = elapsed < 0.5 ? elapsed * 2 : Math.max(0, 1 - (elapsed - 0.5) * 2)
        applyBlink(blinkValue)
        if (elapsed < 1) {
          blinkFrameId = window.requestAnimationFrame(stepBlink)
        } else {
          applyBlink(0)
          scheduleBlink()
        }
      }
      blinkFrameId = window.requestAnimationFrame(stepBlink)
    }

    function scheduleBlink() {
      if (cancelled || prefersReducedMotion) return
      blinkTimeout = window.setTimeout(doBlink, 2200 + blinkDelayMs + Math.random() * 2600)
    }

    applyBlink(0)
    scheduleBlink()
    return () => {
      cancelled = true
      window.clearTimeout(blinkTimeout)
      window.cancelAnimationFrame(blinkFrameId)
    }
  }, [blinkDelayMs, leftEye.cx, leftEye.hingeY, rightEye.cx, rightEye.hingeY])

  return (
    <span
      className={['character-life', variantClassName, className].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
    >
      <img className="character-life__art" src={src} alt={alt} />
      <svg
        className="character-life__lids"
        viewBox={eyelidLayout.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g ref={lidsRef} opacity="0">
          <ellipse
            ref={lidLeftRef}
            className="character-life__lid"
            cx={leftEye.cx}
            cy={leftEye.cy}
            rx={leftEye.rx}
            ry={leftEye.ry}
            fill={leftEye.fill}
          />
          <ellipse
            ref={lidRightRef}
            className="character-life__lid"
            cx={rightEye.cx}
            cy={rightEye.cy}
            rx={rightEye.rx}
            ry={rightEye.ry}
            fill={rightEye.fill}
          />
        </g>
      </svg>
    </span>
  )
}

/**
 * Pip uses the hinged artwork rig. Flat characters blink eyelids only when
 * their source art has a measured eyelid layout.
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
  blinkDelayMs = 0,
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

  const sourcePath = resolveCharacterSourcePath(src)
  const eyelidLayout = CHARACTER_EYELID_LAYOUTS[sourcePath]
  const variantClassName = variant === 'egg' ? 'character-life--egg' : 'character-life--friend'

  if (eyelidLayout) {
    return (
      <BlinkingArtworkCharacter
        src={src}
        alt={alt}
        variantClassName={variantClassName}
        className={className}
        onAnimationEnd={onAnimationEnd}
        blinkDelayMs={blinkDelayMs}
        eyelidLayout={eyelidLayout}
      />
    )
  }

  return (
    <span
      className={['character-life', variantClassName, className].filter(Boolean).join(' ')}
      onAnimationEnd={onAnimationEnd}
    >
      <img className="character-life__art" src={src} alt={alt} />
    </span>
  )
}
