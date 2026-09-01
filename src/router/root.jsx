/* eslint-disable react-refresh/only-export-components */

import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import LoadingPage from '../components/common/LoadingPage.jsx'

const MainPage = lazy(() => import('../pages/MainPage.jsx'))

const LoginPage = lazy(() => import('../pages/member/LoginPage.jsx'))

const JoinPage = lazy(() => import('../pages/member/JoinPage.jsx'))

const SearchPage = lazy(() => import('../pages/book/SearchPage.jsx'))

const DetailPage = lazy(() => import('../pages/book/DetailPage.jsx'))

const MyPage = lazy(() => import('../pages/member/MyPage.jsx'))

const BookRequestPage = lazy(() => import('../pages/book/BookRequestPage.jsx'))

const PromotionApplyPage = lazy(
  () => import('../pages/promotion/PromotionApplyPage.jsx'),
)

const PromotionManagePage = lazy(
  () => import('../pages/promotion/PromotionManagePage.jsx'),
)

const CitizenVotePage = lazy(() => import('../pages/vote/CitizenVotePage.jsx'))

const CitizenVoteDetailPage = lazy(
  () => import('../pages/vote/CitizenVoteDetailPage.jsx'),
)

const MemberEditPage = lazy(() => import('../pages/member/MemberEditPage.jsx'))

const AdminPage = lazy(() => import('../pages/admin/AdminPage.jsx'))

const AcquisitionCartPage = lazy(
  () => import('../pages/admin/AcquisitionCartPage.jsx'),
)

const withSuspense = (Component) => (
  <Suspense fallback={<LoadingPage />}>
    <Component />
  </Suspense>
)

const root = createBrowserRouter([
  {
    path: '/',
    element: withSuspense(MainPage),
  },
  {
    path: '/member/login',
    element: withSuspense(LoginPage),
  },
  {
    path: '/member/join',
    element: withSuspense(JoinPage),
  },
  {
    path: '/member/mypage',
    element: withSuspense(MyPage),
  },
  {
    path: '/member/edit',
    element: withSuspense(MemberEditPage),
  },

  // 도서 검색·상세
  {
    path: '/books',
    element: withSuspense(SearchPage),
  },
  {
    path: '/books/:isbn13',
    element: withSuspense(DetailPage),
  },

  // 희망도서 신청
  {
    path: '/book/request',
    element: withSuspense(BookRequestPage),
  },

  // 시민투표
  {
    path: '/citizen-votes',
    element: withSuspense(CitizenVotePage),
  },
  {
    path: '/citizen-votes/:applicationId',
    element: withSuspense(CitizenVoteDetailPage),
  },

  // 홍보·행사
  {
    path: '/promotion/apply',
    element: withSuspense(PromotionApplyPage),
  },
  {
    path: '/promotion/manage',
    element: withSuspense(PromotionManagePage),
  },

  // 관리자
  {
    path: '/admin',
    element: withSuspense(AdminPage),
  },
  {
    path: '/admin/acquisitions',
    element: withSuspense(AcquisitionCartPage),
  },
])

export default root
