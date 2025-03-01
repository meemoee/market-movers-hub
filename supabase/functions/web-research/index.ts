// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  marketId: string;
  query?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get and validate request data
  const { marketId, query } = await req.json() as RequestBody;
  console.log('Web research request for market:', marketId, 'with query:', query);

  try {
    // Get market details if needed for context
    const { data: marketData, error: marketError } = await supabase
      .from('markets')
      .select('question, description')
      .eq('id', marketId)
      .single();

    if (marketError) {
      console.error('Error fetching market data:', marketError);
      return new Response(
        JSON.stringify({ error: `Failed to fetch market: ${marketError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate search queries
    let queries: string[] = [];

    if (query) {
      // If a specific query was provided, use only that
      queries = [query];
    } else {
      // Otherwise, generate queries based on the market
      console.log('Generating queries based on market:', marketData?.question);
      
      // Call the generate-queries function to get search queries
      const { data: generatedQueries, error: queryError } = await supabase.functions.invoke('generate-queries', {
        body: { marketId }
      });

      if (queryError) {
        console.error('Error generating queries:', queryError);
        return new Response(
          JSON.stringify({ error: `Failed to generate queries: ${queryError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      queries = generatedQueries || [];
    }

    if (queries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid search queries could be generated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Using search queries:', queries);

    // Create readable stream and encoder for streaming back results
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Process each query
          for (let i = 0; i < queries.length; i++) {
            const currentQuery = queries[i];
            console.log(`Processing query ${i+1}/${queries.length}: "${currentQuery}"`);
            
            try {
              // Call Brave search with the current query
              const { data: braveResults, error: braveError } = await supabase.functions.invoke('brave-search', {
                body: { query: currentQuery }
              });

              if (braveError) {
                console.error(`Error with Brave search for query "${currentQuery}":`, braveError);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: "error", 
                  message: `Error processing query "${currentQuery}": ${braveError.message}` 
                })}\n\n`));
                continue;
              }

              if (!braveResults || !braveResults.web?.results || braveResults.web.results.length === 0) {
                console.log(`No results found for query "${currentQuery}"`);
                continue;
              }

              // Get URLs from Brave search results
              const urls = braveResults.web.results
                .map((result: any) => result.url)
                .filter((url: string) => url && !url.includes("youtube.com") && !url.includes("twitter.com"));

              if (urls.length === 0) {
                console.log(`No valid URLs found for query "${currentQuery}"`);
                continue;
              }

              // Send the query info to the client
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: "query", 
                query: currentQuery,
                resultCount: urls.length
              })}\n\n`));

              // Web scrape each URL
              for (let j = 0; j < Math.min(urls.length, 5); j++) {
                const url = urls[j];
                console.log(`Scraping URL ${j+1}/${Math.min(urls.length, 5)} for query "${currentQuery}": ${url}`);
                
                // Send status update to client
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: "progress", 
                  message: `Scraping ${url}`,
                  current: j + 1,
                  total: Math.min(urls.length, 5),
                  query: currentQuery
                })}\n\n`));

                try {
                  // Call web-scrape with the market info for context
                  const { data: scrapeResult, error: scrapeError } = await supabase.functions.invoke('web-scrape', {
                    body: { 
                      url,
                      marketQuestion: marketData.question,
                      marketDescription: marketData.description
                    }
                  });

                  if (scrapeError) {
                    console.error(`Error scraping ${url}:`, scrapeError);
                    continue;
                  }

                  if (!scrapeResult || !scrapeResult.content || scrapeResult.content.trim() === '') {
                    console.log(`No content extracted from ${url}`);
                    continue;
                  }

                  // Send the scraped content to the client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: "content", 
                    url,
                    title: scrapeResult.title || '',
                    content: scrapeResult.content,
                    query: currentQuery
                  })}\n\n`));
                } catch (scrapeErr) {
                  console.error(`Error during scraping of ${url}:`, scrapeErr);
                }
              }
            } catch (queryErr) {
              console.error(`Error processing query "${currentQuery}":`, queryErr);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: "error", 
                message: `Error processing query "${currentQuery}": ${queryErr.message}` 
              })}\n\n`));
            }
          }

          // Check if any successful results were returned
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: "error", 
            message: `Stream processing error: ${error.message}` 
          })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Error in web research function:', error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
