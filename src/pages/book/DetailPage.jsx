import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import { getBookByIsbn } from '../../api/bookApi'
import { getAdminMe } from '../../api/adminApi'
import { getAdminBookAiPopularity } from '../../api/bookAiApi'
import useMemberStore from '../../store/useMemberStore'
import {
  checkBookExist,
  getBookPurchaseEvidence,
  getData4LibraryBookClassification,
  getExternalBookDetail,
  searchExternalBooks,
  searchLibrariesByBook,
} from '../../api/externalBookApi'
import {
  createBookReview,
  getBookReviews,
  getBookUserState,
  likeBook,
  unlikeBook,
} from '../../api/memberActivityApi'
import { recordBookView } from '../../api/bookHistoryApi'

const API_SERVER_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'
).replace(/\/api\/?$/, '')

const ACQUISITION_CART_STORAGE_KEY = 'bookcast_acquisition_cart'
const MONTHLY_ACQUISITION_BUDGET = 1_000_000

const getCurrentMonthKey = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

const readCurrentMonthAcquisitionCart = () => {
  const currentMonthKey = getCurrentMonthKey()

  try {
    const savedValue = localStorage.getItem(ACQUISITION_CART_STORAGE_KEY)

    if (!savedValue) {
      return {
        monthKey: currentMonthKey,
        items: [],
      }
    }

    const parsedValue = JSON.parse(savedValue)

    // 기존 배열 저장 방식은 현재 월 목록으로 자동 이전합니다.
    if (Array.isArray(parsedValue)) {
      const migratedCart = {
        monthKey: currentMonthKey,
        items: parsedValue,
      }

      localStorage.setItem(
        ACQUISITION_CART_STORAGE_KEY,
        JSON.stringify(migratedCart),
      )

      return migratedCart
    }

    const savedMonthKey = String(parsedValue?.monthKey ?? '').trim()
    const savedItems = Array.isArray(parsedValue?.items)
      ? parsedValue.items
      : []

    // 지난달 목록은 이달 목록으로 이월하지 않습니다.
    if (savedMonthKey !== currentMonthKey) {
      const resetCart = {
        monthKey: currentMonthKey,
        items: [],
      }

      localStorage.setItem(
        ACQUISITION_CART_STORAGE_KEY,
        JSON.stringify(resetCart),
      )

      return resetCart
    }

    return {
      monthKey: currentMonthKey,
      items: savedItems,
    }
  } catch (error) {
    console.error('[BookDetailPage] 입고 목록 월별 데이터 조회 실패:', error)

    const resetCart = {
      monthKey: currentMonthKey,
      items: [],
    }

    try {
      localStorage.setItem(
        ACQUISITION_CART_STORAGE_KEY,
        JSON.stringify(resetCart),
      )
    } catch (saveError) {
      console.error('[BookDetailPage] 입고 목록 초기화 실패:', saveError)
    }

    return resetCart
  }
}

const saveCurrentMonthAcquisitionCart = (monthKey, items) => {
  const payload = {
    monthKey,
    items,
  }

  localStorage.setItem(ACQUISITION_CART_STORAGE_KEY, JSON.stringify(payload))

  window.dispatchEvent(
    new CustomEvent('bookcast-acquisition-cart-updated', {
      detail: payload,
    }),
  )
}

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

const resolveKdcCategory = ({ classNo, className, categoryName }) => {
  const explicitCategory = String(categoryName ?? '').trim()

  if (explicitCategory && explicitCategory !== '미분류') {
    return explicitCategory
  }

  const topClassName = String(className ?? '')
    .split('>')[0]
    .trim()

  if (
    topClassName &&
    topClassName !== '분류 정보 없음' &&
    topClassName !== '분류 정보 확인 중' &&
    topClassName !== '미분류'
  ) {
    return topClassName
  }

  const normalizedClassNo = String(classNo ?? '')
    .replace(/[^0-9.]/g, '')
    .trim()

  return KDC_CATEGORY_BY_FIRST_DIGIT[normalizedClassNo.charAt(0)] || '미분류'
}

const isData4LibraryClassification = (raw) => {
  const source = String(
    raw?.classificationSource ??
      raw?.classification_source ??
      raw?.source ??
      '',
  )
    .trim()
    .toUpperCase()

  return source === 'DATA4LIBRARY'
}

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

const normalizeBook = (raw, fallbackIsbn = '') => {
  if (!raw) {
    return {
      bookId: null,
      title: '도서 제목 없음',
      author: '저자 정보 없음',
      publisher: '출판사 정보 없음',
      publicationYear: '출판년도 정보 없음',
      publishedDate: null,
      isbn13: fallbackIsbn,
      className: '분류 정보 확인 중',
      classNo: '분류번호 확인 중',
      categoryName: '미분류',
      classificationSource: '',
      imageUrl: '',
      detailUrl: '',
      loanCount: null,
      totalCount: null,
      availableCount: null,
      viewCount: null,
      averageRating: null,
      source: '',
      priceSales: null,
      priceStandard: null,
      customerReviewRank: null,
      salesPoint: null,
      description: '',
    }
  }

  const publishedDate = raw.publishedDate || raw.published_date || null

  const publishedYearFromDate = publishedDate
    ? String(publishedDate).slice(0, 4)
    : ''

  const hasData4LibraryClassification = isData4LibraryClassification(raw)

  const data4LibraryClassName =
    raw.className || raw.class_nm || raw.classNm || raw.classificationName || ''

  const data4LibraryClassNo =
    raw.classNo || raw.class_no || raw.classificationNo || ''

  return {
    ...raw,
    bookId: raw.bookId ?? raw.book_id ?? null,
    title: raw.title || raw.bookname || '도서 제목 없음',
    author: raw.author || raw.authors || '저자 정보 없음',
    publisher: raw.publisher || '출판사 정보 없음',
    publicationYear:
      raw.publicationYear ||
      raw.publication_year ||
      publishedYearFromDate ||
      '출판년도 정보 없음',
    publishedDate,
    isbn13: raw.isbn13 || raw.isbn || fallbackIsbn,

    className: hasData4LibraryClassification
      ? data4LibraryClassName || '분류 정보 없음'
      : '분류 정보 확인 중',

    classNo: hasData4LibraryClassification
      ? data4LibraryClassNo || '분류번호 정보 없음'
      : '분류번호 확인 중',

    categoryName: hasData4LibraryClassification
      ? resolveKdcCategory({
          classNo: data4LibraryClassNo,
          className: data4LibraryClassName,
          categoryName: raw.categoryName || raw.kdcCategoryName,
        })
      : '미분류',

    classificationSource: hasData4LibraryClassification ? 'DATA4LIBRARY' : '',

    imageUrl:
      raw.imageUrl ||
      raw.bookImageUrl ||
      raw.bookImageURL ||
      raw.thumbnailUrl ||
      raw.thumbnail_url ||
      '',

    detailUrl:
      raw.detailUrl || raw.bookDetailUrl || raw.bookDtlUrl || raw.link || '',

    loanCount: toNullableNumber(
      raw.loanCount ?? raw.loan_count ?? raw.totalLoanCount,
    ),

    totalCount: toNullableNumber(raw.totalCount ?? raw.total_count),

    availableCount: toNullableNumber(raw.availableCount ?? raw.available_count),

    viewCount: toNullableNumber(raw.viewCount ?? raw.view_count),

    averageRating: toNullableNumber(raw.averageRating ?? raw.average_rating),

    source: raw.source || raw.provider || '',

    priceSales: toNullableNumber(
      raw.priceSales ?? raw.price_sales ?? raw.salePrice ?? raw.sale_price,
    ),

    priceStandard: toNullableNumber(
      raw.priceStandard ??
        raw.price_standard ??
        raw.standardPrice ??
        raw.standard_price ??
        raw.price,
    ),

    customerReviewRank: toNullableNumber(
      raw.customerReviewRank ??
        raw.customer_review_rank ??
        raw.customerreviewrank,
    ),

    salesPoint: toNullableNumber(raw.salesPoint ?? raw.sales_point),

    description: raw.description || '',
  }
}

const mergeBook = (prev, next, fallbackIsbn = '') => {
  const prevBook = normalizeBook(prev, fallbackIsbn)

  const nextBook = normalizeBook(next, fallbackIsbn)

  const prevHasData4Classification =
    prevBook.classificationSource === 'DATA4LIBRARY'

  const nextHasData4Classification =
    nextBook.classificationSource === 'DATA4LIBRARY'

  const classificationBook = nextHasData4Classification
    ? nextBook
    : prevHasData4Classification
      ? prevBook
      : null

  return {
    ...prevBook,
    ...nextBook,

    bookId: nextBook.bookId ?? prevBook.bookId ?? null,

    title:
      nextBook.title !== '도서 제목 없음' ? nextBook.title : prevBook.title,

    author:
      nextBook.author !== '저자 정보 없음' ? nextBook.author : prevBook.author,

    publisher:
      nextBook.publisher !== '출판사 정보 없음'
        ? nextBook.publisher
        : prevBook.publisher,

    publicationYear:
      nextBook.publicationYear !== '출판년도 정보 없음'
        ? nextBook.publicationYear
        : prevBook.publicationYear,

    publishedDate: nextBook.publishedDate || prevBook.publishedDate || null,

    isbn13: nextBook.isbn13 || prevBook.isbn13 || fallbackIsbn,

    className: classificationBook?.className || '분류 정보 확인 중',

    classNo: classificationBook?.classNo || '분류번호 확인 중',

    categoryName: classificationBook?.categoryName || '미분류',

    classificationSource: classificationBook?.classificationSource || '',

    imageUrl: nextBook.imageUrl || prevBook.imageUrl,

    detailUrl: nextBook.detailUrl || prevBook.detailUrl,

    loanCount: nextBook.loanCount ?? prevBook.loanCount ?? null,

    totalCount: nextBook.totalCount ?? prevBook.totalCount ?? null,

    availableCount: nextBook.availableCount ?? prevBook.availableCount ?? null,

    viewCount: nextBook.viewCount ?? prevBook.viewCount ?? null,

    averageRating: nextBook.averageRating ?? prevBook.averageRating ?? null,

    source: nextBook.source || prevBook.source || '',

    priceSales: nextBook.priceSales ?? prevBook.priceSales ?? null,

    priceStandard: nextBook.priceStandard ?? prevBook.priceStandard ?? null,

    customerReviewRank:
      nextBook.customerReviewRank ?? prevBook.customerReviewRank ?? null,

    salesPoint: nextBook.salesPoint ?? prevBook.salesPoint ?? null,

    description: nextBook.description || prevBook.description || '',
  }
}

