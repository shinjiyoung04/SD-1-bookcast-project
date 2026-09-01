import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BasicLayout from '../layouts/BasicLayout'
import useMemberStore from '../store/useMemberStore'
import { searchExternalBooks } from '../api/externalBookApi'
import { getMainHotTrendBooks, getMainPopularBooks } from '../api/mainPageApi'
import { getMainAiRecommendedBooks } from '../api/mainAiRecommendationApi'

const normalizeRole = (value) =>
  String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

const normalizeBook = (raw, index = 0) => {
  const book = raw?.doc || raw?.book || raw || {}

  const isbn13 = String(book.isbn13 ?? book.isbn ?? book.ISBN13 ?? '')
    .replaceAll('-', '')
    .trim()

  const title =
    book.title ??
    book.bookname ??
    book.bookName ??
    book.bookTitle ??
    '도서 제목 없음'

  return {
    id: book.id ?? book.bookId ?? isbn13 ?? `${title}-${index}`,

    rank: Number(book.rank ?? book.ranking ?? index + 1) || index + 1,

    title,

    author: book.author ?? book.authors ?? book.bookAuthor ?? '저자 정보 없음',

    publisher: book.publisher ?? book.bookPublisher ?? '출판사 정보 없음',

    publicationYear:
      book.publicationYear ?? book.publication_year ?? book.publishedDate ?? '',

    isbn13,

    className:
      book.className ?? book.class_nm ?? book.categoryName ?? '분류 정보 없음',

    imageUrl:
      book.imageUrl ??
      book.bookImageURL ??
      book.bookImageUrl ??
      book.thumbnailUrl ??
      book.thumbnail ??
      '',

    loanCount: Number(book.loanCount ?? book.loan_count ?? 0) || 0,

    dataStartDate: book.dataStartDate ?? null,

    dataEndDate: book.dataEndDate ?? null,
  }
}

const normalizeHotTrendBook = (raw, index = 0) => ({
  ...normalizeBook(raw, index),

  date: raw?.date ?? null,

  no: Number(raw?.no ?? index + 1) || index + 1,

  difference: Number(raw?.difference ?? 0) || 0,

  baseWeekRank:
    raw?.baseWeekRank === null || raw?.baseWeekRank === undefined
      ? null
      : Number(raw.baseWeekRank),

  pastWeekRank:
    raw?.pastWeekRank === null || raw?.pastWeekRank === undefined
      ? null
      : Number(raw.pastWeekRank),

  ranking:
    raw?.ranking === null || raw?.ranking === undefined
      ? null
      : Number(raw.ranking),
})

