import { useEffect, useState } from 'react'
import { api, DEMO_SLP_EMAIL, DEMO_PASSWORD } from '../api.js'
import { NestShell } from './ParentNest.jsx'
import './parent-nest.css'

export default function SlpNest({ onBack }) {
  const [slpId, setSlpId] = useState(localStorage.getItem('chirp.slpId') || '')
  const [caseload, setCaseload] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function load(id = slpId) {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const [casePayload, statsPayload] = await Promise.all([
        api.slpCaseload(id),
        api.slpStats(id),
      ])
      setCaseload(casePayload.patients || [])
      setStats(statsPayload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function bootstrapDemo() {
    setBusy(true)
    setError(null)
    try {
      await api.login(DEMO_SLP_EMAIL, DEMO_PASSWORD)
      const demo = await api.demoBootstrap()
      const id = demo.slp_id
      setSlpId(id)
      localStorage.setItem('chirp.slpId', id)
      await load(id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (slpId) load(slpId)
  }, [slpId])

  async function saveNote() {
    if (!selected || !note.trim()) return
    setBusy(true)
    try {
      await api.slpNote({ child_id: selected.id, note_text: note.trim() })
      setNote('')
      setMessage('Note saved for the nest.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NestShell
      onBrandClick={onBack}
      topRight={(
        <button type="button" className="nest__back" onClick={onBack}>
          Back to play
        </button>
      )}
      companion={false}
    >
      <p className="nest__kicker">For SLPs</p>
      <h1 className="nest__title">Quiet caseload desk.</h1>
      <p className="nest__lede">
        Clinical companion to the parent nest — needs-attention first, no kid chrome.
      </p>

      {!slpId ? (
        <div className="nest__panel">
          <button type="button" className="nest__primary" disabled={busy} onClick={bootstrapDemo}>
            {busy ? 'Opening desk…' : 'Open demo SLP desk'}
          </button>
          {error && <p className="nest__error">{error}</p>}
        </div>
      ) : (
        <div className="nest__panel slp-desk">
          <div className="slp-desk__stats">
            <div>
              <span>Patients</span>
              <strong>{stats?.patients ?? caseload.length}</strong>
            </div>
            <div>
              <span>Sessions</span>
              <strong>{stats?.sessions ?? '—'}</strong>
            </div>
          </div>

          <ul className="slp-desk__list">
            {caseload.map((patient) => (
              <li key={patient.id}>
                <button
                  type="button"
                  className={selected?.id === patient.id ? 'is-active' : ''}
                  onClick={() => setSelected(patient)}
                >
                  <strong>{patient.name}</strong>
                  <span>
                    {patient.age ? `Age ${patient.age}` : 'Child'}
                    {(patient.target_phonemes || []).length
                      ? ` · /${(patient.target_phonemes || []).join(', ')}/`
                      : ''}
                  </span>
                  <em>
                    streak {patient.streak ?? 0}
                    {patient.avg_accuracy != null ? ` · ${Math.round(patient.avg_accuracy)}%` : ''}
                  </em>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="slp-desk__note">
              <h2>Note for {selected.name}</h2>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="Clinic note — kept on the SLP desk, not in the kid world."
              />
              <button type="button" className="nest__primary" disabled={busy} onClick={saveNote}>
                Save note
              </button>
            </div>
          )}

          {message && <p className="nest__note">{message}</p>}
          {error && <p className="nest__error">{error}</p>}
          <button type="button" className="nest__secondary" onClick={() => load()}>
            Refresh caseload
          </button>
        </div>
      )}
    </NestShell>
  )
}
