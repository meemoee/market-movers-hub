
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SearchResult {
  url: string;
  name: string;
  snippet: string;
}

interface ResearchResult {
  url: string;
  content: string;
  title?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Create a ReadableStream to allow sending events
  const stream = new ReadableStream({
    start(controller) {
      const textEncoder = new TextEncoder();
      
      const sendEvent = (data: any) => {
        controller.enqueue(textEncoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const collectWebContent = async () => {
        try {
          const { queries } = await req.json();
          
          if (!queries || !Array.isArray(queries)) {
            throw new Error("Queries parameter must be provided as an array");
          }

          let allResults: SearchResult[] = [];
          
          for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            sendEvent({ type: 'message', message: `Processing query ${i+1}/${queries.length}: ${query}` });
            
            try {
              // Call the Brave search API via our Supabase function
              const response = await fetch(
                `${req.url.split('/web-scrape')[0]}/brave-search`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ query }),
                }
              );
              
              if (!response.ok) {
                sendEvent({ 
                  type: 'message', 
                  message: `Error searching for "${query}": ${response.status}` 
                });
                continue;
              }
              
              const searchResults = await response.json();
              allResults = [...allResults, ...searchResults];
              
              // De-duplicate results by URL
              const uniqueUrls = new Set();
              allResults = allResults.filter(result => {
                if (uniqueUrls.has(result.url)) {
                  return false;
                }
                uniqueUrls.add(result.url);
                return true;
              });
              
              sendEvent({ 
                type: 'message', 
                message: `Found ${searchResults.length} results for "${query}"` 
              });
            } catch (error) {
              console.error(`Error searching for "${query}":`, error);
              sendEvent({ 
                type: 'message', 
                message: `Error searching for "${query}": ${error.message}` 
              });
            }
          }
          
          // Process the top results
          const topResults = allResults.slice(0, 15);
          sendEvent({ 
            type: 'message', 
            message: `Processing top ${topResults.length} search results` 
          });
          
          const successfulResults: ResearchResult[] = [];
          
          for (const result of topResults) {
            try {
              sendEvent({ 
                type: 'message', 
                message: `Fetching content from: ${result.url}` 
              });
              
              const content = await fetchAndExtractContent(result.url);
              
              if (content && content.trim()) {
                successfulResults.push({
                  url: result.url,
                  content: content,
                  title: result.name
                });
                
                sendEvent({ 
                  type: 'results', 
                  data: [{ 
                    url: result.url, 
                    content: content, 
                    title: result.name 
                  }] 
                });
              }
            } catch (error) {
              console.error(`Error fetching content from ${result.url}:`, error);
              sendEvent({ 
                type: 'message', 
                message: `Error fetching content from ${result.url}: ${error.message}` 
              });
            }
          }
          
          if (successfulResults.length === 0) {
            sendEvent({ 
              type: 'message', 
              message: `No content could be extracted from search results.` 
            });
          }
          
          sendEvent({ type: 'message', message: `Content extraction complete` });
        } catch (error) {
          console.error("Web scrape error:", error);
          sendEvent({ 
            type: 'error', 
            error: error.message 
          });
        } finally {
          controller.close();
        }
      };
      
      // Start the content collection process
      collectWebContent();
    }
  });
  
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
});

// Helper function to fetch content from a URL
async function fetchAndExtractContent(url: string): Promise<string> {
  try {
    // Skip PDFs, social media, and other non-text content
    if (
      url.endsWith('.pdf') || 
      url.endsWith('.doc') || 
      url.endsWith('.docx') ||
      url.includes('twitter.com') ||
      url.includes('facebook.com') ||
      url.includes('instagram.com') ||
      url.includes('tiktok.com') ||
      url.includes('youtube.com')
    ) {
      throw new Error("Skipping non-text content");
    }
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error fetching content: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
      throw new Error("Not HTML content");
    }
    
    const html = await response.text();
    
    // Use Deno's built-in DOMParser to extract text content
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());
    
    // Extract text from the body
    const textContent = doc.body.textContent || '';
    
    // Basic cleaning of the text content
    const cleanedContent = textContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join(' ')
      .replace(/\s+/g, ' ');
    
    // Limit the content to a reasonable length
    return cleanedContent.slice(0, 10000);
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error);
    throw error;
  }
}
