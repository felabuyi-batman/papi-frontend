import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'

const STACKED_PROOF_LAYOUT_MEDIA_QUERY = '(max-width: 900px)'

function useStackedProofLayout() {
  const [isStackedProofLayout, setIsStackedProofLayout] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(STACKED_PROOF_LAYOUT_MEDIA_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQueryList = window.matchMedia(STACKED_PROOF_LAYOUT_MEDIA_QUERY)
    const syncStackedProofLayout = () => {
      setIsStackedProofLayout(mediaQueryList.matches)
    }

    syncStackedProofLayout()
    mediaQueryList.addEventListener('change', syncStackedProofLayout)
    return () => mediaQueryList.removeEventListener('change', syncStackedProofLayout)
  }, [])

  return isStackedProofLayout
}

const PROOF_PANELS = [
  {
    panelId: 'intro',
    eyebrow: 'Live score',
    title: 'Progress you',
    titleEmphasis: ' can prove',
    body: 'Pipa re-tests on words your child never practiced — so the progress you see is real speech change, not memorization.',
  },
  {
    panelId: 'dial',
    isDialPanel: true,
  },
  {
    panelId: 'research',
    eyebrow: 'Motor learning',
    title: 'Daily reps',
    titleEmphasis: ' that stick',
    body: 'Structured practice windows, scored repetitions, and cliffhanger endings — the same dose science SLPs prescribe, in a toy world.',
  },
  {
    panelId: 'berries',
    eyebrow: 'Rewards',
    title: 'Berries bloom',
    titleEmphasis: ' when it clicks',
    body: 'Every clear sound earns meadow berries. Kids feel progress; parents see the dial move in real time during the live demo.',
  },
]

export default function PinnedProofChapter({
  scoreOutOfTen,
  triesCount,
  hitsCount,
  berryCount,
}) {
  const chapterRef = useRef(null)
  const prefersReducedMotion = useReducedMotion()
  const isStackedProofLayout = useStackedProofLayout()
  const shouldPinHorizontally = !prefersReducedMotion && !isStackedProofLayout

  const { scrollYProgress } = useScroll({
    target: chapterRef,
    offset: ['start start', 'end end'],
  })

  const horizontalTranslatePercent = useTransform(scrollYProgress, [0, 1], ['0%', '-75%'])

  return (
    <section
      ref={chapterRef}
      className={`proof-pin-chapter room room--proof${isStackedProofLayout ? ' is-stacked' : ''}`}
      id="proof"
      aria-labelledby="proof-heading"
    >
      <div className="proof-pin-chapter__sticky">
        <motion.div
          className="proof-pin-chapter__track"
          style={shouldPinHorizontally ? { x: horizontalTranslatePercent } : undefined}
        >
          {PROOF_PANELS.map((panel) => {
            if (panel.isDialPanel) {
              return (
                <article
                  key={panel.panelId}
                  className="proof-pin-chapter__panel proof-pin-chapter__panel--dial"
                >
                  <div className={`proof-dial ${triesCount > 0 ? 'has-score' : ''}`} aria-live="polite">
                    <img className="proof-dial__sun" src="/characters/prop-sun.webp" alt="" />
                    <p className="proof-dial__score">
                      {triesCount === 0 ? '?' : scoreOutOfTen}
                      <span>in 10</span>
                    </p>
                    {triesCount === 0 ? (
                      <p className="proof-dial__hint">
                        Scroll up, tap Pipa, and talk. Your play score shows up here.
                      </p>
                    ) : (
                      <p className="proof-dial__hint">
                        Live from Pipa · {hitsCount} clear of {triesCount} · {berryCount} berries
                      </p>
                    )}
                  </div>
                </article>
              )
            }

            return (
              <article key={panel.panelId} className="proof-pin-chapter__panel">
                <p className="room__eyebrow">{panel.eyebrow}</p>
                <h2 id={panel.panelId === 'intro' ? 'proof-heading' : undefined}>
                  {panel.title}
                  <em>{panel.titleEmphasis}</em>
                </h2>
                <p className="proof-line">{panel.body}</p>
              </article>
            )
          })}
        </motion.div>
        {shouldPinHorizontally && (
          <div className="proof-pin-chapter__scroll-hint" aria-hidden="true">
            <span>Scroll</span>
          </div>
        )}
      </div>
    </section>
  )
}
