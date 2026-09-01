import Header from '../layouts/Header'
import Footer from '../layouts/Footer'
import RecentViewedSidebar from '../components/common/RecentViewedSidebar'

const BasicLayout = ({ children }) => {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <div className="min-w-0 flex-1">{children}</div>
      <Footer />
      <RecentViewedSidebar />
    </div>
  )
}

export default BasicLayout
