import axios from 'axios'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
})

export const PROFILE_VERIFICATION_KEY = 'bookcast-profile-verification'

const validateUserId = (userId) => {
  if (userId === null || userId === undefined || userId === '') {
    throw new Error('회원 번호가 필요합니다.')
  }
}

const validatePassword = (password) => {
  if (password === null || password === undefined || password === '') {
    throw new Error('비밀번호를 입력해주세요.')
  }
}

export const verifyMemberPassword = async ({ userId, password }) => {
  validateUserId(userId)
  validatePassword(password)

  try {
    const response = await apiClient.post(
      `/member-account/${userId}/verify-password`,
      {
        password,
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 비밀번호 확인 실패:', error)

    throw error
  }
}

export const getMemberProfileForEdit = async ({
  userId,
  verificationToken,
}) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  try {
    const response = await apiClient.get(`/member-account/${userId}`, {
      headers: {
        'X-Profile-Verification': verificationToken,
      },
    })

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 회원정보 조회 실패:', error)

    throw error
  }
}

export const getEditableLibraries = async ({ userId, verificationToken }) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  try {
    const response = await apiClient.get(
      `/member-account/${userId}/libraries`,
      {
        headers: {
          'X-Profile-Verification': verificationToken,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 도서관 목록 조회 실패:', error)

    throw error
  }
}

export const updateMemberProfile = async ({
  userId,
  verificationToken,
  profile,
}) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  if (!profile) {
    throw new Error('수정할 회원정보가 없습니다.')
  }

  try {
    const response = await apiClient.patch(
      `/member-account/${userId}`,
      {
        name: profile.name,

        nickname: profile.nickname || null,

        email: profile.email,

        address: profile.address || null,

        birthDate: profile.birthDate || null,

        gender: profile.gender || null,

        managedLibraryCode: profile.managedLibraryCode || null,

        managedLibraryName: profile.managedLibraryName || null,

        managedLibraryAddress: profile.managedLibraryAddress || null,

        managedLibraryPhone: profile.managedLibraryPhone || null,
      },
      {
        headers: {
          'X-Profile-Verification': verificationToken,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 회원정보 수정 실패:', error)

    throw error
  }
}

export const uploadMemberProfileImage = async ({
  userId,
  verificationToken,
  file,
}) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  if (!(file instanceof File)) {
    throw new Error('업로드할 이미지 파일을 선택해주세요.')
  }

  const formData = new FormData()

  formData.append('file', file)

  try {
    const response = await apiClient.post(
      `/member-account/${userId}/profile-image`,
      formData,
      {
        headers: {
          'X-Profile-Verification': verificationToken,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 프로필 이미지 업로드 실패:', error)

    throw error
  }
}

export const deleteMemberProfileImage = async ({
  userId,
  verificationToken,
}) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  try {
    const response = await apiClient.delete(
      `/member-account/${userId}/profile-image`,
      {
        headers: {
          'X-Profile-Verification': verificationToken,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 프로필 이미지 삭제 실패:', error)

    throw error
  }
}

export const withdrawMemberAccount = async ({
  userId,
  verificationToken,
  password,
}) => {
  validateUserId(userId)

  if (!verificationToken) {
    throw new Error('비밀번호 확인 정보가 없습니다.')
  }

  validatePassword(password)

  try {
    const response = await apiClient.patch(
      `/member-account/${userId}/withdraw`,
      {
        verificationToken,
        password,
      },
    )

    return response.data
  } catch (error) {
    console.error('[memberAccountApi] 회원탈퇴 실패:', error)

    throw error
  }
}

export const saveProfileVerification = ({
  userId,
  verificationToken,
  expiresAt,
}) => {
  validateUserId(userId)

  if (!verificationToken || !expiresAt) {
    throw new Error('저장할 인증 정보가 올바르지 않습니다.')
  }

  sessionStorage.setItem(
    PROFILE_VERIFICATION_KEY,
    JSON.stringify({
      userId: Number(userId),
      verificationToken,
      expiresAt,
    }),
  )
}

export const readProfileVerification = (expectedUserId) => {
  try {
    const rawData = sessionStorage.getItem(PROFILE_VERIFICATION_KEY)

    if (!rawData) {
      return null
    }

    const verificationData = JSON.parse(rawData)

    if (Number(verificationData.userId) !== Number(expectedUserId)) {
      clearProfileVerification()
      return null
    }

    if (!verificationData.verificationToken || !verificationData.expiresAt) {
      clearProfileVerification()
      return null
    }

    const expirationTime = new Date(verificationData.expiresAt).getTime()

    if (Number.isNaN(expirationTime) || expirationTime <= Date.now()) {
      clearProfileVerification()
      return null
    }

    return verificationData
  } catch (error) {
    console.error('[memberAccountApi] 인증 정보 확인 실패:', error)

    clearProfileVerification()
    return null
  }
}

export const clearProfileVerification = () => {
  sessionStorage.removeItem(PROFILE_VERIFICATION_KEY)
}

export const getMemberAccountErrorMessage = (
  error,
  fallbackMessage = '요청 처리 중 오류가 발생했습니다.',
) => {
  const responseData = error?.response?.data

  if (typeof responseData === 'string') {
    return responseData
  }

  return (
    responseData?.message ||
    responseData?.detail ||
    responseData?.error ||
    error?.message ||
    fallbackMessage
  )
}

export default {
  verifyMemberPassword,
  getMemberProfileForEdit,
  getEditableLibraries,
  updateMemberProfile,
  uploadMemberProfileImage,
  deleteMemberProfileImage,
  withdrawMemberAccount,
  saveProfileVerification,
  readProfileVerification,
  clearProfileVerification,
  getMemberAccountErrorMessage,
}
