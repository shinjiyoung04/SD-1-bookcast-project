import { useEffect, useRef, useState } from 'react'

const PasswordConfirmModal = ({
  open,
  title = '비밀번호 확인',
  message = '',
  password = '',
  onPasswordChange,
  onClose,
  onConfirm,
  loading = false,
  errorMessage = '',
  confirmLabel = '확인',
  danger = false,
}) => {
  const inputRef = useRef(null)

  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowPassword(false)
      return undefined
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 50)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(timer)

      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [loading, onClose, open])

  if (!open) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!password.trim() || loading) {
      return
    }

    onConfirm?.()
  }

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 px-4">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
        className={`w-full max-w-md border-2 border-black p-6 shadow-[6px_6px_0_0] shadow-black ${
          danger ? 'bg-red-50' : 'bg-yellow-50'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="password-modal-title"
              className={`text-2xl font-black ${
                danger ? 'text-red-900' : 'text-gray-950'
              }`}
            >
              {title}
            </h2>

            {message && (
              <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-600">
                {message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-white text-xl font-black disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <label className="mt-6 block">
          <span className="text-sm font-black text-gray-900">
            현재 비밀번호
          </span>

          <div className="relative mt-2">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => onPasswordChange?.(event.target.value)}
              disabled={loading}
              autoComplete="current-password"
              placeholder="현재 비밀번호를 입력하세요"
              className="h-12 w-full border-2 border-black bg-white px-4 pr-14 font-semibold outline-none focus:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              disabled={loading}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-gray-600 transition hover:bg-gray-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>

        {errorMessage && (
          <div className="mt-4 border-2 border-red-300 bg-red-100 px-4 py-3 text-sm font-bold text-red-800">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="border-2 border-black bg-white px-5 py-2.5 text-sm font-black disabled:opacity-50"
          >
            취소
          </button>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className={`border-2 border-black px-5 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none ${
              danger ? 'bg-red-300 text-red-950' : 'bg-yellow-200 text-black'
            }`}
          >
            {loading ? '확인 중...' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
    <path
      d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="2" />
  </svg>
)

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
    <path
      d="M3 3l18 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />

    <path
      d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a15.7 15.7 0 0 1-3 3.7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <path
      d="M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.2-.6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <path
      d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export default PasswordConfirmModal
