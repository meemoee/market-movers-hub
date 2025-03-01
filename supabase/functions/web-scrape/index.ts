
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SearchResult {
  url: string;
  title: string;
  description?: string;
}

interface WebContent {
  url: string;
  content: string;
  title?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Set up SSE response headers
  const headers = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  try {
    const { queries } = await req.json();
    
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      throw new Error('Invalid or empty queries array');
    }

    // Create a transform stream for SSE responses
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start the stream
    const sendMessage = async (type: string, message: string) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type, message })}\n\n`));
    };

    const sendResults = async (results: WebContent[]) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'results', data: results })}\n\n`));
    };

    // Start processing in the background
    (async () => {
      try {
        await sendMessage('progress', 'Starting web research...');
        
        const allResults: WebContent[] = [];
        
        // Process each query
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          await sendMessage('progress', `Processing query ${i+1}/${queries.length}: ${query}`);
          
          // Get search results from Brave
          const searchResults = await fetchSearchResults(query);
          
          if (searchResults.length === 0) {
            await sendMessage('progress', `No search results found for query: ${query}`);
            continue;
          }
          
          await sendMessage('progress', `Found ${searchResults.length} search results for query: ${query}`);
          
          // Process each search result
          const batchSize = 3; // Process 3 URLs at a time
          for (let j = 0; j < searchResults.length; j += batchSize) {
            const batch = searchResults.slice(j, j + batchSize);
            await sendMessage('progress', `Fetching content from ${j+1}-${Math.min(j+batchSize, searchResults.length)} of ${searchResults.length} URLs...`);
            
            // Process batch in parallel
            const batchResults = await Promise.all(
              batch.map(result => fetchContentFromUrl(result))
            );
            
            // Filter out null results and add to the collection
            const validResults = batchResults.filter(Boolean) as WebContent[];
            allResults.push(...validResults);
            
            // Send batch results to client
            if (validResults.length > 0) {
              await sendResults(validResults);
            }
          }
        }
        
        // Finish with final stats
        await sendMessage('progress', `Research complete. Collected content from ${allResults.length} pages.`);
        
        // Close the stream
        await writer.close();
      } catch (error) {
        console.error('Error in web scraping process:', error);
        await sendMessage('error', `Error: ${error.message}`);
        await writer.close();
      }
    })();

    return new Response(readable, { headers });
  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  console.log(`Fetching search results for: ${query}`);
  
  try {
    const response = await fetch(
      `http://localhost:54321/functions/v1/brave-search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, count: 10 }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave search API error: ${response.status} - ${errorText}`);
      return [];
    }

    const results = await response.json();
    
    if (!Array.isArray(results)) {
      console.error('Unexpected search results format:', results);
      return [];
    }
    
    return results.filter(result => result && result.url);
  } catch (error) {
    console.error('Error fetching search results:', error);
    return [];
  }
}

async function fetchContentFromUrl(result: SearchResult): Promise<WebContent | null> {
  try {
    console.log(`Fetching content from: ${result.url}`);
    
    // Check if URL is valid
    let url: URL;
    try {
      url = new URL(result.url);
    } catch (e) {
      console.error(`Invalid URL: ${result.url}`);
      return null;
    }
    
    // Skip URLs that are likely to be problematic
    const skipDomains = ['linkedin.com', 'instagram.com', 'facebook.com', 'twitter.com'];
    if (skipDomains.some(domain => url.hostname.includes(domain))) {
      console.log(`Skipping social media URL: ${result.url}`);
      return null;
    }
    
    // Skip file downloads
    const fileExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip', '.rar'];
    if (fileExtensions.some(ext => url.pathname.toLowerCase().endsWith(ext))) {
      console.log(`Skipping file download URL: ${result.url}`);
      return null;
    }
    
    // Attempt to fetch the URL with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(result.url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`HTTP error ${response.status} for URL: ${result.url}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // Skip non-HTML content
    if (!contentType.includes('text/html')) {
      console.log(`Skipping non-HTML content (${contentType}): ${result.url}`);
      return null;
    }
    
    const html = await response.text();
    
    // Simple HTML parsing to extract text
    const textContent = extractTextFromHtml(html);
    
    if (!textContent || textContent.length < 100) {
      console.log(`Not enough text content from URL: ${result.url}`);
      return null;
    }
    
    const title = extractTitleFromHtml(html) || result.title;
    
    return {
      url: result.url,
      content: textContent,
      title
    };
  } catch (error) {
    console.error(`Error fetching ${result.url}:`, error);
    return null;
  }
}

function extractTextFromHtml(html: string): string {
  // First, try to clean up the HTML 
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')    // Remove styles
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')          // Remove SVGs
    .replace(/<[^>]*>/g, ' ')                                           // Remove all other HTML tags
    .replace(/&nbsp;/g, ' ')                                            // Replace &nbsp; with space
    .replace(/\s+/g, ' ')                                               // Replace multiple spaces with a single space
    .trim();
  
  // Split the text into lines and filter out empty ones
  const lines = cleanHtml.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Join the lines with newlines
  return lines.join('\n');
}

function extractTitleFromHtml(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  return null;
}
