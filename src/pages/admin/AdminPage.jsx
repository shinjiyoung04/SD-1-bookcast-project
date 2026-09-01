import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import PasswordConfirmModal from '../../components/member/PasswordConfirmModal'
import useMemberStore from '../../store/useMemberStore'
import {
  saveProfileVerification,
  verifyMemberPassword,
} from '../../api/memberAccountApi'
import {
  decideAdminApplication,
  getAdminApplications,
  getAdminDashboard,
  getAdminLibraries,
  getAdminMe,
  getAdminMembers,
  updateAdminMemberRole,
} from '../../api/adminApi'
import {
  approvePromotionRequest,
  getPromotionRequests,
  rejectPromotionRequest,
} from '../../api/promotionApi'
import { getData4LibraryBookClassification } from '../../api/externalBookApi'

const DEFAULT_API_ORIGIN = 'http://localhost:8080'

const getApiOrigin = () => {
  const configuredOrigin = import.meta.env.VITE_API_SERVER_ORIGIN

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, '')
  }

  const configuredApiUrl = import.meta.env.VITE_API_SERVER_URL

  if (
    configuredApiUrl?.startsWith('http://') ||
    configuredApiUrl?.startsWith('https://')
  ) {
    try {
      return new URL(configuredApiUrl).origin
    } catch (error) {
      console.warn('[AdminPage] API 주소 해석 실패:', error)
    }
  }

  return DEFAULT_API_ORIGIN
}

const API_ORIGIN = getApiOrigin()

