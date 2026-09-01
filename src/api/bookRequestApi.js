import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

const requireValue = (value, message) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(message)
  }
}

export const searchRequestBooks = async ({
  provider = 'ALL',
  searchType = 'ALL',
  keyword,
  pageNo = 1,
  pageSize = 10,
}) => {
  const trimmedKeyword = keyword?.trim() || ''

  const params = {
    provider,

    keyword: '',
    title: '',
    author: '',
    isbn13: '',
    publisher: '',

    pageNo,
    pageSize,
  }

  switch (searchType) {
    case 'TITLE':
      params.title = trimmedKeyword
      break

    case 'AUTHOR':
      params.author = trimmedKeyword
      break

    case 'ISBN':
      params.isbn13 = trimmedKeyword.replaceAll('-', '')
      break

    case 'PUBLISHER':
      params.publisher = trimmedKeyword
      break

    case 'ALL':
    default:
      params.keyword = trimmedKeyword
      break
  }

  try {
    const response = await apiClient.get('/external/books', {
      params,
    })

    return Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('[bookRequestApi] 도서 검색 실패:', error)

    throw error
  }
}

// 정보나루 지역별 도서관 목록 조회

export const searchRequestLibraries = async ({
  dtlRegion,
  pageNo = 1,
  pageSize = 50,
}) => {
  try {
    const response = await apiClient.get('/external/libraries', {
      params: {
        pageNo,
        pageSize,

        region: '31',

        dtlRegion,
        dtl_region: dtlRegion,

        libName: '',
      },
    })

    return response.data
  } catch (error) {
    console.error('[bookRequestApi] 도서관 목록 조회 실패:', error)

    throw error
  }
}

// 선택한 도서관의 도서 소장 여부 확인

export const checkRequestBookExist = async ({ libCode, isbn13 }) => {
  requireValue(libCode, '도서관 코드가 필요합니다.')

  requireValue(isbn13, 'ISBN이 필요합니다.')

  try {
    const response = await apiClient.get('/external/books/exist', {
      params: {
        libCode,

        isbn13,

        // 기존 백엔드 파라미터 호환
        isbn: isbn13,
      },
    })

    return response.data
  } catch (error) {
    console.error('[bookRequestApi] 도서 소장 여부 확인 실패:', error)

    throw error
  }
}

// 정보나루 도서관을 내부 libraries 테이블과 연결

export const resolveRequestLibrary = async ({
  libCode,
  libraryName,
  address = null,
  phone = null,
}) => {
  requireValue(libCode, '도서관 코드가 필요합니다.')

  requireValue(libraryName, '도서관명이 필요합니다.')

  try {
    const response = await apiClient.post('/application-libraries/resolve', {
      libraryCode: String(libCode).trim(),

      libraryName: String(libraryName).trim(),

      address: address?.trim() || null,

      phone: phone?.trim() || null,
    })

    if (!response.data?.libraryId) {
      throw new Error('내부 도서관 번호를 받지 못했습니다.')
    }

    return response.data
  } catch (error) {
    console.error('[bookRequestApi] 신청 도서관 연결 실패:', error)

    throw error
  }
}

//희망도서 신청

export const createHopeApplication = async (requestData) => {
  if (!requestData) {
    throw new Error('희망도서 신청 정보가 없습니다.')
  }

  requireValue(requestData.userId, '회원 번호가 필요합니다.')

  requireValue(requestData.libCode, '신청 도서관 코드가 필요합니다.')

  requireValue(requestData.libraryName, '신청 도서관명이 필요합니다.')

  requireValue(requestData.isbn, 'ISBN이 필요합니다.')

  requireValue(requestData.title, '도서명이 필요합니다.')

  requireValue(requestData.reason, '신청 사유가 필요합니다.')

  try {
    const resolvedLibrary = await resolveRequestLibrary({
      libCode: requestData.libCode,

      libraryName: requestData.libraryName,

      address: requestData.libraryAddress,

      phone: requestData.libraryPhone,
    })

    const payload = {
      ...requestData,

      libraryId: resolvedLibrary.libraryId,

      libCode: resolvedLibrary.libraryCode,

      libraryName: resolvedLibrary.libraryName,

      libraryAddress:
        resolvedLibrary.address || requestData.libraryAddress || null,

      libraryPhone: resolvedLibrary.phone || requestData.libraryPhone || null,
    }

    console.log('[bookRequestApi] 내부 도서관 연결 완료:', {
      libraryId: payload.libraryId,

      libCode: payload.libCode,

      libraryName: payload.libraryName,
    })

    const response = await apiClient.post('/applications', payload)

    return response.data
  } catch (error) {
    console.error('[bookRequestApi] 희망도서 신청 실패:', error)

    throw error
  }
}

export default {
  searchRequestBooks,
  searchRequestLibraries,
  checkRequestBookExist,
  resolveRequestLibrary,
  createHopeApplication,
}
