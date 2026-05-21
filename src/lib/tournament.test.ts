import { describe, expect, it } from 'vitest'
import {
  buildTournament,
  createHeat,
  DEFAULT_PARTICIPANTS,
  DEFAULT_ROUNDS,
  evaluateHeatLaps,
  normalizeHeat,
  normalizeRound,
  parseParticipantsFromCsv,
  parseParticipantsFromLines,
  totalRoundOutgoing,
  totalRoundSlots,
  validateTournament,
} from './tournament'
import type {
  HeatState,
  Participant,
  RoundConfig,
  TournamentResults,
} from './tournament'

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

  it('produces slugified ids that include the 1-based index', () => {
    const result = parseParticipantsFromLines('Group 1\nWild Card!')
    expect(result[0].id).toBe('p-1-group-1')
    expect(result[1].id).toBe('p-2-wild-card')
  })

  it('falls back to a "seed" slug when the name has no alphanumerics', () => {
    const result = parseParticipantsFromLines('---')
    expect(result[0].id).toBe('p-1-seed')
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
})

describe('createHeat', () => {
  it('produces an id and label derived from the round/heat index', () => {
    const heat = createHeat(2, 1, 8, 4)
    expect(heat.id).toBe('round-3-heat-2')
    expect(heat.label).toBe('Heat 2')
    expect(heat.participantSlots).toBe(8)
    expect(heat.advanceCount).toBe(4)
  })

  it('clamps non-positive counts to 1', () => {
    const heat = createHeat(0, 0, 0, -3)
    expect(heat.participantSlots).toBe(1)
    expect(heat.advanceCount).toBe(1)
  })
})

describe('normalizeHeat', () => {
  it('fills defaults when fields are missing', () => {
    const heat = normalizeHeat({}, 0, 0)
    expect(heat).toEqual({
      id: 'round-1-heat-1',
      label: 'Heat 1',
      participantSlots: 1,
      advanceCount: 1,
    })
  })

  it('clamps advanceCount to participantSlots', () => {
    const heat = normalizeHeat({ participantSlots: 4, advanceCount: 10 }, 0, 0)
    expect(heat.advanceCount).toBe(4)
  })

  it('preserves an explicit id and label', () => {
    const heat = normalizeHeat({ id: 'custom', label: 'My Heat', participantSlots: 5, advanceCount: 2 }, 0, 0)
    expect(heat.id).toBe('custom')
    expect(heat.label).toBe('My Heat')
  })
})

describe('normalizeRound', () => {
  it('fills defaults when fields are missing', () => {
    const round = normalizeRound({}, 1)
    expect(round.id).toBe('round-2')
    expect(round.label).toBe('Round 2')
    expect(round.heats).toHaveLength(1)
  })

  it('inserts a default heat when the heats array is empty', () => {
    const round = normalizeRound({ heats: [] }, 0)
    expect(round.heats).toHaveLength(1)
    expect(round.heats[0].participantSlots).toBe(2)
  })
})

describe('totalRoundSlots / totalRoundOutgoing', () => {
  it('sums participant slots and advance counts', () => {
    const round: RoundConfig = {
      id: 'round-1',
      label: 'Round 1',
      heats: [
        createHeat(0, 0, 10, 5),
        createHeat(0, 1, 11, 6),
      ],
    }
    expect(totalRoundSlots(round)).toBe(21)
    expect(totalRoundOutgoing(round)).toBe(11)
  })
})

