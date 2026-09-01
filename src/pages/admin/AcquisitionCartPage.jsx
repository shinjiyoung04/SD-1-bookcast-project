import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BasicLayout from '../../layouts/BasicLayout'
import useMemberStore from '../../store/useMemberStore'

const MONTHLY_BUDGET = 1_000_000
const STORAGE_KEY = 'bookcast_acquisition_cart'

const getCurrentMonthKey = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

const formatCurrency = (value) => {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0원'
  }

  return `${number.toLocaleString('ko-KR')}원`
}

const getItemId = (item, index = 0) =>
  String(
    item?.cartItemId ??
      item?.acquisitionItemId ??
      item?.isbn13 ??
      item?.isbn ??
      `cart-item-${index}`,
  )

const normalizeCartItem = (item, index = 0) => {
  const price = Number(
    item?.unitPrice ??
      item?.priceSales ??
      item?.priceStandard ??
      item?.price ??
      0,
  )

  const quantity = Number(item?.quantity ?? 1)

  return {
    ...item,
    id: getItemId(item, index),
    isbn13: String(item?.isbn13 ?? item?.isbn ?? '')
      .replace(/[^0-9Xx]/g, '')
      .toUpperCase(),
    title: item?.title || '도서 제목 없음',
    author: item?.author || '저자 정보 없음',
    publisher: item?.publisher || '출판사 정보 없음',
    imageUrl: item?.imageUrl ?? item?.thumbnailUrl ?? item?.thumbnail_url ?? '',
    unitPrice: Number.isFinite(price) && price > 0 ? Math.trunc(price) : 0,
    quantity:
      Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 1,
    priceSource: item?.priceSource ?? item?.source ?? 'ALADIN',
    addedAt: item?.addedAt ?? new Date().toISOString(),
  }
}

const loadCartState = () => {
  const currentMonthKey = getCurrentMonthKey()

  try {
    const savedValue = localStorage.getItem(STORAGE_KEY)

    if (!savedValue) {
      return {
        monthKey: currentMonthKey,
        items: [],
      }
    }

    const parsedValue = JSON.parse(savedValue)

    // 예전 AcquisitionCartPage 형식 호환
    if (Array.isArray(parsedValue)) {
      const migratedItems = parsedValue.map((item, index) =>
        normalizeCartItem(item, index),
      )

      const migratedState = {
        monthKey: currentMonthKey,
        items: migratedItems,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState))

      return migratedState
    }

    const savedMonthKey = String(parsedValue?.monthKey ?? '').trim()

    const savedItems = Array.isArray(parsedValue?.items)
      ? parsedValue.items.map((item, index) => normalizeCartItem(item, index))
      : []

    if (savedMonthKey !== currentMonthKey) {
      const resetState = {
        monthKey: currentMonthKey,
        items: [],
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState))

      return resetState
    }

    return {
      monthKey: currentMonthKey,
      items: savedItems,
    }
  } catch (error) {
    console.error('[AcquisitionCartPage] 입고 목록 불러오기 실패:', error)

    return {
      monthKey: currentMonthKey,
      items: [],
    }
  }
}

const saveCartState = (monthKey, items) => {
  const payload = {
    monthKey,
    items,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))

  window.dispatchEvent(
    new CustomEvent('bookcast-acquisition-cart-updated', {
      detail: payload,
    }),
  )
}