const DetailPage = () => {
  const { isbn13 } = useParams()
  const location = useLocation()

  const { member, memberInfo, user } = useMemberStore()
  const loginUser = member || memberInfo || user

  const userId =
    loginUser?.userId ??
    loginUser?.user_id ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const normalizedRole = String(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority ?? 'USER',
  )
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  const isAdmin =
    normalizedRole === 'ADMIN' || normalizedRole === 'MASTER_ADMIN'

  const isLibraryAdmin = normalizedRole === 'ADMIN'
  const isMasterAdmin = normalizedRole === 'MASTER_ADMIN'

  const managedLibraryCode = String(
    loginUser?.managedLibraryCode ?? loginUser?.managed_library_code ?? '',
  ).trim()

  const managedLibraryName = String(
    loginUser?.managedLibraryName ?? loginUser?.managed_library_name ?? '',
  ).trim()

  const [book, setBook] = useState(() =>
    location.state?.book ? normalizeBook(location.state.book, isbn13) : null,
  )

  const [libraries, setLibraries] = useState([])
  const [libraryStatusMap, setLibraryStatusMap] = useState({})
  const [selectedLibrary, setSelectedLibrary] = useState(null)
  const [checkingLibraryKey, setCheckingLibraryKey] = useState('')
  const [libraryLoading, setLibraryLoading] = useState(false)

  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [likeSubmitting, setLikeSubmitting] = useState(false)

  const [reviews, setReviews] = useState([])
  const [reviewContent, setReviewContent] = useState('')
  const [reviewScore, setReviewScore] = useState(5)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  const [recommendBooks, setRecommendBooks] = useState([])

  const [loanTrend, setLoanTrend] = useState([])
  const [popularGroups, setPopularGroups] = useState([])
  const [usageKeywords, setUsageKeywords] = useState([])
  const [totalLoanCount, setTotalLoanCount] = useState(null)
  const [adminStatsLoading, setAdminStatsLoading] = useState(false)
  const [adminStatsError, setAdminStatsError] = useState('')

  /*
   * 로그인 스토어에는 담당 도서관 필드가 누락될 수 있으므로
   * /api/admin/me에서 관리자 최신 정보를 별도로 조회합니다.
   */
  const [adminInfo, setAdminInfo] = useState(null)
  const [adminInfoLoading, setAdminInfoLoading] = useState(false)
  const [adminInfoError, setAdminInfoError] = useState('')

  const resolvedManagedLibraryCode = String(
    adminInfo?.managedLibraryCode ??
      adminInfo?.managed_library_code ??
      managedLibraryCode ??
      '',
  ).trim()

  const resolvedManagedLibraryName = String(
    adminInfo?.managedLibraryName ??
      adminInfo?.managed_library_name ??
      managedLibraryName ??
      '',
  ).trim()

  const [adminHoldingStatus, setAdminHoldingStatus] = useState(null)
  const [adminHoldingLoading, setAdminHoldingLoading] = useState(false)
  const [adminHoldingError, setAdminHoldingError] = useState('')

  const [purchaseEvidence, setPurchaseEvidence] = useState(null)
  const [purchaseEvidenceLoading, setPurchaseEvidenceLoading] = useState(false)
  const [purchaseEvidenceError, setPurchaseEvidenceError] = useState('')

  /*
   * 관리자 전용 알라딘 가격·별점 정보입니다.
   * 일반 사용자 화면에는 표시하지 않습니다.
   */
  const [aladinInfo, setAladinInfo] = useState(null)
  const [aladinInfoLoading, setAladinInfoLoading] = useState(false)
  const [aladinInfoError, setAladinInfoError] = useState('')

  const [adminAiPopularity, setAdminAiPopularity] = useState(null)
  const [adminAiPopularityLoading, setAdminAiPopularityLoading] =
    useState(false)
  const [adminAiPopularityError, setAdminAiPopularityError] = useState('')

  const aiPopularityRequestKeyRef = useRef('')

  const displayBook = useMemo(() => {
    const normalized = normalizeBook(book, isbn13)

    return {
      ...normalized,
      description:
        normalized.description ||
        '아직 등록된 소개글이 없습니다. 도서 정보와 리뷰를 참고해보세요.',
    }
  }, [book, isbn13])

  useEffect(() => {
    if (!userId || !isbn13) {
      return undefined
    }

    if (!displayBook.title || displayBook.title === '도서 제목 없음') {
      return undefined
    }

    let cancelled = false

    const timeoutId = window.setTimeout(async () => {
      try {
        if (cancelled) {
          return
        }

        await recordBookView({
          userId,
          isbn: isbn13,
          title: displayBook.title,
          author: displayBook.author,
          publisher: displayBook.publisher,
          thumbnailUrl: displayBook.imageUrl,
          limit: 5,
        })
      } catch (error) {
        console.warn('[BookDetailPage] 최근 본 도서 기록 실패:', error)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    displayBook.author,
    displayBook.imageUrl,
    displayBook.publisher,
    displayBook.title,
    isbn13,
    userId,
  ])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLibraries([])
    setLibraryStatusMap({})
    setSelectedLibrary(null)
    setCheckingLibraryKey('')
    setRecommendBooks([])
    setAdminHoldingStatus(null)
    setAdminHoldingError('')
    setPurchaseEvidence(null)
    setPurchaseEvidenceError('')
    setAladinInfo(null)
    setAladinInfoError('')
    setAdminInfoError('')
    setAdminAiPopularity(null)
    setAdminAiPopularityError('')
    aiPopularityRequestKeyRef.current = ''

    // eslint-disable-next-line react-hooks/immutability
    fetchBookDetail()
    // eslint-disable-next-line react-hooks/immutability
    fetchExternalDescription()

    // eslint-disable-next-line react-hooks/immutability
    fetchData4LibraryClassification()

    if (isAdmin) {
      // eslint-disable-next-line react-hooks/immutability
      fetchAdminAladinInfo()
      // eslint-disable-next-line react-hooks/immutability
      fetchAdminStats()
    }

    if (isLibraryAdmin) {
      // eslint-disable-next-line react-hooks/immutability
      fetchAdminInfo()
      // eslint-disable-next-line react-hooks/immutability
      fetchPurchaseEvidence()
    } else if (!isMasterAdmin) {
      // 일반 사용자용 기능
      // eslint-disable-next-line react-hooks/immutability
      fetchLibraries()
      // eslint-disable-next-line react-hooks/immutability
      fetchUserBookData()
      // eslint-disable-next-line react-hooks/immutability
      fetchReviews()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13, isAdmin, isLibraryAdmin, isMasterAdmin, userId])

  useEffect(() => {
    if (!isLibraryAdmin || !resolvedManagedLibraryCode) {
      return
    }

    // eslint-disable-next-line react-hooks/immutability
    fetchAdminHoldingStatus(resolvedManagedLibraryCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn13, isLibraryAdmin, resolvedManagedLibraryCode])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    fetchRecommendBooks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBook.className, displayBook.classificationSource, isbn13])

  useEffect(() => {
    if (
      !isAdmin ||
      !userId ||
      !isbn13 ||
      !displayBook.title ||
      displayBook.title === '도서 제목 없음'
    ) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      // eslint-disable-next-line react-hooks/immutability
      fetchAdminAiPopularity()
    }, 500)

    return () => {
      window.clearTimeout(timeoutId)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayBook.author,
    displayBook.categoryName,
    displayBook.classNo,
    displayBook.publisher,
    displayBook.title,
    isbn13,
    isAdmin,
    userId,
  ])

  const fetchBookDetail = async () => {
    try {
      const data = await getBookByIsbn(isbn13)

      if (!data) {
        return
      }

      setBook((prev) => mergeBook(prev, data, isbn13))
    } catch (error) {
      if (error?.response?.status === 404) {
        return
      }

      console.warn('[BookDetailPage] 자체 DB 도서 상세 조회 실패:', error)
    }
  }

  const fetchExternalDescription = async () => {
    try {
      const data = await getExternalBookDetail({
        isbn13,
        provider: 'ALL',
      })

      if (!data) {
        return
      }

      setBook((previousBook) => mergeBook(previousBook, data, isbn13))
    } catch (error) {
      console.warn('[BookDetailPage] 외부 도서 상세 조회 실패:', error)
    }
  }

  const fetchData4LibraryClassification = async () => {
    try {
      const data = await getData4LibraryBookClassification(isbn13)

      if (!data) {
        return
      }

      setBook((previousBook) =>
        mergeBook(
          previousBook,
          {
            isbn13: data.isbn13,
            title: data.title,
            classNo: data.classNo,
            className: data.className,
            categoryName: data.categoryName,
            classificationSource: data.source || 'DATA4LIBRARY',
            loanCount: data.loanCount,
          },
          isbn13,
        ),
      )
    } catch (error) {
      console.warn('[BookDetailPage] 정보나루 분류정보 조회 실패:', error)
    }
  }

  async function fetchLibraries() {
    try {
      setLibraryLoading(true)

      const data = await searchLibrariesByBook({
        isbn: isbn13,
        pageNo: 1,
        pageSize: 10,
      })

      const list = Array.isArray(data) ? data : []

      setLibraries(list)
    } catch (error) {
      console.error('[BookDetailPage] 소장 도서관 조회 실패:', error)
      setLibraries([])
    } finally {
      setLibraryLoading(false)
    }
  }

  const handleCheckLibraryStatus = async (library) => {
    if (!library?.libCode) {
      alert('도서관 코드가 없습니다.')
      return
    }

    const cleanIsbn = String(isbn13).replaceAll('-', '').trim()
    const key = `${library.libCode}_${cleanIsbn}`

    if (checkingLibraryKey === key) {
      return
    }

    if (libraryStatusMap[key]) {
      setSelectedLibrary(library)
      return
    }

    try {
      setCheckingLibraryKey(key)
      setSelectedLibrary(library)

      const status = await checkBookExist({
        libCode: library.libCode,
        isbn13: cleanIsbn,
      })

      setLibraryStatusMap((prev) => ({
        ...prev,
        [key]: status,
      }))
    } catch (error) {
      console.error('[BookDetailPage] 대출 가능 여부 조회 실패:', error)
      alert('대출 가능 여부 조회에 실패했습니다.')
    } finally {
      setCheckingLibraryKey('')
    }
  }

  const fetchUserBookData = async () => {
    try {
      const data = await getBookUserState({
        userId,
        isbn: isbn13,
      })

      setLiked(Boolean(data?.liked))
      setLikeCount(Number(data?.likeCount ?? 0))
    } catch (error) {
      console.error('[BookDetailPage] 사용자 도서 상태 조회 실패:', error)

      setLiked(false)
      setLikeCount(0)
    }
  }

  const fetchReviews = async () => {
    try {
      const data = await getBookReviews(isbn13)

      setReviews(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('[BookDetailPage] 리뷰 목록 조회 실패:', error)
      setReviews([])
    }
  }

  const fetchRecommendBooks = async () => {
    try {
      const className = displayBook.className

      if (
        displayBook.classificationSource !== 'DATA4LIBRARY' ||
        !className ||
        className === '분류 정보 없음'
      ) {
        setRecommendBooks([])
        return
      }

      const keyword = className
        .replaceAll('>', ' ')
        .replaceAll('[', '')
        .replaceAll(']', '')
        .split(' ')
        .filter(Boolean)
        .slice(-1)[0]

      const data = await searchExternalBooks({
        keyword,
        title: '',
        author: '',
        isbn13: '',
        publisher: '',
        pageNo: 1,
        pageSize: 5,
      })

      setRecommendBooks(
        Array.isArray(data)
          ? data.filter((item) => item.isbn13 !== isbn13).slice(0, 5)
          : [],
      )
    } catch (error) {
      console.warn('[BookDetailPage] 추천 도서 조회 실패:', error)
      setRecommendBooks([])
    }
  }

  const fetchAdminAiPopularity = async (force = false) => {
    if (!isAdmin || !userId) {
      return
    }

    const cleanIsbn = String(isbn13 || '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()

    if (!cleanIsbn) {
      setAdminAiPopularity(null)
      setAdminAiPopularityError('AI 인기도 계산에 필요한 ISBN이 없습니다.')
      return
    }

    const requestKey = [
      cleanIsbn,
      displayBook.title,
      displayBook.author,
      displayBook.publisher,
      displayBook.classNo,
      displayBook.categoryName,
    ].join('|')

    if (!force && aiPopularityRequestKeyRef.current === requestKey) {
      return
    }

    aiPopularityRequestKeyRef.current = requestKey
    setAdminAiPopularityLoading(true)
    setAdminAiPopularityError('')

    try {
      const data = await getAdminBookAiPopularity({
        requesterUserId: userId,
        isbn13: cleanIsbn,
        title: displayBook.title,
        author: displayBook.author,
        publisher: displayBook.publisher,
        classNo: displayBook.classNo,
        categoryName: displayBook.categoryName,
        force,
      })

      setAdminAiPopularity(data || null)
    } catch (error) {
      console.error('[BookDetailPage] 관리자 AI 인기도 조회 실패:', error)

      const responseData = error?.response?.data

      setAdminAiPopularity(null)
      setAdminAiPopularityError(
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message ||
            responseData?.detail ||
            responseData?.error) ||
          error?.message ||
          'AI 도서 인기도를 계산하지 못했습니다.',
      )

      aiPopularityRequestKeyRef.current = ''
    } finally {
      setAdminAiPopularityLoading(false)
    }
  }

  const fetchAdminAladinInfo = async () => {
    if (!isAdmin) {
      return
    }

    setAladinInfoLoading(true)
    setAladinInfoError('')

    try {
      const data = await getExternalBookDetail({
        isbn13,
        provider: 'ALADIN',
      })

      if (!data) {
        setAladinInfo(null)
        setAladinInfoError('알라딘에서 가격 및 별점 정보를 찾을 수 없습니다.')
        return
      }

      const normalizedInfo = {
        priceStandard: toNullableNumber(
          data.priceStandard ?? data.pricestandard,
        ),

        priceSales: toNullableNumber(data.priceSales ?? data.pricesales),

        customerReviewRank: toNullableNumber(
          data.customerReviewRank ?? data.customerreviewrank,
        ),

        salesPoint: toNullableNumber(data.salesPoint ?? data.salespoint),

        detailUrl: data.detailUrl || data.link || '',

        source: 'ALADIN',
      }

      setAladinInfo(normalizedInfo)

      setBook((previousBook) => mergeBook(previousBook, normalizedInfo, isbn13))
    } catch (error) {
      console.error(
        '[BookDetailPage] 관리자용 알라딘 가격/별점 조회 실패:',
        error,
      )

      const responseData = error?.response?.data

      setAladinInfo(null)
      setAladinInfoError(
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message ||
            responseData?.detail ||
            responseData?.error) ||
          error?.message ||
          '알라딘 가격 및 별점 정보를 불러오지 못했습니다.',
      )
    } finally {
      setAladinInfoLoading(false)
    }
  }

  const fetchAdminInfo = async () => {
    if (!isLibraryAdmin || !userId) {
      return
    }

    setAdminInfoLoading(true)
    setAdminInfoError('')

    try {
      const data = await getAdminMe(userId)

      if (!data) {
        setAdminInfo(null)
        setAdminInfoError('관리자 기본정보 응답이 비어 있습니다.')
        return
      }

      setAdminInfo(data)

      const libraryCode = String(
        data?.managedLibraryCode ?? data?.managed_library_code ?? '',
      ).trim()

      if (!libraryCode) {
        setAdminInfoError(
          '일반 관리자 계정에 담당 도서관 코드가 지정되어 있지 않습니다.',
        )
      }
    } catch (error) {
      console.error('[BookDetailPage] 관리자 기본정보 조회 실패:', error)

      const responseData = error?.response?.data

      setAdminInfo(null)
      setAdminInfoError(
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message ||
            responseData?.detail ||
            responseData?.error) ||
          error?.message ||
          '관리자 기본정보를 불러오지 못했습니다.',
      )
    } finally {
      setAdminInfoLoading(false)
    }
  }

  const fetchAdminHoldingStatus = async (
    libraryCode = resolvedManagedLibraryCode,
  ) => {
    const cleanIsbn = String(isbn13 || '')
      .replaceAll('-', '')
      .trim()

    const normalizedLibraryCode = String(libraryCode || '').trim()

    if (!normalizedLibraryCode) {
      setAdminHoldingStatus(null)
      setAdminHoldingError(
        '로그인 정보에서 소속 도서관 코드를 확인할 수 없습니다. 다시 로그인해주세요.',
      )
      return
    }

    if (!cleanIsbn) {
      setAdminHoldingStatus(null)
      setAdminHoldingError('ISBN을 확인할 수 없습니다.')
      return
    }

    setAdminHoldingLoading(true)
    setAdminHoldingError('')

    try {
      const data = await checkBookExist({
        libCode: normalizedLibraryCode,
        isbn13: cleanIsbn,
      })

      const isOwned =
        data?.isOwned === true ||
        String(data?.hasBook || '')
          .trim()
          .toUpperCase() === 'Y'

      setAdminHoldingStatus({
        ...data,
        isOwned,
      })
    } catch (error) {
      console.error(
        '[BookDetailPage] 관리자 소속 도서관 소장 조회 실패:',
        error,
      )

      const responseData = error?.response?.data

      setAdminHoldingStatus(null)
      setAdminHoldingError(
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message ||
            responseData?.detail ||
            responseData?.error) ||
          error?.message ||
          '소속 도서관의 소장 여부를 확인하지 못했습니다.',
      )
    } finally {
      setAdminHoldingLoading(false)
    }
  }

  const fetchPurchaseEvidence = async () => {
    const cleanIsbn = String(isbn13 || '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()

    if (!userId) {
      setPurchaseEvidence(null)
      setPurchaseEvidenceError(
        '구매 판단 근거 조회에 필요한 관리자 번호가 없습니다. 다시 로그인해주세요.',
      )
      return
    }

    if (!cleanIsbn) {
      setPurchaseEvidence(null)
      setPurchaseEvidenceError('ISBN을 확인할 수 없습니다.')
      return
    }

    setPurchaseEvidenceLoading(true)
    setPurchaseEvidenceError('')

    try {
      const data = await getBookPurchaseEvidence({
        isbn13: cleanIsbn,
        requesterUserId: userId,
      })

      setPurchaseEvidence(data || null)
    } catch (error) {
      console.error('[BookDetailPage] 구매 판단 근거 조회 실패:', error)

      const responseData = error?.response?.data

      setPurchaseEvidence(null)
      setPurchaseEvidenceError(
        (typeof responseData === 'string'
          ? responseData
          : responseData?.message ||
            responseData?.detail ||
            responseData?.error) ||
          error?.message ||
          '구매 판단 근거를 불러오지 못했습니다.',
      )
    } finally {
      setPurchaseEvidenceLoading(false)
    }
  }

  const fetchAdminStats = async () => {
    setAdminStatsLoading(true)
    setAdminStatsError('')

    try {
      const response = await fetch(
        `${API_SERVER_URL}/api/admin/books/${isbn13}/usage-analysis`,
      )

      if (!response.ok) {
        let message = '정보나루 도서 이용분석 정보를 불러오지 못했습니다.'

        try {
          const errorData = await response.json()

          message =
            errorData?.message ||
            errorData?.detail ||
            errorData?.error ||
            message
        } catch {
          // JSON 오류 응답이 아니면 기본 메시지를 사용
        }

        throw new Error(message)
      }

      const data = await response.json()

      const nextLoanTrend = Array.isArray(data?.loanTrend) ? data.loanTrend : []

      const nextPopularGroups = Array.isArray(data?.popularGroups)
        ? data.popularGroups
        : []

      const nextKeywords = Array.isArray(data?.keywords) ? data.keywords : []

      const nextTotalLoanCount = toNullableNumber(data?.totalLoanCount)

      setLoanTrend(nextLoanTrend)
      setPopularGroups(nextPopularGroups)
      setUsageKeywords(nextKeywords)
      setTotalLoanCount(nextTotalLoanCount)

      if (nextTotalLoanCount !== null) {
        setBook((previousBook) =>
          mergeBook(
            previousBook,
            {
              loanCount: nextTotalLoanCount,
            },
            isbn13,
          ),
        )
      }
    } catch (error) {
      console.error('[BookDetailPage] 정보나루 이용분석 조회 실패:', error)

      setLoanTrend([])
      setPopularGroups([])
      setUsageKeywords([])
      setTotalLoanCount(null)
      setAdminStatsError(
        error?.message || '정보나루 도서 이용분석 정보를 불러오지 못했습니다.',
      )
    } finally {
      setAdminStatsLoading(false)
    }
  }

  const handleToggleLike = async () => {
    if (!userId) {
      alert('로그인 후 좋아요를 사용할 수 있습니다.')
      return
    }

    if (likeSubmitting) {
      return
    }

    setLikeSubmitting(true)

    try {
      const data = liked
        ? await unlikeBook({
            userId,
            isbn: isbn13,
          })
        : await likeBook({
            userId,
            isbn: isbn13,
            title: displayBook.title,
            author: displayBook.author,
            publisher: displayBook.publisher,
            thumbnailUrl: displayBook.imageUrl,
          })

      setLiked(Boolean(data?.liked))
      setLikeCount(Number(data?.likeCount ?? 0))
    } catch (error) {
      console.error('[BookDetailPage] 좋아요 처리 실패:', error)

      const data = error?.response?.data

      alert(
        (typeof data === 'string'
          ? data
          : data?.message || data?.detail || data?.error) ||
          '좋아요 처리에 실패했습니다.',
      )
    } finally {
      setLikeSubmitting(false)
    }
  }

  const handleSubmitReview = async (event) => {
    event.preventDefault()

    if (!userId) {
      alert('로그인 후 리뷰를 작성할 수 있습니다.')
      return
    }

    if (!reviewContent.trim()) {
      alert('리뷰 내용을 입력해주세요.')
      return
    }

    if (reviewSubmitting) {
      return
    }

    setReviewSubmitting(true)

    try {
      const savedReview = await createBookReview({
        userId,
        isbn: isbn13,
        score: Number(reviewScore),
        content: reviewContent.trim(),
        title: displayBook.title,
        author: displayBook.author,
        publisher: displayBook.publisher,
        thumbnailUrl: displayBook.imageUrl,
      })

      setReviews((prev) => [savedReview, ...prev])
      setReviewContent('')
      setReviewScore(5)
    } catch (error) {
      console.error('[BookDetailPage] 리뷰 등록 실패:', error)

      const data = error?.response?.data

      alert(
        (typeof data === 'string'
          ? data
          : data?.message || data?.detail || data?.error) ||
          '리뷰 등록에 실패했습니다.',
      )
    } finally {
      setReviewSubmitting(false)
    }
  }

  return (
    <BasicLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Link
              to="/books"
              className="border-2 border-black bg-white px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              ← 도서 검색으로
            </Link>
          </div>

          {isLibraryAdmin ? (
            <LibraryAdminBookDetail
              book={displayBook}
              libraryCode={resolvedManagedLibraryCode}
              libraryName={resolvedManagedLibraryName}
              adminInfoLoading={adminInfoLoading}
              adminInfoError={adminInfoError}
              onRetryAdminInfo={fetchAdminInfo}
              holdingStatus={adminHoldingStatus}
              loading={adminHoldingLoading}
              errorMessage={adminHoldingError}
              onRetry={() =>
                fetchAdminHoldingStatus(resolvedManagedLibraryCode)
              }
              purchaseEvidence={purchaseEvidence}
              purchaseEvidenceLoading={purchaseEvidenceLoading}
              purchaseEvidenceError={purchaseEvidenceError}
              onRetryPurchaseEvidence={fetchPurchaseEvidence}
              aladinInfo={aladinInfo}
              aladinInfoLoading={aladinInfoLoading}
              aladinInfoError={aladinInfoError}
              onRetryAladin={fetchAdminAladinInfo}
              totalLoanCount={totalLoanCount}
              loanTrend={loanTrend}
              popularGroups={popularGroups}
              keywords={usageKeywords}
              statsLoading={adminStatsLoading}
              statsError={adminStatsError}
              onRetryStats={fetchAdminStats}
              aiPopularity={adminAiPopularity}
              aiPopularityLoading={adminAiPopularityLoading}
              aiPopularityError={adminAiPopularityError}
              onRetryAiPopularity={() => fetchAdminAiPopularity(true)}
            />
          ) : isMasterAdmin ? (
            <AdminBookDetail
              book={displayBook}
              totalLoanCount={totalLoanCount}
              loanTrend={loanTrend}
              popularGroups={popularGroups}
              keywords={usageKeywords}
              loading={adminStatsLoading}
              errorMessage={adminStatsError}
              onRetry={fetchAdminStats}
              aladinInfo={aladinInfo}
              aladinInfoLoading={aladinInfoLoading}
              aladinInfoError={aladinInfoError}
              onRetryAladin={fetchAdminAladinInfo}
              aiPopularity={adminAiPopularity}
              aiPopularityLoading={adminAiPopularityLoading}
              aiPopularityError={adminAiPopularityError}
              onRetryAiPopularity={() => fetchAdminAiPopularity(true)}
            />
          ) : (
            <UserBookDetail
              book={displayBook}
              libraries={libraries}
              libraryStatusMap={libraryStatusMap}
              selectedLibrary={selectedLibrary}
              checkingLibraryKey={checkingLibraryKey}
              libraryLoading={libraryLoading}
              liked={liked}
              likeCount={likeCount}
              likeSubmitting={likeSubmitting}
              reviews={reviews}
              reviewContent={reviewContent}
              reviewScore={reviewScore}
              reviewSubmitting={reviewSubmitting}
              recommendBooks={recommendBooks}
              isbn13={isbn13}
              onCheckLibraryStatus={handleCheckLibraryStatus}
              onToggleLike={handleToggleLike}
              onReviewContentChange={setReviewContent}
              onReviewScoreChange={setReviewScore}
              onSubmitReview={handleSubmitReview}
            />
          )}
        </div>
      </div>
    </BasicLayout>
  )
}

