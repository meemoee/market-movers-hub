
import { corsHeaders } from '../_shared/cors.ts';
import { SSEMessage } from './types';

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const CONTENT_CHAR_LIMIT = 2000; // Limit content length per source
const MAX_SOURCES = 10; // Aim to collect up to 10 sources

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries } = await req.json();
    
    // Validate input
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No search queries provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start processing in the background
    EdgeRuntime.waitUntil((async () => {
      try {
        console.log('Starting web scraping with queries:', queries);
        
        // Keep track of unique URLs to avoid duplicates
        const processedUrls = new Set<string>();
        let totalSourcesCollected = 0;

        // Process each query one by one
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          
          // Send progress update
          sendSSE(writer, encoder, {
            type: 'message',
            message: `Processing query ${i+1}/${queries.length}: ${query}`
          });
          
          console.log(`Processing query ${i+1}/${queries.length}: ${query}`);

          // Get search results for this query
          const searchResults = await searchBrave(query);
          
          if (!searchResults || searchResults.length === 0) {
            console.log(`No search results found for query: ${query}`);
            continue;
          }
          
          console.log(`Found ${searchResults.length} search results for query: ${query}`);

          // Process each search result to extract content
          const batchResults = [];
          
          for (const result of searchResults) {
            if (processedUrls.has(result.url)) {
              console.log(`Skipping duplicate URL: ${result.url}`);
              continue;
            }
            
            if (totalSourcesCollected >= MAX_SOURCES) {
              console.log(`Reached maximum number of sources (${MAX_SOURCES}), stopping.`);
              break;
            }

            try {
              console.log(`Scraping content from: ${result.url}`);
              const content = await scrapeContent(result.url);
              
              if (content && content.trim()) {
                processedUrls.add(result.url);
                totalSourcesCollected++;
                
                batchResults.push({
                  url: result.url,
                  title: result.title || new URL(result.url).hostname,
                  content: content.substring(0, CONTENT_CHAR_LIMIT)
                });
              }
            } catch (error) {
              console.error(`Error scraping content from ${result.url}:`, error);
            }
          }
          
          // Send the results collected for this query
          if (batchResults.length > 0) {
            sendSSE(writer, encoder, {
              type: 'results',
              data: batchResults
            });
            
            console.log(`Sent ${batchResults.length} results for query: ${query}`);
          }
          
          // If we've collected enough sources, we can stop
          if (totalSourcesCollected >= MAX_SOURCES) {
            break;
          }
        }
        
        console.log(`Web scraping completed. Total sources collected: ${totalSourcesCollected}`);
        sendSSE(writer, encoder, { type: 'message', message: 'Search Completed' });
        
        // End the stream
        await writer.close();
      } catch (error) {
        console.error('Error in web scraping process:', error);
        
        sendSSE(writer, encoder, {
          type: 'error',
          message: `Error: ${error.message}`
        });
        
        // End the stream on error
        await writer.close();
      }
    })());

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function searchBrave(query: string) {
  const BRAVE_API_KEY = Deno.env.get('BRAVE_API_KEY');
  
  if (!BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY environment variable is not set');
  }
  
  // Sanitize the query
  const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
  
  try {
    console.log(`Searching Brave for: "${sanitizedQuery}"`);
    
    const params = new URLSearchParams({
      q: sanitizedQuery,
      count: '15' // Request more results per query
    });
    
    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search error: ${response.status} - ${errorText}`);
      throw new Error(`Brave search error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Process and return results
    if (!data.web || !data.web.results) {
      console.log(`No web results found in Brave response for query: ${sanitizedQuery}`);
      return [];
    }
    
    return data.web.results.map((item: any) => ({
      url: item.url,
      title: item.title || '',
      description: item.description || ''
    }));
  } catch (error) {
    console.error(`Error searching Brave for "${sanitizedQuery}":`, error);
    throw error;
  }
}

async function scrapeContent(url: string) {
  try {
    console.log(`Fetching URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    
    if (!response.ok) {
      console.error(`HTTP error fetching ${url}: ${response.status}`);
      return '';
    }
    
    const html = await response.text();
    
    // Basic HTML parsing to extract text content
    const parsedContent = parseHtml(html);
    return parsedContent;
  } catch (error) {
    console.error(`Error scraping content from ${url}:`, error);
    return '';
  }
}

function parseHtml(html: string): string {
  // Very basic HTML parser to extract text
  // Remove all script and style elements
  const withoutScripts = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  const withoutStyles = withoutScripts.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  
  // Remove all HTML tags
  const withoutTags = withoutStyles.replace(/<[^>]*>/g, ' ');
  
  // Decode HTML entities
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Normalize whitespace
  const normalized = decoded
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

function sendSSE(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  message: SSEMessage
) {
  try {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    writer.write(encoder.encode(data));
  } catch (error) {
    console.error('Error sending SSE message:', error);
  }
}
