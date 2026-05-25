import { describe, expect, it } from 'vitest'
import {
  buildTournament,
  createHeat,
  DEFAULT_PARTICIPANTS,
  DEFAULT_ROUNDS,
  evaluateHeatLaps,
  generateId,
  hasStructuralRoundChanges,
  normalizeHeat,
  normalizeRound,
  parseParticipantsFromCsv,
  parseParticipantsFromLines,
  roundsAreEqual,
  shuffleLines,
  sortLines,
  totalRoundOutgoing,
  totalRoundSlots,
  validateTournament,
} from './tournament'
import { ensureFinalRoundShape } from '../hooks/useTournamentState'
import type {
  HeatState,
  Participant,
  RoundConfig,
  TournamentResults,
} from './tournament'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const namesOf = (participants: Array<Participant | null>): Array<string | null> =>
  participants.map((entry) => (entry ? entry.name : null))

const makeParticipants = (count: number): Participant[] =>
  parseParticipantsFromLines(
    Array.from({ length: count }, (_, index) => `P${index + 1}`).join('\n'),
  )

const buildHeatState = (
  participantNames: Array<string | null>,
  advanceCount: number,
): HeatState => {
  const named = participantNames.filter((name): name is string => name !== null)
  const participants = parseParticipantsFromLines(named.join('\n'))
  let cursor = 0
  const entrants = participantNames.map((name) => {
    if (name === null) {
      return { participant: null, source: null }
    }
    const participant = participants[cursor]
    cursor += 1
    return { participant, source: null }
  })
  return {
    id: 'test-heat',
    label: 'Test Heat',
    participantSlots: participantNames.length,
    advanceCount,
    entrants,
  }
}

const lapsFor = (
  heat: HeatState,
  lapValues: Array<string | number>,
): Record<string, string> => {
  const results: Record<string, string> = {}
  heat.entrants.forEach((entrant, index) => {
    if (entrant.participant && lapValues[index] !== undefined) {
      results[entrant.participant.id] = String(lapValues[index])
    }
  })
  return results
}

