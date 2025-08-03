-- Add indexes to market_prices table for better performance
CREATE INDEX IF NOT EXISTS idx_market_prices_market_timestamp 
ON market_prices (market_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_market_prices_market_price_filter 
ON market_prices (market_id, last_traded_price) 
WHERE last_traded_price IS NOT NULL 
AND last_traded_price > 0 
AND last_traded_price < 1;

-- Add index for general price queries
CREATE INDEX IF NOT EXISTS idx_market_prices_timestamp_desc 
ON market_prices (timestamp DESC);