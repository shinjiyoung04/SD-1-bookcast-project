import axios from 'axios'

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api'

const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '').endsWith('/api')
  ? RAW_API_BASE_URL.replace(/\/+$/, '')
  : `${RAW_API_BASE_URL.replace(/\/+$/, '')}/api`

export const BOOK_HISTORY_UPDATED_EVENT = 'bookcast-recent-books-updated'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

const requirePositiveUserId = (value) => {
  const number = Number(value)

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('유효한 회원 번호가 필요합니다.')
  }

  return number
}

const normalizeIsbn = (value) =>
  String(value ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
    .trim()

const normalizeRecentBook = (item) => ({
  bookId: item?.bookId ?? item?.book_id ?? null,
  isbn: normalizeIsbn(item?.isbn ?? item?.isbn13 ?? item?.isbn_13),
  title: item?.title ?? '도서 제목 없음',
  author: item?.author ?? '저자 정보 없음',
  publisher: item?.publisher ?? '',
  thumbnailUrl:
    item?.thumbnailUrl ??
    item?.thumbnail_url ??
    item?.imageUrl ??
    item?.image_url ??
    '',
  viewedAt: item?.viewedAt ?? item?.viewed_at ?? null,
})

const normalizeRecentBooks = (data) =>
  Array.isArray(data)
    ? data
        .map(normalizeRecentBook)
        .filter((item) => item.isbn)
        .slice(0, 5)
    : []

const dispatchHistoryUpdated = (books) => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(BOOK_HISTORY_UPDATED_EVENT, {
      detail: {
        books,
      },
    }),
  )
}

export const recordBookView = async ({
  userId,
  isbn,
  title,
  author,
  publisher,
  thumbnailUrl,
  limit = 5,
} = {}) => {
  const normalizedUserId = requirePositiveUserId(userId)

  const normalizedIsbn = normalizeIsbn(isbn)

  if (!normalizedIsbn) {
    throw new Error('ISBN이 필요합니다.')
  }

  const response = await apiClient.post(
    '/book-history/view',
    {
      isbn: normalizedIsbn,
      title: title || '도서 제목 없음',
      author: author || '저자 정보 없음',
      publisher: publisher || null,
      thumbnailUrl: thumbnailUrl || null,
    },
    {
      params: {
        userId: normalizedUserId,
        limit: Math.max(1, Math.min(Number(limit) || 5, 5)),
      },
    },
  )

  const books = normalizeRecentBooks(response.data)

  dispatchHistoryUpdated(books)

  return books
}

export const getRecentViewedBooks = async ({ userId, limit = 5 } = {}) => {
  const normalizedUserId = requirePositiveUserId(userId)

  const response = await apiClient.get('/book-history/recent', {
    params: {
      userId: normalizedUserId,
      limit: Math.max(1, Math.min(Number(limit) || 5, 5)),
    },
  })

  return normalizeRecentBooks(response.data)
}

export default {
  recordBookView,
  getRecentViewedBooks,
}