describe('parseParticipantsFromLines', () => {
  it('parses one participant per non-empty line', () => {
    const result = parseParticipantsFromLines('Alice\nBob\nCharlie')
    expect(result.map((entry) => entry.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('trims whitespace and skips blank lines', () => {
    const result = parseParticipantsFromLines('  Alice  \n\n   \nBob\n')
    expect(result.map((entry) => entry.name)).toEqual(['Alice', 'Bob'])
  })

  it('handles CRLF line endings', () => {
    const result = parseParticipantsFromLines('Alice\r\nBob')
    expect(result.map((entry) => entry.name)).toEqual(['Alice', 'Bob'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseParticipantsFromLines('')).toEqual([])
    expect(parseParticipantsFromLines('   \n  ')).toEqual([])
  })

  it('generates unique UUID ids for each participant', () => {
    const result = parseParticipantsFromLines('Group 1\nWild Card!')
    expect(result[0].id).toMatch(UUID_RE)
    expect(result[1].id).toMatch(UUID_RE)
    expect(result[0].id).not.toBe(result[1].id)
  })

  it('generates a UUID id even when the name has no alphanumerics', () => {
    const result = parseParticipantsFromLines('---')
    expect(result[0].id).toMatch(UUID_RE)
    expect(result[0].name).toBe('---')
  })
})

describe('parseParticipantsFromCsv', () => {
  it('uses the "name" column when a header is present', () => {
    const csv = 'rank,name,team\n1,Alice,Red\n2,Bob,Blue'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('treats the first column as the name when no header is present', () => {
    const csv = 'Alice,Red\nBob,Blue'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('treats the first row as data when a header row lacks a "name" column', () => {
    const csv = 'team,score\nAlice,10\nBob,8'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['team', 'Alice', 'Bob'])
  })

  it('detects the name header case-insensitively', () => {
    const csv = 'NAME\nAlice\nBob'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('supports quoted fields containing commas and escaped quotes', () => {
    const csv = 'name\n"Smith, John"\n"She said ""hi"""'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual([
      'Smith, John',
      'She said "hi"',
    ])
  })

  it('skips blank rows and empty cells', () => {
    const csv = 'name\nAlice\n\n   \nBob'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('returns an empty array when there are no rows', () => {
    expect(parseParticipantsFromCsv('')).toEqual([])
  })

  it('preserves CRLF sequences that appear inside a quoted field', () => {
    const csv = 'name\n"line1\r\nline2"\nBob'
    expect(parseParticipantsFromCsv(csv).map((p) => p.name)).toEqual(['line1\r\nline2', 'Bob'])
  })
})

describe('generateId', () => {
  it('produces a valid v4 UUID', () => {
    expect(generateId()).toMatch(UUID_RE)
  })

  it('produces unique ids across calls', () => {
    const ids = Array.from({ length: 100 }, () => generateId())
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('createHeat', () => {
  it('produces a UUID id and label derived from the heat index', () => {
    const heat = createHeat(1, 8, 4)
    expect(heat.id).toMatch(UUID_RE)
    expect(heat.label).toBe('Heat 2')
    expect(heat.participantSlots).toBe(8)
    expect(heat.advanceCount).toBe(4)
  })

  it('clamps non-positive counts to 1', () => {
    const heat = createHeat(0, 0, -3)
    expect(heat.participantSlots).toBe(1)
    expect(heat.advanceCount).toBe(1)
  })
})

describe('normalizeHeat', () => {
  it('fills defaults when fields are missing', () => {
    const heat = normalizeHeat({}, 0)
    expect(heat.id).toMatch(UUID_RE)
    expect(heat.label).toBe('Heat 1')
    expect(heat.participantSlots).toBe(1)
    expect(heat.advanceCount).toBe(1)
  })

  it('clamps advanceCount to participantSlots', () => {
    const heat = normalizeHeat({ participantSlots: 4, advanceCount: 10 }, 0)
    expect(heat.advanceCount).toBe(4)
  })

  it('preserves an explicit id and label', () => {
    const heat = normalizeHeat({ id: 'custom', label: 'My Heat', participantSlots: 5, advanceCount: 2 }, 0)
    expect(heat.id).toBe('custom')
    expect(heat.label).toBe('My Heat')
  })

  it('falls back to 1 when numeric fields are NaN or otherwise unparseable', () => {
    const heat = normalizeHeat({ participantSlots: Number.NaN, advanceCount: Number.NaN }, 0)
    expect(heat.participantSlots).toBe(1)
    expect(heat.advanceCount).toBe(1)
  })
})

describe('normalizeRound', () => {
  it('fills defaults when fields are missing', () => {
    const round = normalizeRound({}, 1)
    expect(round.id).toMatch(UUID_RE)
    expect(round.label).toBe('Round 2')
    expect(round.heats).toHaveLength(1)
  })

  it('inserts a default heat when the heats array is empty', () => {
    const round = normalizeRound({ heats: [] }, 0)
    expect(round.heats).toHaveLength(1)
    expect(round.heats[0].participantSlots).toBe(2)
  })

  it('inserts a default heat when the heats property is explicitly undefined', () => {
    const round = normalizeRound({ heats: undefined }, 0)
    expect(round.heats).toHaveLength(1)
    expect(round.heats[0].participantSlots).toBe(2)
    expect(round.heats[0].advanceCount).toBe(1)
  })
})

describe('totalRoundSlots / totalRoundOutgoing', () => {
  it('sums participant slots and advance counts', () => {
    const round: RoundConfig = {
      id: 'round-1',
      label: 'Round 1',
      heats: [
        createHeat(0, 10, 5),
        createHeat(1, 11, 6),
      ],
    }
    expect(totalRoundSlots(round)).toBe(21)
    expect(totalRoundOutgoing(round)).toBe(11)
  })
})

describe('roundsAreEqual', () => {
  const base: RoundConfig[] = [
    { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)] },
    { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
  ]

  it('returns true for identical rounds', () => {
    const copy = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    expect(roundsAreEqual(base, copy)).toBe(true)
  })

  it('returns false when a label differs', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].label = 'Prelims'
    expect(roundsAreEqual(base, modified)).toBe(false)
  })

  it('returns false when a heat label differs', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats[0].label = 'Renamed'
    expect(roundsAreEqual(base, modified)).toBe(false)
  })

  it('returns false when participantSlots differ', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats[0].participantSlots = 99
    expect(roundsAreEqual(base, modified)).toBe(false)
  })

  it('returns false when round count differs', () => {
    expect(roundsAreEqual(base, [base[0]])).toBe(false)
  })

  it('returns false when heat count differs', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats.push(createHeat(2, 3, 1))
    expect(roundsAreEqual(base, modified)).toBe(false)
  })

  it('returns true for two empty arrays', () => {
    expect(roundsAreEqual([], [])).toBe(true)
  })
})

describe('hasStructuralRoundChanges', () => {
  const base: RoundConfig[] = [
    { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)] },
    { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
  ]

  it('returns false for identical rounds', () => {
    const copy = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    expect(hasStructuralRoundChanges(base, copy)).toBe(false)
  })

  it('returns false when only labels differ', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].label = 'Prelims'
    modified[0].heats[0].label = 'Renamed Heat'
    expect(hasStructuralRoundChanges(base, modified)).toBe(false)
  })

  it('returns true when participantSlots differ', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats[0].participantSlots = 6
    expect(hasStructuralRoundChanges(base, modified)).toBe(true)
  })

  it('returns true when advanceCount differs', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats[0].advanceCount = 1
    expect(hasStructuralRoundChanges(base, modified)).toBe(true)
  })

  it('returns true when heat count differs', () => {
    const modified = JSON.parse(JSON.stringify(base)) as RoundConfig[]
    modified[0].heats.push(createHeat(2, 3, 1))
    expect(hasStructuralRoundChanges(base, modified)).toBe(true)
  })

  it('returns true when round count differs', () => {
    expect(hasStructuralRoundChanges(base, [base[0]])).toBe(true)
  })

  it('returns false for two empty arrays', () => {
    expect(hasStructuralRoundChanges([], [])).toBe(false)
  })
})

describe('validateTournament', () => {
  const passingRounds: RoundConfig[] = [
    { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)] },
    { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
  ]
  const passingParticipants = makeParticipants(8)

  it('returns no errors for a valid configuration', () => {
    expect(validateTournament(passingParticipants, passingRounds)).toEqual([])
  })

  it('returns no errors for a valid single-round tournament', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    expect(validateTournament(makeParticipants(4), rounds)).toEqual([])
  })

  it('flags an empty participant list', () => {
    expect(validateTournament([], passingRounds)).toContain('Add at least one participant.')
  })

  it('flags an empty rounds list', () => {
    expect(validateTournament(passingParticipants, [])).toContain('Add at least one round.')
  })

  it('flags a round-1 slot/participant mismatch', () => {
    const errors = validateTournament(makeParticipants(5), passingRounds)
    expect(errors.some((m) => m.includes('Round 1 requires exactly 8 participants'))).toBe(true)
  })

  it('flags a heat whose advanceCount exceeds its participant slots', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [{ ...createHeat(0, 4, 2), advanceCount: 10 }] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 10, 1)] },
    ]
    const errors = validateTournament(makeParticipants(4), rounds)
    expect(errors.some((m) => m.includes('advancing count cannot exceed participant slots'))).toBe(true)
  })

  it('flags an outgoing/incoming round mismatch', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 6, 4)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 3, 1)] },
    ]
    const errors = validateTournament(makeParticipants(6), rounds)
    expect(
      errors.some((m) => m.includes('Round 1 outputs 4 qualifiers') && m.includes('Round 2 expects 3 entrants')),
    ).toBe(true)
  })

  it('accumulates multiple errors rather than short-circuiting', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [{ ...createHeat(0, 4, 2), advanceCount: 10 }] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 5, 1)] },
    ]
    const errors = validateTournament(makeParticipants(3), rounds)
    expect(errors.some((m) => m.includes('Round 1 requires exactly 4 participants'))).toBe(true)
    expect(errors.some((m) => m.includes('advancing count cannot exceed participant slots'))).toBe(true)
    expect(errors.some((m) => m.includes('Round 1 outputs 10 qualifiers'))).toBe(true)
  })

  it('returns the exact accumulated errors and no spurious extras', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [{ ...createHeat(0, 4, 2), advanceCount: 10 }] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 5, 1)] },
    ]
    expect(validateTournament(makeParticipants(3), rounds)).toEqual([
      'Round 1 requires exactly 4 participants (currently 3).',
      'Round 1, Heat 1: advancing count cannot exceed participant slots.',
      'Round 1 outputs 10 qualifiers, but Round 2 expects 5 entrants.',
    ])
  })

  it('returns the exact error list when only the participant count is wrong', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    expect(validateTournament(makeParticipants(5), rounds)).toEqual([
      'Round 1 requires exactly 8 participants (currently 5).',
    ])
  })

  it('short-circuits with only the no-rounds error when rounds is empty', () => {
    expect(validateTournament(makeParticipants(4), [])).toEqual(['Add at least one round.'])
  })

  it('flags duplicate round ids', () => {
    const rounds: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 4, 2)] },
      { id: 'round-1', label: 'Round 2', heats: [createHeat(0, 2, 1)] },
    ]
    const errors = validateTournament(makeParticipants(4), rounds)
    expect(errors.some((m) => m.includes('Duplicate round id'))).toBe(true)
  })

  it('flags duplicate heat ids across rounds', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [{ ...createHeat(0, 4, 2), id: 'same-heat' }] },
      { id: 'r2', label: 'Final', heats: [{ ...createHeat(0, 2, 1), id: 'same-heat' }] },
    ]
    const errors = validateTournament(makeParticipants(4), rounds)
    expect(errors.some((m) => m.includes('Duplicate heat id'))).toBe(true)
  })

  it('flags duplicate participant names', () => {
    const participants = parseParticipantsFromLines('Alice\nBob\nAlice\nCharlie')
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const errors = validateTournament(participants, rounds)
    expect(errors.some((m) => m.includes('Duplicate participant'))).toBe(true)
  })

  it('does not flag participants with unique names', () => {
    const errors = validateTournament(passingParticipants, passingRounds)
    expect(errors.some((m) => m.includes('Duplicate participant'))).toBe(false)
  })

  it('flags duplicate round labels', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2)] },
      { id: 'r2', label: 'Round 1', heats: [createHeat(0, 2, 1)] },
    ]
    const errors = validateTournament(makeParticipants(4), rounds)
    expect(errors.some((m) => m.includes('Duplicate round name'))).toBe(true)
  })

  it('does not flag rounds with unique labels', () => {
    const errors = validateTournament(passingParticipants, passingRounds)
    expect(errors.some((m) => m.includes('Duplicate round name'))).toBe(false)
  })
})

