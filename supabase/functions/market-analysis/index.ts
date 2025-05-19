
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const REQUEST_TIMEOUT_MS = 60000 // 60 second timeout

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory, userId } = await req.json()
    console.log('Received request:', { message, chatHistory, userId: userId ? 'provided' : 'not provided' })

    // Determine which API key to use
    let apiKey = OPENROUTER_API_KEY;

    // If userId is provided, try to get their personal API key
    if (userId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', userId)
        .single()

      if (!error && data?.openrouter_api_key) {
        console.log('Using user-provided API key')
        apiKey = data.openrouter_api_key
      } else if (error) {
        console.error('Error fetching user API key:', error)
      }
    }

    if (!apiKey) {
      throw new Error('No API key available for OpenRouter')
    }

    console.log('Making request to OpenRouter API...')
    
    // Create AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort('Request timeout');
      console.error('OpenRouter API request timed out after', REQUEST_TIMEOUT_MS, 'ms');
    }, REQUEST_TIMEOUT_MS);
    
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Hunchex Analysis',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Be concise and clear in your responses."
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: true
      }),
      signal: abortController.signal
    })
    
    // Clear the timeout once we have a response
    clearTimeout(timeoutId);

    // Detailed error handling for non-OK responses
    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('OpenRouter API error:', openRouterResponse.status, errorText);
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} - ${errorText}`);
    }

    console.log('Streaming response from OpenRouter', 
      'status:', openRouterResponse.status,
      'headers:', JSON.stringify([...openRouterResponse.headers.entries()]));
    
    // Check if the response body exists
    if (!openRouterResponse.body) {
      console.error('OpenRouter response body is null');
      return new Response(JSON.stringify({ error: 'Response body is null' }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Transform the stream to add debugging information and health checks
    const { readable, writable } = new TransformStream();
    
    const reader = openRouterResponse.body.getReader();
    const writer = writable.getWriter();
    
    // Process the stream
    (async () => {
      try {
        let chunkCount = 0;
        let lastChunkTime = Date.now();
        let totalContentBytes = 0;
        
        // Send an initial empty data message to establish the connection
        const initialChunk = new TextEncoder().encode('data: {"choices":[{"delta":{"content":""}}]}\n\n');
        await writer.write(initialChunk);
        console.log('Sent initial connection chunk');
        
        // Immediate heartbeat to confirm stream is working
        const heartbeatChunk = new TextEncoder().encode(': heartbeat\n\n');
        await writer.write(heartbeatChunk);
        
        while (true) {
          const { done, value } = await reader.read();
          const now = Date.now();
          
          if (done) {
            console.log('Stream finished normally after', chunkCount, 'chunks');
            // Ensure we send a final properly formatted SSE event
            const finalHeartbeat = new TextEncoder().encode(': final\n\n');
            await writer.write(finalHeartbeat);
            // Send a final "DONE" marker
            const doneChunk = new TextEncoder().encode('data: [DONE]\n\n');
            await writer.write(doneChunk);
            await writer.close();
            break;
          }
          
          chunkCount++;
          lastChunkTime = now;
          totalContentBytes += value.length;
          
          // Log the raw chunk for debugging
          const chunkText = new TextDecoder().decode(value);
          console.log(`Raw chunk ${chunkCount}: ${value.length} bytes, content length: ${chunkText.length}`);
          
          // CRITICAL: Ensure chunk is properly formatted as SSE events
          let processedChunk = chunkText;
          
          // Make sure each event has proper formatting - add "data: " prefix if missing
          const lines = processedChunk.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() && !lines[i].startsWith('data: ') && !lines[i].startsWith(':')) {
              // Line might be JSON without "data: " prefix
              if (lines[i].startsWith('{') || lines[i].includes('"choices"')) {
                lines[i] = 'data: ' + lines[i];
              }
            }
          }
          processedChunk = lines.join('\n');
          
          // Ensure chunk ends with double newline for proper SSE format
          if (!processedChunk.endsWith('\n\n')) {
            if (processedChunk.endsWith('\n')) {
              processedChunk += '\n';
            } else {
              processedChunk += '\n\n';
            }
          }
          
          // Write the processed chunk to the output stream
          await writer.write(new TextEncoder().encode(processedChunk));
          
          // Log chunk info periodically
          if (chunkCount % 10 === 0) {
            console.log(`Processed ${chunkCount} chunks (${totalContentBytes} bytes) so far`);
          }
          
          // Insert heartbeat events if there's too much time between chunks
          if (chunkCount > 0 && chunkCount % 5 === 0) {
            const heartbeatChunk = new TextEncoder().encode(': heartbeat\n\n');
            await writer.write(heartbeatChunk);
          }
        }
      } catch (err) {
        console.error('Error processing stream:', err);
        
        // Try to send an error message to the client
        try {
          const errorMsg = new TextEncoder().encode(`data: {"error":"${err.message || 'Unknown error'}"}\n\n`);
          await writer.write(errorMsg);
        } catch (writeErr) {
          console.error('Failed to write error to stream:', writeErr);
        }
        
        writer.abort(err);
      }
    })();

    // Return the transformed stream with detailed headers
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
        'X-Stream-Debug': 'enhanced'
      }
    });

  } catch (error) {
    console.error('Error in market-analysis function:', error);
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
})
