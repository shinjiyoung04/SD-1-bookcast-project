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
  timeout: 60000,
})

export const getAdminBookAiPopularity = async ({
  requesterUserId,
  isbn13,
  title,
  author,
  publisher,
  classNo,
  categoryName,
  force = false,
}) => {
  const normalizedUserId = Number(requesterUserId)
  const normalizedIsbn = String(isbn13 ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('AI 인기도 조회에 필요한 관리자 번호가 없습니다.')
  }

  if (!normalizedIsbn) {
    throw new Error('AI 인기도 조회에 필요한 ISBN이 없습니다.')
  }

  const response = await apiClient.post(
    `/admin/books/${normalizedIsbn}/ai-popularity`,
    {
      requesterUserId: normalizedUserId,
      title: String(title ?? '').trim(),
      author: String(author ?? '').trim(),
      publisher: String(publisher ?? '').trim(),
      classNo: String(classNo ?? '').trim(),
      categoryName: String(categoryName ?? '').trim(),
      force: Boolean(force),
    },
  )

  return response.data
}

export default {
  getAdminBookAiPopularity,
}
