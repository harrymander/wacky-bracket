import { useEffect } from 'react'

type ConfirmModalProps = {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  onExportJson: () => void
}

export const ConfirmModal = ({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  onExportJson,
}: ConfirmModalProps) => {
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
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="io-row">
          <button type="button" onClick={onExportJson}>
            Export JSON
          </button>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
