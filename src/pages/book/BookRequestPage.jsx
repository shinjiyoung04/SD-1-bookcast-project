import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
import useMemberStore from '../../store/useMemberStore'
import {
  checkRequestBookExist,
  createHopeApplication,
  searchRequestBooks,
  searchRequestLibraries,
} from '../../api/bookRequestApi'
import { checkDuplicateHopeApplication } from '../../api/applicationDuplicateApi'

const REGION_OPTIONS = [
  {
    value: '31100',
    label: '고양시 전체',
  },
  {
    value: '31101',
    label: '고양시 덕양구',
  },
  {
    value: '31103',
    label: '고양시 일산동구',
  },
  {
    value: '31104',
    label: '고양시 일산서구',
  },
]

const SEARCH_TYPE_OPTIONS = [
  {
    value: 'ALL',
    label: '전체',
  },
  {
    value: 'TITLE',
    label: '도서명',
  },
  {
    value: 'AUTHOR',
    label: '저자명',
  },
  {
    value: 'ISBN',
    label: 'ISBN',
  },
  {
    value: 'PUBLISHER',
    label: '출판사',
  },
]

const REQUEST_STEPS = {
  BOOK: 'BOOK',
  LIBRARY: 'LIBRARY',
}

const LIBRARY_STATUS = {
  UNCHECKED: {
    label: '선택 후 확인',
    cardClass: 'border-black bg-white hover:bg-yellow-50',
    badgeClass: 'border border-gray-300 bg-gray-100 text-gray-700',
  },

  CHECKING: {
    label: '소장 여부 확인 중',
    cardClass: 'cursor-wait border-black bg-gray-100 opacity-80',
    badgeClass: 'border border-gray-400 bg-gray-200 text-gray-700',
  },

  AVAILABLE: {
    label: '신청 가능',
    cardClass: 'border-blue-700 bg-blue-50 hover:bg-blue-100',
    badgeClass: 'border border-blue-300 bg-blue-100 text-blue-800',
  },

  OWNED: {
    label: '이미 소장 중',
    cardClass: 'cursor-not-allowed border-red-600 bg-red-50 opacity-75',
    badgeClass: 'border border-red-300 bg-red-100 text-red-800',
  },

  UNKNOWN: {
    label: '확인 실패 · 다시 선택',
    cardClass: 'border-yellow-600 bg-yellow-50 hover:bg-yellow-100',
    badgeClass: 'border border-yellow-400 bg-yellow-100 text-yellow-900',
  },
}

const extractArray = (data, possiblePaths) => {
  for (const path of possiblePaths) {
    let current = data

    for (const key of path) {
      current = current?.[key]
    }

    if (Array.isArray(current)) {
      return current
    }
  }

  return []
}

const extractBookList = (data) => {
  // Spring Boot가 List<ExternalBookResponse>를 직접 반환하는 경우
  if (Array.isArray(data)) {
    return data
  }

  return extractArray(data, [
    ['response', 'docs'],
    ['response', 'data', 'docs'],
    ['data', 'response', 'docs'],
    ['data', 'docs'],
    ['books'],
    ['results'],
    ['list'],
    ['docs'],
    ['content'],
    ['items'],
    ['data'],
  ])
}

const extractLibraryList = (data) => {
  // Spring Boot가 List<ExternalLibraryResponse>를 직접 반환하는 경우
  if (Array.isArray(data)) {
    return data
  }

  return extractArray(data, [
    ['response', 'libs'],
    ['response', 'data', 'libs'],
    ['data', 'response', 'libs'],
    ['data', 'libs'],
    ['libraries'],
    ['results'],
    ['list'],
    ['libs'],
    ['content'],
    ['items'],
    ['data'],
  ])
}

const normalizeBook = (item, index = 0) => {
  const book = item?.doc || item?.book || item || {}

  const isbn13 = String(
    book.isbn13 ?? book.isbn ?? book.ISBN13 ?? '',
  ).replaceAll('-', '')

  const title =
    book.bookname ??
    book.bookName ??
    book.title ??
    book.bookTitle ??
    '도서 제목 없음'

  return {
    id:
      book.bookId ||
      book.id ||
      isbn13 ||
      `${title}-${index}` ||
      `book-${index}`,

    title,

    author: book.authors ?? book.author ?? book.bookAuthor ?? '저자 정보 없음',

    publisher: book.publisher ?? book.bookPublisher ?? '출판사 정보 없음',

    isbn13,

    publishedDate:
      book.publication_date ??
      book.publicationDate ??
      book.publishedDate ??
      book.publication_year ??
      book.publicationYear ??
      '',

    thumbnailUrl:
      book.bookImageURL ??
      book.bookImageUrl ??
      book.thumbnailUrl ??
      book.thumbnail ??
      book.imageUrl ??
      '',

    categoryName:
      book.class_nm ??
      book.className ??
      book.categoryName ??
      book.category?.name ??
      '분류 정보 없음',

    categoryId:
      book.categoryId ?? book.category?.categoryId ?? book.category?.id ?? null,
  }
}

const normalizeLibrary = (item, index = 0) => {
  const library = item?.lib || item?.library || item || {}

  return {
    id: library.libraryId ?? library.id ?? null,

    key:
      library.libCode ??
      library.lib_code ??
      library.libraryId ??
      library.id ??
      `library-${index}`,

    libCode: library.libCode ?? library.lib_code ?? library.libcode ?? '',

    libraryName:
      library.libName ?? library.libraryName ?? library.name ?? '도서관명 없음',

    address: library.address ?? library.addr ?? '',

    phone: library.tel ?? library.phone ?? library.telephone ?? '',

    homepage: library.homepage ?? library.homepageUrl ?? '',

    status: 'UNCHECKED',
  }
}

