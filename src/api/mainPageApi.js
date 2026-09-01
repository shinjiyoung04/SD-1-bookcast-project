import axios from 'axios'

const API_SERVER =
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'

const POPULAR_CACHE_KEY =
  'bookcast_main_popular_books_cache'

const HOT_TREND_CACHE_KEY =
  'bookcast_main_hot_trend_books_cache'

const CACHE_MAX_AGE_MS =
  24 * 60 * 60 * 1000

const inFlightRequests = new Map()

const readCache = (key) => {
  try {
    const value = localStorage.getItem(key)

    if (!value) {
      return []
    }

    const parsed = JSON.parse(value)
    const savedAt = Number(parsed?.savedAt)
    const items = Array.isArray(parsed?.items)
      ? parsed.items
      : []

    if (
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > CACHE_MAX_AGE_MS
    ) {
      return []
    }

    return items
  } catch (error) {
    console.warn(
      '[mainPageApi] 캐시 읽기 실패:',
      error,
    )

    return []
  }
}

const saveCache = (key, items) => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        items,
      }),
    )
  } catch (error) {
    console.warn(
      '[mainPageApi] 캐시 저장 실패:',
      error,
    )
  }
}

const requestList = ({
  requestKey,
  url,
  params,
  cacheKey,
  label,
}) => {
  const existingRequest =
    inFlightRequests.get(requestKey)

  if (existingRequest) {
    return existingRequest
  }

  const requestPromise = axios
    .get(url, {
      params,
      withCredentials: true,
      timeout: 45000,
    })
    .then((response) => {
      const items = Array.isArray(response.data)
        ? response.data
        : []

      if (items.length > 0) {
        saveCache(cacheKey, items)
      }

      return items
    })
    .catch((error) => {
      const cachedItems = readCache(cacheKey)

      if (cachedItems.length > 0) {
        console.warn(
          `[mainPageApi] ${label} 실시간 조회 실패로 이전 데이터를 사용합니다.`,
          error,
        )

        return cachedItems
      }

      console.error(
        `[mainPageApi] ${label} 조회 실패:`,
        error,
      )

      throw error
    })
    .finally(() => {
      inFlightRequests.delete(requestKey)
    })

  inFlightRequests.set(
    requestKey,
    requestPromise,
  )

  return requestPromise
}

export const getMainPopularBooks = async ({
  limit = 20,
} = {}) => {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 20, 20),
  )

  return requestList({
    requestKey: `popular:${safeLimit}`,
    url: `${API_SERVER}/main/popular-books`,
    params: {
      limit: safeLimit,
    },
    cacheKey: POPULAR_CACHE_KEY,
    label: '메인 인기대출 도서',
  })
}

export const getMainHotTrendBooks = async ({
  limit = 15,
} = {}) => {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 15, 15),
  )

  return requestList({
    requestKey: `hot-trend:${safeLimit}`,
    url: `${API_SERVER}/main/hot-trend-books`,
    params: {
      limit: safeLimit,
    },
    cacheKey: HOT_TREND_CACHE_KEY,
    label: '대출 급상승 도서',
  })
}

export default {
  getMainPopularBooks,
  getMainHotTrendBooks,
}