const BookInfoCard = ({
  book,
  showLoanCount = true,
  liked = false,
  likeCount = 0,
  likeSubmitting = false,
  onToggleLike = null,
}) => {
  return (
    <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="h-72 w-48 shrink-0 overflow-hidden border-2 border-black bg-gray-100">
          {book.imageUrl ? (
            <img
              src={book.imageUrl}
              alt={book.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-gray-400">
              No Image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-black text-black">{book.title}</h1>

              <p className="mt-2 text-base font-bold text-gray-700">
                {book.author} / {book.publisher}
              </p>
            </div>

            {typeof onToggleLike === 'function' && (
              <button
                type="button"
                onClick={onToggleLike}
                disabled={likeSubmitting}
                aria-pressed={liked}
                aria-label={liked ? '도서 좋아요 취소' : '도서 좋아요'}
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 border-2 border-black px-3 text-sm font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  liked ? 'bg-pink-200 text-pink-900' : 'bg-white text-gray-800'
                }`}
              >
                <span aria-hidden="true">{liked ? '♥' : '♡'}</span>

                <span>
                  {likeSubmitting
                    ? '처리 중'
                    : Number(likeCount || 0).toLocaleString()}
                </span>
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
            <p>
              <span className="font-black text-black">ISBN</span>: {book.isbn13}
            </p>

            <p>
              <span className="font-black text-black">출판년도</span>:{' '}
              {book.publicationYear}
            </p>

            <p>
              <span className="font-black text-black">분류</span>:{' '}
              {book.className}
            </p>

            <p>
              <span className="font-black text-black">분류번호</span>:{' '}
              {book.classNo}
            </p>

            <p>
              <span className="font-black text-black">카테고리</span>:{' '}
              <span className="inline-flex border border-gray-300 bg-yellow-50 px-2 py-0.5 text-xs font-black text-gray-800">
                {book.categoryName || '미분류'}
              </span>
            </p>

            {showLoanCount && (
              <p>
                <span className="font-black text-black">대출 수</span>:{' '}
                {book.loanCount === null || book.loanCount === undefined
                  ? '데이터 미제공'
                  : `${Number(book.loanCount).toLocaleString()}건`}
              </p>
            )}
          </div>

          <div className="mt-5 border-2 border-black bg-gray-50 p-4 text-sm leading-6 text-gray-700">
            {book.description}
          </div>
        </div>
      </div>
    </section>
  )
}

const UserBookDetail = ({
  book,
  libraries,
  libraryStatusMap,
  selectedLibrary,
  checkingLibraryKey,
  libraryLoading,
  liked,
  likeCount,
  likeSubmitting,
  reviews,
  reviewContent,
  reviewScore,
  reviewSubmitting,
  recommendBooks,
  isbn13,
  onCheckLibraryStatus,
  onToggleLike,
  onReviewContentChange,
  onReviewScoreChange,
  onSubmitReview,
}) => {
  return (
    <div className="grid gap-8">
      <BookInfoCard
        book={book}
        liked={liked}
        likeCount={likeCount}
        likeSubmitting={likeSubmitting}
        onToggleLike={onToggleLike}
      />

      <section className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <div className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
          <h2 className="text-2xl font-black">리뷰 / 댓글</h2>

          <form onSubmit={onSubmitReview} className="mt-5 grid gap-3">
            <select
              value={reviewScore}
              onChange={(e) => onReviewScoreChange(e.target.value)}
              className="w-36 border-2 border-black bg-white px-3 py-2 font-bold"
            >
              <option value={5}>★★★★★ 5점</option>
              <option value={4}>★★★★ 4점</option>
              <option value={3}>★★★ 3점</option>
              <option value={2}>★★ 2점</option>
              <option value={1}>★ 1점</option>
            </select>

            <textarea
              value={reviewContent}
              onChange={(e) => onReviewContentChange(e.target.value)}
              placeholder="이 책에 대한 리뷰를 남겨보세요."
              className="min-h-28 resize-none border-2 border-black p-3 focus:ring-2 focus:ring-yellow-300 focus:outline-0"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={reviewSubmitting}
                className="border-2 border-black bg-yellow-200 px-5 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:opacity-60"
              >
                {reviewSubmitting ? '등록 중...' : '리뷰 등록'}
              </button>
            </div>
          </form>

          <div className="mt-6 grid gap-4">
            {reviews.length === 0 && (
              <p className="border-2 border-black bg-gray-50 p-5 text-center text-sm text-gray-500">
                아직 등록된 리뷰가 없습니다.
              </p>
            )}

            {reviews.map((review, index) => (
              <div
                key={review.id || index}
                className="border-2 border-black bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-black">
                    {review.nickname || review.writer || '익명 사용자'}
                  </p>
                  <p className="text-sm font-bold text-yellow-600">
                    {'★'.repeat(review.score || 5)}
                  </p>
                </div>

                <p className="mt-3 text-sm leading-6 text-gray-700">
                  {review.content}
                </p>

                <p className="mt-3 text-xs font-semibold text-gray-400">
                  {review.createdAt
                    ? new Intl.DateTimeFormat('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(review.createdAt))
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </div>

        <aside className="grid h-fit gap-6">
          <LibrarySection
            libraries={libraries}
            libraryStatusMap={libraryStatusMap}
            selectedLibrary={selectedLibrary}
            checkingLibraryKey={checkingLibraryKey}
            libraryLoading={libraryLoading}
            isbn13={isbn13}
            onCheckLibraryStatus={onCheckLibraryStatus}
          />

          <RecommendSection books={recommendBooks} />
        </aside>
      </section>
    </div>
  )
}

const LibrarySection = ({
  libraries,
  libraryStatusMap,
  selectedLibrary,
  checkingLibraryKey,
  libraryLoading,
  isbn13,
  onCheckLibraryStatus,
}) => {
  const cleanIsbn = String(isbn13 || '')
    .replaceAll('-', '')
    .trim()

  return (
    <div className="border-2 border-black bg-gray-50 p-5 shadow-[4px_4px_0_0] shadow-black">
      <h2 className="text-xl font-black">비치 도서관 / 대출 가능 여부</h2>

      {libraryLoading && (
        <p className="mt-4 border-2 border-black bg-white p-4 text-center text-sm font-bold">
          도서관 정보를 불러오는 중...
        </p>
      )}

      {!libraryLoading && libraries.length === 0 && (
        <p className="mt-4 border-2 border-black bg-white p-4 text-center text-sm text-gray-500">
          비치 도서관 정보가 없습니다.
        </p>
      )}

      <div className="mt-4 grid max-h-115 gap-3 overflow-y-auto pr-2">
        {libraries.map((library, index) => {
          const key = `${library.libCode}_${cleanIsbn}`
          const status = libraryStatusMap[key]
          const isChecking = checkingLibraryKey === key
          const isSelected = selectedLibrary?.libCode === library.libCode

          const isOwned = status?.isOwned || status?.hasBook === 'Y'
          const isLoanAvailable =
            status?.isLoanAvailable || status?.loanAvailable === 'Y'

          return (
            <div
              key={`${library.libCode}-${index}`}
              className={`border-2 border-black bg-white p-3 ${
                isSelected ? 'bg-yellow-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black">{library.libName}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {library.address || '주소 정보 없음'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    코드: {library.libCode}
                  </p>
                </div>

                {status && (
                  <span
                    className={`shrink-0 border-2 border-black px-2 py-1 text-xs font-black ${
                      isLoanAvailable
                        ? 'bg-green-100 text-green-700'
                        : isOwned
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isLoanAvailable
                      ? '대출 가능'
                      : isOwned
                        ? '소장 중'
                        : '정보 없음'}
                  </span>
                )}
              </div>

              {status?.message && (
                <p className="mt-2 text-xs font-bold text-gray-600">
                  {status.message}
                </p>
              )}

              <button
                type="button"
                disabled={isChecking}
                onClick={() => onCheckLibraryStatus(library)}
                className="mt-3 w-full border-2 border-black bg-yellow-100 px-3 py-2 text-xs font-black disabled:bg-gray-200"
              >
                {isChecking
                  ? '확인 중...'
                  : status
                    ? '확인 완료'
                    : '대출 가능 여부 확인'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const RecommendSection = ({ books }) => {
  return (
    <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
      <h2 className="text-xl font-black">비슷한 책 추천</h2>

      {books.length === 0 && (
        <p className="mt-4 border-2 border-black bg-gray-50 p-4 text-center text-sm text-gray-500">
          추천 도서 정보가 없습니다.
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {books.slice(0, 5).map((book, index) => (
          <Link
            key={book.isbn13 || index}
            to={`/books/${book.isbn13}`}
            state={{ book }}
            className="flex gap-3 border-2 border-black bg-gray-50 p-3 hover:bg-yellow-100"
          >
            <div className="h-20 w-14 shrink-0 overflow-hidden border-2 border-black bg-white">
              {book.imageUrl ? (
                <img
                  src={book.imageUrl}
                  alt={book.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                  No
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-black">
                {book.title || '제목 없음'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {book.author || '저자 정보 없음'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

const AcquisitionPreviewSection = ({ book, isOwned }) => {
  const navigate = useNavigate()

  const priceSales = Number(book?.priceSales)
  const priceStandard = Number(book?.priceStandard)

  const hasSalesPrice = Number.isFinite(priceSales) && priceSales > 0
  const hasStandardPrice = Number.isFinite(priceStandard) && priceStandard > 0

  const purchasePrice = hasSalesPrice
    ? Math.trunc(priceSales)
    : hasStandardPrice
      ? Math.trunc(priceStandard)
      : null

  const priceLabel = hasSalesPrice ? '알라딘 판매가' : '알라딘 정가'

  const handleAddToAcquisitionCart = () => {
    if (purchasePrice === null) {
      alert('가격 정보가 없어 입고 예정 목록에 담을 수 없습니다.')
      return
    }

    const normalizedIsbn = String(book?.isbn13 || book?.isbn || '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase()

    if (!normalizedIsbn) {
      alert('ISBN 정보가 없어 입고 예정 목록에 담을 수 없습니다.')
      return
    }

    try {
      const { monthKey, items: currentItems } =
        readCurrentMonthAcquisitionCart()

      const alreadyAdded = currentItems.some((item) => {
        const itemIsbn = String(item?.isbn13 || item?.isbn || '')
          .replace(/[^0-9Xx]/g, '')
          .toUpperCase()

        return itemIsbn === normalizedIsbn
      })

      if (alreadyAdded) {
        alert('이미 입고 예정 목록에 담긴 도서입니다.')
        navigate('/admin/acquisitions')
        return
      }

      const currentTotalAmount = currentItems.reduce((total, item) => {
        const unitPrice = Number(
          item?.unitPrice ??
            item?.priceSales ??
            item?.priceStandard ??
            item?.price ??
            0,
        )

        const quantityValue = Number(item?.quantity ?? 1)
        const quantity =
          Number.isFinite(quantityValue) && quantityValue > 0
            ? Math.trunc(quantityValue)
            : 1

        return (
          total +
          (Number.isFinite(unitPrice) && unitPrice > 0
            ? Math.trunc(unitPrice) * quantity
            : 0)
        )
      }, 0)

      const nextTotalAmount = currentTotalAmount + purchasePrice

      if (nextTotalAmount > MONTHLY_ACQUISITION_BUDGET) {
        const shortage = nextTotalAmount - MONTHLY_ACQUISITION_BUDGET

        alert(
          `월 입고 예산을 초과합니다.\n\n` +
            `월 예산: ${MONTHLY_ACQUISITION_BUDGET.toLocaleString()}원\n` +
            `현재 예정 금액: ${currentTotalAmount.toLocaleString()}원\n` +
            `추가 도서 금액: ${purchasePrice.toLocaleString()}원\n` +
            `부족 금액: ${shortage.toLocaleString()}원`,
        )
        return
      }

      const newItem = {
        id: normalizedIsbn,
        isbn13: normalizedIsbn,
        title: book?.title || '도서 제목 없음',
        author: book?.author || '저자 정보 없음',
        publisher: book?.publisher || '출판사 정보 없음',
        imageUrl: book?.imageUrl || '',
        unitPrice: purchasePrice,
        quantity: 1,
        priceSales: hasSalesPrice ? Math.trunc(priceSales) : null,
        priceStandard: hasStandardPrice ? Math.trunc(priceStandard) : null,
        priceSource: hasSalesPrice ? 'ALADIN_SALES' : 'ALADIN_STANDARD',
        addedAt: new Date().toISOString(),
      }

      const nextItems = [...currentItems, newItem]

      saveCurrentMonthAcquisitionCart(monthKey, nextItems)

      navigate('/admin/acquisitions')
    } catch (error) {
      console.error('[BookDetailPage] 입고 목록 저장 실패:', error)
      alert('입고 예정 목록 저장에 실패했습니다.')
    }
  }

  return (
    <section className="border-2 border-black bg-blue-50 p-6 shadow-[6px_6px_0_0] shadow-black">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-black text-blue-700">사서 입고 관리</p>
          <h2 className="mt-1 text-2xl font-black text-gray-950">
            도서 구입 가격
          </h2>

          {purchasePrice !== null ? (
            <>
              <p className="mt-4 text-3xl font-black text-blue-900">
                {purchasePrice.toLocaleString()}원
              </p>
              <p className="mt-1 text-sm font-bold text-gray-600">
                {priceLabel} 기준
              </p>
              <p className="mt-2 text-xs font-semibold text-gray-500">
                입고 예정 목록은 현재 달 말까지 유지되고 다음 달 1일에 자동
                초기화됩니다.
              </p>

              {hasSalesPrice &&
                hasStandardPrice &&
                priceStandard !== priceSales && (
                  <p className="mt-2 text-sm font-semibold text-gray-500">
                    정가 {priceStandard.toLocaleString()}원
                  </p>
                )}
            </>
          ) : (
            <>
              <p className="mt-4 text-xl font-black text-red-800">
                가격 정보 미제공
              </p>
              <p className="mt-2 text-sm font-semibold text-red-700">
                알라딘 응답에 판매가와 정가가 없어 현재는 입고 목록에 담을 수
                없습니다.
              </p>
            </>
          )}

          {isOwned && (
            <p className="mt-3 text-sm font-bold text-green-800">
              현재 소속 도서관이 이미 소장한 도서입니다. 추가 구입 여부를
              확인하세요.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddToAcquisitionCart}
          disabled={purchasePrice === null}
          className="min-w-56 border-2 border-black bg-yellow-200 px-6 py-4 text-lg font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-70"
        >
          {purchasePrice === null
            ? '가격 정보 없음'
            : isOwned
              ? '추가 입고 목록에 담기'
              : '입고 목록에 담기'}
        </button>
      </div>
    </section>
  )
}

const AI_POPULARITY_LEVEL_INFO = {
  VERY_HIGH: {
    label: '매우 높음',
    className: 'border-red-400 bg-red-100 text-red-800',
  },
  HIGH: {
    label: '높음',
    className: 'border-orange-400 bg-orange-100 text-orange-800',
  },
  MEDIUM: {
    label: '보통',
    className: 'border-yellow-400 bg-yellow-100 text-yellow-800',
  },
  LOW: {
    label: '낮음',
    className: 'border-blue-400 bg-blue-100 text-blue-800',
  },
  VERY_LOW: {
    label: '매우 낮음',
    className: 'border-gray-400 bg-gray-100 text-gray-700',
  },
}

const AdminAiPopularitySection = ({
  result,
  loading,
  errorMessage,
  onRetry,
}) => {
  const score = toNullableNumber(result?.popularityScore)
  const basePriorityScore = toNullableNumber(result?.basePriorityScore)

  const levelInfo =
    AI_POPULARITY_LEVEL_INFO[
      String(result?.popularityLevel || '')
        .trim()
        .toUpperCase()
    ] || AI_POPULARITY_LEVEL_INFO.MEDIUM

  return (
    <section className="border-2 border-black bg-purple-50 p-6 shadow-[6px_6px_0_0] shadow-black">
      <div className="flex flex-col gap-4 border-b-2 border-black pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-purple-700">
            AI BOOK POPULARITY
          </p>

          <h2 className="mt-1 text-2xl font-black text-gray-950">
            AI 도서 인기도
          </h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
            저자·출판사·KDC를 이용해 전국 공공도서관 대출 체급을 예측한 관리자
            참고 지표입니다.
          </p>
        </div>

        {!loading && score !== null && (
          <span
            className={`w-fit rounded-full border-2 px-4 py-2 text-sm font-black ${levelInfo.className}`}
          >
            {levelInfo.label}
          </span>
        )}
      </div>

      {loading && (
        <div className="mt-5 flex min-h-44 flex-col items-center justify-center border-2 border-dashed border-purple-300 bg-white p-6 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-purple-100 border-t-purple-700" />

          <p className="mt-4 font-black text-purple-900">
            AI 모델로 도서 인기도를 분석하고 있습니다.
          </p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="mt-5 border-2 border-red-400 bg-red-50 p-5">
          <p className="font-black text-red-800">{errorMessage}</p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 border-2 border-black bg-white px-4 py-2 text-xs font-black shadow-[2px_2px_0_0] shadow-black"
          >
            AI 인기도 다시 분석
          </button>
        </div>
      )}

      {!loading && !errorMessage && result && (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalysisSummaryCard
              label="AI 인기도"
              value={score === null ? '데이터 미제공' : `${score.toFixed(1)}점`}
              description="XGBoost 전국 대출 체급 예측"
            />

            <AnalysisSummaryCard
              label="인기도 수준"
              value={levelInfo.label}
              description="AI 점수 구간 기준"
            />

            <AnalysisSummaryCard
              label="종합 수매점수"
              value={
                basePriorityScore === null
                  ? '-'
                  : `${basePriorityScore.toFixed(1)}점`
              }
              description="장르 균형·지역 수요·AI 체급 종합"
            />

            <AnalysisSummaryCard
              label="분석 KDC"
              value={result?.kdcMain || result?.resolvedKdc || '-'}
              description={result?.modelVersion || 'AI 모델 버전 미제공'}
            />
          </div>

          <div className="mt-5 border-2 border-black bg-white p-5">
            <p className="text-xs font-black text-purple-700">AI 분석 소평</p>

            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
              {result?.aiComment ||
                'AI 모델에서 별도의 분석 소평을 제공하지 않았습니다.'}
            </p>
          </div>
        </>
      )}

      {!loading && !errorMessage && !result && (
        <div className="mt-5 border-2 border-dashed border-purple-300 bg-white p-6 text-center">
          <p className="font-black text-purple-900">
            표시할 AI 인기도 결과가 없습니다.
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 border-2 border-black bg-purple-100 px-4 py-2 text-xs font-black"
          >
            AI 인기도 분석
          </button>
        </div>
      )}

      <p className="mt-5 border-t border-purple-200 pt-4 text-[11px] font-semibold leading-5 text-gray-500">
        이 점수는 실제 판매량이나 승인 확률이 아니라 Library AI v4.1 모델이
        예측한 전국 공공도서관 대출 체급입니다.
      </p>
    </section>
  )
}

const LibraryAdminBookDetail = ({
  book,
  libraryCode,
  libraryName,
  adminInfoLoading,
  adminInfoError,
  onRetryAdminInfo,
  holdingStatus,
  loading,
  errorMessage,
  onRetry,
  purchaseEvidence,
  purchaseEvidenceLoading,
  purchaseEvidenceError,
  onRetryPurchaseEvidence,
  aladinInfo,
  aladinInfoLoading,
  aladinInfoError,
  onRetryAladin,
  totalLoanCount,
  loanTrend,
  popularGroups,
  keywords,
  statsLoading,
  statsError,
  onRetryStats,
  aiPopularity,
  aiPopularityLoading,
  aiPopularityError,
  onRetryAiPopularity,
}) => {
  const displayLibraryName = libraryName || '소속 도서관'
  const isOwned = holdingStatus?.isOwned === true

  return (
    <div className="grid gap-8">
      <BookInfoCard book={book} showLoanCount={false} />

      <AdminAiPopularitySection
        result={aiPopularity}
        loading={aiPopularityLoading}
        errorMessage={aiPopularityError}
        onRetry={onRetryAiPopularity}
      />

      <section className="border-2 border-black bg-emerald-50 p-6 shadow-[6px_6px_0_0] shadow-black">
        <p className="text-xs font-black tracking-[0.16em] text-emerald-700">
          MANAGED LIBRARY
        </p>

        <h2 className="mt-1 text-2xl font-black text-gray-950">
          담당 도서관 정보
        </h2>

        {adminInfoLoading && (
          <p className="mt-4 border-2 border-black bg-white p-4 text-sm font-black">
            로그인한 관리자의 담당 도서관 정보를 불러오는 중입니다.
          </p>
        )}

        {!adminInfoLoading && adminInfoError && (
          <div className="mt-4 border-2 border-red-400 bg-red-50 p-4">
            <p className="text-sm font-black text-red-800">{adminInfoError}</p>

            <button
              type="button"
              onClick={onRetryAdminInfo}
              className="mt-3 border-2 border-black bg-white px-4 py-2 text-xs font-black shadow-[2px_2px_0_0] shadow-black"
            >
              관리자 정보 다시 조회
            </button>
          </div>
        )}

        {!adminInfoLoading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black text-gray-500">도서관명</p>
              <p className="mt-2 text-lg font-black">{displayLibraryName}</p>
            </div>

            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black text-gray-500">
                정보나루 도서관 코드
              </p>
              <p className="mt-2 font-mono text-lg font-black">
                {libraryCode || '미지정'}
              </p>
            </div>
          </div>
        )}
      </section>

      <AdminAladinCommerceSection
        info={aladinInfo}
        loading={aladinInfoLoading}
        errorMessage={aladinInfoError}
        onRetry={onRetryAladin}
      />

      <AcquisitionPreviewSection book={book} isOwned={isOwned} />

      {loading && (
        <section className="border-2 border-black bg-white p-8 text-center shadow-[6px_6px_0_0] shadow-black">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
          <p className="mt-4 font-black text-gray-700">
            {displayLibraryName}의 소장 여부를 확인하는 중입니다.
          </p>
        </section>
      )}

      {!loading && errorMessage && (
        <section className="border-2 border-black bg-red-50 p-6 shadow-[6px_6px_0_0] shadow-black">
          <p className="font-black text-red-800">
            소장 여부를 확인하지 못했습니다.
          </p>
          <p className="mt-2 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-5 border-2 border-black bg-white px-5 py-2 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            다시 조회
          </button>
        </section>
      )}

      {!loading && !errorMessage && holdingStatus && (
        <section
          className={`border-2 border-black p-6 shadow-[6px_6px_0_0] shadow-black ${
            isOwned ? 'bg-green-50' : 'bg-yellow-50'
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                className={`text-2xl font-black ${
                  isOwned ? 'text-green-900' : 'text-amber-950'
                }`}
              >
                {isOwned
                  ? '보유 중인 도서입니다.'
                  : '소장되지 않은 도서입니다.'}
              </p>

              <p
                className={`mt-2 text-sm font-bold ${
                  isOwned ? 'text-green-800' : 'text-amber-900'
                }`}
              >
                {isOwned
                  ? `${displayLibraryName}에 소장된 도서로 확인되었습니다.`
                  : `${displayLibraryName}의 소장 도서가 아닌 것으로 확인되었습니다.`}
              </p>
            </div>

            <span
              className={`w-fit rounded-full border-2 bg-white px-4 py-2 text-sm font-black ${
                isOwned
                  ? 'border-green-800 text-green-900'
                  : 'border-amber-900 text-amber-950'
              }`}
            >
              {isOwned ? '소장 중' : '미소장'}
            </span>
          </div>
        </section>
      )}

      <PurchaseEvidenceSection
        evidence={purchaseEvidence}
        loading={purchaseEvidenceLoading}
        errorMessage={purchaseEvidenceError}
        onRetry={onRetryPurchaseEvidence}
        fallbackBook={book}
      />

      <section className="border-t-4 border-black pt-8">
        <div className="mb-5">
          <p className="text-xs font-black tracking-[0.16em] text-blue-700">
            DATA4LIBRARY USAGE ANALYSIS
          </p>

          <h2 className="mt-1 text-3xl font-black">정보나루 이용분석</h2>

          <p className="mt-2 text-sm font-semibold text-gray-500">
            정보나루 도서별 이용분석 API에서 제공하는 누적 대출, 최근 12개월
            추이, 주요 이용자층과 핵심 키워드입니다.
          </p>
        </div>

        <AdminBookDetail
          book={book}
          totalLoanCount={totalLoanCount}
          loanTrend={loanTrend}
          popularGroups={popularGroups}
          keywords={keywords}
          loading={statsLoading}
          errorMessage={statsError}
          onRetry={onRetryStats}
          showBookInfo={false}
          showAladin={false}
          showAiPopularity={false}
        />
      </section>
    </div>
  )
}

const PurchaseEvidenceSection = ({
  evidence,
  loading,
  errorMessage,
  onRetry,
  fallbackBook,
}) => {
  if (loading) {
    return (
      <section className="border-2 border-black bg-white p-8 text-center shadow-[6px_6px_0_0] shadow-black">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

        <p className="mt-4 text-lg font-black text-gray-800">
          구매 판단 근거를 수집하는 중입니다.
        </p>

        <p className="mt-2 text-sm font-semibold text-gray-500">
          희망도서 신청·시민투표·관내 동일 분야 수요·전국 대출 데이터를
          조회합니다.
        </p>
      </section>
    )
  }

  if (errorMessage) {
    return (
      <section className="border-2 border-black bg-red-50 p-6 shadow-[6px_6px_0_0] shadow-black">
        <h2 className="text-2xl font-black text-red-900">
          구매 판단 근거 조회 실패
        </h2>

        <p className="mt-3 text-sm font-semibold leading-6 text-red-700">
          {errorMessage}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 border-2 border-black bg-white px-5 py-2 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
        >
          구매 근거 다시 조회
        </button>
      </section>
    )
  }

  if (!evidence) {
    return (
      <section className="border-2 border-black bg-gray-50 p-6 text-center shadow-[6px_6px_0_0] shadow-black">
        <p className="font-black text-gray-700">
          표시할 구매 판단 근거가 없습니다.
        </p>
      </section>
    )
  }

  const localDemand = evidence?.localCitizenDemand || {}

  const categoryDemand = evidence?.libraryCategoryDemand || {}

  const nationalDemand = evidence?.nationalDemand || {}

  const freshness = evidence?.freshness || {}

  const nationalLoanTrend = Array.isArray(nationalDemand?.loanTrend)
    ? nationalDemand.loanTrend
    : []

  const latestLoan =
    nationalLoanTrend.length > 0
      ? nationalLoanTrend[nationalLoanTrend.length - 1]
      : null

  const topBooks = Array.isArray(categoryDemand?.topBooks)
    ? categoryDemand.topBooks
    : []

  const summaries = Array.isArray(evidence?.evidenceSummary)
    ? evidence.evidenceSummary
    : []

  const formatCount = (value) => {
    const number = Number(value)

    return Number.isFinite(number) ? number.toLocaleString() : '-'
  }

  const formatLatestApplicationDate = (value) => {
    if (!value) {
      return '최근 신청 없음'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return '최근 신청일 확인 불가'
    }

    return `최근 신청 ${new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)}`
  }

  const publicationYear =
    freshness?.publicationYear ||
    evidence?.book?.publicationYear ||
    fallbackBook?.publicationYear

  const freshnessDescription =
    freshness?.yearsSincePublication === null ||
    freshness?.yearsSincePublication === undefined
      ? publicationYear || '출판연도 미제공'
      : `${publicationYear || '출판연도 미제공'} · 출판 후 ${formatCount(
          freshness.yearsSincePublication,
        )}년`

  const categoryReturnedCount = Number(categoryDemand?.returnedBookCount ?? 0)

  const categorySameCount = Number(categoryDemand?.sameCategoryBookCount ?? 0)

  const categoryRatio =
    categoryDemand?.available && categoryReturnedCount > 0
      ? (categorySameCount * 100) / categoryReturnedCount
      : null

  const categoryValue = categoryDemand?.available
    ? `${formatCount(categorySameCount)}권`
    : '데이터 미제공'

  const categoryDescription = categoryDemand?.available
    ? `관내 인기대출 상위 ${formatCount(categoryReturnedCount)}권 중 ${
        categoryRatio === null ? '-' : categoryRatio.toFixed(1)
      }%`
    : categoryDemand?.message || '관내 동일 분야 수요 조회 실패'

  const nationalValue =
    nationalDemand?.available &&
    nationalDemand?.totalLoanCount !== null &&
    nationalDemand?.totalLoanCount !== undefined
      ? `${formatCount(nationalDemand.totalLoanCount)}건`
      : '데이터 미제공'

  const nationalDescription = nationalDemand?.available
    ? `${nationalDemand?.trendStatus || '추이 판단 불가'}${
        latestLoan ? ` · 최근 월 ${formatCount(latestLoan.loanCount)}건` : ''
      }`
    : nationalDemand?.message || '전국 이용분석 미제공'

  const localDemandAvailable = localDemand?.available !== false

  const localDemandValue = localDemandAvailable
    ? `${formatCount(localDemand?.pendingApplicationCount)}건 · ${formatCount(
        localDemand?.activeVoteCount,
      )}표`
    : '데이터 미제공'

  const localDemandDescription = localDemandAvailable
    ? formatLatestApplicationDate(localDemand?.latestApplicationAt)
    : localDemand?.message || '지역 시민 수요 집계 실패'

  return (
    <div className="grid gap-8">
      <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-black">구매 판단 근거</h2>

            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              프로젝트 DB와 도서관정보나루 API에서 조회한 실제 수치입니다.
              임의의 구매확률이나 더미데이터는 사용하지 않습니다.
            </p>
          </div>

          <span className="w-fit border-2 border-black bg-blue-100 px-3 py-2 text-xs font-black">
            조회 ISBN {evidence?.isbn13 || fallbackBook?.isbn13 || '-'}
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AnalysisSummaryCard
            label="지역 시민 수요"
            value={localDemandValue}
            description={localDemandDescription}
          />

          <AnalysisSummaryCard
            label="관내 동일 분야 수요"
            value={categoryValue}
            description={categoryDescription}
          />

          <AnalysisSummaryCard
            label="전국 수요 요약"
            value={nationalValue}
            description={nationalDescription}
          />

          <AnalysisSummaryCard
            label="자료 최신성"
            value={freshness?.freshnessLevel || '판단 불가'}
            description={freshnessDescription}
          />
        </div>

        <p className="mt-5 border-t border-gray-200 pt-4 text-xs font-semibold text-gray-500">
          전국 대출 추이·연령 및 성별 이용자층·키워드 상세정보는 바로 아래의
          정보나루 이용분석에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="border-2 border-black bg-blue-50 p-6 shadow-[6px_6px_0_0] shadow-black">
        <h2 className="text-2xl font-black">근거 요약</h2>

        {summaries.length === 0 ? (
          <p className="mt-4 text-sm font-semibold text-gray-600">
            조합할 수 있는 구매 근거 요약이 없습니다.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {summaries.map((summary, index) => (
              <li
                key={`${summary}-${index}`}
                className="border-2 border-black bg-white px-4 py-3 text-sm font-bold leading-6"
              >
                {index + 1}. {summary}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
        <div className="mb-5">
          <h2 className="text-2xl font-black">
            소속 도서관 동일 KDC 분야 인기대출 도서
          </h2>

          <p className="mt-2 text-sm font-semibold text-gray-500">
            {categoryDemand?.startDate || '-'} ~{' '}
            {categoryDemand?.endDate || '-'} 기준입니다.
          </p>

          {categoryDemand?.message && (
            <p className="mt-2 text-xs font-semibold text-gray-500">
              {categoryDemand.message}
            </p>
          )}

          <p className="mt-2 text-xs font-bold text-amber-700">
            정보나루의 libCode 기준 도서관별 인기대출 API는 순위만 제공하며 개별
            대출건수는 제공하지 않습니다.
          </p>
        </div>

        {topBooks.length === 0 ? (
          <div className="border-2 border-black bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
            동일 분야 인기대출 도서 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-195 border-t-2 border-black text-left text-sm">
              <thead>
                <tr className="border-b border-black bg-gray-100">
                  <th className="px-3 py-3">순위</th>
                  <th className="px-3 py-3">도서명</th>
                  <th className="px-3 py-3">저자</th>
                  <th className="px-3 py-3">KDC</th>
                  <th className="px-3 py-3">ISBN</th>
                </tr>
              </thead>

              <tbody>
                {topBooks.map((item, index) => (
                  <tr
                    key={`${item?.isbn13 || item?.title}-${index}`}
                    className="border-b border-gray-200"
                  >
                    <td className="px-3 py-3 font-black">
                      {item?.ranking ? `${formatCount(item.ranking)}위` : '-'}
                    </td>

                    <td className="px-3 py-3">
                      <p className="font-black">{item?.title || '제목 없음'}</p>

                      <p className="mt-1 text-xs text-gray-500">
                        {item?.publisher || '출판사 정보 없음'}
                      </p>
                    </td>

                    <td className="px-3 py-3">{item?.author || '-'}</td>

                    <td className="px-3 py-3">
                      {item?.classNo || '-'}
                      {item?.className ? ` / ${item.className}` : ''}
                    </td>

                    <td className="px-3 py-3 font-mono text-xs">
                      {item?.isbn13 || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const AdminBookDetail = ({
  book,
  totalLoanCount,
  loanTrend,
  popularGroups,
  keywords,
  loading,
  errorMessage,
  onRetry,
  aladinInfo,
  aladinInfoLoading,
  aladinInfoError,
  onRetryAladin,
  aiPopularity,
  aiPopularityLoading,
  aiPopularityError,
  onRetryAiPopularity,
  showBookInfo = true,
  showAladin = true,
  showAiPopularity = true,
}) => {
  const latestLoan =
    loanTrend.length > 0 ? loanTrend[loanTrend.length - 1] : null

  const topGroup = popularGroups.length > 0 ? popularGroups[0] : null

  return (
    <div className="grid gap-8">
      {showBookInfo && <BookInfoCard book={book} />}

      {showAiPopularity && (
        <AdminAiPopularitySection
          result={aiPopularity}
          loading={aiPopularityLoading}
          errorMessage={aiPopularityError}
          onRetry={onRetryAiPopularity}
        />
      )}

      {showAladin && (
        <AdminAladinCommerceSection
          info={aladinInfo}
          loading={aladinInfoLoading}
          errorMessage={aladinInfoError}
          onRetry={onRetryAladin}
        />
      )}

      {loading && (
        <section className="border-2 border-black bg-white p-8 text-center shadow-[6px_6px_0_0] shadow-black">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
          <p className="mt-4 font-black text-gray-700">
            정보나루에서 도서 이용분석 정보를 불러오는 중입니다.
          </p>
        </section>
      )}

      {!loading && errorMessage && (
        <section className="border-2 border-black bg-red-50 p-6 shadow-[6px_6px_0_0] shadow-black">
          <p className="font-black text-red-800">{errorMessage}</p>
          <p className="mt-2 text-sm font-semibold text-red-700">
            더미데이터는 표시하지 않습니다. 정보나루 API 연결 상태와 인증키를
            확인해주세요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 border-2 border-black bg-white px-5 py-2 font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            다시 조회
          </button>
        </section>
      )}

      {!loading && !errorMessage && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalysisSummaryCard
              label="누적 대출건수"
              value={
                totalLoanCount === null || totalLoanCount === undefined
                  ? '데이터 미제공'
                  : `${Number(totalLoanCount).toLocaleString()}건`
              }
              description="정보나루 도서별 이용분석 기준"
            />

            <AnalysisSummaryCard
              label="최근 월 대출건수"
              value={
                latestLoan
                  ? `${Number(latestLoan.loanCount || 0).toLocaleString()}건`
                  : '-'
              }
              description={latestLoan?.loanMonth || '최근 월 데이터 없음'}
            />

            <AnalysisSummaryCard
              label="최근 월 대출순위"
              value={
                latestLoan?.ranking
                  ? `${Number(latestLoan.ranking).toLocaleString()}위`
                  : '-'
              }
              description="전국 공공도서관 분석 순위"
            />

            <AnalysisSummaryCard
              label="최다 대출 이용자"
              value={
                topGroup
                  ? `${topGroup.age || ''} ${topGroup.gender || ''}`.trim()
                  : '-'
              }
              description={
                topGroup
                  ? `${Number(topGroup.loanCount || 0).toLocaleString()}건 · ${Number(
                      topGroup.ranking || 0,
                    ).toLocaleString()}위`
                  : '최근 30일 데이터 없음'
              }
            />
          </section>

          <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-gray-900 text-white">
                📊
              </div>
              <div>
                <h2 className="text-2xl font-black">대출 추이</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  정보나루가 제공하는 최근 12개월 월별 대출건수와 순위입니다.
                </p>
              </div>
            </div>

            <LoanTrendChart data={loanTrend} />

            {loanTrend.length > 0 && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <LoanTrendTable data={loanTrend.slice(0, 6)} />
                <LoanTrendTable data={loanTrend.slice(6, 12)} />
              </div>
            )}
          </section>

          <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-gray-900 text-white">
                👥
              </div>
              <div>
                <h2 className="text-2xl font-black">다대출 이용자 그룹</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  최근 30일 동안 이 도서를 가장 많이 대출한 연령·성별
                  그룹입니다.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-t-2 border-black text-center text-sm">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="px-3 py-3">연령</th>
                    <th className="px-3 py-3">성별</th>
                    <th className="px-3 py-3">대출건수</th>
                    <th className="px-3 py-3">그룹 내 도서 순위</th>
                  </tr>
                </thead>
                <tbody>
                  {popularGroups.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-gray-500">
                        정보나루에서 제공된 다대출 이용자 그룹 정보가 없습니다.
                      </td>
                    </tr>
                  )}

                  {popularGroups.map((group, index) => (
                    <tr
                      key={`${group.age}-${group.gender}-${index}`}
                      className={index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}
                    >
                      <td className="px-3 py-3 font-bold">
                        {group.age || '-'}
                      </td>
                      <td className="px-3 py-3">{group.gender || '-'}</td>
                      <td className="px-3 py-3 font-bold">
                        {Number(group.loanCount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        {group.ranking
                          ? `${Number(group.ranking).toLocaleString()}위`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <UsageKeywordSection keywords={keywords} />
        </>
      )}
    </div>
  )
}

const formatWon = (value) => {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return '-'
  }

  return `${number.toLocaleString('ko-KR')}원`
}

const calculateDiscountRate = (standardPrice, salesPrice) => {
  const standard = Number(standardPrice)
  const sales = Number(salesPrice)

  if (
    !Number.isFinite(standard) ||
    !Number.isFinite(sales) ||
    standard <= 0 ||
    sales < 0 ||
    sales >= standard
  ) {
    return null
  }

  return Math.round(((standard - sales) / standard) * 100)
}

const AdminAladinCommerceSection = ({
  info,
  loading,
  errorMessage,
  onRetry,
}) => {
  const rating10 = Number(info?.customerReviewRank)

  const hasRating = Number.isFinite(rating10) && rating10 > 0

  const rating5 = hasRating ? Math.min(5, Math.max(0, rating10 / 2)) : null

  const filledStars = rating5 ? Math.round(rating5) : 0

  const discountRate = calculateDiscountRate(
    info?.priceStandard,
    info?.priceSales,
  )

  return (
    <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
      <div className="flex flex-col gap-4 border-b-2 border-black pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-blue-700">
            ALADIN DATA
          </p>

          <h2 className="mt-1 text-2xl font-black text-gray-950">
            판매 가격 및 회원 별점
          </h2>

          <p className="mt-2 text-sm font-semibold text-gray-500">
            관리자 검토를 위한 알라딘 인터넷서점 제공 정보입니다.
          </p>
        </div>

        {info?.detailUrl && (
          <a
            href={info.detailUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 border-2 border-black bg-yellow-200 px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
          >
            알라딘 상품 보기
          </a>
        )}
      </div>

      {loading && (
        <div className="mt-5 border-2 border-black bg-gray-50 p-7 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-700" />

          <p className="mt-3 text-sm font-black text-gray-700">
            알라딘 가격과 별점을 불러오는 중입니다.
          </p>
        </div>
      )}

      {!loading && errorMessage && (
        <div className="mt-5 border-2 border-red-400 bg-red-50 p-5">
          <p className="text-sm font-black text-red-800">{errorMessage}</p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 border-2 border-black bg-white px-4 py-2 text-xs font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
          >
            다시 조회
          </button>
        </div>
      )}

      {!loading && !errorMessage && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="border-2 border-black bg-yellow-50 p-5">
            <p className="text-xs font-black text-gray-500">판매가</p>

            <p className="mt-2 text-2xl font-black text-red-700">
              {formatWon(info?.priceSales)}
            </p>

            {discountRate !== null && (
              <p className="mt-2 text-xs font-black text-red-600">
                정가 대비 {discountRate}% 할인
              </p>
            )}
          </article>

          <article className="border-2 border-black bg-gray-50 p-5">
            <p className="text-xs font-black text-gray-500">정가</p>

            <p className="mt-2 text-2xl font-black text-gray-950">
              {formatWon(info?.priceStandard)}
            </p>

            <p className="mt-2 text-xs font-semibold text-gray-500">
              알라딘 상품 기준 가격
            </p>
          </article>

          <article className="border-2 border-black bg-amber-50 p-5">
            <p className="text-xs font-black text-gray-500">회원 별점</p>

            <div className="mt-2 flex items-center gap-2">
              <span
                className="text-xl tracking-[-0.08em] text-amber-500"
                aria-hidden="true"
              >
                {'★'.repeat(filledStars)}
                {'☆'.repeat(5 - filledStars)}
              </span>

              <span className="text-xl font-black text-gray-950">
                {rating5 === null ? '-' : rating5.toFixed(1)}
              </span>
            </div>

            <p className="mt-2 text-xs font-semibold text-gray-500">
              {hasRating
                ? `알라딘 평점 ${rating10.toFixed(1)} / 10`
                : '등록된 회원 별점 없음'}
            </p>
          </article>

          <article className="border-2 border-black bg-blue-50 p-5">
            <p className="text-xs font-black text-gray-500">판매지수</p>

            <p className="mt-2 text-2xl font-black text-blue-800">
              {Number.isFinite(Number(info?.salesPoint))
                ? Number(info.salesPoint).toLocaleString('ko-KR')
                : '-'}
            </p>

            <p className="mt-2 text-xs font-semibold text-gray-500">
              알라딘 내 상품 판매 지표
            </p>
          </article>
        </div>
      )}

      <p className="mt-5 border-t border-gray-200 pt-4 text-[11px] font-semibold text-gray-400">
        도서 DB 제공: 알라딘 인터넷서점
      </p>
    </section>
  )
}

const AnalysisSummaryCard = ({ label, value, description }) => (
  <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0_0] shadow-black">
    <p className="text-xs font-black text-gray-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-gray-950">{value}</p>
    <p className="mt-2 text-xs font-semibold text-gray-500">{description}</p>
  </div>
)

const UsageKeywordSection = ({ keywords }) => (
  <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-gray-900 text-white">
        #
      </div>
      <div>
        <h2 className="text-2xl font-black">주요 키워드</h2>
        <p className="mt-1 text-sm font-semibold text-gray-500">
          정보나루 도서별 이용분석에서 제공하는 핵심 키워드입니다.
        </p>
      </div>
    </div>

    {keywords.length === 0 ? (
      <div className="border-2 border-black bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
        제공된 키워드 정보가 없습니다.
      </div>
    ) : (
      <div className="flex flex-wrap gap-3">
        {keywords.map((keyword, index) => (
          <span
            key={`${keyword.word}-${index}`}
            className="border-2 border-black bg-yellow-100 px-4 py-2 text-sm font-black shadow-[2px_2px_0_0] shadow-black"
            title={
              keyword.weight === null || keyword.weight === undefined
                ? undefined
                : `가중치 ${keyword.weight}`
            }
          >
            #{keyword.word}
          </span>
        ))}
      </div>
    )}
  </section>
)

const LoanTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="border-2 border-black bg-gray-50 p-10 text-center text-sm text-gray-500">
        대출 추이 데이터가 없습니다.
      </div>
    )
  }

  const width = 900
  const height = 260
  const paddingX = 50
  const paddingY = 35

  const maxLoanCount = Math.max(...data.map((item) => item.loanCount || 0), 1)

  const points = data.map((item, index) => {
    const x =
      paddingX + (index * (width - paddingX * 2)) / Math.max(data.length - 1, 1)

    const ratio = (item.loanCount || 0) / maxLoanCount
    const y = height - paddingY - ratio * (height - paddingY * 2)

    return {
      x,
      y,
      label: item.loanMonth,
      value: item.loanCount,
    }
  })

  const polylinePoints = points
    .map((point) => `${point.x},${point.y}`)
    .join(' ')

  return (
    <div className="overflow-x-auto border-2 border-black bg-gray-50 p-4">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-225"
      >
        {[0, 1, 2, 3, 4].map((line) => {
          const y = paddingY + (line * (height - paddingY * 2)) / 4

          return (
            <line
              key={line}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="#d1d5db"
              strokeWidth="1"
            />
          )
        })}

        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
        />

        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4" fill="#2563eb" />
            <text
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="12"
              fill="#111827"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

const LoanTrendTable = ({ data }) => {
  return (
    <table className="w-full border-t-2 border-black text-center text-sm">
      <thead>
        <tr className="border-b border-gray-300">
          <th className="px-3 py-3">대출연월</th>
          <th className="px-3 py-3">대출건수</th>
          <th className="px-3 py-3">대출순위</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr
            key={`${item.loanMonth}-${index}`}
            className={index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}
          >
            <td className="px-3 py-3 font-bold">{item.loanMonth}</td>
            <td className="px-3 py-3">
              {Number(item.loanCount || 0).toLocaleString()}
            </td>
            <td className="px-3 py-3">{item.ranking}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DetailPage
