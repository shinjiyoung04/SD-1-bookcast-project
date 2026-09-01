import axios from 'axios'

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api'

const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, '').endsWith('/api')
  ? RAW_API_BASE_URL.replace(/\/$/, '')
  : `${RAW_API_BASE_URL.replace(/\/$/, '')}/api`

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
})

const normalizeIsbn = (value) =>
  String(value ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
    .trim()

export const checkDuplicateHopeApplication = async ({
  userId,
  isbn,
  libraryId = null,
  libCode = '',
} = {}) => {
  const normalizedUserId = Number(userId)
  const normalizedIsbn = normalizeIsbn(isbn)
  const normalizedLibraryId = libraryId ? Number(libraryId) : null
  const normalizedLibCode = String(libCode ?? '').trim()

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('중복 신청 확인에 필요한 회원 번호가 없습니다.')
  }

  if (!normalizedIsbn) {
    throw new Error('중복 신청 확인에 필요한 ISBN이 없습니다.')
  }

  if (!normalizedLibraryId && !normalizedLibCode) {
    throw new Error('중복 신청 확인에 필요한 도서관 정보가 없습니다.')
  }

  try {
    const response = await apiClient.get('/applications/duplicate-check', {
      params: {
        userId: normalizedUserId,
        isbn: normalizedIsbn,
        libraryId: normalizedLibraryId || undefined,
        libCode: normalizedLibCode || undefined,
      },
    })

    return response.data
  } catch (error) {
    console.error(
      '[applicationDuplicateApi] 중복 희망도서 신청 확인 실패:',
      error,
    )
    console.error(
      '[applicationDuplicateApi] response status:',
      error?.response?.status,
    )
    console.error(
      '[applicationDuplicateApi] response data:',
      error?.response?.data,
    )

    throw error
  }
}

export default {
  checkDuplicateHopeApplication,
}
