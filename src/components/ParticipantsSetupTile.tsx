import { type ChangeEvent } from 'react'

type ParticipantsSetupTileProps = {
  participantsOpen: boolean
  participantLines: string
  onToggleOpen: () => void
  onParticipantLinesChange: (value: string) => void
  onApplyParticipants: () => void
  onImportCsvFromFile: (file: File | undefined) => Promise<void>
}

export const ParticipantsSetupTile = ({
  participantsOpen,
  participantLines,
  onToggleOpen,
  onParticipantLinesChange,
  onApplyParticipants,
  onImportCsvFromFile,
}: ParticipantsSetupTileProps) => {
  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    await onImportCsvFromFile(event.target.files?.[0])
    event.target.value = ''
  }

  return (
    <article className="setup-tile">
      <div className="setup-tile-header">
        <h3>Participants</h3>
        <button type="button" className="ghost" onClick={onToggleOpen}>
          {participantsOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {participantsOpen ? (
        <>
          <label htmlFor="participants" className="participants-label">
            Participants (one per line)
          </label>
          <textarea
            id="participants"
            name="participants"
            rows={8}
            value={participantLines}
            onChange={(event) => onParticipantLinesChange(event.target.value)}
          />
          <div className="io-row">
            <button type="button" onClick={onApplyParticipants}>
              Apply participant list
            </button>
            <label className="file-button">
              Import participants CSV
              <input name="import-participants-csv" type="file" accept=".csv,text/csv" onChange={handleImportCsv} />
            </label>
          </div>
        </>
      ) : null}
    </article>
  )
}
