import axios from 'axios'
import { API_BASE_URL } from '../config/apiConfig'

const prefix = `${API_BASE_URL}/member`

export const joinMember = async (formData) => {
  const response = await axios.post(`${prefix}/join`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}
export const loginMember = async (loginParam) => {
  const response = await axios.post(`${prefix}/login`, loginParam)
  return response.data
}

export const kakaoLogin = async (code) => {
  const response = await axios.post(`${prefix}/kakao`, { code })
  return response.data
}

export const kakaoJoin = async (code) => {
  const response = await axios.post(`${prefix}/kakao/join`, { code })
  return response.data
}
