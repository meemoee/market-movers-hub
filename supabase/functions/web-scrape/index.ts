
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  queries: string[];
  marketId?: string;
  marketDescription?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Create a TransformStream to stream the response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Process async and return the stream
  (async () => {
    try {
      const { queries, marketId, marketDescription } = await req.json() as RequestBody;
      
      console.log(`Processing web-scrape for market ID: ${marketId}`);
      console.log(`Market description: ${marketDescription?.substring(0, 100)}${marketDescription?.length > 100 ? '...' : ''}`);
      console.log(`Queries to process: ${queries.length}`);
      
      // Send initial message
      await writer.write(
        new TextEncoder().encode(`data: ${JSON.stringify({
          type: "message",
          message: `Starting web search with ${queries.length} queries for market: ${marketId}`,
        })}\n\n`)
      );

      // Process each query with some delay to avoid rate limits
      let hasResults = false;
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        
        // Message about current query
        await writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify({
            type: "message",
            message: `Processing query ${i + 1}/${queries.length}: ${query}`,
          })}\n\n`)
        );

        try {
          // Enhanced query with market context
          let enhancedQuery = query;
          if (marketDescription && !query.includes(marketDescription.substring(0, 20))) {
            // Only enhance if the query doesn't already contain part of the market description
            const shortMarketDesc = marketDescription.split(' ').slice(0, 5).join(' ');
            enhancedQuery = `${query} ${shortMarketDesc}`.substring(0, 350);
          }
          
          console.log(`Enhanced query (${i + 1}/${queries.length}): ${enhancedQuery}`);

          // Add a delay between requests to avoid hitting rate limits
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Call the Brave search function
          const searchResponse = await fetch(
            new URL("/brave-search", req.url),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query: enhancedQuery }),
            }
          );

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            throw new Error(`Brave search failed: ${searchResponse.status} ${errorText}`);
          }

          const searchResults = await searchResponse.json();

          if (!searchResults || !Array.isArray(searchResults.webPages?.value) || searchResults.webPages.value.length === 0) {
            console.log(`No results found for query: ${enhancedQuery}`);
            continue;
          }

          // Process the search results
          const searchEntries = searchResults.webPages.value.slice(0, 5);
          
          const results = [];
          for (const entry of searchEntries) {
            try {
              const { url, name: title, snippet } = entry;
              
              // Basic validation of URL
              if (!url || typeof url !== 'string' || !url.startsWith('http')) {
                console.log(`Skipping invalid URL: ${url}`);
                continue;
              }

              console.log(`Processing URL: ${url}`);
              
              // Make a simple request to fetch the page content
              const response = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
              });

              if (!response.ok) {
                console.log(`Failed to fetch ${url}: ${response.status}`);
                continue;
              }

              const contentType = response.headers.get('Content-Type') || '';
              if (!contentType.includes('text/html')) {
                console.log(`Skipping non-HTML content: ${contentType} for ${url}`);
                continue;
              }

              const html = await response.text();
              
              // Extract a simplified version of the content
              let content = '';
              const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
              if (bodyMatch && bodyMatch[1]) {
                // Simple text extraction by removing HTML tags
                content = bodyMatch[1]
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
              } else {
                // Fallback to using meta description and title
                const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) 
                                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
                const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
                content = [
                  titleMatch ? titleMatch[1] : '',
                  descriptionMatch ? descriptionMatch[1] : '',
                  snippet || '',
                ].filter(Boolean).join(' - ');
              }

              // Truncate content to a reasonable length
              content = content.substring(0, 10000);
              
              if (content.length > 100) {
                results.push({
                  url,
                  title: title || url,
                  content,
                });
                hasResults = true;
              }
            } catch (error) {
              console.error(`Error processing search result: ${error.message}`);
              continue;
            }
          }

          // Send results for this query
          if (results.length > 0) {
            await writer.write(
              new TextEncoder().encode(`data: ${JSON.stringify({
                type: "results",
                data: results,
              })}\n\n`)
            );
          } else {
            await writer.write(
              new TextEncoder().encode(`data: ${JSON.stringify({
                type: "message",
                message: `No useful content found for query: ${query}`,
              })}\n\n`)
            );
          }
        } catch (error) {
          console.error(`Error processing query "${query}": ${error.message}`);
          
          await writer.write(
            new TextEncoder().encode(`data: ${JSON.stringify({
              type: "error",
              message: `Error processing query "${query}": ${error.message}`,
            })}\n\n`)
          );
          
          // Continue with the next query
          continue;
        }
      }

      if (!hasResults) {
        await writer.write(
          new TextEncoder().encode(`data: ${JSON.stringify({
            type: "error",
            message: "No results found for any queries",
          })}\n\n`)
        );
      }

      // Send completion signal
      await writer.write(new TextEncoder().encode(`data: [DONE]\n\n`));
    } catch (error) {
      console.error(`Global error in web-scrape: ${error.message}`);
      
      await writer.write(
        new TextEncoder().encode(`data: ${JSON.stringify({
          type: "error",
          message: `Error: ${error.message}`,
        })}\n\n`)
      );
      
      await writer.write(new TextEncoder().encode(`data: [DONE]\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
