import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
import useMemberStore from '../../store/useMemberStore'
import {
  approvePromotionRequest,
  getPromotionRequests,
  rejectPromotionRequest,
} from '../../api/promotionApi'

const STATUS_INFO = {
  PENDING: {
    label: '승인 대기',
    className: 'border-yellow-300 bg-yellow-100 text-yellow-800',
  },
  APPROVED: {
    label: '승인 완료',
    className: 'border-green-300 bg-green-100 text-green-800',
  },
  REJECTED: {
    label: '반려',
    className: 'border-red-300 bg-red-100 text-red-800',
  },
  CANCELED: {
    label: '신청 취소',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
  CANCELLED: {
    label: '신청 취소',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
}

const createEmptyDecisionModal = () => ({
  open: false,
  action: 'approve',
  request: null,
  comment: '',
})

const normalizeRole = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

const normalizeStatus = (value) => {
  const status = String(value ?? '')
    .trim()
    .toUpperCase()

  return status === 'CANCELLED' ? 'CANCELED' : status
}

const getRequestArray = (data) => {
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.content)) {
    return data.content
  }

  if (Array.isArray(data?.items)) {
    return data.items
  }

  if (Array.isArray(data?.data)) {
    return data.data
  }

  return []
}

const getErrorMessage = (error, fallbackMessage) => {
  const responseData = error.response?.data

  if (typeof responseData === 'string') {
    return responseData
  }

  return (
    responseData?.message ||
    responseData?.detail ||
    responseData?.error ||
    fallbackMessage
  )
}

