import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import AlertModal from '../../components/common/AlertModal'
import PasswordConfirmModal from '../../components/member/PasswordConfirmModal'
import useMemberStore from '../../store/useMemberStore'
import {
  clearProfileVerification,
  deleteMemberProfileImage,
  getMemberProfileForEdit,
  readProfileVerification,
  updateMemberProfile,
  uploadMemberProfileImage,
  withdrawMemberAccount,
} from '../../api/memberAccountApi'
import { searchRequestLibraries } from '../../api/bookRequestApi'

const API_BASE_URL =
  import.meta.env.VITE_API_SERVER_URL || 'http://localhost:8080/api'

const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '')

const DEFAULT_DTL_REGION = '31100'

const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024

const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const extractLibraryList = (data) => {
  if (Array.isArray(data)) {
    return data
  }

  const candidates = [
    data?.response?.libs,
    data?.response?.data?.libs,
    data?.data?.response?.libs,
    data?.data?.libs,
    data?.libraries,
    data?.results,
    data?.list,
    data?.libs,
    data?.content,
    data?.items,
    data?.data,
  ]

  return candidates.find(Array.isArray) || []
}

const normalizeLibrary = (item, index = 0) => {
  const library = item?.lib || item?.library || item || {}

  const libraryCode = String(
    library.libCode ??
      library.lib_code ??
      library.libraryCode ??
      library.code ??
      '',
  ).trim()

  return {
    key: libraryCode || `library-${index}`,

    libraryCode,

    libraryName:
      library.libName ?? library.libraryName ?? library.name ?? '도서관명 없음',

    address: library.address ?? library.addr ?? library.libraryAddress ?? '',

    phone: library.tel ?? library.phone ?? library.telephone ?? '',
  }
}

const normalizeRole = (value) =>
  String(value ?? 'USER')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

