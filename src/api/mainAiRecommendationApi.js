import axios from 'axios'

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api'

const API_BASE_URL = RAW_API_BASE_URL
  .replace(/\/+$/, '')
  .endsWith('/api')
  ? RAW_API_BASE_URL.replace(/\/+$/, '')
  : `${RAW_API_BASE_URL.replace(/\/+$/, '')}/api`

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 120000,
})

export const getMainAiRecommendedBooks = async ({
  candidates,
  limit = 5,
  force = false,
}) => {
  const normalizedCandidates = Array.isArray(candidates)
    ? candidates
        .filter((book) => book?.isbn13)
        .slice(0, 20)
        .map((book) => ({
          isbn13: String(book.isbn13 ?? '')
            .replace(/[^0-9Xx]/g, '')
            .toUpperCase(),

          title: String(book.title ?? '').trim(),

          author: String(book.author ?? '').trim(),

          publisher: String(book.publisher ?? '').trim(),

          classNo: String(
            book.classNo ??
              book.className ??
              '',
          ).trim(),

          categoryName: String(
            book.categoryName ??
              book.className ??
              '',
          ).trim(),

          imageUrl: String(book.imageUrl ?? '').trim(),

          loanCount: Number(book.loanCount ?? 0) || 0,

          rank: Number(book.rank ?? 0) || 0,

          dataStartDate: book.dataStartDate ?? null,

          dataEndDate: book.dataEndDate ?? null,
        }))
    : []

  if (normalizedCandidates.length === 0) {
    return []
  }

  const response = await apiClient.post(
    '/main/ai-recommendations',
    {
      candidates: normalizedCandidates,
      limit: Math.max(1, Math.min(5, Number(limit) || 5)),
      force: Boolean(force),
    },
  )

  return Array.isArray(response.data)
    ? response.data
    : []
}

export default {
  getMainAiRecommendedBooks,
}
