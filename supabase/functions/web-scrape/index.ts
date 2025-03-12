
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { SearchResponse, SSEMessage } from "./types.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { queries, marketId, focusText } = await req.json();
    
    // Log incoming data for debugging
    console.log(`Received request with ${queries?.length || 0} queries, marketId: ${marketId}, focusText: ${typeof focusText === 'string' ? focusText : 'not a string'}`);
    
    // Ensure queries don't have the market ID accidentally appended
    const cleanedQueries = queries.map((query: string) => {
      return query.replace(new RegExp(` ${marketId}$`), '').trim();
    });
    
    if (!cleanedQueries || !Array.isArray(cleanedQueries) || cleanedQueries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid queries parameter' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }
    
    // Instead of a stream, we'll collect all messages and results
    const messages: SSEMessage[] = [];
    let allResults: Array<{ url: string; title: string; content: string }> = [];
    
    try {
      for (const [index, query] of cleanedQueries.entries()) {
        const currentIteration = index + 1;
        
        // Add message
        messages.push({
          type: 'message',
          message: `Processing query ${currentIteration}/${cleanedQueries.length}: ${query}`
        });

        try {
          // Set a reasonable timeout for each search
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout
          
          const braveApiKey = Deno.env.get('BRAVE_API_KEY');
          if (!braveApiKey) {
            throw new Error('BRAVE_API_KEY is not set');
          }
          
          const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': braveApiKey
            },
            signal: abortController.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Brave search returned ${response.status}: ${await response.text()}`);
          }
          
          const data: SearchResponse = await response.json();
          const webPages = data.web?.results || [];
          
          // Get the content for each page
          const pageResults = await Promise.all(webPages.map(async (page) => {
            try {
              // Use a timeout for each content fetch
              const contentAbortController = new AbortController();
              const contentTimeoutId = setTimeout(() => contentAbortController.abort(), 5000); // 5 second timeout
              
              const contentResponse = await fetch(page.url, {
                signal: contentAbortController.signal
              });
              
              clearTimeout(contentTimeoutId);
              
              if (!contentResponse.ok) {
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
              
              // Limit content to prevent large payloads
              return {
                url: page.url,
                title: page.title,
                content: text.slice(0, 15000)
              };
            } catch (error) {
              console.error(`Error fetching content for ${page.url}:`, error);
              return {
                url: page.url,
                title: page.title,
                content: page.description
              };
            }
          }));
          
          // Filter out empty results
          const validResults = pageResults.filter(r => r.content && r.content.length > 0);
          allResults = [...allResults, ...validResults];
          
          // Add results message
          messages.push({
            type: 'results',
            data: validResults
          });
          
        } catch (error) {
          console.error(`Error processing query "${query}":`, error);
          messages.push({
            type: 'error',
            message: `Error searching for "${query}": ${error.message}`
          });
        }
      }
      
      // Save the results to the database if needed
      if (marketId) {
        try {
          // Create a Supabase client for database operations
          const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
          const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
          
          // Check if there's an existing job
          const { data: existingJobs, error: jobError } = await supabase
            .from('research_jobs')
            .select('id')
            .eq('market_id', marketId)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (jobError) {
            console.error('Error checking for existing jobs:', jobError);
          } else {
            const progressLog = messages
              .filter(m => m.type === 'message')
              .map(m => m.message || '');
            
            if (existingJobs && existingJobs.length > 0) {
              // Update existing job
              await supabase
                .from('research_jobs')
                .update({
                  results: allResults,
                  progress_log: progressLog,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingJobs[0].id);
            } else {
              // Create new job
              await supabase
                .from('research_jobs')
                .insert({
                  market_id: marketId,
                  query: focusText || '',
                  results: allResults,
                  progress_log: progressLog,
                  status: 'completed'
                });
            }
          }
        } catch (error) {
          console.error('Error saving research results:', error);
        }
      }
      
      // Return the collected messages and results
      return new Response(
        JSON.stringify({ 
          messages, 
          results: allResults 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
      
    } catch (error) {
      console.error("Error in process queries:", error);
      return new Response(
        JSON.stringify({ 
          error: `Error in search processing: ${error.message}`,
          messages,
          results: allResults
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }
    
  } catch (error) {
    console.error("Error in web-scrape function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
