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

const MIN_VALUE = 1

const toPositiveInt = (value: number, fallback = MIN_VALUE): number => {
  if (!Number.isFinite(value) || value < MIN_VALUE) {
    return fallback
  }
  return Math.floor(value)
}

export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  const hex = '0123456789abcdef'
  const s = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('')
  return `${s(8)}-${s(4)}-4${s(3)}-${hex[8 + Math.floor(Math.random() * 4)]}${s(3)}-${s(12)}`
}

const participantFromName = (name: string): Participant => ({
  id: generateId(),
  name,
})

export const createHeat = (heatIndex: number, slots: number, advance: number): HeatConfig => ({
  id: generateId(),
  label: `Race ${heatIndex + 1}`,
  participantSlots: toPositiveInt(slots),
  advanceCount: toPositiveInt(advance),
})

export const DEFAULT_PARTICIPANTS: Participant[] = Array.from({ length: 52 }, (_, index) => `Group ${index + 1}`).map(
  (name) => participantFromName(name),
)

export const DEFAULT_ROUNDS: RoundConfig[] = [
  {
    id: generateId(),
    label: 'Round 1',
    heats: [
      createHeat(0, 10, 5),
      createHeat(1, 10, 5),
      createHeat(2, 10, 5),
      createHeat(3, 11, 6),
      createHeat(4, 11, 6),
    ],
  },
  {
    id: generateId(),
    label: 'Round 2',
    heats: [createHeat(0, 9, 3), createHeat(1, 9, 3), createHeat(2, 9, 3)],
  },
  {
    id: generateId(),
    label: 'Final',
    heats: [createHeat(0, 9, 1)],
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
    .map((name) => participantFromName(name))

export const sortLines = (text: string): string =>
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('\n')

export const shuffleLines = (text: string): string => {
  const lines = text.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]]
  }
  return lines.join('\n')
}

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
    .map((name) => participantFromName(name))
}

export const normalizeHeat = (heat: Partial<HeatConfig>, heatIndex: number): HeatConfig => {
  const participantSlots = toPositiveInt(Number(heat.participantSlots ?? 1))
  const advanceCount = Math.min(toPositiveInt(Number(heat.advanceCount ?? 1)), participantSlots)
  return {
    id: heat.id || generateId(),
    label: heat.label || `Race ${heatIndex + 1}`,
    participantSlots,
    advanceCount,
  }
}

export const normalizeRound = (round: Partial<RoundConfig>, roundIndex: number): RoundConfig => {
  const heatsInput = Array.isArray(round.heats) && round.heats.length > 0 ? round.heats : [createHeat(0, 2, 1)]
  return {
    id: round.id || generateId(),
    label: round.label || `Round ${roundIndex + 1}`,
    heats: heatsInput.map((heat, heatIndex) => normalizeHeat(heat, heatIndex)),
  }
}

