import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import PasswordConfirmModal from '../../components/member/PasswordConfirmModal'
import useMemberStore from '../../store/useMemberStore'
import {
  saveProfileVerification,
  verifyMemberPassword,
} from '../../api/memberAccountApi'
import {
  getMyLikedBooks,
  getMyVotedApplications,
} from '../../api/memberActivityApi'
import { getMyApplications } from '../../api/applicationApi'

const API_SERVER_URL =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const API_ORIGIN = API_SERVER_URL.replace(/\/api\/?$/, '')

const PROMOTION_APPLY_PATH = '/promotion/apply'

const TAB_KEYS = new Set([
  'overview',
  'applications',
  'liked-books',
  'voted-applications',
])

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
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
}

const ROLE_INFO = {
  USER: {
    label: '일반 사용자',
    description: '도서 검색과 희망도서 신청 기능을 이용할 수 있습니다.',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  },
  ADMIN: {
    label: '도서관 관리자',
    description: '담당 도서관의 희망도서 신청을 관리할 수 있습니다.',
    className: 'border-blue-300 bg-blue-100 text-blue-800',
  },
  MASTER_ADMIN: {
    label: '최고 관리자',
    description: '관리자 등업 신청과 전체 시스템을 관리할 수 있습니다.',
    className: 'border-purple-300 bg-purple-100 text-purple-800',
  },
}

