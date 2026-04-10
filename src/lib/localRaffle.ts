import type { DashboardSummary, WinnerRecord } from './raffle'

export type LocalEntry = {
  name: string
  organization: string | null
}

const stripQuotes = (value: string) => value.replace(/^["']|["']$/g, '').trim()

const parseLine = (line: string): LocalEntry | null => {
  const parts = line.split(',').map(stripQuotes)
  const name = parts[0] ?? ''
  if (!name) {
    return null
  }

  return {
    name,
    organization: parts[1] || null,
  }
}

const isHeaderLine = (line: string) => /^["']?name["']?/i.test(line.trim())

export const loadLocalEntries = async (fileUrl: string): Promise<LocalEntry[]> => {
  const response = await fetch(fileUrl)

  if (!response.ok) {
    throw new Error(`Unable to load names file (${response.status}): ${response.statusText}`)
  }

  const text = await response.text()
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  const startIndex = lines.length > 0 && isHeaderLine(lines[0]!) ? 1 : 0

  return lines
    .slice(startIndex)
    .map(parseLine)
    .filter((entry): entry is LocalEntry => entry !== null)
}

export const drawLocalWinner = (
  entries: LocalEntry[],
  usedNames: Set<string>,
  prizeLabel: string,
): WinnerRecord => {
  const eligible = entries.filter((e) => !usedNames.has(e.name))

  if (eligible.length === 0) {
    throw new Error('There are no eligible entrants left to draw.')
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)]!

  return {
    id: crypto.randomUUID(),
    displayName: winner.name,
    organization: winner.organization,
    prizeLabel: prizeLabel.trim() || null,
    wonAt: new Date().toISOString(),
  }
}

export const getLocalDashboardSummary = (
  entries: LocalEntry[],
  winners: WinnerRecord[],
): DashboardSummary => ({
  totalEntries: entries.length,
  winnersCount: winners.length,
  eligibleCount: entries.length - winners.length,
})