const resolveProfileImageUrl = (value) => {
  const imageUrl = String(value ?? '').trim()

  if (!imageUrl) {
    return ''
  }

  if (
    imageUrl.startsWith('http://') ||
    imageUrl.startsWith('https://') ||
    imageUrl.startsWith('data:') ||
    imageUrl.startsWith('blob:')
  ) {
    return imageUrl
  }

  return `${API_ORIGIN}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
}

const ROLE_INFO = {
  USER: {
    label: '일반 사용자',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
  ADMIN: {
    label: '도서관 관리자',
    className: 'border-blue-300 bg-blue-100 text-blue-800',
  },
  MASTER_ADMIN: {
    label: '최고 관리자',
    className: 'border-purple-300 bg-purple-100 text-purple-800',
  },
}

const STATUS_INFO = {
  PENDING: {
    label: '승인 대기',
    className: 'border-amber-300 bg-amber-100 text-amber-800',
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

const MEMBER_STATUS_INFO = {
  ACTIVE: {
    label: '정상',
    className: 'text-green-700',
  },
  BLOCKED: {
    label: '이용 정지',
    className: 'text-red-700',
  },
  DELETED: {
    label: '탈퇴',
    className: 'text-gray-500',
  },
}

const PROMOTION_STATUS_INFO = {
  PENDING: {
    label: '승인 대기',
    className: 'border-amber-300 bg-amber-100 text-amber-800',
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

const normalizePromotionRequest = (item) => ({
  requestId: item?.requestId ?? item?.promotionRequestId ?? item?.id,

  userId: item?.userId ?? item?.applicantUserId ?? item?.applicantId,

  loginId: item?.loginId ?? item?.applicantLoginId ?? '',

  name: item?.name ?? item?.applicantName ?? '',

  email: item?.email ?? item?.applicantEmail ?? '',

  libraryName: item?.libraryName ?? '',

  libraryCode: item?.libraryCode ?? '',

  department: item?.department ?? '',

  employeeNumber: item?.employeeNumber ?? '',

  contact: item?.contact ?? '',

  reason: item?.reason ?? '',

  status: String(item?.status ?? 'PENDING').toUpperCase(),

  masterAdminId: item?.masterAdminId ?? null,

  masterAdminName: item?.masterAdminName ?? '',

  masterComment: item?.masterComment ?? item?.comment ?? '',

  createdAt: item?.createdAt ?? null,

  processedAt: item?.processedAt ?? null,

  updatedAt: item?.updatedAt ?? null,
})

const normalizeRole = (value) => {
  const role = String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  return ROLE_INFO[role] ? role : 'USER'
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

const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data

  if (typeof data === 'string') {
    return data
  }

  return (
    data?.message || data?.detail || data?.error || error?.message || fallback
  )
}

const AdminPage = () => {
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()

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

  const isMaster = role === 'MASTER_ADMIN'

  const activeTab = searchParams.get('tab') || 'dashboard'

  const [adminInfo, setAdminInfo] = useState(null)

  const [dashboard, setDashboard] = useState(null)

  const [pendingPromotionCount, setPendingPromotionCount] = useState(0)

  const [loadingBase, setLoadingBase] = useState(true)

  const [pageError, setPageError] = useState('')

  const [notice, setNotice] = useState(null)

  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const [password, setPassword] = useState('')

  const [passwordError, setPasswordError] = useState('')

  const [passwordChecking, setPasswordChecking] = useState(false)

  const openApplicationDetail = (applicationId) => {
    const normalizedApplicationId = Number(applicationId)

    if (
      !Number.isInteger(normalizedApplicationId) ||
      normalizedApplicationId <= 0
    ) {
      setNotice({
        type: 'error',
        message: '유효한 희망도서 신청번호가 없습니다.',
      })

      return
    }

    navigate(`/citizen-votes/${normalizedApplicationId}`)
  }

  const changeTab = (tab) => {
    if (['members', 'promotions'].includes(tab) && !isMaster) {
      setNotice({
        type: 'error',
        message: '해당 기능은 최고 관리자만 사용할 수 있습니다.',
      })

      return
    }

    setSearchParams({
      tab,
    })
  }

  const loadPendingPromotionCount = useCallback(async () => {
    if (!isMaster || !userId) {
      setPendingPromotionCount(0)
      return
    }

    try {
      const data = await getPromotionRequests({
        masterAdminId: userId,

        status: 'PENDING',
      })

      setPendingPromotionCount(Array.isArray(data) ? data.length : 0)
    } catch (error) {
      console.error('[AdminPage] 등업 신청 알림 조회 실패:', error)

      setPendingPromotionCount(0)
    }
  }, [isMaster, userId])

  const loadBase = useCallback(async () => {
    if (!userId) {
      return
    }

    setLoadingBase(true)
    setPageError('')

    try {
      const [me, summary] = await Promise.all([
        getAdminMe(userId),
        getAdminDashboard(userId),
      ])

      setAdminInfo(me)
      setDashboard(summary)

      await loadPendingPromotionCount()
    } catch (error) {
      console.error('[AdminPage] 관리자 기본정보 조회 실패:', error)

      setPageError(getErrorMessage(error, '관리자 정보를 불러오지 못했습니다.'))
    } finally {
      setLoadingBase(false)
    }
  }, [loadPendingPromotionCount, userId])

  const refreshApplicationSummary = useCallback(async () => {
    if (!userId) {
      return
    }

    try {
      const [me, summary] = await Promise.all([
        getAdminMe(userId),
        getAdminDashboard(userId),
      ])

      setAdminInfo(me)
      setDashboard(summary)
    } catch (error) {
      console.error('[AdminPage] 희망도서 알림 갱신 실패:', error)
    }
  }, [userId])

  useEffect(() => {
    if (!loginUser || !userId) {
      navigate('/member/login', {
        replace: true,
      })

      return
    }

    if (role !== 'ADMIN' && role !== 'MASTER_ADMIN') {
      navigate('/member/mypage', {
        replace: true,
      })

      return
    }

    if (['members', 'promotions'].includes(activeTab) && !isMaster) {
      setSearchParams({
        tab: 'applications',
      })

      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBase()
  }, [
    activeTab,
    isMaster,
    loadBase,
    loginUser,
    navigate,
    role,
    setSearchParams,
    userId,
  ])

  useEffect(() => {
    if (!isMaster || !userId) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      loadPendingPromotionCount()
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isMaster, loadPendingPromotionCount, userId])

  useEffect(() => {
    if (!userId || (role !== 'ADMIN' && role !== 'MASTER_ADMIN')) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      refreshApplicationSummary()
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refreshApplicationSummary, role, userId])

  const openProfileVerification = () => {
    setPassword('')
    setPasswordError('')
    setPasswordModalOpen(true)
  }

  const closeProfileVerification = () => {
    if (passwordChecking) {
      return
    }

    setPasswordModalOpen(false)

    setPassword('')
    setPasswordError('')
  }

  const verifyForEdit = async () => {
    if (!password) {
      setPasswordError('현재 비밀번호를 입력해주세요.')

      return
    }

    setPasswordChecking(true)

    setPasswordError('')

    try {
      const result = await verifyMemberPassword({
        userId,
        password,
      })

      saveProfileVerification({
        userId,

        verificationToken: result.verificationToken,

        expiresAt: result.expiresAt,
      })

      setPasswordModalOpen(false)

      setPassword('')

      navigate('/member/edit')
    } catch (error) {
      setPasswordError(getErrorMessage(error, '비밀번호가 일치하지 않습니다.'))
    } finally {
      setPasswordChecking(false)
    }
  }

  if (!loginUser || (role !== 'ADMIN' && role !== 'MASTER_ADMIN')) {
    return null
  }

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {loadingBase && (
            <LoadingBox message="관리자 페이지를 불러오는 중입니다." />
          )}

          {!loadingBase && pageError && (
            <ErrorBox message={pageError} onRetry={loadBase} />
          )}

          {!loadingBase && !pageError && adminInfo && (
            <div className="overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_0] shadow-black">
              <AdminHeader
                adminInfo={adminInfo}
                pendingPromotionCount={pendingPromotionCount}
                onOpenApplications={() => changeTab('applications')}
                onOpenPromotions={() => changeTab('promotions')}
                onEdit={openProfileVerification}
              />

              <div className="grid min-h-162.5 lg:grid-cols-[190px_1fr]">
                <AdminSidebar
                  activeTab={activeTab}
                  isMaster={isMaster}
                  pendingApplicationCount={
                    adminInfo.pendingApplicationCount ?? 0
                  }
                  pendingPromotionCount={pendingPromotionCount}
                  onChange={changeTab}
                />

                <section className="min-w-0 p-5 sm:p-7">
                  {activeTab === 'dashboard' && (
                    <AdminDashboardHome
                      requesterUserId={userId}
                      dashboard={dashboard}
                      adminInfo={adminInfo}
                      onOpenApplications={() => changeTab('applications')}
                      onOpenApplication={openApplicationDetail}
                    />
                  )}

                  {activeTab === 'applications' && (
                    <ApplicationManagement
                      requesterUserId={userId}
                      dashboard={dashboard}
                      adminInfo={adminInfo}
                      onChanged={loadBase}
                      onNotice={setNotice}
                      onOpenApplication={openApplicationDetail}
                    />
                  )}

                  {activeTab === 'promotions' && isMaster && (
                    <PromotionManagement
                      masterAdminId={userId}
                      pendingPromotionCount={pendingPromotionCount}
                      onCountChanged={loadPendingPromotionCount}
                      onNotice={setNotice}
                    />
                  )}

                  {activeTab === 'members' && isMaster && (
                    <MemberManagement
                      requesterUserId={userId}
                      currentUserId={userId}
                      onNotice={setNotice}
                    />
                  )}

                  {activeTab === 'profile' && (
                    <AdminProfile
                      adminInfo={adminInfo}
                      onEdit={openProfileVerification}
                    />
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </main>

      <PasswordConfirmModal
        open={passwordModalOpen}
        title="관리자 정보 수정 확인"
        message="관리자 정보를 수정하려면 현재 비밀번호를 확인해야 합니다."
        password={password}
        onPasswordChange={(value) => {
          setPassword(value)
          setPasswordError('')
        }}
        onClose={closeProfileVerification}
        onConfirm={verifyForEdit}
        loading={passwordChecking}
        errorMessage={passwordError}
        confirmLabel="확인 후 이동"
      />

      {notice && (
        <SimpleNoticeModal notice={notice} onClose={() => setNotice(null)} />
      )}
    </BasicLayout>
  )
}

const AdminHeader = ({
  adminInfo,
  pendingPromotionCount,
  onOpenApplications,
  onOpenPromotions,
  onEdit,
}) => {
  const roleInfo = ROLE_INFO[adminInfo.role] || ROLE_INFO.ADMIN

  const pendingApplicationCount = Number(adminInfo.pendingApplicationCount ?? 0)

  return (
    <header className="border-b-2 border-black bg-white px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <AdminProfileImage adminInfo={adminInfo} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-gray-950">
                {adminInfo.name}
              </h1>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-black ${roleInfo.className}`}
              >
                {roleInfo.label}
              </span>
            </div>

            <p className="mt-1 text-sm font-semibold text-gray-500">
              {adminInfo.managedLibraryName ||
                (adminInfo.role === 'MASTER_ADMIN'
                  ? '전체 도서관 관리'
                  : '담당 도서관 미지정')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {adminInfo.role === 'MASTER_ADMIN' && pendingPromotionCount > 0 && (
            <button
              type="button"
              onClick={onOpenPromotions}
              className="flex items-center gap-2 rounded-full border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-black text-purple-800 transition hover:bg-purple-100"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-700 text-xs text-white">
                !
              </span>
              관리자 등업 신청 {pendingPromotionCount}건
            </button>
          )}

          {pendingApplicationCount > 0 && (
            <button
              type="button"
              onClick={onOpenApplications}
              className="flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-black text-red-800 transition hover:bg-red-100"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-xs text-white">
                !
              </span>
              {adminInfo.role === 'MASTER_ADMIN'
                ? '전체 신규 신청'
                : `${
                    adminInfo.managedLibraryName || '담당 도서관'
                  } 신규 신청`}{' '}
              {pendingApplicationCount}건
            </button>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="border-2 border-black bg-yellow-200 px-5 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            관리자 정보 수정
          </button>
        </div>
      </div>
    </header>
  )
}

const AdminProfileImage = ({ adminInfo, large = false }) => {
  const imageUrl = resolveProfileImageUrl(adminInfo?.profileImageUrl)

  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageFailed(false)
  }, [imageUrl])

  const initial =
    adminInfo?.name?.charAt(0) || adminInfo?.loginId?.charAt(0) || 'A'

  const sizeClass = large ? 'h-28 w-28 text-4xl' : 'h-14 w-14 text-xl'

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-gray-200 font-black ${sizeClass}`}
    >
      {imageUrl && !imageFailed ? (
        <img
          src={imageUrl}
          alt={`${adminInfo?.name || '관리자'} 프로필`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{initial.toUpperCase()}</span>
      )}
    </div>
  )
}

const AdminSidebar = ({
  activeTab,
  isMaster,
  pendingApplicationCount,
  pendingPromotionCount,
  onChange,
}) => (
  <aside className="border-b-2 border-black bg-gray-50 p-4 lg:border-b-0 lg:border-r-2">
    <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
      <SidebarButton
        active={activeTab === 'dashboard'}
        onClick={() => onChange('dashboard')}
      >
        메인 현황
      </SidebarButton>

      <SidebarButton
        active={activeTab === 'applications'}
        onClick={() => onChange('applications')}
      >
        <span className="flex items-center justify-between gap-2">
          <span>희망도서 관리</span>

          {pendingApplicationCount > 0 && (
            <span className="flex min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
              {pendingApplicationCount}
            </span>
          )}
        </span>
      </SidebarButton>

      <SidebarButton
        active={activeTab === 'profile'}
        onClick={() => onChange('profile')}
      >
        관리자 정보
      </SidebarButton>

      {isMaster && (
        <SidebarButton
          active={activeTab === 'promotions'}
          onClick={() => onChange('promotions')}
        >
          <span className="flex items-center justify-between gap-2">
            <span>등업 신청 관리</span>

            {pendingPromotionCount > 0 && (
              <span className="flex min-w-6 items-center justify-center rounded-full bg-purple-700 px-1.5 py-0.5 text-xs text-white">
                {pendingPromotionCount}
              </span>
            )}
          </span>
        </SidebarButton>
      )}

      {isMaster && (
        <SidebarButton
          active={activeTab === 'members'}
          onClick={() => onChange('members')}
        >
          회원관리
        </SidebarButton>
      )}
    </nav>

    {!isMaster && (
      <div className="mt-5 border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800">
        일반 관리자는 담당 도서관의 희망도서 신청만 확인할 수 있습니다.
      </div>
    )}
  </aside>
)

const SidebarButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-2 px-4 py-3 text-left text-sm font-black transition ${
      active
        ? 'border-black bg-yellow-200 shadow-[3px_3px_0_0] shadow-black'
        : 'border-transparent bg-transparent text-gray-600 hover:border-gray-300 hover:bg-white'
    }`}
  >
    {children}
  </button>
)

