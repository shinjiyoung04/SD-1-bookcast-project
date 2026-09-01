import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerUser } from '../../api/userApi'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
const KAKAO_REST_API_KEY = '436471f21ed42c695529f935449baaa4'
const KAKAO_REDIRECT_URI = 'http://localhost:5173/member/login'

const JoinPage = () => {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    loginId: '',
    password: '',
    passwordCheck: '',
    name: '',
    nickname: '',
    email: '',
    role: 'USER',
  })

  const [profileImage, setProfileImage] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')

  const [modal, setModal] = useState({
    open: false,
    type: 'info',
    message: '',
    callbackFn: null,
  })

  const handleClickKakaoJoin = () => {
    const kakaoAuthUrl =
      `https://kauth.kakao.com/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${KAKAO_REST_API_KEY}` +
      `&redirect_uri=${KAKAO_REDIRECT_URI}`

    window.location.href = kakaoAuthUrl
  }

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

  const handleChange = (e) => {
    const { name, value } = e.target

    setForm({
      ...form,
      [name]: value,
    })
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0]

    if (!file) {
      setProfileImage(null)
      setPreviewUrl('')
      return
    }

    if (!file.type.startsWith('image/')) {
      openModal('error', '이미지 파일만 선택할 수 있습니다.')
      e.target.value = ''
      return
    }

    setProfileImage(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const validateForm = () => {
    if (!form.loginId.trim()) {
      openModal('info', '아이디를 입력해주세요.')
      return false
    }

    if (!form.password.trim()) {
      openModal('info', '비밀번호를 입력해주세요.')
      return false
    }

    if (form.password !== form.passwordCheck) {
      openModal('error', '비밀번호가 일치하지 않습니다.')
      return false
    }

    if (!form.name.trim()) {
      openModal('info', '이름을 입력해주세요.')
      return false
    }

    if (!form.nickname.trim()) {
      openModal('info', '닉네임을 입력해주세요.')
      return false
    }

    if (!form.email.trim()) {
      openModal('info', '이메일을 입력해주세요.')
      return false
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) return

    const formData = new FormData()

    formData.append('loginId', form.loginId)
    formData.append('password', form.password)
    formData.append('name', form.name)
    formData.append('nickname', form.nickname)
    formData.append('email', form.email)
    formData.append('role', form.role)

    if (profileImage) {
      formData.append('profileImage', profileImage)
    }

    try {
      await registerUser(formData)

      openModal('success', '회원가입이 완료되었습니다.', () => {
        navigate('/member/login')
      })
    } catch (err) {
      console.error(err)
      console.log('응답 데이터:', err.response?.data)

      openModal(
        'error',
        err.response?.data?.message || '회원가입에 실패했습니다.',
      )
    }
  }

  const handleClickCancel = () => {
    navigate('/')
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
          <h2 className="text-3xl font-black text-black">회원가입</h2>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-gray-100 shadow-[4px_4px_0_0] shadow-black">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="프로필 미리보기"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-gray-500">
                    No Image
                  </span>
                )}
              </div>

              <label className="block flex-1 text-black">
                <span className="text-sm font-semibold">Profile Image</span>

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 text-sm shadow-[4px_4px_0_0] shadow-black file:mr-4 file:border-0 file:bg-yellow-200 file:px-3 file:py-1 file:font-semibold"
                />
              </label>
            </div>

            <label htmlFor="loginId" className="block text-black">
              <span className="text-sm font-semibold">ID</span>

              <input
                type="text"
                id="loginId"
                name="loginId"
                value={form.loginId}
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
                value={form.password}
                onChange={handleChange}
                placeholder="비밀번호를 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <label htmlFor="passwordCheck" className="block text-black">
              <span className="text-sm font-semibold">Password Check</span>

              <input
                type="password"
                id="passwordCheck"
                name="passwordCheck"
                value={form.passwordCheck}
                onChange={handleChange}
                placeholder="비밀번호를 다시 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <label htmlFor="name" className="block text-black">
              <span className="text-sm font-semibold">Name</span>

              <input
                type="text"
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="이름을 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <label htmlFor="nickname" className="block text-black">
              <span className="text-sm font-semibold">Nickname</span>

              <input
                type="text"
                id="nickname"
                name="nickname"
                value={form.nickname}
                onChange={handleChange}
                placeholder="닉네임을 입력하세요"
                className="mt-0.5 w-full border-2 border-black bg-white px-3 py-2 placeholder:text-gray-400 shadow-[4px_4px_0_0] shadow-black focus:ring-2 focus:ring-yellow-300 focus:outline-0 sm:text-sm"
              />
            </label>

            <label htmlFor="email" className="block text-black">
              <span className="text-sm font-semibold">Email</span>

              <input
                type="email"
                id="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="이메일을 입력하세요"
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
                type="submit"
                className="border-2 border-black bg-yellow-200 px-5 py-3 font-semibold text-black shadow-[4px_4px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none focus:ring-2 focus:ring-yellow-300 focus:outline-0"
              >
                회원가입
              </button>
              <button
                type="button"
                onClick={handleClickKakaoJoin}
                className="ml-auto border-2 border-black bg-yellow-300 px-5 py-3 font-semibold text-black shadow-[4px_4px_0_0] shadow-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none focus:ring-2 focus:ring-yellow-300 focus:outline-0"
              >
                카카오로 회원가입
              </button>
            </div>

            <p className="pt-2 text-sm text-gray-500">
              이미 회원이신가요?{' '}
              <Link
                to="/member/login"
                className="font-bold text-teal-600 hover:text-teal-700"
              >
                로그인
              </Link>
            </p>
          </form>
        </div>
      </div>
    </BasicLayout>
  )
}

export default JoinPage
