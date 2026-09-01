import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
import useMemberStore from '../../store/useMemberStore'
import {
  getAdminCitizenVoteApplications,
  getAdminCitizenVoteLibraries,
  getCitizenVoteApplications,
  requestCitizenVotePrediction,
  toggleCitizenVote,
} from '../../api/citizenVoteApi'

const ROLE_INFO = {
  USER: '일반 사용자',
  ADMIN: '도서관 관리자',
  MASTER_ADMIN: '최고 관리자',
}

const STATUS_INFO = {
  PENDING: {
    label: '검토 대기',
    className: 'border-amber-300 bg-amber-100 text-amber-800',
  },
  REVIEWING: {
    label: '검토 중',
    className: 'border-blue-300 bg-blue-100 text-blue-800',
  },
  APPROVED: {
    label: '승인',
    className: 'border-green-300 bg-green-100 text-green-800',
  },
  REJECTED: {
    label: '거절',
    className: 'border-red-300 bg-red-100 text-red-800',
  },
  CANCELED: {
    label: '취소',
    className: 'border-gray-300 bg-gray-100 text-gray-600',
  },
}

const SORT_OPTIONS = [
  { value: 'POPULAR', label: '누적 공감순' },
  { value: 'TRENDING', label: '최근 인기순' },
  { value: 'LATEST', label: '최신 신청순' },
]

const VIEW_MODES = {
  ACTIVE: 'ACTIVE',
  HISTORY: 'HISTORY',
}

const HISTORY_STATUS_OPTIONS = [
  { value: 'APPROVED', label: '승인 기록' },
  { value: 'REJECTED', label: '거절 기록' },
  { value: 'CANCELED', label: '취소 기록' },
]

const normalizeRole = (value) => {
  const role = String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  return ROLE_INFO[role] ? role : 'USER'
}

const normalizePageResponse = (data) => ({
  content: Array.isArray(data?.content)
    ? data.content
    : Array.isArray(data)
      ? data
      : [],
  page: Number(data?.page ?? 1),
  pageSize: Number(data?.pageSize ?? 12),
  totalElements: Number(data?.totalElements ?? 0),
  totalPages: Number(data?.totalPages ?? 0),
  totalVotes: Number(data?.totalVotes ?? 0),
  recentVotes7d: Number(data?.recentVotes7d ?? 0),
  scopeLabel: data?.scopeLabel ?? '',
})

const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data

  if (typeof data === 'string') {
    return data
  }

  return (
    data?.message || data?.detail || data?.error || error?.message || fallback
  )
}

const formatDate = (value, withTime = false) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
        }
      : {}),
  }).format(date)
}

const CURRENT_AI_MODEL_VERSION = 'library-ai-v4.1-dynamic-library-20260722-v3'

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

const normalizeAiPopularity = (source) => {
  const prediction = source?.prediction ?? source?.aiPrediction ?? {}

  const popularityScore = toNullableNumber(
    prediction?.popularityScore ??
      source?.aiPopularityScore ??
      source?.popularityScore,
  )

  const modelVersion =
    prediction?.modelVersion ??
    source?.aiModelVersion ??
    source?.modelVersion ??
    ''

  const rawStatus = String(
    prediction?.status ??
      source?.aiPopularityStatus ??
      (popularityScore !== null ? 'READY' : 'PENDING'),
  )
    .trim()
    .toUpperCase()

  return {
    status: rawStatus,
    popularityScore,
    modelVersion,
  }
}

const getAiPopularityDisplay = (item) => {
  const prediction = normalizeAiPopularity(item)

  if (prediction.status === 'READY' && prediction.popularityScore !== null) {
    return {
      value: `${prediction.popularityScore.toFixed(1)}점`,
      title: prediction.modelVersion
        ? `AI 모델 ${prediction.modelVersion}`
        : 'AI 예측 모델 인기도',
    }
  }

  if (prediction.status === 'LOADING' || prediction.status === 'RUNNING') {
    return {
      value: '분석 중',
      title: 'AI 모델에서 인기도를 계산하고 있습니다.',
    }
  }

  if (prediction.status === 'FAILED') {
    return {
      value: '분석 실패',
      title: item?.aiPopularityMessage || 'AI 인기도를 계산하지 못했습니다.',
    }
  }

  return {
    value: '분석 대기',
    title: 'AI 예상 승인율 모델 분석이 아직 실행되지 않았습니다.',
  }
}

const CitizenVotePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const isMaster = role === 'MASTER_ADMIN'
  const pageSize = isAdmin ? 9 : 12

  const [items, setItems] = useState([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [viewMode, setViewMode] = useState(VIEW_MODES.ACTIVE)
  const [status, setStatus] = useState('PENDING')
  const [sort, setSort] = useState('POPULAR')
  const [libraryId, setLibraryId] = useState('')
  const [libraries, setLibraries] = useState([])
  const [page, setPage] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [adminTotalVotes, setAdminTotalVotes] = useState(0)
  const [adminRecentVotes, setAdminRecentVotes] = useState(0)
  const [scopeLabel, setScopeLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [votingId, setVotingId] = useState(null)
  const [noticeModal, setNoticeModal] = useState(null)
  const aiBatchIdRef = useRef(0)

  const loadLibraries = useCallback(async () => {
    if (!isMaster || !userId) {
      setLibraries([])
      return
    }

    try {
      const data = await getAdminCitizenVoteLibraries({
        requesterUserId: userId,
      })
      setLibraries(data)
    } catch (error) {
      console.error('[CitizenVotePage] 도서관 필터 조회 실패:', error)
      setLibraries([])
    }
  }, [isMaster, userId])

  const loadAiPopularityScores = useCallback(
    async (targetItems, batchId) => {
      if (!userId || !Array.isArray(targetItems) || targetItems.length === 0) {
        return
      }

      const queue = [...targetItems]
      const workerCount = Math.min(3, queue.length)

      const runWorker = async () => {
        while (queue.length > 0) {
          const target = queue.shift()

          if (!target) {
            return
          }

          const applicationId = Number(target.applicationId)

          if (!Number.isInteger(applicationId) || applicationId <= 0) {
            continue
          }

          const existingPrediction = normalizeAiPopularity(target)

          if (
            existingPrediction.status === 'READY' &&
            existingPrediction.popularityScore !== null &&
            (!existingPrediction.modelVersion ||
              existingPrediction.modelVersion === CURRENT_AI_MODEL_VERSION)
          ) {
            setItems((previous) =>
              previous.map((item) =>
                Number(item.applicationId) === applicationId
                  ? {
                      ...item,
                      aiPopularityStatus: 'READY',
                      aiPopularityScore: existingPrediction.popularityScore,
                      aiModelVersion:
                        existingPrediction.modelVersion ||
                        CURRENT_AI_MODEL_VERSION,
                    }
                  : item,
              ),
            )

            continue
          }

          try {
            const response = await requestCitizenVotePrediction({
              requesterUserId: userId,
              applicationId,
              force: false,
            })

            if (batchId !== aiBatchIdRef.current) {
              return
            }

            const prediction = normalizeAiPopularity(response)

            setItems((previous) =>
              previous.map((item) =>
                Number(item.applicationId) === applicationId
                  ? {
                      ...item,
                      aiPopularityStatus:
                        prediction.status === 'READY' &&
                        prediction.popularityScore !== null
                          ? 'READY'
                          : 'PENDING',
                      aiPopularityScore: prediction.popularityScore,
                      aiModelVersion: prediction.modelVersion,
                    }
                  : item,
              ),
            )
          } catch (error) {
            if (batchId !== aiBatchIdRef.current) {
              return
            }

            console.warn('[CitizenVotePage] AI 인기도 분석 실패:', {
              applicationId,
              status: error?.response?.status,
              data: error?.response?.data,
              message: error?.message,
            })

            setItems((previous) =>
              previous.map((item) =>
                Number(item.applicationId) === applicationId
                  ? {
                      ...item,
                      aiPopularityStatus: 'FAILED',
                      aiPopularityScore: null,
                      aiPopularityMessage: getErrorMessage(
                        error,
                        'AI 인기도 분석에 실패했습니다.',
                      ),
                    }
                  : item,
              ),
            )
          }
        }
      }

      await Promise.all(
        Array.from(
          {
            length: workerCount,
          },
          () => runWorker(),
        ),
      )
    },
    [userId],
  )

  const loadApplications = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    const batchId = aiBatchIdRef.current + 1

    aiBatchIdRef.current = batchId

    setLoading(true)
    setErrorMessage('')

    const requestStatus = viewMode === VIEW_MODES.ACTIVE ? 'PENDING' : status

    try {
      const response = isAdmin
        ? await getAdminCitizenVoteApplications({
            requesterUserId: userId,
            keyword,
            status: requestStatus,
            sort,
            libraryId: isMaster ? libraryId : '',
            page,
            pageSize,
          })
        : await getCitizenVoteApplications({
            userId,
            keyword,
            status: requestStatus,
            sort,
            page,
            pageSize,
          })

      const normalized = normalizePageResponse(response)

      const contentWithAiState = normalized.content.map((item) => {
        const prediction = normalizeAiPopularity(item)

        return {
          ...item,
          aiPopularityStatus:
            prediction.status === 'READY' && prediction.popularityScore !== null
              ? 'READY'
              : 'LOADING',
          aiPopularityScore: prediction.popularityScore,
          aiModelVersion: prediction.modelVersion,
        }
      })

      setItems(contentWithAiState)
      setTotalElements(normalized.totalElements)
      setTotalPages(normalized.totalPages)
      setAdminTotalVotes(normalized.totalVotes)
      setAdminRecentVotes(normalized.recentVotes7d)
      setScopeLabel(normalized.scopeLabel)

      void loadAiPopularityScores(contentWithAiState, batchId)
    } catch (error) {
      console.error('[CitizenVotePage] 목록 조회 실패:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      setItems([])
      setTotalElements(0)
      setTotalPages(0)
      setErrorMessage(
        getErrorMessage(
          error,
          isAdmin
            ? '관리자 시민투표 현황을 불러오지 못했습니다.'
            : '시민 투표 목록을 불러오지 못했습니다.',
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [
    isAdmin,
    isMaster,
    keyword,
    libraryId,
    loadAiPopularityScores,
    page,
    pageSize,
    sort,
    status,
    userId,
    viewMode,
  ])

  useEffect(() => {
    if (!loginUser) {
      navigate('/member/login', {
        replace: true,
        state: { redirectTo: '/citizen-votes' },
      })
      return
    }
    loadApplications()
  }, [loadApplications, loginUser, navigate])

  useEffect(() => {
    loadLibraries()
  }, [loadLibraries])

  useEffect(() => {
    const applicationId = Number(searchParams.get('applicationId'))

    if (Number.isFinite(applicationId) && applicationId > 0) {
      navigate(`/citizen-votes/${applicationId}`, { replace: true })
    }
  }, [navigate, searchParams])

  const userSummary = useMemo(
    () =>
      items.reduce(
        (result, item) => {
          result.voteCount += Number(item.voteCount ?? 0)
          result.recentCount += Number(item.recentVoteCount7d ?? 0)
          if (item.votedByMe) result.myVoteCount += 1
          return result
        },
        { voteCount: 0, recentCount: 0, myVoteCount: 0 },
      ),
    [items],
  )

  const handleSearch = (event) => {
    event.preventDefault()
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  const handleViewModeChange = (nextMode) => {
    if (nextMode === viewMode) {
      return
    }

    setViewMode(nextMode)
    setStatus(nextMode === VIEW_MODES.ACTIVE ? 'PENDING' : 'APPROVED')
    setSort(nextMode === VIEW_MODES.ACTIVE ? 'POPULAR' : 'LATEST')
    setPage(1)
  }

  const handleReset = () => {
    setKeywordInput('')
    setKeyword('')
    setStatus(viewMode === VIEW_MODES.ACTIVE ? 'PENDING' : 'APPROVED')
    setSort(viewMode === VIEW_MODES.ACTIVE ? 'POPULAR' : 'LATEST')
    setLibraryId('')
    setPage(1)
  }

  const handleToggleVote = async (item) => {
    if (isAdmin || !userId || votingId !== null) return

    setVotingId(item.applicationId)

    try {
      const response = await toggleCitizenVote({
        applicationId: item.applicationId,
        userId,
      })

      setItems((previous) =>
        previous.map((current) =>
          current.applicationId === item.applicationId
            ? {
                ...current,
                votedByMe: response.votedByMe,
                voteCount: response.voteCount,
                recentVoteCount7d: response.recentVoteCount7d,
              }
            : current,
        ),
      )

      try {
        setItems((previous) =>
          previous.map((current) =>
            current.applicationId === item.applicationId
              ? {
                  ...current,
                  aiPopularityStatus: 'LOADING',
                }
              : current,
          ),
        )

        const predictionResponse = await requestCitizenVotePrediction({
          requesterUserId: userId,
          applicationId: item.applicationId,
          force: true,
        })

        const prediction = normalizeAiPopularity(predictionResponse)

        setItems((previous) =>
          previous.map((current) =>
            current.applicationId === item.applicationId
              ? {
                  ...current,
                  aiPopularityStatus:
                    prediction.status === 'READY' &&
                    prediction.popularityScore !== null
                      ? 'READY'
                      : 'PENDING',
                  aiPopularityScore: prediction.popularityScore,
                  aiModelVersion: prediction.modelVersion,
                }
              : current,
          ),
        )
      } catch (predictionError) {
        console.warn(
          '[CitizenVotePage] 투표 후 AI 인기도 재계산 실패:',
          predictionError,
        )

        setItems((previous) =>
          previous.map((current) =>
            current.applicationId === item.applicationId
              ? {
                  ...current,
                  aiPopularityStatus: 'FAILED',
                  aiPopularityMessage: getErrorMessage(
                    predictionError,
                    'AI 인기도 재계산에 실패했습니다.',
                  ),
                }
              : current,
          ),
        )
      }

      setNoticeModal({
        type: response.votedByMe ? 'success' : 'info',
        message:
          response.message ||
          (response.votedByMe
            ? '저도 원해요 투표가 반영되었습니다.'
            : '투표가 취소되었습니다.'),
      })
    } catch (error) {
      console.error('[CitizenVotePage] 투표 처리 실패:', error)
      setNoticeModal({
        type: 'error',
        message: getErrorMessage(error, '투표 처리에 실패했습니다.'),
      })
    } finally {
      setVotingId(null)
    }
  }

  if (!loginUser) return null

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="overflow-hidden border-2 border-black bg-white shadow-[6px_6px_0_0] shadow-black">
            <div
              className={`border-b-2 border-black px-6 py-7 sm:px-8 ${
                isAdmin ? 'bg-blue-100' : 'bg-yellow-200'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-black text-gray-700">
                    {isAdmin ? ROLE_INFO[role] : '시민 참여'}
                  </p>

                  <h1 className="mt-1 text-3xl font-black text-black">
                    {isAdmin ? '희망도서 시민투표 현황' : '희망도서 시민 투표'}
                  </h1>

                  <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-gray-700">
                    {viewMode === VIEW_MODES.ACTIVE
                      ? isAdmin
                        ? isMaster
                          ? '전체 도서관의 승인 대기 신청과 시민 공감 현황을 확인할 수 있습니다.'
                          : `${scopeLabel || '담당 도서관'}의 승인 대기 신청과 시민 공감 현황을 확인할 수 있습니다.`
                        : '승인 대기 중인 희망도서에 공감해 주세요. 승인 또는 거절된 신청은 과거 기록에서 확인할 수 있습니다.'
                      : isAdmin
                        ? '승인·거절·취소 처리된 희망도서 신청 기록을 조회합니다.'
                        : '시민투표가 종료된 희망도서의 승인·거절·취소 결과를 확인합니다.'}
                  </p>
                </div>

                {isAdmin ? (
                  <Link
                    to="/admin?tab=applications"
                    className="inline-flex h-11 items-center justify-center border-2 border-black bg-white px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                  >
                    희망도서 관리로 이동
                  </Link>
                ) : (
                  <Link
                    to="/book/request"
                    className="inline-flex h-11 items-center justify-center border-2 border-black bg-white px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                  >
                    새 희망도서 신청
                  </Link>
                )}
              </div>
            </div>

            <div className="grid border-b-2 border-black sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleViewModeChange(VIEW_MODES.ACTIVE)}
                className={`border-b-2 border-black px-6 py-4 text-left transition sm:border-b-0 sm:border-r-2 ${
                  viewMode === VIEW_MODES.ACTIVE
                    ? 'bg-yellow-200'
                    : 'bg-gray-50 hover:bg-white'
                }`}
              >
                <p className="text-xs font-black text-gray-500">CURRENT</p>
                <p className="mt-1 text-lg font-black text-gray-950">
                  승인 대기
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  현재 시민투표와 검토가 진행 중인 신청
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleViewModeChange(VIEW_MODES.HISTORY)}
                className={`px-6 py-4 text-left transition ${
                  viewMode === VIEW_MODES.HISTORY
                    ? 'bg-gray-950 text-white'
                    : 'bg-gray-50 hover:bg-white'
                }`}
              >
                <p
                  className={`text-xs font-black ${
                    viewMode === VIEW_MODES.HISTORY
                      ? 'text-yellow-300'
                      : 'text-gray-500'
                  }`}
                >
                  ARCHIVE
                </p>
                <p className="mt-1 text-lg font-black">과거 기록</p>
                <p
                  className={`mt-1 text-xs font-semibold ${
                    viewMode === VIEW_MODES.HISTORY
                      ? 'text-gray-300'
                      : 'text-gray-500'
                  }`}
                >
                  승인·거절·취소 처리된 신청
                </p>
              </button>
            </div>

            <div className="border-b-2 border-black px-6 py-6 sm:px-8">
              <form
                onSubmit={handleSearch}
                className={`grid gap-3 ${
                  isMaster
                    ? viewMode === VIEW_MODES.HISTORY
                      ? 'xl:grid-cols-[1fr_220px_170px_170px_100px]'
                      : 'xl:grid-cols-[1fr_220px_170px_100px]'
                    : viewMode === VIEW_MODES.HISTORY
                      ? 'lg:grid-cols-[1fr_170px_170px_100px]'
                      : 'lg:grid-cols-[1fr_170px_100px]'
                }`}
              >
                <input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder={
                    isAdmin
                      ? '도서명, 저자, ISBN, 신청자, 도서관 검색'
                      : '도서명, 저자, 출판사, ISBN, 도서관 검색'
                  }
                  className="h-12 border-2 border-black px-4 font-semibold outline-none focus:bg-yellow-50"
                />

                {isMaster && (
                  <select
                    value={libraryId}
                    onChange={(event) => {
                      setLibraryId(event.target.value)
                      setPage(1)
                    }}
                    className="h-12 border-2 border-black bg-white px-4 font-black"
                  >
                    <option value="">전체 도서관</option>
                    {libraries.map((library) => (
                      <option key={library.libraryId} value={library.libraryId}>
                        {library.libraryName}
                      </option>
                    ))}
                  </select>
                )}

                {viewMode === VIEW_MODES.HISTORY && (
                  <select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value)
                      setPage(1)
                    }}
                    className="h-12 border-2 border-black bg-white px-4 font-black"
                  >
                    {HISTORY_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value)
                    setPage(1)
                  }}
                  className="h-12 border-2 border-black bg-white px-4 font-black"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className={`h-12 border-2 border-black px-5 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none ${
                    viewMode === VIEW_MODES.HISTORY
                      ? 'bg-gray-950 text-white'
                      : isAdmin
                        ? 'bg-blue-100'
                        : 'bg-yellow-200'
                  }`}
                >
                  검색
                </button>
              </form>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-500">
                  {viewMode === VIEW_MODES.HISTORY
                    ? `${STATUS_INFO[status]?.label || '처리 완료'} 상태의 과거 신청만 표시합니다.`
                    : isAdmin
                      ? isMaster
                        ? libraryId
                          ? '선택한 도서관의 승인 대기 신청만 표시합니다.'
                          : '전체 도서관의 승인 대기 신청만 표시합니다.'
                        : '담당 도서관의 승인 대기 신청만 자동으로 제한됩니다.'
                      : '승인 대기 중이며 본인이 신청하지 않은 도서만 표시됩니다.'}
                </p>

                <button
                  type="button"
                  onClick={handleReset}
                  className="border-b-2 border-black text-xs font-black"
                >
                  검색 조건 초기화
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 border-b-2 border-black sm:grid-cols-4">
              <SummaryItem
                label={
                  viewMode === VIEW_MODES.HISTORY
                    ? '과거 기록'
                    : isAdmin
                      ? '승인 대기 신청'
                      : '투표 가능 신청'
                }
                value={totalElements}
              />
              <SummaryItem
                label={isAdmin ? '누적 시민공감' : '현재 화면 공감'}
                value={isAdmin ? adminTotalVotes : userSummary.voteCount}
              />
              <SummaryItem
                label="최근 7일 공감"
                value={isAdmin ? adminRecentVotes : userSummary.recentCount}
              />
              <SummaryTextItem
                label={isAdmin ? '조회 범위' : '내가 공감한 도서'}
                value={
                  isAdmin
                    ? scopeLabel || (isMaster ? '전체 도서관' : '담당 도서관')
                    : userSummary.myVoteCount
                }
              />
            </div>

            <div className="px-6 py-8 sm:px-8">
              {loading && <LoadingState admin={isAdmin} />}

              {!loading && errorMessage && (
                <ErrorState message={errorMessage} onRetry={loadApplications} />
              )}

              {!loading && !errorMessage && items.length === 0 && (
                <EmptyState
                  admin={isAdmin}
                  history={viewMode === VIEW_MODES.HISTORY}
                />
              )}

              {!loading && !errorMessage && items.length > 0 && (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) =>
                    isAdmin ? (
                      <AdminVoteCard
                        key={item.applicationId}
                        item={item}
                        onOpenDetail={() =>
                          navigate(`/citizen-votes/${item.applicationId}`)
                        }
                      />
                    ) : (
                      <UserVoteCard
                        key={item.applicationId}
                        item={item}
                        processing={votingId === item.applicationId}
                        disabled={votingId !== null}
                        history={viewMode === VIEW_MODES.HISTORY}
                        onOpenDetail={() =>
                          navigate(`/citizen-votes/${item.applicationId}`)
                        }
                        onToggle={() => handleToggleVote(item)}
                      />
                    ),
                  )}
                </div>
              )}

              {!loading && !errorMessage && totalPages > 1 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              )}
            </div>
          </section>
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

const AdminVoteCard = ({ item, onOpenDetail }) => {
  const status = String(item.status ?? 'PENDING').toUpperCase()
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.PENDING

  return (
    <article className="flex min-h-94 flex-col border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
        <span className="text-xs font-black text-gray-400">
          #{item.applicationId}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-black text-blue-700">
          {item.libraryName || '도서관 정보 없음'}
        </p>
        <h2 className="mt-2 line-clamp-2 text-xl font-black text-gray-950">
          {item.title || '도서 제목 없음'}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-500">
          {item.author || '저자 정보 없음'} ·{' '}
          {item.publisher || '출판사 정보 없음'}
        </p>
      </div>

      <dl className="mt-5 grid gap-2 border-y border-gray-200 py-4 text-sm">
        <InfoRow
          label="신청자"
          value={item.applicantName || item.applicantLoginId || '-'}
        />
        <InfoRow label="ISBN" value={item.isbn || '-'} breakAll />
        <InfoRow label="신청일" value={formatDate(item.createdAt)} />
      </dl>

      <div className="mt-5 grid grid-cols-3 border-2 border-black text-center">
        <MetricItem label="누적 공감" value={item.voteCount ?? 0} />
        <MetricItem label="최근 7일" value={item.recentVoteCount7d ?? 0} />
        <MetricItem
          label="AI 인기도"
          value={getAiPopularityDisplay(item).value}
          title={getAiPopularityDisplay(item).title}
        />
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className="mt-auto h-11 w-full border-2 border-black bg-blue-100 px-4 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
      >
        신청 상세페이지
      </button>
    </article>
  )
}

const UserVoteCard = ({
  item,
  processing,
  disabled,
  history,
  onOpenDetail,
  onToggle,
}) => {
  const status = String(item.status ?? 'PENDING').toUpperCase()
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.PENDING

  return (
    <article className="flex min-h-102.5 flex-col border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>

        {item.votedByMe && (
          <span className="rounded-full border border-pink-300 bg-pink-100 px-3 py-1 text-xs font-black text-pink-800">
            내가 공감함
          </span>
        )}
      </div>

      <div className="mt-5">
        <div className="flex h-16 w-12 items-center justify-center border-2 border-black bg-yellow-100 text-2xl shadow-[2px_2px_0_0] shadow-black">
          📚
        </div>
        <h2 className="mt-4 line-clamp-2 text-xl font-black text-gray-950">
          {item.title || '도서 제목 없음'}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-500">
          {item.author || '저자 정보 없음'} ·{' '}
          {item.publisher || '출판사 정보 없음'}
        </p>
      </div>

      <dl className="mt-5 grid gap-2 border-y border-gray-200 py-4 text-sm">
        <InfoRow label="신청 도서관" value={item.libraryName || '-'} />
        <InfoRow label="ISBN" value={item.isbn || '-'} breakAll />
        <InfoRow label="신청일" value={formatDate(item.createdAt)} />
      </dl>

      <div className="mt-4 flex-1">
        <p className="text-xs font-black uppercase tracking-wide text-gray-500">
          신청 사유
        </p>
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {item.reason || '작성된 신청 사유가 없습니다.'}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 border-2 border-black text-center">
        <MetricItem label="누적 공감" value={item.voteCount ?? 0} />
        <MetricItem label="최근 7일" value={item.recentVoteCount7d ?? 0} />
        <MetricItem
          label="AI 인기도"
          value={getAiPopularityDisplay(item).value}
          title={getAiPopularityDisplay(item).title}
        />
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onOpenDetail}
          className="inline-flex h-11 items-center justify-center border-2 border-black bg-white px-4 text-sm font-black transition hover:bg-gray-100"
        >
          신청 상세
        </button>

        {history ? (
          <div className="flex h-11 flex-1 items-center justify-center border-2 border-black bg-gray-100 px-4 text-sm font-black text-gray-700">
            {STATUS_INFO[status]?.label || '처리 완료'} 기록
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            className={`h-11 flex-1 border-2 border-black px-4 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50 ${
              item.votedByMe ? 'bg-pink-200' : 'bg-yellow-200'
            }`}
          >
            {processing
              ? '반영 중...'
              : item.votedByMe
                ? `원해요 취소 · ${item.voteCount ?? 0}`
                : `저도 원해요! · ${item.voteCount ?? 0}`}
          </button>
        )}
      </div>
    </article>
  )
}

const Pagination = ({ page, totalPages, onChange }) => {
  const startPage = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)))
  const endPage = Math.min(totalPages, startPage + 4)
  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  )

  return (
    <nav
      className="mt-8 flex flex-wrap items-center justify-center gap-2"
      aria-label="시민투표 페이지 이동"
    >
      <PageButton disabled={page <= 1} onClick={() => onChange(1)}>
        처음
      </PageButton>
      <PageButton
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        이전
      </PageButton>

      {pageNumbers.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onChange(pageNumber)}
          aria-current={pageNumber === page ? 'page' : undefined}
          className={`min-w-10 border-2 border-black px-3 py-2 text-sm font-black ${
            pageNumber === page
              ? 'bg-yellow-200 shadow-[2px_2px_0_0] shadow-black'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          {pageNumber}
        </button>
      ))}

      <PageButton
        disabled={page >= totalPages}
        onClick={() => onChange(Math.min(totalPages, page + 1))}
      >
        다음
      </PageButton>
      <PageButton
        disabled={page >= totalPages}
        onClick={() => onChange(totalPages)}
      >
        마지막
      </PageButton>
    </nav>
  )
}

const PageButton = ({ disabled, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="border-2 border-black bg-white px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
  >
    {children}
  </button>
)

const InfoRow = ({ label, value, breakAll = false }) => (
  <div className="flex gap-3">
    <dt className="w-20 shrink-0 font-black text-gray-900">{label}</dt>
    <dd
      className={`${breakAll ? 'break-all' : 'wrap-break-word'} min-w-0 text-gray-600`}
    >
      {value}
    </dd>
  </div>
)

const SummaryItem = ({ label, value }) => (
  <div className="border-b-2 border-r-2 border-black p-4 last:border-r-0 sm:border-b-0">
    <p className="text-xs font-black text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-black text-black">
      {Number(value ?? 0).toLocaleString()}
    </p>
  </div>
)

const SummaryTextItem = ({ label, value }) => (
  <div className="border-b-2 border-r-2 border-black p-4 last:border-r-0 sm:border-b-0">
    <p className="text-xs font-black text-gray-500">{label}</p>
    <p className="mt-1 line-clamp-2 text-lg font-black text-black">
      {typeof value === 'number' ? value.toLocaleString() : value || '-'}
    </p>
  </div>
)

const MetricItem = ({ label, value, title = '' }) => (
  <div
    className="border-r-2 border-black px-2 py-3 last:border-r-0"
    title={title || undefined}
  >
    <p className="text-[11px] font-black text-gray-500">{label}</p>

    <p className="mt-1 wrap-break-word text-sm font-black text-gray-950 sm:text-lg">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
  </div>
)

const LoadingState = ({ admin }) => (
  <div className="flex min-h-72 flex-col items-center justify-center border-2 border-gray-200 bg-gray-50">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
    <p className="mt-4 font-black text-gray-700">
      {admin
        ? '관리자 시민투표 현황을 불러오는 중입니다.'
        : '시민 투표 목록을 불러오는 중입니다.'}
    </p>
  </div>
)

const ErrorState = ({ message, onRetry }) => (
  <div className="flex min-h-72 flex-col items-center justify-center border-2 border-red-300 bg-red-50 px-6 text-center">
    <p className="font-black text-red-800">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-5 border-2 border-black bg-white px-5 py-2 font-black"
    >
      다시 시도
    </button>
  </div>
)

const EmptyState = ({ admin, history }) => (
  <div className="flex min-h-72 flex-col items-center justify-center border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center">
    <div className="text-5xl">📖</div>
    <p className="mt-5 text-lg font-black text-gray-900">
      {history
        ? '조건에 맞는 과거 기록이 없습니다.'
        : admin
          ? '승인 대기 중인 희망도서 신청이 없습니다.'
          : '투표할 희망도서가 없습니다.'}
    </p>
    <p className="mt-2 text-sm text-gray-500">
      {history
        ? '승인·거절·취소 상태나 검색 조건을 변경해보세요.'
        : admin
          ? '새로운 신청이 접수되면 이곳에 표시됩니다.'
          : '다른 시민의 승인 대기 신청이 여기에 표시됩니다.'}
    </p>
  </div>
)

export default CitizenVotePage