describe('evaluateHeatLaps', () => {
  it('marks the heat incomplete when not all entrant slots are filled', () => {
    const heat = buildHeatState(['Alice', null, 'Bob'], 1)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [5, 0, 3]))
    expect(evaluation.isComplete).toBe(false)
    expect(evaluation.ranked).toEqual([])
  })

  it('marks the heat incomplete when a lap value is missing', () => {
    const heat = buildHeatState(['Alice', 'Bob'], 1)
    const evaluation = evaluateHeatLaps(heat, { [heat.entrants[0]!.participant!.id]: '5' })
    expect(evaluation.isComplete).toBe(false)
    expect(evaluation.ranked).toEqual([])
    expect(evaluation.actualAdvancers).toEqual([])
    expect(evaluation.hasTie).toBe(false)
    expect(evaluation.hasTieInTop).toBe(false)
  })

  it('marks the heat incomplete when a lap value is negative or NaN', () => {
    const heat = buildHeatState(['Alice', 'Bob'], 1)
    const negative = evaluateHeatLaps(heat, lapsFor(heat, [5, -1]))
    expect(negative.isComplete).toBe(false)
    expect(negative.ranked).toEqual([])
    expect(negative.actualAdvancers).toEqual([])

    const nonNumeric = evaluateHeatLaps(heat, lapsFor(heat, [5, 'abc']))
    expect(nonNumeric.isComplete).toBe(false)
    expect(nonNumeric.ranked).toEqual([])
    expect(nonNumeric.actualAdvancers).toEqual([])
  })

  it('marks the heat incomplete when a lap value is an empty string', () => {
    const heat = buildHeatState(['Alice', 'Bob'], 1)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [5, '']))
    expect(evaluation.isComplete).toBe(false)
    expect(evaluation.ranked).toEqual([])
    expect(evaluation.actualAdvancers).toEqual([])
  })

  it('marks the heat incomplete when a lap value parses to Infinity', () => {
    const heat = buildHeatState(['Alice', 'Bob'], 1)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [5, 'Infinity']))
    expect(evaluation.isComplete).toBe(false)
    expect(evaluation.ranked).toEqual([])
    expect(evaluation.actualAdvancers).toEqual([])
  })

  it('ranks entrants by laps (highest first)', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [7, 9, 5]))
    expect(evaluation.ranked.map((entry) => entry.entrant.participant!.name)).toEqual([
      'Bob',
      'Alice',
      'Charlie',
    ])
    expect(evaluation.ranked.map((entry) => entry.rank)).toEqual([1, 2, 3])
  })

  it('assigns shared ranks for ties and skips the following rank', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie', 'Dave'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [10, 10, 5, 3]))
    expect(evaluation.ranked.map((entry) => entry.rank)).toEqual([1, 1, 3, 4])
  })

  it('flags hasTieInTop when the qualifying positions contain a tie', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [10, 10, 5]))
    expect(evaluation.hasTieInTop).toBe(true)
    expect(evaluation.hasTie).toBe(false)
    expect(evaluation.actualAdvancers.map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('flags a boundary tie and includes the extra advancers', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie', 'Dave'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [10, 8, 8, 3]))
    expect(evaluation.hasTie).toBe(true)
    expect(evaluation.hasTieInTop).toBe(false)
    expect(evaluation.actualAdvancers.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('returns only the top N advancers when there is no boundary tie', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie', 'Dave'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [10, 9, 5, 3]))
    expect(evaluation.actualAdvancers.map((p) => p.name)).toEqual(['Alice', 'Bob'])
  })

  it('orders fractional lap values correctly', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [9.5, 9.75, 9.25]))
    expect(evaluation.ranked.map((entry) => entry.entrant.participant!.name)).toEqual([
      'Bob',
      'Alice',
      'Charlie',
    ])
  })

  it('treats zero laps as a valid, complete result', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie'], 1)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [5, 0, 3]))
    expect(evaluation.isComplete).toBe(true)
    expect(evaluation.ranked.map((entry) => entry.entrant.participant!.name)).toEqual([
      'Alice',
      'Charlie',
      'Bob',
    ])
    expect(evaluation.actualAdvancers.map((p) => p.name)).toEqual(['Alice'])
  })

  it('reports a tie in the top AND a boundary tie when every entrant has the same laps', () => {
    const heat = buildHeatState(['Alice', 'Bob', 'Charlie', 'Dave'], 2)
    const evaluation = evaluateHeatLaps(heat, lapsFor(heat, [5, 5, 5, 5]))
    expect(evaluation.isComplete).toBe(true)
    expect(evaluation.hasTieInTop).toBe(true)
    expect(evaluation.hasTie).toBe(true)
    expect(evaluation.actualAdvancers.map((p) => p.name)).toEqual(['Alice', 'Bob', 'Charlie', 'Dave'])
  })
})