const KDC_CATEGORY_BY_FIRST_DIGIT = {
  0: '총류',
  1: '철학',
  2: '종교',
  3: '사회과학',
  4: '자연과학',
  5: '기술과학',
  6: '예술',
  7: '언어',
  8: '문학',
  9: '역사',
}

const classificationCache = new Map()
const classificationInFlight = new Map()

const normalizeClassificationIsbn = (value) =>
  String(value ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
    .trim()

const isUsableClassificationText = (value) => {
  const normalized = String(value ?? '').trim()

  return Boolean(
    normalized &&
    normalized !== '미분류' &&
    normalized !== '분류 정보 없음' &&
    normalized !== '분류 확인 중',
  )
}

const resolveKdcCategory = ({ classNo, className, categoryName }) => {
  const explicitCategory = String(categoryName ?? '').trim()

  if (isUsableClassificationText(explicitCategory)) {
    return explicitCategory
  }

  const topClassName = String(className ?? '')
    .split('>')[0]
    .trim()

  if (isUsableClassificationText(topClassName)) {
    return topClassName
  }

  const normalizedClassNo = String(classNo ?? '')
    .replace(/[^0-9.]/g, '')
    .trim()

  return KDC_CATEGORY_BY_FIRST_DIGIT[normalizedClassNo.charAt(0)] || '미분류'
}

const getApplicationCategoryName = (item) => {
  const categoryName = resolveKdcCategory({
    classNo:
      item?.classNo ?? item?.class_no ?? item?.classificationNo ?? item?.kdcNo,

    className:
      item?.className ??
      item?.class_nm ??
      item?.classNm ??
      item?.classificationName ??
      item?.kdcName,

    categoryName:
      item?.categoryName ??
      item?.category_name ??
      item?.category?.name ??
      item?.category?.categoryName,
  })

  if (categoryName !== '미분류') {
    return categoryName
  }

  return item?.classificationLoading ? '분류 확인 중' : '미분류'
}

const hasData4LibraryClassification = (item) => {
  const source = String(
    item?.classificationSource ??
      item?.classification_source ??
      item?.source ??
      '',
  )
    .trim()
    .toUpperCase()

  return (
    source === 'DATA4LIBRARY' && getApplicationCategoryName(item) !== '미분류'
  )
}

const prepareApplicationClassification = (item) => {
  const isbn = normalizeClassificationIsbn(item?.isbn ?? item?.isbn13)

  if (!isbn || hasData4LibraryClassification(item)) {
    return {
      ...item,
      classificationLoading: false,
    }
  }

  return {
    ...item,
    classificationLoading: true,
  }
}

const requestApplicationClassification = async (item) => {
  const isbn = normalizeClassificationIsbn(item?.isbn ?? item?.isbn13)

  if (!isbn) {
    return {
      ...item,
      classificationLoading: false,
    }
  }

  if (hasData4LibraryClassification(item)) {
    return {
      ...item,
      classificationLoading: false,
    }
  }

  const cached = classificationCache.get(isbn)

  if (cached) {
    return {
      ...item,
      ...cached,
      classificationLoading: false,
    }
  }

  let requestPromise = classificationInFlight.get(isbn)

  if (!requestPromise) {
    requestPromise = getData4LibraryBookClassification(isbn)
      .then((data) => {
        if (!data) {
          return null
        }

        const classification = {
          classNo: data.classNo ?? data.class_no ?? '',
          className: data.className ?? data.class_nm ?? '',
          categoryName: resolveKdcCategory({
            classNo: data.classNo ?? data.class_no,
            className: data.className ?? data.class_nm,
            categoryName: data.categoryName ?? data.category_name,
          }),
          classificationSource: data.source || 'DATA4LIBRARY',
        }

        classificationCache.set(isbn, classification)

        return classification
      })
      .catch((error) => {
        console.warn(`[AdminPage] ISBN ${isbn} 정보나루 분류 조회 실패:`, error)

        return null
      })
      .finally(() => {
        classificationInFlight.delete(isbn)
      })

    classificationInFlight.set(isbn, requestPromise)
  }

  const classification = await requestPromise

  return {
    ...item,
    ...(classification || {}),
    classificationLoading: false,
  }
}

const enrichApplicationClassifications = async (items) =>
  Promise.all(items.map((item) => requestApplicationClassification(item)))

const mergeApplicationClassifications = (currentItems, enrichedItems) => {
  const classificationById = new Map(
    enrichedItems.map((item) => [String(item.applicationId), item]),
  )

  return currentItems.map((item) => {
    const enriched = classificationById.get(String(item.applicationId))

    if (!enriched) {
      return item
    }

    return {
      ...item,
      classNo: enriched.classNo,
      className: enriched.className,
      categoryName: enriched.categoryName,
      classificationSource: enriched.classificationSource,
      classificationLoading: false,
    }
  })
}

const AdminDashboardHome = ({
  requesterUserId,
  dashboard,
  adminInfo,
  onOpenApplications,
  onOpenApplication,
}) => {
  const [pendingApplications, setPendingApplications] = useState([])
  const [recommendation, setRecommendation] = useState(null)
  const [totalPendingApplications, setTotalPendingApplications] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadDashboardLists = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true)
      }

      setError('')

      try {
        const [pendingData, recommendationData] = await Promise.all([
          getAdminApplications({
            requesterUserId,
            keyword: '',
            status: 'PENDING',
            sort: 'VOTES',
            page: 1,
            pageSize: 10,
          }),
          getAdminApplications({
            requesterUserId,
            keyword: '',
            status: 'PENDING',
            sort: 'AI',
            page: 1,
            pageSize: 1,
          }),
        ])

        const pendingContent = Array.isArray(pendingData?.content)
          ? pendingData.content.filter(
              (item) =>
                String(item?.status ?? 'PENDING').toUpperCase() === 'PENDING',
            )
          : []

        const recommendationContent = Array.isArray(recommendationData?.content)
          ? recommendationData.content
          : []

        const preparedPending = pendingContent.map(
          prepareApplicationClassification,
        )

        const preparedRecommendation = recommendationContent[0]
          ? prepareApplicationClassification(recommendationContent[0])
          : null

        setPendingApplications(preparedPending)
        setRecommendation(preparedRecommendation)
        setTotalPendingApplications(Number(pendingData?.totalElements ?? 0))

        enrichApplicationClassifications(preparedPending).then(
          (enrichedItems) => {
            setPendingApplications((currentItems) =>
              mergeApplicationClassifications(currentItems, enrichedItems),
            )
          },
        )

        if (preparedRecommendation) {
          requestApplicationClassification(preparedRecommendation).then(
            (enrichedRecommendation) => {
              setRecommendation((currentRecommendation) =>
                currentRecommendation?.applicationId ===
                enrichedRecommendation.applicationId
                  ? enrichedRecommendation
                  : currentRecommendation,
              )
            },
          )
        }
      } catch (requestError) {
        console.error('[AdminPage] 관리자 메인 현황 조회 실패:', requestError)

        if (!silent) {
          setError(
            getErrorMessage(
              requestError,
              '관리자 메인 현황을 불러오지 못했습니다.',
            ),
          )
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }

        setRefreshing(false)
      }
    },
    [requesterUserId],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboardLists()
  }, [loadDashboardLists])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDashboardLists({
        silent: true,
      })
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadDashboardLists])

  const handleRefresh = () => {
    setRefreshing(true)
    loadDashboardLists({
      silent: true,
    })
  }

  const scopeLabel =
    adminInfo.role === 'MASTER_ADMIN'
      ? '전체 도서관'
      : adminInfo.managedLibraryName || '담당 도서관 미지정'

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-gray-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-blue-600">현재 현황</p>

          <h2 className="mt-1 text-3xl font-black text-gray-950">희망도서</h2>

          <p className="mt-2 text-sm font-semibold text-gray-500">
            {scopeLabel} 기준 승인 대기 희망도서와 시민투표 현황입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-11 shrink-0 border-2 border-black bg-white px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:opacity-50"
        >
          {refreshing ? '새로고침 중...' : '현황 새로고침'}
        </button>
      </div>

      {loading && (
        <div className="mt-6 border-2 border-black">
          <LoadingBox message="관리자 메인 현황을 불러오는 중입니다." />
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 border-2 border-black">
          <ErrorBox message={error} onRetry={() => loadDashboardLists()} />
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <DashboardMetricCard
              icon="▣"
              label="승인 대기 희망도서"
              value={`${totalPendingApplications.toLocaleString()}건`}
              description={`오늘 접수 ${Number(
                dashboard?.todayCount ?? 0,
              ).toLocaleString()}건`}
              className="bg-pink-50"
            />

            <DashboardMetricCard
              icon="👥"
              label="실시간 주민 투표 수"
              value={`${Number(
                dashboard?.activeVoteCount ?? 0,
              ).toLocaleString()}표`}
              description={`승인 대기 ${Number(
                dashboard?.pendingCount ?? 0,
              ).toLocaleString()}건`}
              className="bg-blue-50"
            />

            <button
              type="button"
              onClick={onOpenApplications}
              className="min-w-0 border-2 border-black bg-yellow-100 p-5 text-left shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-700">
                    이번달 수급 추천
                  </p>

                  <p className="mt-2 line-clamp-2 text-xl font-black text-gray-950">
                    {recommendation?.title || '추천 후보가 없습니다.'}
                  </p>

                  <p className="mt-2 text-xs font-bold text-gray-500">
                    {recommendation
                      ? `수요예측률 ${formatApprovalRate(
                          recommendation.approvalProbability,
                        )}`
                      : '승인 대기 신청이 등록되면 표시됩니다.'}
                  </p>
                </div>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-black bg-white text-lg font-black text-blue-700">
                  ✓
                </span>
              </div>
            </button>
          </div>

          <DashboardApplicationTable
            title="승인 대기 희망도서·시민투표 리스트"
            description="항목을 클릭하면 해당 희망도서 신청 상세페이지로 이동합니다."
            items={pendingApplications}
            onOpenApplications={onOpenApplications}
            onOpenApplication={onOpenApplication}
          />
        </>
      )}
    </div>
  )
}

