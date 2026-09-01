import axios from 'axios'

const API_SERVER =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const DEFAULT_LIBRARY_REGION = '31'
const DEFAULT_LIBRARY_DTL_REGION = '31100'

const classificationInFlight = new Map()
const purchaseEvidenceInFlight = new Map()

const normalizeIsbn = (value) => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
    .trim()
}

const isTimeoutError = (error) => {
  return (
    error?.code === 'ECONNABORTED' ||
    String(error?.message || '')
      .toLowerCase()
      .includes('timeout')
  )
}

const extractErrorMessage = (error, fallbackMessage) => {
  const responseData = error?.response?.data

  if (typeof responseData === 'string') {
    return responseData
  }

  return (
    responseData?.message ||
    responseData?.detail ||
    responseData?.error ||
    error?.message ||
    fallbackMessage
  )
}

export const searchExternalBooks = async ({
  provider = 'ALL',
  keyword = '',
  title = '',
  author = '',
  isbn13 = '',
  publisher = '',
  pageNo = 1,
  pageSize = 10,
} = {}) => {
  const normalizedIsbn = normalizeIsbn(isbn13)

  const normalizedProvider = String(provider || 'ALL')
    .trim()
    .toUpperCase()

  const params = {
    provider: normalizedProvider,
    keyword: String(keyword ?? '').trim(),
    title: String(title ?? '').trim(),
    author: String(author ?? '').trim(),
    isbn13: normalizedIsbn,
    publisher: String(publisher ?? '').trim(),
    pageNo: Math.max(1, Number(pageNo) || 1),
    pageSize: Math.max(1, Number(pageSize) || 10),
  }

  console.log('[externalBookApi] 통합 도서 검색 요청:', params)

  try {
    const response = await axios.get(`${API_SERVER}/external/books`, {
      params,
      withCredentials: true,
      timeout: 45000,
    })

    const responseData = response.data

    if (Array.isArray(responseData)) {
      return responseData
    }

    if (Array.isArray(responseData?.content)) {
      return responseData.content
    }

    if (Array.isArray(responseData?.items)) {
      return responseData.items
    }

    if (Array.isArray(responseData?.books)) {
      return responseData.books
    }

    return []
  } catch (error) {
    console.error('[externalBookApi] 통합 도서 검색 실패:', error)

    if (isTimeoutError(error)) {
      const timeoutError = new Error('도서 검색 응답 시간이 초과되었습니다.')

      timeoutError.code = 'EXTERNAL_BOOK_SEARCH_TIMEOUT'

      timeoutError.cause = error

      throw timeoutError
    }

    throw error
  }
}

export const getExternalBookDetail = async (isbnOrParams) => {
  const params =
    typeof isbnOrParams === 'object' && isbnOrParams !== null
      ? isbnOrParams
      : {
          isbn13: isbnOrParams,
        }

  const provider = String(params?.provider || 'ALL')
    .trim()
    .toUpperCase()

  const requestedIsbn = normalizeIsbn(
    params?.isbn13 ?? params?.isbn ?? params?.ISBN13 ?? params?.itemId,
  )

  if (!requestedIsbn) {
    throw new Error('도서 상세 조회에 필요한 ISBN이 없습니다.')
  }

  const books = await searchExternalBooks({
    provider,
    isbn13: requestedIsbn,
    pageNo: 1,
    pageSize: 20,
  })

  const exactBook = books.find((book) => {
    const bookIsbn = normalizeIsbn(
      book?.isbn13 ?? book?.isbn ?? book?.ISBN13 ?? book?.itemId,
    )

    return bookIsbn === requestedIsbn
  })

  const detailBook = exactBook || books[0] || null

  if (!detailBook) {
    const error = new Error('해당 ISBN의 도서 정보를 찾을 수 없습니다.')

    error.code = 'BOOK_NOT_FOUND'

    throw error
  }

  return detailBook
}

export const getData4LibraryBookClassification = async (isbnOrParams) => {
  const rawIsbn =
    typeof isbnOrParams === 'object' && isbnOrParams !== null
      ? (isbnOrParams?.isbn13 ?? isbnOrParams?.isbn)
      : isbnOrParams

  const normalizedIsbn = normalizeIsbn(rawIsbn)

  if (!normalizedIsbn) {
    throw new Error('분류정보 조회에 필요한 ISBN이 없습니다.')
  }

  const requestKey = normalizedIsbn

  const existingRequest = classificationInFlight.get(requestKey)

  if (existingRequest) {
    return existingRequest
  }

  const requestPromise = axios
    .get(
      `${API_SERVER}/external/books/` +
        `${encodeURIComponent(normalizedIsbn)}/classification`,
      {
        withCredentials: true,
        timeout: 45000,
      },
    )
    .then((response) => {
      return response.data || null
    })
    .catch((error) => {
      console.error('[externalBookApi] 정보나루 분류정보 조회 실패:', error)

      if (isTimeoutError(error)) {
        const timeoutError = new Error(
          '정보나루 분류정보 조회 시간이 초과되었습니다.',
        )

        timeoutError.code = 'CLASSIFICATION_TIMEOUT'

        timeoutError.cause = error

        throw timeoutError
      }

      throw error
    })
    .finally(() => {
      classificationInFlight.delete(requestKey)
    })

  classificationInFlight.set(requestKey, requestPromise)

  return requestPromise
}