const USER_STATUS_INFO = {
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

const normalizeRole = (value) => {
  const role = String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  return ROLE_INFO[role] ? role : 'USER'
}

const normalizeUserStatus = (value) => {
  const status = String(value ?? 'ACTIVE')
    .trim()
    .toUpperCase()

  return USER_STATUS_INFO[status] ? status : 'ACTIVE'
}

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

const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data

  if (typeof data === 'string') {
    return data
  }

  return (
    data?.message || data?.detail || data?.error || error?.message || fallback
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

const getApplicationArray = (data) => {
  if (Array.isArray(data)) {
    return data
  }

  const candidates = [
    data?.content,
    data?.applications,
    data?.items,
    data?.data,
  ]

  return candidates.find(Array.isArray) || []
}

const normalizeApplication = (application, index) => {
  const rawStatus = String(
    application.status ??
      application.applicationStatus ??
      application.approvalStatus ??
      'PENDING',
  ).toUpperCase()

  const status = rawStatus === 'CANCELLED' ? 'CANCELED' : rawStatus

  return {
    id:
      application.id ??
      application.applicationId ??
      application.hopeApplicationId ??
      `application-${index}`,

    title:
      application.bookTitle ??
      application.title ??
      application.book?.title ??
      '도서 제목 없음',

    author:
      application.author ??
      application.bookAuthor ??
      application.book?.author ??
      '저자 정보 없음',

    publisher:
      application.publisher ??
      application.bookPublisher ??
      application.book?.publisher ??
      '출판사 정보 없음',

    isbn:
      application.isbn13 ??
      application.isbn ??
      application.book?.isbn13 ??
      application.book?.isbn ??
      '',

    libraryName:
      application.libraryName ??
      application.library?.name ??
      application.library?.libName ??
      '신청 도서관 정보 없음',

    status,

    reason:
      application.adminComment ??
      application.rejectReason ??
      application.rejectionReason ??
      application.adminReason ??
      application.statusReason ??
      application.reason ??
      '',

    createdAt:
      application.createdAt ??
      application.requestedAt ??
      application.appliedAt ??
      application.applicationDate ??
      '',

    processedAt:
      application.processedAt ??
      application.reviewedAt ??
      application.updatedAt ??
      '',

    approvalRate:
      application.approvalRate ??
      application.predictedApprovalRate ??
      application.expectedApprovalRate ??
      null,
  }
}

const MyPage = () => {
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

  const requestedTab = searchParams.get('tab') || 'overview'

  const activeTab = TAB_KEYS.has(requestedTab) ? requestedTab : 'overview'

  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordChecking, setPasswordChecking] = useState(false)

  useEffect(() => {
    if (!loginUser || !userId) {
      navigate('/member/login', {
        replace: true,
        state: {
          redirectTo: '/member/mypage',
        },
      })
      return
    }

    if (!TAB_KEYS.has(requestedTab)) {
      setSearchParams(
        {
          tab: 'overview',
        },
        {
          replace: true,
        },
      )
    }
  }, [loginUser, navigate, requestedTab, setSearchParams, userId])

  const account = useMemo(() => {
    const role = normalizeRole(
      loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority,
    )

    const status = normalizeUserStatus(
      loginUser?.status ?? loginUser?.userStatus,
    )

    return {
      userId,
      loginId:
        loginUser?.loginId ?? loginUser?.username ?? loginUser?.login_id ?? '-',
      name: loginUser?.name ?? loginUser?.userName ?? '사용자',
      nickname: loginUser?.nickname ?? loginUser?.nickName ?? '',
      email: loginUser?.email ?? '-',
      profileImageUrl: resolveProfileImageUrl(
        loginUser?.profileImageUrl ??
          loginUser?.profile_image_url ??
          loginUser?.profileUrl,
      ),
      role,
      status,
      managedLibraryId:
        loginUser?.managedLibraryId ?? loginUser?.managed_library_id ?? null,
      managedLibraryCode:
        loginUser?.managedLibraryCode ??
        loginUser?.managed_library_code ??
        null,
      managedLibraryName:
        loginUser?.managedLibraryName ?? loginUser?.managed_library_name ?? '',
      provider: loginUser?.provider ?? loginUser?.socialProvider ?? '',
    }
  }, [loginUser, userId])

  const changeTab = (tab) => {
    setSearchParams({ tab })
  }

  const openProfileEditVerification = () => {
    setPasswordInput('')
    setPasswordError('')
    setPasswordModalOpen(true)
  }

  const closeProfileEditVerification = () => {
    if (passwordChecking) {
      return
    }

    setPasswordModalOpen(false)
    setPasswordInput('')
    setPasswordError('')
  }

  const verifyPasswordForProfileEdit = async () => {
    if (!passwordInput.trim()) {
      setPasswordError('현재 비밀번호를 입력해주세요.')
      return
    }

    setPasswordChecking(true)
    setPasswordError('')

    try {
      const result = await verifyMemberPassword({
        userId,
        password: passwordInput,
      })

      saveProfileVerification({
        userId,
        verificationToken: result.verificationToken,
        expiresAt: result.expiresAt,
      })

      setPasswordModalOpen(false)
      setPasswordInput('')

      navigate('/member/edit')
    } catch (error) {
      console.error('[MyPage] 비밀번호 확인 실패:', error)

      setPasswordError(getErrorMessage(error, '비밀번호가 일치하지 않습니다.'))
    } finally {
      setPasswordChecking(false)
    }
  }

  if (!loginUser || !userId) {
    return null
  }

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_0] shadow-black">
            <MyPageHeader
              account={account}
              onEdit={openProfileEditVerification}
            />

            <div className="grid min-h-162.5 lg:grid-cols-[220px_1fr]">
              <MyPageSidebar activeTab={activeTab} onChange={changeTab} />

              <section className="min-w-0 p-5 sm:p-7">
                {activeTab === 'overview' && (
                  <AccountOverview
                    account={account}
                    onEdit={openProfileEditVerification}
                  />
                )}

                {activeTab === 'applications' && (
                  <MyApplicationsPanel userId={userId} />
                )}

                {activeTab === 'liked-books' && (
                  <LikedBooksPanel userId={userId} />
                )}

                {activeTab === 'voted-applications' && (
                  <VotedApplicationsPanel userId={userId} />
                )}
              </section>
            </div>
          </section>
        </div>
      </main>

      <PasswordConfirmModal
        open={passwordModalOpen}
        title="회원정보 수정 확인"
        message="회원정보를 수정하려면 현재 비밀번호를 확인해야 합니다."
        password={passwordInput}
        onPasswordChange={(value) => {
          setPasswordInput(value)
          setPasswordError('')
        }}
        onClose={closeProfileEditVerification}
        onConfirm={verifyPasswordForProfileEdit}
        loading={passwordChecking}
        errorMessage={passwordError}
        confirmLabel="확인 후 이동"
      />
    </BasicLayout>
  )
}

