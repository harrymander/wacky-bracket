import { type ChangeEvent } from 'react'
import { type RoundConfig } from '../lib/tournament'
import { ConfirmApplyModal } from './ConfirmApplyModal'
import { ParticipantsSetupTile } from './ParticipantsSetupTile'
import { RoundsSetupTile } from './RoundsSetupTile'

type SetupPanelProps = {
  draftRounds: RoundConfig[]
  participantLines: string
  participantsOpen: boolean
  roundsOpen: boolean
  statusMessage: string
  errors: string[]
  hasPendingChanges: boolean
  confirmModalOpen: boolean
  onExportJson: () => void
  onImportJsonFromFile: (file: File | undefined) => Promise<void>
  onResetState: () => void
  onToggleParticipantsOpen: () => void
  onToggleRoundsOpen: () => void
  onParticipantLinesChange: (value: string) => void
  onImportCsvFromFile: (file: File | undefined) => Promise<void>
  onRequestApply: () => void
  onConfirmApply: () => void
  onRevertDrafts: () => void
  onCancelApply: () => void
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
  draftRounds,
  participantLines,
  participantsOpen,
  roundsOpen,
  statusMessage,
  errors,
  hasPendingChanges,
  confirmModalOpen,
  onExportJson,
  onImportJsonFromFile,
  onResetState,
  onToggleParticipantsOpen,
  onToggleRoundsOpen,
  onParticipantLinesChange,
  onImportCsvFromFile,
  onRequestApply,
  onConfirmApply,
  onRevertDrafts,
  onCancelApply,
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
      </div>

      <ParticipantsSetupTile
        participantsOpen={participantsOpen}
        participantLines={participantLines}
        onToggleOpen={onToggleParticipantsOpen}
        onParticipantLinesChange={onParticipantLinesChange}
        onImportCsvFromFile={onImportCsvFromFile}
      />

      <RoundsSetupTile
        roundsOpen={roundsOpen}
        rounds={draftRounds}
        onToggleOpen={onToggleRoundsOpen}
        onAddRound={onAddRound}
        onRemoveRound={onRemoveRound}
        onAddHeat={onAddHeat}
        onRemoveHeat={onRemoveHeat}
        onUpdateRoundLabel={onUpdateRoundLabel}
        onUpdateHeat={onUpdateHeat}
      />

      <div className="io-row">
        <button type="button" disabled={!hasPendingChanges || errors.length > 0} onClick={onRequestApply}>
          Apply
        </button>
        <button type="button" className="ghost" disabled={!hasPendingChanges} onClick={onRevertDrafts}>
          Revert
        </button>
      </div>

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

      <ConfirmApplyModal
        open={confirmModalOpen}
        onConfirm={onConfirmApply}
        onCancel={onCancelApply}
        onExportJson={onExportJson}
      />
    </>
  )
}