describe('buildTournament — round 1 seeding', () => {
  it('distributes participants sequentially across round 1 heats', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 1), createHeat(1, 3, 1), createHeat(2, 2, 1)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 3, 1)] },
    ]
    const participants = makeParticipants(8)
    const [roundOne] = buildTournament(rounds, participants, {})

    expect(roundOne.heats).toHaveLength(3)
    expect(namesOf(roundOne.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P3'])
    expect(namesOf(roundOne.heats[1].entrants.map((e) => e.participant))).toEqual(['P4', 'P5', 'P6'])
    expect(namesOf(roundOne.heats[2].entrants.map((e) => e.participant))).toEqual(['P7', 'P8'])
    roundOne.heats.forEach((heat) => heat.entrants.forEach((entrant) => expect(entrant.source).toBeNull()))
  })

  it('inserts null placeholders when there are fewer participants than slots', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 3, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 1, 1)] },
    ]
    const [roundOne] = buildTournament(rounds, makeParticipants(2), {})
    expect(namesOf(roundOne.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', null])
  })

  it('fills every round-1 slot with null when there are no participants', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 1), createHeat(1, 2, 1)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const [roundOne] = buildTournament(rounds, [], {})
    expect(roundOne.heats).toHaveLength(2)
    expect(roundOne.heats[0].entrants.map((e) => e.participant)).toEqual([null, null, null])
    expect(roundOne.heats[1].entrants.map((e) => e.participant)).toEqual([null, null])
    roundOne.heats.forEach((heat) =>
      heat.entrants.forEach((entrant) => expect(entrant.source).toBeNull()),
    )
  })
})

