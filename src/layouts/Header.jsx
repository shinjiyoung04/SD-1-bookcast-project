import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useMemberStore from '../store/useMemberStore'
import AlertModal from '../components/common/AlertModal'

const API_SERVER_URL = (
  import.meta.env.VITE_API_SERVER_ORIGIN ||
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080'
).replace(/\/api\/?$/, '')

const ACQUISITION_CART_STORAGE_KEY = 'bookcast_acquisition_cart'
const ACQUISITION_CART_UPDATED_EVENT = 'bookcast-acquisition-cart-updated'

const MONTHLY_ACQUISITION_BUDGET = 1_000_000

const ROLE_INFO = {
  USER: {
    label: '일반 사용자',
    badgeClass: 'border-gray-400 bg-gray-100 text-gray-700',
  },

  ADMIN: {
    label: '관리자',
    badgeClass: 'border-blue-500 bg-blue-100 text-blue-800',
  },

  MASTER_ADMIN: {
    label: '최고 관리자',
    badgeClass: 'border-purple-500 bg-purple-100 text-purple-800',
  },
}

const normalizeRole = (value) => {
  const normalizedRole = String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  return ROLE_INFO[normalizedRole] ? normalizedRole : 'USER'
}

const safePositiveInteger = (value, fallback = 0) => {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return fallback
  }

  return Math.trunc(number)
}

const getCurrentMonthKey = () => {
  const now = new Date()

  const year = now.getFullYear()

  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

const readAcquisitionCartItems = () => {
  const currentMonthKey = getCurrentMonthKey()

  try {
    const savedValue = localStorage.getItem(ACQUISITION_CART_STORAGE_KEY)

    if (!savedValue) {
      return []
    }

    const parsedValue = JSON.parse(savedValue)

    if (Array.isArray(parsedValue)) {
      return parsedValue
    }

    const savedMonthKey = String(parsedValue?.monthKey ?? '').trim()

    const items = Array.isArray(parsedValue?.items) ? parsedValue.items : []

    if (savedMonthKey && savedMonthKey !== currentMonthKey) {
      return []
    }

    return items
  } catch (error) {
    console.error('[Header] 입고 예정 목록 조회 실패:', error)

    return []
  }
}

const readAcquisitionCartSummary = () => {
  const items = readAcquisitionCartItems()

  const summary = items.reduce(
    (result, item) => {
      const unitPrice = safePositiveInteger(
        item?.unitPrice ??
          item?.priceSales ??
          item?.priceStandard ??
          item?.price,
        0,
      )

      const quantity = safePositiveInteger(item?.quantity, 1)

      result.itemCount += 1
      result.totalQuantity += quantity
      result.usedAmount += unitPrice * quantity

      return result
    },
    {
      itemCount: 0,
      totalQuantity: 0,
      usedAmount: 0,
    },
  )

  return {
    ...summary,

    remainingAmount: MONTHLY_ACQUISITION_BUDGET - summary.usedAmount,
  }
}

const formatCurrency = (value) => {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0원'
  }

  return `${number.toLocaleString('ko-KR')}원`
}

