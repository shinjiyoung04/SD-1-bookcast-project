import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import { searchExternalBooks } from '../../api/externalBookApi'
import {
  checkRequestBookExist,
  searchRequestLibraries,
} from '../../api/bookRequestApi'

import useMemberStore from '../../store/useMemberStore'

const BOOK_REQUEST_PATH = '/book/request'
const DEFAULT_REGION = '31'
const DEFAULT_DTL_REGION = '31100'
const LIBRARY_CHECK_CONCURRENCY = 4

const LIBRARY_STATUS_INFO = {
  CHECKING: {
    label: '소장 여부 확인 중',
    badgeClass: 'bg-gray-200 text-gray-700',
    cardClass: 'border-gray-300 bg-gray-50',
  },
  NOT_OWNED: {
    label: '미소장 · 신청 가능',
    badgeClass: 'bg-yellow-200 text-yellow-900',
    cardClass: 'border-yellow-400 bg-yellow-50',
  },
  OWNED_AVAILABLE: {
    label: '소장 중 · 대출 가능',
    badgeClass: 'bg-green-200 text-green-900',
    cardClass: 'border-green-400 bg-green-50',
  },
  OWNED_UNAVAILABLE: {
    label: '소장 중 · 현재 대출 불가',
    badgeClass: 'bg-blue-100 text-blue-900',
    cardClass: 'border-blue-300 bg-blue-50',
  },
  UNKNOWN: {
    label: '소장 정보 없음',
    badgeClass: 'bg-gray-200 text-gray-700',
    cardClass: 'border-gray-300 bg-white',
  },
  ERROR: {
    label: '조회 실패',
    badgeClass: 'bg-red-100 text-red-800',
    cardClass: 'border-red-300 bg-red-50',
  },
}

const normalizeIsbn = (value) =>
  String(value ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()

const normalizeLibrary = (item, index = 0) => {
  const library = item?.lib || item?.library || item || {}

  const libCode = String(
    library.libCode ??
      library.lib_code ??
      library.libraryCode ??
      library.code ??
      '',
  ).trim()

  return {
    id: library.libraryId ?? library.id ?? null,
    key: libCode || `library-${index}`,
    libCode,
    libName:
      library.libName ?? library.libraryName ?? library.name ?? '도서관명 없음',
    address: library.address ?? library.addr ?? library.libraryAddress ?? '',
    tel: library.tel ?? library.phone ?? library.telephone ?? '',
    homepage: library.homepage ?? library.homePage ?? library.homepageUrl ?? '',
    status: 'CHECKING',
    existResult: null,
  }
}

const normalizeBookForRequest = (book) => {
  const isbn13 = normalizeIsbn(
    book?.isbn13 ?? book?.isbn ?? book?.isbn13Code ?? book?.ISBN13,
  )

  return {
    ...book,
    id: book?.id ?? book?.bookId ?? isbn13,
    title:
      book?.title ??
      book?.bookTitle ??
      book?.bookname ??
      book?.bookName ??
      '도서 제목 없음',
    author:
      book?.author ?? book?.authors ?? book?.bookAuthor ?? '저자 정보 없음',
    publisher: book?.publisher ?? book?.bookPublisher ?? '출판사 정보 없음',
    isbn13,
    publishedDate:
      book?.publishedDate ??
      book?.publicationDate ??
      book?.publication_date ??
      book?.publicationYear ??
      book?.publication_year ??
      '',
    thumbnailUrl:
      book?.thumbnailUrl ??
      book?.thumbnail ??
      book?.imageUrl ??
      book?.bookImageURL ??
      book?.bookImageUrl ??
      '',
    categoryName:
      book?.categoryName ??
      book?.className ??
      book?.class_nm ??
      book?.category?.name ??
      '분류 정보 없음',
    categoryId:
      book?.categoryId ??
      book?.category?.categoryId ??
      book?.category?.id ??
      null,
  }
}

const parseBooleanLike = (value) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toUpperCase()

    if (
      normalizedValue === 'Y' ||
      normalizedValue === 'YES' ||
      normalizedValue === 'TRUE' ||
      normalizedValue === '1'
    ) {
      return true
    }

    if (
      normalizedValue === 'N' ||
      normalizedValue === 'NO' ||
      normalizedValue === 'FALSE' ||
      normalizedValue === '0'
    ) {
      return false
    }
  }

  return null
}

