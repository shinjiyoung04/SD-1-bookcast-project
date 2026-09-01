import axios from 'axios'

const API_SERVER = 'http://localhost:8080/api'

export const getMyApplications = async (userId) => {
  if (!userId) {
    throw new Error('신청 목록을 조회할 사용자 ID가 없습니다.')
  }

  const response = await axios.get(
    `${API_SERVER}/applications/user/${userId}`,
    {
      withCredentials: true,
    },
  )

  return response.data
}
