import { useRef } from 'react';
import memberIcon from '../../assets/memberIcon.png';

const ProfileImageUpload = ({ preview, onChange }) => {
  const fileInputRef = useRef(null);

  const handleClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        className="group relative h-32 w-32 overflow-hidden rounded-full border-2 border-black bg-white shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
      >
        <img
          src={preview || memberIcon}
          alt="회원 아이콘"
          className="h-full w-full object-cover"
        />

        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
          <div className="flex items-center gap-2 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3h16.5A2.25 2.25 0 0 0 22.5 16.5v-9A2.25 2.25 0 0 0 20.25 5.25H3.75A2.25 2.25 0 0 0 1.5 7.5v9A2.25 2.25 0 0 0 3.75 18.75Zm10.5-11.25h.008v.008h-.008V7.5Z"
              />
            </svg>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="size-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5A2.25 2.25 0 0 0 6.75 19.5h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5A2.25 2.25 0 0 0 14.25 7.5h-.75m0-3-3-3m0 0-3 3m3-3v11.25"
              />
            </svg>
          </div>
        </div>
      </button>

      <label
        htmlFor="ProfileFile"
        className="cursor-pointer text-sm font-semibold text-gray-600 hover:text-teal-600"
      >
        프로필 이미지 업로드
      </label>

      <input
        ref={fileInputRef}
        type="file"
        id="ProfileFile"
        accept="image/*"
        className="sr-only"
        onChange={onChange}
      />
    </div>
  );
};

export default ProfileImageUpload;