export const validateTournament = (participants: Participant[], rounds: RoundConfig[]): string[] => {
  const errors: string[] = []
  if (participants.length === 0) {
    errors.push('Add at least one participant.')
  }
  const seenNames = new Set<string>()
  for (const participant of participants) {
    if (seenNames.has(participant.name)) {
      errors.push(`Duplicate participant: "${participant.name}".`)
    }
    seenNames.add(participant.name)
  }
  if (rounds.length === 0) {
    errors.push('Add at least one round.')
    return errors
  }

  const seenRoundIds = new Set<string>()
  const seenRoundLabels = new Set<string>()
  const seenHeatIds = new Set<string>()
  for (const round of rounds) {
    if (seenRoundIds.has(round.id)) {
      errors.push(`Duplicate round id: "${round.id}".`)
    }
    seenRoundIds.add(round.id)
    const normalizedLabel = round.label.trim().toLowerCase()
    if (seenRoundLabels.has(normalizedLabel)) {
      errors.push(`Duplicate round name: "${round.label}".`)
    }
    seenRoundLabels.add(normalizedLabel)
    for (const heat of round.heats) {
      if (seenHeatIds.has(heat.id)) {
        errors.push(`Duplicate heat id: "${heat.id}".`)
      }
      seenHeatIds.add(heat.id)
    }
  }

  const roundOneSlots = totalRoundSlots(rounds[0])
  if (participants.length !== roundOneSlots) {
    errors.push(`Round 1 requires exactly ${roundOneSlots} participants (currently ${participants.length}).`)
  }

  rounds.forEach((round, roundIndex) => {
    round.heats.forEach((heat, heatIndex) => {
      if (heat.advanceCount > heat.participantSlots) {
        errors.push(`Round ${roundIndex + 1}, Race ${heatIndex + 1}: advancing count cannot exceed participant slots.`)
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

export type RankedEntrant = {
  entrant: EntrantSlot
  laps: number
  rank: number
}

export type HeatEvaluation = {
  isComplete: boolean
  hasTie: boolean
  hasTieInTop: boolean
  ranked: RankedEntrant[]
  actualAdvancers: Participant[]
}

export const evaluateHeatLaps = (
  heat: HeatState,
  roundResults: Record<string, string> | undefined,
): HeatEvaluation => {
  const withParticipants = heat.entrants.filter((entrant) => entrant.participant !== null)
  if (withParticipants.length !== heat.entrants.length) {
    return { isComplete: false, hasTie: false, hasTieInTop: false, ranked: [], actualAdvancers: [] }
  }

  const entrantsWithLaps = withParticipants.map((entrant) => {
    const value = roundResults?.[entrant.participant!.id]
    const parsed = Number.parseFloat(value ?? '')
    return {
      entrant,
      laps: parsed,
    }
  })

  if (entrantsWithLaps.some((entry) => !Number.isFinite(entry.laps) || entry.laps < 0)) {
    return { isComplete: false, hasTie: false, hasTieInTop: false, ranked: [], actualAdvancers: [] }
  }

  const sortedByLaps = [...entrantsWithLaps].sort((a, b) => b.laps - a.laps)

  const ranked: RankedEntrant[] = []
  let currentRank = 1
  for (let i = 0; i < sortedByLaps.length; i += 1) {
    if (i > 0 && sortedByLaps[i].laps < sortedByLaps[i - 1].laps) {
      currentRank = i + 1
    }
    ranked.push({
      ...sortedByLaps[i],
      rank: currentRank,
    })
  }

  const cutoffIndex = heat.advanceCount - 1

  const topN = ranked.slice(0, heat.advanceCount)
  const topLaps = topN.map((entry) => entry.laps)
  const hasTieInTop = new Set(topLaps).size !== topLaps.length

  const hasBoundaryTie =
    cutoffIndex >= 0 &&
    cutoffIndex + 1 < ranked.length &&
    ranked[cutoffIndex].laps === ranked[cutoffIndex + 1].laps

  const actualAdvancers: Participant[] = []
  if (cutoffIndex >= 0) {
    const cutoffLaps = ranked[cutoffIndex].laps
    ranked.forEach((entry) => {
      if (entry.laps >= cutoffLaps && entry.entrant.participant) {
        actualAdvancers.push(entry.entrant.participant)
      }
    })
  }

  return {
    isComplete: true,
    hasTie: hasBoundaryTie,
    hasTieInTop,
    ranked,
    actualAdvancers,
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

export const roundsAreEqual = (a: RoundConfig[], b: RoundConfig[]): boolean => {
  if (a.length !== b.length) return false
  return a.every((round, i) => {
    const other = b[i]
    if (round.id !== other.id || round.label !== other.label) return false
    if (round.heats.length !== other.heats.length) return false
    return round.heats.every((heat, j) => {
      const otherHeat = other.heats[j]
      return (
        heat.id === otherHeat.id &&
        heat.label === otherHeat.label &&
        heat.participantSlots === otherHeat.participantSlots &&
        heat.advanceCount === otherHeat.advanceCount
      )
    })
  })
}

export const hasStructuralRoundChanges = (a: RoundConfig[], b: RoundConfig[]): boolean => {
  if (a.length !== b.length) return true
  return a.some((round, i) => {
    const other = b[i]
    if (round.heats.length !== other.heats.length) return true
    return round.heats.some((heat, j) => {
      const otherHeat = other.heats[j]
      return heat.participantSlots !== otherHeat.participantSlots || heat.advanceCount !== otherHeat.advanceCount
    })
  })
}

export const buildTournament = (
  rounds: RoundConfig[],
  participants: Participant[],
  results: TournamentResults,
): RoundState[] => {
  const output: RoundState[] = []
  let lastRoundHeatAdvancers: Participant[][] = []

  rounds.forEach((round, roundIndex) => {
    const heatStates: HeatState[] = []

    if (roundIndex === 0) {
      let cursor = 0
      round.heats.forEach((heat) => {
        const count = toPositiveInt(heat.participantSlots)
        const heatEntrants: EntrantSlot[] = []
        for (let i = 0; i < count; i += 1) {
          heatEntrants.push({
            participant: participants[cursor + i] ?? null,
            source: null,
          })
        }
        cursor += count
        heatStates.push({ ...heat, entrants: heatEntrants })
      })
    } else {
      const prevRound = rounds[roundIndex - 1]
      const sources = sourceSlotsForRound(prevRound, roundIndex - 1)

      let sourceCursor = 0
      round.heats.forEach((heat) => {
        const baselineCount = toPositiveInt(heat.participantSlots)
        const heatEntrants: EntrantSlot[] = []

        for (let i = 0; i < baselineCount; i += 1) {
          const source = sources[sourceCursor]
          if (source) {
            const actualFromHeat = lastRoundHeatAdvancers[source.fromHeat] || []
            const isLastRankForSourceHeat = source.rank === prevRound.heats[source.fromHeat].advanceCount

            if (isLastRankForSourceHeat) {
              const remaining = actualFromHeat.slice(source.rank - 1)
              if (remaining.length > 0) {
                remaining.forEach((p) => {
                  heatEntrants.push({ participant: p, source })
                })
              } else {
                // If no one is at or after this rank yet, still provide a placeholder slot
                heatEntrants.push({ participant: null, source })
              }
            } else {
              const p = actualFromHeat[source.rank - 1]
              heatEntrants.push({ participant: p ?? null, source })
            }
          }
          sourceCursor += 1
        }

        heatStates.push({
          ...heat,
          entrants: heatEntrants,
          participantSlots: heatEntrants.length,
        })
      })
    }

    const state: RoundState = {
      ...round,
      heats: heatStates,
      canAdvance: true,
      hasTie: false,
      messages: [],
    }

    const currentRoundAdvancers: Participant[][] = []
    let anyTieInTop = false
    let anyBoundaryTie = false

    heatStates.forEach((heat, heatIndex) => {
      const evaluation = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
      if (!evaluation.isComplete) {
        state.canAdvance = false
        currentRoundAdvancers[heatIndex] = []
        return
      }

      if (evaluation.hasTieInTop) {
        anyTieInTop = true
      }
      if (evaluation.hasTie) {
        anyBoundaryTie = true
      }

      currentRoundAdvancers[heatIndex] = evaluation.actualAdvancers
    })

    if (roundIndex < rounds.length - 1) {
      if (anyTieInTop) {
        state.hasTie = true
        state.messages.push('Tie among qualifying positions.')
      }
      if (anyBoundaryTie) {
        state.messages.push('Extra participants will advance due to tie.')
      }

      if (!state.canAdvance && !state.hasTie && !anyBoundaryTie) {
        state.messages.push('Enter laps completed for all entrants in this round to unlock the next round.')
      }
    }

    lastRoundHeatAdvancers = currentRoundAdvancers
    output.push(state)
  })

  return output
}