describe('buildTournament — source slot propagation', () => {
  it('wires every source slot into the next round when no results have been entered', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 2), createHeat(1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const [, finalRound] = buildTournament(rounds, makeParticipants(6), {})
    const finalHeat = finalRound.heats[0]

    expect(finalHeat.entrants).toHaveLength(4)
    expect(finalHeat.entrants.map((entrant) => entrant.source)).toEqual([
      { fromRound: 0, fromHeat: 0, rank: 1 },
      { fromRound: 0, fromHeat: 0, rank: 2 },
      { fromRound: 0, fromHeat: 1, rank: 1 },
      { fromRound: 0, fromHeat: 1, rank: 2 },
    ])
    finalHeat.entrants.forEach((entrant) => expect(entrant.participant).toBeNull())
  })

  it('splits source slots across multiple destination heats without skipping or duplicating', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 3, 2),
          createHeat(1, 3, 2),
          createHeat(2, 3, 2),
          createHeat(3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const [, roundTwo] = buildTournament(rounds, makeParticipants(12), {})

    expect(roundTwo.heats[0].entrants.map((entrant) => entrant.source)).toEqual([
      { fromRound: 0, fromHeat: 0, rank: 1 },
      { fromRound: 0, fromHeat: 0, rank: 2 },
      { fromRound: 0, fromHeat: 1, rank: 1 },
      { fromRound: 0, fromHeat: 1, rank: 2 },
    ])
    expect(roundTwo.heats[1].entrants.map((entrant) => entrant.source)).toEqual([
      { fromRound: 0, fromHeat: 2, rank: 1 },
      { fromRound: 0, fromHeat: 2, rank: 2 },
      { fromRound: 0, fromHeat: 3, rank: 1 },
      { fromRound: 0, fromHeat: 3, rank: 2 },
    ])
  })

  it('propagates actual advancers from completed previous round results', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 2), createHeat(1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '5',
        },
        [rounds[0].heats[1].id]: {
          [participants[3].id]: '9',
          [participants[4].id]: '7',
          [participants[5].id]: '4',
        },
      },
    }
    const [, finalRound] = buildTournament(rounds, participants, results)
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P4', 'P5'])
  })

  it('seeds completed heats and leaves incomplete heats as null when the prior round is partially complete', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 2), createHeat(1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '5',
        },
      },
    }
    const [roundOne, finalRound] = buildTournament(rounds, participants, results)

    expect(roundOne.canAdvance).toBe(false)
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual([
      'P1',
      'P2',
      null,
      null,
    ])
    expect(finalRound.heats[0].entrants.map((e) => e.source)).toEqual([
      { fromRound: 0, fromHeat: 0, rank: 1 },
      { fromRound: 0, fromHeat: 0, rank: 2 },
      { fromRound: 0, fromHeat: 1, rank: 1 },
      { fromRound: 0, fromHeat: 1, rank: 2 },
    ])
  })

  it('treats results referencing unknown participant ids as incomplete without crashing', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 1, 1)] },
    ]
    const participants = makeParticipants(2)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          'p-99-ghost': '10',
          'p-100-phantom': '5',
        },
      },
    }
    const [roundOne, finalRound] = buildTournament(rounds, participants, results)
    expect(roundOne.canAdvance).toBe(false)
    expect(finalRound.heats[0].entrants[0].participant).toBeNull()
  })

  it('ignores result entries keyed by a heat id that is not in the round', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 1, 1)] },
    ]
    const participants = makeParticipants(2)
    const results: TournamentResults = {
      r1: {
        'round-1-heat-99-stale': {
          [participants[0].id]: '10',
          [participants[1].id]: '5',
        },
      },
    }
    const [roundOne, finalRound] = buildTournament(rounds, participants, results)
    expect(roundOne.canAdvance).toBe(false)
    expect(finalRound.heats[0].entrants[0].participant).toBeNull()
  })

  it('expands the destination heat when a boundary tie produces an extra advancer', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const participants = makeParticipants(8)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
        [rounds[0].heats[1].id]: {
          [participants[4].id]: '11',
          [participants[5].id]: '6',
          [participants[6].id]: '4',
          [participants[7].id]: '2',
        },
      },
    }
    const [roundOne, finalRound] = buildTournament(rounds, participants, results)

    expect(roundOne.messages).toContain('Extra participants will advance due to tie.')
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual([
      'P1',
      'P2',
      'P3',
      'P5',
      'P6',
    ])
  })

  it('produces the configured number of entrants for the final round under the default tournament', () => {
    const [, , finalRound] = buildTournament(DEFAULT_ROUNDS, DEFAULT_PARTICIPANTS, {})
    expect(finalRound.label).toBe('Final')
    expect(finalRound.heats).toHaveLength(1)
    expect(finalRound.heats[0].entrants).toHaveLength(9)
  })

  it('handles a single-round tournament without attempting to propagate sources', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const [onlyRound] = buildTournament(rounds, makeParticipants(2), {})
    expect(onlyRound.heats).toHaveLength(1)
    expect(namesOf(onlyRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2'])
    expect(onlyRound.heats[0].entrants.every((entrant) => entrant.source === null)).toBe(true)
    expect(onlyRound.messages).toEqual([])
  })

  it('propagates advancers across three rounds when all prior results are entered', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)],
      },
      { id: 'r2', label: 'Round 2', heats: [createHeat(0, 4, 2)] },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(8)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '9',
          [participants[2].id]: '5',
          [participants[3].id]: '3',
        },
        [rounds[0].heats[1].id]: {
          [participants[4].id]: '9',
          [participants[5].id]: '8',
          [participants[6].id]: '5',
          [participants[7].id]: '3',
        },
      },
      r2: {
        [rounds[1].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '9',
          [participants[4].id]: '8',
          [participants[5].id]: '7',
        },
      },
    }
    const [, roundTwo, finalRound] = buildTournament(rounds, participants, results)
    expect(namesOf(roundTwo.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P5', 'P6'])
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2'])
    expect(finalRound.heats[0].entrants.map((e) => e.source)).toEqual([
      { fromRound: 1, fromHeat: 0, rank: 1 },
      { fromRound: 1, fromHeat: 0, rank: 2 },
    ])
  })

  it('passes every entrant through when advanceCount equals participantSlots', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 3, 3)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 3, 1)] },
    ]
    const participants = makeParticipants(3)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '9',
          [participants[2].id]: '8',
        },
      },
    }
    const [, finalRound] = buildTournament(rounds, participants, results)
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P3'])
  })

  it('attributes a boundary-tie overflow entrant to the source of the cutoff slot', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 4, 2)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(4)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
      },
    }
    const [, finalRound] = buildTournament(rounds, participants, results)
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P3'])
    expect(finalRound.heats[0].entrants.map((e) => e.source)).toEqual([
      { fromRound: 0, fromHeat: 0, rank: 1 },
      { fromRound: 0, fromHeat: 0, rank: 2 },
      { fromRound: 0, fromHeat: 0, rank: 2 },
    ])
    // Two distinct entrants intentionally share the cutoff-slot source descriptor
    // when a boundary tie expands the destination heat. Downstream consumers
    // must not assume source uniquely identifies an entrant.
    const cutoffEntrants = finalRound.heats[0].entrants.filter(
      (e) => e.source?.rank === 2,
    )
    expect(cutoffEntrants).toHaveLength(2)
    expect(cutoffEntrants[0].participant?.id).not.toBe(cutoffEntrants[1].participant?.id)
  })
})