describe('validateTournament', () => {
  const passingRounds: RoundConfig[] = [
    { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 4, 2), createHeat(0, 1, 4, 2)] },
    { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 4, 1)] },
  ]
  const passingParticipants = makeParticipants(8)

  it('returns no errors for a valid configuration', () => {
    expect(validateTournament(passingParticipants, passingRounds)).toEqual([])
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
      { id: 'r1', label: 'Round 1', heats: [{ ...createHeat(0, 0, 4, 2), advanceCount: 10 }] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 10, 1)] },
    ]
    const errors = validateTournament(makeParticipants(4), rounds)
    expect(errors.some((m) => m.includes('advancing count cannot exceed participant slots'))).toBe(true)
  })

  it('flags an outgoing/incoming round mismatch', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 6, 4)] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 3, 1)] },
    ]
    const errors = validateTournament(makeParticipants(6), rounds)
    expect(
      errors.some((m) => m.includes('Round 1 outputs 4 qualifiers') && m.includes('Round 2 expects 3 entrants')),
    ).toBe(true)
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
  })

  it('marks the heat incomplete when a lap value is negative or NaN', () => {
    const heat = buildHeatState(['Alice', 'Bob'], 1)
    expect(evaluateHeatLaps(heat, lapsFor(heat, [5, -1])).isComplete).toBe(false)
    expect(evaluateHeatLaps(heat, lapsFor(heat, [5, 'abc'])).isComplete).toBe(false)
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
})

describe('buildTournament — round 1 seeding', () => {
  it('distributes participants sequentially across round 1 heats', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 0, 3, 1), createHeat(0, 1, 3, 1), createHeat(0, 2, 2, 1)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 3, 1)] },
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
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 3, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 1, 1)] },
    ]
    const [roundOne] = buildTournament(rounds, makeParticipants(2), {})
    expect(namesOf(roundOne.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', null])
  })
})

describe('buildTournament — source slot propagation', () => {
  it('wires every source slot into the next round when no results have been entered', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 0, 3, 2), createHeat(0, 1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 4, 1)] },
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
          createHeat(0, 0, 3, 2),
          createHeat(0, 1, 3, 2),
          createHeat(0, 2, 3, 2),
          createHeat(0, 3, 3, 2),
        ],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(1, 0, 4, 1), createHeat(1, 1, 4, 1)],
      },
      { id: 'r3', label: 'Final', heats: [createHeat(2, 0, 2, 1)] },
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
        heats: [createHeat(0, 0, 3, 2), createHeat(0, 1, 3, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 4, 1)] },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        'round-1-heat-1': {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '5',
        },
        'round-1-heat-2': {
          [participants[3].id]: '9',
          [participants[4].id]: '7',
          [participants[5].id]: '4',
        },
      },
    }
    const [, finalRound] = buildTournament(rounds, participants, results)
    expect(namesOf(finalRound.heats[0].entrants.map((e) => e.participant))).toEqual(['P1', 'P2', 'P4', 'P5'])
  })

  it('expands the destination heat when a boundary tie produces an extra advancer', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(0, 0, 4, 2), createHeat(0, 1, 4, 2)],
      },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 4, 1)] },
    ]
    const participants = makeParticipants(8)
    const results: TournamentResults = {
      r1: {
        'round-1-heat-1': {
          [participants[0].id]: '10',
          [participants[1].id]: '8',
          [participants[2].id]: '8',
          [participants[3].id]: '3',
        },
        'round-1-heat-2': {
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
})

describe('buildTournament — round status flags', () => {
  it('reports canAdvance=false until all heats in the round are complete', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 1, 1)] },
    ]
    const [roundOne] = buildTournament(rounds, makeParticipants(2), {})
    expect(roundOne.canAdvance).toBe(false)
    expect(roundOne.messages).toContain(
      'Enter laps completed for all entrants in this round to unlock the next round.',
    )
  })

  it('reports hasTie=true and a corresponding message for a tie among qualifying positions', () => {
    const rounds: RoundConfig[] = [
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 3, 2)] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 2, 1)] },
    ]
    const participants = makeParticipants(3)
    const results: TournamentResults = {
      r1: {
        'round-1-heat-1': {
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
      { id: 'r1', label: 'Round 1', heats: [createHeat(0, 0, 2, 1)] },
      { id: 'r2', label: 'Final', heats: [createHeat(1, 0, 1, 1)] },
    ]
    const [, finalRound] = buildTournament(rounds, makeParticipants(2), {})
    expect(finalRound.messages).toEqual([])
  })
})
