
import { BraveSearchResult } from "./types.ts";

// Constants for content fetching
const MAX_CONTENT_RETRIES = 2; // Max retries for content fetching
const FETCH_TIMEOUT_MS = 5000; // 5 second timeout for content fetches

/**
 * Fetches and processes web page content from search results
 * @param webPages Array of web pages from Brave search results
 * @param jobId Job ID for logging
 * @returns Array of processed page results with content
 */
export async function fetchPageContents(webPages: any[], jobId: string) {
  console.log(`[Background][${jobId}] Fetching content for ${webPages.length} pages`);
  
  const pageResults = await Promise.all(webPages.map(async (page) => {
    let retries = 0;
    let contentBackoffDelay = 1000;
    
    while (retries <= MAX_CONTENT_RETRIES) {
      try {
        // Use a timeout for each content fetch
        const contentAbortController = new AbortController();
        const contentTimeoutId = setTimeout(() => contentAbortController.abort(), FETCH_TIMEOUT_MS);
        
        const contentResponse = await fetch(page.url, {
          signal: contentAbortController.signal
        });
        
        clearTimeout(contentTimeoutId);
        
        if (!contentResponse.ok) {
          console.log(`[Background][${jobId}] Failed to fetch content for ${page.url}, using description`, {
            status: contentResponse.status,
            url: page.url,
            fallbackContentLength: page.description.length
          });
          return {
            url: page.url,
            title: page.title,
            content: page.description
          };
        }
        
        const html = await contentResponse.text();
        const text = html
          .replace(/<head>.*?<\/head>/s, '')
          .replace(/<style>.*?<\/style>/gs, '')
          .replace(/<script>.*?<\/script>/gs, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        
        const contentLength = text.length;
        console.log(`[Background][${jobId}] Successfully fetched content from ${page.url}`, {
          url: page.url,
          contentLength,
          truncated: contentLength > 15000
        });
        
        return {
          url: page.url,
          title: page.title,
          content: text.slice(0, 15000)
        };
      } catch (error) {
        retries++;
        
        if (error.name === 'AbortError' || retries > MAX_CONTENT_RETRIES) {
          console.log(`[Background][${jobId}] Fetch timeout or max retries for ${page.url}, using description`, {
            errorType: error.name === 'AbortError' ? 'timeout' : 'maxRetries',
            url: page.url,
            retries
          });
          return {
            url: page.url,
            title: page.title,
            content: page.description
          };
        }
        
        console.error(`[Background][${jobId}] Error fetching content for ${page.url}, retry ${retries}/${MAX_CONTENT_RETRIES}:`, {
          errorMessage: error.message,
          errorName: error.name,
          url: page.url,
          retryCount: retries,
          backoffDelay: contentBackoffDelay
        });
        await new Promise(resolve => setTimeout(resolve, contentBackoffDelay));
        contentBackoffDelay *= 2; // Exponential backoff
      }
    }
    
    // Fallback if loop exits without returning
    return {
      url: page.url,
      title: page.title,
      content: page.description
    };
  }));
  
  // Filter out empty results
  return pageResults.filter(r => r.content && r.content.length > 0);
}
