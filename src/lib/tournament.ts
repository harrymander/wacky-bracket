export type Participant = {
  id: string
  name: string
}

export type HeatConfig = {
  id: string
  label: string
  participantSlots: number
  advanceCount: number
}

export type RoundConfig = {
  id: string
  label: string
  heats: HeatConfig[]
}

export type SourceSlot = {
  fromRound: number
  fromHeat: number
  rank: number
}

export type EntrantSlot = {
  participant: Participant | null
  source: SourceSlot | null
}

export type HeatState = HeatConfig & {
  entrants: EntrantSlot[]
}

export type RoundState = Omit<RoundConfig, 'heats'> & {
  heats: HeatState[]
  canAdvance: boolean
  hasTie: boolean
  messages: string[]
}

export type TournamentResults = Record<string, Record<string, Record<string, string>>>

type RankedEntrant = {
  entrant: EntrantSlot
  laps: number
}

const MIN_VALUE = 1

const toPositiveInt = (value: number, fallback = MIN_VALUE): number => {
  if (!Number.isFinite(value) || value < MIN_VALUE) {
    return fallback
  }
  return Math.floor(value)
}

const slugify = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || 'seed'
}

const participantFromName = (name: string, index: number): Participant => ({
  id: `p-${index + 1}-${slugify(name)}`,
  name,
})

export const createHeat = (roundIndex: number, heatIndex: number, slots: number, advance: number): HeatConfig => ({
  id: `round-${roundIndex + 1}-heat-${heatIndex + 1}`,
  label: `Heat ${heatIndex + 1}`,
  participantSlots: toPositiveInt(slots),
  advanceCount: toPositiveInt(advance),
})

export const DEFAULT_PARTICIPANTS: Participant[] = Array.from({ length: 52 }, (_, index) => `Group ${index + 1}`).map(
  participantFromName,
)

export const DEFAULT_ROUNDS: RoundConfig[] = [
  {
    id: 'round-1',
    label: 'Round 1',
    heats: [
      createHeat(0, 0, 10, 5),
      createHeat(0, 1, 10, 5),
      createHeat(0, 2, 10, 5),
      createHeat(0, 3, 11, 6),
      createHeat(0, 4, 11, 6),
    ],
  },
  {
    id: 'round-2',
    label: 'Round 2',
    heats: [createHeat(1, 0, 9, 3), createHeat(1, 1, 9, 3), createHeat(1, 2, 9, 3)],
  },
  {
    id: 'round-3',
    label: 'Final',
    heats: [createHeat(2, 0, 9, 1)],
  },
]

export const totalRoundSlots = (round: RoundConfig): number =>
  round.heats.reduce((sum, heat) => sum + toPositiveInt(heat.participantSlots), 0)

export const totalRoundOutgoing = (round: RoundConfig): number =>
  round.heats.reduce((sum, heat) => sum + toPositiveInt(heat.advanceCount), 0)

export const parseParticipantsFromLines = (text: string): Participant[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(participantFromName)

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i]
    const next = csvText[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(field)
      field = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    field += char
  }

  row.push(field)
  rows.push(row)
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''))
}

