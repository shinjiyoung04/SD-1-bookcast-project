import axios from 'axios'

const RAW_API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api'

const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '').endsWith('/api')
  ? RAW_API_BASE_URL.replace(/\/+$/, '')
  : `${RAW_API_BASE_URL.replace(/\/+$/, '')}/api`

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

export const getCitizenVoteApplications = async ({
  userId,
  keyword = '',
  status = 'ALL',
  sort = 'POPULAR',
  page = 1,
  pageSize = 12,
}) => {
  const response = await apiClient.get('/citizen-votes', {
    params: {
      userId,
      keyword: String(keyword ?? '').trim(),
      status,
      sort,
      page,
      pageSize,
    },
  })

  return response.data
}

export const getCitizenVoteDetail = async ({
  requesterUserId,
  applicationId,
}) => {
  const normalizedUserId = Number(requesterUserId)
  const normalizedApplicationId = Number(applicationId)

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('시민투표 상세 조회에 필요한 회원 번호가 없습니다.')
  }

  if (
    !Number.isInteger(normalizedApplicationId) ||
    normalizedApplicationId <= 0
  ) {
    throw new Error('시민투표 상세 조회에 필요한 신청 번호가 없습니다.')
  }

  const response = await apiClient.get(
    `/citizen-votes/${normalizedApplicationId}/detail`,
    {
      params: {
        requesterUserId: normalizedUserId,
      },
    },
  )

  return response.data
}

export const requestCitizenVotePrediction = async ({
  requesterUserId,
  applicationId,
  force = false,
}) => {
  const normalizedUserId = Number(requesterUserId)
  const normalizedApplicationId = Number(applicationId)

  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('AI 예측에 필요한 회원 번호가 없습니다.')
  }

  if (
    !Number.isInteger(normalizedApplicationId) ||
    normalizedApplicationId <= 0
  ) {
    throw new Error('AI 예측에 필요한 신청 번호가 없습니다.')
  }

  const response = await apiClient.post(
    `/citizen-votes/${normalizedApplicationId}/predict`,
    null,
    {
      params: {
        requesterUserId: normalizedUserId,
        force,
      },

      // 정보나루 KDC 조회와 FastAPI 추론 시간을 함께 고려합니다.
      timeout: 60000,
    },
  )

  return response.data
}

export const toggleCitizenVote = async ({ applicationId, userId }) => {
  const response = await apiClient.post(
    `/citizen-votes/${applicationId}/toggle`,
    { userId },
  )

  return response.data
}

export const cancelCitizenVoteApplication = async ({
  requesterUserId,
  applicationId,
}) => {
  const response = await apiClient.patch(
    `/citizen-votes/${applicationId}/cancel`,
    null,
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

export const getAdminCitizenVoteApplications = async ({
  requesterUserId,
  keyword = '',
  status = 'ALL',
  sort = 'POPULAR',
  libraryId = '',
  page = 1,
  pageSize = 9,
}) => {
  const response = await apiClient.get('/citizen-votes/admin', {
    params: {
      requesterUserId,
      keyword: String(keyword ?? '').trim(),
      status,
      sort,
      libraryId: libraryId || undefined,
      page,
      pageSize,
    },
  })

  return response.data
}

export const getAdminCitizenVoteDetail = async ({
  requesterUserId,
  applicationId,
}) => {
  const response = await apiClient.get(
    `/citizen-votes/admin/${applicationId}`,
    {
      params: {
        requesterUserId,
      },
    },
  )

  return response.data
}

export const getAdminCitizenVoteLibraries = async ({ requesterUserId }) => {
  const response = await apiClient.get('/citizen-votes/admin/libraries', {
    params: {
      requesterUserId,
    },
  })

  return Array.isArray(response.data) ? response.data : []
}

export default {
  getCitizenVoteApplications,
  getCitizenVoteDetail,
  requestCitizenVotePrediction,
  toggleCitizenVote,
  cancelCitizenVoteApplication,
  getAdminCitizenVoteApplications,
  getAdminCitizenVoteDetail,
  getAdminCitizenVoteLibraries,
}
