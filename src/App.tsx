import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroImg from './assets/hero.png'
import './App.css'
import { env, isAdminPasswordConfigured, isLocalFileMode, isSupabaseConfigured } from './lib/env'
import {
  drawWinner,
  getDashboardSummary,
  listEntries,
  listRecentWinners,
  removeEntry,
  submitEntry,
  type EntryRecord,
  type DashboardSummary,
  type EntryFormValues,
  type WinnerRecord,
} from './lib/raffle'
import {
  addLocalEntry,
  drawLocalWinner,
  getLocalEntryIdentityKey,
  getLocalDashboardSummary,
  getLocalWinnerFallbackIdentityKey,
  loadLocalEntries,
  serializeLocalEntriesToCsv,
  type LocalEntry,
} from './lib/localRaffle'
import { hashString } from './lib/hash'

type SubmitState =
  | { type: 'idle'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

type AdminGateState =
  | { type: 'idle'; message: string }
  | { type: 'error'; message: string }

type EntryAdminState =
  | { type: 'idle'; message: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

type AdminEntryOption = {
  id: string
  displayName: string
  organization: string | null
  email: string | null
  wonAt: string | null
}

type ConfettiPiece = {
  id: number
  left: number
  delayMs: number
  duration: number
  sizePx: number
  rotationDeg: number
  color: string
}

const PUBLIC_ROUTE = '#/'
const ADMIN_ROUTE = '#/admin'
const RULES_ROUTE = '#/rules'
const ADMIN_STORAGE_KEY = 'raffle-admin-unlocked'
const THEME_STORAGE_KEY = 'raffle-theme'
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

const normalizeHashRoute = () => {
  if (window.location.hash === ADMIN_ROUTE) {
    return ADMIN_ROUTE
  }

  if (window.location.hash === RULES_ROUTE) {
    return RULES_ROUTE
  }

  return PUBLIC_ROUTE
}

const buildAnimationSequence = (winnerName: string) => {
  const sequence = Array.from({ length: 18 }, (_, index) => rouletteFillers[index % rouletteFillers.length])
  return [...sequence, winnerName, winnerName]
}

const CONFETTI_PIECE_HEIGHT_RATIO = 0.6
const CONFETTI_PIECE_COUNT = 72

const buildConfettiPieces = (seed: number): ConfettiPiece[] => {
  const colors = ['#7ee787', '#58a6ff', '#fbbf24', '#f472b6', '#34d399']

  return Array.from({ length: CONFETTI_PIECE_COUNT }, (_, index) => ({
    id: seed * 1000 + index,
    left: Math.random() * 100,
    delayMs: Math.random() * 320,
    duration: 1200 + Math.random() * 1100,
    sizePx: 7 + Math.random() * 8,
    rotationDeg: Math.random() * 360,
    color: colors[index % colors.length]!,
  }))
}

const formatPublicWinnerName = (displayName: string) => {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)

  if (parts.length <= 1) {
    return parts[0] ?? displayName
  }

  const firstName = parts[0]!
  const lastInitial = parts[parts.length - 1]![0]?.toUpperCase()

  return lastInitial ? `${firstName} ${lastInitial}.` : firstName
}

function App() {
  const animationTimeout = useRef<number | undefined>(undefined)
  const winnerScreenRef = useRef<HTMLDivElement | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return savedTheme === 'light' ? 'light' : 'dark'
  })
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
  const [confettiBurstCount, setConfettiBurstCount] = useState(0)
  const [isWinnerScreenFullscreen, setIsWinnerScreenFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([])
  const [localFileError, setLocalFileError] = useState('')
  const [adminEntries, setAdminEntries] = useState<EntryRecord[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState('')
  const [entryAdminState, setEntryAdminState] = useState<EntryAdminState>({
    type: 'idle',
    message: 'Pick an entry to remove from the raffle list.',
  })
  const [isRemovingEntry, setIsRemovingEntry] = useState(false)

  const isAdminRoute = route === ADMIN_ROUTE
  const isRulesRoute = route === RULES_ROUTE
  const isLocalDevCsvMode = isLocalFileMode && import.meta.env.DEV
  const submitDisabled = (!isSupabaseConfigured && !isLocalFileMode) || isSubmitting
  const adminLocked = !isLocalDevCsvMode && !adminReady

  const localUsedIdentityKeys = useMemo(
    () => new Set(winners.map((winner) => winner.identityKey ?? getLocalWinnerFallbackIdentityKey(winner))),
    [winners],
  )

  const localAdminEntries = useMemo<AdminEntryOption[]>(() => {
    return localEntries.map((entry) => {
      const identityKey = getLocalEntryIdentityKey(entry)
      const matchedWinner = winners.find(
        (winner) => (winner.identityKey ?? getLocalWinnerFallbackIdentityKey(winner)) === identityKey,
      )

      return {
        id: identityKey,
        displayName: entry.name,
        organization: entry.organization,
        email: entry.email,
        wonAt: matchedWinner?.wonAt ?? null,
      }
    })
  }, [localEntries, winners])

  const visibleAdminEntries = useMemo<AdminEntryOption[]>(() => {
    if (isLocalFileMode) {
      return localAdminEntries
    }

    return adminEntries.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      organization: entry.organization,
      email: entry.email,
      wonAt: entry.wonAt,
    }))
  }, [adminEntries, isLocalFileMode, localAdminEntries])

  const selectedAdminEntry = useMemo(
    () => visibleAdminEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [selectedEntryId, visibleAdminEntries],
  )

  const confettiPieces = useMemo(() => {
    if (confettiBurstCount === 0) {
      return []
    }

    return buildConfettiPieces(confettiBurstCount)
  }, [confettiBurstCount])

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

  useEffect(() => {
    if (!isLocalFileMode || !env.localNamesFile) {
      return
    }

    loadLocalEntries(env.localNamesFile)
      .then((entries) => {
        setLocalEntries(entries)
        setLocalFileError('')
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load the local names file.'
        setLocalFileError(message)
      })
  }, [])

  const persistLocalEntries = useCallback(
    async (entries: LocalEntry[]) => {
      if (!isLocalDevCsvMode) {
        return
      }

      const response = await fetch('/__local-raffle/persist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csv: serializeLocalEntriesToCsv(entries),
        }),
      })

      if (response.ok) {
        return
      }

      let message = 'Unable to persist local entries to CSV.'
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) {
          message = payload.error
        }
      } catch {
        // Keep the fallback message if response parsing fails.
      }

      throw new Error(message)
    },
    [isLocalDevCsvMode],
  )

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return
    }

    setAdminLoading(true)
    setDrawError('')

    try {
      const [nextSummary, nextWinners, nextEntries] = await Promise.all([
        getDashboardSummary(),
        listRecentWinners(),
        listEntries(),
      ])
      setSummary(nextSummary)
      setWinners(nextWinners)
      setAdminEntries(nextEntries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load the raffle dashboard.'
      setDrawError(message)
    } finally {
      setAdminLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isLocalFileMode) {
      return
    }

    setSummary(getLocalDashboardSummary(localEntries, winners))
  }, [isLocalFileMode, localEntries, winners])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    if (!isAdminRoute || adminReady || isLocalDevCsvMode) {
      void loadDashboard()
    }
  }, [adminReady, isAdminRoute, isLocalDevCsvMode, loadDashboard])

  useEffect(() => {
    if (visibleAdminEntries.length === 0) {
      setSelectedEntryId('')
      return
    }

    if (!visibleAdminEntries.some((entry) => entry.id === selectedEntryId)) {
      setSelectedEntryId(visibleAdminEntries[0]!.id)
    }
  }, [selectedEntryId, visibleAdminEntries])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsWinnerScreenFullscreen(document.fullscreenElement === winnerScreenRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const shouldExitFullscreen = !isAdminRoute || adminLocked
    const supportsFullscreenExit = typeof document.exitFullscreen === 'function'

    if (
      !supportsFullscreenExit ||
      !shouldExitFullscreen ||
      !winnerScreenRef.current ||
      document.fullscreenElement !== winnerScreenRef.current
    ) {
      return
    }

    void document.exitFullscreen().catch(() => {
      console.warn('Unable to exit fullscreen mode after leaving the winner selection screen.')
    })
  }, [adminLocked, isAdminRoute])

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitState({
      type: 'idle',
      message: isLocalFileMode
        ? 'Adding attendee to the local raffle list...'
        : 'Submitting your GitHub Copilot Dev Days entry...',
    })
    setIsSubmitting(true)

    try {
      if (isLocalFileMode) {
        const nextEntry = addLocalEntry(localEntries, formValues)
        const nextEntries = [...localEntries, nextEntry]
        setLocalEntries(nextEntries)

        if (isLocalDevCsvMode) {
          await persistLocalEntries(nextEntries)
          setSubmitState({
            type: 'success',
            message: `Added ${nextEntry.name}. Saved to ${env.localNamesFile}.`,
          })
        } else {
          setSubmitState({
            type: 'success',
            message: `Added ${nextEntry.name}. Local entries stay in memory outside dev mode.`,
          })
        }
      } else {
        await submitEntry(formValues)
        setSubmitState({
          type: 'success',
          message: 'You are in for the GitHub Copilot Dev Days giveaway.',
        })
      }

      setFormValues(initialForm)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit your Dev Days entry.'
      setSubmitState({ type: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExportLocalEntries = () => {
    if (!isLocalFileMode || localEntries.length === 0) {
      return
    }

    const csv = serializeLocalEntriesToCsv(localEntries)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const objectUrl = window.URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `dev-days-raffle-entries-${timestamp}.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(objectUrl)
  }

  const describeEntry = (entry: AdminEntryOption) => {
    const details = [entry.organization, entry.email].filter((value): value is string => Boolean(value)).join(' • ')
    return details ? `${entry.displayName} (${details})` : entry.displayName
  }

  const handleRemoveEntry = async () => {
    if (!selectedAdminEntry) {
      return
    }

    setIsRemovingEntry(true)
    setEntryAdminState({ type: 'idle', message: `Removing ${selectedAdminEntry.displayName}...` })

    try {
      if (isLocalFileMode) {
        const nextEntries = localEntries.filter(
          (entry) => getLocalEntryIdentityKey(entry) !== selectedAdminEntry.id,
        )

        setLocalEntries(nextEntries)
        setWinners((current) =>
          current.filter(
            (winner) => (winner.identityKey ?? getLocalWinnerFallbackIdentityKey(winner)) !== selectedAdminEntry.id,
          ),
        )

        if (isLocalDevCsvMode) {
          await persistLocalEntries(nextEntries)
        }

        setEntryAdminState({
          type: 'success',
          message: `Removed ${selectedAdminEntry.displayName} from local entries.`,
        })
      } else {
        await removeEntry(selectedAdminEntry.id)
        await loadDashboard()
        setEntryAdminState({
          type: 'success',
          message: `Removed ${selectedAdminEntry.displayName} from Supabase entries.`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the selected entry.'
      setEntryAdminState({ type: 'error', message })
    } finally {
      setIsRemovingEntry(false)
    }
  }

  const handleUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isLocalDevCsvMode) {
      window.sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true')
      setAdminReady(true)
      setAdminPassword('')
      setAdminGateState({
        type: 'idle',
        message: 'Host controls unlocked for local development.',
      })
      return
    }

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
      if (isLocalFileMode) {
        const winner = drawLocalWinner(localEntries, localUsedIdentityKeys, prizeLabel)
        await playAnimation(winner.displayName)
        setWinners((current) => [winner, ...current])
        setCurrentWinner(winner)
        setConfettiBurstCount((current) => current + 1)
      } else {
        const winner = await drawWinner(prizeLabel)
        await playAnimation(winner.displayName)
        setCurrentWinner(winner)
        setConfettiBurstCount((current) => current + 1)
        await loadDashboard()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete the draw.'
      setDrawError(message)
      setIsAnimating(false)
    }
  }

  const toggleWinnerScreenFullscreen = async () => {
    if (!winnerScreenRef.current) {
      return
    }

    setFullscreenError('')
    const wasFullscreen = document.fullscreenElement === winnerScreenRef.current

    try {
      if (wasFullscreen) {
        await document.exitFullscreen()
      } else {
        await winnerScreenRef.current.requestFullscreen()
      }
    } catch {
      const action = wasFullscreen ? 'exit' : 'enter'
      setFullscreenError(`Unable to ${action} fullscreen mode in this browser.`)
    }
  }

  const unlockHint = isLocalDevCsvMode
    ? 'Local CSV mode on localhost: admin password is bypassed for convenience.'
    : isAdminPasswordConfigured
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
            {isAdminRoute
              ? isLocalDevCsvMode
                ? `Use ${ADMIN_ROUTE} for host controls in local CSV mode (no password needed on localhost).`
                : `Use ${ADMIN_ROUTE} for the password-gated host console during the live giveaway.`
              : isRulesRoute
              ? 'Review the official giveaway rules before entering. By participating, attendees agree to these rules and applicable local requirements.'
              : 'Sign up below for a chance to win GitHub Copilot Dev Days prizes and swag.'}
          </p>
          <div className="nav-actions">
            {isAdminRoute ? (
              <a className="secondary-link" href={PUBLIC_ROUTE}>
                Back to entry page
              </a>
            ) : isRulesRoute ? (
              <a className="primary-link" href={PUBLIC_ROUTE}>
                Back to giveaway
              </a>
            ) : (
              <a className="primary-link" href="#entry">
                Enter giveaway
              </a>
            )}
            {!isAdminRoute && !isRulesRoute && (
              <a className="secondary-link" href={RULES_ROUTE}>
                View official rules
              </a>
            )}
            <button className="secondary-button theme-toggle" type="button" onClick={toggleTheme}>
              {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            </button>
          </div>
        </div>
        <div className="hero-card">
          <img src={heroImg} className="hero-image" width="170" height="179" alt="" />
          <div className="hero-card-copy">
            <span className="eyebrow">{isLocalFileMode ? 'Offline mode' : 'Built for live draws'}</span>
            <p>
              {isLocalFileMode
                ? 'Names are loaded from a local CSV or text file. No backend required — winners are tracked for the session.'
                : 'Entries stay in Supabase, the live draw animation resolves to the persisted winner, and no winner can be selected twice.'}
            </p>
          </div>
        </div>
      </section>

      {isLocalFileMode && (
        <section className="notice">
          <strong>Running in local file mode.</strong> Names are loaded from{' '}
          <code>{env.localNamesFile}</code>. Additional entries can be added below.
          <p className="muted-copy">
            {isLocalDevCsvMode
              ? 'Local submissions are auto-saved to disk in dev mode and included in exports.'
              : 'Outside local dev, local submissions are session-only and can still be exported manually.'}
          </p>
          <span className="muted-copy">{localEntries.length} attendees loaded</span>
          {localFileError && <span className="error"> {localFileError}</span>}
        </section>
      )}

      {isRulesRoute ? (
        <section className="content-grid rules-grid">
          <article className="panel rules-panel">
            <header className="panel-header">
              <div>
                <span className="eyebrow">Official rules</span>
                <h2>{env.eventName} rules</h2>
              </div>
            </header>
            <div className="rules-content">
              <p>
                These rules are a starter template for giveaway hosts. Update them with your event details, required disclosures,
                and local legal requirements before publishing.
              </p>
              <h3>1. Eligibility</h3>
              <p>
                Entry is limited to attendees who meet your stated eligibility requirements, including any age, residency,
                employment, or participation restrictions.
              </p>
              <h3>2. Entry period</h3>
              <p>
                Define the giveaway start and end date/time, including timezone. Entries submitted outside that period are not
                eligible.
              </p>
              <h3>3. Prizes and odds</h3>
              <p>
                List prizes and approximate retail value where required. Odds depend on the total number of eligible entries
                received.
              </p>
              <h3>4. Winner selection and contact</h3>
              <p>
                Winners are selected at random from eligible entries. State how and when winners are contacted, response
                deadlines, and any alternate winner process.
              </p>
              <h3>5. Privacy and data use</h3>
              <p>
                Explain how entrant data is used, stored, and retained. Include links to your privacy notice and any required
                consent disclosures.
              </p>
              <h3>6. Compliance notice</h3>
              <p>
                No purchase necessary unless your local law requires otherwise. Void where prohibited. Organizers are
                responsible for complying with local laws, venue policies, company policies, and any sponsor requirements.
              </p>
            </div>
          </article>

          <aside className="panel rules-panel">
            <header className="panel-header">
              <div>
                <span className="eyebrow">Host checklist</span>
                <h2>Before you launch</h2>
              </div>
            </header>
            <ul className="rules-checklist">
              <li>Publish complete event-specific rules and make them easy to access.</li>
              <li>Confirm eligibility limits, excluded participants, and geography.</li>
              <li>Confirm required disclosures for prizes, sponsors, and taxes.</li>
              <li>Review privacy obligations for entrant data collection and storage.</li>
              <li>Check local laws and regulations for giveaways, sweepstakes, or contests.</li>
            </ul>
            <p className="muted-copy">
              This project provides tooling and template text only. It is not legal advice.
            </p>
          </aside>
        </section>
      ) : (
        <section
          className={`content-grid ${isAdminRoute && !adminLocked ? 'winner-selection-screen' : ''}`}
          ref={isAdminRoute && !adminLocked ? winnerScreenRef : undefined}
        >
          <article className="panel" id="entry">
            <header className="panel-header">
              <div>
                <span className="eyebrow">{isAdminRoute ? 'Host console' : 'Attendee entry'}</span>
                <h2>{isAdminRoute ? 'Run the Dev Days giveaway draw' : 'Join the giveaway'}</h2>
              </div>
            </header>

            {!isAdminRoute ? (
              <form className="entry-form" onSubmit={handleSubmit}>
                {isLocalFileMode && (
                  <p className="form-message idle">
                    Local CSV mode is active. New attendees are added in memory and synced to disk during local dev.
                  </p>
                )}
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
                  {isSubmitting ? 'Submitting...' : isLocalFileMode ? 'Add attendee locally' : 'Join giveaway'}
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
                    required={!isLocalDevCsvMode}
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
                  {currentWinner && !isAnimating && (
                    <div key={confettiBurstCount} className="confetti-layer" aria-hidden="true">
                      {confettiPieces.map((piece) => (
                        <span
                          key={piece.id}
                          className="confetti-piece"
                          style={{
                            left: `${piece.left}%`,
                            width: `${piece.sizePx}px`,
                            height: `${piece.sizePx * CONFETTI_PIECE_HEIGHT_RATIO}px`,
                            animationDelay: `${piece.delayMs}ms`,
                            animationDuration: `${piece.duration}ms`,
                            backgroundColor: piece.color,
                            transform: `rotate(${piece.rotationDeg}deg)`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <span className="roulette-label">{isAnimating ? 'Live draw in progress' : 'Winner reveal'}</span>
                  <strong>{winnerHeadline}</strong>
                  <p>
                    {currentWinner
                      ? `${currentWinner.organization ?? 'GitHub Copilot Dev Days winner'}`
                      : 'Start the giveaway draw to animate the reveal and lock in the next winner.'}
                  </p>
                </div>

                <div className="admin-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleDrawWinner()}
                    disabled={(!isSupabaseConfigured && !isLocalFileMode) || isAnimating || adminLoading || summary.eligibleCount === 0}
                  >
                    {isAnimating ? 'Drawing...' : 'Pick a winner'}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void loadDashboard()}>
                    {adminLoading ? 'Refreshing...' : 'Refresh dashboard'}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void toggleWinnerScreenFullscreen()}>
                    {isWinnerScreenFullscreen ? 'Exit full screen' : 'Full screen mode'}
                  </button>
                  {isLocalFileMode && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleExportLocalEntries}
                      disabled={localEntries.length === 0}
                    >
                      Export attendee CSV
                    </button>
                  )}
                </div>

                {fullscreenError && <p className="form-message error">{fullscreenError}</p>}
                <div className="entry-manager">
                  <label className="prize-field" htmlFor="entry-selector">
                    Manage entries
                    <select
                      id="entry-selector"
                      className="entry-select"
                      value={selectedEntryId}
                      onChange={(event) => setSelectedEntryId(event.target.value)}
                      disabled={visibleAdminEntries.length === 0 || isRemovingEntry}
                    >
                      {visibleAdminEntries.length === 0 ? (
                        <option value="">No entries available</option>
                      ) : (
                        visibleAdminEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {describeEntry(entry)}
                            {entry.wonAt ? ' (winner)' : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleRemoveEntry()}
                    disabled={visibleAdminEntries.length === 0 || !selectedAdminEntry || isRemovingEntry}
                  >
                    {isRemovingEntry ? 'Removing...' : 'Remove selected entry'}
                  </button>
                  <p className={`form-message ${entryAdminState.type}`}>{entryAdminState.message}</p>
                </div>

                {drawError && <p className="form-message error">{drawError}</p>}
              </div>
            )}
          </article>

          <aside className="panel winners-panel">
            <header className="panel-header">
              <div>
                <span className="eyebrow">Recent results</span>
                <h2>Giveaway winners</h2>
              </div>
            </header>
            <ul className="winner-list">
              {winners.length === 0 ? (
                <li className="winner-empty">No winners yet. The first GitHub Copilot Dev Days giveaway draw will show up here.</li>
              ) : (
                winners.map((winner) => (
                  <li key={winner.id} className="winner-item">
                    <div>
                      <strong>{isAdminRoute ? winner.displayName : formatPublicWinnerName(winner.displayName)}</strong>
                      <p>{winner.organization ?? 'GitHub Copilot Dev Days giveaway attendee'}</p>
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
      )}

      <footer className="site-footer">
        <div className="footer-links">
          <a className="footer-link" href={RULES_ROUTE}>
            Official rules
          </a>
          <a className="footer-link" href={env.repoUrl} target="_blank" rel="noreferrer">
            View the GitHub repo
          </a>
        </div>
        <p className="site-credit">Built by James Montemagno &amp; GitHub Copilot CLI &amp; VS Code</p>
      </footer>
    </main>
  )
}

export default App
