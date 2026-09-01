import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

const requireValue = (value, message) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    throw new Error(message)
  }
}

const normalizeReview = (review) => ({
  ...review,
  id: review?.reviewId ?? review?.id,
  score: Number(review?.score ?? review?.rating ?? 0),
  nickname:
    review?.nickname ??
    review?.writer ??
    review?.name ??
    '사용자',
})

export const getBookUserState = async ({
  userId,
  isbn,
}) => {
  requireValue(isbn, 'ISBN이 필요합니다.')

  const response = await apiClient.get(
    `/books/${isbn}/user-state`,
    {
      params: userId
        ? { userId }
        : {},
    },
  )

  return response.data
}

export const likeBook = async ({
  userId,
  isbn,
  title,
  author,
  publisher,
  thumbnailUrl,
}) => {
  requireValue(userId, '회원 번호가 필요합니다.')
  requireValue(isbn, 'ISBN이 필요합니다.')
  requireValue(title, '도서명이 필요합니다.')
  requireValue(author, '저자명이 필요합니다.')

  const response = await apiClient.post(
    `/books/${isbn}/like`,
    {
      title,
      author,
      publisher: publisher || null,
      thumbnailUrl: thumbnailUrl || null,
    },
    {
      params: { userId },
    },
  )

  return response.data
}

export const unlikeBook = async ({
  userId,
  isbn,
}) => {
  requireValue(userId, '회원 번호가 필요합니다.')
  requireValue(isbn, 'ISBN이 필요합니다.')

  const response = await apiClient.delete(
    `/books/${isbn}/like`,
    {
      params: { userId },
    },
  )

  return response.data
}

export const addBookWishlist = async ({
  userId,
  isbn,
  title,
  author,
  publisher,
  thumbnailUrl,
}) => {
  requireValue(userId, '회원 번호가 필요합니다.')
  requireValue(isbn, 'ISBN이 필요합니다.')
  requireValue(title, '도서명이 필요합니다.')
  requireValue(author, '저자명이 필요합니다.')

  const response = await apiClient.post(
    `/books/${isbn}/wishlist`,
    {
      title,
      author,
      publisher: publisher || null,
      thumbnailUrl: thumbnailUrl || null,
    },
    {
      params: { userId },
    },
  )

  return response.data
}

export const removeBookWishlist = async ({
  userId,
  isbn,
}) => {
  requireValue(userId, '회원 번호가 필요합니다.')
  requireValue(isbn, 'ISBN이 필요합니다.')

  const response = await apiClient.delete(
    `/books/${isbn}/wishlist`,
    {
      params: { userId },
    },
  )

  return response.data
}

export const getBookReviews = async (isbn) => {
  requireValue(isbn, 'ISBN이 필요합니다.')

  const response = await apiClient.get(
    `/books/${isbn}/reviews`,
  )

  return Array.isArray(response.data)
    ? response.data.map(normalizeReview)
    : []
}

export const createBookReview = async ({
  userId,
  isbn,
  score,
  content,
  title,
  author,
  publisher,
  thumbnailUrl,
}) => {
  requireValue(userId, '회원 번호가 필요합니다.')
  requireValue(isbn, 'ISBN이 필요합니다.')
  requireValue(content, '리뷰 내용을 입력해주세요.')
  requireValue(title, '도서명이 필요합니다.')
  requireValue(author, '저자명이 필요합니다.')

  const response = await apiClient.post(
    `/books/${isbn}/reviews`,
    {
      score: Number(score),
      content,
      title,
      author,
      publisher: publisher || null,
      thumbnailUrl: thumbnailUrl || null,
    },
    {
      params: { userId },
    },
  )

  return normalizeReview(response.data)
}

export const getMyLikedBooks = async (userId) => {
  requireValue(userId, '회원 번호가 필요합니다.')

  const response = await apiClient.get(
    `/member-activity/${userId}/liked-books`,
  )

  return Array.isArray(response.data)
    ? response.data
    : []
}

export const getMyVotedApplications = async (userId) => {
  requireValue(userId, '회원 번호가 필요합니다.')

  const response = await apiClient.get(
    `/member-activity/${userId}/voted-applications`,
  )

  return Array.isArray(response.data)
    ? response.data
    : []
}

export default {
  getBookUserState,
  likeBook,
  unlikeBook,
  addBookWishlist,
  removeBookWishlist,
  getBookReviews,
  createBookReview,
  getMyLikedBooks,
  getMyVotedApplications,
}