const normalizeAiRecommendedBook = (raw, index = 0) => ({
  ...normalizeBook(raw, index),

  aiRank:
    Number(raw?.aiRank ?? raw?.recommendationRank ?? index + 1) ||
    index + 1,

  recommendationScore:
    Number(raw?.recommendationScore ?? raw?.basePriorityScore ?? 0) || 0,

  popularityScore:
    Number(raw?.popularityScore ?? raw?.aiPopularityScore ?? 0) || 0,

  recommendationLevel:
    String(raw?.recommendationLevel ?? 'MEDIUM')
      .trim()
      .toUpperCase(),

  kdcMain: String(raw?.kdcMain ?? raw?.resolvedKdc ?? '').trim(),

  modelVersion: String(raw?.modelVersion ?? '').trim(),

  aiComment:
    raw?.aiComment ||
    raw?.recommendationReason ||
    'AI 모델이 도서의 장르 균형과 전국 대출 체급을 종합했습니다.',
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

const MainPage = () => {
  const navigate = useNavigate()

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

  const displayName =
    loginUser?.nickname || loginUser?.name || loginUser?.loginId || '회원'

  const mainDataLoadedRef = useRef(false)

  const [searchValue, setSearchValue] = useState('')

  const [searchResults, setSearchResults] = useState([])

  const [searchLoading, setSearchLoading] = useState(false)

  const [searchError, setSearchError] = useState('')

  const [hasSearched, setHasSearched] = useState(false)

  const [popularBooks, setPopularBooks] = useState([])

  const [popularLoading, setPopularLoading] = useState(true)

  const [popularError, setPopularError] = useState('')

  const [aiRecommendedBooks, setAiRecommendedBooks] = useState([])

  const [aiRecommendedLoading, setAiRecommendedLoading] = useState(true)

  const [aiRecommendedError, setAiRecommendedError] = useState('')

  const [hotTrendBooks, setHotTrendBooks] = useState([])

  const [hotTrendLoading, setHotTrendLoading] = useState(true)

  const [hotTrendError, setHotTrendError] = useState('')

  const loadAiRecommendedBooks = useCallback(
    async (candidateBooks) => {
      const candidates = Array.isArray(candidateBooks)
        ? candidateBooks
            .filter((book) => book?.isbn13)
            .slice(0, 20)
        : []

      if (candidates.length === 0) {
        setAiRecommendedBooks([])
        setAiRecommendedError(
          'AI 추천에 사용할 인기 대출도서 데이터가 없습니다.',
        )
        setAiRecommendedLoading(false)
        return
      }

      setAiRecommendedLoading(true)
      setAiRecommendedError('')

      try {
        const data = await getMainAiRecommendedBooks({
          candidates,
          limit: 5,
        })

        setAiRecommendedBooks(
          Array.isArray(data)
            ? data.map(normalizeAiRecommendedBook).slice(0, 5)
            : [],
        )
      } catch (error) {
        console.error('[MainPage] AI 추천도서 조회 실패:', error)

        setAiRecommendedBooks([])

        setAiRecommendedError(
          getErrorMessage(
            error,
            'AI 추천도서를 불러오지 못했습니다.',
          ),
        )
      } finally {
        setAiRecommendedLoading(false)
      }
    },
    [],
  )

  const loadPopularBooks = useCallback(async () => {
    setPopularLoading(true)
    setPopularError('')

    try {
      const data = await getMainPopularBooks({
        limit: 20,
      })

      const normalizedBooks = Array.isArray(data)
        ? data.map(normalizeBook)
        : []

      setPopularBooks(normalizedBooks)

      void loadAiRecommendedBooks(normalizedBooks)
    } catch (error) {
      console.error('[MainPage] 인기 대출 도서 조회 실패:', error)

      setPopularBooks([])
      setAiRecommendedBooks([])
      setAiRecommendedLoading(false)
      setAiRecommendedError(
        '인기 대출도서를 불러오지 못해 AI 추천을 생성할 수 없습니다.',
      )

      setPopularError(
        getErrorMessage(error, '인기 대출도서를 불러오지 못했습니다.'),
      )
    } finally {
      setPopularLoading(false)
    }
  }, [loadAiRecommendedBooks])

  const loadHotTrendBooks = useCallback(async () => {
    setHotTrendLoading(true)
    setHotTrendError('')

    try {
      const data = await getMainHotTrendBooks({
        limit: 15,
      })

      setHotTrendBooks(
        Array.isArray(data) ? data.map(normalizeHotTrendBook) : [],
      )
    } catch (error) {
      console.error('[MainPage] 대출 급상승 도서 조회 실패:', error)

      setHotTrendBooks([])

      setHotTrendError(
        getErrorMessage(error, '대출 급상승 도서를 불러오지 못했습니다.'),
      )
    } finally {
      setHotTrendLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mainDataLoadedRef.current) {
      return
    }

    mainDataLoadedRef.current = true

    loadPopularBooks()
    loadHotTrendBooks()
  }, [loadHotTrendBooks, loadPopularBooks])

  const dateRangeText = useMemo(() => {
    const first = popularBooks[0]

    if (!first?.dataStartDate || !first?.dataEndDate) {
      return '최근 대출 데이터 기준'
    }

    return `${first.dataStartDate} ~ ${first.dataEndDate}`
  }, [popularBooks])

  const handleSearch = async (event) => {
    event.preventDefault()

    const keyword = searchValue.trim()

    if (!keyword) {
      setSearchError('검색어를 입력해주세요.')

      setSearchResults([])
      setHasSearched(true)
      return
    }

    setSearchLoading(true)
    setSearchError('')
    setHasSearched(true)

    try {
      const data = await searchExternalBooks({
        provider: 'ALL',
        keyword,
        pageNo: 1,
        pageSize: 6,
      })

      const normalized = Array.isArray(data)
        ? data
            .map(normalizeBook)
            .filter((book) => book.title !== '도서 제목 없음')
        : []

      setSearchResults(normalized)

      if (normalized.length === 0) {
        setSearchError('검색 결과가 없습니다.')
      }
    } catch (error) {
      console.error('[MainPage] 통합검색 실패:', error)

      setSearchResults([])

      setSearchError(
        getErrorMessage(error, '도서 검색 중 오류가 발생했습니다.'),
      )
    } finally {
      setSearchLoading(false)
    }
  }

  const openBook = (book) => {
    if (!book?.isbn13) {
      return
    }

    navigate(`/books/${book.isbn13}`, {
      state: {
        book,
      },
    })
  }

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="overflow-hidden border-2 border-black bg-white shadow-[7px_7px_0_0] shadow-black">
            <div className="grid lg:grid-cols-[1fr_340px]">
              <div className="border-b-2 border-black bg-yellow-200 p-6 sm:p-8 lg:border-r-2 lg:border-b-0">
                <span className="inline-flex border-2 border-black bg-white px-3 py-1 text-xs font-black shadow-[2px_2px_0_0] shadow-black">
                  BOOKCAST
                </span>

                <h1 className="mt-5 max-w-3xl text-3xl font-black leading-tight text-gray-950 sm:text-5xl">
                  도서 검색부터
                  <br />
                  희망도서 신청까지 한 번에
                </h1>

                <p className="mt-5 max-w-2xl text-sm font-bold leading-7 text-gray-700 sm:text-base">
                  네이버·알라딘 도서 정보와 도서관정보나루 데이터를 연결하여
                  도서 검색, 소장 도서관 확인, 시민투표를 한곳에서 이용할 수
                  있습니다.
                </p>

                <form
                  onSubmit={handleSearch}
                  className="mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row"
                >
                  <label className="relative flex-1">
                    <span className="sr-only">통합 도서 검색</span>

                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg">
                      ⌕
                    </span>

                    <input
                      type="search"
                      value={searchValue}
                      onChange={(event) => {
                        setSearchValue(event.target.value)

                        setSearchError('')
                      }}
                      placeholder="도서명, 저자, ISBN을 검색하세요"
                      className="h-14 w-full border-2 border-black bg-white pr-4 pl-12 text-sm font-bold outline-none focus:bg-yellow-50"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="h-14 border-2 border-black bg-gray-950 px-7 text-sm font-black text-white shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-500"
                  >
                    {searchLoading ? '검색 중...' : '통합 검색'}
                  </button>
                </form>

                <div className="mt-5 flex flex-wrap gap-2">
                  {['소설', '자기계발', '인공지능', '한국사'].map((keyword) => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => setSearchValue(keyword)}
                      className="border border-black bg-white px-3 py-1.5 text-xs font-black transition hover:bg-gray-950 hover:text-white"
                    >
                      #{keyword}
                    </button>
                  ))}
                </div>
              </div>

              <UserQuickPanel
                loginUser={loginUser}
                userId={userId}
                role={role}
                displayName={displayName}
              />
            </div>
          </section>

          {(searchLoading || hasSearched) && (
            <SearchResultSection
              loading={searchLoading}
              error={searchError}
              items={searchResults}
              onOpenBook={openBook}
              onClose={() => {
                setHasSearched(false)
                setSearchResults([])
                setSearchError('')
              }}
            />
          )}

          <section className="mt-10">
            <SectionHeader
              eyebrow="AI CURATED BOOKS"
              title="AI 추천도서 TOP 5"
              description="인기 대출도서 TOP 20을 AI 종합점수·AI 인기도·실제 대출순위로 분석해 서로 다른 추천점수의 상위 5권을 선정했습니다."
              action={
                <button
                  type="button"
                  onClick={() =>
                    loadAiRecommendedBooks(popularBooks)
                  }
                  disabled={
                    aiRecommendedLoading ||
                    popularBooks.length === 0
                  }
                  className="border-2 border-black bg-purple-100 px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiRecommendedLoading
                    ? 'AI 분석 중...'
                    : 'AI 추천 다시 분석'}
                </button>
              }
            />

            {aiRecommendedLoading && (
              <LoadingPanel message="인기 대출도서 20권을 AI 모델로 분석하고 있습니다." />
            )}

            {!aiRecommendedLoading && aiRecommendedError && (
              <ErrorPanel
                message={aiRecommendedError}
                onRetry={() =>
                  loadAiRecommendedBooks(popularBooks)
                }
              />
            )}

            {!aiRecommendedLoading &&
              !aiRecommendedError &&
              aiRecommendedBooks.length === 0 && (
                <EmptyPanel message="표시할 AI 추천도서가 없습니다." />
              )}

            {!aiRecommendedLoading &&
              !aiRecommendedError &&
              aiRecommendedBooks.length > 0 && (
                <AiRecommendedBookGrid
                  books={aiRecommendedBooks}
                  onOpenBook={openBook}
                />
              )}
          </section>

          <section className="mt-12">
            <SectionHeader
              eyebrow="POPULAR LOAN BOOKS"
              title="인기 대출도서 TOP 20"
              description={`${dateRangeText} · 고양시 공공도서관 대출 데이터`}
              action={
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Link
                    to="/books"
                    className="border-2 border-black bg-white px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                  >
                    도서 전체 검색 →
                  </Link>
                </div>
              }
            />

            {popularLoading && (
              <LoadingPanel message="정보나루 인기대출 데이터를 불러오는 중입니다." />
            )}

            {!popularLoading && popularError && (
              <ErrorPanel message={popularError} onRetry={loadPopularBooks} />
            )}

            {!popularLoading && !popularError && popularBooks.length === 0 && (
              <EmptyPanel message="표시할 인기 대출도서가 없습니다." />
            )}

            {!popularLoading && !popularError && popularBooks.length > 0 && (
              <AutoScrollBookRail books={popularBooks} onOpenBook={openBook} />
            )}
          </section>

          <section className="mt-12">
            <SectionHeader
              eyebrow="HOT TREND"
              title="대출 급상승 도서"
              description="최근 3일의 급상승 도서를 날짜별 슬라이드로 확인할 수 있습니다."
              action={
                <button
                  type="button"
                  onClick={loadHotTrendBooks}
                  disabled={hotTrendLoading}
                  className="border-2 border-black bg-yellow-200 px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:opacity-50"
                >
                  {hotTrendLoading ? '조회 중...' : '급상승 다시 조회'}
                </button>
              }
            />

            {hotTrendLoading && (
              <LoadingPanel message="정보나루 대출 급상승 도서를 불러오는 중입니다." />
            )}

            {!hotTrendLoading && hotTrendError && (
              <ErrorPanel message={hotTrendError} onRetry={loadHotTrendBooks} />
            )}

            {!hotTrendLoading &&
              !hotTrendError &&
              hotTrendBooks.length === 0 && (
                <EmptyPanel message="표시할 대출 급상승 도서가 없습니다." />
              )}

            {!hotTrendLoading && !hotTrendError && hotTrendBooks.length > 0 && (
              <HotTrendBookGroups books={hotTrendBooks} onOpenBook={openBook} />
            )}
          </section>

          <section className="mt-10 grid overflow-hidden border-2 border-black bg-gray-950 text-white shadow-[6px_6px_0_0] shadow-black lg:grid-cols-[1fr_auto]">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-black tracking-[0.22em] text-yellow-300">
                BOOKCAST GUIDE
              </p>

              <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                찾는 도서가 없다면 시민의 수요를 모아보세요.
              </h2>

              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-gray-300">
                희망도서 신청과 시민투표 데이터는 도서관 관리자의 구입 판단
                자료로 활용됩니다.
              </p>
            </div>

            <div className="flex items-center border-t-2 border-white/30 p-6 lg:border-t-0 lg:border-l-2">
              <Link
                to="/citizen-votes"
                className="w-full border-2 border-white bg-yellow-200 px-6 py-3 text-center text-sm font-black text-black transition hover:bg-white"
              >
                시민투표 참여하기
              </Link>
            </div>
          </section>
        </div>
      </main>
    </BasicLayout>
  )
}

