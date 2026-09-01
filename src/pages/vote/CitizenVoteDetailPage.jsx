import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
import useMemberStore from '../../store/useMemberStore'
import {
  cancelCitizenVoteApplication,
  getCitizenVoteDetail,
  requestCitizenVotePrediction,
  toggleCitizenVote,
} from '../../api/citizenVoteApi'
import { getExternalBookDetail } from '../../api/externalBookApi'
import { decideAdminApplication } from '../../api/adminApi'

const ROLE_INFO = {
  USER: '일반 사용자',
  ADMIN: '도서관 관리자',
  MASTER_ADMIN: '최고 관리자',
}

const STATUS_INFO = {
  PENDING: {
    label: '승인 대기',
    description: '시민 공감 투표와 담당 도서관의 검토가 진행 중입니다.',
    badgeClass: 'border-amber-400 bg-amber-100 text-amber-900',
    panelClass: 'border-amber-400 bg-amber-50 text-amber-950',
  },
  REVIEWING: {
    label: '심사 중',
    description: '담당 관리자가 신청 정보와 수요 자료를 검토하고 있습니다.',
    badgeClass: 'border-blue-400 bg-blue-100 text-blue-900',
    panelClass: 'border-blue-400 bg-blue-50 text-blue-950',
  },
  APPROVED: {
    label: '승인 완료',
    description: '희망도서 신청이 승인되어 구입 절차로 넘어갔습니다.',
    badgeClass: 'border-green-500 bg-green-100 text-green-900',
    panelClass: 'border-green-500 bg-green-50 text-green-950',
  },
  REJECTED: {
    label: '승인 거절',
    description: '담당 관리자의 검토 결과 희망도서 신청이 거절되었습니다.',
    badgeClass: 'border-red-500 bg-red-100 text-red-900',
    panelClass: 'border-red-500 bg-red-50 text-red-950',
  },
  CANCELED: {
    label: '신청 취소',
    description: '신청자가 희망도서 신청을 취소했습니다.',
    badgeClass: 'border-gray-400 bg-gray-100 text-gray-700',
    panelClass: 'border-gray-400 bg-gray-50 text-gray-800',
  },
}

const normalizeRole = (value) => {
  const role = String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  return ROLE_INFO[role] ? role : 'USER'
}

const normalizeStatus = (value) => {
  const status = String(value ?? 'PENDING')
    .trim()
    .toUpperCase()

  if (status === 'CANCELLED') return 'CANCELED'
  return STATUS_INFO[status] ? status : 'PENDING'
}

const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data

  return (
    data?.message || data?.detail || data?.error || error?.message || fallback
  )
}

const formatDate = (value, withTime = false) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const clampPercent = (value) => {
  const number = toNullableNumber(value)
  return number === null ? null : Math.max(0, Math.min(100, number))
}

const RAW_API_SERVER_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api'

const API_SERVER_ORIGIN = RAW_API_SERVER_URL.replace(/\/+$/, '').replace(
  /\/api$/,
  '',
)

