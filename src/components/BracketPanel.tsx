import { evaluateHeatLaps, type RoundState, type TournamentResults } from '../lib/tournament'

type BracketPanelProps = {
  roundStates: RoundState[]
  results: TournamentResults
  isDisplayMode: boolean
  onSetLaps: (roundId: string, heatId: string, participantId: string, value: string) => void
}

export const BracketPanel = ({ roundStates, results, isDisplayMode, onSetLaps }: BracketPanelProps) => (
  <>
    <h2>Bracket</h2>
    <div className="round-lane">
      {roundStates.map((round, roundIndex) => (
        <article key={round.id} className="round-card">
          <header>
            <h3>{round.label}</h3>
            <p>{round.heats.length} heat{ round.heats.length == 1 ? "" : "s" }</p>
          </header>

          {round.messages.map((message) => (
            <p key={message} className="warn">
              {message}
            </p>
          ))}

          {round.heats.map((heat) => {
            const ranking = evaluateHeatLaps(heat, results?.[round.id]?.[heat.id])
            return (
              <section key={heat.id} className="heat-card">
                <h4>
                  {heat.label} · Slots {heat.participantSlots}
                </h4>
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

                  return (
                    <div
                      key={`${heat.id}-slot-${entrantIndex}-${participant?.id ?? 'unassigned'}`}
                      className={`entrant-row ${isAdvancing ? 'advancing' : ''}`}
                    >
                      <span>{participant ? participant.name : placeholder}</span>
                      {isDisplayMode ? (
                        <span className="lap-value">{participant ? currentValue || '-' : '-'}</span>
                      ) : (
                        <input
                          type="number"
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
          })}
          {roundIndex < roundStates.length - 1 && !round.canAdvance ? (
            <p className="locked">Next round stays locked until all lap totals are valid.</p>
          ) : null}
        </article>
      ))}
    </div>
  </>
)
