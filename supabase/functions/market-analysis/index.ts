import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

function processJsonFields(df: any[]) {
  try {
    df = df.filter(row => row.closed !== true)
    const numericFields = ['volume', 'liquidity', 'yes_price', 'no_price', 
                         'best_bid', 'best_ask', 'last_traded_price']
    
    df.forEach(row => {
      numericFields.forEach(field => {
        row[field] = parseFloat(row[field]) || 0
      })
    })
  } catch (error) {
    console.error(`Error processing fields: ${error}`)
  }
  return df
}

async function fetchMarketData() {
  console.log("Fetching from database...")
  const startTime = Date.now()

  try {
    const { data: latestPrices, error: pricesError } = await supabase
      .from('market_prices')
      .select('*')
      .order('timestamp', { ascending: false })

    if (pricesError) throw pricesError

    const latestPricesMap: Record<string, any> = {}
    latestPrices?.forEach(price => {
      if (!latestPricesMap[price.market_id] || 
          price.timestamp > latestPricesMap[price.market_id].timestamp) {
        latestPricesMap[price.market_id] = price
      }
    })

    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select(`
        *,
        events (
          title,
          category,
          sub_title,
          mutually_exclusive
        )
      `)
      .filter('closed', 'eq', false)
      .or('end_date.gt.now,end_date.is.null')
      .order('updated_at', { ascending: false })

    if (marketsError) throw marketsError

    const result = markets?.map(market => ({
      ...market,
      event_title: market.events?.title,
      event_category: market.events?.category,
      event_subtitle: market.events?.sub_title,
      event_mutually_exclusive: market.events?.mutually_exclusive,
      ...latestPricesMap[market.id]
    }))

    console.log(`Fetched ${result?.length} records in ${(Date.now() - startTime) / 1000} seconds`)
    return processJsonFields(result || [])
  } catch (error) {
    console.error("Error fetching market data:", error)
    throw error
  }
}

async function getStructuredQuery(userInput: any) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: `You are an advanced market analysis assistant. CRITICAL CONTEXT PROCESSING RULES:
1. ALWAYS analyze the entire chat history before generating a response
2. Identify key topics, entities, and themes from previous messages
3. Use previous conversation context to:
   - Refine search queries
   - Provide more targeted and relevant market suggestions
   - Maintain continuity with previous discussions`
          },
          {
            role: "user",
            content: `Chat History:\n${userInput.chatHistory || 'No previous chat history'}\n\nCurrent Query: ${userInput.message}`
          }
        ],
        temperature: 0.2
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    const queries = content.split('\n')
      .filter(line => {
        line = line.trim()
        return line.startsWith('df[') || 
               line.includes('.sort_values') || 
               line.includes('.head(') ||
               line.includes('.query(')
      })
      .map(q => q.trim())
      .filter(q => q)
    
    return queries.slice(0, 3)
  } catch (error) {
    console.error("Error getting structured query:", error)
    return null
  }
}

async function processMarketQuery(data: any[], query: string) {
  try {
    let filteredData = [...data]
    
    const containsPattern = /str\.contains\('([^']+)', *case=False\)/
    const containsMatch = query.match(containsPattern)
    if (containsMatch) {
      const searchTerms = containsMatch[1].split('|').map(term => term.trim().toLowerCase())
      console.log('Processing search terms:', searchTerms)
      
      filteredData = filteredData.filter(market => 
        market.question && searchTerms.some(term => 
          market.question.toLowerCase().includes(term)
        )
      )
    }

    const sortPattern = /sort_values\('([^']+)'.*\)/
    const sortMatch = query.match(sortPattern)
    if (sortMatch) {
      const sortField = sortMatch[1]
      filteredData.sort((a, b) => (b[sortField] || 0) - (a[sortField] || 0))
    }

    const headPattern = /\.head\((\d+)\)/
    const headMatch = query.match(headPattern)
    const requestedLimit = headMatch ? parseInt(headMatch[1]) : 25
    filteredData = filteredData.slice(0, Math.min(requestedLimit, 25))

    return filteredData
  } catch (error) {
    console.error("Error processing market query:", error)
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory } = await req.json()

    // Get structured queries from LLM
    const queries = await getStructuredQuery({ message, chatHistory })
    if (!queries) {
      throw new Error("Failed to generate structured queries")
    }

    // Fetch market data
    const marketData = await fetchMarketData()

    // Process each query and combine results
    let allResults: any[] = []
    for (const query of queries) {
      const results = await processMarketQuery(marketData, query)
      allResults = [...allResults, ...results]
    }

    // Remove duplicates based on market ID
    const uniqueResults = Array.from(
      new Map(allResults.map(item => [item.id, item])).values()
    )

    // Get final synthesis from LLM
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a market analysis assistant. Use the chat history to provide context for your responses."
          },
          {
            role: "user",
            content: `Analyze these prediction market results and provide a concise synthesis.
Today's Date: ${new Date().toISOString().split('T')[0]}
Query: "${message}"

Market Results:
${uniqueResults.map(market => `
- ${market.question} (${market.id})
  Price: Yes=${market.yes_price?.toFixed(3) || 'N/A'} No=${market.no_price?.toFixed(3) || 'N/A'}
  Volume: $${market.volume?.toLocaleString()}
  Liquidity: $${market.liquidity?.toLocaleString()}
  End Date: ${market.end_date || 'N/A'}
`).join('\n')}

Response (2-3 sentences only):`
          }
        ],
        temperature: 0.2
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const synthesis = await response.json()
    
    return new Response(
      JSON.stringify({
        markets: uniqueResults,
        synthesis: synthesis.choices[0].message.content
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  } catch (error) {
    console.error('Error in market-analysis function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})