import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Character from './Character.jsx'
import MathSession from './MathSession.jsx'
import PracticeSession from './PracticeSession.jsx'
import World from './World.jsx'

function ExperienceLoading({ message = 'Pip is finding today’s adventure…' }) {
  return (
    <div className="syllabus-world">
      <World world={{ current: 'nest', unlocked: ['nest'] }} />
      <main className="syllabus-world__center">
        <Character state="idle" size={250} />
        <p className="syllabus-bubble" aria-live="polite">{message}</p>
      </main>
    </div>
  )
}

function FreePlayStage({ engagement, onExit }) {
  const friends = engagement?.friends || []
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [pictureDeck, setPictureDeck] = useState([])
  const [pictureIndex, setPictureIndex] = useState(0)
  const friendArt = [
    '/characters/friend-stella-star.webp',
    '/characters/friend-rory-rocket.webp',
    '/characters/friend-lulu-lion.webp',
    '/characters/friend-theo-thunder.webp',
  ]

  useEffect(() => {
    let cancelled = false
    api.pictures().then((payload) => {
      if (!cancelled) setPictureDeck(payload.pictures || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const picture = pictureDeck[pictureIndex]

  return (
    <div className="syllabus-world">
      <World world={engagement?.world} warmth={1} />
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onExit}>←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">Free play</div>
      </header>
      <main className="free-play-stage">
        <div>
          <p className="syllabus-kicker">TODAY’S PRACTICE IS COMPLETE</p>
          <h1>Explore the meadow.</h1>
          <p>Tap a friend. There is no scoring here.</p>
        </div>
        <div className="free-play-stage__friends">
          {(friends.length ? friends : [{ id: 'pip', name: 'Pip' }]).map((friend, index) => (
            <button
              key={friend.id}
              type="button"
              className="free-play-friend"
              onClick={() => setSelectedFriend(friend)}
            >
              <img src={friendArt[index % friendArt.length]} alt="" />
              <strong>{friend.name}</strong>
              <span>{friend.phoneme ? `/${friend.phoneme}/ friend` : 'meadow friend'}</span>
            </button>
          ))}
        </div>
        {picture ? (
          <div className="free-play-deck">
            <button
              type="button"
              aria-label="Previous picture"
              onClick={() => setPictureIndex((value) => (
                (value - 1 + pictureDeck.length) % pictureDeck.length
              ))}
            >
              ←
            </button>
            <div>
              <img src={api.pictureUrl(picture)} alt={picture.word} />
              <strong>{picture.word}</strong>
              <span>{pictureIndex + 1} / {pictureDeck.length}</span>
            </div>
            <button
              type="button"
              aria-label="Next picture"
              onClick={() => setPictureIndex((value) => (value + 1) % pictureDeck.length)}
            >
              →
            </button>
          </div>
        ) : (
          <p className="syllabus-bubble" aria-live="polite">
            Wander the meadow with a friend. Picture cards appear when the nest has them.
          </p>
        )}
        {selectedFriend && (
          <p className="syllabus-bubble" aria-live="polite">
            {selectedFriend.name} is happy you came to play!
          </p>
        )}
      </main>
    </div>
  )
}

function GraduationStage({ engagement, child, onExit, onRefresh }) {
  const ready = engagement?.graduation_ready || []
  const [celebrated, setCelebrated] = useState(false)

  return (
    <div className="syllabus-world syllabus-world--graduation">
      <World world={engagement?.world} warmth={1} />
      <header className="syllabus-header">
        <button type="button" className="syllabus-back" onClick={onExit}>←</button>
        <div className="syllabus-brand"><span>p</span> pipa</div>
        <div className="syllabus-chip">Graduation</div>
      </header>
      <main className="graduation-stage">
        <Character state="celebrate" size={280} />
        <p className="syllabus-kicker">THE WHOLE NEST IS SINGING</p>
        <h1>{child.display_name} found a brave new sound.</h1>
        <div className="graduation-stage__medals">
          {ready.map((target) => (
            <div className="sound-medal" key={target.phoneme}>/{target.phoneme}/</div>
          ))}
        </div>
        <button
          type="button"
          className="syllabus-primary"
          onClick={() => {
            setCelebrated(true)
            onRefresh?.()
          }}
        >
          {celebrated ? 'Medallion added!' : 'Add to the trophy nest'}
        </button>
      </main>
    </div>
  )
}

export default function ChildExperience({ child, onExit }) {
  const [engagement, setEngagement] = useState(null)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.engagement(child.id)
      .then((payload) => {
        if (!cancelled) setEngagement(payload)
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message)
      })
    return () => { cancelled = true }
  }, [child.id, refreshKey])

  if (error) {
    return (
      <div className="syllabus-world">
        <World />
        <main className="syllabus-world__center">
          <Character state="gentle" size={230} />
          <p className="syllabus-bubble">{error}</p>
          <button
            type="button"
            className="syllabus-primary"
            onClick={() => {
              setError(null)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
          <button type="button" className="syllabus-secondary" onClick={onExit}>Back</button>
        </main>
      </div>
    )
  }
  if (!engagement) return <ExperienceLoading />

  if (engagement.gate?.blocks_practice) {
    return (
      <div className="syllabus-world">
        <World world={engagement.world} />
        <main className="syllabus-world__center">
          <Character state="gentle" size={240} />
          <p className="syllabus-bubble">
            Let’s ask a grown-up before we practice hard sounds.
          </p>
          <button type="button" className="syllabus-primary" onClick={onExit}>
            Back to grown-ups
          </button>
        </main>
      </div>
    )
  }

  if (engagement.recommended_mode === 'free_play') {
    return <FreePlayStage engagement={engagement} onExit={onExit} />
  }
  if (engagement.recommended_mode === 'graduation') {
    return (
      <GraduationStage
        engagement={engagement}
        child={child}
        onExit={onExit}
        onRefresh={() => setRefreshKey((value) => value + 1)}
      />
    )
  }
  if (engagement.recommended_mode === 'math') {
    return (
      <MathSession
        child={child}
        engagement={engagement}
        onExit={onExit}
      />
    )
  }

  return (
    <PracticeSession
      key={`${child.id}-${engagement.recommended_mode}`}
      child={child}
      engagement={engagement}
      recommendedMode={engagement.recommended_mode || 'drill'}
      onExit={onExit}
      onSessionComplete={() => setRefreshKey((value) => value + 1)}
    />
  )
}
