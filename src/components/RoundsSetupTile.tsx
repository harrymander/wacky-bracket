import { type RoundConfig, totalRoundOutgoing, totalRoundSlots } from '../lib/tournament'

type RoundsSetupTileProps = {
  roundsOpen: boolean
  rounds: RoundConfig[]
  onToggleOpen: () => void
  onAddRound: () => void
  onRemoveRound: () => void
  onAddHeat: (roundIndex: number) => void
  onRemoveHeat: (roundIndex: number, heatIndex: number) => void
  onUpdateRoundLabel: (roundIndex: number, value: string) => void
  onUpdateHeat: (
    roundIndex: number,
    heatIndex: number,
    field: 'participantSlots' | 'advanceCount',
    value: string,
  ) => void
}

export const RoundsSetupTile = ({
  roundsOpen,
  rounds,
  onToggleOpen,
  onAddRound,
  onRemoveRound,
  onAddHeat,
  onRemoveHeat,
  onUpdateRoundLabel,
  onUpdateHeat,
}: RoundsSetupTileProps) => {
  const configurableRounds = rounds.slice(0, -1)
  const finalRound = rounds[rounds.length - 1]
  const finalParticipants = finalRound ? totalRoundSlots(finalRound) : 0

  return (
    <article className="setup-tile">
      <div className="setup-tile-header">
        <h3>Rounds</h3>
        <button type="button" className="ghost" onClick={onToggleOpen}>
          {roundsOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {roundsOpen ? (
        <>
          {configurableRounds.map((round, roundIndex) => (
            <article key={round.id} className="round-config-card">
              <label className="round-name-field">
                Round name
                <input
                  className="round-name-input"
                  type="text"
                  name={`round-${roundIndex + 1}-name`}
                  value={round.label}
                  onChange={(event) => onUpdateRoundLabel(roundIndex, event.target.value)}
                  placeholder={`Round ${roundIndex + 1}`}
                />
              </label>
              <p className="hint">
                Incoming slots: {totalRoundSlots(round)} · Outgoing qualifiers: {totalRoundOutgoing(round)}
              </p>
              {round.heats.map((heat, heatIndex) => (
                <div key={heat.id} className="heat-config-row">
                  <strong>{heat.label}</strong>
                  <label>
                    Participants
                    <input
                      type="number"
                      name={`round-${roundIndex + 1}-heat-${heatIndex + 1}-participants`}
                      min={1}
                      value={heat.participantSlots}
                      onChange={(event) => onUpdateHeat(roundIndex, heatIndex, 'participantSlots', event.target.value)}
                    />
                  </label>
                  <label>
                    Advance
                    <input
                      type="number"
                      name={`round-${roundIndex + 1}-heat-${heatIndex + 1}-advance`}
                      min={1}
                      value={heat.advanceCount}
                      disabled={roundIndex === rounds.length - 1}
                      onChange={(event) => onUpdateHeat(roundIndex, heatIndex, 'advanceCount', event.target.value)}
                    />
                  </label>
                  {round.heats.length > 1 ? (
                    <button type="button" className="ghost" onClick={() => onRemoveHeat(roundIndex, heatIndex)}>
                      Remove heat
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="io-row">
                <button type="button" onClick={() => onAddHeat(roundIndex)}>
                  Add heat
                </button>
              </div>
            </article>
          ))}
          <article className="round-config-card">
            <strong>Final</strong>
            <p className="hint">Participants (auto-derived): {finalParticipants}</p>
          </article>
          <div className="round-controls-head">
            <div className="io-row">
              <button type="button" onClick={onAddRound}>
                Add round
              </button>
              {configurableRounds.length > 1 ? (
                <button type="button" className="ghost" onClick={onRemoveRound}>
                  Remove last round
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </article>
  )
}
