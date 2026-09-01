import axios from 'axios'

const API_SERVER =
  import.meta.env.VITE_API_SERVER_URL ||
  'http://localhost:8080/api'

export const getManagedLibraryInfo = async ({
  requesterUserId,
  refresh = false,
}) => {
  if (!requesterUserId) {
    throw new Error('관리자 회원 번호가 필요합니다.')
  }

  try {
    const response = await axios.get(
      `${API_SERVER}/admin/managed-library-info`,
      {
        params: {
          requesterUserId,
          refresh,
        },
        withCredentials: true,
        timeout: 20000,
      },
    )

    return response.data
  } catch (error) {
    console.error(
      '[managedLibraryInfoApi] 담당 도서관 정보 조회 실패:',
      {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      },
    )

    throw error
  }
}

export default {
  getManagedLibraryInfo,
}