const UserQuickPanel = ({ loginUser, userId, role, displayName }) => {
  const isAdmin = role === 'ADMIN' || role === 'MASTER_ADMIN'

  return (
    <aside className="flex flex-col justify-between bg-white p-6 sm:p-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-gray-100 text-xl font-black shadow-[3px_3px_0_0] shadow-black">
          {loginUser ? String(displayName).charAt(0).toUpperCase() : 'B'}
        </div>

        {loginUser ? (
          <>
            <p className="mt-5 text-sm font-black text-blue-600">반갑습니다</p>

            <h2 className="mt-1 text-2xl font-black">{displayName}님</h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
              {isAdmin
                ? '담당 도서관과 희망도서 신청 현황을 관리해보세요.'
                : '나의 신청과 좋아요, 시민투표 내역을 확인해보세요.'}
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-sm font-black text-blue-600">사용자 정보</p>

            <h2 className="mt-1 text-2xl font-black">로그인이 필요합니다</h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
              로그인하면 희망도서 신청, 시민투표, 좋아요 기능을 이용할 수
              있습니다.
            </p>
          </>
        )}
      </div>

      <div className="mt-7 grid gap-3">
        {loginUser ? (
          <>
            {isAdmin ? (
              <Link
                to="/admin?tab=dashboard"
                className="border-2 border-black bg-purple-100 px-4 py-3 text-center text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
              >
                관리자 페이지
              </Link>
            ) : (
              <Link
                to="/member/mypage"
                className="border-2 border-black bg-yellow-200 px-4 py-3 text-center text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
              >
                마이페이지
              </Link>
            )}

            <p className="text-center text-xs font-semibold text-gray-400">
              회원번호 #{userId}
            </p>
          </>
        ) : (
          <>
            <Link
              to="/member/login"
              className="border-2 border-black bg-yellow-200 px-4 py-3 text-center text-sm font-black shadow-[3px_3px_0_0] shadow-black"
            >
              로그인
            </Link>

            <Link
              to="/member/join"
              className="border-2 border-black bg-white px-4 py-3 text-center text-sm font-black"
            >
              회원가입
            </Link>
          </>
        )}
      </div>
    </aside>
  )
}

