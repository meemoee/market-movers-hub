
import { corsHeaders } from '../_shared/cors.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

const encoder = new TextEncoder();

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Create a new response with a readable stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Process the request in the background
  EdgeRuntime.waitUntil((async () => {
    try {
      const { queries } = await req.json();
      console.log(`Web scrape: Received ${queries.length} queries`);

      if (!queries || !Array.isArray(queries)) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ message: 'Invalid input: queries must be an array' })}\n\n`));
        await writer.close();
        return;
      }

      // Supabase URL from environment variable
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      if (!SUPABASE_URL) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ message: 'SUPABASE_URL is not set' })}\n\n`));
        await writer.close();
        return;
      }

      const results: SearchResult[] = [];

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        console.log(`Web scrape: Processing query ${i + 1}/${queries.length}: ${query}`);
        
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ message: `Processing query ${i + 1}/${queries.length}: ${query}` })}\n\n`)
        );

        try {
          // Call the brave-search function to get search results
          const braveResponse = await fetch(`${SUPABASE_URL}/functions/v1/brave-search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ query, count: 5 })
          });

          if (!braveResponse.ok) {
            const errorText = await braveResponse.text();
            console.error(`Error fetching search results: ${braveResponse.status} - ${errorText}`);
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ 
                message: `Error fetching search results for query "${query}": ${braveResponse.status}` 
              })}\n\n`)
            );
            continue;
          }

          const searchResults = await braveResponse.json();
          console.log(`Web scrape: Received ${searchResults.length} search results for query "${query}"`);

          if (!searchResults || searchResults.length === 0) {
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ 
                message: `No search results found for query "${query}"` 
              })}\n\n`)
            );
            continue;
          }

          // Process each search result to fetch content
          for (const result of searchResults) {
            if (!result.url) continue;
            
            try {
              console.log(`Web scrape: Fetching content from ${result.url}`);
              const contentResponse = await fetch(result.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
                timeout: 10000 // 10 second timeout
              });

              if (!contentResponse.ok) {
                console.log(`Web scrape: Failed to fetch ${result.url}: ${contentResponse.status}`);
                continue;
              }

              const html = await contentResponse.text();
              
              // Simple HTML parsing to extract text content
              const textContent = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();

              // Truncate if too long
              const content = textContent.slice(0, 5000);
              
              if (content) {
                results.push({
                  url: result.url,
                  title: result.title || '',
                  content: content
                } as any);
                
                // Stream the result back to the client
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'results', 
                    data: [{
                      url: result.url,
                      title: result.title || '',
                      content: content
                    }]
                  })}\n\n`)
                );
                
                console.log(`Web scrape: Successfully extracted content from ${result.url} (${content.length} chars)`);
              }
            } catch (error) {
              console.error(`Error processing ${result.url}: ${error.message}`);
            }
          }
        } catch (error) {
          console.error(`Error processing query "${query}": ${error.message}`);
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ 
              message: `Error processing query "${query}": ${error.message}` 
            })}\n\n`)
          );
        }
      }

      if (results.length === 0) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ 
            message: `No content was collected from any of the ${queries.length} queries.` 
          })}\n\n`)
        );
      }

      console.log(`Web scrape: Completed with ${results.length} results`);
      await writer.write(encoder.encode(`data: ${JSON.stringify({ message: "Search Completed" })}\n\n`));
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      console.error(`Web scrape error: ${error.message}`);
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ 
          message: `Error: ${error.message}` 
        })}\n\n`)
      );
    } finally {
      await writer.close();
    }
  })());

  // Return the stream immediately
  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
