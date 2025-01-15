import { useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import MarketMoverCard from './MarketMoverCard'

interface TimeInterval {
  label: string
  value: string
}

interface TopMover {
  market_id: string
  question: string
  price: number
  price_change: number
  volume: number
}

interface TopMoversListProps {
  topMovers: TopMover[]
  error: string | null
  timeIntervals: readonly TimeInterval[]
  selectedInterval: string
  onIntervalChange: (interval: string) => void
  onLoadMore: () => void
  hasMore: boolean
  openMarketsOnly: boolean
  onOpenMarketsChange: (value: boolean) => void
  isLoading?: boolean
  isLoadingMore?: boolean
}

const TopMoversList = ({
  timeIntervals,
  selectedInterval,
  onIntervalChange,
  topMovers,
  error,
  onLoadMore,
  hasMore,
  openMarketsOnly,
  onOpenMarketsChange,
  isLoading,
  isLoadingMore,
}: TopMoversListProps) => {
  const [isTimeIntervalDropdownOpen, setIsTimeIntervalDropdownOpen] = useState(false)

  return (
    <div className="space-y-6 pb-4 max-w-[1200px] mx-auto relative">
      {isLoading && (
        <div className="absolute top-32 inset-x-0 bottom-0 flex justify-center bg-black/50 backdrop-blur-sm z-50 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin mt-8" />
        </div>
      )}
      
      <div className="sticky top-14 bg-background px-4 py-4 z-40 border-b border-l border-r border-white/10 rounded-b-lg mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">What's happened in the last</span>
            <div className="relative">
              <button
                onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
                className="flex items-center space-x-2 text-2xl font-bold hover:text-white/80 transition-colors"
              >
                <span>{timeIntervals.find(i => i.value === selectedInterval)?.label}</span>
                <ChevronDown className="w-5 h-5" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 py-2 bg-background/80 rounded-xl shadow-2xl border border-white/10 w-40 backdrop-blur-2xl z-50">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className={`w-full px-3 py-2 text-left hover:bg-white/10 transition-colors ${
                        selectedInterval === interval.value ? 'bg-white/5 text-white' : 'text-gray-300'
                      }`}
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false)
                        onIntervalChange(interval.value)
                      }}
                    >
                      <span className={`font-medium ${selectedInterval === interval.value ? 'text-white' : ''}`}>
                        {interval.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={e => onOpenMarketsChange(e.target.checked)}
              className="rounded border-gray-600 bg-transparent"
            />
            <span>Open Markets Only</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {topMovers.map((mover) => (
          <MarketMoverCard
            key={mover.market_id}
            title={mover.question}
            price={mover.price}
            change={mover.price_change}
            volume={mover.volume}
          />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className={`w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center gap-2 ${
            isLoadingMore ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
          {isLoadingMore ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}

export default TopMoversList