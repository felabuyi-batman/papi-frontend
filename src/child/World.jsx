const WORLD_LABELS = {
  nest: 'The Nest',
  meadow: 'Sunbeam Meadow',
  brook: 'Bubble Brook',
  forest: 'Whispering Forest',
  shore: 'Singing Shore',
}

/**
 * Shared child atmosphere. Backend world state chooses the chapter; canonical
 * landing props keep every syllabus stage inside the same inhabited world.
 */
export default function World({ warmth = 0, world }) {
  const worldId = world?.current || world?.world_id || 'meadow'
  const label = WORLD_LABELS[worldId] || WORLD_LABELS.meadow

  return (
    <div
      className={`syllabus-atmosphere syllabus-atmosphere--${worldId}`}
      data-warmth={Math.round(warmth * 10)}
      aria-hidden="true"
    >
      <span className="syllabus-atmosphere__label">{label}</span>
      <img
        className="syllabus-atmosphere__sun"
        src="/characters/prop-sun.webp"
        alt=""
      />
      <img
        className="syllabus-atmosphere__cloud syllabus-atmosphere__cloud--a"
        src="/illustrations/cloud-fluff.svg"
        alt=""
      />
      <img
        className="syllabus-atmosphere__cloud syllabus-atmosphere__cloud--b"
        src="/illustrations/cloud-fluff-b.svg"
        alt=""
      />
      <img
        className="syllabus-atmosphere__rainbow"
        src="/characters/prop-rainbow.webp"
        alt=""
      />
      <div className="syllabus-atmosphere__hill syllabus-atmosphere__hill--far" />
      <div className="syllabus-atmosphere__hill syllabus-atmosphere__hill--middle" />
      <div className="syllabus-atmosphere__hill syllabus-atmosphere__hill--near" />
      <div className="syllabus-atmosphere__glow" />
    </div>
  )
}