const resolveImageUrl = (value) => {
  const url = String(value ?? '').trim()

  if (!url) {
    return ''
  }

  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url
  }

  if (url.startsWith('//')) {
    return `${window.location.protocol}${url}`
  }

  return `${API_SERVER_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

const extractThumbnailUrl = (book) =>
  resolveImageUrl(
    book?.thumbnailUrl ??
      book?.thumbnail_url ??
      book?.imageUrl ??
      book?.image_url ??
      book?.image ??
      book?.cover ??
      book?.coverUrl ??
      book?.cover_url ??
      book?.coverLargeUrl ??
      book?.cover_large_url ??
      '',
  )

const normalizePrediction = (detail) => {
  const prediction = detail?.prediction || {}
  const predictionId = prediction?.predictionId ?? detail?.predictionId ?? null

  return {
    predictionId,
    status: String(
      prediction?.status ??
        detail?.predictionStatus ??
        (predictionId ? 'READY' : 'PENDING'),
    )
      .trim()
      .toUpperCase(),
    approvalProbability: clampPercent(
      prediction?.approvalProbability ?? detail?.approvalProbability,
    ),
    popularityScore: clampPercent(
      prediction?.popularityScore ?? detail?.popularityScore,
    ),
    voteAdjustment: toNullableNumber(
      prediction?.voteAdjustment ?? detail?.voteAdjustment,
    ),
    finalScore: toNullableNumber(prediction?.finalScore ?? detail?.finalScore),
    modelVersion: prediction?.modelVersion ?? detail?.modelVersion ?? '',
    predictedAt: prediction?.predictedAt ?? detail?.predictedAt ?? null,
  }
}

const CitizenVoteDetailPage = () => {
  const navigate = useNavigate()
  const { applicationId } = useParams()
  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user
  const userId =
    loginUser?.userId ??
    loginUser?.user_id ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const role = normalizeRole(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority,
  )
  const isAdmin = role === 'ADMIN' || role === 'MASTER_ADMIN'
  const numericApplicationId = Number(applicationId)

  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [noticeModal, setNoticeModal] = useState(null)
  const [externalThumbnailUrl, setExternalThumbnailUrl] = useState('')
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [predictionLoading, setPredictionLoading] = useState(false)
  const [predictionError, setPredictionError] = useState('')
  const [decisionComment, setDecisionComment] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [decisionType, setDecisionType] = useState(null)

  const predictionRequestRef = useRef(null)

  const loadDetail = useCallback(async () => {
    if (
      !userId ||
      !Number.isInteger(numericApplicationId) ||
      numericApplicationId <= 0
    ) {
      return
    }

    setLoading(true)
    setErrorMessage('')
    setExternalThumbnailUrl('')
    setPredictionError('')
    predictionRequestRef.current = null

    try {
      const response = await getCitizenVoteDetail({
        requesterUserId: userId,
        applicationId: numericApplicationId,
      })

      setDetail(response)
      setDecisionComment(response?.adminComment || '')
    } catch (error) {
      console.error('[CitizenVoteDetailPage] 상세 조회 실패:', error)
      setDetail(null)
      setErrorMessage(
        getErrorMessage(error, '시민투표 상세정보를 불러오지 못했습니다.'),
      )
    } finally {
      setLoading(false)
    }
  }, [numericApplicationId, userId])

  const runPrediction = useCallback(
    async ({ force = false } = {}) => {
      if (
        !userId ||
        !Number.isInteger(numericApplicationId) ||
        numericApplicationId <= 0
      ) {
        return null
      }

      setPredictionLoading(true)
      setPredictionError('')

      try {
        const response = await requestCitizenVotePrediction({
          requesterUserId: userId,
          applicationId: numericApplicationId,
          force,
        })

        setDetail(response)

        return response
      } catch (error) {
        console.error(
          '[CitizenVoteDetailPage] AI 예상 승인율 계산 실패:',
          error,
        )

        setPredictionError(
          getErrorMessage(error, 'AI 예상 승인율을 계산하지 못했습니다.'),
        )

        return null
      } finally {
        setPredictionLoading(false)
      }
    },
    [numericApplicationId, userId],
  )

  useEffect(() => {
    if (!loginUser) {
      navigate('/member/login', {
        replace: true,
        state: { redirectTo: `/citizen-votes/${applicationId}` },
      })
      return
    }

    if (!Number.isInteger(numericApplicationId) || numericApplicationId <= 0) {
      navigate('/citizen-votes', { replace: true })
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDetail()
  }, [applicationId, loadDetail, loginUser, navigate, numericApplicationId])

  useEffect(() => {
    const predictionStatus = String(detail?.prediction?.status ?? 'PENDING')
      .trim()
      .toUpperCase()

    const predictionModelVersion = detail?.prediction?.modelVersion ?? ''

    const currentRequestKey = `${numericApplicationId}:library-ai-v4.1-dynamic-library-20260722-v3`

    const needsPrediction =
      Boolean(detail) &&
      (predictionStatus !== 'READY' ||
        predictionModelVersion !==
          'library-ai-v4.1-dynamic-library-20260722-v3')

    if (
      !needsPrediction ||
      predictionLoading ||
      predictionRequestRef.current === currentRequestKey
    ) {
      return
    }

    predictionRequestRef.current = currentRequestKey
    runPrediction()
  }, [detail, numericApplicationId, predictionLoading, runPrediction])

  /*
   * 백엔드 응답에 썸네일이 없을 때만 ISBN 기반 외부 도서 상세 API를
   * 한 번 호출하여 표지를 보완
   */
  useEffect(() => {
    const backendThumbnailUrl = extractThumbnailUrl(detail)
    const isbn = String(detail?.isbn ?? '').trim()

    if (backendThumbnailUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExternalThumbnailUrl('')
      setThumbnailLoading(false)
      return undefined
    }

    if (!isbn) {
      setExternalThumbnailUrl('')
      setThumbnailLoading(false)
      return undefined
    }

    let cancelled = false

    const loadExternalThumbnail = async () => {
      setThumbnailLoading(true)

      try {
        const externalBook = await getExternalBookDetail({
          isbn13: isbn,
          provider: 'ALL',
        })

        if (cancelled) {
          return
        }

        setExternalThumbnailUrl(extractThumbnailUrl(externalBook))
      } catch (error) {
        if (!cancelled) {
          console.warn(
            '[CitizenVoteDetailPage] 외부 도서 썸네일 보완 실패:',
            error,
          )

          setExternalThumbnailUrl('')
        }
      } finally {
        if (!cancelled) {
          setThumbnailLoading(false)
        }
      }
    }

    loadExternalThumbnail()

    return () => {
      cancelled = true
    }
  }, [detail])

  const resolvedThumbnailUrl =
    extractThumbnailUrl(detail) || externalThumbnailUrl

  const status = normalizeStatus(detail?.status)
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.PENDING
  const prediction = useMemo(() => normalizePrediction(detail), [detail])

  const canManageApplication = Boolean(detail) && isAdmin

  const canDecideApplication = canManageApplication && status === 'PENDING'

  const popularityMetric = useMemo(() => {
    if (prediction.status === 'READY' && prediction.popularityScore !== null) {
      return {
        value: `${Math.round(prediction.popularityScore)}%`,
        label: 'AI 도서 인기도',
        description: 'AI 모델이 계산한 현재 도서 수요 점수입니다.',
      }
    }

    const popularityIndex = toNullableNumber(detail?.popularityIndex)

    return {
      value: popularityIndex === null ? '-' : `${popularityIndex.toFixed(1)}점`,
      label: '시민 관심도',
      description: '누적 공감, 최근 7일 공감, 신청 경과시간 기반 지수입니다.',
    }
  }, [detail?.popularityIndex, prediction.popularityScore, prediction.status])

  const approvalMetric = useMemo(() => {
    if (predictionLoading) {
      return {
        value: '계산 중...',
        description:
          '수매 우선순위 모델과 시민투표를 결합해 예상 승인율을 계산하고 있습니다.',
        pending: true,
      }
    }

    if (
      prediction.status === 'READY' &&
      prediction.approvalProbability !== null
    ) {
      return {
        value: `${Math.round(prediction.approvalProbability)}%`,
        description: prediction.modelVersion
          ? `AI 모델 ${prediction.modelVersion}`
          : 'AI 예상 승인율',
        pending: false,
      }
    }

    if (prediction.status === 'FAILED') {
      return {
        value: '분석 실패',
        description: 'AI 예측 결과를 다시 생성해야 합니다.',
        pending: true,
      }
    }

    return {
      value: '분석 대기',
      description: 'AI 모델 연동 후 예상 승인률이 자동으로 표시됩니다.',
      pending: true,
    }
  }, [prediction, predictionLoading])

  const handleToggleVote = async () => {
    if (!detail?.canVote || actionLoading) return

    setActionLoading(true)

    try {
      const response = await toggleCitizenVote({
        applicationId: numericApplicationId,
        userId,
      })

      setDetail((previous) => ({
        ...previous,
        votedByMe: response.votedByMe,
        voteCount: response.voteCount,
        recentVoteCount7d: response.recentVoteCount7d,
      }))

      predictionRequestRef.current = null

      await runPrediction({
        force: true,
      })

      setNoticeModal({
        type: response.votedByMe ? 'success' : 'info',
        message:
          response.message ||
          (response.votedByMe
            ? '저도 원해요 투표가 반영되었습니다.'
            : '투표가 취소되었습니다.'),
      })
    } catch (error) {
      setNoticeModal({
        type: 'error',
        message: getErrorMessage(error, '투표 처리에 실패했습니다.'),
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelApplication = async () => {
    if (!detail?.canCancel || actionLoading) return

    const confirmed = window.confirm(
      '희망도서 신청을 취소하시겠습니까?\n취소한 신청은 과거 기록에서 확인할 수 있습니다.',
    )

    if (!confirmed) return

    setActionLoading(true)

    try {
      const response = await cancelCitizenVoteApplication({
        requesterUserId: userId,
        applicationId: numericApplicationId,
      })
      setDetail(response)
      setNoticeModal({
        type: 'success',
        message: '희망도서 신청이 취소되었습니다.',
      })
    } catch (error) {
      setNoticeModal({
        type: 'error',
        message: getErrorMessage(error, '희망도서 신청 취소에 실패했습니다.'),
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleAdminDecision = async (decision) => {
    if (!canDecideApplication || decisionLoading) {
      return
    }

    const normalizedDecision = String(decision ?? '')
      .trim()
      .toUpperCase()

    if (
      normalizedDecision !== 'APPROVED' &&
      normalizedDecision !== 'REJECTED'
    ) {
      return
    }

    const trimmedComment = decisionComment.trim()

    if (normalizedDecision === 'REJECTED' && !trimmedComment) {
      setNoticeModal({
        type: 'error',
        message: '반려 처리 시에는 반려 사유를 반드시 입력해주세요.',
      })

      return
    }

    const decisionLabel = normalizedDecision === 'APPROVED' ? '승인' : '반려'

    const confirmed = window.confirm(
      `이 희망도서 신청을 ${decisionLabel} 처리하시겠습니까?`,
    )

    if (!confirmed) {
      return
    }

    setDecisionLoading(true)
    setDecisionType(normalizedDecision)

    try {
      await decideAdminApplication({
        requesterUserId: userId,
        applicationId: numericApplicationId,
        decision: normalizedDecision,
        adminComment: trimmedComment || null,
      })

      const refreshedDetail = await getCitizenVoteDetail({
        requesterUserId: userId,
        applicationId: numericApplicationId,
      })

      setDetail(refreshedDetail)
      setDecisionComment(refreshedDetail?.adminComment || '')

      setNoticeModal({
        type: 'success',
        message:
          normalizedDecision === 'APPROVED'
            ? '희망도서 신청을 승인했습니다.'
            : '희망도서 신청을 반려했습니다.',
      })
    } catch (error) {
      setNoticeModal({
        type: 'error',
        message: getErrorMessage(
          error,
          normalizedDecision === 'APPROVED'
            ? '희망도서 신청 승인에 실패했습니다.'
            : '희망도서 신청 반려에 실패했습니다.',
        ),
      })
    } finally {
      setDecisionLoading(false)
      setDecisionType(null)
    }
  }

  if (!loginUser) return null

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/citizen-votes"
              className="inline-flex h-11 items-center justify-center border-2 border-black bg-white px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
            >
              ← 시민투표 목록
            </Link>

            <span className="border-2 border-black bg-yellow-100 px-4 py-2 text-sm font-black">
              신청번호 #{applicationId}
            </span>
          </div>

          {loading && <LoadingState />}

          {!loading && errorMessage && (
            <ErrorState message={errorMessage} onRetry={loadDetail} />
          )}

          {!loading && !errorMessage && detail && (
            <div className="grid gap-8">
              <section className="overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_0] shadow-black">
                <header className="border-b-2 border-black bg-yellow-200 px-6 py-5 sm:px-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.16em] text-gray-600">
                        CITIZEN VOTE DETAIL
                      </p>
                      <h1 className="mt-1 text-2xl font-black text-gray-950 sm:text-3xl">
                        희망도서 신청 상세
                      </h1>
                    </div>

                    <span
                      className={`w-fit rounded-full border-2 px-4 py-2 text-sm font-black ${statusInfo.badgeClass}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </header>

                <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[250px_minmax(0,1fr)]">
                  <BookCover
                    thumbnailUrl={resolvedThumbnailUrl}
                    title={detail.title}
                    loading={thumbnailLoading}
                  />

                  <div className="min-w-0">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailField
                        label="책 제목"
                        value={detail.title || '도서 제목 없음'}
                        wide
                      />
                      <DetailField
                        label="저자명"
                        value={detail.author || '저자 정보 없음'}
                      />
                      <DetailField
                        label="출판사"
                        value={detail.publisher || '출판사 정보 없음'}
                      />
                      <DetailField
                        label="신청자"
                        value={detail.applicantName || '신청자 정보 비공개'}
                      />
                      <DetailField
                        label="신청 도서관"
                        value={detail.libraryName || '도서관 정보 없음'}
                      />
                      <DetailField
                        label="ISBN"
                        value={detail.isbn || '-'}
                        breakAll
                      />
                      <DetailField
                        label="신청일"
                        value={formatDate(detail.createdAt, true)}
                      />
                      <DetailField
                        label="처리일"
                        value={formatDate(detail.processedAt, true)}
                      />
                    </div>

                    <div className="mt-7 grid gap-4 sm:grid-cols-2">
                      <ScoreCard
                        label={popularityMetric.label}
                        value={popularityMetric.value}
                        description={popularityMetric.description}
                        className="bg-blue-50"
                      />
                      <ScoreCard
                        label="AI 예상 승인율"
                        value={approvalMetric.value}
                        description={approvalMetric.description}
                        className="bg-purple-50"
                        pending={approvalMetric.pending}
                      />
                    </div>

                    <div className="mt-5 grid grid-cols-3 border-2 border-black text-center">
                      <MetricItem
                        label="누적 공감"
                        value={detail.voteCount ?? 0}
                      />
                      <MetricItem
                        label="최근 7일"
                        value={detail.recentVoteCount7d ?? 0}
                      />
                      <MetricItem label="현재 역할" value={ROLE_INFO[role]} />
                    </div>
                  </div>
                </div>
              </section>

              <section
                className={`border-2 p-6 shadow-[5px_5px_0_0] shadow-black ${statusInfo.panelClass}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black tracking-[0.16em]">
                      CURRENT STATUS
                    </p>
                    <h2 className="mt-1 text-2xl font-black">
                      현재 상태 · {statusInfo.label}
                    </h2>
                    <p className="mt-2 text-sm font-semibold leading-6">
                      {statusInfo.description}
                    </p>
                  </div>

                  {detail.isOwner && (
                    <span className="w-fit border-2 border-black bg-white px-3 py-2 text-xs font-black text-gray-900">
                      내가 신청한 도서
                    </span>
                  )}
                </div>

                {detail.adminComment && (
                  <div className="mt-5 border-2 border-black bg-white p-4">
                    <p className="text-xs font-black text-gray-500">
                      관리자 처리 의견
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-800">
                      {detail.adminComment}
                    </p>
                  </div>
                )}
              </section>

              {canManageApplication && (
                <AdminDecisionPanel
                  status={status}
                  libraryName={detail.libraryName}
                  role={role}
                  comment={decisionComment}
                  onCommentChange={setDecisionComment}
                  onApprove={() => handleAdminDecision('APPROVED')}
                  onReject={() => handleAdminDecision('REJECTED')}
                  loading={decisionLoading}
                  decisionType={decisionType}
                  canDecide={canDecideApplication}
                  processedAt={detail.processedAt}
                  savedComment={detail.adminComment}
                />
              )}

              <StatusTimeline
                status={status}
                createdAt={detail.createdAt}
                processedAt={detail.processedAt}
              />

              <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="border-2 border-black bg-white p-6 shadow-[5px_5px_0_0] shadow-black">
                  <p className="text-xs font-black tracking-[0.16em] text-gray-500">
                    REQUEST REASON
                  </p>
                  <h2 className="mt-1 text-2xl font-black">신청 사유</h2>
                  <p className="mt-5 whitespace-pre-wrap text-sm font-semibold leading-7 text-gray-700">
                    {detail.reason || '작성된 신청 사유가 없습니다.'}
                  </p>
                </div>

                <AiPredictionInfo
                  prediction={prediction}
                  loading={predictionLoading}
                  errorMessage={predictionError}
                  onRetry={() => {
                    predictionRequestRef.current = null
                    runPrediction({
                      force: true,
                    })
                  }}
                />
              </section>

              <section className="flex flex-col gap-3 border-2 border-black bg-white p-5 shadow-[5px_5px_0_0] shadow-black sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-3">
                  {detail.isbn && (
                    <Link
                      to={`/books/${detail.isbn}`}
                      className="inline-flex h-11 items-center justify-center border-2 border-black bg-white px-5 text-sm font-black transition hover:bg-gray-100"
                    >
                      도서 상세보기
                    </Link>
                  )}
                  <Link
                    to="/citizen-votes"
                    className="inline-flex h-11 items-center justify-center border-2 border-black bg-gray-100 px-5 text-sm font-black transition hover:bg-gray-200"
                  >
                    시민투표 목록
                  </Link>
                </div>

                <div className="flex flex-wrap gap-3">
                  {detail.canCancel && (
                    <button
                      type="button"
                      onClick={handleCancelApplication}
                      disabled={actionLoading}
                      className="h-11 border-2 border-red-500 bg-white px-5 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {actionLoading ? '처리 중...' : '신청 취소'}
                    </button>
                  )}

                  {!isAdmin && detail.canVote && (
                    <button
                      type="button"
                      onClick={handleToggleVote}
                      disabled={actionLoading}
                      className={`h-11 border-2 border-black px-6 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:opacity-50 ${
                        detail.votedByMe ? 'bg-pink-200' : 'bg-yellow-200'
                      }`}
                    >
                      {actionLoading
                        ? '반영 중...'
                        : detail.votedByMe
                          ? `원해요 취소 · ${detail.voteCount ?? 0}`
                          : `저도 원해요! · ${detail.voteCount ?? 0}`}
                    </button>
                  )}

                  {isAdmin && (
                    <Link
                      to="/admin?tab=applications"
                      className="inline-flex h-11 items-center justify-center border-2 border-black bg-blue-100 px-6 text-sm font-black shadow-[3px_3px_0_0] shadow-black"
                    >
                      관리자 희망도서 목록
                    </Link>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {noticeModal && (
        <AlertModal
          type={noticeModal.type}
          message={noticeModal.message}
          onClose={() => setNoticeModal(null)}
        />
      )}
    </BasicLayout>
  )
}

const AdminDecisionPanel = ({
  status,
  libraryName,
  role,
  comment,
  onCommentChange,
  onApprove,
  onReject,
  loading,
  decisionType,
  canDecide,
  processedAt,
  savedComment,
}) => {
  const processed = status === 'APPROVED' || status === 'REJECTED'

  const resultLabel =
    status === 'APPROVED'
      ? '승인 완료'
      : status === 'REJECTED'
        ? '반려 완료'
        : ''

  return (
    <section className="border-2 border-black bg-blue-50 p-6 shadow-[5px_5px_0_0] shadow-black sm:p-7">
      <div className="flex flex-col gap-3 border-b-2 border-black pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-blue-700">
            ADMIN DECISION
          </p>

          <h2 className="mt-1 text-2xl font-black text-gray-950">
            관리자 승인 처리
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            최고 관리자 또는 이 신청 도서관을 담당하는 관리자만 승인·반려할 수
            있습니다.
          </p>
        </div>

        <div className="w-fit border-2 border-black bg-white px-3 py-2 text-xs font-black">
          {ROLE_INFO[role]} · {libraryName || '도서관 정보 없음'}
        </div>
      </div>

      {canDecide ? (
        <>
          <label className="mt-5 block">
            <span className="text-sm font-black text-gray-950">
              처리 의견 및 사유
            </span>

            <span className="ml-2 text-xs font-semibold text-gray-500">
              승인 시 선택 · 반려 시 필수
            </span>

            <textarea
              value={comment}
              onChange={(event) =>
                onCommentChange(event.target.value.slice(0, 1000))
              }
              disabled={loading}
              maxLength={1000}
              rows={6}
              placeholder="승인 의견 또는 반려 사유를 입력해주세요."
              className="mt-3 w-full resize-y border-2 border-black bg-white p-4 text-sm font-semibold leading-6 text-gray-900 outline-none transition focus:bg-yellow-50 disabled:cursor-wait disabled:bg-gray-100"
            />
          </label>

          <div className="mt-2 flex items-center justify-end text-xs font-semibold text-gray-500">
            {comment.length}/1000
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onReject}
              disabled={loading}
              className="h-12 border-2 border-red-600 bg-red-100 px-6 text-sm font-black text-red-800 shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-wait disabled:opacity-50"
            >
              {loading && decisionType === 'REJECTED'
                ? '반려 처리 중...'
                : '신청 반려'}
            </button>

            <button
              type="button"
              onClick={onApprove}
              disabled={loading}
              className="h-12 border-2 border-green-700 bg-green-100 px-6 text-sm font-black text-green-800 shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-wait disabled:opacity-50"
            >
              {loading && decisionType === 'APPROVED'
                ? '승인 처리 중...'
                : '신청 승인'}
            </button>
          </div>

          <div className="mt-5 border-2 border-blue-300 bg-white px-4 py-3 text-xs font-semibold leading-5 text-blue-800">
            처리 결과는 즉시 저장되며, 신청 상태·처리일·관리자 의견이 현재
            상세페이지에 바로 반영됩니다.
          </div>
        </>
      ) : processed ? (
        <div
          className={`mt-5 border-2 p-5 ${
            status === 'APPROVED'
              ? 'border-green-500 bg-green-50'
              : 'border-red-500 bg-red-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={`text-lg font-black ${
                status === 'APPROVED' ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {resultLabel}
            </p>

            <p className="text-xs font-black text-gray-500">
              처리일 {formatDate(processedAt, true)}
            </p>
          </div>

          <div className="mt-4 border-2 border-black bg-white p-4">
            <p className="text-xs font-black text-gray-500">
              저장된 관리자 의견
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-800">
              {savedComment ||
                (status === 'APPROVED'
                  ? '별도의 승인 의견이 없습니다.'
                  : '등록된 반려 사유가 없습니다.')}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-2 border-gray-300 bg-white p-5 text-sm font-black text-gray-600">
          현재 상태에서는 관리자 승인 처리를 할 수 없습니다.
        </div>
      )}
    </section>
  )
}