const resolveProfileImageUrl = (value) => {
  const url = String(value ?? '').trim()

  if (!url) {
    return ''
  }

  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url
  }

  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`
}

const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data

  if (typeof data === 'string') {
    return data
  }

  return (
    data?.message || data?.detail || data?.error || error?.message || fallback
  )
}

const updateMemberStoreProfile = (updatedProfile) => {
  useMemberStore.setState((state) => {
    const patch = {
      userId: updatedProfile.userId,

      loginId: updatedProfile.loginId,

      name: updatedProfile.name,

      nickname: updatedProfile.nickname,

      email: updatedProfile.email,

      profileImageUrl: updatedProfile.profileImageUrl,

      address: updatedProfile.address,

      birthDate: updatedProfile.birthDate,

      gender: updatedProfile.gender,

      role: updatedProfile.role,

      status: updatedProfile.status,

      provider: updatedProfile.provider,

      managedLibraryId: updatedProfile.managedLibraryId,

      managedLibraryCode: updatedProfile.managedLibraryCode,

      managedLibraryName: updatedProfile.managedLibraryName,
    }

    const nextState = {
      ...state,
    }

    if (state.member) {
      nextState.member = {
        ...state.member,
        ...patch,
      }
    }

    if (state.memberInfo) {
      nextState.memberInfo = {
        ...state.memberInfo,
        ...patch,
      }
    }

    if (state.user) {
      nextState.user = {
        ...state.user,
        ...patch,
      }
    }

    return nextState
  })
}

const clearMemberSession = () => {
  clearProfileVerification()

  useMemberStore.setState((state) => ({
    ...state,

    member: null,
    memberInfo: null,
    user: null,

    accessToken: null,
    refreshToken: null,

    isLogin: false,
    isLoggedIn: false,
  }))

  if (useMemberStore.persist?.clearStorage) {
    useMemberStore.persist.clearStorage()
  }

  const storageKeys = [
    'member-storage',
    'memberStore',
    'member',
    'accessToken',
    'refreshToken',
  ]

  storageKeys.forEach((key) => {
    localStorage.removeItem(key)
  })
}

const MemberEditPage = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user

  const userId =
    loginUser?.userId ??
    loginUser?.user_id ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const verification = useMemo(
    () => (userId ? readProfileVerification(userId) : null),
    [userId],
  )

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [pageError, setPageError] = useState('')

  const [noticeModal, setNoticeModal] = useState(null)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  const [deletePassword, setDeletePassword] = useState('')

  const [deleteError, setDeleteError] = useState('')

  const [deleting, setDeleting] = useState(false)

  const [profile, setProfile] = useState(null)

  const [libraries, setLibraries] = useState([])

  const [librariesLoading, setLibrariesLoading] = useState(false)

  const [selectedImageFile, setSelectedImageFile] = useState(null)

  const [localPreviewUrl, setLocalPreviewUrl] = useState('')

  const [uploadingImage, setUploadingImage] = useState(false)

  const [imageError, setImageError] = useState(false)

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    email: '',
    address: '',
    birthDate: '',
    gender: '',
    managedLibraryCode: '',
  })

  const role = normalizeRole(profile?.role)

  const isAdminAccount = role === 'ADMIN' || role === 'MASTER_ADMIN'

  const returnPath = isAdminAccount ? '/admin?tab=profile' : '/member/mypage'

  const currentProfileImageUrl = resolveProfileImageUrl(
    profile?.profileImageUrl,
  )

  const previewImageUrl = localPreviewUrl || currentProfileImageUrl

  useEffect(() => {
    return () => {
      if (localPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPreviewUrl)
      }
    }
  }, [localPreviewUrl])

  useEffect(() => {
    if (!loginUser || !userId) {
      navigate('/member/login', {
        replace: true,
      })
      return
    }

    if (!verification) {
      navigate('/member/mypage', {
        replace: true,
      })
      return
    }

    const loadProfile = async () => {
      setLoading(true)
      setPageError('')

      try {
        const result = await getMemberProfileForEdit({
          userId,

          verificationToken: verification.verificationToken,
        })

        setProfile(result)
        setImageError(false)

        setForm({
          name: result.name ?? '',

          nickname: result.nickname ?? '',

          email: result.email ?? '',

          address: result.address ?? '',

          birthDate: result.birthDate ?? '',

          gender: result.gender ?? '',

          managedLibraryCode: result.managedLibraryCode ?? '',
        })

        const loadedRole = normalizeRole(result.role)

        if (loadedRole === 'ADMIN' || loadedRole === 'MASTER_ADMIN') {
          setLibrariesLoading(true)

          try {
            const libraryResult = await searchRequestLibraries({
              dtlRegion: DEFAULT_DTL_REGION,

              pageNo: 1,
              pageSize: 100,
            })

            let normalizedLibraries = extractLibraryList(libraryResult)
              .map(normalizeLibrary)
              .filter((library) => library.libraryCode)
              .sort((first, second) =>
                first.libraryName.localeCompare(second.libraryName, 'ko-KR'),
              )

            if (
              result.managedLibraryCode &&
              !normalizedLibraries.some(
                (library) => library.libraryCode === result.managedLibraryCode,
              )
            ) {
              normalizedLibraries = [
                {
                  key: result.managedLibraryCode,

                  libraryCode: result.managedLibraryCode,

                  libraryName:
                    result.managedLibraryName ||
                    `도서관 코드 ${result.managedLibraryCode}`,

                  address: '',
                  phone: '',
                },

                ...normalizedLibraries,
              ]
            }

            setLibraries(normalizedLibraries)
          } catch (libraryError) {
            console.error(
              '[MemberEditPage] 관리 도서관 목록 조회 실패:',
              libraryError,
            )

            setNoticeModal({
              type: 'error',

              message: getErrorMessage(
                libraryError,
                '관리 도서관 목록을 불러오지 못했습니다.',
              ),
            })
          } finally {
            setLibrariesLoading(false)
          }
        }
      } catch (error) {
        console.error('[MemberEditPage] 회원정보 조회 실패:', error)

        clearProfileVerification()

        setPageError(getErrorMessage(error, '회원정보를 불러오지 못했습니다.'))
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [loginUser, navigate, userId, verification])

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const clearSelectedImage = () => {
    if (localPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(localPreviewUrl)
    }

    setSelectedImageFile(null)
    setLocalPreviewUrl('')
    setImageError(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      event.target.value = ''

      setNoticeModal({
        type: 'error',

        message: 'JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.',
      })

      return
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE) {
      event.target.value = ''

      setNoticeModal({
        type: 'error',

        message: '프로필 이미지는 5MB 이하만 업로드할 수 있습니다.',
      })

      return
    }

    if (localPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(localPreviewUrl)
    }

    const objectUrl = URL.createObjectURL(file)

    setSelectedImageFile(file)
    setLocalPreviewUrl(objectUrl)
    setImageError(false)
  }

  const uploadSelectedImage = async ({ showSuccess = true } = {}) => {
    if (!selectedImageFile) {
      return profile
    }

    setUploadingImage(true)

    try {
      const result = await uploadMemberProfileImage({
        userId,

        verificationToken: verification.verificationToken,

        file: selectedImageFile,
      })

      updateMemberStoreProfile(result)

      setProfile(result)
      clearSelectedImage()

      if (showSuccess) {
        setNoticeModal({
          type: 'success',

          message: '프로필 이미지가 변경되었습니다.',
        })
      }

      return result
    } catch (error) {
      console.error('[MemberEditPage] 프로필 이미지 업로드 실패:', error)

      throw error
    } finally {
      setUploadingImage(false)
    }
  }

  const handleUploadImage = async () => {
    if (!selectedImageFile) {
      setNoticeModal({
        type: 'error',

        message: '업로드할 이미지를 선택해주세요.',
      })
      return
    }

    try {
      await uploadSelectedImage()
    } catch (error) {
      setNoticeModal({
        type: 'error',

        message: getErrorMessage(error, '프로필 이미지 업로드에 실패했습니다.'),
      })
    }
  }

  const handleDeleteImage = async () => {
    setUploadingImage(true)

    try {
      const result = await deleteMemberProfileImage({
        userId,

        verificationToken: verification.verificationToken,
      })

      updateMemberStoreProfile(result)

      setProfile(result)
      clearSelectedImage()

      setNoticeModal({
        type: 'success',

        message: '프로필 이미지가 기본 이미지로 변경되었습니다.',
      })
    } catch (error) {
      console.error('[MemberEditPage] 프로필 이미지 삭제 실패:', error)

      setNoticeModal({
        type: 'error',

        message: getErrorMessage(error, '프로필 이미지 삭제에 실패했습니다.'),
      })
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.name.trim() || !form.email.trim()) {
      setNoticeModal({
        type: 'error',

        message: '이름과 이메일을 입력해주세요.',
      })

      return
    }

    if (role === 'ADMIN' && !form.managedLibraryCode) {
      setNoticeModal({
        type: 'error',

        message: '관리자가 담당할 도서관을 선택해주세요.',
      })

      return
    }

    const selectedManagedLibrary = libraries.find(
      (library) => library.libraryCode === form.managedLibraryCode,
    )

    setSaving(true)

    try {
      if (selectedImageFile) {
        await uploadSelectedImage({
          showSuccess: false,
        })
      }

      const result = await updateMemberProfile({
        userId,

        verificationToken: verification.verificationToken,

        profile: {
          name: form.name.trim(),

          nickname: form.nickname.trim() || null,

          email: form.email.trim(),

          address: form.address.trim() || null,

          birthDate: form.birthDate || null,

          gender: form.gender || null,

          managedLibraryCode: isAdminAccount
            ? form.managedLibraryCode || null
            : null,

          managedLibraryName: selectedManagedLibrary?.libraryName || null,

          managedLibraryAddress: selectedManagedLibrary?.address || null,

          managedLibraryPhone: selectedManagedLibrary?.phone || null,
        },
      })

      updateMemberStoreProfile(result)

      setProfile(result)

      setNoticeModal({
        type: 'success',

        message: '회원정보가 수정되었습니다.',

        callbackFn: () => {
          clearProfileVerification()

          navigate(returnPath, {
            replace: true,
          })
        },
      })
    } catch (error) {
      console.error('[MemberEditPage] 회원정보 수정 실패:', error)

      setNoticeModal({
        type: 'error',

        message: getErrorMessage(error, '회원정보 수정에 실패했습니다.'),
      })
    } finally {
      setSaving(false)
    }
  }

  const openDeleteModal = () => {
    setDeletePassword('')
    setDeleteError('')
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    if (deleting) {
      return
    }

    setDeleteModalOpen(false)
    setDeletePassword('')
    setDeleteError('')
  }

  const handleWithdraw = async () => {
    if (!deletePassword) {
      setDeleteError('현재 비밀번호를 입력해주세요.')

      return
    }

    setDeleting(true)
    setDeleteError('')

    try {
      await withdrawMemberAccount({
        userId,

        verificationToken: verification.verificationToken,

        password: deletePassword,
      })

      setDeleteModalOpen(false)

      clearMemberSession()

      setNoticeModal({
        type: 'success',

        message: '회원탈퇴가 완료되었습니다.',

        callbackFn: () => {
          navigate('/member/login', {
            replace: true,
          })
        },
      })
    } catch (error) {
      console.error('[MemberEditPage] 회원탈퇴 실패:', error)

      setDeleteError(getErrorMessage(error, '회원탈퇴에 실패했습니다.'))
    } finally {
      setDeleting(false)
    }
  }

  if (!loginUser || !verification) {
    return null
  }

  return (
    <BasicLayout>
      <main className="min-h-[calc(100vh-160px)] bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-3xl border-2 border-black bg-white shadow-[6px_6px_0_0] shadow-black">
            <div className="border-b-2 border-black bg-yellow-200 px-6 py-6 sm:px-8">
              <p className="text-sm font-black text-gray-700">
                {isAdminAccount ? '관리자 페이지' : '마이페이지'}
              </p>

              <h1 className="mt-1 text-3xl font-black text-black">
                {isAdminAccount ? '관리자 정보 수정' : '회원정보 수정'}
              </h1>

              <p className="mt-3 text-sm font-semibold text-gray-600">
                로그인 아이디와 권한은 변경할 수 없습니다.
              </p>
            </div>

            {loading && <LoadingBox message="회원정보를 불러오는 중입니다." />}

            {!loading && pageError && (
              <div className="m-6 border-2 border-red-300 bg-red-50 p-8 text-center sm:m-8">
                <p className="font-black text-red-800">{pageError}</p>

                <button
                  type="button"
                  onClick={() => navigate(returnPath)}
                  className="mt-5 border-2 border-black bg-white px-5 py-2.5 font-black"
                >
                  이전 페이지로 돌아가기
                </button>
              </div>
            )}

            {!loading && !pageError && profile && (
              <>
                <form onSubmit={handleSubmit} className="p-6 sm:p-8">
                  <ProfileImageEditor
                    profile={profile}
                    previewImageUrl={previewImageUrl}
                    imageError={imageError}
                    onImageError={() => setImageError(true)}
                    fileInputRef={fileInputRef}
                    selectedImageFile={selectedImageFile}
                    onSelect={handleImageSelect}
                    onUpload={handleUploadImage}
                    onCancelSelection={clearSelectedImage}
                    onDelete={handleDeleteImage}
                    loading={uploadingImage}
                  />

                  <div className="mt-8 grid gap-5 sm:grid-cols-2">
                    <ReadOnlyField
                      label="로그인 아이디"
                      value={profile.loginId}
                    />

                    <ReadOnlyField label="회원 권한" value={profile.role} />

                    <ReadOnlyField label="계정 상태" value={profile.status} />

                    <ReadOnlyField
                      label="가입 방식"
                      value={profile.provider || 'LOCAL'}
                    />

                    <EditField
                      label="이름"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      maxLength={50}
                    />

                    <EditField
                      label="닉네임"
                      name="nickname"
                      value={form.nickname}
                      onChange={handleChange}
                      maxLength={50}
                    />

                    <EditField
                      label="이메일"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      required
                      maxLength={100}
                      className="sm:col-span-2"
                    />

                    <EditField
                      label="주소"
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      maxLength={255}
                      className="sm:col-span-2"
                    />

                    <EditField
                      label="생년월일"
                      name="birthDate"
                      type="date"
                      value={form.birthDate}
                      onChange={handleChange}
                    />

                    <label className="block">
                      <span className="text-sm font-black text-gray-900">
                        성별
                      </span>

                      <select
                        name="gender"
                        value={form.gender}
                        onChange={handleChange}
                        className="mt-2 h-12 w-full border-2 border-black bg-white px-4 font-semibold outline-none focus:bg-yellow-50"
                      >
                        <option value="">선택 안 함</option>

                        <option value="MALE">남성</option>

                        <option value="FEMALE">여성</option>

                        <option value="OTHER">기타</option>
                      </select>
                    </label>

                    {isAdminAccount && (
                      <label className="block sm:col-span-2">
                        <span className="text-sm font-black text-gray-900">
                          관리하는 도서관
                        </span>

                        <select
                          name="managedLibraryCode"
                          value={form.managedLibraryCode}
                          onChange={handleChange}
                          disabled={librariesLoading}
                          className="mt-2 h-12 w-full border-2 border-black bg-white px-4 font-semibold outline-none focus:bg-yellow-50 disabled:bg-gray-100"
                        >
                          <option value="">
                            {role === 'MASTER_ADMIN'
                              ? '전체 도서관 관리'
                              : '담당 도서관 선택'}
                          </option>

                          {libraries.map((library) => (
                            <option
                              key={library.key}
                              value={library.libraryCode}
                            >
                              {library.libraryName}
                            </option>
                          ))}
                        </select>

                        {librariesLoading && (
                          <p className="mt-2 text-xs font-semibold text-gray-500">
                            정보나루 도서관 목록을 불러오는 중입니다.
                          </p>
                        )}

                        {!librariesLoading && (
                          <p className="mt-2 text-xs font-semibold text-gray-500">
                            {role === 'MASTER_ADMIN'
                              ? '선택하지 않으면 전체 도서관을 관리합니다.'
                              : '등업 신청 화면과 동일한 정보나루 고양시 도서관 목록입니다.'}
                          </p>
                        )}
                      </label>
                    )}
                  </div>

                  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        clearProfileVerification()

                        navigate(returnPath)
                      }}
                      disabled={saving || uploadingImage}
                      className="h-12 border-2 border-black bg-white px-6 font-black disabled:opacity-50"
                    >
                      취소
                    </button>

                    <button
                      type="submit"
                      disabled={saving || uploadingImage || librariesLoading}
                      className="h-12 border-2 border-black bg-yellow-200 px-7 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
                    >
                      {saving ? '저장 중...' : '수정 내용 저장'}
                    </button>
                  </div>
                </form>

                <section className="border-t-2 border-red-300 bg-red-50 p-6 sm:p-8">
                  <h2 className="text-xl font-black text-red-900">회원탈퇴</h2>

                  <p className="mt-3 text-sm font-semibold leading-6 text-red-700">
                    탈퇴 후 로그인이 불가능하며 회원정보와 관련 기록은
                    웹사이트에서 보이지 않게 처리됩니다.
                  </p>

                  <button
                    type="button"
                    onClick={openDeleteModal}
                    className="mt-5 border-2 border-red-800 bg-red-200 px-6 py-3 text-sm font-black text-red-950 shadow-[3px_3px_0_0] shadow-red-900 transition hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none"
                  >
                    회원탈퇴
                  </button>
                </section>
              </>
            )}
          </section>
        </div>
      </main>

      <PasswordConfirmModal
        open={deleteModalOpen}
        title="정말 탈퇴하시겠습니까?"
        message={
          '탈퇴하면 계정을 다시 사용할 수 없습니다.\n계속하려면 현재 비밀번호를 입력해주세요.'
        }
        password={deletePassword}
        onPasswordChange={(value) => {
          setDeletePassword(value)

          setDeleteError('')
        }}
        onClose={closeDeleteModal}
        onConfirm={handleWithdraw}
        loading={deleting}
        errorMessage={deleteError}
        confirmLabel="회원탈퇴"
        danger
      />

      {noticeModal && (
        <AlertModal
          type={noticeModal.type}
          message={noticeModal.message}
          onClose={() => setNoticeModal(null)}
          callbackFn={noticeModal.callbackFn}
        />
      )}
    </BasicLayout>
  )
}

const LoadingBox = ({ message }) => (
  <div className="flex min-h-80 flex-col items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

    <p className="mt-4 font-black text-gray-700">{message}</p>
  </div>
)

const ProfileImageEditor = ({
  profile,
  previewImageUrl,
  imageError,
  onImageError,
  fileInputRef,
  selectedImageFile,
  onSelect,
  onUpload,
  onCancelSelection,
  onDelete,
  loading,
}) => {
  const initial = profile.name?.charAt(0) || profile.loginId?.charAt(0) || '?'

  return (
    <section className="border-2 border-black bg-gray-50 p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-yellow-100 shadow-[4px_4px_0_0] shadow-black">
          {previewImageUrl && !imageError ? (
            <img
              src={previewImageUrl}
              alt="프로필 이미지 미리보기"
              className="h-full w-full object-cover"
              onError={onImageError}
            />
          ) : (
            <span className="text-5xl font-black text-gray-500">
              {initial.toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-gray-950">프로필 이미지</h2>

          <p className="mt-2 text-sm font-semibold leading-6 text-gray-500">
            JPG, PNG, WEBP 형식의 5MB 이하 이미지를 선택할 수 있습니다.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onSelect}
            disabled={loading}
            className="mt-4 block w-full text-sm font-semibold text-gray-600 file:mr-4 file:border-2 file:border-black file:bg-white file:px-4 file:py-2 file:text-sm file:font-black hover:file:bg-yellow-100 disabled:opacity-50"
          />

          {selectedImageFile && (
            <div className="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
              선택된 파일: {selectedImageFile.name}
              {' · '}
              {(selectedImageFile.size / 1024 / 1024).toFixed(2)}
              MB
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onUpload}
              disabled={loading || !selectedImageFile}
              className="border-2 border-black bg-yellow-200 px-4 py-2 text-sm font-black shadow-[3px_3px_0_0] shadow-black disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
            >
              {loading ? '업로드 중...' : '선택한 이미지 업로드'}
            </button>

            {selectedImageFile && (
              <button
                type="button"
                onClick={onCancelSelection}
                disabled={loading}
                className="border-2 border-black bg-white px-4 py-2 text-sm font-black disabled:opacity-50"
              >
                선택 취소
              </button>
            )}

            {profile.profileImageUrl && (
              <button
                type="button"
                onClick={onDelete}
                disabled={loading}
                className="border-2 border-red-600 bg-red-50 px-4 py-2 text-sm font-black text-red-700 disabled:opacity-50"
              >
                기본 이미지로 변경
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const ReadOnlyField = ({ label, value }) => (
  <label className="block">
    <span className="text-sm font-black text-gray-900">{label}</span>

    <input
      value={value || '-'}
      readOnly
      className="mt-2 h-12 w-full cursor-not-allowed border-2 border-gray-300 bg-gray-100 px-4 font-semibold text-gray-500"
    />
  </label>
)

const EditField = ({ label, className = '', ...inputProps }) => (
  <label className={`block ${className}`}>
    <span className="text-sm font-black text-gray-900">{label}</span>

    <input
      {...inputProps}
      className="mt-2 h-12 w-full border-2 border-black bg-white px-4 font-semibold outline-none focus:bg-yellow-50"
    />
  </label>
)

export default MemberEditPage
