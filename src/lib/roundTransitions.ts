import {
  assignSourcesToDestinationHeats,
  sourceSlotsForRound,
  type RoundState,
} from './tournament'

export const buildDestinationHeatMap = (roundStates: RoundState[], roundIndex: number) => {
  const map = new Map<string, number>()
  if (roundIndex >= roundStates.length - 1) {
    return map
  }

  const currentRound = roundStates[roundIndex]
  const nextRound = roundStates[roundIndex + 1]

  const sources = sourceSlotsForRound(currentRound, roundIndex)
  const assignments = assignSourcesToDestinationHeats(
    sources,
    nextRound.heats.map((heat) => ({
      id: heat.id,
      participantSlots: heat.configuredSlots,
      advanceCount: heat.advanceCount,
    })),
  )
  sources.forEach((source, index) => {
    const destinationHeatIndex = assignments[index]
    if (destinationHeatIndex !== undefined) {
      map.set(`${source.fromHeat}-${source.rank}`, destinationHeatIndex + 1)
    }
  })

  return map
}