describe('buildTournament — participant uniqueness across heats', () => {
  type RoundLike = {
    heats: Array<{ entrants: Array<{ participant: Participant | null }> }>
  }

  const collectParticipantIds = (round: RoundLike): string[] => {
    const ids: string[] = []
    round.heats.forEach((heat) =>
      heat.entrants.forEach((entrant) => {
        if (entrant.participant) {
          ids.push(entrant.participant.id)
        }
      }),
    )
    return ids
  }

  const expectUniqueParticipantsAcrossHeats = (round: RoundLike) => {
    const ids = collectParticipantIds(round)
    expect(new Set(ids).size).toBe(ids.length)
  }

  it('keeps source slots unique across multiple destination heats when no results are entered', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 3, 2),
          createHeat(1, 3, 2),
          createHeat(2, 3, 2),
          createHeat(3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const [, roundTwo] = buildTournament(rounds, makeParticipants(12), {})
    const sourceKeys = roundTwo.heats.flatMap((heat) =>
      heat.entrants.map((entrant) => JSON.stringify(entrant.source)),
    )
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length)
    expect(sourceKeys).toHaveLength(8)
  })

  it('does not place the same participant in two heats of a multi-heat next round when advancement is clean', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const heatLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
      [participants[offset + 3].id]: '2',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: heatLaps(0),
        [rounds[0].heats[1].id]: heatLaps(4),
        [rounds[0].heats[2].id]: heatLaps(8),
        [rounds[0].heats[3].id]: heatLaps(12),
      },
    }
    const [, roundTwo] = buildTournament(rounds, participants, results)
    expectUniqueParticipantsAcrossHeats(roundTwo)
    expect(collectParticipantIds(roundTwo)).toHaveLength(8)
  })

  it('does not duplicate participants across heats when a boundary tie adds an extra advancer', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
        [rounds[0].heats[1].id]: {
          [participants[4].id]: '11',
          [participants[5].id]: '6',
          [participants[6].id]: '4',
          [participants[7].id]: '2',
        },
        [rounds[0].heats[2].id]: {
          [participants[8].id]: '10',
          [participants[9].id]: '8',
          [participants[10].id]: '5',
          [participants[11].id]: '3',
        },
        [rounds[0].heats[3].id]: {
          [participants[12].id]: '10',
          [participants[13].id]: '8',
          [participants[14].id]: '5',
          [participants[15].id]: '3',
        },
      },
    }
    const [, roundTwo] = buildTournament(rounds, participants, results)
    expectUniqueParticipantsAcrossHeats(roundTwo)
    // 8 baseline + 1 boundary-tie extra
    expect(collectParticipantIds(roundTwo)).toHaveLength(9)
  })

  it('does not duplicate participants across heats when boundary ties occur in multiple source heats', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const tiedHeatLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '8',
      [participants[offset + 3].id]: '3',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: tiedHeatLaps(0),
        [rounds[0].heats[1].id]: tiedHeatLaps(4),
        [rounds[0].heats[2].id]: tiedHeatLaps(8),
        [rounds[0].heats[3].id]: tiedHeatLaps(12),
      },
    }
    const [, roundTwo] = buildTournament(rounds, participants, results)
    expectUniqueParticipantsAcrossHeats(roundTwo)
    // 8 baseline + 4 boundary-tie extras (one per source heat)
    expect(collectParticipantIds(roundTwo)).toHaveLength(12)
  })

  it('does not duplicate participants across heats when there is a tie within the qualifying positions', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 3, 2),
          createHeat(1, 3, 2),
          createHeat(2, 3, 2),
          createHeat(3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(12)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '10',
          [participants[2].id]: '5',
        },
        [rounds[0].heats[1].id]: {
          [participants[3].id]: '9',
          [participants[4].id]: '7',
          [participants[5].id]: '4',
        },
        [rounds[0].heats[2].id]: {
          [participants[6].id]: '8',
          [participants[7].id]: '8',
          [participants[8].id]: '3',
        },
        [rounds[0].heats[3].id]: {
          [participants[9].id]: '11',
          [participants[10].id]: '6',
          [participants[11].id]: '2',
        },
      },
    }
    const [roundOne, roundTwo] = buildTournament(rounds, participants, results)
    expect(roundOne.hasTie).toBe(true)
    expectUniqueParticipantsAcrossHeats(roundTwo)
    expect(collectParticipantIds(roundTwo)).toHaveLength(8)
  })

  it('keeps participants unique across heats in every round of a multi-round chain', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 3, 2),
          createHeat(1, 3, 2),
          createHeat(2, 3, 2),
          createHeat(3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(12)
    const heatLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: heatLaps(0),
        [rounds[0].heats[1].id]: heatLaps(3),
        [rounds[0].heats[2].id]: heatLaps(6),
        [rounds[0].heats[3].id]: heatLaps(9),
      },
      r2: {
        [rounds[1].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '7',
          [participants[3].id]: '9',
          [participants[4].id]: '5',
        },
        [rounds[1].heats[1].id]: {
          [participants[6].id]: '11',
          [participants[7].id]: '6',
          [participants[9].id]: '8',
          [participants[10].id]: '4',
        },
      },
    }
    const [roundOne, roundTwo, finalRound] = buildTournament(rounds, participants, results)
    expectUniqueParticipantsAcrossHeats(roundOne)
    expectUniqueParticipantsAcrossHeats(roundTwo)
    expectUniqueParticipantsAcrossHeats(finalRound)
  })
})

describe('buildTournament — every qualifier advances', () => {
  type RoundLike = {
    id: string
    heats: HeatState[]
  }

  const idsInRound = (round: RoundLike): Set<string> => {
    const ids = new Set<string>()
    round.heats.forEach((heat) =>
      heat.entrants.forEach((entrant) => {
        if (entrant.participant) {
          ids.add(entrant.participant.id)
        }
      }),
    )
    return ids
  }

  const expectedAdvancerIds = (
    prevRound: RoundLike,
    results: TournamentResults,
  ): Set<string> => {
    const ids = new Set<string>()
    prevRound.heats.forEach((heat) => {
      const laps = results[prevRound.id]?.[heat.id] ?? {}
      evaluateHeatLaps(heat, laps).actualAdvancers.forEach((p) => ids.add(p.id))
    })
    return ids
  }

  const expectAdvancersMatchPriorRound = (
    rounds: RoundLike[],
    results: TournamentResults,
    roundIndex: number,
  ) => {
    expect(roundIndex).toBeGreaterThan(0)
    expect(idsInRound(rounds[roundIndex])).toEqual(
      expectedAdvancerIds(rounds[roundIndex - 1], results),
    )
  }

  it('places every qualifier from a clean prior round into the next round', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const heatLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
      [participants[offset + 3].id]: '2',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: heatLaps(0),
        [rounds[0].heats[1].id]: heatLaps(4),
        [rounds[0].heats[2].id]: heatLaps(8),
        [rounds[0].heats[3].id]: heatLaps(12),
      },
    }
    const built = buildTournament(rounds, participants, results)
    expectAdvancersMatchPriorRound(built, results, 1)
  })

  it('places the boundary-tie extra advancer into the next round alongside the regular qualifiers', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const cleanLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
      [participants[offset + 3].id]: '2',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
        [rounds[0].heats[1].id]: cleanLaps(4),
        [rounds[0].heats[2].id]: cleanLaps(8),
        [rounds[0].heats[3].id]: cleanLaps(12),
      },
    }
    const built = buildTournament(rounds, participants, results)
    expectAdvancersMatchPriorRound(built, results, 1)
  })

  it('places every qualifier when boundary ties occur in every source heat', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(16)
    const tiedLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '8',
      [participants[offset + 3].id]: '3',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: tiedLaps(0),
        [rounds[0].heats[1].id]: tiedLaps(4),
        [rounds[0].heats[2].id]: tiedLaps(8),
        [rounds[0].heats[3].id]: tiedLaps(12),
      },
    }
    const built = buildTournament(rounds, participants, results)
    expectAdvancersMatchPriorRound(built, results, 1)
  })

  it('places both tied entrants when the qualifying positions are tied', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 2), createHeat(1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '10',
          [participants[2].id]: '5',
        },
        [rounds[0].heats[1].id]: {
          [participants[3].id]: '9',
          [participants[4].id]: '7',
          [participants[5].id]: '4',
        },
      },
    }
    const built = buildTournament(rounds, participants, results)
    expectAdvancersMatchPriorRound(built, results, 1)
  })

  it('places every qualifier from every transition in a multi-round chain', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 3, 2),
          createHeat(1, 3, 2),
          createHeat(2, 3, 2),
          createHeat(3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 1), createHeat(1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(12)
    const heatLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: heatLaps(0),
        [rounds[0].heats[1].id]: heatLaps(3),
        [rounds[0].heats[2].id]: heatLaps(6),
        [rounds[0].heats[3].id]: heatLaps(9),
      },
      r2: {
        [rounds[1].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '7',
          [participants[3].id]: '9',
          [participants[4].id]: '5',
        },
        [rounds[1].heats[1].id]: {
          [participants[6].id]: '11',
          [participants[7].id]: '6',
          [participants[9].id]: '8',
          [participants[10].id]: '4',
        },
      },
    }
    const built = buildTournament(rounds, participants, results)
    expectAdvancersMatchPriorRound(built, results, 1)
    expectAdvancersMatchPriorRound(built, results, 2)
  })
})