const AcquisitionCartPage = () => {
  const { member, memberInfo, user } = useMemberStore()
  const loginUser = member || memberInfo || user

  const normalizedRole = String(
    loginUser?.role ?? loginUser?.userRole ?? loginUser?.authority ?? 'USER',
  )
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')

  const isLibraryAdmin = normalizedRole === 'ADMIN'

  const managedLibraryName = String(
    loginUser?.managedLibraryName ??
      loginUser?.managed_library_name ??
      '소속 도서관',
  ).trim()

  const initialCartState = useMemo(() => loadCartState(), [])

  const [cartMonthKey] = useState(initialCartState.monthKey)

  const [items, setItems] = useState(initialCartState.items)

  const [selectedItemIds, setSelectedItemIds] = useState(
    initialCartState.items.map((item) => item.id),
  )

  useEffect(() => {
    try {
      saveCartState(cartMonthKey, items)
    } catch (error) {
      console.error('[AcquisitionCartPage] 입고 목록 저장 실패:', error)
    }
  }, [cartMonthKey, items])

  const cartTotalAmount = useMemo(
    () =>
      items.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
    [items],
  )

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds],
  )

  const selectedTotalAmount = useMemo(
    () =>
      selectedItems.reduce(
        (total, item) => total + item.unitPrice * item.quantity,
        0,
      ),
    [selectedItems],
  )

  const totalQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  )

  const selectedQuantity = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems],
  )

  const remainingBudget = MONTHLY_BUDGET - cartTotalAmount
  const budgetUsagePercent = Math.min(
    100,
    Math.max(0, (cartTotalAmount / MONTHLY_BUDGET) * 100),
  )

  const allSelected =
    items.length > 0 && items.every((item) => selectedItemIds.includes(item.id))

  const currentMonthLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(new Date())

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedItemIds([])
      return
    }

    setSelectedItemIds(items.map((item) => item.id))
  }

  const handleToggleItem = (itemId) => {
    setSelectedItemIds((previousIds) => {
      if (previousIds.includes(itemId)) {
        return previousIds.filter((id) => id !== itemId)
      }

      return [...previousIds, itemId]
    })
  }

  const handleChangeQuantity = (itemId, nextQuantity) => {
    if (nextQuantity < 1) {
      return
    }

    const nextItems = items.map((item) =>
      item.id === itemId ? { ...item, quantity: nextQuantity } : item,
    )

    const nextTotalAmount = nextItems.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    )

    if (nextTotalAmount > MONTHLY_BUDGET) {
      const shortage = nextTotalAmount - MONTHLY_BUDGET

      alert(
        `월 입고 예산을 초과합니다.\n\n` +
          `월 예산: ${formatCurrency(MONTHLY_BUDGET)}\n` +
          `변경 후 금액: ${formatCurrency(nextTotalAmount)}\n` +
          `부족 금액: ${formatCurrency(shortage)}`,
      )
      return
    }

    setItems(nextItems)
  }

  const handleDeleteItem = (itemId) => {
    const targetItem = items.find((item) => item.id === itemId)

    if (!targetItem) {
      return
    }

    if (
      !window.confirm(`"${targetItem.title}"을 입고 목록에서 삭제하시겠습니까?`)
    ) {
      return
    }

    setItems((previousItems) =>
      previousItems.filter((item) => item.id !== itemId),
    )
    setSelectedItemIds((previousIds) =>
      previousIds.filter((id) => id !== itemId),
    )
  }

  const handleDeleteSelected = () => {
    if (selectedItemIds.length === 0) {
      alert('삭제할 도서를 선택해주세요.')
      return
    }

    if (
      !window.confirm(
        `선택한 ${selectedItems.length}종의 도서를 삭제하시겠습니까?`,
      )
    ) {
      return
    }

    setItems((previousItems) =>
      previousItems.filter((item) => !selectedItemIds.includes(item.id)),
    )
    setSelectedItemIds([])
  }

  const handleClearCart = () => {
    if (items.length === 0) {
      return
    }

    if (!window.confirm('입고 목록의 모든 도서를 삭제하시겠습니까?')) {
      return
    }

    setItems([])
    setSelectedItemIds([])
  }

  const handleSubmitAcquisition = () => {
    if (selectedItems.length === 0) {
      alert('입고 신청할 도서를 선택해주세요.')
      return
    }

    if (cartTotalAmount > MONTHLY_BUDGET) {
      alert('월 입고 예산을 초과했습니다.')
      return
    }

    alert(
      `입고 신청 대상 확인\n\n` +
        `선택 도서: ${selectedItems.length}종\n` +
        `선택 수량: ${selectedQuantity}권\n` +
        `선택 금액: ${formatCurrency(selectedTotalAmount)}\n\n` +
        `현재 단계에서는 화면과 예산 계산만 구현되어 있습니다.`,
    )
  }

  if (!isLibraryAdmin) {
    return (
      <BasicLayout>
        <div className="mx-auto max-w-5xl px-4 py-16">
          <section className="border-2 border-black bg-red-50 p-10 text-center shadow-[6px_6px_0_0] shadow-black">
            <h1 className="text-3xl font-black text-red-900">
              접근 권한이 없습니다.
            </h1>
            <p className="mt-4 font-bold text-red-700">
              입고 예정 목록은 도서관 사서 권한만 사용할 수 있습니다.
            </p>
            <Link
              to="/"
              className="mt-8 inline-block border-2 border-black bg-white px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              메인으로 이동
            </Link>
          </section>
        </div>
      </BasicLayout>
    )
  }

  return (
    <BasicLayout>
      <main className="min-h-screen bg-gray-100">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black text-gray-500">
                {managedLibraryName}
              </p>
              <h1 className="mt-2 text-4xl font-black text-black">
                입고 예정 목록
              </h1>
              <p className="mt-3 text-sm font-semibold text-gray-600">
                {currentMonthLabel} 도서 입고 후보를 관리합니다.
              </p>
            </div>

            <Link
              to="/books"
              className="w-fit border-2 border-black bg-yellow-200 px-5 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
            >
              + 도서 더 담기
            </Link>
          </div>

          <section className="mb-6 border-2 border-black bg-white p-5 shadow-[5px_5px_0_0] shadow-black">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-3 font-black">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                  className="h-5 w-5 accent-black"
                />
                전체 선택
                <span className="text-sm text-gray-500">
                  {items.length}종 · {totalQuantity}권
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={selectedItemIds.length === 0}
                  className="border-2 border-black bg-white px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  선택 삭제
                </button>
                <button
                  type="button"
                  onClick={handleClearCart}
                  disabled={items.length === 0}
                  className="border-2 border-black bg-red-100 px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  전체 삭제
                </button>
              </div>
            </div>
          </section>

          {items.length === 0 ? (
            <section className="border-2 border-black bg-white p-16 text-center shadow-[6px_6px_0_0] shadow-black">
              <div className="text-6xl">📚</div>
              <h2 className="mt-5 text-2xl font-black">
                입고 예정 도서가 없습니다.
              </h2>
              <p className="mt-3 text-sm font-semibold text-gray-500">
                도서 상세페이지에서 입고 목록에 담을 수 있습니다.
              </p>
              <Link
                to="/books"
                className="mt-8 inline-block border-2 border-black bg-yellow-200 px-6 py-3 font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
              >
                도서 검색하기
              </Link>
            </section>
          ) : (
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
              <section className="grid gap-5">
                {items.map((item) => {
                  const selected = selectedItemIds.includes(item.id)
                  const itemTotal = item.unitPrice * item.quantity

                  return (
                    <article
                      key={item.id}
                      className={`border-2 border-black bg-white p-5 shadow-[5px_5px_0_0] shadow-black ${selected ? 'ring-4 ring-yellow-200' : ''}`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleToggleItem(item.id)}
                          className="mt-1 h-5 w-5 shrink-0 accent-black"
                          aria-label={`${item.title} 선택`}
                        />

                        <div className="h-36 w-24 shrink-0 overflow-hidden border-2 border-black bg-gray-100">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-bold text-gray-400">
                              No Image
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h2 className="text-xl font-black leading-7">
                                {item.title}
                              </h2>
                              <p className="mt-2 text-sm font-bold text-gray-600">
                                {item.author}
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                {item.publisher}
                              </p>
                              <p className="mt-2 font-mono text-xs text-gray-400">
                                ISBN {item.isbn13 || '-'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="w-fit border-2 border-black bg-white px-3 py-2 text-xs font-black hover:bg-red-100"
                            >
                              삭제
                            </button>
                          </div>

                          <div className="mt-5 border-2 border-black bg-gray-50 p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-black text-gray-500">
                                  알라딘 기준 단가
                                </p>
                                <p className="mt-1 text-lg font-black">
                                  {formatCurrency(item.unitPrice)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(
                                      item.id,
                                      item.quantity - 1,
                                    )
                                  }
                                  disabled={item.quantity <= 1}
                                  className="flex h-9 w-9 items-center justify-center border-2 border-black bg-white text-xl font-black disabled:bg-gray-200 disabled:text-gray-400"
                                >
                                  −
                                </button>
                                <div className="flex h-9 min-w-14 items-center justify-center border-2 border-black bg-white px-3 font-black">
                                  {item.quantity}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleChangeQuantity(
                                      item.id,
                                      item.quantity + 1,
                                    )
                                  }
                                  className="flex h-9 w-9 items-center justify-center border-2 border-black bg-white text-xl font-black hover:bg-yellow-100"
                                >
                                  +
                                </button>
                              </div>

                              <div className="text-right">
                                <p className="text-xs font-black text-gray-500">
                                  예상 입고 금액
                                </p>
                                <p className="mt-1 text-xl font-black">
                                  {formatCurrency(itemTotal)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>

              <aside className="sticky top-24 border-2 border-black bg-white p-6 shadow-[6px_6px_0_0] shadow-black">
                <h2 className="text-2xl font-black">입고 예산</h2>
                <p className="mt-2 text-sm font-bold text-gray-500">
                  {currentMonthLabel}
                </p>

                <div className="mt-6 h-4 overflow-hidden border-2 border-black bg-gray-100">
                  <div
                    className={`h-full ${budgetUsagePercent >= 80 ? 'bg-orange-400' : 'bg-green-400'}`}
                    style={{ width: `${budgetUsagePercent}%` }}
                  />
                </div>
                <p className="mt-2 text-right text-xs font-black text-gray-500">
                  예산 사용률 {budgetUsagePercent.toFixed(1)}%
                </p>

                <div className="mt-6 grid gap-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-600">
                      월 배정 예산
                    </span>
                    <span className="font-black">
                      {formatCurrency(MONTHLY_BUDGET)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-600">
                      입고 예정 금액
                    </span>
                    <span className="font-black">
                      {formatCurrency(cartTotalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-600">
                      선택 도서 금액
                    </span>
                    <span className="font-black text-blue-700">
                      {formatCurrency(selectedTotalAmount)}
                    </span>
                  </div>
                  <div className="border-t-2 border-black pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-black">남은 예산</span>
                      <span className="text-2xl font-black text-green-700">
                        {formatCurrency(remainingBudget)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-2 border-black bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="font-bold">선택 도서</span>
                    <span className="font-black">{selectedItems.length}종</span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="font-bold">선택 수량</span>
                    <span className="font-black">{selectedQuantity}권</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmitAcquisition}
                  disabled={selectedItems.length === 0}
                  className="mt-6 w-full border-2 border-black bg-green-400 px-5 py-4 text-lg font-black shadow-[4px_4px_0_0] shadow-black transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                >
                  입고 신청하기 {selectedItems.length}
                </button>
              </aside>
            </div>
          )}
        </div>
      </main>
    </BasicLayout>
  )
}

export default AcquisitionCartPage
