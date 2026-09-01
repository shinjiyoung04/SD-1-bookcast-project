import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import useMemberStore from '../../store/useMemberStore'
import {
  BOOK_HISTORY_UPDATED_EVENT,
  getRecentViewedBooks,
} from '../../api/bookHistoryApi'

const MAX_RECENT_BOOKS = 5

const normalizeIsbn = (value) =>
  String(value ?? '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase()
    .trim()

const getCurrentIsbn = (pathname) => {
  const match = String(pathname ?? '').match(/^\/books?\/([^/?#]+)/i)

  if (!match?.[1]) {
    return ''
  }

  try {
    return normalizeIsbn(decodeURIComponent(match[1]))
  } catch {
    return normalizeIsbn(match[1])
  }
}

const resolveUserId = (loginUser) => {
  const value =
    loginUser?.userId ??
    loginUser?.user_id ??
    loginUser?.id ??
    loginUser?.userNo ??
    loginUser?.uno ??
    null

  const number = Number(value)

  return Number.isInteger(number) && number > 0 ? number : null
}

const RecentViewedSidebar = () => {
  const location = useLocation()
  const { member, memberInfo, user } = useMemberStore()

  const loginUser = member || memberInfo || user
  const userId = resolveUserId(loginUser)

  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentIsbn = useMemo(
    () => getCurrentIsbn(location.pathname),
    [location.pathname],
  )

  const loadRecentBooks = useCallback(async () => {
    if (!userId) {
      setBooks([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const response = await getRecentViewedBooks({
        userId,
        limit: MAX_RECENT_BOOKS,
      })

      setBooks(
        Array.isArray(response) ? response.slice(0, MAX_RECENT_BOOKS) : [],
      )
    } catch (error) {
      console.warn('[RecentViewedSidebar] 최근 본 도서 조회 실패:', error)

      setBooks([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecentBooks()
  }, [loadRecentBooks])

  useEffect(() => {
    const handleHistoryUpdated = (event) => {
      const updatedBooks = event?.detail?.books

      if (Array.isArray(updatedBooks)) {
        setBooks(updatedBooks.slice(0, MAX_RECENT_BOOKS))
        setLoading(false)
        return
      }

      loadRecentBooks()
    }

    window.addEventListener(BOOK_HISTORY_UPDATED_EVENT, handleHistoryUpdated)

    return () => {
      window.removeEventListener(
        BOOK_HISTORY_UPDATED_EVENT,
        handleHistoryUpdated,
      )
    }
  }, [loadRecentBooks])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktopExpanded(false)
    setMobileOpen(false)
  }, [location.pathname, location.search])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const handleDesktopBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDesktopExpanded(false)
    }
  }

  return (
    <>
      <aside
        className={`fixed right-4 bottom-5 z-40 hidden transition-[width] duration-200 ease-out lg:block ${
          desktopExpanded ? 'w-80' : 'w-24'
        }`}
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
        onFocusCapture={() => setDesktopExpanded(true)}
        onBlurCapture={handleDesktopBlur}
      >
        <div className="overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0_0] shadow-black">
          {desktopExpanded ? (
            <ExpandedPanel
              books={books}
              loading={loading}
              loggedIn={Boolean(userId)}
              currentIsbn={currentIsbn}
              onTop={scrollToTop}
            />
          ) : (
            <CollapsedPanel
              count={books.length}
              loading={loading}
              loggedIn={Boolean(userId)}
              onTop={scrollToTop}
            />
          )}
        </div>
      </aside>

      <div className="fixed right-4 bottom-5 z-40 flex flex-col items-end gap-2 lg:hidden">
        {mobileOpen && (
          <div className="w-[min(320px,calc(100vw-2rem))] overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0_0] shadow-black">
            <ExpandedPanel
              books={books}
              loading={loading}
              loggedIn={Boolean(userId)}
              currentIsbn={currentIsbn}
              onTop={scrollToTop}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        )}

        {!mobileOpen && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-12 min-w-20 items-center justify-center border-2 border-black bg-white px-3 text-xs font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
              aria-label="최근 본 도서 열기"
            >
              최근 본 도서
              {userId && books.length > 0 ? ` ${books.length}` : ''}
            </button>

            <button
              type="button"
              onClick={scrollToTop}
              className="flex h-12 min-w-16 items-center justify-center border-2 border-black bg-yellow-200 px-3 text-xs font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
              aria-label="페이지 맨 위로 이동"
            >
              ↑ TOP
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const CollapsedPanel = ({ count, loading, loggedIn, onTop }) => (
  <div className="p-2">
    <div className="flex min-h-16 flex-col items-center justify-center border-b-2 border-black px-1 pb-2 text-center">
      <span className="text-xl">📚</span>

      <p className="mt-1 text-[11px] font-black leading-4 text-gray-950">
        최근 본 도서
      </p>

      <p className="text-[10px] font-bold text-gray-500">
        {loading
          ? '조회 중'
          : loggedIn
            ? `${count} / ${MAX_RECENT_BOOKS}`
            : '로그인'}
      </p>
    </div>

    <button
      type="button"
      onClick={onTop}
      className="mt-2 flex h-10 w-full items-center justify-center border-2 border-black bg-yellow-200 text-xs font-black shadow-[2px_2px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
      aria-label="페이지 맨 위로 이동"
    >
      ↑ TOP
    </button>
  </div>
)

const ExpandedPanel = ({
  books,
  loading,
  loggedIn,
  currentIsbn,
  onTop,
  onClose,
}) => (
  <div className="flex max-h-[calc(100vh-2.5rem)] flex-col">
    <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-yellow-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-gray-950">최근 본 도서</p>

        <p className="mt-0.5 text-[11px] font-bold text-gray-500">
          최근 확인한 도서 최대 5개
        </p>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-white text-lg font-black"
          aria-label="최근 본 도서 닫기"
        >
          ×
        </button>
      )}
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {loading && (
        <div className="flex min-h-32 items-center justify-center border-2 border-dashed border-gray-300 bg-gray-50">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-black" />
        </div>
      )}

      {!loading && !loggedIn && (
        <div className="border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm font-bold leading-6 text-gray-500">
          로그인 후 최근 본 도서가 저장됩니다.
        </div>
      )}

      {!loading && loggedIn && books.length === 0 && (
        <div className="border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm font-bold leading-6 text-gray-500">
          최근 본 도서가 없습니다.
        </div>
      )}

      {!loading && loggedIn && books.length > 0 && (
        <div className="grid gap-3">
          {books.map((recentBook) => (
            <RecentBookItem
              key={`${recentBook.bookId}-${recentBook.isbn}`}
              book={recentBook}
              current={
                Boolean(currentIsbn) &&
                normalizeIsbn(recentBook.isbn) === currentIsbn
              }
            />
          ))}
        </div>
      )}
    </div>

    <div className="border-t-2 border-black bg-white p-3">
      <button
        type="button"
        onClick={onTop}
        className="flex h-11 w-full items-center justify-center border-2 border-black bg-yellow-200 text-sm font-black shadow-[3px_3px_0_0] shadow-black transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
        aria-label="페이지 맨 위로 이동"
      >
        ↑ TOP
      </button>
    </div>
  </div>
)

const RecentBookItem = ({ book, current }) => {
  const stateBook = {
    bookId: book.bookId,
    isbn13: book.isbn,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    imageUrl: book.thumbnailUrl,
  }

  return (
    <Link
      to={`/books/${book.isbn}`}
      state={{ book: stateBook }}
      className={`grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-2 bg-white p-3 transition hover:bg-yellow-100 ${
        current ? 'border-yellow-500' : 'border-black'
      }`}
    >
      <BookThumbnail src={book.thumbnailUrl} title={book.title} />

      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-black leading-5 text-gray-950">
          {book.title || '제목 없음'}
        </p>

        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-gray-500">
          {book.author || '저자 정보 없음'}
        </p>

        {current && (
          <span className="mt-2 inline-flex border border-yellow-500 bg-yellow-100 px-2 py-1 text-[10px] font-black text-yellow-800">
            현재 보고 있는 도서
          </span>
        )}
      </div>
    </Link>
  )
}

const BookThumbnail = ({ src, title }) => (
  <div className="h-24 w-16 shrink-0 overflow-hidden border-2 border-black bg-gray-100">
    {src ? (
      <img
        src={src}
        alt={title || '도서 표지'}
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="flex h-full items-center justify-center px-1 text-center text-[9px] font-black text-gray-400">
        NO IMAGE
      </div>
    )}
  </div>
)

export default RecentViewedSidebar