const DashboardMetricCard = ({
  icon,
  label,
  value,
  description,
  className = '',
}) => (
  <div
    className={`border-2 border-black p-5 shadow-[4px_4px_0_0] shadow-black ${className}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-black text-gray-700">{label}</p>

        <p className="mt-2 text-3xl font-black text-gray-950">{value}</p>

        <p className="mt-2 text-xs font-bold text-gray-500">{description}</p>
      </div>

      <span className="flex h-10 w-10 items-center justify-center border-2 border-black bg-white text-lg">
        {icon}
      </span>
    </div>
  </div>
)

const DashboardApplicationTable = ({
  title,
  description,
  items,
  onOpenApplications,
  onOpenApplication,
}) => (
  <section className="mt-8 min-w-0 max-w-full">
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-lg font-black text-gray-950">{title}</h3>

        <p className="mt-1 text-xs font-semibold text-gray-500">
          {description}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenApplications}
        className="inline-flex h-9 shrink-0 items-center justify-center border-2 border-black bg-white px-3 text-sm font-black transition hover:bg-purple-50"
      >
        전체 관리 →
      </button>
    </div>

    {items.length === 0 ? (
      <div className="border-2 border-black bg-white">
        <EmptyBox message="승인 대기 중인 희망도서 신청이 없습니다." />
      </div>
    ) : (
      <div className="overflow-hidden border-2 border-black bg-white">
        <div className="hidden grid-cols-[42px_minmax(0,1.65fr)_105px_minmax(0,1.2fr)_72px_82px_90px] gap-2 border-b-2 border-black bg-blue-50 px-3 py-3 text-[11px] font-black xl:grid">
          <span className="text-center">순위</span>
          <span>도서 / 저자</span>
          <span>카테고리</span>
          <span>도서관 / ISBN</span>
          <span className="text-center">투표</span>
          <span className="text-center">신청일</span>
          <span className="text-center">수요예측률</span>
        </div>

        <div className="divide-y divide-gray-200">
          {items.map((item, index) => (
            <article
              key={`pending-${item.applicationId}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                onOpenApplication(item.applicationId)
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' ||
                  event.key === ' '
                ) {
                  event.preventDefault()
                  onOpenApplication(item.applicationId)
                }
              }}
              className="grid min-w-0 cursor-pointer gap-3 px-4 py-4 transition hover:bg-yellow-50 focus:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black xl:grid-cols-[42px_minmax(0,1.65fr)_105px_minmax(0,1.2fr)_72px_82px_90px] xl:items-center xl:gap-2 xl:px-3"
              aria-label={`${item.title || '희망도서'} 신청 상세페이지 열기`}
            >
              <div className="hidden text-center text-sm font-black xl:block">
                {index + 1}
              </div>

              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3 xl:block">
                  <p className="text-xs font-black text-gray-400 xl:hidden">
                    #{index + 1}
                  </p>

                  <span className="shrink-0 border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-800 xl:hidden">
                    {getApplicationCategoryName(item)}
                  </span>
                </div>

                <p className="mt-1 line-clamp-2 wrap-break-word text-sm font-black text-gray-950 xl:mt-0">
                  {item.title || '도서 제목 없음'}
                </p>

                <p className="mt-1 truncate text-xs font-semibold text-gray-500">
                  {item.author || '저자 정보 없음'}
                </p>
              </div>

              <div className="hidden min-w-0 xl:block">
                <span className="inline-flex max-w-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800">
                  <span className="truncate">
                    {getApplicationCategoryName(item)}
                  </span>
                </span>
              </div>

              <div className="min-w-0 border-t border-gray-100 pt-3 xl:border-0 xl:pt-0">
                <p className="truncate text-xs font-bold text-gray-700">
                  {item.libraryName || '-'}
                </p>

                <p className="mt-1 break-all text-[10px] text-gray-500">
                  {item.isbn || '-'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 xl:contents">
                <CompactMetric
                  label="시민투표"
                  value={`${Number(item.voteCount ?? 0).toLocaleString()}표`}
                  valueClassName="text-blue-700"
                />

                <CompactMetric
                  label="신청일"
                  value={formatDateOnly(item.createdAt)}
                />

                <CompactMetric
                  label="수요예측률"
                  value={formatApprovalRate(item.approvalProbability)}
                  valueClassName="text-indigo-700"
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    )}
  </section>
)

const CompactMetric = ({ label, value, valueClassName = 'text-gray-800' }) => (
  <div className="min-w-0 bg-gray-50 px-2 py-2 text-center xl:bg-transparent xl:px-1 xl:py-0">
    <p className="text-[9px] font-black text-gray-400 xl:hidden">{label}</p>
    <p
      className={`mt-0.5 truncate text-[11px] font-black xl:mt-0 ${valueClassName}`}
    >
      {value}
    </p>
  </div>
)

const formatApprovalRate = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-'
  }

  return `${Number(value).toFixed(1)}%`
}

const formatDateOnly = (value) => {
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
  }).format(date)
}

