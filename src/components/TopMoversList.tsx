import { useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Loader2, ChevronUp } from 'lucide-react'
import MarketMoverCard from './MarketMoverCard'
import { Card } from './ui/card'

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
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set())

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(marketId)) {
        newSet.delete(marketId)
      } else {
        newSet.add(marketId)
      }
      return newSet
    })
  }

  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(1)}¢`
  }

  const formatPriceChange = (change: number): string => {
    const prefix = change >= 0 ? '+' : ''
    return `${prefix}${(change * 100).toFixed(1)}¢`
  }

  const formatVolume = (volume: number): string => {
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`
    return `$${volume.toFixed(0)}`
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header Section */}
      <Card className="sticky top-14 bg-card/95 backdrop-blur-sm z-40 mb-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Market Movers</h2>
            <div className="relative">
              <button
                onClick={() => setIsTimeIntervalDropdownOpen(!isTimeIntervalDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent/70 transition-colors"
              >
                <span>{timeIntervals.find(i => i.value === selectedInterval)?.label}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {isTimeIntervalDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 bg-card border border-border rounded-lg shadow-xl">
                  {timeIntervals.map((interval) => (
                    <button
                      key={interval.value}
                      className={`w-full px-4 py-2 text-left hover:bg-accent/50 transition-colors ${
                        selectedInterval === interval.value ? 'bg-accent/30' : ''
                      }`}
                      onClick={() => {
                        setIsTimeIntervalDropdownOpen(false)
                        onIntervalChange(interval.value)
                      }}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={openMarketsOnly}
              onChange={e => onOpenMarketsChange(e.target.checked)}
              className="rounded border-border bg-transparent"
            />
            <span className="text-sm text-muted-foreground">Open Markets Only</span>
          </label>
        </div>
      </Card>

      {/* Markets Grid */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg z-10">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {topMovers.map((mover) => (
            <Card
              key={mover.market_id}
              className="overflow-hidden hover:shadow-lg transition-shadow duration-200"
            >
              <div className="p-4 space-y-4">
                {/* Market Header */}
                <div className="flex gap-3">
                  <img
                    src={mover.image}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-lg leading-tight line-clamp-2">
                      {mover.question}
                    </h3>
                    {mover.yes_sub_title && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {mover.yes_sub_title}
                      </p>
                    )}
                  </div>
                </div>

                {/* Price and Volume Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {formatPrice(mover.final_last_traded_price)}
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium
                      ${mover.price_change >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {mover.price_change >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {formatPriceChange(mover.price_change)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {formatVolume(mover.volume)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      24h Volume
                    </div>
                  </div>
                </div>

                {/* Market Details (Expandable) */}
                <button
                  onClick={() => toggleMarket(mover.market_id)}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expandedMarkets.has(mover.market_id) ? (
                    <>
                      <span>Show less</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Show more</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>

                {expandedMarkets.has(mover.market_id) && (
                  <div className="pt-4 border-t border-border space-y-4">
                    {mover.description && (
                      <p className="text-sm text-muted-foreground">
                        {mover.description}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Best Bid</div>
                        <div className="text-lg font-medium">
                          {formatPrice(mover.final_best_bid)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Best Ask</div>
                        <div className="text-lg font-medium">
                          {formatPrice(mover.final_best_ask)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="mt-6 w-full py-3 bg-accent/50 hover:bg-accent/70 rounded-lg transition-colors
              flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </button>
        )}
      </div>
    </div>
  )
}

export default TopMoversList