const normalizeExistResult = (data) => {
  const result =
    data?.response?.result ??
    data?.data?.response?.result ??
    data?.data?.result ??
    data?.result ??
    data ??
    {}

  const hasBook = parseBooleanLike(
    result.hasBook ?? result.isOwned ?? result.bookExist ?? result.exists,
  )

  const loanAvailable = parseBooleanLike(
    result.loanAvailable ?? result.isLoanAvailable ?? result.canLoan,
  )

  let status = 'UNKNOWN'

  if (hasBook === false) {
    status = 'NOT_OWNED'
  } else if (hasBook === true && loanAvailable === true) {
    status = 'OWNED_AVAILABLE'
  } else if (hasBook === true) {
    status = 'OWNED_UNAVAILABLE'
  }

  return {
    status,
    existResult: {
      ...result,
      hasBook,
      loanAvailable,
    },
  }
}

const runWithConcurrency = async (items, concurrency, task) => {
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      await task(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

const SearchPage = () => {
  const navigate = useNavigate()

  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user

  const isLogin = Boolean(loginUser)

  const [loginNoticeOpen, setLoginNoticeOpen] = useState(false)

  const [pendingRequestState, setPendingRequestState] = useState(null)

  const [searchType, setSearchType] = useState('keyword')
  const [searchValue, setSearchValue] = useState('')
  const [books, setBooks] = useState([])
  const [libraries, setLibraries] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)

  const [pageNo, setPageNo] = useState(1)
  const [pageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryChecking, setLibraryChecking] = useState(false)
  const [libraryError, setLibraryError] = useState('')

  const resultSectionRef = useRef(null)
  const libraryRequestIdRef = useRef(0)
  const [libraryPanelMaxHeight, setLibraryPanelMaxHeight] = useState(null)

  useEffect(() => {
    const element = resultSectionRef.current

    if (!element) {
      return undefined
    }

    const updateHeight = () => {
      if (!resultSectionRef.current) {
        return
      }

      setLibraryPanelMaxHeight(resultSectionRef.current.offsetHeight)
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    window.addEventListener('resize', updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [
    books,
    libraries,
    loading,
    libraryLoading,
    libraryChecking,
    pageNo,
    selectedBook,
  ])

  const librarySummary = useMemo(() => {
    return libraries.reduce(
      (summary, library) => {
        summary.total += 1

        if (library.status === 'NOT_OWNED') {
          summary.notOwned += 1
        } else if (
          library.status === 'OWNED_AVAILABLE' ||
          library.status === 'OWNED_UNAVAILABLE'
        ) {
          summary.owned += 1
        } else if (library.status === 'CHECKING') {
          summary.checking += 1
        } else {
          summary.unknown += 1
        }

        return summary
      },
      {
        total: 0,
        owned: 0,
        notOwned: 0,
        checking: 0,
        unknown: 0,
      },
    )
  }, [libraries])

  const resetLibraryPanel = () => {
    libraryRequestIdRef.current += 1
    setSelectedBook(null)
    setLibraries([])
    setLibraryLoading(false)
    setLibraryChecking(false)
    setLibraryError('')
  }

  const getSearchParams = (targetPageNo = pageNo) => {
    const value = searchValue.trim()

    return {
      keyword: searchType === 'keyword' ? value : '',
      title: searchType === 'title' ? value : '',
      author: searchType === 'author' ? value : '',
      isbn13: searchType === 'isbn13' ? value : '',
      publisher: searchType === 'publisher' ? value : '',
      pageNo: targetPageNo,
      pageSize,
    }
  }

  const handleSearch = async (event) => {
    event.preventDefault()

    if (!searchValue.trim()) {
      alert('검색어를 입력해주세요.')
      return
    }

    try {
      setLoading(true)
      setPageNo(1)
      resetLibraryPanel()

      const data = await searchExternalBooks(getSearchParams(1))

      if (Array.isArray(data)) {
        setBooks(data)
      } else {
        setBooks([])
        alert('검색 응답 형식이 올바르지 않습니다. 콘솔을 확인해주세요.')
      }
    } catch (error) {
      console.error('[SearchPage] 도서 검색 실패:', error)
      alert('도서 검색에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handlePageSearch = async (nextPageNo) => {
    if (nextPageNo < 1) {
      return
    }

    try {
      setLoading(true)
      setPageNo(nextPageNo)
      resetLibraryPanel()

      const data = await searchExternalBooks(getSearchParams(nextPageNo))

      setBooks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('[SearchPage] 페이지 이동 중 오류:', error)
      alert('페이지 이동 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const updateLibraryStatus = (requestId, libCode, updates) => {
    if (requestId !== libraryRequestIdRef.current) {
      return
    }

    setLibraries((previousLibraries) =>
      previousLibraries.map((library) =>
        library.libCode === libCode
          ? {
              ...library,
              ...updates,
            }
          : library,
      ),
    )
  }

  const checkOneLibrary = async (library, isbn13, requestId) => {
    try {
      const response = await checkRequestBookExist({
        libCode: library.libCode,
        isbn13,
      })

      const normalizedResult = normalizeExistResult(response)

      updateLibraryStatus(requestId, library.libCode, normalizedResult)
    } catch (error) {
      console.error(
        `[SearchPage] ${library.libName} 소장 여부 확인 실패:`,
        error.response?.data || error,
      )

      updateLibraryStatus(requestId, library.libCode, {
        status: 'ERROR',
        existResult: null,
      })
    }
  }

  const handleFindLibraries = async (book) => {
    const normalizedBook = normalizeBookForRequest(book)

    if (!normalizedBook.isbn13) {
      alert('ISBN 정보가 없어 도서관 소장 여부를 조회할 수 없습니다.')
      return
    }

    const requestId = libraryRequestIdRef.current + 1

    libraryRequestIdRef.current = requestId

    setSelectedBook(normalizedBook)
    setLibraries([])
    setLibraryError('')
    setLibraryLoading(true)
    setLibraryChecking(false)

    try {
      const data = await searchRequestLibraries({
        region: DEFAULT_REGION,
        dtlRegion: DEFAULT_DTL_REGION,
        pageNo: 1,
        pageSize: 50,
      })

      if (requestId !== libraryRequestIdRef.current) {
        return
      }

      const libraryList = (Array.isArray(data) ? data : [])
        .map(normalizeLibrary)
        .filter((library) => library.libCode)
        .sort((first, second) =>
          first.libName.localeCompare(second.libName, 'ko-KR'),
        )

      if (libraryList.length === 0) {
        setLibraries([])
        setLibraryError('고양시에서 조회된 도서관이 없습니다.')
        return
      }

      setLibraries(libraryList)
      setLibraryLoading(false)
      setLibraryChecking(true)

      await runWithConcurrency(
        libraryList,
        LIBRARY_CHECK_CONCURRENCY,
        async (library) => {
          await checkOneLibrary(library, normalizedBook.isbn13, requestId)
        },
      )
    } catch (error) {
      console.error('[SearchPage] 고양시 도서관 목록 조회 실패:', error)

      if (requestId === libraryRequestIdRef.current) {
        setLibraries([])
        setLibraryError(
          error.response?.data?.message ||
            error.response?.data?.detail ||
            '고양시 도서관 목록을 불러오지 못했습니다.',
        )
      }
    } finally {
      if (requestId === libraryRequestIdRef.current) {
        setLibraryLoading(false)
        setLibraryChecking(false)
      }
    }
  }

  const handleRetryLibrary = async (library) => {
    if (!selectedBook?.isbn13) {
      return
    }

    const requestId = libraryRequestIdRef.current

    updateLibraryStatus(requestId, library.libCode, {
      status: 'CHECKING',
      existResult: null,
    })

    await checkOneLibrary(library, selectedBook.isbn13, requestId)
  }

  const createHopeRequestState = (library) => ({
    book: normalizeBookForRequest(selectedBook),

    library: {
      id: library.id,
      libCode: library.libCode,
      libraryName: library.libName,
      address: library.address,
      phone: library.tel,
      homepage: library.homepage,
      status: 'AVAILABLE',
    },

    autoSelectLibrary: true,
    source: 'search-page',
  })

  const handleApplyHope = (library) => {
    if (!selectedBook || library.status !== 'NOT_OWNED') {
      return
    }

    const requestState = createHopeRequestState(library)

    if (!isLogin) {
      setPendingRequestState(requestState)

      setLoginNoticeOpen(true)
      return
    }

    navigate(BOOK_REQUEST_PATH, {
      state: requestState,
    })
  }

  const closeLoginNotice = () => {
    setLoginNoticeOpen(false)
    setPendingRequestState(null)
  }

  const moveToLogin = () => {
    setLoginNoticeOpen(false)

    navigate('/member/login', {
      state: {
        redirectTo: BOOK_REQUEST_PATH,

        redirectState: pendingRequestState,

        message: '희망도서 신청은 로그인 후 이용할 수 있습니다.',

        source: 'book-request',
      },
    })
  }

  return (
    <BasicLayout>
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="border-2 border-black bg-white p-8 shadow-[6px_6px_0_0] shadow-black">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-black text-black">도서 검색</h2>

            <p className="text-sm text-gray-600">
              네이버·알라딘 도서 검색 결과와 고양시 전체 도서관의 소장 여부를
              확인할 수 있습니다.
            </p>
          </div>

          <form
            onSubmit={handleSearch}
            className="mt-6 grid gap-3 md:grid-cols-[160px_1fr_120px]"
          >
            <select
              value={searchType}
              onChange={(event) => {
                setSearchType(event.target.value)
                setPageNo(1)
              }}
              className="border-2 border-black bg-white px-4 py-3 font-bold shadow-[4px_4px_0_0] shadow-black focus:outline-0"
            >
              <option value="keyword">통합검색</option>

              <option value="title">제목</option>

              <option value="author">저자</option>

              <option value="isbn13">ISBN</option>

              <option value="publisher">출판사</option>
            </select>

            <input
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value)
                setPageNo(1)
              }}
              placeholder="도서명, 저자, ISBN, 출판사를 입력하세요"
              className="border-2 border-black px-4 py-3 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0"
            />

            <button
              type="submit"
              disabled={loading}
              className="border-2 border-black bg-yellow-200 px-6 py-3 font-bold shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:bg-gray-200"
            >
              {loading ? '검색 중' : '검색'}
            </button>
          </form>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_460px]">
            <section ref={resultSectionRef}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-black">검색 결과</h3>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageSearch(pageNo - 1)}
                    disabled={pageNo <= 1 || loading}
                    className="border-2 border-black bg-white px-3 py-1 text-sm font-bold disabled:bg-gray-200"
                  >
                    이전
                  </button>

                  <span className="text-sm font-bold">{pageNo} 페이지</span>

                  <button
                    type="button"
                    onClick={() => handlePageSearch(pageNo + 1)}
                    disabled={loading || books.length === 0}
                    className="border-2 border-black bg-white px-3 py-1 text-sm font-bold disabled:bg-gray-200"
                  >
                    다음
                  </button>
                </div>
              </div>

              {loading && (
                <div className="border-2 border-black bg-gray-50 p-8 text-center font-bold">
                  검색 중입니다...
                </div>
              )}

              {!loading && books.length === 0 && (
                <div className="border-2 border-black bg-gray-50 p-8 text-center text-gray-500">
                  검색 결과가 없습니다.
                </div>
              )}

              <div className="grid gap-5">
                {books.map((book, index) => {
                  const normalizedBook = normalizeBookForRequest(book)

                  const selected =
                    selectedBook?.isbn13 &&
                    selectedBook.isbn13 === normalizedBook.isbn13

                  return (
                    <div
                      key={`${
                        normalizedBook.isbn13 || normalizedBook.title
                      }-${index}`}
                      className={`flex gap-5 border-2 p-5 shadow-[4px_4px_0_0] shadow-black ${
                        selected
                          ? 'border-yellow-500 bg-yellow-50'
                          : 'border-black bg-white'
                      }`}
                    >
                      <div className="h-40 w-28 shrink-0 overflow-hidden border-2 border-black bg-gray-100">
                        {normalizedBook.thumbnailUrl ? (
                          <img
                            src={normalizedBook.thumbnailUrl}
                            alt={normalizedBook.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-400">
                            No Image
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="line-clamp-2 text-lg font-black">
                              {normalizedBook.title}
                            </h4>

                            <p className="mt-1 text-sm text-gray-700">
                              {normalizedBook.author}
                              {' / '}
                              {normalizedBook.publisher}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-md border border-black bg-yellow-100 px-2 py-1 text-xs font-bold">
                            통합검색
                          </span>
                        </div>

                        <div className="mt-3 grid gap-1 text-sm text-gray-600">
                          <p>ISBN: {normalizedBook.isbn13 || '정보 없음'}</p>

                          <p>
                            출판년도:{' '}
                            {book.publicationYear ||
                              normalizedBook.publishedDate ||
                              '정보 없음'}
                          </p>

                          <p>
                            분류:{' '}
                            {book.className ||
                              normalizedBook.categoryName ||
                              '정보 없음'}
                          </p>

                          <p>대출 수: {book.loanCount ?? 0}</p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            to={`/books/${normalizedBook.isbn13}`}
                            state={{
                              book: normalizedBook,
                            }}
                            className="border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-gray-100"
                          >
                            상세보기
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleFindLibraries(normalizedBook)}
                            className="border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-yellow-100"
                          >
                            {selected && (libraryLoading || libraryChecking)
                              ? '소장 현황 확인 중'
                              : '고양시 소장 현황'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <aside
              className="h-fit overflow-y-auto border-2 border-black bg-gray-50 p-5 pr-3 shadow-[4px_4px_0_0] shadow-black lg:sticky lg:top-24"
              style={{
                maxHeight: libraryPanelMaxHeight
                  ? `${libraryPanelMaxHeight}px`
                  : undefined,
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">고양시 전체 도서관</h3>

                  <p className="mt-1 text-xs text-gray-500">
                    덕양구·일산동구·일산서구
                  </p>
                </div>

                {selectedBook && (
                  <button
                    type="button"
                    onClick={() => handleFindLibraries(selectedBook)}
                    disabled={libraryLoading || libraryChecking}
                    className="border-2 border-black bg-white px-3 py-1.5 text-xs font-black disabled:opacity-50"
                  >
                    다시 조회
                  </button>
                )}
              </div>

              {!selectedBook && (
                <p className="mt-4 text-sm leading-6 text-gray-500">
                  검색 결과에서 <strong>고양시 소장 현황</strong> 버튼을 누르면
                  모든 도서관이 표시됩니다.
                </p>
              )}

              {selectedBook && (
                <div className="mt-4 border-2 border-black bg-white p-4">
                  <p className="text-xs font-bold text-gray-500">선택한 도서</p>

                  <p className="mt-1 line-clamp-2 text-sm font-black text-gray-900">
                    {selectedBook.title}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    ISBN: {selectedBook.isbn13}
                  </p>
                </div>
              )}

              {selectedBook && libraries.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                  <SummaryBox label="전체" count={librarySummary.total} />

                  <SummaryBox label="소장" count={librarySummary.owned} />

                  <SummaryBox label="미소장" count={librarySummary.notOwned} />

                  <SummaryBox
                    label="확인 중/실패"
                    count={librarySummary.checking + librarySummary.unknown}
                  />
                </div>
              )}

              {libraryLoading && (
                <div className="mt-5 border-2 border-black bg-white p-5 text-center">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

                  <p className="mt-3 text-sm font-bold">
                    고양시 도서관 목록을 불러오는 중입니다.
                  </p>
                </div>
              )}

              {!libraryLoading && libraryChecking && (
                <div className="mt-5 border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-700">
                  도서관별 소장 여부를 순차적으로 확인하고 있습니다. 확인이 끝난
                  도서관부터 상태가 표시됩니다.
                </div>
              )}

              {!libraryLoading && libraryError && (
                <div className="mt-5 border-2 border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700">
                  {libraryError}
                </div>
              )}

              {!libraryLoading &&
                !libraryError &&
                selectedBook &&
                libraries.length === 0 && (
                  <p className="mt-5 border-2 border-black bg-white p-4 text-center text-sm text-gray-500">
                    조회된 도서관이 없습니다.
                  </p>
                )}

              {!libraryLoading && libraries.length > 0 && (
                <div className="mt-5 grid gap-3">
                  {libraries.map((library) => {
                    const statusInfo =
                      LIBRARY_STATUS_INFO[library.status] ||
                      LIBRARY_STATUS_INFO.UNKNOWN

                    return (
                      <article
                        key={library.key}
                        className={`border-2 p-4 ${statusInfo.cardClass}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-black text-gray-950">
                              {library.libName}
                            </h4>

                            <p className="mt-1 text-xs leading-5 text-gray-600">
                              {library.address || '주소 정보 없음'}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          <p>코드: {library.libCode}</p>

                          <p>전화: {library.tel || '정보 없음'}</p>
                        </div>

                        {library.status === 'CHECKING' && (
                          <div className="mt-3 flex items-center gap-2 text-xs font-bold text-gray-600">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800" />
                            확인 중
                          </div>
                        )}

                        {library.status === 'NOT_OWNED' && (
                          <div className="mt-3">
                            <p className="mb-3 text-xs font-bold leading-5 text-yellow-900">
                              이 도서관은 해당 도서를 소장하고 있지 않습니다.
                              희망도서 신청이 가능합니다.
                            </p>

                            <button
                              type="button"
                              onClick={() => handleApplyHope(library)}
                              className="w-full border-2 border-black bg-yellow-200 px-4 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                            >
                              이 도서관에 희망도서 신청
                            </button>
                          </div>
                        )}

                        {library.status === 'OWNED_AVAILABLE' && (
                          <p className="mt-3 border border-green-300 bg-white/70 px-3 py-2 text-xs font-bold text-green-800">
                            해당 도서를 소장하고 있으며 현재 대출 가능합니다.
                          </p>
                        )}

                        {library.status === 'OWNED_UNAVAILABLE' && (
                          <p className="mt-3 border border-blue-200 bg-white/70 px-3 py-2 text-xs font-bold text-blue-800">
                            해당 도서를 소장하고 있지만 현재 대출할 수 없습니다.
                          </p>
                        )}

                        {(library.status === 'ERROR' ||
                          library.status === 'UNKNOWN') && (
                          <button
                            type="button"
                            onClick={() => handleRetryLibrary(library)}
                            className="mt-3 border-2 border-black bg-white px-3 py-2 text-xs font-black"
                          >
                            소장 여부 다시 확인
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      <LoginRequiredModal
        open={loginNoticeOpen}
        onClose={closeLoginNotice}
        onConfirm={moveToLogin}
      />
    </BasicLayout>
  )
}

const LoginRequiredModal = ({ open, onClose, onConfirm }) => {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-required-title"
        className="w-full max-w-md border-2 border-black bg-yellow-50 p-6 shadow-[7px_7px_0_0] shadow-black"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-yellow-700">
              로그인이 필요합니다
            </p>

            <h2
              id="login-required-title"
              className="mt-1 text-2xl font-black text-gray-950"
            >
              희망도서 신청
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-white text-xl font-black"
          >
            ×
          </button>
        </div>

        <div className="mt-5 border-2 border-yellow-300 bg-white px-4 py-4">
          <p className="text-sm font-bold leading-6 text-gray-700">
            희망도서 신청은 로그인한 회원만 이용할 수 있습니다.
          </p>

          <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
            로그인 페이지로 이동하시겠습니까?
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-black bg-white px-5 py-2.5 text-sm font-black"
          >
            취소
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="border-2 border-black bg-yellow-200 px-5 py-2.5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    </div>
  )
}

const SummaryBox = ({ label, count }) => {
  return (
    <div className="border border-gray-300 bg-white px-3 py-2">
      <p className="font-bold text-gray-500">{label}</p>

      <p className="mt-1 text-lg font-black text-gray-950">{count}</p>
    </div>
  )
}

export default SearchPage
