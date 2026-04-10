import type { DashboardSummary, WinnerRecord } from './raffle'

export type LocalEntry = {
  name: string
  organization: string | null
  email: string | null
}

type LocalEntryFormValues = {
  name: string
  organization: string
  email: string
}

const stripQuotes = (value: string) => value.replace(/^["']|["']$/g, '').trim()

const compactWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')

const normalizedIdentityValue = (value: string | null | undefined) =>
  compactWhitespace(value ?? '').toLowerCase()

const sanitizeOptional = (value: string | null | undefined) => {
  const cleaned = compactWhitespace(value ?? '')
  return cleaned ? cleaned : null
}

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells.map((cell) => stripQuotes(cell))
}

const escapeCsvCell = (value: string) => {
  if (!/[",\r\n]/.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}

const buildHeaderIndex = (headerCells: string[]) => {
  const normalizedHeaders = headerCells.map((cell) => normalizedIdentityValue(cell))
  return {
    name: normalizedHeaders.indexOf('name'),
    organization: normalizedHeaders.indexOf('organization'),
    email: normalizedHeaders.indexOf('email'),
  }
}

const hasNameHeader = (headerIndex: ReturnType<typeof buildHeaderIndex>) => headerIndex.name !== -1

export const getLocalEntryIdentityKey = (entry: Pick<LocalEntry, 'name' | 'organization' | 'email'>) =>
  [
    normalizedIdentityValue(entry.name),
    normalizedIdentityValue(entry.organization),
    normalizedIdentityValue(entry.email),
  ].join('|')

export const getLocalWinnerFallbackIdentityKey = (winner: Pick<WinnerRecord, 'displayName' | 'organization'>) =>
  [normalizedIdentityValue(winner.displayName), normalizedIdentityValue(winner.organization), ''].join('|')

const parseEntryFromCells = (
  cells: string[],
  indexes: { name: number; organization: number; email: number },
): LocalEntry | null => {
  const name = compactWhitespace(cells[indexes.name] ?? '')
  if (!name) {
    return null
  }

  return {
    name,
    organization: sanitizeOptional(cells[indexes.organization] ?? ''),
    email: sanitizeOptional(cells[indexes.email] ?? ''),
  }
}

export const loadLocalEntries = async (fileUrl: string): Promise<LocalEntry[]> => {
  const response = await fetch(fileUrl)

  if (!response.ok) {
    throw new Error(`Unable to load names file (${response.status}): ${response.statusText}`)
  }

  const text = await response.text()
  const rows = text
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map(parseCsvLine)

  if (rows.length === 0) {
    return []
  }

  const firstHeaderIndex = buildHeaderIndex(rows[0]!)
  const hasHeader = hasNameHeader(firstHeaderIndex)
  const indexes = hasHeader
    ? {
        name: firstHeaderIndex.name,
        organization: firstHeaderIndex.organization === -1 ? 1 : firstHeaderIndex.organization,
        email: firstHeaderIndex.email === -1 ? 2 : firstHeaderIndex.email,
      }
    : {
        name: 0,
        organization: 1,
        email: 2,
      }
  const startIndex = hasHeader ? 1 : 0

  return rows
    .slice(startIndex)
    .map((cells) => parseEntryFromCells(cells, indexes))
    .filter((entry): entry is LocalEntry => entry !== null)
}

export const addLocalEntry = (entries: LocalEntry[], values: LocalEntryFormValues): LocalEntry => {
  const candidate: LocalEntry = {
    name: compactWhitespace(values.name),
    organization: sanitizeOptional(values.organization),
    email: sanitizeOptional(values.email),
  }

  if (!candidate.name) {
    throw new Error('Please provide a full name for the attendee.')
  }

  const candidateIdentity = getLocalEntryIdentityKey(candidate)
  const hasDuplicate = entries.some((entry) => getLocalEntryIdentityKey(entry) === candidateIdentity)

  if (hasDuplicate) {
    throw new Error('That person is already entered in the raffle.')
  }

  return candidate
}

export const serializeLocalEntriesToCsv = (entries: LocalEntry[]) => {
  const lines = entries.map((entry) => {
    const values = [entry.name, entry.organization ?? '', entry.email ?? '']
    return values.map(escapeCsvCell).join(',')
  })

  return ['name,organization,email', ...lines].join('\n')
}

export const drawLocalWinner = (
  entries: LocalEntry[],
  usedIdentityKeys: Set<string>,
  prizeLabel: string,
): WinnerRecord => {
  const eligible = entries.filter((entry) => !usedIdentityKeys.has(getLocalEntryIdentityKey(entry)))

  if (eligible.length === 0) {
    throw new Error('There are no eligible entrants left to draw.')
  }

  const winner = eligible[Math.floor(Math.random() * eligible.length)]!

  return {
    id: crypto.randomUUID(),
    displayName: winner.name,
    organization: winner.organization,
    identityKey: getLocalEntryIdentityKey(winner),
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
