import spinner from '../../assets/P0i7.gif'

const LoadingPage = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center justify-center">
        <img
          src={spinner}
          alt="로딩중 이미지"
          className="h-40 w-40 object-contain"
        />

        <h4 className="mt-4 text-lg font-semibold text-gray-700">
          잠시 기다려주세요
        </h4>
      </div>
    </div>
  )
}

export default LoadingPage