export const parseParticipantsFromCsv = (csvText: string): Participant[] => {
  const rows = parseCsvRows(csvText)
  if (rows.length === 0) {
    return []
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const nameColumn = header.indexOf('name')
  const hasHeader = nameColumn !== -1
  const sourceColumn = hasHeader ? nameColumn : 0
  const start = hasHeader ? 1 : 0

  return rows
    .slice(start)
    .map((row) => (row[sourceColumn] || '').trim())
    .filter(Boolean)
    .map(participantFromName)
}

export const normalizeHeat = (heat: Partial<HeatConfig>, roundIndex: number, heatIndex: number): HeatConfig => {
  const participantSlots = toPositiveInt(Number(heat.participantSlots ?? 1))
  const advanceCount = Math.min(toPositiveInt(Number(heat.advanceCount ?? 1)), participantSlots)
  return {
    id: heat.id || `round-${roundIndex + 1}-heat-${heatIndex + 1}`,
    label: heat.label || `Heat ${heatIndex + 1}`,
    participantSlots,
    advanceCount,
  }
}

export const normalizeRound = (round: Partial<RoundConfig>, roundIndex: number): RoundConfig => {
  const heatsInput = Array.isArray(round.heats) && round.heats.length > 0 ? round.heats : [createHeat(roundIndex, 0, 2, 1)]
  return {
    id: round.id || `round-${roundIndex + 1}`,
    label: round.label || `Round ${roundIndex + 1}`,
    heats: heatsInput.map((heat, heatIndex) => normalizeHeat(heat, roundIndex, heatIndex)),
  }
}

export const validateTournament = (participants: Participant[], rounds: RoundConfig[]): string[] => {
  const errors: string[] = []
  if (participants.length === 0) {
    errors.push('Add at least one participant.')
  }
  if (rounds.length === 0) {
    errors.push('Add at least one round.')
    return errors
  }

  const roundOneSlots = totalRoundSlots(rounds[0])
  if (participants.length !== roundOneSlots) {
    errors.push(`Round 1 requires exactly ${roundOneSlots} participants (currently ${participants.length}).`)
  }

  rounds.forEach((round, roundIndex) => {
    round.heats.forEach((heat, heatIndex) => {
      if (heat.advanceCount > heat.participantSlots) {
        errors.push(`Round ${roundIndex + 1}, Heat ${heatIndex + 1}: advancing count cannot exceed participant slots.`)
      }
    })

    if (roundIndex < rounds.length - 1) {
      const outgoing = totalRoundOutgoing(round)
      const incoming = totalRoundSlots(rounds[roundIndex + 1])
      if (outgoing !== incoming) {
        errors.push(
          `Round ${roundIndex + 1} outputs ${outgoing} qualifiers, but Round ${roundIndex + 2} expects ${incoming} entrants.`,
        )
      }
    }
  })

  return errors
}

export const evaluateHeatLaps = (
  heat: HeatState,
  roundResults: Record<string, string> | undefined,
): { isComplete: boolean; hasTie: boolean; ranked: RankedEntrant[] } => {
  const withParticipants = heat.entrants.filter((entrant) => entrant.participant !== null)
  if (withParticipants.length !== heat.entrants.length) {
    return { isComplete: false, hasTie: false, ranked: [] }
  }

  const ranked: RankedEntrant[] = withParticipants.map((entrant) => {
    const value = roundResults?.[entrant.participant!.id]
    const parsed = Number.parseFloat(value ?? '')
    return {
      entrant,
      laps: parsed,
    }
  })

  if (ranked.some((entry) => !Number.isFinite(entry.laps) || entry.laps < 0)) {
    return { isComplete: false, hasTie: false, ranked: [] }
  }

  const lapsValues = ranked.map((entry) => entry.laps)
  const hasTie = new Set(lapsValues).size !== lapsValues.length
  return {
    isComplete: true,
    hasTie,
    ranked: [...ranked].sort((a, b) => b.laps - a.laps),
  }
}

const sourceSlotsForRound = (round: RoundConfig, roundIndex: number): SourceSlot[] => {
  const slots: SourceSlot[] = []
  round.heats.forEach((heat, heatIndex) => {
    for (let rank = 1; rank <= toPositiveInt(heat.advanceCount); rank += 1) {
      slots.push({
        fromRound: roundIndex,
        fromHeat: heatIndex,
        rank,
      })
    }
  })
  return slots
}

export const buildTournament = (
  rounds: RoundConfig[],
  participants: Participant[],
  results: TournamentResults,
): RoundState[] => {
  const output: RoundState[] = []
  let resolvedAdvancers: Participant[] = []

  rounds.forEach((round, roundIndex) => {
    const slots: EntrantSlot[] = []
    if (roundIndex === 0) {
      for (let i = 0; i < totalRoundSlots(round); i += 1) {
        slots.push({
          participant: participants[i] ?? null,
          source: null,
        })
      }
    } else {
      const sources = sourceSlotsForRound(rounds[roundIndex - 1], roundIndex - 1)
      for (let i = 0; i < totalRoundSlots(round); i += 1) {
        slots.push({
          participant: resolvedAdvancers[i] ?? null,
          source: sources[i] ?? null,
        })
      }
    }

    let cursor = 0
    const heatStates: HeatState[] = round.heats.map((heat) => {
      const count = toPositiveInt(heat.participantSlots)
      const entrants = slots.slice(cursor, cursor + count)
      cursor += count
      return {
        ...heat,
        entrants,
      }
    })

    const state: RoundState = {
      ...round,
      heats: heatStates,
      canAdvance: true,
      hasTie: false,
      messages: [],
    }

    if (roundIndex < rounds.length - 1) {
      const advancers: Participant[] = []

      heatStates.forEach((heat) => {
        const ranked = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
        if (!ranked.isComplete) {
          state.canAdvance = false
          return
        }
        if (ranked.hasTie) {
          state.canAdvance = false
          state.hasTie = true
          return
        }
        ranked.ranked.slice(0, heat.advanceCount).forEach((entry) => {
          if (entry.entrant.participant) {
            advancers.push(entry.entrant.participant)
          }
        })
      })

      if (state.hasTie) {
        state.messages.push('Duplicate lap totals found. Lap totals must be unique within each heat.')
      }
      if (!state.canAdvance && !state.hasTie) {
        state.messages.push('Enter laps completed for all entrants in this round to unlock the next round.')
      }
      resolvedAdvancers = state.canAdvance ? advancers : []
    }

    output.push(state)
  })

  return output
}
