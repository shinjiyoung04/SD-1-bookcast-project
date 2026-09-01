import axios from 'axios'

const API_SERVER =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

const normalizeIsbn = (isbn) => {
  return String(isbn ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
}

// 외부 API 도서 검색

export const searchExternalBooks = async ({ keyword, page = 0, size = 10 }) => {
  const res = await axios.get(`${API_SERVER}/books/external-search`, {
    params: {
      keyword,
      page,
      size,
    },
  })

  return res.data
}

// 내부 DB에서 ISBN 기준으로 도서 상세정보 조회

export const getBookByIsbn = async (isbn) => {
  const normalizedIsbn = normalizeIsbn(isbn)

  if (!normalizedIsbn) {
    throw new Error('도서 상세조회에 필요한 ISBN이 없습니다.')
  }

  const res = await axios.get(
    `${API_SERVER}/books/isbn/${encodeURIComponent(normalizedIsbn)}`,
  )

  return res.data
}

// 외부 API에서 검색한 도서를 내부 DB에 등록

export const importBook = async (bookData) => {
  const res = await axios.post(`${API_SERVER}/books/import`, bookData)

  return res.data
}
