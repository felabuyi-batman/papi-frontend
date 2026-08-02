import { useEffect, useState } from 'react'
import { api, clearAuth } from './api.js'
import ChildExperience from './child/ChildExperience.jsx'
import MathSession from './child/MathSession.jsx'
import ScreenerSession from './child/ScreenerSession.jsx'
import {
  AuthCallback,
  ParentAddChild,
  ParentAuth,
  ParentDashboard,
  ParentRoster,
} from './parent/ParentNest.jsx'
import SlpNest from './parent/SlpNest.jsx'
import Landing from './Landing.jsx'
import './theme.css'

const DEMO_CHILD = {
  id: 'dashboard-demo',
  display_name: 'Sam',
}

function initialView() {
  if (typeof window === 'undefined') return 'landing'
  if (window.location.pathname.startsWith('/auth/callback')) return 'auth-callback'
  return 'landing'
}

export default function App() {
  const [view, setView] = useState(initialView)
  const [children, setChildren] = useState([])
  const [active, setActive] = useState(null)

  useEffect(() => {
    if (view === 'auth-callback') return undefined
    if (window.location.pathname.startsWith('/auth/callback')) {
      setView('auth-callback')
    }
    return undefined
  }, [view])

  const loadKids = async (preferChildId = null) => {
    try {
      const kids = await api.children()
      setChildren(kids)
      if (preferChildId) {
        const fresh = kids.find((kid) => kid.id === preferChildId)
        if (fresh) {
          setActive(fresh)
          setView(fresh.screened ? 'dashboard' : 'screener')
          return
        }
      }
      setView(kids.length ? 'roster' : 'add')
    } catch (error) {
      console.error('Failed to load children after auth', error)
      // Keep the parent in the nest flow — empty roster/add rather than a blank screen.
      setChildren([])
      setView('add')
    }
  }

  if (view === 'landing') {
    return (
      <Landing
        onGrownUps={() => setView('auth')}
        onTryDemo={() => setView('demo-dashboard')}
        onSlp={() => setView('slp')}
      />
    )
  }

  if (view === 'slp') {
    return <SlpNest onBack={() => setView('landing')} />
  }

  if (view === 'demo-dashboard') {
    return (
      <ParentDashboard
        child={DEMO_CHILD}
        isDemo
        onPractice={() => setView('auth')}
        onBack={() => setView('landing')}
      />
    )
  }

  if (view === 'auth-callback') {
    return (
      <AuthCallback
        onDone={async () => {
          window.history.replaceState({}, '', '/')
          await loadKids()
        }}
        onBack={() => {
          window.history.replaceState({}, '', '/')
          setView('auth')
        }}
      />
    )
  }

  if (view === 'auth') {
    return (
      <ParentAuth
        onDone={() => loadKids()}
        onBack={() => setView('landing')}
      />
    )
  }

  if (view === 'add') {
    return (
      <ParentAddChild
        onDone={(childId) => loadKids(childId)}
        onBack={() => setView(children.length ? 'roster' : 'landing')}
      />
    )
  }

  if (view === 'screener' && active) {
    return (
      <ScreenerSession
        child={active}
        onDone={async () => {
          const kids = await api.children()
          setChildren(kids)
          setActive(kids.find((kid) => kid.id === active.id) || active)
          setView('dashboard')
        }}
        onSkip={() => setView('dashboard')}
      />
    )
  }

  if (view === 'roster') {
    return (
      <ParentRoster
        children={children}
        onPick={(child) => {
          setActive(child)
          setView(child.screened ? 'dashboard' : 'screener')
        }}
        onAdd={() => setView('add')}
        onBack={() => setView('landing')}
        onSignOut={async () => {
          await api.logout()
          clearAuth()
          setChildren([])
          setActive(null)
          setView('landing')
        }}
      />
    )
  }

  if (view === 'dashboard' && active) {
    return (
      <ParentDashboard
        child={active}
        onPractice={() => setView('practice')}
        onScreener={() => setView('screener')}
        onMath={() => setView('math')}
        onBack={() => setView('roster')}
      />
    )
  }

  if (view === 'math' && active) {
    return (
      <MathSession
        child={active}
        engagement={null}
        onExit={() => setView('dashboard')}
      />
    )
  }

  if (view === 'practice' && active) {
    return (
      <ChildExperience
        child={active}
        onExit={() => setView('dashboard')}
      />
    )
  }

  return null
}