const BookCover = ({ thumbnailUrl, title, loading = false }) => {
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageError(false)
  }, [thumbnailUrl])

  const showImage = Boolean(thumbnailUrl) && !imageError

  return (
    <div className="mx-auto w-full max-w-62.5">
      <div className="aspect-2/3 overflow-hidden border-2 border-black bg-gray-200 shadow-[5px_5px_0_0] shadow-black">
        {showImage ? (
          <img
            src={thumbnailUrl}
            alt={title || '도서 표지'}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-gray-500">
            {loading ? (
              <>
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-black" />
                <span className="text-sm font-black">
                  표지 정보를 불러오는 중입니다.
                </span>
              </>
            ) : (
              <>
                <span className="text-5xl">📚</span>
                <span className="text-sm font-black">표지 정보 없음</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const DetailField = ({ label, value, wide = false, breakAll = false }) => (
  <div
    className={`border-2 border-black bg-gray-50 p-4 ${
      wide ? 'sm:col-span-2' : ''
    }`}
  >
    <p className="text-xs font-black text-gray-500">{label}</p>
    <p
      className={`mt-2 text-sm font-black text-gray-950 ${
        breakAll ? 'break-all' : 'wrap-break-word'
      }`}
    >
      {value || '-'}
    </p>
  </div>
)

const ScoreCard = ({
  label,
  value,
  description,
  className,
  pending = false,
}) => (
  <div
    className={`border-2 border-black p-5 shadow-[3px_3px_0_0] shadow-black ${className}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-black text-gray-600">{label}</p>
        <p
          className={`mt-2 text-4xl font-black ${
            pending ? 'text-gray-500' : 'text-gray-950'
          }`}
        >
          {value}
        </p>
      </div>

      {pending && (
        <span className="border border-gray-300 bg-white px-2 py-1 text-[10px] font-black text-gray-500">
          AI 준비 중
        </span>
      )}
    </div>
    <p className="mt-3 text-xs font-semibold leading-5 text-gray-500">
      {description}
    </p>
  </div>
)

const StatusTimeline = ({ status, createdAt, processedAt }) => {
  const finished = ['APPROVED', 'REJECTED', 'CANCELED'].includes(status)
  const steps = [
    {
      key: 'RECEIVED',
      label: '신청 접수',
      description: formatDate(createdAt, true),
      state: 'DONE',
    },
    {
      key: 'REVIEW',
      label: '시민투표·심사',
      description: finished ? '검토 완료' : '현재 진행 중',
      state: finished ? 'DONE' : 'CURRENT',
    },
    {
      key: 'COMPLETE',
      label: finished ? STATUS_INFO[status]?.label : '처리 완료',
      description: finished ? formatDate(processedAt, true) : '처리 결과 대기',
      state: finished ? 'CURRENT' : 'WAITING',
    },
  ]

  return (
    <section className="border-2 border-black bg-white p-6 shadow-[5px_5px_0_0] shadow-black">
      <p className="text-xs font-black tracking-[0.16em] text-gray-500">
        PROCESS
      </p>
      <h2 className="mt-1 text-2xl font-black">신청 진행 상태</h2>

      <div className="relative mt-8 grid gap-5 md:grid-cols-3 md:gap-0">
        <div className="absolute top-5 right-[16.66%] left-[16.66%] hidden h-1 bg-gray-200 md:block" />

        {steps.map((step, index) => (
          <div
            key={step.key}
            className="relative flex gap-4 md:flex-col md:items-center md:px-4 md:text-center"
          >
            <div
              className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-black text-sm font-black ${
                step.state === 'CURRENT'
                  ? status === 'REJECTED'
                    ? 'bg-red-200'
                    : status === 'CANCELED'
                      ? 'bg-gray-300'
                      : 'bg-yellow-200'
                  : step.state === 'DONE'
                    ? 'bg-green-200'
                    : 'bg-white'
              }`}
            >
              {step.state === 'DONE' ? '✓' : index + 1}
            </div>
            <div>
              <p className="font-black text-gray-950">{step.label}</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const AiPredictionInfo = ({ prediction, loading, errorMessage, onRetry }) => (
  <aside className="border-2 border-black bg-purple-50 p-5 shadow-[5px_5px_0_0] shadow-black">
    <p className="text-xs font-black tracking-[0.16em] text-purple-700">
      AI PREDICTION
    </p>

    <h2 className="mt-1 text-xl font-black">AI 예상 승인율 분석</h2>

    {loading ? (
      <div className="mt-5 flex min-h-40 flex-col items-center justify-center border-2 border-dashed border-purple-300 bg-white p-5 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-100 border-t-purple-700" />

        <p className="mt-4 font-black text-purple-900">
          AI 모델을 실행하고 있습니다.
        </p>

        <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
          장르 균형, 지역 대출 선호, 전국 대출 체급과 시민투표를 종합하고
          있습니다.
        </p>
      </div>
    ) : errorMessage ? (
      <div className="mt-5 border-2 border-red-300 bg-red-50 p-5 text-center">
        <p className="font-black text-red-800">{errorMessage}</p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 border-2 border-black bg-white px-4 py-2 text-xs font-black shadow-[2px_2px_0_0] shadow-black"
        >
          AI 분석 다시 실행
        </button>
      </div>
    ) : prediction.status === 'READY' ? (
      <dl className="mt-5 grid gap-3 text-sm">
        <PredictionRow
          label="예상 승인율"
          value={
            prediction.approvalProbability === null
              ? '-'
              : `${Math.round(prediction.approvalProbability)}%`
          }
        />

        <PredictionRow
          label="AI 도서 인기도"
          value={
            prediction.popularityScore === null
              ? '-'
              : `${Math.round(prediction.popularityScore)}점`
          }
        />

        <PredictionRow
          label="시민투표 보정"
          value={
            prediction.voteAdjustment === null
              ? '-'
              : `+${prediction.voteAdjustment.toFixed(2)}점`
          }
        />

        <PredictionRow
          label="최종 추천점수"
          value={
            prediction.finalScore === null
              ? '-'
              : `${prediction.finalScore.toFixed(2)}점`
          }
        />

        <PredictionRow
          label="모델 버전"
          value={prediction.modelVersion || '버전 정보 없음'}
        />

        <PredictionRow
          label="예측 생성일"
          value={formatDate(prediction.predictedAt, true)}
        />
      </dl>
    ) : (
      <div className="mt-5 border-2 border-dashed border-purple-300 bg-white p-5 text-center">
        <p className="font-black text-purple-900">
          AI 예측 결과를 준비하고 있습니다.
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-4 border-2 border-black bg-purple-100 px-4 py-2 text-xs font-black"
        >
          AI 분석 실행
        </button>
      </div>
    )}

    <p className="mt-4 border-t border-purple-200 pt-4 text-[11px] font-semibold leading-5 text-gray-500">
      현재 모델은 실제 승인·거절 결과가 아니라 전국 대출 체급과 장서·지역 수요를
      예측하는 수매 우선순위 모델입니다. 표시되는 승인율은 모델 점수와
      시민투표를 변환한 참고용 추정치이며 실제 승인 결과를 보장하지 않습니다.
    </p>
  </aside>
)

const PredictionRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 border-b border-purple-200 pb-3 last:border-b-0 last:pb-0">
    <dt className="font-black text-gray-600">{label}</dt>
    <dd className="text-right font-black text-gray-950">{value}</dd>
  </div>
)

const MetricItem = ({ label, value }) => (
  <div className="border-r-2 border-black px-2 py-3 last:border-r-0">
    <p className="text-[11px] font-black text-gray-500">{label}</p>
    <p className="mt-1 wrap-break-word text-sm font-black text-gray-950 sm:text-lg">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
  </div>
)

const LoadingState = () => (
  <div className="flex min-h-120 flex-col items-center justify-center border-2 border-black bg-white shadow-[6px_6px_0_0] shadow-black">
    <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
    <p className="mt-5 font-black text-gray-700">
      시민투표 상세정보를 불러오는 중입니다.
    </p>
  </div>
)

const ErrorState = ({ message, onRetry }) => (
  <div className="flex min-h-120 flex-col items-center justify-center border-2 border-red-400 bg-red-50 px-6 text-center shadow-[6px_6px_0_0] shadow-black">
    <p className="text-lg font-black text-red-900">{message}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={onRetry}
        className="border-2 border-black bg-white px-5 py-2 font-black"
      >
        다시 조회
      </button>
      <Link
        to="/citizen-votes"
        className="border-2 border-black bg-yellow-200 px-5 py-2 font-black"
      >
        목록으로 이동
      </Link>
    </div>
  </div>
)

export default CitizenVoteDetailPage