const Header = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const userMenuRef = useRef(null)

  const { member, memberInfo, user, logout, clearMember } = useMemberStore()

  const loginUser = member || memberInfo || user

  const isLogin = Boolean(loginUser)

  const role = normalizeRole(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority,
  )

  const roleInfo = ROLE_INFO[role]

  const isUser = role === 'USER'

  const isAdmin = role === 'ADMIN'

  const isMasterAdmin = role === 'MASTER_ADMIN'

  const canAccessAdminPage = isAdmin || isMasterAdmin

  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const [profileImageFailed, setProfileImageFailed] = useState(false)

  const [logoutModal, setLogoutModal] = useState(null)

  const [logoutLoading, setLogoutLoading] = useState(false)

  const [acquisitionSummary, setAcquisitionSummary] = useState(() =>
    readAcquisitionCartSummary(),
  )

  const managedLibraryName = String(
    loginUser?.managedLibraryName ??
      loginUser?.managed_library_name ??
      loginUser?.managedLibrary?.libraryName ??
      loginUser?.managedLibrary?.name ??
      loginUser?.libraryName ??
      '',
  ).trim()

  const getProfileImageUrl = (url) => {
    const imageUrl = String(url ?? '').trim()

    if (!imageUrl) {
      return null
    }

    if (
      imageUrl.startsWith('http://') ||
      imageUrl.startsWith('https://') ||
      imageUrl.startsWith('data:')
    ) {
      return imageUrl
    }

    return (
      `${API_SERVER_URL}` +
      `${imageUrl.startsWith('/') ? '' : '/'}` +
      `${imageUrl}`
    )
  }

  const profileImageUrl = getProfileImageUrl(
    loginUser?.profileImageUrl ??
      loginUser?.profile_image_url ??
      loginUser?.profileUrl,
  )

  const displayName =
    loginUser?.nickname ||
    loginUser?.name ||
    loginUser?.loginId ||
    loginUser?.username ||
    '사용자'

  const userEmail = loginUser?.email || loginUser?.loginId || ''

  const remainingBudgetIsExceeded = acquisitionSummary.remainingAmount < 0

  const remainingBudgetIsLow =
    !remainingBudgetIsExceeded && acquisitionSummary.remainingAmount <= 200_000

  const syncAcquisitionSummary = () => {
    setAcquisitionSummary(readAcquisitionCartSummary())
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileImageFailed(false)
  }, [profileImageUrl])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncAcquisitionSummary()

    window.addEventListener('storage', syncAcquisitionSummary)

    window.addEventListener('focus', syncAcquisitionSummary)

    window.addEventListener(
      ACQUISITION_CART_UPDATED_EVENT,
      syncAcquisitionSummary,
    )

    return () => {
      window.removeEventListener('storage', syncAcquisitionSummary)

      window.removeEventListener('focus', syncAcquisitionSummary)

      window.removeEventListener(
        ACQUISITION_CART_UPDATED_EVENT,
        syncAcquisitionSummary,
      )
    }
  }, [location.pathname])

  useEffect(() => {
    if (!userMenuOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)

      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [userMenuOpen])

  const closeUserMenu = () => {
    setUserMenuOpen(false)
  }

  const handleLogoutRequest = () => {
    closeUserMenu()

    setLogoutModal('confirm')
  }

  const performLogout = async () => {
    if (logoutLoading) {
      return
    }

    setLogoutLoading(true)

    try {
      if (typeof logout === 'function') {
        await Promise.resolve(logout())
      } else if (typeof clearMember === 'function') {
        await Promise.resolve(clearMember())
      } else {
        useMemberStore.setState((state) => ({
          ...state,

          member: null,
          memberInfo: null,
          user: null,

          accessToken: null,
          refreshToken: null,

          isLogin: false,
          isLoggedIn: false,
        }))
      }

      if (useMemberStore.persist?.clearStorage) {
        await Promise.resolve(useMemberStore.persist.clearStorage())
      }

      sessionStorage.removeItem('bookcast-profile-verification')

      setLogoutModal('success')
    } catch (error) {
      console.error('[Header] 로그아웃 처리 실패:', error)

      setLogoutModal('error')
    } finally {
      setLogoutLoading(false)
    }
  }

  const closeLogoutModal = () => {
    if (logoutLoading) {
      return
    }

    setLogoutModal(null)
  }

  const closeLogoutSuccessModal = () => {
    setLogoutModal(null)

    navigate('/', {
      replace: true,
    })
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-black bg-white">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:gap-5 lg:px-8">
          {/* BookCast 로고 */}
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-3"
            aria-label="BookCast 메인으로 이동"
          >
            <span className="flex h-11 w-11 items-center justify-center border-2 border-black bg-yellow-200 text-xl font-black text-black shadow-[3px_3px_0_0] shadow-black transition group-hover:translate-x-0.75 group-hover:translate-y-0.75 group-hover:shadow-none">
              B
            </span>

            <span className="hidden sm:block">
              <span className="block text-xl font-black tracking-[-0.04em] text-gray-950">
                BOOKCAST
              </span>

              <span className="mt-0.5 block text-[10px] font-black tracking-[0.18em] text-gray-400">
                LIBRARY SERVICE
              </span>
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-1 lg:gap-2">
            {/* 공통 도서 검색 */}
            <Link
              to="/books"
              className="hidden whitespace-nowrap border-2 border-transparent px-3 py-2 text-sm font-black text-gray-700 transition hover:border-black hover:bg-yellow-100 sm:block"
            >
              도서검색
            </Link>

            {/* 일반 사용자 전용 희망도서 신청 */}
            {isLogin && isUser && (
              <Link
                to="/book/request"
                className="hidden whitespace-nowrap border-2 border-transparent px-3 py-2 text-sm font-black text-gray-700 transition hover:border-black hover:bg-yellow-100 lg:block"
              >
                희망도서 신청
              </Link>
            )}

            {/*
             * USER: 시민투표
             * ADMIN / MASTER_ADMIN: 시민투표 현황
             */}
            {isLogin && (
              <Link
                to="/citizen-votes"
                className="hidden whitespace-nowrap border-2 border-transparent px-3 py-2 text-sm font-black text-gray-700 transition hover:border-black hover:bg-yellow-100 md:block"
              >
                {canAccessAdminPage ? '시민투표 현황' : '시민투표'}
              </Link>
            )}

            {/*
             * 일반 관리자 전용 입고·예산 요약
             * 최고 관리자는 특정 도서관 입고 담당이 아니므로 제외
             */}
            {isLogin && isAdmin && (
              <Link
                to="/admin/acquisitions"
                title={
                  `입고 예정 ` +
                  `${acquisitionSummary.itemCount}종 · ` +
                  `${acquisitionSummary.totalQuantity}권 · ` +
                  `사용 ${formatCurrency(acquisitionSummary.usedAmount)}`
                }
                className={`hidden shrink-0 items-center gap-2 border-2 border-black px-3 py-2 text-xs font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none xl:flex ${
                  remainingBudgetIsExceeded
                    ? 'bg-red-100 text-red-800'
                    : remainingBudgetIsLow
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-blue-50 text-blue-900'
                }`}
              >
                <span className="whitespace-nowrap">
                  입고 {acquisitionSummary.itemCount}종
                </span>

                <span className="text-gray-400">/</span>

                <span className="whitespace-nowrap">
                  잔여 {formatCurrency(acquisitionSummary.remainingAmount)}
                </span>
              </Link>
            )}

            <nav className="flex min-w-0 items-center">
              {!isLogin ? (
                <Link
                  to="/member/login"
                  className="whitespace-nowrap border-2 border-black bg-yellow-200 px-4 py-2 text-sm font-black text-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                >
                  로그인
                </Link>
              ) : (
                <div
                  ref={userMenuRef}
                  className="relative ml-1 border-l-2 border-gray-200 pl-2 sm:ml-2 sm:pl-3"
                  onMouseEnter={() => setUserMenuOpen(true)}
                  onMouseLeave={() => setUserMenuOpen(false)}
                  onFocusCapture={() => setUserMenuOpen(true)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setUserMenuOpen(false)
                    }
                  }}
                >
                  {/* 사용자 정보 버튼 */}
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((previous) => !previous)}
                    className={`flex min-w-0 items-center gap-2 border-2 px-2.5 py-2 text-left transition ${
                      userMenuOpen
                        ? 'border-black bg-yellow-50'
                        : 'border-transparent hover:border-black hover:bg-yellow-50'
                    }`}
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                  >
                    {profileImageUrl && !profileImageFailed ? (
                      <img
                        src={profileImageUrl}
                        alt={`${displayName} 프로필`}
                        className="h-9 w-9 shrink-0 rounded-full border-2 border-black object-cover"
                        onError={() => setProfileImageFailed(true)}
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-black bg-yellow-200 text-sm font-black text-black">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="hidden min-w-0 sm:block">
                      <div className="flex max-w-52 items-center gap-2">
                        <span className="max-w-28 truncate text-sm font-black text-gray-900">
                          {displayName}
                        </span>

                        {canAccessAdminPage && (
                          <span
                            className={`shrink-0 border px-2 py-0.5 text-[10px] font-black ${roleInfo.badgeClass}`}
                          >
                            {roleInfo.label}
                          </span>
                        )}
                      </div>

                      {isAdmin && managedLibraryName && (
                        <p className="mt-0.5 max-w-44 truncate text-[10px] font-semibold text-gray-400">
                          {managedLibraryName}
                        </p>
                      )}
                    </div>

                    <span
                      className={`hidden text-xs font-black text-gray-500 transition sm:block ${
                        userMenuOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    >
                      ▼
                    </span>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute top-full right-0 z-50 w-64 pt-2">
                      <div
                        role="menu"
                        className="border-2 border-black bg-white p-2 shadow-[5px_5px_0_0] shadow-black"
                      >
                        <div className="border-b-2 border-gray-200 px-3 py-3">
                          <div className="flex items-start gap-3">
                            {profileImageUrl && !profileImageFailed ? (
                              <img
                                src={profileImageUrl}
                                alt={`${displayName} 프로필`}
                                className="h-10 w-10 shrink-0 rounded-full border-2 border-black object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-black bg-yellow-200 text-sm font-black">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 flex-1 truncate text-sm font-black text-gray-950">
                                  {displayName}
                                </p>

                                <span
                                  className={`shrink-0 border px-2 py-0.5 text-[10px] font-black ${roleInfo.badgeClass}`}
                                >
                                  {roleInfo.label}
                                </span>
                              </div>

                              {userEmail && (
                                <p className="mt-1 truncate text-xs font-semibold text-gray-400">
                                  {userEmail}
                                </p>
                              )}

                              {isAdmin && managedLibraryName && (
                                <p className="mt-1 truncate text-[11px] font-black text-blue-700">
                                  {managedLibraryName}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 grid gap-1 md:hidden">
                          <Link
                            to="/books"
                            role="menuitem"
                            onClick={closeUserMenu}
                            className="border-2 border-transparent px-3 py-2.5 text-sm font-black text-gray-800 transition hover:border-black hover:bg-yellow-100"
                          >
                            도서검색
                          </Link>

                          {isUser && (
                            <Link
                              to="/book/request"
                              role="menuitem"
                              onClick={closeUserMenu}
                              className="border-2 border-transparent px-3 py-2.5 text-sm font-black text-gray-800 transition hover:border-black hover:bg-yellow-100"
                            >
                              희망도서 신청
                            </Link>
                          )}

                          <Link
                            to="/citizen-votes"
                            role="menuitem"
                            onClick={closeUserMenu}
                            className="border-2 border-transparent px-3 py-2.5 text-sm font-black text-gray-800 transition hover:border-black hover:bg-yellow-100"
                          >
                            {canAccessAdminPage ? '시민투표 현황' : '시민투표'}
                          </Link>
                        </div>

                        <div className="mt-2 grid gap-1 border-t-2 border-gray-100 pt-2 md:border-t-0 md:pt-0">
                          {/* 역할별 페이지 */}
                          {canAccessAdminPage ? (
                            <Link
                              to="/admin?tab=dashboard"
                              role="menuitem"
                              onClick={closeUserMenu}
                              className="border-2 border-transparent px-3 py-2.5 text-sm font-black text-gray-800 transition hover:border-black hover:bg-purple-100"
                            >
                              관리자 페이지
                            </Link>
                          ) : (
                            <Link
                              to="/member/mypage"
                              role="menuitem"
                              onClick={closeUserMenu}
                              className="border-2 border-transparent px-3 py-2.5 text-sm font-black text-gray-800 transition hover:border-black hover:bg-yellow-100"
                            >
                              마이페이지
                            </Link>
                          )}

                          {/* 일반 관리자 입고·예산 관리 */}
                          {isAdmin && (
                            <Link
                              to="/admin/acquisitions"
                              role="menuitem"
                              onClick={closeUserMenu}
                              className={`border-2 border-transparent px-3 py-3 transition hover:border-black ${
                                remainingBudgetIsExceeded
                                  ? 'bg-red-50 hover:bg-red-100'
                                  : remainingBudgetIsLow
                                    ? 'bg-orange-50 hover:bg-orange-100'
                                    : 'bg-blue-50 hover:bg-blue-100'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-black text-gray-900">
                                  입고·예산 관리
                                </span>

                                <span className="text-xs font-black text-gray-600">
                                  {acquisitionSummary.itemCount}종
                                </span>
                              </div>

                              <div className="mt-1 flex items-center justify-between gap-3 text-[11px] font-bold">
                                <span className="text-gray-500">
                                  사용{' '}
                                  {formatCurrency(
                                    acquisitionSummary.usedAmount,
                                  )}
                                </span>

                                <span
                                  className={
                                    remainingBudgetIsExceeded
                                      ? 'text-red-700'
                                      : remainingBudgetIsLow
                                        ? 'text-orange-700'
                                        : 'text-blue-700'
                                  }
                                >
                                  잔여{' '}
                                  {formatCurrency(
                                    acquisitionSummary.remainingAmount,
                                  )}
                                </span>
                              </div>
                            </Link>
                          )}

                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleLogoutRequest}
                            className="border-2 border-transparent px-3 py-2.5 text-left text-sm font-black text-red-700 transition hover:border-black hover:bg-red-50"
                          >
                            로그아웃
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {logoutModal === 'confirm' && (
        <AlertModal
          type="info"
          message={`${displayName}님, 로그아웃하시겠습니까?`}
          onClose={closeLogoutModal}
          onConfirm={performLogout}
          confirmLabel="로그아웃"
          cancelLabel="취소"
          loading={logoutLoading}
        >
          <p className="border-2 border-black bg-white/70 p-3 text-sm font-semibold leading-6 text-gray-700">
            로그아웃하면 현재 로그인 정보가 삭제되고 메인페이지로 이동합니다.
          </p>
        </AlertModal>
      )}

      {logoutModal === 'success' && (
        <AlertModal
          type="success"
          message="로그아웃되었습니다."
          onClose={closeLogoutSuccessModal}
        />
      )}

      {logoutModal === 'error' && (
        <AlertModal
          type="error"
          message="로그아웃 처리 중 오류가 발생했습니다. 다시 시도해주세요."
          onClose={closeLogoutModal}
        />
      )}
    </>
  )
}

export default Header
