import axios from 'axios'

const API_SERVER = 'http://localhost:8080/api'

export const registerUser = async (formData) => {
  const res = await axios.post(`${API_SERVER}/users/register`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return res.data
}

export const loginUser = async (loginData) => {
  const res = await axios.post(`${API_SERVER}/users/login`, loginData)
  return res.data
}

export const kakaoLogin = async (code) => {
  const res = await axios.post(`${API_SERVER}/users/kakao/login`, {
    code,
  })

  return res.data
}
