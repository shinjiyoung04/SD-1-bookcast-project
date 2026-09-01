import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import useMemberStore from '../../store/useMemberStore'
import {
  cancelPromotionRequest,
  createPromotionRequest,
  getMyPromotionRequest,
} from '../../api/promotionApi'
import { searchRequestLibraries } from '../../api/bookRequestApi'

const DEFAULT_REGION = '31'
const DEFAULT_DTL_REGION = '31100'

const statusText = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  REJECTED: '반려',
  CANCELED: '신청 취소',
  CANCELLED: '신청 취소',
}

const getLibraryArray = (data) => {
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.content)) {
    return data.content
  }

  if (Array.isArray(data?.libraries)) {
    return data.libraries
  }

  if (Array.isArray(data?.items)) {
    return data.items
  }

  if (Array.isArray(data?.data)) {
    return data.data
  }

  return []
}

const normalizeLibrary = (library, index) => ({
  id:
    library.libCode ??
    library.libraryCode ??
    library.code ??
    `library-${index}`,

  libCode: String(
    library.libCode ?? library.libraryCode ?? library.code ?? '',
  ).trim(),

  libName:
    library.libName ?? library.libraryName ?? library.name ?? '도서관명 없음',

  address: library.address ?? library.libraryAddress ?? '',

  tel: library.tel ?? library.phone ?? library.telephone ?? '',

  homepage: library.homepage ?? library.homePage ?? '',
})

