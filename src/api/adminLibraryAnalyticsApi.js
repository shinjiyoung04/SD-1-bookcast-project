import axios from 'axios'

const API_SERVER =
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'

export const getManagedLibraryAnalytics =
  async ({
    requesterUserId,
    refresh = false,
  }) => {
    if (!requesterUserId) {
      throw new Error(
        '관리자 회원 번호가 필요합니다.',
      )
    }

    try {
      const response =
        await axios.get(
          `${API_SERVER}/admin/library-analytics`,
          {
            params: {
              requesterUserId,
              refresh,
            },
            withCredentials: true,
            timeout: 180000,
          },
        )

      return response.data
    } catch (error) {
      console.error(
        '[adminLibraryAnalyticsApi] 담당 도서관 운영 분석 조회 실패:',
        {
          status:
            error.response?.status,
          data:
            error.response?.data,
          message:
            error.message,
        },
      )

      throw error
    }
  }

export default {
  getManagedLibraryAnalytics,
}
