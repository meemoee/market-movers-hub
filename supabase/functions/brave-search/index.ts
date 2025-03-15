
import { corsHeaders, braveRequestPool } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const braveApiUrl = "https://api.search.brave.com/res/v1/web/search";

interface BraveSearchParams {
  q: string;
  count?: number;
  offset?: number;
  search_lang?: string;
  country?: string;
  safe_search?: string;
  freshness?: string;
}

interface SearchRequest {
  query: string;
  count?: number;
  offset?: number;
}

// Execute a Brave search with rate limiting and retries
async function executeBraveSearch(url: string, apiKey: string): Promise<Response> {
  const MAX_RETRIES = 3;
  let retries = 0;
  let backoffDelay = 2000; // Start with 2 second backoff
  
  while (retries <= MAX_RETRIES) {
    try {
      // Wait until we can make a request according to our pool
      await braveRequestPool.waitForAvailableSlot();
      
      // Track this request in our pool
      braveRequestPool.trackRequest();
      
      console.log(`Making Brave API request (attempt ${retries + 1})`, {
        requestUrl: url.replace(/q=.*?&/, 'q=[REDACTED]&'), // Log URL with query redacted for privacy
        poolMetrics: braveRequestPool.getMetrics().currentLoad
      });
      
      // Make the request to Brave Search API with proper headers
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
          "x-deno-subhost": "brave-search", // Required header for Deno Deploy
        },
      });
      
      // Log response status
      console.log(`Brave API response status: ${response.status}`, {
        statusCode: response.status,
        statusText: response.statusText,
        retryAttempt: retries
      });
      
      // Check for rate limiting
      if (response.status === 429) {
        retries++;
        console.log(`Rate limited by Brave API, retry ${retries}/${MAX_RETRIES}`, {
          rateExceeded: true,
          retryCount: retries,
          poolStatus: braveRequestPool.getMetrics()
        });
        
        // Check for rate limit headers
        const rateInfo = braveRequestPool.parseRateLimitHeaders(response.headers);
        if (rateInfo.reset > 0) {
          const waitTime = rateInfo.reset * 1000 - Date.now();
          if (waitTime > 0) {
            console.log(`Waiting for rate limit reset: ${waitTime}ms`, {
              waitTimeMs: waitTime,
              resetTimestamp: new Date(rateInfo.reset * 1000).toISOString()
            });
            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 30000))); // Wait for reset or max 30 seconds
          }
        } else {
          // Exponential backoff if no reset header
          console.log(`Applying exponential backoff: ${backoffDelay}ms`, { backoffDelayMs: backoffDelay });
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          backoffDelay *= 2; // Exponential backoff
        }
        continue; // Try again
      }
      
      // If not rate limited but response ok, parse rate limit headers anyway for monitoring
      if (response.ok) {
        braveRequestPool.parseRateLimitHeaders(response.headers);
      }
      
      return response;
    } catch (error) {
      retries++;
      console.error(`Error during Brave search request, retry ${retries}/${MAX_RETRIES}:`, {
        errorMessage: error.message,
        errorName: error.name,
        retryCount: retries,
        backoffDelayMs: backoffDelay,
        poolStatus: braveRequestPool.getMetrics().currentLoad
      });
      
      if (retries <= MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        backoffDelay *= 2; // Exponential backoff
      } else {
        throw error; // Rethrow if max retries exceeded
      }
    }
  }
  
  throw new Error(`Failed to execute Brave search after ${MAX_RETRIES} retries`);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAVE_API_KEY = Deno.env.get("BRAVE_API_KEY");
    if (!BRAVE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BRAVE_API_KEY is not set in environment" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const requestData: SearchRequest = await req.json();
    const { query, count = 5, offset = 0 } = requestData;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Executing Brave search for query: "${query}"`, {
      queryLength: query.length,
      requestedCount: count,
      offset,
      currentPoolMetrics: braveRequestPool.getMetrics()
    });

    const params: BraveSearchParams = {
      q: query,
      count: count,
      offset: offset,
      search_lang: "en",
      country: "US",
      safe_search: "moderate",
    };

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const url = `${braveApiUrl}?${searchParams.toString()}`;

    // Use our new executeBraveSearch function with pooling and retries
    const response = await executeBraveSearch(url, BRAVE_API_KEY);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave API error ${response.status}: ${errorText}`, {
        statusCode: response.status,
        errorText,
        poolMetrics: braveRequestPool.getMetrics()
      });
      
      return new Response(
        JSON.stringify({ 
          error: `Brave search failed: ${response.status} ${errorText}`,
          status: response.status
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const resultCount = data.web?.results?.length || 0;
    
    console.log(`Brave search success: Found ${resultCount} results`, {
      resultCount,
      querySuccess: true,
      responseTimeMs: Date.now() - parseInt(response.headers.get('date') || '0'),
      poolMetricsAfter: braveRequestPool.getMetrics()
    });

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Brave search error:", {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
      poolMetrics: braveRequestPool.getMetrics()
    });
    
    return new Response(
      JSON.stringify({ error: `Brave search error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
