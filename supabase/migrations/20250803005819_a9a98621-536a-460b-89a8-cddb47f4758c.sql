-- Create efficient function to get latest prices for multiple markets
CREATE OR REPLACE FUNCTION public.get_latest_prices_for_markets(market_ids text[])
RETURNS TABLE(
  market_id text,
  yes_price numeric,
  no_price numeric,
  best_bid numeric,
  best_ask numeric,
  last_traded_price numeric,
  volume numeric,
  liquidity numeric
) 
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (mp.market_id)
    mp.market_id,
    mp.yes_price,
    mp.no_price,
    mp.best_bid,
    mp.best_ask,
    mp.last_traded_price,
    mp.volume,
    mp.liquidity
  FROM market_prices mp
  WHERE mp.market_id = ANY(market_ids)
    AND mp.last_traded_price IS NOT NULL
    AND mp.last_traded_price > 0
    AND mp.last_traded_price < 1
  ORDER BY mp.market_id, mp.timestamp DESC;
END;
$function$;