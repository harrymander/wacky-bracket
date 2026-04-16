import { evaluateHeatLaps, type RoundState, type TournamentResults } from '../lib/tournament'

type BracketPanelProps = {
  roundStates: RoundState[]
  results: TournamentResults
  isDisplayMode: boolean
  onSetLaps: (roundId: string, heatId: string, participantId: string, value: string) => void
}

const buildDestinationHeatMap = (roundStates: RoundState[], roundIndex: number) => {
  const map = new Map<string, number>()
  if (roundIndex >= roundStates.length - 1) {
    return map
  }

  const currentRound = roundStates[roundIndex]
  const nextRound = roundStates[roundIndex + 1]

  const destinationHeatSlots: number[] = []
  nextRound.heats.forEach((heat, nextHeatIndex) => {
    for (let i = 0; i < heat.participantSlots; i += 1) {
      destinationHeatSlots.push(nextHeatIndex + 1)
    }
  })

  let cursor = 0
  currentRound.heats.forEach((heat, heatIndex) => {
    for (let rank = 1; rank <= heat.advanceCount; rank += 1) {
      const destinationHeat = destinationHeatSlots[cursor]
      if (destinationHeat !== undefined) {
        map.set(`${heatIndex}-${rank}`, destinationHeat)
      }
      cursor += 1
    }
  })

  return map
}

export const BracketPanel = ({ roundStates, results, isDisplayMode, onSetLaps }: BracketPanelProps) => (
  <>
    <div className="round-lane">
      {roundStates.map((round, roundIndex) => (
        <article key={round.id} className="round-card">
          <header>
            <h3>{round.label}</h3>
            <p>{round.heats.length} heat{round.heats.length === 1 ? '' : 's'}</p>
          </header>

          {round.messages.map((message) => (
            <p key={message} className="warn">
              {message}
            </p>
          ))}

          {(() => {
            const destinationHeatMap = buildDestinationHeatMap(roundStates, roundIndex)
            return round.heats.map((heat, heatIndex) => {
            const ranking = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
            return (
              <section key={heat.id} className="heat-card">
                <h4>{heat.label}</h4>
                {heat.entrants.map((entrant, entrantIndex) => {
                  const participant = entrant.participant
                  const placeholder = entrant.source
                    ? `R${entrant.source.fromRound + 1} H${entrant.source.fromHeat + 1} #${entrant.source.rank}`
                    : 'Unassigned'
                  const currentValue =
                    participant && results?.[round.id]?.[heat.id]?.[participant.id]
                      ? results[round.id][heat.id][participant.id]
                      : ''
                  const isAdvancing =
                    ranking.isComplete &&
                    !ranking.hasTie &&
                    ranking.ranked
                      .slice(0, heat.advanceCount)
                      .some((entry) => entry.entrant.participant?.id === participant?.id)
                  const advancingRank = participant
                    ? ranking.ranked.findIndex((entry) => entry.entrant.participant?.id === participant.id) + 1
                    : 0
                  const destinationHeat =
                    isAdvancing && roundIndex < roundStates.length - 1 && advancingRank > 0
                      ? destinationHeatMap.get(`${heatIndex}-${advancingRank}`)
                      : undefined

                  return (
                    <div
                      key={`${heat.id}-slot-${entrantIndex}-${participant?.id ?? 'unassigned'}`}
                      className={`entrant-row ${isAdvancing ? 'advancing' : ''}`}
                    >
                      <span className="entrant-label">
                        <span>{participant ? participant.name : placeholder}</span>
                        {destinationHeat ? (
                          <span className="next-destination">{`→ R${roundIndex + 2} H${destinationHeat}`}</span>
                        ) : null}
                      </span>
                      {isDisplayMode ? (
                        <span className="lap-value">{participant ? currentValue || '-' : '-'}</span>
                      ) : (
                        <input
                          type="number"
                          name={`laps-${round.id}-${heat.id}-${participant?.id ?? 'slot-' + entrantIndex}`}
                          min={0}
                          step={0.25}
                          disabled={!participant}
                          value={currentValue}
                          placeholder={participant ? 'Laps' : '-'}
                          onChange={(event) => participant && onSetLaps(round.id, heat.id, participant.id, event.target.value)}
                        />
                      )}
                    </div>
                  )
                })}
                {ranking.hasTie ? <p className="warn">Top qualifying positions must have unique lap totals.</p> : null}
              </section>
            )
          })
          })()}
          {roundIndex < roundStates.length - 1 && !round.canAdvance ? (
            <p className="locked">Next round stays locked until all lap totals are valid.</p>
          ) : null}
        </article>
      ))}
    </div>
  </>
)
