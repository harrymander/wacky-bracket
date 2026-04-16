import { type ChangeEvent } from 'react'
import { type RoundConfig } from '../lib/tournament'
import { ParticipantsSetupTile } from './ParticipantsSetupTile'
import { RoundsSetupTile } from './RoundsSetupTile'

type SetupPanelProps = {
  rounds: RoundConfig[]
  participantLines: string
  participantsOpen: boolean
  roundsOpen: boolean
  statusMessage: string
  errors: string[]
  onExportJson: () => void
  onImportJsonFromFile: (file: File | undefined) => Promise<void>
  onResetState: () => void
  onOpenDisplayPopout: () => void
  onToggleParticipantsOpen: () => void
  onToggleRoundsOpen: () => void
  onParticipantLinesChange: (value: string) => void
  onApplyParticipants: () => void
  onImportCsvFromFile: (file: File | undefined) => Promise<void>
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

export const SetupPanel = ({
  rounds,
  participantLines,
  participantsOpen,
  roundsOpen,
  statusMessage,
  errors,
  onExportJson,
  onImportJsonFromFile,
  onResetState,
  onOpenDisplayPopout,
  onToggleParticipantsOpen,
  onToggleRoundsOpen,
  onParticipantLinesChange,
  onApplyParticipants,
  onImportCsvFromFile,
  onAddRound,
  onRemoveRound,
  onAddHeat,
  onRemoveHeat,
  onUpdateRoundLabel,
  onUpdateHeat,
}: SetupPanelProps) => {
  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    await onImportJsonFromFile(event.target.files?.[0])
    event.target.value = ''
  }

  return (
    <>
      <h2>Setup</h2>
      <div className="io-row">
        <button type="button" onClick={onExportJson}>
          Export JSON
        </button>
        <label className="file-button">
          Import JSON
          <input name="import-json-file" type="file" accept="application/json" onChange={handleImportJson} />
        </label>
        <button type="button" className="ghost" onClick={onResetState}>
          Reset
        </button>
        <button type="button" className="ghost" onClick={onOpenDisplayPopout}>
          Open display popout
        </button>
      </div>

      <ParticipantsSetupTile
        participantsOpen={participantsOpen}
        participantLines={participantLines}
        onToggleOpen={onToggleParticipantsOpen}
        onParticipantLinesChange={onParticipantLinesChange}
        onApplyParticipants={onApplyParticipants}
        onImportCsvFromFile={onImportCsvFromFile}
      />

      <RoundsSetupTile
        roundsOpen={roundsOpen}
        rounds={rounds}
        onToggleOpen={onToggleRoundsOpen}
        onAddRound={onAddRound}
        onRemoveRound={onRemoveRound}
        onAddHeat={onAddHeat}
        onRemoveHeat={onRemoveHeat}
        onUpdateRoundLabel={onUpdateRoundLabel}
        onUpdateHeat={onUpdateHeat}
      />

      {statusMessage ? <p className="status">{statusMessage}</p> : null}
      {errors.length > 0 ? (
        <div className="errors">
          <h3>Configuration issues</h3>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="ok">Configuration is valid.</p>
      )}
    </>
  )
}
