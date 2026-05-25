import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BracketPanel } from './BracketPanel'
import {
  buildTournament,
  createHeat,
  evaluateHeatLaps,
  parseParticipantsFromLines,
  type RoundConfig,
  type TournamentResults,
} from '../lib/tournament'
import { buildDestinationHeatMap } from '../lib/roundTransitions'

const makeParticipants = (count: number) =>
  parseParticipantsFromLines(
    Array.from({ length: count }, (_, index) => `P${index + 1}`).join('\n'),
  )

describe('buildDestinationHeatMap', () => {
  it('assigns destination hints round-robin when heats have equal slots', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(3, 2), createHeat(3, 2)],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(2, 1), createHeat(2, 1)],
      },
    ]
    const roundStates = buildTournament(rounds, makeParticipants(6), {})
    const destinationMap = buildDestinationHeatMap(roundStates, 0)

    expect(destinationMap.get('0-1')).toBe(1)
    expect(destinationMap.get('1-1')).toBe(2)
    expect(destinationMap.get('0-2')).toBe(1)
    expect(destinationMap.get('1-2')).toBe(2)
  })

  it('skips full destination heats when slot counts are uneven', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 1), createHeat(2, 1), createHeat(2, 1)],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(1, 1), createHeat(2, 1)],
      },
    ]
    const roundStates = buildTournament(rounds, makeParticipants(6), {})
    const destinationMap = buildDestinationHeatMap(roundStates, 0)

    expect(destinationMap.get('0-1')).toBe(1)
    expect(destinationMap.get('1-1')).toBe(2)
    expect(destinationMap.get('2-1')).toBe(2)
  })

  it('aligns tied qualifiers with their advancement slots', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 2), createHeat(2, 2)],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(2, 1), createHeat(1, 1), createHeat(1, 1)],
      },
    ]
    const participants = makeParticipants(4)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '10',
        },
        [rounds[0].heats[1].id]: {
          [participants[2].id]: '9',
          [participants[3].id]: '8',
        },
      },
    }
    const roundStates = buildTournament(rounds, participants, results)
    const destinationMap = buildDestinationHeatMap(roundStates, 0)
    const heat = roundStates[0].heats[0]
    const ranking = evaluateHeatLaps(heat, results.r1[rounds[0].heats[0].id])
    const advancingSlotById = new Map<string, number>()
    ranking.actualAdvancers.forEach((participant, index) => {
      const slotIndex = index < heat.advanceCount - 1 ? index + 1 : heat.advanceCount
      advancingSlotById.set(participant.id, slotIndex)
    })

    const tiedParticipant = participants[1]
    const advancingSlot = advancingSlotById.get(tiedParticipant.id)
    expect(advancingSlot).toBe(2)

    const destinationHeat = destinationMap.get(`0-${advancingSlot}`)
    const actualHeatIndex = roundStates[1].heats.findIndex((nextHeat) =>
      nextHeat.entrants.some((entrant) => entrant.participant?.id === tiedParticipant.id),
    )
    expect(destinationHeat).toBe(actualHeatIndex + 1)
    expect(destinationHeat).toBe(3)
  })

  it('keeps destination hints aligned with configured slots after a boundary tie expands a heat', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 1), createHeat(2, 1), createHeat(2, 1)],
      },
      {
        id: 'r2',
        label: 'Round 2',
        heats: [createHeat(1, 1), createHeat(2, 1)],
      },
    ]
    const participants = makeParticipants(6)
    const results: TournamentResults = {
      r1: {
        [rounds[0].heats[0].id]: {
          [participants[0].id]: '10',
          [participants[1].id]: '10',
        },
        [rounds[0].heats[1].id]: {
          [participants[2].id]: '9',
          [participants[3].id]: '5',
        },
        [rounds[0].heats[2].id]: {
          [participants[4].id]: '8',
          [participants[5].id]: '4',
        },
      },
    }
    const roundStates = buildTournament(rounds, participants, results)
    const destinationMap = buildDestinationHeatMap(roundStates, 0)

    expect(destinationMap.get('2-1')).toBe(2)
  })
})

describe('BracketPanel advancement label', () => {
  const renderBracket = (rounds: RoundConfig[], results: TournamentResults = {}) =>
    renderToStaticMarkup(
      <BracketPanel roundStates={buildTournament(rounds, makeParticipants(2), results)} results={results} isDisplayMode={false} onSetLaps={() => undefined} />,
    )

  it('shows "Top N racers advance" when a heat is incomplete', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 2)],
      },
      {
        id: 'r2',
        label: 'Final',
        heats: [createHeat(2, 1)],
      },
    ]

    const markup = renderBracket(rounds)
    expect(markup).toContain('Top 2 racers advance')
  })

  it('shows singular copy when a heat is complete', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 1)],
      },
      {
        id: 'r2',
        label: 'Final',
        heats: [createHeat(1, 1)],
      },
    ]
    const participants = makeParticipants(2)
    const heatId = rounds[0].heats[0].id
    const results: TournamentResults = {
      r1: {
        [heatId]: {
          [participants[0].id]: '4',
          [participants[1].id]: '3',
        },
      },
    }

    const markup = renderToStaticMarkup(
      <BracketPanel
        roundStates={buildTournament(rounds, participants, results)}
        results={results}
        isDisplayMode={false}
        onSetLaps={() => undefined}
      />,
    )

    expect(markup).toContain('1 racer to advance')
  })

  it('reflects extra advancers when a boundary tie expands the field', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 1)],
      },
      {
        id: 'r2',
        label: 'Final',
        heats: [createHeat(2, 1)],
      },
    ]
    const participants = makeParticipants(2)
    const heatId = rounds[0].heats[0].id
    const results: TournamentResults = {
      r1: {
        [heatId]: {
          [participants[0].id]: '5',
          [participants[1].id]: '5',
        },
      },
    }

    const markup = renderToStaticMarkup(
      <BracketPanel
        roundStates={buildTournament(rounds, participants, results)}
        results={results}
        isDisplayMode={false}
        onSetLaps={() => undefined}
      />,
    )

    expect(markup).toContain('2 racers to advance')
  })

  it('omits the advancement label for the final round', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Final',
        heats: [createHeat(2, 1)],
      },
    ]

    const markup = renderToStaticMarkup(
      <BracketPanel
        roundStates={buildTournament(rounds, makeParticipants(2), {})}
        results={{}}
        isDisplayMode={false}
        onSetLaps={() => undefined}
      />,
    )

    expect(markup).not.toContain('racer')
  })

  it('hides the advancement label when a heat is collapsed', () => {
    const rounds: RoundConfig[] = [
      {
        id: 'r1',
        label: 'Round 1',
        heats: [createHeat(2, 2)],
      },
      {
        id: 'r2',
        label: 'Final',
        heats: [createHeat(2, 1)],
      },
    ]

    const markup = renderToStaticMarkup(
      <BracketPanel
        roundStates={buildTournament(rounds, makeParticipants(2), {})}
        results={{}}
        isDisplayMode={true}
        onSetLaps={() => undefined}
      />,
    )

    expect(markup).not.toContain('Top 2 racers advance')
  })
})
