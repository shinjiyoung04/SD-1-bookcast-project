import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import { kakaoLogin, loginUser } from '../../api/userApi'
import useMemberStore from '../../store/useMemberStore'
import AlertModal from '../../components/common/AlertModal'

const KAKAO_REST_API_KEY = '436471f21ed42c695529f935449baaa4'
const KAKAO_REDIRECT_URI = 'http://localhost:5173/member/login'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login } = useMemberStore()

  const [loginParam, setLoginParam] = useState({
    loginId: '',
    password: '',
  })

  const [modal, setModal] = useState({
    open: false,
    type: 'info',
    message: '',
    callbackFn: null,
  })

  const openModal = (type, message, callbackFn = null) => {
    setModal({
      open: true,
      type,
      message,
      callbackFn,
    })
  }

  const closeModal = () => {
    const callback = modal.callbackFn

    setModal({
      open: false,
      type: 'info',
      message: '',
      callbackFn: null,
    })

    if (callback) {
      callback()
    }
  }

  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get('code')

    if (!code) return

    const requestKakaoLogin = async () => {
      try {
        const data = await kakaoLogin(code)

        login(data)

        window.history.replaceState({}, document.title, '/member/login')

        if (data.newUser) {
          openModal('success', '카카오 회원가입 후 로그인되었습니다.', () =>
            navigate('/'),
          )
        } else {
          openModal('success', '카카오 로그인되었습니다.', () => navigate('/'))
        }
      } catch (error) {
        console.log('카카오 로그인 실패:', error)
        console.log('응답 데이터:', error.response?.data)

        window.history.replaceState({}, document.title, '/member/login')

        openModal('error', '카카오 로그인에 실패했습니다.')
      }
    }

    requestKakaoLogin()
  }, [login, navigate])

  const handleChange = (e) => {
    setLoginParam({
      ...loginParam,
      [e.target.name]: e.target.value,
    })
  }

  const handleClickLogin = async () => {
    if (!loginParam.loginId || !loginParam.password) {
      openModal('info', '아이디와 비밀번호를 입력해주세요.')
      return
    }

    try {
      const data = await loginUser(loginParam)

      login(data)

      openModal('success', '로그인되었습니다.', () => navigate('/'))
    } catch (error) {
      console.log('로그인 실패:', error)
      console.log('응답 데이터:', error.response?.data)

      openModal('error', '아이디 또는 비밀번호를 확인해주세요.')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return

    e.preventDefault()
    handleClickLogin()
  }

  const handleClickCancel = () => {
    navigate('/')
  }

  const handleClickKakao = () => {
    const kakaoAuthUrl =
      `https://kauth.kakao.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${KAKAO_REST_API_KEY}` +
      `&redirect_uri=${KAKAO_REDIRECT_URI}` +
      `&scope=profile_nickname,profile_image,account_email`

    window.location.href = kakaoAuthUrl
  }

  return (
    <BasicLayout>
      {modal.open && (
        <AlertModal
          type={modal.type}
          message={modal.message}
          onClose={closeModal}
        />
      )}

      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="border-2 border-black bg-white p-8 shadow-[6px_6px_0_0] shadow-black">
          <h2 className="text-3xl font-black text-black">로그인</h2>

          <div className="mt-8 space-y-6" onKeyDown={handleKeyDown}>
            <label htmlFor="loginId" className="block text-black">
              <span className="text-sm font-semibold">ID</span>

              <input
                type="text"
                id="loginId"
                name="loginId"
                value={loginParam.loginId}
                onChange={handleChange}
                placeholder="아이디를 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <label htmlFor="password" className="block text-black">
              <span className="text-sm font-semibold">Password</span>

              <input
                type="password"
                id="password"
                name="password"
                value={loginParam.password}
                onChange={handleChange}
                placeholder="비밀번호를 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <div className="flex flex-wrap gap-4 pt-4">
              <button
                type="button"
                onClick={handleClickCancel}
                className="border-2 border-black bg-white px-5 py-3 font-semibold text-black shadow-[4px_4px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none focus:ring-2 focus:ring-yellow-300 focus:outline-0"
              >
                취소
              </button>

              <button
                type="button"
                onClick={handleClickLogin}
                className="border-2 border-black bg-yellow-200 px-5 py-3 font-semibold text-black shadow-[4px_4px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none focus:ring-2 focus:ring-yellow-300 focus:outline-0"
              >
                로그인
              </button>

              <button
                type="button"
                onClick={handleClickKakao}
                className="ml-auto border-2 border-black bg-yellow-300 px-5 py-3 font-semibold text-black shadow-[4px_4px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none focus:ring-2 focus:ring-yellow-300 focus:outline-0"
              >
                카카오로 로그인
              </button>
            </div>

            <p className="pt-2 text-sm text-gray-500">
              아직 회원이 아니신가요?{' '}
              <Link
                to="/member/join"
                className="font-bold text-teal-600 hover:text-teal-700"
              >
                회원가입
              </Link>
            </p>
          </div>
        </div>
      </div>
    </BasicLayout>
  )
}

export default LoginPage