describe('buildTournament — structural invariants', () => {
  const buildComplexTournament = () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [
          createHeat(0, 4, 2),
          createHeat(1, 4, 2),
          createHeat(2, 4, 2),
          createHeat(3, 4, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 4, 2), createHeat(1, 4, 2)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 4, 1)] },
    ]
    const participants = makeParticipants(16)
    const cleanLaps = (offset: number) => ({
      [participants[offset].id]: '10',
      [participants[offset + 1].id]: '8',
      [participants[offset + 2].id]: '5',
      [participants[offset + 3].id]: '2',
    })
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
        [rounds[0].heats[1].id]: cleanLaps(4),
        [rounds[0].heats[2].id]: cleanLaps(8),
        [rounds[0].heats[3].id]: cleanLaps(12),
      },
    }
    return {
      rounds,
      participants,
      results,
      built: buildTournament(rounds, participants, results),
    }
  }

  it('seeds round 1 with participants[] in order, padding trailing slots with null', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 4, 2), createHeat(1, 4, 2), createHeat(2, 4, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 6, 1)] },
    ]
    const participants = makeParticipants(10)
    const [roundOne] = buildTournament(rounds, participants, {})
    const flat = roundOne.heats.flatMap((heat) =>
      heat.entrants.map((entrant) => entrant.participant),
    )
    expect(flat).toHaveLength(12)
    expect(flat.slice(0, 10)).toEqual(participants)
    expect(flat.slice(10)).toEqual([null, null])
  })

  it('keeps source === null in round 0 and non-null in every later-round entrant', () => {
    const { built } = buildComplexTournament()
    built[0].heats.forEach((heat) =>
      heat.entrants.forEach((entrant) => expect(entrant.source).toBeNull()),
    )
    built.slice(1).forEach((round) =>
      round.heats.forEach((heat) =>
        heat.entrants.forEach((entrant) => expect(entrant.source).not.toBeNull()),
      ),
    )
  })

  it('emits structurally valid source descriptors for every later-round entrant', () => {
    const { rounds, built } = buildComplexTournament()
    built.forEach((round, roundIndex) => {
      if (roundIndex === 0) return
      const prevHeats = rounds[roundIndex - 1].heats
      round.heats.forEach((heat) => {
        heat.entrants.forEach((entrant) => {
          if (!entrant.source) {
            throw new Error('expected source to be non-null in a later round')
          }
          expect(entrant.source.fromRound).toBe(roundIndex - 1)
          expect(entrant.source.fromHeat).toBeGreaterThanOrEqual(0)
          expect(entrant.source.fromHeat).toBeLessThan(prevHeats.length)
          const sourceHeat = prevHeats[entrant.source.fromHeat]
          expect(entrant.source.rank).toBeGreaterThanOrEqual(1)
          expect(entrant.source.rank).toBeLessThanOrEqual(sourceHeat.advanceCount)
        })
      })
    })
  })

  it('keeps heat.participantSlots equal to heat.entrants.length after building', () => {
    const { built } = buildComplexTournament()
    built.forEach((round) =>
      round.heats.forEach((heat) =>
        expect(heat.participantSlots).toBe(heat.entrants.length),
      ),
    )
  })

  it('returns deeply equal output when called twice with the same inputs', () => {
    const { rounds, participants, results } = buildComplexTournament()
    const first = buildTournament(rounds, participants, results)
    const second = buildTournament(rounds, participants, results)
    expect(first).toEqual(second)
  })

  it('returns freshly constructed objects on each call (no shared mutable state)', () => {
    const { rounds, participants, results } = buildComplexTournament()
    const first = buildTournament(rounds, participants, results)
    const second = buildTournament(rounds, participants, results)
    expect(first).not.toBe(second)
    first.forEach((round, roundIndex) => {
      expect(round).not.toBe(second[roundIndex])
      expect(round.heats).not.toBe(second[roundIndex].heats)
      round.heats.forEach((heat, heatIndex) => {
        expect(heat).not.toBe(second[roundIndex].heats[heatIndex])
        expect(heat.entrants).not.toBe(second[roundIndex].heats[heatIndex].entrants)
      })
    })
  })

  it('orders entries from the same source heat by non-decreasing rank within each destination heat', () => {
    const { built } = buildComplexTournament()
    built.forEach((round, roundIndex) => {
      if (roundIndex === 0) return
      round.heats.forEach((heat) => {
        const lastRankPerSourceHeat = new Map<number, number>()
        heat.entrants.forEach((entrant) => {
          if (!entrant.source) return
          const prev = lastRankPerSourceHeat.get(entrant.source.fromHeat)
          if (prev !== undefined) {
            expect(entrant.source.rank).toBeGreaterThanOrEqual(prev)
          }
          lastRankPerSourceHeat.set(entrant.source.fromHeat, entrant.source.rank)
        })
      })
    })
  })

  it('places top-tied qualifiers into the destination heats their ranks map to', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 3, 2), createHeat(1, 3, 2)],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(0, 3, 1), createHeat(1, 1, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '5',
        },
        [rounds[0].heats[1].id]: {
          [participants[3].id]: '10',
          [participants[4].id]: '10',
          [participants[5].id]: '4',
        },
      },
    }
    const [roundOne, roundTwo] = buildTournament(rounds, participants, results)
    expect(roundOne.hasTie).toBe(true)
    expect(namesOf(roundTwo.heats[0].entrants.map((e) => e.participant))).toEqual([
      'P1',
      'P2',
      'P4',
    ])
    expect(namesOf(roundTwo.heats[1].entrants.map((e) => e.participant))).toEqual(['P5'])
  })
})