const MyPageHeader = ({ account, onEdit }) => {
  const roleInfo = ROLE_INFO[account.role] || ROLE_INFO.USER

  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageFailed(false)
  }, [account.profileImageUrl])

  const initial = account.name?.charAt(0) || account.loginId?.charAt(0) || 'U'

  return (
    <header className="border-b-2 border-black bg-white px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-yellow-100 text-2xl font-black">
            {account.profileImageUrl && !imageFailed ? (
              <img
                src={account.profileImageUrl}
                alt={`${account.name} 프로필`}
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span>{initial.toUpperCase()}</span>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-gray-950">
                {account.name}
              </h1>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-black ${roleInfo.className}`}
              >
                {roleInfo.label}
              </span>
            </div>

            <p className="mt-1 text-sm font-semibold text-gray-500">
              {account.nickname ? `@${account.nickname}` : account.loginId}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(account.role === 'ADMIN' || account.role === 'MASTER_ADMIN') && (
            <Link
              to="/admin?tab=applications"
              className="border-2 border-black bg-blue-100 px-5 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
            >
              관리자 페이지
            </Link>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="border-2 border-black bg-yellow-200 px-5 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            회원정보 수정
          </button>
        </div>
      </div>
    </header>
  )
}

const MyPageSidebar = ({ activeTab, onChange }) => (
  <aside className="border-b-2 border-black bg-gray-50 p-4 lg:border-b-0 lg:border-r-2">
    <nav className="grid gap-2 sm:grid-cols-4 lg:grid-cols-1">
      <SidebarButton
        active={activeTab === 'overview'}
        onClick={() => onChange('overview')}
      >
        내 정보
      </SidebarButton>

      <SidebarButton
        active={activeTab === 'applications'}
        onClick={() => onChange('applications')}
      >
        희망도서 신청 내역
      </SidebarButton>

      <SidebarButton
        active={activeTab === 'liked-books'}
        onClick={() => onChange('liked-books')}
      >
        좋아요한 도서
      </SidebarButton>

      <SidebarButton
        active={activeTab === 'voted-applications'}
        onClick={() => onChange('voted-applications')}
      >
        시민투표 공감 목록
      </SidebarButton>
    </nav>
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

const AccountOverview = ({ account, onEdit }) => {
  const roleInfo = ROLE_INFO[account.role] || ROLE_INFO.USER

  const statusInfo = USER_STATUS_INFO[account.status] || USER_STATUS_INFO.ACTIVE

  return (
    <div>
      <SectionTitle
        eyebrow="마이페이지"
        title="내 계정 정보"
        description={roleInfo.description}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <InfoCard label="회원 번호" value={account.userId} />
        <InfoCard label="로그인 아이디" value={account.loginId} />
        <InfoCard label="이름" value={account.name} />
        <InfoCard label="닉네임" value={account.nickname || '-'} />
        <InfoCard label="이메일" value={account.email || '-'} />
        <InfoCard
          label="계정 상태"
          value={statusInfo.label}
          valueClassName={statusInfo.className}
        />
        <InfoCard label="권한" value={roleInfo.label} />
        <InfoCard label="가입 방식" value={account.provider || 'LOCAL'} />
        <InfoCard
          label="담당 도서관"
          value={
            account.managedLibraryName ||
            (account.managedLibraryId
              ? `도서관 ID ${account.managedLibraryId}`
              : '-')
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="border-2 border-black bg-yellow-200 px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
        >
          회원정보 수정
        </button>

        {account.role === 'USER' && (
          <Link
            to={PROMOTION_APPLY_PATH}
            className="border-2 border-black bg-white px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
          >
            관리자 등업 신청
          </Link>
        )}
      </div>
    </div>
  )
}

const MyApplicationsPanel = ({ userId }) => {
  const [items, setItems] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadItems = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        const data = await getMyApplications(userId)

        const normalized = getApplicationArray(data)
          .map(normalizeApplication)
          .sort(
            (first, second) =>
              (new Date(second.createdAt).getTime() || 0) -
              (new Date(first.createdAt).getTime() || 0),
          )

        setItems(normalized)
      } catch (requestError) {
        console.error('[MyPage] 희망도서 신청 목록 조회 실패:', requestError)

        setItems([])
        setError(
          getErrorMessage(
            requestError,
            '희망도서 신청 목록을 불러오지 못했습니다.',
          ),
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems()
  }, [loadItems])

  const statusCounts = useMemo(
    () =>
      items.reduce(
        (counts, item) => {
          counts.ALL += 1

          if (counts[item.status] !== undefined) {
            counts[item.status] += 1
          }

          return counts
        },
        {
          ALL: 0,
          PENDING: 0,
          REVIEWING: 0,
          APPROVED: 0,
          REJECTED: 0,
          CANCELED: 0,
        },
      ),
    [items],
  )

  const filteredItems = useMemo(() => {
    if (selectedStatus === 'ALL') {
      return items
    }

    return items.filter((item) => item.status === selectedStatus)
  }, [items, selectedStatus])

  return (
    <div>
      <PanelHeader
        eyebrow="희망도서"
        title="나의 희망도서 신청 내역"
        description="신청한 도서의 검토 상태와 처리 결과를 확인합니다."
        refreshing={refreshing}
        onRefresh={() => loadItems(true)}
      />

      {!loading && !error && items.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            ['ALL', '전체'],
            ['PENDING', '검토 대기'],
            ['REVIEWING', '검토 중'],
            ['APPROVED', '승인'],
            ['REJECTED', '거절'],
            ['CANCELED', '취소'],
          ].map(([value, label]) => (
            <StatusFilterButton
              key={value}
              label={label}
              count={statusCounts[value]}
              active={selectedStatus === value}
              onClick={() => setSelectedStatus(value)}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        {loading && <LoadingState message="신청 목록을 불러오는 중입니다." />}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => loadItems()} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="📚"
            title="신청한 희망도서가 없습니다."
            description="도서 검색 후 도서관에 없는 책을 희망도서로 신청해보세요."
            linkTo="/books"
            linkLabel="도서 검색하러 가기"
          />
        )}

        {!loading &&
          !error &&
          items.length > 0 &&
          filteredItems.length === 0 && (
            <EmptyState
              icon="🔎"
              title="해당 상태의 신청 내역이 없습니다."
              description="다른 상태를 선택해 확인해주세요."
            />
          )}

        {!loading && !error && filteredItems.length > 0 && (
          <div className="grid gap-4">
            {filteredItems.map((item) => (
              <ApplicationCard key={item.id} application={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const LikedBooksPanel = ({ userId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadItems = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        const data = await getMyLikedBooks(userId)
        setItems(data)
      } catch (requestError) {
        console.error('[MyPage] 좋아요한 도서 조회 실패:', requestError)

        setItems([])
        setError(
          getErrorMessage(
            requestError,
            '좋아요한 도서 목록을 불러오지 못했습니다.',
          ),
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems()
  }, [loadItems])

  return (
    <div>
      <PanelHeader
        eyebrow="좋아요"
        title="좋아요한 도서"
        description="도서 상세페이지에서 좋아요한 도서를 모아볼 수 있습니다."
        refreshing={refreshing}
        onRefresh={() => loadItems(true)}
      />

      <div className="mt-6">
        {loading && (
          <LoadingState message="좋아요한 도서를 불러오는 중입니다." />
        )}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => loadItems()} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="♡"
            title="좋아요한 도서가 없습니다."
            description="관심 있는 도서의 상세페이지에서 좋아요를 눌러보세요."
            linkTo="/books"
            linkLabel="도서 찾아보기"
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <LikedBookCard key={`${item.isbn}-${item.likedAt}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const VotedApplicationsPanel = ({ userId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadItems = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        const data = await getMyVotedApplications(userId)
        setItems(data)
      } catch (requestError) {
        console.error('[MyPage] 시민투표 공감 목록 조회 실패:', requestError)

        setItems([])
        setError(
          getErrorMessage(
            requestError,
            '시민투표 공감 목록을 불러오지 못했습니다.',
          ),
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems()
  }, [loadItems])

  return (
    <div>
      <PanelHeader
        eyebrow="시민투표"
        title="내가 공감한 희망도서"
        description="시민투표에서 ‘저도 원해요’를 누른 신청을 확인합니다."
        refreshing={refreshing}
        onRefresh={() => loadItems(true)}
      />

      <div className="mt-6">
        {loading && (
          <LoadingState message="공감한 희망도서를 불러오는 중입니다." />
        )}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => loadItems()} />
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon="👍"
            title="공감한 시민투표가 없습니다."
            description="다른 사용자의 희망도서 신청에 공감 투표를 남겨보세요."
            linkTo="/citizen-votes"
            linkLabel="시민투표 참여하기"
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <VotedApplicationCard key={item.applicationId} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const PanelHeader = ({
  eyebrow,
  title,
  description,
  refreshing,
  onRefresh,
}) => (
  <div className="flex flex-col gap-4 border-b border-gray-300 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <SectionTitle eyebrow={eyebrow} title={title} description={description} />

    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 border-2 border-black bg-yellow-200 px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <RefreshIcon spinning={refreshing} />
      {refreshing ? '새로고침 중' : '목록 새로고침'}
    </button>
  </div>
)

const SectionTitle = ({ eyebrow, title, description }) => (
  <div>
    <p className="text-sm font-black text-blue-600">{eyebrow}</p>
    <h2 className="mt-1 text-2xl font-black text-gray-950">{title}</h2>
    {description && (
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
        {description}
      </p>
    )}
  </div>
)

const InfoCard = ({ label, value, valueClassName = '' }) => (
  <div className="border-2 border-black bg-gray-50 p-4">
    <p className="text-xs font-black text-gray-500">{label}</p>
    <p
      className={`mt-2 wrap-break-word text-sm font-black text-gray-900 ${valueClassName}`}
    >
      {value === null || value === undefined || value === '' ? '-' : value}
    </p>
  </div>
)

const StatusFilterButton = ({ label, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`border-2 px-4 py-4 text-left transition ${
      active
        ? 'border-black bg-gray-950 text-white shadow-[3px_3px_0_0] shadow-yellow-300'
        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-white'
    }`}
  >
    <span className="block text-xs font-bold">{label}</span>
    <span className="mt-1 block text-2xl font-black">
      {Number(count ?? 0).toLocaleString()}
    </span>
  </button>
)

const ApplicationCard = ({ application }) => {
  const statusInfo = STATUS_INFO[application.status] || {
    label: application.status || '상태 확인 중',
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  }

  const approvalRate =
    application.approvalRate !== null && application.approvalRate !== undefined
      ? Number(application.approvalRate)
      : null

  return (
    <article className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge statusInfo={statusInfo} />
            <span className="text-xs font-semibold text-gray-400">
              신청 번호 #{application.id}
            </span>
          </div>

          <h3 className="mt-3 wrap-break-word text-xl font-black text-gray-950">
            {application.title}
          </h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {application.author} · {application.publisher}
          </p>
        </div>

        {approvalRate !== null && !Number.isNaN(approvalRate) && (
          <div className="shrink-0 border border-indigo-200 bg-indigo-50 px-4 py-3 text-center">
            <p className="text-xs font-bold text-indigo-600">예상 승인률</p>
            <p className="mt-1 text-xl font-black text-indigo-900">
              {Math.round(approvalRate)}%
            </p>
          </div>
        )}
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-gray-200 pt-5 text-sm sm:grid-cols-[110px_1fr]">
        <dt className="font-black">신청 도서관</dt>
        <dd className="text-gray-600">{application.libraryName}</dd>

        <dt className="font-black">ISBN</dt>
        <dd className="break-all text-gray-600">{application.isbn || '-'}</dd>

        <dt className="font-black">신청 일시</dt>
        <dd className="text-gray-600">{formatDate(application.createdAt)}</dd>

        {application.processedAt && (
          <>
            <dt className="font-black">처리 일시</dt>
            <dd className="text-gray-600">
              {formatDate(application.processedAt)}
            </dd>
          </>
        )}
      </dl>

      {application.reason && (
        <div className="mt-5 border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-black text-gray-500">신청/처리 사유</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
            {application.reason}
          </p>
        </div>
      )}

      {application.isbn && (
        <div className="mt-5 flex justify-end">
          <Link
            to={`/books/${application.isbn}`}
            className="border-2 border-black bg-white px-4 py-2 text-sm font-black hover:bg-yellow-100"
          >
            도서 상세보기 →
          </Link>
        </div>
      )}
    </article>
  )
}

const LikedBookCard = ({ item }) => (
  <article className="flex h-full flex-col border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
    <div className="flex gap-4">
      <div className="h-32 w-24 shrink-0 overflow-hidden border-2 border-black bg-gray-100">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-gray-400">
            📖
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className="inline-flex border border-pink-300 bg-pink-100 px-2 py-1 text-xs font-black text-pink-800">
          ♥ 좋아요
        </span>
        <h3 className="mt-3 line-clamp-2 text-lg font-black text-gray-950">
          {item.title}
        </h3>
        <p className="mt-2 text-sm font-semibold text-gray-500">
          {item.author || '저자 정보 없음'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {item.publisher || '출판사 정보 없음'}
        </p>
      </div>
    </div>

    <div className="mt-5 border-t border-gray-200 pt-4 text-xs font-semibold text-gray-500">
      <p>ISBN: {item.isbn}</p>
      <p className="mt-1">좋아요 일시: {formatDate(item.likedAt)}</p>
    </div>

    <Link
      to={`/books/${item.isbn}`}
      className="mt-5 border-2 border-black bg-yellow-200 px-4 py-2 text-center text-sm font-black"
    >
      도서 상세보기
    </Link>
  </article>
)

const VotedApplicationCard = ({ item }) => {
  const status = String(item.status ?? 'PENDING').toUpperCase()

  const statusInfo = STATUS_INFO[status] || {
    label: status,
    className: 'border-gray-300 bg-gray-100 text-gray-700',
  }

  return (
    <article className="flex h-full flex-col border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge statusInfo={statusInfo} />
        <span className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-black text-blue-800">
          👍 {Number(item.voteCount ?? 0)}표
        </span>
      </div>

      <h3 className="mt-4 line-clamp-2 text-lg font-black text-gray-950">
        {item.title}
      </h3>
      <p className="mt-2 text-sm font-semibold text-gray-500">
        {item.author || '저자 정보 없음'}
      </p>
      <p className="mt-1 text-xs text-gray-400">
        {item.publisher || '출판사 정보 없음'}
      </p>

      <div className="mt-5 flex-1 border-t border-gray-200 pt-4 text-sm">
        <p>
          <span className="font-black">신청 도서관</span>
          <br />
          <span className="text-gray-600">{item.libraryName || '-'}</span>
        </p>
        <p className="mt-3 text-xs font-semibold text-gray-500">
          공감 일시: {formatDate(item.votedAt)}
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {item.isbn && (
          <Link
            to={`/books/${item.isbn}`}
            className="border-2 border-black bg-white px-3 py-2 text-center text-sm font-black"
          >
            도서 상세
          </Link>
        )}

        <Link
          to="/citizen-votes"
          className="border-2 border-black bg-yellow-200 px-3 py-2 text-center text-sm font-black"
        >
          시민투표 보기
        </Link>
      </div>
    </article>
  )
}

const StatusBadge = ({ statusInfo }) => (
  <span
    className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusInfo.className}`}
  >
    {statusInfo.label}
  </span>
)

const LoadingState = ({ message }) => (
  <div className="flex min-h-64 flex-col items-center justify-center border-2 border-gray-200 bg-gray-50 px-6 text-center">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
    <p className="mt-4 font-black text-gray-700">{message}</p>
  </div>
)

const ErrorState = ({ message, onRetry }) => (
  <div className="flex min-h-64 flex-col items-center justify-center border-2 border-red-200 bg-red-50 px-6 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-xl">
      !
    </div>
    <p className="mt-4 font-black text-red-900">목록을 불러오지 못했습니다.</p>
    <p className="mt-2 max-w-xl text-sm leading-6 text-red-700">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-5 border-2 border-black bg-white px-5 py-2.5 text-sm font-black"
    >
      다시 시도
    </button>
  </div>
)

const EmptyState = ({ icon, title, description, linkTo, linkLabel }) => (
  <div className="flex min-h-72 flex-col items-center justify-center border-2 border-dashed border-gray-300 bg-gray-50 px-6 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
      {icon}
    </div>
    <p className="mt-5 text-lg font-black text-gray-900">{title}</p>
    <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
    {linkTo && linkLabel && (
      <Link
        to={linkTo}
        className="mt-6 border-2 border-black bg-yellow-200 px-5 py-3 text-sm font-black shadow-[3px_3px_0_0] shadow-black"
      >
        {linkLabel}
      </Link>
    )}
  </div>
)

const RefreshIcon = ({ spinning }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`}
  >
    <path
      d="M20 11a8 8 0 1 0-2.34 5.66"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M20 5v6h-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default MyPage