const SearchResultSection = ({
  loading,
  error,
  items,
  onOpenBook,
  onClose,
}) => (
  <section className="mt-7 overflow-hidden border-2 border-black bg-white shadow-[5px_5px_0_0] shadow-black">
    <div className="flex items-center justify-between border-b-2 border-black bg-blue-50 px-5 py-4 sm:px-6">
      <div>
        <p className="text-xs font-black text-blue-600">SEARCH RESULT</p>

        <h2 className="mt-1 text-xl font-black">통합검색 결과</h2>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex h-9 w-9 items-center justify-center border-2 border-black bg-white text-lg font-black"
        aria-label="검색 결과 닫기"
      >
        ×
      </button>
    </div>

    <div className="p-5 sm:p-6">
      {loading && <LoadingPanel message="도서를 검색하고 있습니다." />}

      {!loading && error && <ErrorPanel message={error} />}

      {!loading && !error && items.length === 0 && (
        <EmptyPanel message="검색 결과가 없습니다." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((book, index) => (
            <button
              key={book.isbn13 || book.id || index}
              type="button"
              onClick={() => onOpenBook(book)}
              className="flex gap-4 border-2 border-black bg-gray-50 p-4 text-left transition hover:bg-yellow-100"
            >
              <BookCover book={book} compact />

              <div className="min-w-0">
                <h3 className="line-clamp-2 font-black text-gray-950">
                  {book.title}
                </h3>

                <p className="mt-2 line-clamp-1 text-xs font-semibold text-gray-500">
                  {book.author}
                </p>

                <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                  {book.publisher}
                </p>

                <p className="mt-3 text-xs font-black text-blue-700">
                  상세보기 →
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
)

const SectionHeader = ({ eyebrow, title, description, action }) => (
  <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p className="text-xs font-black tracking-[0.18em] text-blue-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-black text-gray-950 sm:text-3xl">
        {title}
      </h2>

      <p className="mt-2 text-sm font-semibold text-gray-500">{description}</p>
    </div>

    {action}
  </div>
)

const AI_RECOMMENDATION_LEVEL_INFO = {
  VERY_HIGH: {
    label: '매우 추천',
    className: 'border-red-500 bg-red-100 text-red-800',
  },
  HIGH: {
    label: '추천',
    className: 'border-orange-500 bg-orange-100 text-orange-800',
  },
  MEDIUM: {
    label: '보통',
    className: 'border-yellow-500 bg-yellow-100 text-yellow-800',
  },
  LOW: {
    label: '낮음',
    className: 'border-blue-500 bg-blue-100 text-blue-800',
  },
  VERY_LOW: {
    label: '매우 낮음',
    className: 'border-gray-400 bg-gray-100 text-gray-700',
  },
}

const AiRecommendedBookGrid = ({
  books,
  onOpenBook,
}) => (
  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
    {books.map((book, index) => (
      <AiRecommendedBookCard
        key={book.isbn13 || book.id || index}
        book={book}
        onOpen={() => onOpenBook(book)}
      />
    ))}
  </div>
)

const AiRecommendedBookCard = ({
  book,
  onOpen,
}) => {
  const levelInfo =
    AI_RECOMMENDATION_LEVEL_INFO[
      book.recommendationLevel
    ] || AI_RECOMMENDATION_LEVEL_INFO.MEDIUM

  return (
    <article className="group flex h-full flex-col border-2 border-black bg-purple-50 p-4 shadow-[4px_4px_0_0] shadow-black transition hover:-translate-y-1 hover:bg-yellow-50">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 min-w-10 items-center justify-center border-2 border-black bg-purple-200 px-1 text-sm font-black">
          AI {book.aiRank}
        </span>

        <span
          className={`border-2 px-2 py-1 text-[11px] font-black ${levelInfo.className}`}
        >
          {levelInfo.label}
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <BookCover book={book} trend />
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <h3 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-gray-950">
          {book.title}
        </h3>

        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
          {book.author}
        </p>

        <div className="mt-4 grid grid-cols-2 border-2 border-black bg-white text-center">
          <div className="border-r-2 border-black px-2 py-3">
            <p className="text-[10px] font-black text-gray-500">
              AI 추천도
            </p>

            <p className="mt-1 text-lg font-black text-purple-800">
              {book.recommendationScore.toFixed(1)}
            </p>
          </div>

          <div className="px-2 py-3">
            <p className="text-[10px] font-black text-gray-500">
              AI 인기도
            </p>

            <p className="mt-1 text-lg font-black text-blue-800">
              {book.popularityScore.toFixed(1)}
            </p>
          </div>
        </div>

        <p className="mt-3 line-clamp-3 min-h-15 text-[11px] font-semibold leading-5 text-gray-600">
          {book.aiComment}
        </p>

        <div className="mt-3 flex items-center justify-between text-[10px] font-black text-gray-400">
          <span>인기대출 #{book.rank}</span>
          <span>KDC {book.kdcMain || '-'}</span>
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={!book.isbn13}
          className="mt-4 w-full border-2 border-black bg-white px-3 py-2 text-xs font-black transition group-hover:bg-purple-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          도서 상세보기
        </button>
      </div>
    </article>
  )
}

const AutoScrollBookRail = ({ books, onOpenBook }) => {
  const viewportRef = useRef(null)
  const pausedRef = useRef(false)

  const duplicatedBooks = useMemo(() => [...books, ...books], [books])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || books.length === 0) {
      return undefined
    }

    let animationFrameId = null
    let previousTime = null

    const animate = (time) => {
      if (previousTime === null) {
        previousTime = time
      }

      const elapsed = time - previousTime

      previousTime = time

      if (!pausedRef.current) {
        const halfWidth = viewport.scrollWidth / 2

        if (halfWidth > viewport.clientWidth) {
          viewport.scrollLeft += elapsed * 0.035

          if (viewport.scrollLeft >= halfWidth) {
            viewport.scrollLeft -= halfWidth
          }
        }
      }

      animationFrameId = window.requestAnimationFrame(animate)
    }

    animationFrameId = window.requestAnimationFrame(animate)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [books])

  return (
    <div className="w-full">
      <div
        ref={viewportRef}
        onMouseEnter={() => {
          pausedRef.current = true
        }}
        onMouseLeave={() => {
          pausedRef.current = false
        }}
        onFocusCapture={() => {
          pausedRef.current = true
        }}
        onBlurCapture={() => {
          pausedRef.current = false
        }}
        onTouchStart={() => {
          pausedRef.current = true
        }}
        onTouchEnd={() => {
          pausedRef.current = false
        }}
        className="overflow-x-auto py-2"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        aria-label="인기 대출도서 자동 스크롤 목록"
      >
        <div className="flex w-max gap-5 px-1 pb-2 pr-6">
          {duplicatedBooks.map((book, index) => (
            <PopularScrollCard
              key={`${book.isbn13 || book.id || 'book'}-${index}`}
              book={book}
              rank={book.rank || (index % books.length) + 1}
              onOpen={() => onOpenBook(book)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const PopularScrollCard = ({ book, rank, onOpen }) => (
  <article className="group flex w-55 shrink-0 flex-col border-2 border-black bg-white p-4 shadow-[4px_4px_0_0] shadow-black transition hover:-translate-y-1 hover:bg-yellow-50">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 min-w-9 items-center justify-center border-2 border-black bg-yellow-200 px-1 text-sm font-black">
        {rank}
      </span>

      <span className="border border-black bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700">
        {book.loanCount.toLocaleString()}회
      </span>
    </div>

    <div className="mt-4 flex justify-center">
      <BookCover book={book} rail />
    </div>

    <div className="mt-4 flex flex-1 flex-col">
      <h3 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-gray-950">
        {book.title}
      </h3>

      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
        {book.author}
      </p>

      <button
        type="button"
        onClick={onOpen}
        disabled={!book.isbn13}
        className="mt-4 w-full border-2 border-black bg-white px-3 py-2 text-xs font-black transition group-hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      >
        상세보기
      </button>
    </div>
  </article>
)

const HotTrendBookGroups = ({ books, onOpenBook }) => {
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartXRef = useRef(null)

  const groupedBooks = useMemo(() => {
    const groups = new Map()

    books.forEach((book) => {
      const date = book.date || '기준일 미상'

      if (!groups.has(date)) {
        groups.set(date, [])
      }

      groups.get(date).push(book)
    })

    return Array.from(groups.entries()).sort(([firstDate], [secondDate]) =>
      String(secondDate).localeCompare(String(firstDate)),
    )
  }, [books])

  useEffect(() => {
    if (groupedBooks.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(0)
      return
    }

    setActiveIndex((previousIndex) =>
      Math.min(previousIndex, groupedBooks.length - 1),
    )
  }, [groupedBooks.length])

  if (groupedBooks.length === 0) {
    return null
  }

  const moveTo = (index) => {
    const total = groupedBooks.length

    if (total === 0) {
      return
    }

    setActiveIndex((index + total) % total)
  }

  const movePrevious = () => {
    moveTo(activeIndex - 1)
  }

  const moveNext = () => {
    moveTo(activeIndex + 1)
  }

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.touches?.[0]?.clientX ?? null
  }

  const handleTouchEnd = (event) => {
    const startX = touchStartXRef.current

    const endX = event.changedTouches?.[0]?.clientX

    touchStartXRef.current = null

    if (startX === null || endX === undefined) {
      return
    }

    const difference = endX - startX

    if (Math.abs(difference) < 50) {
      return
    }

    if (difference > 0) {
      movePrevious()
    } else {
      moveNext()
    }
  }

  const [activeDate, activeItems] = groupedBooks[activeIndex]

  return (
    <section className="overflow-hidden border-2 border-black bg-white shadow-[5px_5px_0_0] shadow-black">
      <div className="flex flex-col gap-4 border-b-2 border-black bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-black tracking-[0.15em] text-red-600">
            RISING DATE
          </p>

          <h3 className="mt-1 text-xl font-black text-gray-950">
            {formatTrendDate(activeDate)} 급상승
          </h3>

          <p className="mt-1 text-xs font-bold text-gray-500">
            최근 3일 중 {activeIndex + 1}번째 · 상위 {activeItems.length}권
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={movePrevious}
            className="flex h-11 w-11 items-center justify-center border-2 border-black bg-white text-xl font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
            aria-label="이전 날짜 급상승 도서 보기"
          >
            ←
          </button>

          <div className="min-w-16 border-2 border-black bg-white px-3 py-2 text-center text-sm font-black">
            {activeIndex + 1} / {groupedBooks.length}
          </div>

          <button
            type="button"
            onClick={moveNext}
            className="flex h-11 w-11 items-center justify-center border-2 border-black bg-white text-xl font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
            aria-label="다음 날짜 급상승 도서 보기"
          >
            →
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{
            transform: `translateX(-${activeIndex * 100}%)`,
          }}
        >
          {groupedBooks.map(([date, items]) => (
            <div
              key={date}
              className="w-full shrink-0 p-5 sm:p-6"
              aria-hidden={date !== activeDate}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {items.map((book, index) => (
                  <HotTrendBookCard
                    key={`${book.date || 'date'}-${
                      book.isbn13 || book.id || index
                    }`}
                    book={book}
                    onOpen={() => onOpenBook(book)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 border-t-2 border-black bg-gray-50 px-4 py-4">
        {groupedBooks.map(([date], index) => {
          const selected = index === activeIndex

          return (
            <button
              key={date}
              type="button"
              onClick={() => moveTo(index)}
              className={`border-2 border-black px-3 py-2 text-xs font-black transition ${
                selected
                  ? 'bg-yellow-200 shadow-[2px_2px_0_0] shadow-black'
                  : 'bg-white hover:bg-gray-100'
              }`}
              aria-current={selected ? 'true' : undefined}
            >
              {formatTrendDate(date)}
            </button>
          )
        })}
      </div>
    </section>
  )
}

const HotTrendBookCard = ({ book, onOpen }) => {
  const difference = Number(book.difference ?? 0)

  return (
    <article className="group flex h-full flex-col border-2 border-black bg-red-50 p-4 transition hover:-translate-y-1 hover:bg-yellow-50">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 min-w-9 items-center justify-center border-2 border-black bg-white px-1 text-sm font-black">
          {book.ranking ?? book.no ?? '-'}
        </span>

        <span className="border-2 border-red-500 bg-white px-2 py-1 text-xs font-black text-red-700">
          ▲ {Math.abs(difference).toLocaleString()} 상승
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <BookCover book={book} trend />
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <h4 className="line-clamp-2 min-h-12 text-sm font-black leading-6 text-gray-950">
          {book.title}
        </h4>

        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">
          {book.author}
        </p>

        <div className="mt-3 border-t border-red-200 pt-3 text-[11px] font-bold leading-5 text-gray-500">
          <p>지난주 {book.baseWeekRank ?? '-'}위</p>

          <p>전주 {book.pastWeekRank ?? '-'}위</p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={!book.isbn13}
          className="mt-4 w-full border-2 border-black bg-white px-3 py-2 text-xs font-black transition group-hover:bg-yellow-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          상세보기
        </button>
      </div>
    </article>
  )
}

const formatTrendDate = (value) => {
  if (!value) {
    return '기준일 미상'
  }

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const BookCover = ({ book, compact = false, rail = false, trend = false }) => {
  const [imageFailed, setImageFailed] = useState(false)

  const sizeClass = compact
    ? 'h-28 w-20'
    : rail || trend
      ? 'h-44 w-32'
      : 'h-52 w-36'

  if (!book.imageUrl || imageFailed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border-2 border-black bg-gray-100 p-2 text-center text-xs font-black text-gray-400 ${sizeClass}`}
      >
        표지 없음
      </div>
    )
  }

  return (
    <img
      src={book.imageUrl}
      alt={`${book.title} 표지`}
      onError={() => setImageFailed(true)}
      className={`shrink-0 border-2 border-black bg-gray-100 object-cover ${sizeClass}`}
    />
  )
}

const LoadingPanel = ({ message }) => (
  <div className="flex min-h-48 flex-col items-center justify-center border-2 border-black bg-white p-6 text-center">
    <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

    <p className="mt-4 text-sm font-black text-gray-700">{message}</p>
  </div>
)

const ErrorPanel = ({ message, onRetry }) => (
  <div className="flex min-h-48 flex-col items-center justify-center border-2 border-red-400 bg-red-50 p-6 text-center">
    <p className="text-sm font-black text-red-800">{message}</p>

    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 border-2 border-black bg-white px-5 py-2 text-sm font-black"
      >
        다시 시도
      </button>
    )}
  </div>
)

const EmptyPanel = ({ message }) => (
  <div className="flex min-h-48 items-center justify-center border-2 border-black bg-gray-50 p-6 text-center text-sm font-black text-gray-500">
    {message}
  </div>
)

export default MainPage
