import { supabase } from './supabase'

export type EntryFormValues = {
  name: string
  organization: string
  email: string
}

export type DashboardSummary = {
  totalEntries: number
  winnersCount: number
  eligibleCount: number
}

export type WinnerRecord = {
  id: string
  displayName: string
  organization: string | null
  prizeLabel: string | null
  wonAt: string
}

type SummaryResponse = {
  total_entries: number
  winners_count: number
  eligible_count: number
}

type WinnerResponse = {
  id: string
  display_name: string
  organization: string | null
  prize_label: string | null
  won_at: string
}

const normalizeValue = (input: string) => input.trim().replace(/\s+/g, ' ').toLowerCase()

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured yet.')
  }

  return supabase
}

const mapWinner = (winner: WinnerResponse): WinnerRecord => ({
  id: winner.id,
  displayName: winner.display_name,
  organization: winner.organization,
  prizeLabel: winner.prize_label,
  wonAt: winner.won_at,
})

export const submitEntry = async ({ name, organization, email }: EntryFormValues) => {
  const client = requireSupabase()

  const { error } = await client.from('raffle_entries').insert({
    display_name: name.trim(),
    organization: organization.trim() || null,
    email: email.trim() || null,
    normalized_name: normalizeValue(name),
    normalized_organization: organization.trim() ? normalizeValue(organization) : null,
    normalized_email: email.trim() ? normalizeValue(email) : null,
  })

  if (!error) {
    return
  }

  if (error.code === '23505') {
    throw new Error('That person is already entered in the raffle.')
  }

  throw new Error('Unable to submit the raffle entry right now.')
}

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const client = requireSupabase()
  const { data, error } = await client.rpc('raffle_summary').single<SummaryResponse>()

  if (error || !data) {
    throw new Error('Unable to load raffle counts.')
  }

  return {
    totalEntries: data.total_entries,
    winnersCount: data.winners_count,
    eligibleCount: data.eligible_count,
  }
}

export const listRecentWinners = async (limit = 8): Promise<WinnerRecord[]> => {
  const client = requireSupabase()
  const { data, error } = await client.rpc('list_recent_winners', { limit_count: limit })

  if (error || !data) {
    throw new Error('Unable to load recent winners.')
  }

  return (data as WinnerResponse[]).map(mapWinner)
}

export const drawWinner = async (prizeLabel: string): Promise<WinnerRecord> => {
  const client = requireSupabase()
  const trimmedPrize = prizeLabel.trim()
  const { data, error } = await client
    .rpc('draw_winner', {
      selected_prize_label: trimmedPrize || null,
    })
    .single<WinnerResponse>()

  if (error?.message.includes('NO_ELIGIBLE_ENTRIES')) {
    throw new Error('There are no eligible entrants left to draw.')
  }

  if (error || !data) {
    throw new Error('Unable to draw a winner.')
  }

  return mapWinner(data)
}