export const searchLibrariesByBook = async ({
  isbn,
  isbn13,
  region = DEFAULT_LIBRARY_REGION,
  dtlRegion = DEFAULT_LIBRARY_DTL_REGION,
  pageNo = 1,
  pageSize = 20,
} = {}) => {
  const normalizedIsbn = normalizeIsbn(isbn ?? isbn13)

  if (!normalizedIsbn) {
    throw new Error('소장 도서관 조회에 필요한 ISBN이 없습니다.')
  }

  const requestedRegion = String(region ?? '').trim()

  const effectiveRegion =
    requestedRegion.toUpperCase() === 'ALL'
      ? 'ALL'
      : requestedRegion || DEFAULT_LIBRARY_REGION

  const requestedDtlRegion = String(dtlRegion ?? '').trim()

  const effectiveDtlRegion =
    effectiveRegion === DEFAULT_LIBRARY_REGION
      ? requestedDtlRegion || DEFAULT_LIBRARY_DTL_REGION
      : requestedDtlRegion

  try {
    const response = await axios.get(`${API_SERVER}/external/books/libraries`, {
      params: {
        isbn: normalizedIsbn,

        region: effectiveRegion,

        dtlRegion: effectiveDtlRegion || undefined,

        pageNo: Math.max(1, Number(pageNo) || 1),

        pageSize: Math.max(1, Number(pageSize) || 20),
      },

      withCredentials: true,
      timeout: 45000,
    })

    return Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('[externalBookApi] 소장 도서관 조회 실패:', error)

    if (isTimeoutError(error)) {
      const timeoutError = new Error('소장 도서관 조회 시간이 초과되었습니다.')

      timeoutError.code = 'LIBRARY_SEARCH_TIMEOUT'

      timeoutError.cause = error

      throw timeoutError
    }

    throw error
  }
}

// 특정 도서관의 도서 소장 및 대출 가능 여부 조회

export const checkBookExist = async ({ libCode, isbn13, isbn } = {}) => {
  const normalizedLibCode = String(libCode ?? '').trim()

  const normalizedIsbn = normalizeIsbn(isbn13 ?? isbn)

  if (!normalizedLibCode) {
    throw new Error('소장 여부 조회에 필요한 도서관 코드가 없습니다.')
  }

  if (!normalizedIsbn) {
    throw new Error('소장 여부 조회에 필요한 ISBN이 없습니다.')
  }

  try {
    const response = await axios.get(`${API_SERVER}/external/books/exist`, {
      params: {
        libCode: normalizedLibCode,

        isbn13: normalizedIsbn,
      },

      withCredentials: true,
      timeout: 45000,
    })

    return response.data
  } catch (error) {
    console.error('[externalBookApi] 도서 소장 여부 조회 실패:', error)

    if (isTimeoutError(error)) {
      const timeoutError = new Error(
        '도서 소장 여부 조회 시간이 초과되었습니다.',
      )

      timeoutError.code = 'BOOK_EXIST_TIMEOUT'

      timeoutError.cause = error

      throw timeoutError
    }

    throw error
  }
}

//일반 관리자용 도서 구매 판단 근거 조회

export const getBookPurchaseEvidence = async ({
  isbn13,
  isbn,
  requesterUserId,
} = {}) => {
  const normalizedIsbn = normalizeIsbn(isbn13 ?? isbn)

  const normalizedRequesterUserId = Number(requesterUserId)

  if (!normalizedIsbn) {
    throw new Error('구매 판단 근거 조회에 필요한 ISBN이 없습니다.')
  }

  if (
    !Number.isInteger(normalizedRequesterUserId) ||
    normalizedRequesterUserId <= 0
  ) {
    throw new Error('구매 판단 근거 조회에 필요한 관리자 번호가 없습니다.')
  }

  const requestKey = `${normalizedRequesterUserId}:` + normalizedIsbn

  const existingRequest = purchaseEvidenceInFlight.get(requestKey)

  if (existingRequest) {
    console.log(
      '[externalBookApi] 기존 구매 판단 근거 요청 재사용:',
      requestKey,
    )

    return existingRequest
  }

  const requestPromise = axios
    .get(
      `${API_SERVER}/admin/books/` +
        `${encodeURIComponent(normalizedIsbn)}/purchase-evidence`,
      {
        params: {
          requesterUserId: normalizedRequesterUserId,
        },

        withCredentials: true,

        timeout: 120000,
      },
    )
    .then((response) => {
      return response.data
    })
    .catch((error) => {
      console.error('[externalBookApi] 구매 판단 근거 조회 실패:', error)

      if (isTimeoutError(error)) {
        const timeoutError = new Error(
          '구매 판단 근거 조회 시간이 초과되었습니다. 잠시 후 다시 조회해주세요.',
        )

        timeoutError.code = 'PURCHASE_EVIDENCE_TIMEOUT'

        timeoutError.cause = error

        throw timeoutError
      }

      const requestError = new Error(
        extractErrorMessage(error, '구매 판단 근거를 불러오지 못했습니다.'),
      )

      requestError.status = error?.response?.status

      requestError.response = error?.response

      requestError.cause = error

      throw requestError
    })
    .finally(() => {
      purchaseEvidenceInFlight.delete(requestKey)
    })

  purchaseEvidenceInFlight.set(requestKey, requestPromise)

  return requestPromise
}

export default {
  searchExternalBooks,
  getExternalBookDetail,
  getData4LibraryBookClassification,
  searchLibrariesByBook,
  checkBookExist,
  getBookPurchaseEvidence,
}
