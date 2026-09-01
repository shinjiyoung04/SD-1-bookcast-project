import { Link } from 'react-router-dom'

const Footer = () => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t-2 border-black bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-3"
              aria-label="BookCast 메인으로 이동"
            >
              <span className="flex h-10 w-10 items-center justify-center border-2 border-white bg-yellow-200 text-lg font-black text-black shadow-[3px_3px_0_0] shadow-white">
                B
              </span>

              <div>
                <p className="text-lg font-black tracking-tight">BOOKCAST</p>

                <p className="mt-0.5 text-xs font-semibold text-gray-400">
                  도서 검색부터 희망도서 신청까지
                </p>
              </div>
            </Link>
          </div>

          <nav
            className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-black text-gray-300"
            aria-label="푸터 메뉴"
          >
            <FooterLink to="/books">도서 검색</FooterLink>

            <FooterLink to="/book/request">희망도서 신청</FooterLink>

            <FooterLink to="/citizen-votes">시민투표</FooterLink>

            <FooterLink to="/member/mypage">마이페이지</FooterLink>
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-700 pt-5 text-xs font-semibold text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {currentYear} BookCast. All rights reserved.</p>

          <p>
            도서 및 도서관 정보는 도서관정보나루 등 외부 데이터와 연동됩니다.
          </p>
        </div>
      </div>
    </footer>
  )
}

const FooterLink = ({ to, children }) => (
  <Link
    to={to}
    className="border-b-2 border-transparent pb-1 transition hover:border-yellow-300 hover:text-yellow-300"
  >
    {children}
  </Link>
)

export default Footer