const PromotionApplyPage = () => {
  const navigate = useNavigate()
  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user

  const userId =
    loginUser?.userId ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const currentRole = String(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority ?? 'USER',
  )
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const [form, setForm] = useState({
    libraryName: '',
    libraryCode: '',
    department: '',
    employeeNumber: '',
    contact: '',
    reason: '',
  })

  const [libraries, setLibraries] = useState([])
  const [libraryKeyword, setLibraryKeyword] = useState('')
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [libraryError, setLibraryError] = useState('')

  const loadLatest = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      const result = await getMyPromotionRequest(userId)
      setLatest(result || null)
    } catch (error) {
      console.error('[PromotionApplyPage] 최근 등업 신청 조회 실패:', error)

      if (error.response?.status === 404) {
        setLatest(null)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!loginUser) {
      navigate('/member/login', {
        replace: true,
      })
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLatest()
  }, [loginUser, loadLatest, navigate])

  const loadLibraries = useCallback(async () => {
    if (libraryLoading || libraryLoaded) {
      setLibrarySearchOpen(true)
      return
    }

    setLibraryLoading(true)
    setLibraryError('')
    setLibrarySearchOpen(true)

    try {
      const data = await searchRequestLibraries({
        region: DEFAULT_REGION,
        dtlRegion: DEFAULT_DTL_REGION,
        pageNo: 1,
        pageSize: 50,
      })

      const normalizedLibraries = getLibraryArray(data)
        .map(normalizeLibrary)
        .filter((library) => library.libCode && library.libName)

      normalizedLibraries.sort((first, second) =>
        first.libName.localeCompare(second.libName, 'ko-KR'),
      )

      setLibraries(normalizedLibraries)
      setLibraryLoaded(true)
    } catch (error) {
      console.error('[PromotionApplyPage] 고양시 도서관 조회 실패:', error)
      console.error('[PromotionApplyPage] 서버 응답:', error.response?.data)

      setLibraryError(
        error.response?.data?.message ||
          '고양시 도서관 목록을 불러오지 못했습니다.',
      )
    } finally {
      setLibraryLoading(false)
    }
  }, [libraryLoaded, libraryLoading])

  const filteredLibraries = useMemo(() => {
    const keyword = libraryKeyword.trim().toLowerCase()

    if (!keyword) {
      return libraries
    }

    return libraries.filter((library) => {
      const searchTarget = [library.libName, library.libCode, library.address]
        .join(' ')
        .toLowerCase()

      return searchTarget.includes(keyword)
    })
  }, [libraries, libraryKeyword])

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const handleLibrarySearchFocus = () => {
    loadLibraries()
  }

  const handleSelectLibrary = (library) => {
    setForm((previous) => ({
      ...previous,
      libraryName: library.libName,
      libraryCode: library.libCode,
    }))

    setLibraryKeyword(library.libName)
    setLibrarySearchOpen(false)
    setLibraryError('')
  }

  const handleClearLibrary = () => {
    setForm((previous) => ({
      ...previous,
      libraryName: '',
      libraryCode: '',
    }))

    setLibraryKeyword('')
    setLibrarySearchOpen(true)
    loadLibraries()
  }

  const handleReloadLibraries = async () => {
    setLibraryLoaded(false)
    setLibraries([])
    setLibraryError('')
    setLibraryLoading(true)

    try {
      const data = await searchRequestLibraries({
        region: DEFAULT_REGION,
        dtlRegion: DEFAULT_DTL_REGION,
        pageNo: 1,
        pageSize: 50,
      })

      const normalizedLibraries = getLibraryArray(data)
        .map(normalizeLibrary)
        .filter((library) => library.libCode && library.libName)

      normalizedLibraries.sort((first, second) =>
        first.libName.localeCompare(second.libName, 'ko-KR'),
      )

      setLibraries(normalizedLibraries)
      setLibraryLoaded(true)
      setLibrarySearchOpen(true)
    } catch (error) {
      console.error('[PromotionApplyPage] 고양시 도서관 재조회 실패:', error)

      setLibraryError(
        error.response?.data?.message ||
          '고양시 도서관 목록을 다시 불러오지 못했습니다.',
      )
    } finally {
      setLibraryLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!userId) {
      alert('로그인 사용자 정보를 확인할 수 없습니다.')
      return
    }

    if (!form.libraryName || !form.libraryCode) {
      alert('소속 도서관을 검색하여 선택해주세요.')
      return
    }

    setSubmitting(true)

    try {
      const result = await createPromotionRequest({
        userId,
        ...form,
      })

      setLatest(result)
      alert('관리자 등업 신청이 접수되었습니다.')
    } catch (error) {
      console.error('[PromotionApplyPage] 등업 신청 실패:', error)

      alert(
        error.response?.data?.message ||
          error.response?.data?.detail ||
          (typeof error.response?.data === 'string'
            ? error.response.data
            : '') ||
          '등업 신청에 실패했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('등업 신청을 취소하시겠습니까?')) {
      return
    }

    const requestId =
      latest?.requestId ?? latest?.id ?? latest?.promotionRequestId

    if (!requestId || !userId) {
      alert('취소할 신청 정보를 확인할 수 없습니다.')
      return
    }

    setCanceling(true)

    try {
      const result = await cancelPromotionRequest(requestId, userId)

      setLatest(result)
      alert('등업 신청이 취소되었습니다.')
    } catch (error) {
      console.error('[PromotionApplyPage] 등업 신청 취소 실패:', error)

      alert(
        error.response?.data?.message ||
          error.response?.data?.detail ||
          (typeof error.response?.data === 'string'
            ? error.response.data
            : '') ||
          '신청 취소에 실패했습니다.',
      )
    } finally {
      setCanceling(false)
    }
  }

  if (!loginUser || loading) {
    return (
      <BasicLayout>
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white">
            <div className="text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

              <p className="mt-4 font-bold text-gray-600">
                등업 신청 정보를 불러오는 중입니다.
              </p>
            </div>
          </div>
        </div>
      </BasicLayout>
    )
  }

  if (currentRole === 'ADMIN' || currentRole === 'MASTER_ADMIN') {
    return (
      <BasicLayout>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="border-2 border-black bg-white p-8 shadow-[6px_6px_0_0] shadow-black">
            <h1 className="text-3xl font-black">관리자 권한 보유 계정</h1>

            <p className="mt-4">
              현재 계정은 이미{' '}
              {currentRole === 'MASTER_ADMIN' ? '최고 관리자' : '도서관 관리자'}{' '}
              권한을 보유하고 있습니다.
            </p>

            <button
              type="button"
              onClick={() => navigate('/member/mypage')}
              className="mt-6 border-2 border-black bg-yellow-200 px-5 py-3 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
            >
              마이페이지로 돌아가기
            </button>
          </div>
        </div>
      </BasicLayout>
    )
  }

  const latestStatus = String(latest?.status ?? '').toUpperCase()

  const pending = latestStatus === 'PENDING'
  const approved = latestStatus === 'APPROVED'

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black sm:p-8">
            <div className="flex flex-col gap-4 border-b-2 border-black pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-black">관리자 등업 신청</h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
                  소속된 고양시 도서관을 검색하여 선택한 뒤 담당자 정보를
                  제출해주세요. 최고 관리자가 확인 후 관리자 권한을 부여합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/member/mypage')}
                className="shrink-0 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:border-black hover:text-black"
              >
                마이페이지
              </button>
            </div>

            {latest && (
              <section className="mt-8 border-2 border-black bg-yellow-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">최근 신청 상태</p>

                    <p className="mt-1 text-xl font-black">
                      {statusText[latestStatus] ||
                        latestStatus ||
                        '상태 확인 중'}
                    </p>
                  </div>

                  {pending && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={canceling}
                      className="border-2 border-black bg-white px-4 py-2 font-bold shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {canceling ? '취소 처리 중' : '신청 취소'}
                    </button>
                  )}
                </div>

                {latest.masterComment && (
                  <div className="mt-4 border-t border-yellow-300 pt-4">
                    <p className="text-sm font-bold">담당자 의견</p>

                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {latest.masterComment}
                    </p>
                  </div>
                )}
              </section>
            )}

            {approved && (
              <section className="mt-8 rounded-xl border border-green-300 bg-green-50 p-5">
                <p className="font-black text-green-800">
                  관리자 등업이 승인되었습니다.
                </p>

                <p className="mt-2 text-sm text-green-700">
                  다시 로그인하면 변경된 관리자 권한이 적용됩니다.
                </p>
              </section>
            )}

            {!pending && !approved && (
              <form
                onSubmit={handleSubmit}
                className="mt-8 grid gap-6 md:grid-cols-2"
              >
                <div className="md:col-span-2">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <label htmlFor="libraryKeyword" className="font-black">
                        소속 도서관 검색
                      </label>

                      <p className="mt-1 text-sm text-gray-500">
                        고양시 내 도서관 이름, 주소 또는 도서관 코드로
                        검색하세요.
                      </p>
                    </div>

                    {form.libraryCode && (
                      <button
                        type="button"
                        onClick={handleClearLibrary}
                        className="text-sm font-bold text-blue-600 hover:underline"
                      >
                        선택 변경
                      </button>
                    )}
                  </div>

                  <div className="relative mt-3">
                    <div className="flex gap-2">
                      <input
                        id="libraryKeyword"
                        type="text"
                        value={libraryKeyword}
                        onChange={(event) => {
                          setLibraryKeyword(event.target.value)
                          setLibrarySearchOpen(true)

                          if (!libraryLoaded) {
                            loadLibraries()
                          }
                        }}
                        onFocus={handleLibrarySearchFocus}
                        placeholder="예: 아람누리도서관, 덕양구, 141123"
                        autoComplete="off"
                        className="min-w-0 flex-1 border-2 border-black px-4 py-3 outline-none transition focus:bg-yellow-50"
                      />

                      <button
                        type="button"
                        onClick={loadLibraries}
                        disabled={libraryLoading}
                        className="shrink-0 border-2 border-black bg-yellow-200 px-5 py-3 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {libraryLoading ? '조회 중' : '검색'}
                      </button>
                    </div>

                    {librarySearchOpen && (
                      <div className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto border-2 border-black bg-white shadow-[5px_5px_0_0] shadow-black">
                        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                          <p className="text-sm font-black">고양시 도서관</p>

                          <button
                            type="button"
                            onClick={() => setLibrarySearchOpen(false)}
                            className="text-sm font-bold text-gray-500 hover:text-black"
                          >
                            닫기
                          </button>
                        </div>

                        {libraryLoading && (
                          <div className="px-5 py-10 text-center">
                            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

                            <p className="mt-3 text-sm font-bold text-gray-500">
                              도서관 목록을 불러오는 중입니다.
                            </p>
                          </div>
                        )}

                        {!libraryLoading && libraryError && (
                          <div className="px-5 py-8 text-center">
                            <p className="text-sm font-bold text-red-700">
                              {libraryError}
                            </p>

                            <button
                              type="button"
                              onClick={handleReloadLibraries}
                              className="mt-4 border-2 border-black bg-white px-4 py-2 text-sm font-black"
                            >
                              다시 불러오기
                            </button>
                          </div>
                        )}

                        {!libraryLoading &&
                          !libraryError &&
                          libraryLoaded &&
                          filteredLibraries.length === 0 && (
                            <div className="px-5 py-10 text-center text-sm font-bold text-gray-500">
                              검색 조건에 맞는 도서관이 없습니다.
                            </div>
                          )}

                        {!libraryLoading &&
                          !libraryError &&
                          filteredLibraries.length > 0 && (
                            <ul>
                              {filteredLibraries.map((library) => (
                                <li
                                  key={library.id}
                                  className="border-b border-gray-100 last:border-b-0"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleSelectLibrary(library)}
                                    className="w-full px-5 py-4 text-left transition hover:bg-yellow-50"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="font-black text-gray-950">
                                        {library.libName}
                                      </p>

                                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                                        {library.libCode}
                                      </span>
                                    </div>

                                    {library.address && (
                                      <p className="mt-1 text-sm leading-5 text-gray-500">
                                        {library.address}
                                      </p>
                                    )}

                                    {library.tel && (
                                      <p className="mt-1 text-xs font-semibold text-gray-400">
                                        전화: {library.tel}
                                      </p>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                    )}
                  </div>

                  {form.libraryCode && (
                    <div className="mt-4 rounded-xl border-2 border-green-500 bg-green-50 p-4">
                      <p className="text-xs font-black text-green-700">
                        선택된 도서관
                      </p>

                      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-black text-gray-950">
                          {form.libraryName}
                        </p>

                        <p className="text-sm font-bold text-gray-600">
                          도서관 코드: {form.libraryCode}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <label className="font-bold">
                  소속 도서관명
                  <input
                    name="libraryName"
                    value={form.libraryName}
                    readOnly
                    required
                    className="mt-2 w-full cursor-not-allowed border-2 border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                    placeholder="위에서 도서관을 선택해주세요."
                  />
                </label>

                <label className="font-bold">
                  도서관 코드
                  <input
                    name="libraryCode"
                    value={form.libraryCode}
                    readOnly
                    required
                    className="mt-2 w-full cursor-not-allowed border-2 border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
                    placeholder="선택 시 자동 입력됩니다."
                  />
                </label>

                <label className="font-bold">
                  부서 / 담당 업무
                  <input
                    name="department"
                    value={form.department}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full border-2 border-black px-3 py-2 outline-none focus:bg-yellow-50"
                    placeholder="예: 자료정보팀"
                  />
                </label>

                <label className="font-bold">
                  사번 / 직원번호
                  <input
                    name="employeeNumber"
                    value={form.employeeNumber}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full border-2 border-black px-3 py-2 outline-none focus:bg-yellow-50"
                    placeholder="직원번호를 입력하세요."
                  />
                </label>

                <label className="font-bold md:col-span-2">
                  연락처
                  <input
                    name="contact"
                    value={form.contact}
                    onChange={handleChange}
                    required
                    className="mt-2 w-full border-2 border-black px-3 py-2 outline-none focus:bg-yellow-50"
                    placeholder="예: 010-1234-5678"
                  />
                </label>

                <label className="font-bold md:col-span-2">
                  등업 신청 사유
                  <textarea
                    name="reason"
                    value={form.reason}
                    onChange={handleChange}
                    required
                    rows="6"
                    className="mt-2 w-full resize-y border-2 border-black px-3 py-2 outline-none focus:bg-yellow-50"
                    placeholder="담당 업무와 관리자 권한이 필요한 이유를 작성하세요."
                  />
                </label>

                <div className="flex flex-col-reverse gap-3 md:col-span-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => navigate('/member/mypage')}
                    className="border-2 border-black bg-white px-6 py-3 font-black"
                  >
                    취소
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || !form.libraryCode}
                    className="border-2 border-black bg-yellow-200 px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                  >
                    {submitting ? '신청 처리 중' : '등업 신청하기'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </BasicLayout>
  )
}

export default PromotionApplyPage
