import { useEffect } from 'react'

type ConfirmApplyModalProps = {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  onExportJson: () => void
}

export const ConfirmApplyModal = ({ open, onConfirm, onCancel, onExportJson }: ConfirmApplyModalProps) => {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Apply changes?</h3>
        <p>Applying these changes will reset all bracket results. You may want to export your current state first.</p>
        <div className="io-row">
          <button type="button" onClick={onExportJson}>
            Export JSON
          </button>
          <button type="button" onClick={onConfirm}>
            Apply
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