const ApplicationManagement = ({
  requesterUserId,
  dashboard,
  adminInfo,
  onChanged,
  onNotice,
  onOpenApplication,
}) => {
  const [keywordInput, setKeywordInput] = useState('')

  const [keyword, setKeyword] = useState('')

  const status = 'PENDING'

  const [sort, setSort] = useState('LATEST')

  const [page, setPage] = useState(1)

  const [result, setResult] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  })

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null)

  const [decisionLoading, setDecisionLoading] = useState(false)

  const [comment, setComment] = useState('')

  const loadList = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true)
      }

      setError('')

      try {
        const data = await getAdminApplications({
          requesterUserId,
          keyword,
          status,
          sort,
          page,
          pageSize: 10,
        })

        const content = Array.isArray(data?.content) ? data.content : []

        const preparedContent = content.map(prepareApplicationClassification)

        setResult({
          content: preparedContent,

          totalElements: data?.totalElements ?? 0,

          totalPages: data?.totalPages ?? 0,
        })

        enrichApplicationClassifications(preparedContent).then(
          (enrichedItems) => {
            setResult((currentResult) => ({
              ...currentResult,
              content: mergeApplicationClassifications(
                currentResult.content,
                enrichedItems,
              ),
            }))
          },
        )
      } catch (requestError) {
        if (!silent) {
          setError(
            getErrorMessage(
              requestError,
              '희망도서 신청 목록을 불러오지 못했습니다.',
            ),
          )
        } else {
          console.error(
            '[AdminPage] 희망도서 신청 목록 자동 갱신 실패:',
            requestError,
          )
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [keyword, page, requesterUserId, sort],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList()
  }, [loadList])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadList({
        silent: true,
      })
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [loadList])

  const openDetail = (applicationId) => {
    onOpenApplication(applicationId)
  }

  const decide = async (decision) => {
    if (!selected) {
      return
    }

    if (decision === 'REJECTED' && !comment.trim()) {
      onNotice({
        type: 'error',
        message: '거절 사유를 입력해주세요.',
      })

      return
    }

    setDecisionLoading(true)

    try {
      const updated = await decideAdminApplication({
        requesterUserId,

        applicationId: selected.applicationId,

        decision,

        adminComment: comment.trim() || null,
      })

      setSelected(updated)

      onNotice({
        type: 'success',

        message:
          decision === 'APPROVED'
            ? '희망도서 신청을 승인했습니다.'
            : '희망도서 신청을 거절했습니다.',
      })

      await Promise.all([loadList(), onChanged()])
    } catch (requestError) {
      onNotice({
        type: 'error',

        message: getErrorMessage(requestError, '신청 처리에 실패했습니다.'),
      })
    } finally {
      setDecisionLoading(false)
    }
  }

  const handleSearch = (event) => {
    event.preventDefault()

    setKeyword(keywordInput.trim())

    setPage(1)
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-gray-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-blue-600">
            {adminInfo.managedLibraryName ||
              (adminInfo.role === 'MASTER_ADMIN'
                ? '전체 도서관'
                : '담당 도서관 미지정')}
          </p>

          <h2 className="mt-1 text-2xl font-black text-gray-950">
            희망도서 신청 관리
          </h2>
        </div>

        <p className="text-sm font-semibold text-gray-500">
          총 {Number(result.totalElements).toLocaleString()}건
        </p>
      </div>

      {adminInfo.role === 'ADMIN' &&
        !adminInfo.managedLibraryId &&
        !adminInfo.managedLibraryCode && (
          <div className="mt-5 border-2 border-red-300 bg-red-50 p-4 text-sm font-black text-red-800">
            담당 도서관이 지정되지 않아 희망도서 신청을 조회할 수 없습니다.
            관리자 정보에서 담당 도서관을 지정해주세요.
          </div>
        )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="승인 대기" value={dashboard?.pendingCount ?? 0} />

        <SummaryCard label="오늘 접수" value={dashboard?.todayCount ?? 0} />

        <SummaryCard
          label="활성 시민 투표"
          value={dashboard?.activeVoteCount ?? 0}
        />

        <SummaryCard
          label="평균 수요예측률"
          value={`${Number(dashboard?.averageApprovalProbability ?? 0).toFixed(
            1,
          )}%`}
        />
      </div>

      <form
        onSubmit={handleSearch}
        className="mt-6 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_110px]"
      >
        <input
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          placeholder="책 제목, 저자, ISBN, 카테고리, 신청자, 도서관 검색"
          className="h-11 border-2 border-black px-4 text-sm font-semibold outline-none focus:bg-yellow-50"
        />

        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value)

            setPage(1)
          }}
          className="h-11 border-2 border-black bg-white px-3 text-sm font-black"
        >
          <option value="LATEST">최신순</option>

          <option value="OLDEST">오래된 순</option>

          <option value="VOTES">투표 많은 순</option>

          <option value="AI">수요예측률순</option>
        </select>

        <button
          type="submit"
          className="h-11 border-2 border-black bg-yellow-200 font-black shadow-[3px_3px_0_0] shadow-black"
        >
          검색
        </button>
      </form>

      <div className="mt-5 min-w-0">
        {loading && (
          <div className="border-2 border-black bg-white">
            <LoadingBox message="신청 목록을 불러오는 중입니다." />
          </div>
        )}

        {!loading && error && (
          <div className="border-2 border-black bg-white">
            <ErrorBox message={error} onRetry={() => loadList()} />
          </div>
        )}

        {!loading && !error && result.content.length === 0 && (
          <div className="border-2 border-black bg-white">
            <EmptyBox message="조건에 맞는 희망도서 신청이 없습니다." />
          </div>
        )}

        {!loading && !error && result.content.length > 0 && (
          <div className="grid gap-4">
            {result.content.map((item) => {
              const statusInfo = STATUS_INFO[item.status] || STATUS_INFO.PENDING

              return (
                <article
                  key={item.applicationId}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    openDetail(item.applicationId)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' ||
                      event.key === ' '
                    ) {
                      event.preventDefault()
                      openDetail(item.applicationId)
                    }
                  }}
                  className="min-w-0 cursor-pointer border-2 border-black bg-white p-4 shadow-[3px_3px_0_0] shadow-black transition hover:-translate-y-0.5 hover:bg-yellow-50 hover:shadow-[5px_5px_0_0] focus:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-black"
                  aria-label={`${item.title || '희망도서'} 신청 상세페이지 열기`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-gray-400">
                          신청 #{item.applicationId}
                        </span>

                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>

                        <span className="max-w-full border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800">
                          {getApplicationCategoryName(item)}
                        </span>
                      </div>

                      <h3 className="mt-2 line-clamp-2 wrap-break-word text-lg font-black text-gray-950">
                        {item.title || '도서 제목 없음'}
                      </h3>

                      <p className="mt-1 truncate text-sm font-semibold text-gray-500">
                        {item.author || '저자 정보 없음'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openDetail(item.applicationId)
                      }}
                      className="shrink-0 border-2 border-black bg-yellow-100 px-4 py-2 text-xs font-black transition hover:bg-yellow-200"
                    >
                      상세페이지
                    </button>
                  </div>

                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ManagementInfoBlock
                      label="신청자"
                      primary={item.applicantName || '-'}
                      secondary={item.applicantLoginId || '-'}
                    />

                    <ManagementInfoBlock
                      label="신청 도서관"
                      primary={item.libraryName || '-'}
                      secondary={`ISBN ${item.isbn || '-'}`}
                    />

                    <div className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-1">
                      <ManagementMetric
                        label="시민투표"
                        value={`${Number(item.voteCount ?? 0).toLocaleString()}표`}
                        valueClassName="text-blue-700"
                      />

                      <ManagementMetric
                        label="수요예측률"
                        value={formatApprovalRate(item.approvalProbability)}
                        valueClassName="text-indigo-700"
                      />

                      <ManagementMetric
                        label="신청일"
                        value={formatDateOnly(item.createdAt)}
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {result.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={result.totalPages}
          onChange={setPage}
        />
      )}

      {selected && (
        <ApplicationDetailModal
          application={selected}
          comment={comment}
          onCommentChange={setComment}
          onClose={() => setSelected(null)}
          onApprove={() => decide('APPROVED')}
          onReject={() => decide('REJECTED')}
          loading={decisionLoading}
        />
      )}
    </div>
  )
}

const ManagementInfoBlock = ({ label, primary, secondary }) => (
  <div className="min-w-0 border border-gray-200 bg-gray-50 px-3 py-3">
    <p className="text-[10px] font-black text-gray-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black text-gray-800">{primary}</p>
    <p className="mt-1 break-all text-[11px] font-semibold text-gray-500">
      {secondary}
    </p>
  </div>
)

const ManagementMetric = ({
  label,
  value,
  valueClassName = 'text-gray-800',
}) => (
  <div className="min-w-0 border border-gray-200 bg-gray-50 px-2 py-3 text-center">
    <p className="text-[9px] font-black text-gray-400">{label}</p>
    <p className={`mt-1 wrap-break-word text-xs font-black ${valueClassName}`}>
      {value}
    </p>
  </div>
)

