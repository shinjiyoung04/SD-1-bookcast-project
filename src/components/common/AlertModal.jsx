const icons = {
  info: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="mt-0.5 size-4 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z"
        clipRule="evenodd"
      />
    </svg>
  ),

  success: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="mt-0.5 size-4 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  ),

  error: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="mt-0.5 size-4 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  ),
}

const styles = {
  info: 'bg-blue-100 text-blue-900',
  success: 'bg-green-100 text-green-900',
  error: 'bg-red-100 text-red-900',
}

const AlertModal = ({
  type = 'info',
  message = '',
  children = null,
  onClose,
  callbackFn,
  onConfirm,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmDisabled = false,
  loading = false,
}) => {
  const currentType = styles[type] ? type : 'info'
  const isConfirmMode = typeof onConfirm === 'function'

  const handleClose = () => {
    if (loading) {
      return
    }

    if (onClose) {
      onClose()
    }

    if (!isConfirmMode && callbackFn) {
      callbackFn()
    }
  }

  const handleConfirm = () => {
    if (loading || confirmDisabled) {
      return
    }

    if (isConfirmMode) {
      onConfirm()
      return
    }

    handleClose()
  }

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 px-4">
      <div
        role={isConfirmMode ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        className={`w-full max-w-md border-2 border-black p-5 shadow-[5px_5px_0_0] shadow-black ${styles[currentType]}`}
      >
        <div className="flex items-start gap-3">
          {icons[currentType]}

          <strong className="block flex-1 whitespace-pre-wrap leading-6 font-semibold">
            {message}
          </strong>
        </div>

        {children && <div className="mt-5">{children}</div>}

        <div className="mt-6 flex justify-end gap-3">
          {isConfirmMode && (
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="border-2 border-current bg-white px-4 py-2 text-sm font-semibold text-black shadow-[2px_2px_0_0] shadow-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            className={`border-2 border-current px-4 py-2 text-sm font-semibold shadow-[2px_2px_0_0] shadow-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 ${
              isConfirmMode ? 'bg-yellow-200 text-black' : 'bg-white text-black'
            }`}
          >
            {loading ? '처리 중...' : isConfirmMode ? confirmLabel : '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AlertModal
