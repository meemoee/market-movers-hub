
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { OpenRouter } from "./openRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get parameters from the URL
    const url = new URL(req.url);
    const model = url.searchParams.get("model") || "google/gemini-flash-1.5";
    const temperature = parseFloat(url.searchParams.get("temperature") || "0.7");
    const maxTokens = parseInt(url.searchParams.get("max_tokens") || "500");
    const messagesJson = url.searchParams.get("messages");
    
    if (!messagesJson) {
      throw new Error("Missing 'messages' parameter");
    }
    
    // Parse the messages
    const messages = JSON.parse(messagesJson);
    
    // Get the OpenRouter API key
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterKey) {
      throw new Error("OPENROUTER_API_KEY environment variable not set");
    }
    
    // Create a new OpenRouter instance
    const openRouter = new OpenRouter(openRouterKey);
    
    // Get a streaming response
    const streamingResponse = await openRouter.completeStreaming(
      model,
      messages,
      maxTokens,
      temperature
    );

    // Set up the SSE response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Process the stream and forward chunks as SSE events
    openRouter.processStream(streamingResponse, (chunk) => {
      const event = `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`;
      writer.write(new TextEncoder().encode(event));
    }).then(() => {
      // Signal completion when done
      writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      writer.close();
    }).catch((error) => {
      console.error("Error processing stream:", error);
      writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`));
      writer.close();
    });
    
    // Return the SSE stream
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error("Error in stream function:", error);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