const PromotionManagement = ({
  masterAdminId,
  pendingPromotionCount,
  onCountChanged,
  onNotice,
}) => {
  const [status, setStatus] = useState('PENDING')

  const [requests, setRequests] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null)

  const [comment, setComment] = useState('')

  const [processing, setProcessing] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getPromotionRequests({
        masterAdminId,

        status: status === 'ALL' ? null : status,
      })

      setRequests(
        Array.isArray(data) ? data.map(normalizePromotionRequest) : [],
      )
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          '관리자 등업 신청 목록을 불러오지 못했습니다.',
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [masterAdminId, status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRequests()
  }, [loadRequests])

  const openDetail = (request) => {
    setSelected(request)

    setComment(request.masterComment || '')
  }

  const closeDetail = () => {
    if (processing) {
      return
    }

    setSelected(null)
    setComment('')
  }

  const processRequest = async (decision) => {
    if (!selected) {
      return
    }

    if (decision === 'REJECTED' && !comment.trim()) {
      onNotice({
        type: 'error',

        message: '거절 사유를 입력해주세요.',
      })

      return
    }

    setProcessing(true)

    try {
      const params = {
        requestId: selected.requestId,

        masterAdminId,

        comment:
          decision === 'APPROVED'
            ? comment.trim() || '관리자 등업 승인'
            : comment.trim(),
      }

      if (decision === 'APPROVED') {
        await approvePromotionRequest(params)
      } else {
        await rejectPromotionRequest(params)
      }

      setSelected(null)
      setComment('')

      onNotice({
        type: 'success',

        message:
          decision === 'APPROVED'
            ? '관리자 등업 신청을 승인했습니다.'
            : '관리자 등업 신청을 거절했습니다.',
      })

      await Promise.all([loadRequests(), onCountChanged()])
    } catch (requestError) {
      onNotice({
        type: 'error',

        message: getErrorMessage(
          requestError,

          decision === 'APPROVED'
            ? '등업 신청 승인에 실패했습니다.'
            : '등업 신청 거절에 실패했습니다.',
        ),
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-gray-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-purple-600">최고 관리자 전용</p>

          <h2 className="mt-1 text-2xl font-black text-gray-950">
            관리자 등업 신청 관리
          </h2>

          <p className="mt-2 text-sm font-semibold text-gray-500">
            신청자의 재직 정보와 담당 도서관을 확인한 후 승인하거나 거절할 수
            있습니다.
          </p>
        </div>

        <div className="rounded-full border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-black text-purple-800">
          현재 목록 {requests.length}건
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="현재 승인 대기" value={pendingPromotionCount} />

          <SummaryCard
            label="목록 상태"
            value={PROMOTION_STATUS_INFO[status]?.label || '전체'}
          />
        </div>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-11 border-2 border-black bg-white px-4 text-sm font-black"
        >
          <option value="PENDING">승인 대기</option>

          <option value="ALL">전체 상태</option>

          <option value="APPROVED">승인</option>

          <option value="REJECTED">거절</option>

          <option value="CANCELED">취소</option>
        </select>
      </div>

      <div className="mt-5 overflow-x-auto border-2 border-black">
        {loading && (
          <LoadingBox message="등업 신청 목록을 불러오는 중입니다." />
        )}

        {!loading && error && (
          <ErrorBox message={error} onRetry={loadRequests} />
        )}

        {!loading && !error && requests.length === 0 && (
          <EmptyBox message="해당 상태의 관리자 등업 신청이 없습니다." />
        )}

        {!loading && !error && requests.length > 0 && (
          <table className="min-w-262.5 w-full border-collapse text-sm">
            <thead className="bg-purple-50">
              <tr>
                {[
                  '신청번호',
                  '신청자',
                  '이메일',
                  '도서관',
                  '부서/사번',
                  '연락처',
                  '신청일',
                  '상태',
                  '관리',
                ].map((label) => (
                  <th
                    key={label}
                    className="border-b-2 border-black px-3 py-3 text-left font-black"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {requests.map((request) => {
                const statusInfo =
                  PROMOTION_STATUS_INFO[request.status] ||
                  PROMOTION_STATUS_INFO.PENDING

                return (
                  <tr
                    key={request.requestId}
                    className="border-b border-gray-200 last:border-b-0 hover:bg-purple-50"
                  >
                    <td className="px-3 py-3 font-black">
                      #{request.requestId}
                    </td>

                    <td className="px-3 py-3">
                      <p className="font-black">{request.name || '-'}</p>

                      <p className="mt-1 text-xs text-gray-500">
                        {request.loginId || '-'}
                      </p>
                    </td>

                    <td className="px-3 py-3">{request.email || '-'}</td>

                    <td className="px-3 py-3">
                      <p className="font-bold">{request.libraryName || '-'}</p>

                      <p className="mt-1 text-xs text-gray-500">
                        {request.libraryCode || '-'}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <p>{request.department || '-'}</p>

                      <p className="mt-1 text-xs text-gray-500">
                        사번: {request.employeeNumber || '-'}
                      </p>
                    </td>

                    <td className="px-3 py-3">{request.contact || '-'}</td>

                    <td className="px-3 py-3">
                      {formatDate(request.createdAt)}
                    </td>

                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-black ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openDetail(request)}
                        className="border-2 border-black bg-white px-3 py-2 text-xs font-black hover:bg-purple-100"
                      >
                        상세/처리
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <PromotionDetailModal
          request={selected}
          comment={comment}
          onCommentChange={setComment}
          onClose={closeDetail}
          onApprove={() => processRequest('APPROVED')}
          onReject={() => processRequest('REJECTED')}
          loading={processing}
        />
      )}
    </div>
  )
}

const PromotionDetailModal = ({
  request,
  comment,
  onCommentChange,
  onClose,
  onApprove,
  onReject,
  loading,
}) => {
  const pending = request.status === 'PENDING'

  const statusInfo =
    PROMOTION_STATUS_INFO[request.status] || PROMOTION_STATUS_INFO.PENDING

  return (
    <ModalShell title="관리자 등업 신청 상세" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="신청 번호" value={`#${request.requestId}`} />

        <InfoItem label="상태" value={statusInfo.label} />

        <InfoItem label="회원 번호" value={`#${request.userId}`} />

        <InfoItem
          label="신청자"
          value={`${request.name || '-'} (${request.loginId || '-'})`}
        />

        <InfoItem label="이메일" value={request.email || '-'} />

        <InfoItem label="연락처" value={request.contact || '-'} />

        <InfoItem label="도서관명" value={request.libraryName || '-'} />

        <InfoItem label="도서관 코드" value={request.libraryCode || '-'} />

        <InfoItem label="부서" value={request.department || '-'} />

        <InfoItem label="사원번호" value={request.employeeNumber || '-'} />

        <InfoItem label="신청일" value={formatDate(request.createdAt)} />

        <InfoItem label="처리일" value={formatDate(request.processedAt)} />
      </div>

      <div className="mt-5 border-2 border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-black text-gray-500">등업 신청 사유</p>

        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
          {request.reason || '-'}
        </p>
      </div>

      {!pending && request.masterAdminName && (
        <div className="mt-5 border-2 border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-black text-purple-700">처리 관리자</p>

          <p className="mt-1 text-sm font-black">{request.masterAdminName}</p>
        </div>
      )}

      <label className="mt-5 block">
        <span className="text-sm font-black">최고 관리자 의견</span>

        <textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          disabled={!pending || loading}
          rows={5}
          placeholder="승인 의견 또는 거절 사유를 입력하세요. 거절 시 사유는 필수입니다."
          className="mt-2 w-full resize-none border-2 border-black p-4 text-sm outline-none disabled:bg-gray-100"
        />
      </label>

      {pending && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="border-2 border-red-600 bg-red-100 px-6 py-3 font-black text-red-800 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '등업 거절'}
          </button>

          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="border-2 border-purple-600 bg-purple-100 px-6 py-3 font-black text-purple-800 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '관리자 승인'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

const MemberManagement = ({ requesterUserId, currentUserId, onNotice }) => {
  const [keywordInput, setKeywordInput] = useState('')

  const [keyword, setKeyword] = useState('')

  const [role, setRole] = useState('ALL')

  const [status, setStatus] = useState('ACTIVE')

  const [page, setPage] = useState(1)

  const [result, setResult] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  })

  const [libraries, setLibraries] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null)

  const [selectedRole, setSelectedRole] = useState('USER')

  const [selectedLibraryId, setSelectedLibraryId] = useState('')

  const [saving, setSaving] = useState(false)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getAdminMembers({
        requesterUserId,
        keyword,
        role,
        status,
        page,
        pageSize: 10,
      })

      setResult({
        content: data?.content || [],

        totalElements: data?.totalElements || 0,

        totalPages: data?.totalPages || 0,
      })
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, '회원 목록을 불러오지 못했습니다.'),
      )
    } finally {
      setLoading(false)
    }
  }, [keyword, page, requesterUserId, role, status])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMembers()
  }, [loadMembers])

  useEffect(() => {
    const loadLibraries = async () => {
      try {
        const data = await getAdminLibraries(requesterUserId)

        setLibraries(Array.isArray(data) ? data : [])
      } catch (requestError) {
        console.error('[AdminPage] 도서관 목록 조회 실패:', requestError)
      }
    }

    loadLibraries()
  }, [requesterUserId])

  const openMember = (memberItem) => {
    setSelected(memberItem)

    setSelectedRole(memberItem.role)

    setSelectedLibraryId(memberItem.managedLibraryId || '')
  }

  const saveRole = async () => {
    if (!selected) {
      return
    }

    if (selectedRole === 'ADMIN' && !selectedLibraryId) {
      onNotice({
        type: 'error',

        message: '일반 관리자의 담당 도서관을 선택해주세요.',
      })

      return
    }

    setSaving(true)

    try {
      const updated = await updateAdminMemberRole({
        requesterUserId,

        targetUserId: selected.userId,

        role: selectedRole,

        managedLibraryId:
          selectedRole === 'ADMIN' ? Number(selectedLibraryId) : null,
      })

      setSelected(updated)

      setSelectedRole(updated.role)

      setSelectedLibraryId(updated.managedLibraryId || '')

      onNotice({
        type: 'success',

        message: '회원 등급이 변경되었습니다.',
      })

      await loadMembers()
    } catch (requestError) {
      onNotice({
        type: 'error',

        message: getErrorMessage(
          requestError,
          '회원 등급 변경에 실패했습니다.',
        ),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSearch = (event) => {
    event.preventDefault()

    setKeyword(keywordInput.trim())

    setPage(1)
  }

  return (
    <div>
      <div className="border-b border-gray-300 pb-5">
        <p className="text-sm font-black text-purple-600">최고 관리자 전용</p>

        <h2 className="mt-1 text-2xl font-black">회원정보 및 등급 관리</h2>
      </div>

      <form
        onSubmit={handleSearch}
        className="mt-6 grid gap-3 lg:grid-cols-[1fr_160px_160px_100px]"
      >
        <input
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          placeholder="아이디, 이름, 닉네임, 이메일 검색"
          className="h-11 border-2 border-black px-4 text-sm font-semibold"
        />

        <select
          value={role}
          onChange={(event) => {
            setRole(event.target.value)

            setPage(1)
          }}
          className="h-11 border-2 border-black bg-white px-3 font-black"
        >
          <option value="ALL">전체 등급</option>

          <option value="USER">일반 사용자</option>

          <option value="ADMIN">관리자</option>

          <option value="MASTER_ADMIN">최고 관리자</option>
        </select>

        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)

            setPage(1)
          }}
          className="h-11 border-2 border-black bg-white px-3 font-black"
        >
          <option value="ALL">전체 상태</option>

          <option value="ACTIVE">정상</option>

          <option value="BLOCKED">이용 정지</option>

          <option value="DELETED">탈퇴</option>
        </select>

        <button
          type="submit"
          className="h-11 border-2 border-black bg-purple-200 font-black shadow-[3px_3px_0_0] shadow-black"
        >
          검색
        </button>
      </form>

      <div className="mt-5 overflow-x-auto border-2 border-black">
        {loading && <LoadingBox message="회원 목록을 불러오는 중입니다." />}

        {!loading && error && (
          <ErrorBox message={error} onRetry={loadMembers} />
        )}

        {!loading && !error && result.content.length === 0 && (
          <EmptyBox message="조건에 맞는 회원이 없습니다." />
        )}

        {!loading && !error && result.content.length > 0 && (
          <table className="min-w-237.5 w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {[
                  '회원번호',
                  '아이디',
                  '회원명',
                  '이메일',
                  '등급',
                  '상태',
                  '관리 도서관',
                  '관리',
                ].map((label) => (
                  <th
                    key={label}
                    className="border-b-2 border-black px-3 py-3 text-left font-black"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {result.content.map((memberItem) => {
                const roleInfo = ROLE_INFO[memberItem.role] || ROLE_INFO.USER

                const statusInfo =
                  MEMBER_STATUS_INFO[memberItem.status] ||
                  MEMBER_STATUS_INFO.ACTIVE

                return (
                  <tr
                    key={memberItem.userId}
                    className="border-b border-gray-200 last:border-b-0 hover:bg-purple-50"
                  >
                    <td className="px-3 py-3 font-black">
                      #{memberItem.userId}
                    </td>

                    <td className="px-3 py-3">{memberItem.loginId}</td>

                    <td className="px-3 py-3 font-bold">{memberItem.name}</td>

                    <td className="px-3 py-3">{memberItem.email || '-'}</td>

                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs font-black ${roleInfo.className}`}
                      >
                        {roleInfo.label}
                      </span>
                    </td>

                    <td
                      className={`px-3 py-3 font-black ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </td>

                    <td className="px-3 py-3">
                      {memberItem.managedLibraryName || '-'}
                    </td>

                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openMember(memberItem)}
                        className="border-2 border-black bg-white px-3 py-2 text-xs font-black"
                      >
                        정보/등급관리
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {result.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={result.totalPages}
          onChange={setPage}
        />
      )}

      {selected && (
        <MemberDetailModal
          member={selected}
          currentUserId={currentUserId}
          selectedRole={selectedRole}
          onRoleChange={setSelectedRole}
          selectedLibraryId={selectedLibraryId}
          onLibraryChange={setSelectedLibraryId}
          libraries={libraries}
          onClose={() => setSelected(null)}
          onSave={saveRole}
          saving={saving}
        />
      )}
    </div>
  )
}

const AdminProfile = ({ adminInfo, onEdit }) => {
  const roleInfo = ROLE_INFO[adminInfo.role] || ROLE_INFO.ADMIN

  return (
    <div>
      <div className="border-b border-gray-300 pb-5">
        <p className="text-sm font-black text-blue-600">관리자 본인정보</p>

        <h2 className="mt-1 text-2xl font-black">계정 정보</h2>
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 border-2 border-black bg-yellow-50 p-6 sm:flex-row">
        <AdminProfileImage adminInfo={adminInfo} large />

        <div className="text-center sm:text-left">
          <p className="text-xl font-black text-gray-950">{adminInfo.name}</p>

          <p className="mt-1 text-sm font-semibold text-gray-500">
            {adminInfo.loginId}
          </p>

          <span
            className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${roleInfo.className}`}
          >
            {roleInfo.label}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <InfoItem label="회원 번호" value={adminInfo.userId} />

        <InfoItem label="로그인 아이디" value={adminInfo.loginId} />

        <InfoItem label="이름" value={adminInfo.name} />

        <InfoItem label="닉네임" value={adminInfo.nickname || '-'} />

        <InfoItem label="이메일" value={adminInfo.email || '-'} />

        <InfoItem label="권한" value={roleInfo.label} />

        <InfoItem
          label="담당 도서관"
          value={
            adminInfo.managedLibraryName ||
            (adminInfo.role === 'MASTER_ADMIN' ? '전체 도서관' : '-')
          }
        />

        <InfoItem
          label="외부 도서관 코드"
          value={adminInfo.managedLibraryCode || '-'}
        />

        <InfoItem
          label="승인 대기 신청"
          value={`${Number(
            adminInfo.pendingApplicationCount ?? 0,
          ).toLocaleString()}건`}
        />
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-6 border-2 border-black bg-yellow-200 px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black"
      >
        관리자 정보 수정
      </button>
    </div>
  )
}

const ApplicationDetailModal = ({
  application,
  comment,
  onCommentChange,
  onClose,
  onApprove,
  onReject,
  loading,
}) => {
  const statusInfo = STATUS_INFO[application.status] || STATUS_INFO.PENDING

  const pending = application.status === 'PENDING'

  return (
    <ModalShell title="희망도서 신청 상세" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="신청 번호" value={`#${application.applicationId}`} />

        <InfoItem label="상태" value={statusInfo.label} />

        <InfoItem label="도서명" value={application.title} />

        <InfoItem label="저자" value={application.author} />

        <InfoItem label="출판사" value={application.publisher || '-'} />

        <InfoItem
          label="카테고리"
          value={getApplicationCategoryName(application)}
        />

        <InfoItem label="ISBN" value={application.isbn} />

        <InfoItem
          label="신청자"
          value={`${application.applicantName} (${application.applicantLoginId})`}
        />

        <InfoItem label="신청 도서관" value={application.libraryName || '-'} />

        <InfoItem label="시민 투표" value={`${application.voteCount}표`} />

        <InfoItem
          label="수요예측률"
          value={
            application.approvalProbability === null
              ? '-'
              : `${Number(application.approvalProbability).toFixed(1)}%`
          }
        />

        <InfoItem label="신청일" value={formatDate(application.createdAt)} />

        <InfoItem label="처리일" value={formatDate(application.processedAt)} />
      </div>

      <div className="mt-5 border-2 border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-black text-gray-500">신청 사유</p>

        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {application.reason || '-'}
        </p>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-black">관리자 의견</span>

        <textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          disabled={!pending || loading}
          rows={5}
          placeholder="승인 의견 또는 거절 사유를 입력하세요."
          className="mt-2 w-full resize-none border-2 border-black p-4 text-sm outline-none disabled:bg-gray-100"
        />
      </label>

      {pending && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="border-2 border-red-600 bg-red-100 px-6 py-3 font-black text-red-800 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '거절'}
          </button>

          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="border-2 border-green-700 bg-green-100 px-6 py-3 font-black text-green-800 disabled:opacity-50"
          >
            {loading ? '처리 중...' : '승인'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

const MemberDetailModal = ({
  member,
  currentUserId,
  selectedRole,
  onRoleChange,
  selectedLibraryId,
  onLibraryChange,
  libraries,
  onClose,
  onSave,
  saving,
}) => {
  const editable =
    member.status === 'ACTIVE' &&
    Number(member.userId) !== Number(currentUserId)

  return (
    <ModalShell title="회원정보 및 등급 관리" onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoItem label="회원 번호" value={`#${member.userId}`} />

        <InfoItem label="아이디" value={member.loginId} />

        <InfoItem label="이름" value={member.name} />

        <InfoItem label="닉네임" value={member.nickname || '-'} />

        <InfoItem label="이메일" value={member.email || '-'} />

        <InfoItem
          label="상태"
          value={MEMBER_STATUS_INFO[member.status]?.label || member.status}
        />

        <InfoItem label="주소" value={member.address || '-'} />

        <InfoItem label="가입 방식" value={member.provider || 'LOCAL'} />

        <InfoItem label="가입일" value={formatDate(member.createdAt)} />

        <InfoItem label="수정일" value={formatDate(member.updatedAt)} />

        <InfoItem
          label="현재 담당 도서관"
          value={member.managedLibraryName || '-'}
        />

        <InfoItem
          label="외부 도서관 코드"
          value={member.managedLibraryCode || '-'}
        />
      </div>

      <div className="mt-6 border-2 border-purple-300 bg-purple-50 p-5">
        <h3 className="font-black text-purple-900">회원 등급 관리</h3>

        {!editable && (
          <p className="mt-2 text-sm font-bold text-red-700">
            탈퇴·정지 회원 또는 본인 계정의 등급은 이 화면에서 변경할 수
            없습니다.
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-black">회원 등급</span>

            <select
              value={selectedRole}
              onChange={(event) => {
                const nextRole = event.target.value

                onRoleChange(nextRole)

                if (nextRole !== 'ADMIN') {
                  onLibraryChange('')
                }
              }}
              disabled={!editable}
              className="mt-2 h-11 w-full border-2 border-black bg-white px-3 font-black disabled:bg-gray-100"
            >
              <option value="USER">일반 사용자</option>

              <option value="ADMIN">도서관 관리자</option>

              <option value="MASTER_ADMIN">최고 관리자</option>
            </select>
          </label>

          <label>
            <span className="text-sm font-black">담당 도서관</span>

            <select
              value={selectedLibraryId}
              onChange={(event) => onLibraryChange(event.target.value)}
              disabled={!editable || selectedRole !== 'ADMIN'}
              className="mt-2 h-11 w-full border-2 border-black bg-white px-3 font-black disabled:bg-gray-100"
            >
              <option value="">담당 도서관 선택</option>

              {libraries.map((library) => (
                <option key={library.libraryId} value={library.libraryId}>
                  {library.libraryName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedRole === 'ADMIN' && !selectedLibraryId && (
          <p className="mt-3 text-sm font-bold text-red-700">
            일반 관리자는 담당 도서관 지정이 필수입니다.
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={!editable || saving}
            className="border-2 border-black bg-purple-200 px-6 py-3 font-black shadow-[3px_3px_0_0] shadow-black disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
          >
            {saving ? '저장 중...' : '등급 변경 저장'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

const SummaryCard = ({ label, value }) => (
  <div className="border-2 border-black bg-white p-4 shadow-[3px_3px_0_0] shadow-black">
    <p className="text-xs font-black text-gray-500">{label}</p>

    <p className="mt-2 text-2xl font-black">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </p>
  </div>
)

const InfoItem = ({ label, value }) => (
  <div className="border border-gray-200 bg-gray-50 p-4">
    <p className="text-xs font-black text-gray-500">{label}</p>

    <p className="mt-1 wrap-break-word text-sm font-black text-gray-900">
      {value === null || value === undefined || value === '' ? '-' : value}
    </p>
  </div>
)

const Pagination = ({ page, totalPages, onChange }) => (
  <div className="mt-6 flex items-center justify-center gap-4">
    <button
      type="button"
      onClick={() => onChange(Math.max(1, page - 1))}
      disabled={page <= 1}
      className="border-2 border-black bg-white px-4 py-2 font-black disabled:bg-gray-200 disabled:text-gray-400"
    >
      이전
    </button>

    <span className="font-black">
      {page} / {totalPages}
    </span>

    <button
      type="button"
      onClick={() => onChange(Math.min(totalPages, page + 1))}
      disabled={page >= totalPages}
      className="border-2 border-black bg-white px-4 py-2 font-black disabled:bg-gray-200 disabled:text-gray-400"
    >
      다음
    </button>
  </div>
)

const ModalShell = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-9998 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8">
    <div className="w-full max-w-3xl border-2 border-black bg-white shadow-[7px_7px_0_0] shadow-black">
      <div className="flex items-center justify-between border-b-2 border-black bg-yellow-200 px-5 py-4">
        <h2 className="text-xl font-black">{title}</h2>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center border-2 border-black bg-white text-xl font-black"
        >
          ×
        </button>
      </div>

      <div className="max-h-[78vh] overflow-y-auto p-5 sm:p-7">{children}</div>
    </div>
  </div>
)

const SimpleNoticeModal = ({ notice, onClose }) => (
  <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/50 px-4">
    <div
      className={`w-full max-w-sm border-2 border-black p-6 text-center shadow-[6px_6px_0_0] shadow-black ${
        notice.type === 'error' ? 'bg-red-50' : 'bg-green-50'
      }`}
    >
      <p
        className={`font-black ${
          notice.type === 'error' ? 'text-red-800' : 'text-green-800'
        }`}
      >
        {notice.message}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 border-2 border-black bg-white px-5 py-2 font-black"
      >
        확인
      </button>
    </div>
  </div>
)

const LoadingBox = ({ message }) => (
  <div className="flex min-h-48 flex-col items-center justify-center bg-gray-50 p-6 text-center">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

    <p className="mt-4 font-black text-gray-700">{message}</p>
  </div>
)

const ErrorBox = ({ message, onRetry }) => (
  <div className="flex min-h-48 flex-col items-center justify-center bg-red-50 p-6 text-center">
    <p className="font-black text-red-800">{message}</p>

    <button
      type="button"
      onClick={onRetry}
      className="mt-4 border-2 border-black bg-white px-5 py-2 font-black"
    >
      다시 시도
    </button>
  </div>
)

const EmptyBox = ({ message }) => (
  <div className="flex min-h-48 items-center justify-center bg-gray-50 p-6 text-center font-black text-gray-500">
    {message}
  </div>
)

export default AdminPage