const parseCanApplyHope = (data) => {
  const result =
    data?.response?.result ??
    data?.data?.response?.result ??
    data?.data?.result ??
    data?.result ??
    data

  if (typeof result?.canApplyHope === 'boolean') {
    return result.canApplyHope
  }

  if (typeof result?.canApply === 'boolean') {
    return result.canApply
  }

  const hasBook = result?.hasBook ?? result?.bookExist ?? result?.exists

  if (typeof hasBook === 'boolean') {
    return !hasBook
  }

  if (typeof hasBook === 'string') {
    const normalizedValue = hasBook.toUpperCase()

    if (
      normalizedValue === 'Y' ||
      normalizedValue === 'YES' ||
      normalizedValue === 'TRUE'
    ) {
      return false
    }

    if (
      normalizedValue === 'N' ||
      normalizedValue === 'NO' ||
      normalizedValue === 'FALSE'
    ) {
      return true
    }
  }

  return null
}

const formatPublishedDate = (value) => {
  if (!value) {
    return '-'
  }

  const stringValue = String(value)

  if (/^\d{4}$/.test(stringValue)) {
    return `${stringValue}년`
  }

  return stringValue
}

const normalizePublishedDateForRequest = (value) => {
  if (!value) {
    return null
  }

  const stringValue = String(value).trim()

  if (/^\d{4}$/.test(stringValue)) {
    return `${stringValue}-01-01`
  }

  if (/^\d{8}$/.test(stringValue)) {
    return `${stringValue.slice(0, 4)}-${stringValue.slice(
      4,
      6,
    )}-${stringValue.slice(6, 8)}`
  }

  const normalizedSeparatorValue = stringValue
    .replaceAll('.', '-')
    .replaceAll('/', '-')

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedSeparatorValue)) {
    return normalizedSeparatorValue
  }

  return null
}

/*
 * 희망도서 생성 API와 중복 확인 API의 응답 형태가 달라도
 * 상세페이지 이동에 필요한 신청번호를 안전하게 추출합니다.
 */
const extractApplicationId = (response) => {
  const candidates = [
    response?.applicationId,
    response?.application_id,
    response?.hopeApplicationId,
    response?.hope_application_id,
    response?.id,

    response?.data?.applicationId,
    response?.data?.application_id,
    response?.data?.hopeApplicationId,
    response?.data?.id,

    response?.result?.applicationId,
    response?.result?.application_id,
    response?.result?.hopeApplicationId,
    response?.result?.id,

    response?.response?.applicationId,
    response?.response?.application_id,
    response?.response?.id,

    response?.content?.applicationId,
    response?.content?.application_id,
    response?.content?.id,
  ]

  for (const candidate of candidates) {
    const applicationId = Number(candidate)

    if (Number.isInteger(applicationId) && applicationId > 0) {
      return applicationId
    }
  }

  return null
}

const createApplicationDetailUrl = (applicationId) =>
  applicationId ? `/citizen-votes/${applicationId}` : '/citizen-votes'

const BookRequestPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const initialBookHandledRef = useRef(false)

  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user

  const userId =
    loginUser?.userId ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    1

  const isTestUser = !loginUser

  const [currentStep, setCurrentStep] = useState(() => {
    const routeBook =
      location.state?.book ??
      location.state?.selectedBook ??
      location.state?.bookDetail

    return routeBook ? REQUEST_STEPS.LIBRARY : REQUEST_STEPS.BOOK
  })

  const [searchType, setSearchType] = useState('ALL')
  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const [selectedBook, setSelectedBook] = useState(null)

  const [dtlRegion, setDtlRegion] = useState('31100')
  const [libraries, setLibraries] = useState([])
  const [selectedLibrary, setSelectedLibrary] = useState(null)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [checkingLibraryKey, setCheckingLibraryKey] = useState(null)

  const [reason, setReason] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  /*
   * 브라우저 alert 대신 공통 AlertModal을 사용합니다.
   *
   * redirectUrl이 있는 알림은 모달의 확인 버튼을 누른 뒤
   * 신청 상세페이지로 이동합니다.
   */
  const [noticeModal, setNoticeModal] = useState(null)

  const loadLibraries = useCallback(
    async (book, regionCode, preferredLibrary = null) => {
      if (!book?.isbn13) {
        setLibraryError('ISBN 정보가 없어 도서관을 조회할 수 없습니다.')
        setLibraries([])
        return
      }

      setLibraryLoading(true)
      setLibraryError('')
      setSelectedLibrary(null)
      setCheckingLibraryKey(null)

      try {
        const response = await searchRequestLibraries({
          dtlRegion: regionCode,
        })

        let libraryList = extractLibraryList(response)
          .map(normalizeLibrary)
          .filter((library) => library.libCode)
          .sort((first, second) =>
            first.libraryName.localeCompare(second.libraryName, 'ko'),
          )

        if (libraryList.length === 0) {
          setLibraries([])
          setLibraryError('선택한 지역에서 조회된 도서관이 없습니다.')
          return
        }

        if (preferredLibrary?.libCode) {
          const normalizedPreferredLibrary = normalizeLibrary(preferredLibrary)

          const matchedLibrary = libraryList.find(
            (library) =>
              String(library.libCode) ===
              String(normalizedPreferredLibrary.libCode),
          )

          const targetLibrary = matchedLibrary || {
            ...normalizedPreferredLibrary,
            status: 'UNCHECKED',
          }

          if (!matchedLibrary) {
            libraryList = [targetLibrary, ...libraryList]
          }

          const checkingLibrary = {
            ...targetLibrary,
            status: 'CHECKING',
          }

          setLibraries(
            libraryList.map((library) =>
              library.libCode === checkingLibrary.libCode
                ? checkingLibrary
                : library,
            ),
          )

          setCheckingLibraryKey(checkingLibrary.key)

          try {
            const existResponse = await checkRequestBookExist({
              libCode: checkingLibrary.libCode,
              isbn13: book.isbn13,
            })

            const canApply = parseCanApplyHope(existResponse)

            if (canApply === true) {
              const availableLibrary = {
                ...checkingLibrary,
                status: 'AVAILABLE',
              }

              setLibraries((previousLibraries) =>
                previousLibraries.map((library) =>
                  library.libCode === availableLibrary.libCode
                    ? availableLibrary
                    : library,
                ),
              )

              setSelectedLibrary(availableLibrary)
              setSubmitError('')
            } else if (canApply === false) {
              setLibraries((previousLibraries) =>
                previousLibraries.map((library) =>
                  library.libCode === checkingLibrary.libCode
                    ? {
                        ...checkingLibrary,
                        status: 'OWNED',
                      }
                    : library,
                ),
              )

              setSubmitError(
                '선택한 도서관이 이미 해당 도서를 소장하고 있어 자동 선택하지 않았습니다.',
              )
            } else {
              setLibraries((previousLibraries) =>
                previousLibraries.map((library) =>
                  library.libCode === checkingLibrary.libCode
                    ? {
                        ...checkingLibrary,
                        status: 'UNKNOWN',
                      }
                    : library,
                ),
              )

              setSubmitError(
                '전달받은 도서관의 소장 여부를 확인하지 못했습니다. 도서관을 다시 선택해주세요.',
              )
            }
          } catch (error) {
            console.error(
              '[BookRequestPage] 전달받은 도서관 자동 선택 실패:',
              error.response?.data || error,
            )

            setLibraries((previousLibraries) =>
              previousLibraries.map((library) =>
                library.libCode === checkingLibrary.libCode
                  ? {
                      ...checkingLibrary,
                      status: 'UNKNOWN',
                    }
                  : library,
              ),
            )

            setSubmitError(
              error.response?.data?.message ||
                error.response?.data?.detail ||
                '전달받은 도서관의 소장 여부 확인에 실패했습니다.',
            )
          } finally {
            setCheckingLibraryKey(null)
          }

          return
        }

        setLibraries(libraryList)
      } catch (error) {
        console.error('[BookRequestPage] 도서관 목록 조회 실패:', error)
        console.error('[BookRequestPage] 서버 응답:', error.response?.data)

        const serverMessage =
          error.response?.data?.message ??
          error.response?.data?.detail ??
          error.response?.data?.error

        setLibraries([])
        setLibraryError(serverMessage || '도서관 목록을 불러오지 못했습니다.')
      } finally {
        setLibraryLoading(false)
      }
    },
    [],
  )

  const handleSelectBook = useCallback(
    async (book, preferredLibrary = null) => {
      setSelectedBook(book)
      setCurrentStep(REQUEST_STEPS.LIBRARY)
      setReason('')
      setSubmitError('')
      setSelectedLibrary(null)

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })

      await loadLibraries(book, dtlRegion, preferredLibrary)
    },
    [dtlRegion, loadLibraries],
  )

  useEffect(() => {
    if (initialBookHandledRef.current) {
      return
    }

    const routeBook =
      location.state?.book ??
      location.state?.selectedBook ??
      location.state?.bookDetail

    if (!routeBook) {
      return
    }

    const routeLibrary =
      location.state?.library ??
      location.state?.selectedLibrary ??
      location.state?.requestLibrary

    initialBookHandledRef.current = true

    const normalizedBook = normalizeBook(routeBook)

    const normalizedLibrary = routeLibrary
      ? normalizeLibrary(routeLibrary)
      : null

    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleSelectBook(normalizedBook, normalizedLibrary)
  }, [handleSelectBook, location.state])

  const handleSearch = async (event) => {
    event?.preventDefault()

    const trimmedKeyword = keyword.trim()

    if (!trimmedKeyword) {
      setSearchError('검색어를 입력해주세요.')
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    setSearchError('')
    setHasSearched(true)

    try {
      const response = await searchRequestBooks({
        searchType,
        keyword: trimmedKeyword,
        pageNo: 1,
        pageSize: 10,
      })

      console.log('[BookRequestPage] 검색 API 전체 응답:', response)
      console.log(
        '[BookRequestPage] 응답 자체가 배열인지:',
        Array.isArray(response),
      )

      const rawBooks = extractBookList(response)

      console.log('[BookRequestPage] 추출한 원본 도서 목록:', rawBooks)

      const books = rawBooks
        .map((book, index) => normalizeBook(book, index))
        .filter((book) => book.title && book.title !== '도서 제목 없음')

      console.log('[BookRequestPage] 화면 표시용 도서 목록:', books)

      setSearchResults(books)

      if (books.length === 0) {
        setSearchError(
          rawBooks.length > 0
            ? '검색 결과를 받았지만 화면용 데이터 변환에 실패했습니다.'
            : '검색 결과가 없습니다.',
        )
      }
    } catch (error) {
      console.error('[BookRequestPage] 도서 검색 실패:', error)

      console.error('[BookRequestPage] 서버 응답:', error.response?.data)

      const serverMessage =
        error.response?.data?.message ??
        error.response?.data?.detail ??
        error.response?.data?.error

      setSearchResults([])
      setSearchError(serverMessage || '도서 검색 중 오류가 발생했습니다.')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleRegionChange = async (event) => {
    const nextRegion = event.target.value

    setDtlRegion(nextRegion)
    setSelectedLibrary(null)

    if (selectedBook) {
      await loadLibraries(selectedBook, nextRegion)
    }
  }

  const handleReloadLibraries = async () => {
    if (!selectedBook) {
      setLibraryError('신청할 도서를 먼저 선택해주세요.')
      return
    }

    await loadLibraries(selectedBook, dtlRegion)
  }

  const handleLibrarySelect = async (library) => {
    if (!selectedBook?.isbn13) {
      setSubmitError('ISBN 정보가 없어 소장 여부를 확인할 수 없습니다.')
      return
    }

    if (
      library.status === 'OWNED' ||
      library.status === 'CHECKING' ||
      checkingLibraryKey
    ) {
      return
    }

    if (library.status === 'AVAILABLE') {
      setSelectedLibrary(library)
      setLibraryError('')
      setSubmitError('')
      return
    }

    setCheckingLibraryKey(library.key)
    setSelectedLibrary(null)
    setLibraryError('')
    setSubmitError('')

    setLibraries((previousLibraries) =>
      previousLibraries.map((item) =>
        item.key === library.key
          ? {
              ...item,
              status: 'CHECKING',
            }
          : item,
      ),
    )

    try {
      const existResponse = await checkRequestBookExist({
        libCode: library.libCode,
        isbn13: selectedBook.isbn13,
      })

      const canApply = parseCanApplyHope(existResponse)

      if (canApply === true) {
        const availableLibrary = {
          ...library,
          status: 'AVAILABLE',
        }

        setLibraries((previousLibraries) =>
          previousLibraries.map((item) =>
            item.key === library.key ? availableLibrary : item,
          ),
        )

        setSelectedLibrary(availableLibrary)
        return
      }

      if (canApply === false) {
        setLibraries((previousLibraries) =>
          previousLibraries.map((item) =>
            item.key === library.key
              ? {
                  ...item,
                  status: 'OWNED',
                }
              : item,
          ),
        )

        setSubmitError(
          '선택한 도서관이 이미 해당 도서를 소장하고 있어 희망도서 신청이 불가능합니다.',
        )
        return
      }

      setLibraries((previousLibraries) =>
        previousLibraries.map((item) =>
          item.key === library.key
            ? {
                ...item,
                status: 'UNKNOWN',
              }
            : item,
        ),
      )

      setSubmitError(
        '선택한 도서관의 소장 여부를 확인하지 못했습니다. 잠시 후 다시 선택해주세요.',
      )
    } catch (error) {
      console.error(
        `[BookRequestPage] ${library.libraryName} 소장 여부 확인 실패`,
        error.response?.data || error,
      )

      setLibraries((previousLibraries) =>
        previousLibraries.map((item) =>
          item.key === library.key
            ? {
                ...item,
                status: 'UNKNOWN',
              }
            : item,
        ),
      )

      const serverMessage =
        error.response?.data?.message ??
        error.response?.data?.detail ??
        error.response?.data?.error

      setSubmitError(
        serverMessage ||
          '도서관 소장 여부 확인 중 오류가 발생했습니다. 잠시 후 다시 선택해주세요.',
      )
    } finally {
      setCheckingLibraryKey(null)
    }
  }

  const handleBackToBookSearch = () => {
    setCurrentStep(REQUEST_STEPS.BOOK)
    setSelectedBook(null)
    setSelectedLibrary(null)
    setLibraries([])
    setReason('')
    setLibraryError('')
    setSubmitError('')
    setCheckingLibraryKey(null)

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const closeNoticeModal = () => {
    const redirectUrl = noticeModal?.redirectUrl

    const redirectState = noticeModal?.redirectState

    setNoticeModal(null)

    if (redirectUrl) {
      navigate(redirectUrl, {
        replace: true,
        state: redirectState,
      })
    }
  }

  const redirectDuplicateApplication = (duplicateResult) => {
    const applicationId = extractApplicationId(duplicateResult)

    const ownApplication = Boolean(duplicateResult?.ownApplication)

    /*
     * 신청번호가 존재하면 백엔드가 내려준 예전 redirectUrl보다
     * 새 시민투표 상세페이지 경로를 우선합니다.
     */
    const redirectUrl = applicationId
      ? createApplicationDetailUrl(applicationId)
      : duplicateResult?.redirectUrl || '/citizen-votes'

    const message =
      duplicateResult?.message ||
      (ownApplication
        ? '이미 같은 도서를 같은 도서관에 신청했습니다. 기존 신청 상세페이지로 이동합니다.'
        : '다른 사용자가 같은 도서를 같은 도서관에 이미 신청했습니다. 해당 신청 상세페이지에서 시민투표에 참여해주세요.')

    setNoticeModal({
      type: 'info',
      message,
      detailTitle: duplicateResult?.title || selectedBook?.title || '',
      detailLibraryName:
        duplicateResult?.libraryName || selectedLibrary?.libraryName || '',
      applicationId,
      redirectUrl,
      redirectState: {
        duplicateApplication: true,
        applicationId,
        title: duplicateResult?.title || selectedBook?.title || '',
        libraryName:
          duplicateResult?.libraryName || selectedLibrary?.libraryName || '',
        noticeMessage: message,
      },
    })
  }

  const findDuplicateApplication = async () => {
    if (!selectedBook?.isbn13 || !selectedLibrary?.libCode) {
      return null
    }

    const result = await checkDuplicateHopeApplication({
      userId,
      isbn: selectedBook.isbn13,
      libraryId: selectedLibrary.id || null,
      libCode: selectedLibrary.libCode,
    })

    return result?.duplicate ? result : null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!selectedBook) {
      setSubmitError('신청할 도서를 선택해주세요.')
      return
    }

    if (!selectedBook.isbn13) {
      setSubmitError('ISBN 정보가 없는 도서는 신청할 수 없습니다.')
      return
    }

    if (!selectedLibrary) {
      setSubmitError('신청할 도서관을 선택해주세요.')
      return
    }

    if (selectedLibrary.status !== 'AVAILABLE') {
      setSubmitError('소장 여부 확인이 완료된 신청 가능 도서관을 선택해주세요.')
      return
    }

    if (!reason.trim()) {
      setSubmitError('희망도서 신청 사유를 입력해주세요.')
      return
    }

    setSubmitLoading(true)
    setSubmitError('')

    try {
      const requestData = {
        userId,

        libraryId: selectedLibrary.id || null,
        libCode: selectedLibrary.libCode,
        libraryName: selectedLibrary.libraryName,
        libraryAddress: selectedLibrary.address || null,
        libraryPhone: selectedLibrary.phone || null,

        categoryId: selectedBook.categoryId || null,

        isbn: selectedBook.isbn13,
        title: selectedBook.title,
        author: selectedBook.author,
        publisher: selectedBook.publisher,
        publishedDate: normalizePublishedDateForRequest(
          selectedBook.publishedDate,
        ),

        reason: reason.trim(),
      }

      console.log('[BookRequestPage] 희망도서 신청 요청:', requestData)

      const duplicateResult = await findDuplicateApplication()

      if (duplicateResult) {
        redirectDuplicateApplication(duplicateResult)
        return
      }

      const response = await createHopeApplication(requestData)

      console.log('[BookRequestPage] 희망도서 신청 성공:', response)

      /*
       * 정상적인 생성 응답에서는 applicationId를 바로 사용합니다.
       * 기존 백엔드 응답처럼 신청번호가 누락된 경우에는
       * 방금 생성된 동일 ISBN·도서관 신청을 한 번 더 조회해 보완합니다.
       */
      let createdApplicationId = extractApplicationId(response)

      if (!createdApplicationId) {
        try {
          const createdApplication = await findDuplicateApplication()

          createdApplicationId = extractApplicationId(createdApplication)
        } catch (applicationIdError) {
          console.error(
            '[BookRequestPage] 생성된 신청번호 보완 조회 실패:',
            applicationIdError,
          )
        }
      }

      const successMessage =
        response?.message || '희망도서 신청이 완료되었습니다.'

      setNoticeModal({
        type: 'success',
        message: successMessage,
        detailTitle: selectedBook?.title || response?.title || '',
        detailLibraryName:
          selectedLibrary?.libraryName || response?.libraryName || '',
        applicationId: createdApplicationId,
        redirectUrl: createApplicationDetailUrl(createdApplicationId),
        redirectState: {
          applicationCreated: true,
          applicationId: createdApplicationId,
          title: selectedBook?.title || response?.title || '',
          libraryName:
            selectedLibrary?.libraryName || response?.libraryName || '',
          noticeMessage: successMessage,
        },
      })
    } catch (error) {
      console.error('[BookRequestPage] 희망도서 신청 실패:', error)
      console.error('[BookRequestPage] 서버 응답:', error.response?.data)

      try {
        const duplicateResult = await findDuplicateApplication()

        if (duplicateResult) {
          redirectDuplicateApplication(duplicateResult)
          return
        }
      } catch (duplicateCheckError) {
        console.error(
          '[BookRequestPage] 신청 실패 후 중복 재확인 실패:',
          duplicateCheckError,
        )
      }

      const responseData = error.response?.data
      const serverMessage =
        responseData?.message ?? responseData?.detail ?? responseData?.error

      const finalErrorMessage =
        serverMessage || '희망도서 신청 중 오류가 발생했습니다.'

      setSubmitError(finalErrorMessage)

      setNoticeModal({
        type: 'error',
        message: finalErrorMessage,
      })
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section>
            <div className="mb-6 border-2 border-black bg-white px-5 py-5 shadow-[5px_5px_0_0] shadow-black sm:px-7">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight text-gray-950">
                  희망도서 신청
                </h1>

                {isTestUser && (
                  <span className="border-2 border-black bg-yellow-200 px-3 py-1 text-xs font-black text-black">
                    테스트 사용자 ID: {userId}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                도서를 먼저 선택한 뒤, 다음 단계에서 신청 도서관과 신청 사유를
                입력합니다.
              </p>
            </div>

            <RequestStepIndicator currentStep={currentStep} />

            {currentStep === REQUEST_STEPS.BOOK && (
              <section className="mt-6 border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black sm:p-8">
                <div>
                  <p className="text-sm font-black text-blue-600">1단계</p>

                  <h2 className="mt-1 text-2xl font-black text-gray-950">
                    도서 검색
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    희망 도서로 신청할 도서를 검색해주세요.
                  </p>
                </div>

                <form
                  onSubmit={handleSearch}
                  className="mt-6 grid gap-3 md:grid-cols-[150px_1fr_110px]"
                >
                  <select
                    value={searchType}
                    onChange={(event) => setSearchType(event.target.value)}
                    className="h-12 border-2 border-black bg-white px-4 text-sm font-black text-gray-800 outline-none transition focus:bg-yellow-50"
                  >
                    {SEARCH_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="예: 바다, 한강, 9788936434120"
                    className="h-12 border-2 border-black bg-white px-4 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-yellow-50"
                  />

                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="h-12 border-2 border-black bg-yellow-200 px-5 text-sm font-black text-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_0]"
                  >
                    {searchLoading ? '검색 중' : '검색'}
                  </button>
                </form>

                <div className="mt-7 border-t-2 border-black pt-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.16em] text-blue-600">
                        SEARCH RESULT
                      </p>

                      <h3 className="mt-1 text-xl font-black text-gray-950">
                        도서 검색 결과
                      </h3>
                    </div>

                    {hasSearched && !searchLoading && !searchError && (
                      <p className="text-sm font-black text-gray-500">
                        총 {searchResults.length.toLocaleString()}건
                      </p>
                    )}
                  </div>

                  {!hasSearched && !searchLoading && (
                    <MessageBox>
                      희망도서로 신청할 도서를 검색해주세요.
                    </MessageBox>
                  )}

                  {searchLoading && (
                    <LoadingBox message="도서를 검색하고 있습니다." />
                  )}

                  {!searchLoading && searchError && (
                    <ErrorBox message={searchError} />
                  )}

                  {!searchLoading &&
                    hasSearched &&
                    !searchError &&
                    searchResults.length === 0 && (
                      <MessageBox>검색 결과가 없습니다.</MessageBox>
                    )}

                  {!searchLoading &&
                    !searchError &&
                    searchResults.length > 0 && (
                      <div className="grid max-h-180 gap-4 overflow-y-auto pr-1">
                        {searchResults.map((book, index) => (
                          <article
                            key={book.id || book.isbn13 || `book-${index}`}
                            className="grid gap-4 border-2 border-black bg-gray-50 p-4 transition hover:bg-yellow-50 md:grid-cols-[84px_1fr_150px] md:items-center"
                          >
                            <BookCover
                              src={book.thumbnailUrl}
                              title={book.title}
                              size="small"
                            />

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="border border-black bg-white px-2 py-1 text-[11px] font-black text-blue-700">
                                  {book.categoryName || '분류 정보 없음'}
                                </span>

                                {book.publishedDate && (
                                  <span className="text-xs font-bold text-gray-400">
                                    {formatPublishedDate(book.publishedDate)}
                                  </span>
                                )}
                              </div>

                              <h4 className="mt-2 wrap-break-word text-lg font-black leading-7 text-gray-950">
                                {book.title}
                              </h4>

                              <div className="mt-2 grid gap-1 text-sm leading-6 text-gray-600 sm:grid-cols-2">
                                <p className="min-w-0 truncate">
                                  <strong className="text-gray-900">
                                    저자
                                  </strong>{' '}
                                  {book.author}
                                </p>

                                <p className="min-w-0 truncate">
                                  <strong className="text-gray-900">
                                    출판사
                                  </strong>{' '}
                                  {book.publisher}
                                </p>

                                <p className="sm:col-span-2">
                                  <strong className="text-gray-900">
                                    ISBN
                                  </strong>{' '}
                                  {book.isbn13 || '-'}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectBook(book)}
                              disabled={!book.isbn13}
                              className="h-11 border-2 border-black bg-yellow-200 px-4 text-sm font-black text-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none md:w-full"
                            >
                              {book.isbn13 ? '이 도서 선택' : 'ISBN 없음'}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                </div>
              </section>
            )}

            {currentStep === REQUEST_STEPS.LIBRARY && selectedBook && (
              <section className="mt-6">
                <SelectedBookBanner
                  book={selectedBook}
                  onBack={handleBackToBookSearch}
                />

                <form
                  onSubmit={handleSubmit}
                  className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]"
                >
                  <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black sm:p-8">
                    <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-blue-600">
                          2단계
                        </p>

                        <h2 className="mt-1 text-2xl font-black text-gray-950">
                          신청 도서관 선택
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-gray-500">
                          도서관을 누르면 해당 도서의 소장 여부를 확인합니다.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleReloadLibraries}
                        disabled={libraryLoading}
                        className="h-11 shrink-0 border-2 border-black bg-white px-4 text-sm font-black text-gray-800 shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {libraryLoading ? '조회 중' : '다시 조회'}
                      </button>
                    </div>

                    <label
                      htmlFor="dtlRegionSelect"
                      className="mt-5 block font-black text-gray-950"
                    >
                      신청 지역
                    </label>

                    <select
                      id="dtlRegionSelect"
                      value={dtlRegion}
                      onChange={handleRegionChange}
                      disabled={libraryLoading}
                      className="mt-3 h-12 w-full border-2 border-black bg-white px-4 text-sm font-black text-gray-800 outline-none transition focus:bg-yellow-50 disabled:opacity-60"
                    >
                      {REGION_OPTIONS.map((region) => (
                        <option key={region.value} value={region.value}>
                          {region.label}
                        </option>
                      ))}
                    </select>

                    <div className="mt-4 border-2 border-blue-300 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800">
                      신청 가능 여부를 확인한 도서관만 최종 신청 대상으로
                      선택됩니다. 이미 소장한 도서관은 선택할 수 없습니다.
                    </div>

                    <div className="mt-5 max-h-147.5 overflow-y-auto pr-1">
                      <div className="grid gap-3">
                        {libraryLoading && (
                          <LoadingBox message="도서관 목록을 불러오고 있습니다." />
                        )}

                        {!libraryLoading && libraryError && (
                          <ErrorBox message={libraryError} />
                        )}

                        {!libraryLoading &&
                          !libraryError &&
                          libraries.length === 0 && (
                            <MessageBox>조회된 도서관이 없습니다.</MessageBox>
                          )}

                        {!libraryLoading &&
                          libraries.map((library) => {
                            const isChecking =
                              checkingLibraryKey === library.key ||
                              library.status === 'CHECKING'

                            const displayStatus = isChecking
                              ? 'CHECKING'
                              : library.status

                            const statusInfo =
                              LIBRARY_STATUS[displayStatus] ||
                              LIBRARY_STATUS.UNKNOWN

                            const isSelected =
                              selectedLibrary?.key === library.key

                            const isOwned = library.status === 'OWNED'
                            const isDisabled = isOwned || isChecking

                            return (
                              <button
                                key={library.key}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => handleLibrarySelect(library)}
                                className={`w-full border-2 p-4 text-left transition ${
                                  statusInfo.cardClass
                                } ${
                                  isSelected
                                    ? 'shadow-[4px_4px_0_0] shadow-blue-700'
                                    : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="radio"
                                    readOnly
                                    checked={isSelected}
                                    disabled={isDisabled}
                                    className="mt-1 h-4 w-4 accent-blue-600"
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <h3 className="font-black text-gray-950">
                                        {library.libraryName}
                                      </h3>

                                      <span
                                        className={`px-2.5 py-1 text-xs font-black ${statusInfo.badgeClass}`}
                                      >
                                        {statusInfo.label}
                                      </span>
                                    </div>

                                    <div className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                                      <p>
                                        {library.address || '주소 정보 없음'}
                                      </p>

                                      <p>
                                        {library.phone || '전화번호 정보 없음'}
                                      </p>

                                      <p>도서관 코드: {library.libCode}</p>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                      </div>
                    </div>
                  </section>

                  <aside className="h-fit border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black sm:p-8 xl:sticky xl:top-24">
                    <div>
                      <p className="text-sm font-black text-blue-600">
                        최종 신청 정보
                      </p>

                      <h2 className="mt-1 text-2xl font-black text-gray-950">
                        신청서 작성
                      </h2>
                    </div>

                    <SelectedLibrarySummary library={selectedLibrary} />

                    <div className="mt-7">
                      <div className="flex items-center justify-between gap-4">
                        <label
                          htmlFor="reasonInput"
                          className="font-black text-gray-950"
                        >
                          신청 사유
                        </label>

                        <span className="text-xs font-semibold text-gray-400">
                          {reason.length}/500
                        </span>
                      </div>

                      <textarea
                        id="reasonInput"
                        value={reason}
                        onChange={(event) =>
                          setReason(event.target.value.slice(0, 500))
                        }
                        maxLength={500}
                        placeholder="예: 시민들이 관심 가질 만한 도서라 비치되면 좋겠습니다."
                        className="mt-3 min-h-44 w-full resize-y border-2 border-black bg-white p-4 text-sm font-semibold leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-yellow-50"
                      />
                    </div>

                    {submitError && (
                      <div className="mt-5 border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-black text-red-800">
                        {submitError}
                      </div>
                    )}

                    <div className="mt-7 grid gap-3">
                      <button
                        type="submit"
                        disabled={
                          submitLoading ||
                          libraryLoading ||
                          Boolean(checkingLibraryKey) ||
                          !selectedLibrary ||
                          selectedLibrary.status !== 'AVAILABLE'
                        }
                        className="h-12 border-2 border-black bg-yellow-200 px-6 text-sm font-black text-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_0]"
                      >
                        {submitLoading ? '신청 처리 중' : '희망도서 신청하기'}
                      </button>

                      <button
                        type="button"
                        onClick={handleBackToBookSearch}
                        disabled={submitLoading}
                        className="h-11 border-2 border-black bg-white px-5 text-sm font-black text-gray-800 transition hover:bg-gray-100 disabled:opacity-60"
                      >
                        도서 다시 선택
                      </button>
                    </div>
                  </aside>
                </form>
              </section>
            )}
          </section>
        </div>
      </main>

      {noticeModal && (
        <AlertModal
          type={noticeModal.type}
          message={noticeModal.message}
          onClose={closeNoticeModal}
        >
          {(noticeModal.detailTitle ||
            noticeModal.detailLibraryName ||
            noticeModal.applicationId) && (
            <div className="border-2 border-black bg-white/80 p-4 text-sm">
              {noticeModal.detailTitle && (
                <div className="grid grid-cols-[74px_1fr] gap-3">
                  <span className="font-black text-gray-500">도서</span>

                  <span className="wrap-break-word font-black text-gray-950">
                    {noticeModal.detailTitle}
                  </span>
                </div>
              )}

              {noticeModal.detailLibraryName && (
                <div className="mt-3 grid grid-cols-[74px_1fr] gap-3">
                  <span className="font-black text-gray-500">도서관</span>

                  <span className="wrap-break-word font-semibold text-gray-700">
                    {noticeModal.detailLibraryName}
                  </span>
                </div>
              )}

              {noticeModal.applicationId && (
                <div className="mt-3 grid grid-cols-[74px_1fr] gap-3">
                  <span className="font-black text-gray-500">신청번호</span>

                  <span className="font-black text-gray-950">
                    #{noticeModal.applicationId}
                  </span>
                </div>
              )}

              {noticeModal.redirectUrl && (
                <p className="mt-4 border-t border-gray-300 pt-3 text-xs font-semibold leading-5 text-gray-500">
                  확인을 누르면 해당 희망도서 신청 상세페이지로 이동합니다.
                </p>
              )}
            </div>
          )}
        </AlertModal>
      )}
    </BasicLayout>
  )
}

const RequestStepIndicator = ({ currentStep }) => {
  const isLibraryStep = currentStep === REQUEST_STEPS.LIBRARY

  return (
    <div className="grid overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0_0] shadow-black sm:grid-cols-2">
      <div
        className={`flex items-center gap-3 px-5 py-4 ${
          !isLibraryStep ? 'bg-yellow-200' : 'bg-gray-50'
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center border-2 border-black text-sm font-black ${
            !isLibraryStep ? 'bg-white' : 'bg-green-100'
          }`}
        >
          {isLibraryStep ? '✓' : '1'}
        </span>

        <div>
          <p className="text-xs font-bold text-gray-500">STEP 1</p>
          <p className="font-black text-gray-950">도서 검색</p>
        </div>
      </div>

      <div
        className={`flex items-center gap-3 border-t-2 border-black px-5 py-4 sm:border-t-0 sm:border-l-2 ${
          isLibraryStep ? 'bg-yellow-200' : 'bg-gray-50'
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center border-2 border-black text-sm font-black ${
            isLibraryStep ? 'bg-white' : 'bg-gray-200 text-gray-500'
          }`}
        >
          2
        </span>

        <div>
          <p className="text-xs font-bold text-gray-500">STEP 2</p>
          <p className="font-black text-gray-950">도서관 선택 및 신청</p>
        </div>
      </div>
    </div>
  )
}

const SelectedBookBanner = ({ book, onBack }) => (
  <article className="border-2 border-black bg-white p-5 shadow-[5px_5px_0_0] shadow-black sm:p-6">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <BookCover src={book.thumbnailUrl} title={book.title} size="small" />

      <div className="min-w-0 flex-1">
        <span className="inline-flex border-2 border-blue-300 bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">
          선택한 도서
        </span>

        <h2 className="mt-2 wrap-break-word text-xl font-black text-gray-950 sm:text-2xl">
          {book.title}
        </h2>

        <p className="mt-2 text-sm font-semibold text-gray-600">
          {book.author} · {book.publisher}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-gray-500">
          <span>ISBN {book.isbn13 || '-'}</span>
          <span>{formatPublishedDate(book.publishedDate)}</span>
          <span>{book.categoryName}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="h-11 shrink-0 border-2 border-black bg-white px-5 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
      >
        도서 다시 선택
      </button>
    </div>
  </article>
)

const SelectedLibrarySummary = ({ library }) => {
  if (!library) {
    return (
      <div className="mt-6 border-2 border-dashed border-black bg-gray-50 p-5">
        <p className="text-sm font-black text-gray-800">
          신청 도서관이 아직 선택되지 않았습니다.
        </p>

        <p className="mt-2 text-xs leading-5 text-gray-500">
          왼쪽 목록에서 도서관을 선택하면 소장 여부 확인 후 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 border-2 border-blue-500 bg-blue-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-blue-600">선택한 도서관</p>

          <p className="mt-1 wrap-break-word font-black text-gray-950">
            {library.libraryName}
          </p>
        </div>

        <span className="shrink-0 border border-green-400 bg-green-100 px-2.5 py-1 text-xs font-black text-green-800">
          신청 가능
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs leading-5 text-gray-600">
        <p>{library.address || '주소 정보 없음'}</p>
        <p>{library.phone || '전화번호 정보 없음'}</p>
        <p>도서관 코드: {library.libCode}</p>
      </div>
    </div>
  )
}

const SummaryRow = ({ label, value }) => {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 py-3">
      <dt className="font-black text-gray-950">{label}</dt>
      <dd className="wrap-break-word text-gray-600">{value || '-'}</dd>
    </div>
  )
}

const BookCover = ({ src, title, size }) => {
  const [imageError, setImageError] = useState(false)

  const sizeClass =
    size === 'large' ? 'h-[260px] w-[180px]' : 'h-[120px] w-[84px]'

  if (!src || imageError) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border-2 border-black bg-gray-100 text-center text-xs font-black text-gray-500 ${sizeClass}`}
      >
        표지 없음
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={`${title} 표지`}
      onError={() => setImageError(true)}
      className={`shrink-0 border-2 border-black bg-gray-100 object-cover ${sizeClass}`}
    />
  )
}

const MessageBox = ({ children }) => {
  return (
    <div className="border-2 border-black bg-gray-50 px-5 py-8 text-center text-sm font-black text-gray-600">
      {children}
    </div>
  )
}

const LoadingBox = ({ message }) => {
  return (
    <div className="flex items-center justify-center gap-3 border-2 border-black bg-gray-50 px-5 py-8">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />

      <p className="text-sm font-bold text-gray-600">{message}</p>
    </div>
  )
}

const ErrorBox = ({ message }) => {
  return (
    <div className="border-2 border-red-500 bg-red-50 px-5 py-5 text-center text-sm font-black text-red-800">
      {message}
    </div>
  )
}

export default BookRequestPage
