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
          <div className="round-controls-head">
            <div className="io-row">
              <button type="button" onClick={onAddRound}>
                Add round
              </button>
              <button type="button" className="ghost" onClick={onRemoveRound}>
                Remove last round
              </button>
            </div>
          </div>

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
            <div className="io-row">
              <button type="button" onClick={() => onAddHeat(roundIndex)}>
                Add heat
              </button>
            </div>

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
                <button
                  type="button"
                  className="ghost"
                  disabled={round.heats.length <= 1}
                  onClick={() => onRemoveHeat(roundIndex, heatIndex)}
                >
                  Remove heat
                </button>
              </div>
            ))}
          </article>
          ))}
        </>
      ) : null}
    </article>
  )
}
