import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroImg from './assets/hero.png'
import './App.css'
import { env, isAdminPasswordConfigured, isSupabaseConfigured } from './lib/env'
import {
  drawWinner,
  getDashboardSummary,
  listRecentWinners,
  submitEntry,
  type DashboardSummary,
  type EntryFormValues,
  type WinnerRecord,
} from './lib/raffle'
import { hashString } from './lib/hash'

type SubmitState =
  | { type: 'idle'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

type AdminGateState =
  | { type: 'idle'; message: string }
  | { type: 'error'; message: string }

const PUBLIC_ROUTE = '#/'
const ADMIN_ROUTE = '#/admin'
const ADMIN_STORAGE_KEY = 'raffle-admin-unlocked'
const initialSummary: DashboardSummary = {
  totalEntries: 0,
  winnersCount: 0,
  eligibleCount: 0,
}
const rouletteFillers = [
  'Indexing the attendee pool...',
  'Syncing with Copilot energy...',
  'Reviewing Dev Days entries...',
  'Loading the lucky prompt...',
  'Spinning up swag mode...',
  'Scanning the finalist list...',
  'Resolving the winning branch...',
  'Preparing the celebration...',
]
const initialForm: EntryFormValues = {
  name: '',
  organization: '',
  email: '',
}

const normalizeHashRoute = () => (window.location.hash === ADMIN_ROUTE ? ADMIN_ROUTE : PUBLIC_ROUTE)

const buildAnimationSequence = (winnerName: string) => {
  const sequence = Array.from({ length: 18 }, (_, index) => rouletteFillers[index % rouletteFillers.length])
  return [...sequence, winnerName, winnerName]
}

function App() {
  const animationTimeout = useRef<number | undefined>(undefined)
  const [route, setRoute] = useState(() => normalizeHashRoute())
  const [formValues, setFormValues] = useState(initialForm)
  const [submitState, setSubmitState] = useState<SubmitState>({
    type: 'idle',
    message: 'Drop your details once to join the GitHub Copilot Dev Days giveaway.',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [summary, setSummary] = useState(initialSummary)
  const [winners, setWinners] = useState<WinnerRecord[]>([])
  const [adminReady, setAdminReady] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminGateState, setAdminGateState] = useState<AdminGateState>({
    type: 'idle',
    message: 'Enter the host password to unlock the GitHub Copilot Dev Days draw console.',
  })
  const [adminLoading, setAdminLoading] = useState(false)
  const [prizeLabel, setPrizeLabel] = useState('')
  const [drawError, setDrawError] = useState('')
  const [currentWinner, setCurrentWinner] = useState<WinnerRecord | null>(null)
  const [activeName, setActiveName] = useState(rouletteFillers[0])
  const [isAnimating, setIsAnimating] = useState(false)

  const isAdminRoute = route === ADMIN_ROUTE
  const submitDisabled = !isSupabaseConfigured || isSubmitting
  const adminLocked = !adminReady

  useEffect(() => {
    window.location.hash = normalizeHashRoute()
    const handleHashChange = () => {
      setRoute(normalizeHashRoute())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      if (animationTimeout.current !== undefined) {
        window.clearTimeout(animationTimeout.current)
      }
    }
  }, [])

  useEffect(() => {
    setAdminReady(window.sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'true')
  }, [])

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return
    }

    setAdminLoading(true)
    setDrawError('')

    try {
      const [nextSummary, nextWinners] = await Promise.all([getDashboardSummary(), listRecentWinners()])
      setSummary(nextSummary)
      setWinners(nextWinners)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load the raffle dashboard.'
      setDrawError(message)
    } finally {
      setAdminLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    if (!isAdminRoute || adminReady) {
      void loadDashboard()
    }
  }, [adminReady, isAdminRoute, loadDashboard])

  const winnerHeadline = useMemo(() => {
    if (currentWinner) {
      return currentWinner.displayName
    }

    return isAnimating ? activeName : 'Ready for the next winner'
  }, [activeName, currentWinner, isAnimating])

  const updateFormValue = <Key extends keyof EntryFormValues>(field: Key, value: EntryFormValues[Key]) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitState({ type: 'idle', message: 'Submitting your GitHub Copilot Dev Days entry...' })
    setIsSubmitting(true)

    try {
      await submitEntry(formValues)
      setFormValues(initialForm)
      setSubmitState({
        type: 'success',
        message: 'You are in for the GitHub Copilot Dev Days giveaway.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit your Dev Days entry.'
      setSubmitState({ type: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isAdminPasswordConfigured) {
      setAdminGateState({
        type: 'error',
        message: 'Set VITE_ADMIN_PASSWORD_HASH before using the Dev Days host console.',
      })
      return
    }

    const hashedPassword = await hashString(adminPassword)
    if (hashedPassword !== env.adminPasswordHash) {
      setAdminGateState({
        type: 'error',
        message: 'That password did not match the configured host password.',
      })
      return
    }

    window.sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true')
    setAdminReady(true)
    setAdminPassword('')
      setAdminGateState({
        type: 'idle',
      message: 'Host controls unlocked for this browser session.',
    })
  }

  const playAnimation = useCallback((winnerName: string) => {
    const sequence = buildAnimationSequence(winnerName)
    let index = 0

    setIsAnimating(true)
    setCurrentWinner(null)
    setActiveName(sequence[0])

    return new Promise<void>((resolve) => {
      const tick = () => {
        setActiveName(sequence[index])
        if (index === sequence.length - 1) {
          setIsAnimating(false)
          resolve()
          return
        }

        index += 1
        const remaining = sequence.length - index
        const delay = remaining > 4 ? 90 : 220
        animationTimeout.current = window.setTimeout(tick, delay)
      }

      tick()
    })
  }, [])

  const handleDrawWinner = async () => {
    setDrawError('')
    setCurrentWinner(null)

    try {
      const winner = await drawWinner(prizeLabel)
      await playAnimation(winner.displayName)
      setCurrentWinner(winner)
      await loadDashboard()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete the draw.'
      setDrawError(message)
      setIsAnimating(false)
    }
  }

  const unlockHint = isAdminPasswordConfigured
    ? 'Use the host password configured in your deployment secrets.'
    : 'The password hash is not configured yet.'

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">GitHub Copilot Dev Days</span>
          <h1>{env.eventName}</h1>
          <p className="hero-text">{env.eventTagline}</p>
          <p className="hero-subtext">
            Share the main page with attendees, then use <code>{ADMIN_ROUTE}</code> for the
            password-gated host console during the live giveaway.
          </p>
          <div className="nav-actions">
            <a className="primary-link" href={PUBLIC_ROUTE}>
              Enter giveaway
            </a>
            <a className="secondary-link" href={ADMIN_ROUTE}>
              Open host console
            </a>
          </div>
        </div>
        <div className="hero-card">
          <img src={heroImg} className="hero-image" width="170" height="179" alt="" />
          <div className="hero-card-copy">
            <span className="eyebrow">Built for live draws</span>
            <p>
              Entries stay in Supabase, the live draw animation resolves to the persisted winner,
              and no winner can be selected twice.
            </p>
          </div>
        </div>
      </section>

      {!isSupabaseConfigured && (
        <section className="notice warning">
          <strong>Supabase is not configured yet.</strong> Add the values from <code>.env.example</code> to
          enable GitHub Copilot Dev Days entries and live draws.
        </section>
      )}

      <section className="content-grid">
        <article className="panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">{isAdminRoute ? 'Host console' : 'Attendee entry'}</span>
              <h2>{isAdminRoute ? 'Run the Dev Days draw' : 'Join the giveaway'}</h2>
            </div>
          </header>

          {!isAdminRoute ? (
            <form className="entry-form" onSubmit={handleSubmit}>
              <label>
                Full name
                <input
                  type="text"
                  value={formValues.name}
                  onChange={(event) => updateFormValue('name', event.target.value)}
                  placeholder="Ada Lovelace"
                  required
                />
              </label>
              <label>
                Team or company
                <input
                  type="text"
                  value={formValues.organization}
                  onChange={(event) => updateFormValue('organization', event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Work email
                <input
                  type="email"
                  value={formValues.email}
                  onChange={(event) => updateFormValue('email', event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <button className="primary-button" type="submit" disabled={submitDisabled}>
                {isSubmitting ? 'Submitting...' : 'Join Dev Days'}
              </button>
              <p className={`form-message ${submitState.type}`}>{submitState.message}</p>
            </form>
          ) : adminLocked ? (
            <form className="entry-form" onSubmit={handleUnlock}>
              <label>
                Admin password
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Enter host password"
                  required
                />
              </label>
              <button className="primary-button" type="submit">
                Unlock console
              </button>
              <p className={`form-message ${adminGateState.type}`}>{adminGateState.message}</p>
              <p className="muted-copy">{unlockHint}</p>
            </form>
          ) : (
            <div className="admin-panel">
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">Entries</span>
                  <strong>{summary.totalEntries}</strong>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Eligible</span>
                  <strong>{summary.eligibleCount}</strong>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Winners</span>
                  <strong>{summary.winnersCount}</strong>
                </div>
              </div>

              <label className="prize-field">
                Prize or swag drop
                <input
                  type="text"
                  value={prizeLabel}
                  onChange={(event) => setPrizeLabel(event.target.value)}
                  placeholder="Optional, e.g. Copilot swag bundle"
                />
              </label>

              <div className={`roulette-card ${isAnimating ? 'live' : ''}`}>
                <span className="roulette-label">{isAnimating ? 'Live draw in progress' : 'Winner reveal'}</span>
                <strong>{winnerHeadline}</strong>
                <p>
                  {currentWinner
                    ? `${currentWinner.organization ?? 'GitHub Copilot Dev Days winner'}`
                    : 'Start the draw to animate the reveal and lock in the next winner.'}
                </p>
              </div>

              <div className="admin-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleDrawWinner()}
                  disabled={!isSupabaseConfigured || isAnimating || adminLoading || summary.eligibleCount === 0}
                >
                  {isAnimating ? 'Drawing...' : 'Pick a winner'}
                </button>
                <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
                  {adminLoading ? 'Refreshing...' : 'Refresh dashboard'}
                </button>
              </div>

              {drawError && <p className="form-message error">{drawError}</p>}
            </div>
          )}
        </article>

        <aside className="panel winners-panel">
          <header className="panel-header">
            <div>
              <span className="eyebrow">Recent results</span>
              <h2>Dev Days winners</h2>
            </div>
          </header>
          <ul className="winner-list">
            {winners.length === 0 ? (
              <li className="winner-empty">No winners yet. The first GitHub Copilot Dev Days draw will show up here.</li>
            ) : (
              winners.map((winner) => (
                <li key={winner.id} className="winner-item">
                  <div>
                    <strong>{winner.displayName}</strong>
                    <p>{winner.organization ?? 'GitHub Copilot Dev Days attendee'}</p>
                  </div>
                  <div className="winner-meta">
                    {winner.prizeLabel && <span>{winner.prizeLabel}</span>}
                    <time dateTime={winner.wonAt}>{new Date(winner.wonAt).toLocaleString()}</time>
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>
      </section>
    </main>
  )
}

export default App
