import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { marketQuestion, modelId, enableWebSearch, maxSearchResults, userId } = await req.json();
    
    if (!marketQuestion) {
      throw new Error('Market question is required');
    }
    
    console.log(`[HistoricalEvent] Processing request for market question: "${marketQuestion.substring(0, 50)}..."`);
    console.log(`[HistoricalEvent] Options: model=${modelId}, webSearch=${enableWebSearch}, maxResults=${maxSearchResults}, hasUserId=${!!userId}`);

    // Determine which API key to use
    let apiKey = OPENROUTER_API_KEY;

    // If userId is provided, try to get their personal API key
    if (userId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      );

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', userId)
        .single();

      if (!error && data?.openrouter_api_key) {
        console.log('[HistoricalEvent] Using user-provided API key');
        apiKey = data.openrouter_api_key;
      } else if (error) {
        console.error('[HistoricalEvent] Error fetching user API key:', error);
      }
    }

    if (!apiKey) {
      throw new Error('No API key available for OpenRouter');
    }

    // Construct the prompt for historical event generation
    const promptText = `Generate a historical event comparison for the market question: "${marketQuestion}".

Provide a detailed analysis of a historical event that has similarities to this market question. Include:

1. The name of the historical event
2. When it occurred (date or time period)
3. A relevant image that illustrates this event (mention a URL to a relevant image)
4. Several key similarities between this historical event and the current market question
5. Several key differences between this historical event and the current market question

Be thorough in your analysis and explain your reasoning clearly.`;

    // Base request body
    const requestBody: any = {
      model: enableWebSearch ? `${modelId}:online` : modelId,
      messages: [
        { role: "system", content: "You are a helpful assistant that generates historical event comparisons for market analysis." },
        { role: "user", content: promptText }
      ],
      stream: true // Enable streaming
    };
    
    // Add web search plugin configuration if enabled with custom max results
    if (enableWebSearch) {
      requestBody.plugins = [
        {
          id: "web",
          max_results: maxSearchResults
        }
      ];
    }

    const startTime = Date.now();
    console.log(`[HistoricalEvent] [STREAM_START] OpenRouter request initiated at ${new Date().toISOString()}`);
    console.log(`[HistoricalEvent] Request body: ${JSON.stringify(requestBody, null, 2)}`);

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Market Analysis App",
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`[HistoricalEvent] [STREAM_RESPONSE] OpenRouter response received after ${Date.now() - startTime}ms, status: ${openRouterResponse.status}`);
    
    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error(`[HistoricalEvent] API Error: ${openRouterResponse.status} - ${errorText}`);
      throw new Error(`Error ${openRouterResponse.status}: ${openRouterResponse.statusText}`);
    }

    // Improved TransformStream with detailed chunk tracking and logging
    let buffer = "";
    let chunkCounter = 0;
    let eventCounter = 0;
    let lastLogTime = Date.now();
    let totalBytesProcessed = 0;
    
    const transformStream = new TransformStream({
      start() {
        console.log(`[HistoricalEvent] [STREAM_PROCESSOR] Transform stream initialized at ${new Date().toISOString()}`);
      },
      
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        
        chunkCounter++;
        totalBytesProcessed += text.length;
        
        // Log every chunk with detailed metrics
        console.log(`[HistoricalEvent] [STREAM_CHUNK #${chunkCounter}] Size: ${text.length} bytes, Buffer size: ${buffer.length}, Timestamp: ${new Date().toISOString()}`);
        console.log(`[HistoricalEvent] [STREAM_CHUNK #${chunkCounter}] Raw content preview: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        
        // Process complete SSE events
        const parts = buffer.split("\n\n");
        // Keep the last (possibly incomplete) part in the buffer
        buffer = parts.pop() || "";
        
        // Process each complete part
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim();
            console.log(`[HistoricalEvent] [STREAM_EVENT #${i+1}] Processing event from chunk #${chunkCounter}, data: ${dataStr.substring(0, 30)}${dataStr.length > 30 ? '...' : ''}`);
            
            if (dataStr === "[DONE]") {
              console.log(`[HistoricalEvent] [STREAM_COMPLETE] Stream finished marker received at ${new Date().toISOString()}`);
              continue;
            }
            
            try {
              const parsed = JSON.parse(dataStr);
              console.log(`[HistoricalEvent] [STREAM_PARSED #${i+1}] Successfully parsed JSON from event, sending downstream`);
              
              // Forward the event without modification to preserve streaming
              const outputEvent = `data: ${JSON.stringify(parsed)}\n\n`;
              controller.enqueue(new TextEncoder().encode(outputEvent));
              eventCounter++;
            } catch (err) {
              console.error(`[HistoricalEvent] [STREAM_ERROR] Error parsing SSE event #${i+1} from chunk #${chunkCounter}:`, err);
              console.log(`[HistoricalEvent] [STREAM_ERROR] Problematic data: ${dataStr}`);
            }
          }
        }
        
        // Log timing metrics periodically
        const now = Date.now();
        if (now - lastLogTime > 1000) { // Log every second
          console.log(`[HistoricalEvent] [STREAM_STATS] Processed ${chunkCounter} chunks, ${totalBytesProcessed} bytes in the last ${(now - lastLogTime)/1000}s, ${eventCounter} events forwarded`);
          lastLogTime = now;
        }
      },
      
      flush(controller) {
        console.log(`[HistoricalEvent] [STREAM_FLUSH] Processing final buffer of size ${buffer.length} at ${new Date().toISOString()}`);
        
        if (buffer.trim()) {
          const parts = buffer.split("\n\n");
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (part && part.startsWith("data: ")) {
              const dataStr = part.slice(6).trim();
              console.log(`[HistoricalEvent] [STREAM_FLUSH] Processing final event #${i+1}, data: ${dataStr.substring(0, 30)}${dataStr.length > 30 ? '...' : ''}`);
              
              try {
                const parsed = JSON.parse(dataStr);
                const outputEvent = `data: ${JSON.stringify(parsed)}\n\n`;
                controller.enqueue(new TextEncoder().encode(outputEvent));
                eventCounter++;
              } catch (err) {
                console.error("[HistoricalEvent] [STREAM_FLUSH] Error parsing final SSE chunk:", err);
              }
            }
          }
        }
        
        console.log(`[HistoricalEvent] [STREAM_COMPLETE] Transform stream finished, processed ${chunkCounter} total chunks, ${totalBytesProcessed} total bytes, ${eventCounter} events forwarded`);
        buffer = "";
      }
    });

    console.log(`[HistoricalEvent] [STREAM_PIPE] Starting to pipe response to transform stream at ${new Date().toISOString()}`);
    
    // Return the streamed response
    return new Response(openRouterResponse.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error("[HistoricalEvent] Function error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error instanceof Error ? error.stack : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
