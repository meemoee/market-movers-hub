
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SearchParams, SearchResponse, SearchResult } from "./types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebScrapeRequest {
  queries: string[];
  marketId?: string; // Add market ID to request type
  marketDescription?: string; // Add market description for context
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  
  try {
    const { queries, marketId, marketDescription } = await req.json() as WebScrapeRequest;
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      throw new Error('No valid queries provided');
    }
    
    // Log the request with market context for debugging
    console.log(`Web scrape request for market ${marketId || 'unknown'}:`, {
      queries,
      marketDescription: marketDescription?.substring(0, 100)
    });

    const braveApiKey = Deno.env.get('BRAVE_API_KEY');
    const bingApiKey = Deno.env.get('BING_API_KEY');
    
    if (!braveApiKey && !bingApiKey) {
      throw new Error('No search API keys configured');
    }

    const stream = new ReadableStream({
      start: async (controller) => {
        try {
          // Function to send data in SSE format
          const sendData = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          // Search results array to collect all results
          let allResults: SearchResult[] = [];
          
          // Process each query sequentially
          for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            
            // Send progress message
            sendData({
              type: 'message',
              message: `Processing query ${i + 1}/${queries.length}: ${query}`
            });

            // Include market context in the search if available
            const contextualQuery = marketId && marketDescription
              ? `${query} ${marketDescription.substring(0, 50)}`
              : query;
            
            try {
              let results: SearchResult[] = [];
              
              // Try Brave Search first if we have an API key
              if (braveApiKey) {
                try {
                  results = await searchWithBrave(contextualQuery, braveApiKey);
                } catch (error) {
                  console.error(`Error with Brave search for query "${query}":`, error);
                  // Fall back to Bing if Brave fails
                  if (bingApiKey) {
                    results = await searchWithBing(contextualQuery, bingApiKey);
                  }
                }
              } 
              // If no results and we have a Bing key, try Bing
              else if (bingApiKey && results.length === 0) {
                results = await searchWithBing(contextualQuery, bingApiKey);
              }

              if (results.length > 0) {
                sendData({
                  type: 'results',
                  data: results
                });
                
                allResults = [...allResults, ...results];
              } else {
                sendData({
                  type: 'message',
                  message: `No results found for query: ${query}`
                });
              }
            } catch (error) {
              console.error(`Error processing query "${query}":`, error);
              sendData({
                type: 'error',
                message: `Error processing query "${query}": ${error.message}`
              });
            }
          }

          // Send a final summary message
          if (allResults.length > 0) {
            sendData({
              type: 'message',
              message: `Completed web search with ${allResults.length} total results for market ${marketId || 'unknown'}`
            });
          } else {
            sendData({
              type: 'error',
              message: 'No results found for any queries'
            });
          }

          // Close the stream
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  } catch (error) {
    console.error('Web scrape function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

async function searchWithBrave(query: string, apiKey: string): Promise<SearchResult[]> {
  const params: SearchParams = {
    q: query,
    count: 5,
  };

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brave search API error: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  
  if (!data.web || !data.web.results || !Array.isArray(data.web.results)) {
    return [];
  }

  // Process and extract content for each result
  const results: SearchResult[] = [];
  
  for (const result of data.web.results) {
    try {
      if (result.url) {
        const content = await fetchAndExtractContent(result.url);
        
        // Only add results with sufficient content
        if (content && content.length > 100) {
          results.push({
            title: result.title || '',
            url: result.url,
            content: content
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching content for ${result.url}:`, error);
    }
  }

  return results;
}

async function searchWithBing(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = {
    q: query,
    count: 5,
    offset: 0,
    mkt: 'en-US',
    safesearch: 'Moderate',
  };

  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value.toString());
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bing search API error: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  
  if (!data.webPages || !data.webPages.value || !Array.isArray(data.webPages.value)) {
    return [];
  }

  // Process and extract content for each result
  const results: SearchResult[] = [];
  
  for (const result of data.webPages.value) {
    try {
      if (result.url) {
        const content = await fetchAndExtractContent(result.url);
        
        // Only add results with sufficient content
        if (content && content.length > 100) {
          results.push({
            title: result.name || '',
            url: result.url,
            content: content
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching content for ${result.url}:`, error);
    }
  }

  return results;
}

async function fetchAndExtractContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    
    // Skip non-text content
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return '';
    }

    const text = await response.text();
    
    // Basic HTML content extraction
    const cleanedContent = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Remove styles
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
    
    // Return a reasonable amount of content
    return cleanedContent.substring(0, 10000);
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error);
    return '';
  }
}