const formatDate = (value) => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const PromotionManagePage = () => {
  const navigate = useNavigate()

  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user

  const masterAdminId =
    loginUser?.userId ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const currentRole = normalizeRole(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority,
  )

  const isMasterAdmin = currentRole === 'MASTER_ADMIN'

  const [status, setStatus] = useState('PENDING')

  const [requests, setRequests] = useState([])

  const [loading, setLoading] = useState(true)

  const [errorMessage, setErrorMessage] = useState('')

  const [processingId, setProcessingId] = useState(null)

  const [decisionModal, setDecisionModal] = useState(createEmptyDecisionModal)

  const [noticeModal, setNoticeModal] = useState(null)

  const showNotice = (type, message, callbackFn = null) => {
    setNoticeModal({
      type,
      message,
      callbackFn,
    })
  }

  const closeNotice = () => {
    setNoticeModal(null)
  }

  const loadRequests = useCallback(async () => {
    if (!masterAdminId || !isMasterAdmin) {
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const result = await getPromotionRequests(masterAdminId, status)

      setRequests(getRequestArray(result))
    } catch (error) {
      console.error('[PromotionManagePage] 목록 조회 오류:', error)

      console.error('[PromotionManagePage] 서버 응답:', error.response?.data)

      setRequests([])

      setErrorMessage(
        getErrorMessage(error, '등업 신청 목록 조회에 실패했습니다.'),
      )
    } finally {
      setLoading(false)
    }
  }, [isMasterAdmin, masterAdminId, status])

  useEffect(() => {
    if (!loginUser) {
      navigate('/member/login', {
        replace: true,
      })

      return
    }

    if (!isMasterAdmin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoticeModal((current) => {
        if (current) {
          return current
        }

        return {
          type: 'error',
          message:
            '최고 관리자만 관리자 등업 신청 관리 페이지에 접근할 수 있습니다.',
          callbackFn: () =>
            navigate('/', {
              replace: true,
            }),
        }
      })

      return
    }

    loadRequests()
  }, [isMasterAdmin, loadRequests, loginUser, navigate])

  const pendingCount = useMemo(
    () =>
      requests.filter(
        (request) => normalizeStatus(request.status) === 'PENDING',
      ).length,
    [requests],
  )

  const openDecisionModal = (request, action) => {
    if (processingId !== null) {
      return
    }

    setDecisionModal({
      open: true,
      action,
      request,
      comment: '',
    })
  }

  const closeDecisionModal = () => {
    if (processingId !== null) {
      return
    }

    setDecisionModal(createEmptyDecisionModal())
  }

  const handleCommentChange = (event) => {
    setDecisionModal((previous) => ({
      ...previous,
      comment: event.target.value,
    }))
  }

  const submitDecision = async () => {
    const { request, action, comment } = decisionModal

    if (!request) {
      return
    }

    const trimmedComment = comment.trim()

    const isApprove = action === 'approve'

    if (!isApprove && !trimmedComment) {
      showNotice('error', '반려 사유를 입력해주세요.')

      return
    }

    setProcessingId(request.requestId)

    try {
      if (isApprove) {
        await approvePromotionRequest(
          request.requestId,
          masterAdminId,
          trimmedComment,
        )

        setDecisionModal(createEmptyDecisionModal())

        await loadRequests()

        showNotice(
          'success',
          `${request.name || request.loginId} 사용자에게 관리자 권한을 부여했습니다.`,
        )
      } else {
        await rejectPromotionRequest(
          request.requestId,
          masterAdminId,
          trimmedComment,
        )

        setDecisionModal(createEmptyDecisionModal())

        await loadRequests()

        showNotice(
          'success',
          `${request.name || request.loginId} 사용자의 등업 신청을 반려했습니다.`,
        )
      }
    } catch (error) {
      console.error('[PromotionManagePage] 신청 처리 오류:', error)

      console.error('[PromotionManagePage] 서버 응답:', error.response?.data)

      showNotice(
        'error',
        getErrorMessage(
          error,
          isApprove
            ? '관리자 등업 승인에 실패했습니다.'
            : '등업 신청 반려에 실패했습니다.',
        ),
      )
    } finally {
      setProcessingId(null)
    }
  }

  if (!loginUser) {
    return null
  }

  if (!isMasterAdmin) {
    return (
      <BasicLayout>
        <main className="min-h-[calc(100vh-160px)] bg-gray-50" />

        {noticeModal && (
          <AlertModal
            type={noticeModal.type}
            message={noticeModal.message}
            onClose={closeNotice}
            callbackFn={noticeModal.callbackFn}
          />
        )}
      </BasicLayout>
    )
  }

  const isApproveDecision = decisionModal.action === 'approve'

  const decisionRequest = decisionModal.request

  const decisionProcessing =
    processingId !== null && processingId === decisionRequest?.requestId

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black sm:p-8">
            <div className="flex flex-col gap-5 border-b-2 border-black pb-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black">관리자 등업 신청 관리</h1>

                  <span className="rounded-full border border-purple-300 bg-purple-100 px-3 py-1 text-xs font-black text-purple-800">
                    최고 관리자
                  </span>
                </div>

                <p className="mt-2 text-gray-600">
                  일반 사용자의 등업 신청을 승인하거나 반려합니다.
                </p>

                {status === 'PENDING' && (
                  <p className="mt-2 text-sm font-bold text-yellow-700">
                    현재 승인 대기 {pendingCount}건
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  disabled={processingId !== null}
                  className="border-2 border-black bg-white px-4 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="PENDING">승인 대기</option>

                  <option value="APPROVED">승인 완료</option>

                  <option value="REJECTED">반려</option>

                  <option value="CANCELED">취소</option>

                  <option value="">전체</option>
                </select>

                <button
                  type="button"
                  onClick={loadRequests}
                  disabled={loading || processingId !== null}
                  className="border-2 border-black bg-yellow-200 px-4 py-2 font-black shadow-[3px_3px_0_0] shadow-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  새로고침
                </button>
              </div>
            </div>

            {loading && (
              <div className="py-16 text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

                <p className="mt-4 font-bold">신청 목록을 불러오는 중입니다.</p>
              </div>
            )}

            {!loading && errorMessage && (
              <div className="mt-8 border-2 border-red-300 bg-red-50 p-8 text-center">
                <p className="font-black text-red-800">{errorMessage}</p>

                <button
                  type="button"
                  onClick={loadRequests}
                  className="mt-4 border-2 border-black bg-white px-4 py-2 font-bold"
                >
                  다시 시도
                </button>
              </div>
            )}

            {!loading && !errorMessage && requests.length === 0 && (
              <div className="mt-8 border-2 border-dashed border-gray-300 bg-gray-50 p-14 text-center">
                <p className="font-black text-gray-700">
                  조회된 등업 신청이 없습니다.
                </p>
              </div>
            )}

            {!loading && !errorMessage && requests.length > 0 && (
              <div className="mt-8 overflow-x-auto">
                <table className="w-full min-w-337.5 border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      {[
                        '신청자',
                        '도서관',
                        '부서 / 업무',
                        '사번',
                        '연락처',
                        '신청 사유',
                        '신청 일시',
                        '상태',
                        '관리자 의견',
                        '처리',
                      ].map((header) => (
                        <th
                          key={header}
                          className="border-2 border-black p-3 text-left"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {requests.map((request) => {
                      const requestStatus = normalizeStatus(request.status)

                      const statusInfo = STATUS_INFO[requestStatus] || {
                        label: requestStatus || '상태 확인 중',
                        className: 'border-gray-300 bg-gray-100 text-gray-700',
                      }

                      const processing = processingId === request.requestId

                      return (
                        <tr
                          key={request.requestId}
                          className="align-top hover:bg-yellow-50"
                        >
                          <td className="border-2 border-black p-3">
                            <p className="font-black">{request.name || '-'}</p>

                            <p className="mt-1 text-gray-500">
                              {request.loginId || '-'}
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              {request.email || '-'}
                            </p>
                          </td>

                          <td className="border-2 border-black p-3">
                            <p className="font-bold">{request.libraryName}</p>

                            <p className="mt-1 text-xs text-gray-500">
                              코드: {request.libraryCode}
                            </p>
                          </td>

                          <td className="border-2 border-black p-3">
                            {request.department}
                          </td>

                          <td className="border-2 border-black p-3">
                            {request.employeeNumber}
                          </td>

                          <td className="border-2 border-black p-3">
                            {request.contact}
                          </td>

                          <td className="max-w-xs whitespace-pre-wrap border-2 border-black p-3 leading-6">
                            {request.reason}
                          </td>

                          <td className="border-2 border-black p-3">
                            {formatDate(request.createdAt)}

                            {request.processedAt && (
                              <p className="mt-2 text-xs text-gray-500">
                                처리: {formatDate(request.processedAt)}
                              </p>
                            )}
                          </td>

                          <td className="border-2 border-black p-3">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusInfo.className}`}
                            >
                              {statusInfo.label}
                            </span>
                          </td>

                          <td className="max-w-xs whitespace-pre-wrap border-2 border-black p-3">
                            {request.masterComment || '-'}
                          </td>

                          <td className="border-2 border-black p-3">
                            {requestStatus === 'PENDING' ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDecisionModal(request, 'approve')
                                  }
                                  disabled={processingId !== null}
                                  className="border-2 border-black bg-green-200 px-3 py-2 font-bold shadow-[2px_2px_0_0] shadow-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {processing ? '처리 중' : '승인'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openDecisionModal(request, 'reject')
                                  }
                                  disabled={processingId !== null}
                                  className="border-2 border-black bg-red-200 px-3 py-2 font-bold shadow-[2px_2px_0_0] shadow-black transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  반려
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-500">처리 완료</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {decisionModal.open && decisionRequest && (
        <AlertModal
          type={isApproveDecision ? 'success' : 'error'}
          message={
            isApproveDecision
              ? `${decisionRequest.name || decisionRequest.loginId} 사용자를 도서관 관리자로 승인하시겠습니까?`
              : `${decisionRequest.name || decisionRequest.loginId} 사용자의 등업 신청을 반려하시겠습니까?`
          }
          onClose={closeDecisionModal}
          onConfirm={submitDecision}
          confirmLabel={isApproveDecision ? '승인하기' : '반려하기'}
          cancelLabel="취소"
          loading={decisionProcessing}
          confirmDisabled={!isApproveDecision && !decisionModal.comment.trim()}
        >
          <div className="rounded-xl border-2 border-black/20 bg-white/70 p-4 text-sm text-black">
            <dl className="grid gap-2">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-black">신청자</dt>

                <dd className="min-w-0 wrap-break-word">
                  {decisionRequest.name || '-'}
                  {' / '}
                  {decisionRequest.loginId || '-'}
                </dd>
              </div>

              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-black">도서관</dt>

                <dd className="min-w-0 wrap-break-word">
                  {decisionRequest.libraryName}
                </dd>
              </div>

              <div className="flex gap-2">
                <dt className="w-24 shrink-0 font-black">도서관 코드</dt>

                <dd>{decisionRequest.libraryCode}</dd>
              </div>
            </dl>
          </div>

          <label className="mt-4 block">
            <span className="font-black text-black">
              {isApproveDecision ? '승인 의견' : '반려 사유'}
            </span>

            <span className="ml-2 text-xs font-semibold text-black/60">
              {isApproveDecision ? '선택 입력' : '필수 입력'}
            </span>

            <textarea
              value={decisionModal.comment}
              onChange={handleCommentChange}
              disabled={decisionProcessing}
              rows="5"
              maxLength="1000"
              placeholder={
                isApproveDecision
                  ? '신청자에게 전달할 승인 의견을 입력하세요.'
                  : '신청자에게 전달할 반려 사유를 입력하세요.'
              }
              className="mt-2 w-full resize-y border-2 border-black bg-white px-3 py-2 text-sm text-black outline-none focus:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <div className="mt-1 flex justify-between text-xs font-semibold text-black/60">
              <span>
                {isApproveDecision
                  ? '입력하지 않아도 승인할 수 있습니다.'
                  : '반려 사유는 신청자에게 표시됩니다.'}
              </span>

              <span>
                {decisionModal.comment.length}
                /1000
              </span>
            </div>
          </label>

          {isApproveDecision && (
            <p className="mt-4 border-l-4 border-green-700 bg-white/70 px-3 py-2 text-sm font-bold text-green-900">
              승인하면 해당 사용자의 역할이 즉시 ADMIN으로 변경됩니다.
            </p>
          )}
        </AlertModal>
      )}

      {noticeModal && (
        <AlertModal
          type={noticeModal.type}
          message={noticeModal.message}
          onClose={closeNotice}
          callbackFn={noticeModal.callbackFn}
        />
      )}
    </BasicLayout>
  )
}

export default PromotionManagePage
