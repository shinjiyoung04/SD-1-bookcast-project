import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
})

const requireValue = (value, message) => {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
}

const normalizeListArguments = (firstArgument, secondArgument) => {
  if (
    typeof firstArgument === 'object' &&
    firstArgument !== null &&
    !Array.isArray(firstArgument)
  ) {
    return {
      masterAdminId: firstArgument.masterAdminId,
      status: firstArgument.status ?? null,
    }
  }

  return {
    masterAdminId: firstArgument,
    status: secondArgument ?? null,
  }
}

const normalizeDecisionArguments = (
  firstArgument,
  secondArgument,
  thirdArgument,
) => {
  if (
    typeof firstArgument === 'object' &&
    firstArgument !== null &&
    !Array.isArray(firstArgument)
  ) {
    return {
      requestId: firstArgument.requestId,
      masterAdminId: firstArgument.masterAdminId,
      comment: firstArgument.comment ?? null,
    }
  }

  return {
    requestId: firstArgument,
    masterAdminId: secondArgument,
    comment: thirdArgument ?? null,
  }
}

const normalizeCancelArguments = (firstArgument, secondArgument) => {
  if (
    typeof firstArgument === 'object' &&
    firstArgument !== null &&
    !Array.isArray(firstArgument)
  ) {
    return {
      requestId: firstArgument.requestId,
      userId: firstArgument.userId,
    }
  }

  return {
    requestId: firstArgument,
    userId: secondArgument,
  }
}

// 관리자 등업 신청

export const createPromotionRequest = async (request) => {
  if (!request) {
    throw new Error('등업 신청 정보가 필요합니다.')
  }

  requireValue(request.userId, '회원 번호가 필요합니다.')

  try {
    const response = await apiClient.post('/promotions', request)

    return response.data
  } catch (error) {
    console.error('[promotionApi] 등업 신청 실패:', error)

    throw error
  }
}

// 본인의 현재 등업 신청 상태 조회

export const getMyPromotionRequest = async (userId) => {
  requireValue(userId, '회원 번호가 필요합니다.')

  try {
    const response = await apiClient.get('/promotions/me', {
      params: {
        userId,
      },
    })

    return response.data
  } catch (error) {
    console.error('[promotionApi] 내 등업 신청 조회 실패:', error)

    throw error
  }
}

//기존 코드 호환용 별칭

export const getMyLatestPromotionRequest = getMyPromotionRequest

export const getMyPromotion = getMyPromotionRequest

// 최고 관리자용 등업 신청 목록 조회

export const getPromotionRequests = async (firstArgument, secondArgument) => {
  const { masterAdminId, status } = normalizeListArguments(
    firstArgument,
    secondArgument,
  )

  requireValue(masterAdminId, '최고 관리자 회원 번호가 필요합니다.')

  const params = {
    masterAdminId,
  }

  if (status && status !== 'ALL') {
    params.status = status
  }

  try {
    const response = await apiClient.get('/promotions', {
      params,
    })

    return response.data
  } catch (error) {
    console.error('[promotionApi] 등업 신청 목록 조회 실패:', error)

    throw error
  }
}

//본인 등업 신청 취소

export const cancelPromotionRequest = async (firstArgument, secondArgument) => {
  const { requestId, userId } = normalizeCancelArguments(
    firstArgument,
    secondArgument,
  )

  requireValue(requestId, '등업 신청 번호가 필요합니다.')

  requireValue(userId, '회원 번호가 필요합니다.')

  try {
    const response = await apiClient.patch(
      `/promotions/${requestId}/cancel`,
      null,
      {
        params: {
          userId,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error('[promotionApi] 등업 신청 취소 실패:', error)

    throw error
  }
}

// 최고 관리자 등업 승인

export const approvePromotionRequest = async (
  firstArgument,
  secondArgument,
  thirdArgument,
) => {
  const { requestId, masterAdminId, comment } = normalizeDecisionArguments(
    firstArgument,
    secondArgument,
    thirdArgument,
  )

  requireValue(requestId, '등업 신청 번호가 필요합니다.')

  requireValue(masterAdminId, '최고 관리자 회원 번호가 필요합니다.')

  try {
    const response = await apiClient.patch(`/promotions/${requestId}/approve`, {
      masterAdminId,
      comment: comment?.trim() || '관리자 등업 승인',
    })

    return response.data
  } catch (error) {
    console.error('[promotionApi] 등업 신청 승인 실패:', error)

    throw error
  }
}

// 최고 관리자 등업 거절

export const rejectPromotionRequest = async (
  firstArgument,
  secondArgument,
  thirdArgument,
) => {
  const { requestId, masterAdminId, comment } = normalizeDecisionArguments(
    firstArgument,
    secondArgument,
    thirdArgument,
  )

  requireValue(requestId, '등업 신청 번호가 필요합니다.')

  requireValue(masterAdminId, '최고 관리자 회원 번호가 필요합니다.')

  if (!comment?.trim()) {
    throw new Error('거절 사유를 입력해주세요.')
  }

  try {
    const response = await apiClient.patch(`/promotions/${requestId}/reject`, {
      masterAdminId,
      comment: comment.trim(),
    })

    return response.data
  } catch (error) {
    console.error('[promotionApi] 등업 신청 거절 실패:', error)

    throw error
  }
}

// 기존 함수명 호환용 별칭

export const requestPromotion = createPromotionRequest

export const cancelPromotion = cancelPromotionRequest

export const approvePromotion = approvePromotionRequest

export const rejectPromotion = rejectPromotionRequest

export default {
  createPromotionRequest,
  requestPromotion,

  getMyPromotionRequest,
  getMyLatestPromotionRequest,
  getMyPromotion,

  getPromotionRequests,

  cancelPromotionRequest,
  cancelPromotion,

  approvePromotionRequest,
  approvePromotion,

  rejectPromotionRequest,
  rejectPromotion,
}
