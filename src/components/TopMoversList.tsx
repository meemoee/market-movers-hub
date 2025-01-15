import { useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import MarketMoverCard from './MarketMoverCard'

interface TimeInterval {
  label: string
  value: string
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

interface TopMover {
  market_id: string
  question: string
  price: number
  price_change: number
  volume: number
  image: string
  yes_sub_title?: string
  final_last_traded_price: number
  final_best_ask: number
  final_best_bid: number
  volume_change: number
  volume_change_percentage: number
  url: string
  outcomes?: string[] | string
  description?: string
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

  const getVolumeColor = (percentage: number): string => {
    const maxPercentage = 100
    const normalizedPercentage = Math.min(Math.abs(percentage), maxPercentage) / maxPercentage
    const startColor = [156, 163, 175] 
    const endColor = [255, 255, 0]

    const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * normalizedPercentage)
    const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * normalizedPercentage)
    const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * normalizedPercentage)

    return `rgb(${r}, ${g}, ${b})`
  }

  const formatVolumeChange = (change: number, volume: number): string => {
    const prefix = change >= 0 ? '+' : ''
    return `${prefix}${change.toLocaleString()} (${((change / volume) * 100).toFixed(1)}%)`
  }

  return (
    <div className="space-y-6 pb-4 max-w-[1200px] mx-auto relative">
      {isLoading && (
        <div className="absolute top-32 inset-x-0 bottom-0 flex justify-center bg-black/50 backdrop-blur-sm z-50 rounded-lg">
          <Loader2 className="w-8 h-8 animate-spin mt-8" />
        </div>
      )}
      
      <div className="sticky top-14 bg-[#1a1b1e] px-4 py-4 z-40 border-b border-l border-r border-white/10 rounded-b-lg mb-6">
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
                <div className="absolute top-full left-0 mt-2 py-2 bg-[#1a1b1e]/80 rounded-xl shadow-2xl border border-white/10 w-40 backdrop-blur-2xl z-50">
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

      <div className="bg-[#1a1b1e] border border-white/10 rounded-lg overflow-hidden">
        {topMovers.map((mover, index) => (
          <div
            key={mover.market_id}
            className={`p-4 ${index !== 0 ? 'border-t border-white/10' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-grow">
                <div className="flex items-start">
                  <img
                    src={mover.image}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover mr-4"
                  />
                  <div>
                    <h3 className="font-bold text-lg mb-2">{mover.question}</h3>
                    {mover.yes_sub_title && (
                      <p className="text-sm text-gray-400">{mover.yes_sub_title}</p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <span className="text-2xl font-bold">
                        {(mover.final_last_traded_price * 100).toFixed(0)}¢
                      </span>
                      <div className="ml-2 flex items-center">
                        {mover.price_change >= 0 ? (
                          <>
                            <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-green-500">
                              +{(mover.price_change * 100).toFixed(1)}¢
                            </span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                            <span className="text-red-500">
                              {(mover.price_change * 100).toFixed(1)}¢
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-400">
                      Vol: ${mover.volume.toLocaleString()}
                    </div>
                  </div>

                  {/* Price change visualization bar */}
                  <div className="relative h-[2px] w-full mt-4">
                    <div 
                      className="absolute bg-white/50 h-1 top-[-2px]" 
                      style={{ width: `${Math.abs(mover.final_last_traded_price * 100)}%` }}
                    />
                    {mover.price_change > 0 ? (
                      <div 
                        className="absolute bg-green-900/90 h-1 top-[-2px]" 
                        style={{ 
                          width: `${Math.abs(mover.price_change * 100)}%`,
                          right: `${100 - Math.abs(mover.final_last_traded_price * 100)}%`
                        }}
                      />
                    ) : (
                      <div 
                        className="absolute bg-red-500/50 h-1 top-[-2px]" 
                        style={{ 
                          width: `${Math.abs(mover.price_change * 100)}%`,
                          left: `${Math.abs(mover.final_last_traded_price * 100)}%`
                        }}
                      />
                    )}
                  </div>

                  {/* Volume change indicator */}
                  <div className="mt-2">
                    <span 
                      className="text-xs font-bold"
                      style={{ color: getVolumeColor(mover.volume_change_percentage) }}
                    >
                      {formatVolumeChange(mover.volume_change, mover.volume)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Market platform logo */}
              <a 
                href={mover.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <img
                  src={mover.url.includes('polymarket') ? '/images/PolymarketLogo.png' : '/images/KalshiLogo.png'}
                  alt={mover.url.includes('polymarket') ? 'Polymarket' : 'Kalshi'}
                  className="w-6 h-6"
                />
              </a>
            </div>
          </div>
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