describe('buildTournament — round status flags', () => {
  it('reports canAdvance=false until all heats in the round are complete', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 1, 1)] },
    ]
    const [roundOne] = buildTournament(rounds, makeParticipants(2), {})
    expect(roundOne.canAdvance).toBe(false)
    expect(roundOne.messages).toContain(
      'Enter laps completed for all entrants in this round to unlock the next round.',
    )
  })

  it('reports canAdvance=true with no advancement messages once every heat is complete', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 2, 1), createHeat(1, 2, 1)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(4)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '5',
        },
        [rounds[0].heats[1].id]: {
          [participants[2].id]: '9',
          [participants[3].id]: '4',
        },
      },
    }
    const [roundOne] = buildTournament(rounds, participants, results)
    expect(roundOne.canAdvance).toBe(true)
    expect(roundOne.hasTie).toBe(false)
    expect(roundOne.messages).not.toContain(
      'Enter laps completed for all entrants in this round to unlock the next round.',
    )
    expect(roundOne.messages).not.toContain('Tie among qualifying positions.')
    expect(roundOne.messages).not.toContain('Extra participants will advance due to tie.')
  })

  it('reports hasTie=true and a corresponding message for a tie among qualifying positions', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 3, 2)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 2, 1)] },
    ]
    const participants = makeParticipants(3)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '10',
          [participants[2].id]: '5',
        },
      },
    }
    const [roundOne] = buildTournament(rounds, participants, results)
    expect(roundOne.hasTie).toBe(true)
    expect(roundOne.messages).toContain('Tie among qualifying positions.')
  })

  it('suppresses advancement messages on the final round', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(0, 1, 1)] },
    ]
    const [, finalRound] = buildTournament(rounds, makeParticipants(2), {})
    expect(finalRound.messages).toEqual([])
  })
})

describe('sortLines', () => {
  it('returns empty string for empty input', () => {
    expect(sortLines('')).toBe('')
  })

  it('returns the same name for a single participant', () => {
    expect(sortLines('Alice')).toBe('Alice')
  })

  it('sorts names alphabetically', () => {
    expect(sortLines('Dave\nAlice\nCarol\nBob')).toBe('Alice\nBob\nCarol\nDave')
  })
})

describe('ensureFinalRoundShape', () => {
  it('does not produce duplicate round ids after removing and re-adding a round', () => {
    // Simulate: start with [Round 1, Round 2, Final(round-3)],
    // remove a round → [Round 1, Final(round-2)],
    // then addRound strips the final and creates Round 2 with id "round-2",
    // passing [Round 1, Round 2(round-2)] to ensureFinalRoundShape.
    // The Final round must NOT reuse "round-2".
    const input: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 10, 5)] },
      { id: 'round-2', label: 'Round 2', heats: [createHeat(0, 5, 1)] },
    ]
    const result = ensureFinalRoundShape(input)
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('preserves the existing final round id when the last round is labeled Final', () => {
    const input: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 10, 5)] },
      { id: 'round-2', label: 'Final', heats: [createHeat(0, 5, 1)] },
    ]
    const result = ensureFinalRoundShape(input)
    expect(result[result.length - 1].id).toBe('round-2')
  })

  it('generates a UUID final id for a single-round input', () => {
    const input: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 10, 5)] },
    ]
    const result = ensureFinalRoundShape(input)
    expect(result).toHaveLength(2)
    expect(result[1].id).toMatch(UUID_RE)
    expect(result[1].id).not.toBe('round-1')
    expect(result[1].label).toBe('Final')
  })

  it('preserves the existing final heat id when the last round is labeled Final', () => {
    const existingHeatId = 'existing-heat-uuid'
    const input: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 10, 5)] },
      { id: 'round-2', label: 'Final', heats: [{ ...createHeat(0, 5, 1), id: existingHeatId }] },
    ]
    const result = ensureFinalRoundShape(input)
    expect(result[result.length - 1].heats[0].id).toBe(existingHeatId)
  })

  it('produces the same final heat id on repeated calls with the same input', () => {
    const input: RoundConfig[] = [
      { id: 'round-1', label: 'Round 1', heats: [createHeat(0, 10, 5)] },
      { id: 'round-2', label: 'Final', heats: [{ ...createHeat(0, 5, 1), id: 'final-heat-uuid' }] },
    ]
    const first = ensureFinalRoundShape(input)
    const second = ensureFinalRoundShape(input)
    expect(first[first.length - 1].heats[0].id).toBe(second[second.length - 1].heats[0].id)
  })
})

describe('shuffleLines', () => {
  it('returns empty string for empty input', () => {
    expect(shuffleLines('')).toBe('')
  })

  it('returns the same name for a single participant', () => {
    expect(shuffleLines('Alice')).toBe('Alice')
  })

  it('returns the same set of names in any order', () => {
    const input = 'Alice\nBob\nCarol\nDave\nEve'
    const result = shuffleLines(input)
    expect(result.split('\n').sort()).toEqual(input.split('\n').sort())
  })
})
