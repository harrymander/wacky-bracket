import { useState } from 'react'
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
  <BracketPanelContent roundStates={roundStates} results={results} isDisplayMode={isDisplayMode} onSetLaps={onSetLaps} />
)

const BracketPanelContent = ({ roundStates, results, isDisplayMode, onSetLaps }: BracketPanelProps) => {
  const [expandedHeatKey, setExpandedHeatKey] = useState<string | null>(null)

  return (
    <div className={`round-lane ${expandedHeatKey ? 'focus-mode' : ''}`}>
      {roundStates.map((round, roundIndex) => {
        const visibleHeats =
          expandedHeatKey === null ? round.heats : round.heats.filter((heat) => `${round.id}:${heat.id}` === expandedHeatKey)
        if (visibleHeats.length === 0) {
          return null
        }

        const destinationHeatMap = buildDestinationHeatMap(roundStates, roundIndex)

        return (
          <article key={round.id} className={`round-card ${expandedHeatKey ? 'focus-mode' : ''}`}>
            <header>
              <h3>{round.label}</h3>
              {!expandedHeatKey && roundIndex < roundStates.length - 1 ? (
                <p>{visibleHeats.length} heat{visibleHeats.length === 1 ? '' : 's'}</p>
              ) : null}
            </header>

            {round.messages.map((message) => (
              <p key={message} className="warn">
                {message}
              </p>
            ))}

            {visibleHeats.map((heat) => {
              const ranking = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
              const originalHeatIndex = round.heats.findIndex((candidate) => candidate.id === heat.id)
              const heatKey = `${round.id}:${heat.id}`
              const isExpanded = expandedHeatKey === heatKey

              return (
                <section key={heat.id} className={`heat-card ${isExpanded ? 'focus-mode' : ''}`}>
                  <div className="heat-header">
                    {roundIndex < roundStates.length - 1 ? <h4>{heat.label}</h4> : <h4>{round.label}</h4>}
                    <button
                      type="button"
                      className={`ghost heat-focus-button ${isExpanded ? 'compress' : 'expand'}`}
                      aria-label={isExpanded ? 'Minimise heat' : 'Expand heat'}
                      title={isExpanded ? 'Minimise heat' : 'Expand heat'}
                      onClick={() => setExpandedHeatKey(isExpanded ? null : heatKey)}
                    />
                  </div>
                  {isDisplayMode ? (
                    <div className="laps-column-header" aria-hidden="true">
                      <span />
                      <span>Laps</span>
                    </div>
                  ) : null}
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
                        ? destinationHeatMap.get(`${originalHeatIndex}-${advancingRank}`)
                        : undefined
                    const isFinalRound = roundIndex === roundStates.length - 1
                    const medalRank =
                      advancingRank >= 1 && advancingRank <= 3 && (destinationHeat !== undefined || isFinalRound)
                        ? advancingRank
                        : 0

                    return (
                      <div
                        key={`${heat.id}-slot-${entrantIndex}-${participant?.id ?? 'unassigned'}`}
                        className={`entrant-row ${isAdvancing ? 'advancing' : ''}`}
                      >
                        <span className="entrant-label">
                          <span>{participant ? participant.name : placeholder}</span>
                          {destinationHeat ? (
                            <span className="next-destination">
                              {roundIndex + 1 === roundStates.length - 1 ? `→ F` : `→ R${roundIndex + 2} H${destinationHeat}`}
                            </span>
                          ) : null}
                        </span>
                        <span className="value-with-medal">
                          {medalRank ? (
                            <span className={`medal-badge medal-${medalRank}`} aria-label={`${medalRank} place`}>
                              {medalRank}
                            </span>
                          ) : null}
                          {isDisplayMode ? (
                            <span className="lap-value">{participant ? currentValue || '-' : '-'}</span>
                          ) : (
                            <input
                              type="number"
                              name={`laps-${round.id}-${heat.id}-${participant?.id ?? `slot-${entrantIndex}`}`}
                              min={0}
                              step={0.25}
                              disabled={!participant}
                              value={currentValue}
                              placeholder={participant ? 'Laps' : '-'}
                              onChange={(event) => participant && onSetLaps(round.id, heat.id, participant.id, event.target.value)}
                            />
                          )}
                        </span>
                      </div>
                    )
                  })}
                  {ranking.hasTie ? <p className="warn">Top qualifying positions must have unique lap totals.</p> : null}
                </section>
              )
            })}
            {roundIndex < roundStates.length - 1 && !round.canAdvance ? (
              <p className="locked">Next round stays locked until all lap totals are valid.</p>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
