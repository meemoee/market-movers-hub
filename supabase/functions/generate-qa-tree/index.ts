
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { StreamProcessor } from "./streamProcessor.ts"
import { corsHeaders } from "../_shared/cors.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';

if (!OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set");
}

const openRouterApiUrl = "https://openrouter.ai/api/v1/chat/completions";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    // Parse the request body
    const requestData = await req.json();
    const { marketId, marketQuestion } = requestData;

    if (!marketId || !marketQuestion) {
      return new Response(
        JSON.stringify({ error: "Market ID and market question are required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    console.log(`Generating QA tree for market: ${marketId}`);
    console.log(`Market question: ${marketQuestion}`);

    // Create a ReadableStream for the response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Launch the analysis operation asynchronously
    analyzeMarketQuestion(marketQuestion, marketId, writer).catch((error) => {
      console.error("Error in QA tree generation:", error);
      writer.write(
        new TextEncoder().encode(
          `data: ${JSON.stringify({
            error: `Error in QA tree generation: ${error.message || error}`,
          })}\n\n`
        )
      );
      writer.close();
    });

    // Return the readable stream as the response
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

async function analyzeMarketQuestion(
  marketQuestion: string,
  marketId: string,
  writer: WritableStreamDefaultWriter
) {
  console.log("Starting analysis for market question:", marketQuestion);

  const systemPrompt = `You are a financial analysis expert specializing in prediction markets. Your task is to analyze a prediction market question, break it down into component parts, and identify key factors that could influence the outcome.

First, you will analyze the question in depth. Consider:
- What's the exact condition for the market to resolve to YES?
- What timeframe is involved?
- What are potential ambiguities or edge cases?
- What key entities are involved?
- What factors or events might influence the outcome?

After this analysis, generate 5-10 follow-up questions that would help someone make a more informed prediction. These should be specific, focused questions that address different aspects of the prediction.`;

  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: `Analyze this prediction market question: "${marketQuestion}"
      
First provide a thorough analysis of what the question is asking, any key dates, conditions, and important factors.

Then provide 5-10 numbered follow-up questions that would help someone make a more informed prediction.`,
    },
  ];

  // Send the messages to OpenRouter and stream the response
  const streamProcessor = new StreamProcessor();
  const encoder = new TextEncoder();

  try {
    console.log("Sending analysis request to OpenRouter");
    
    const response = await fetch(openRouterApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://hunchex.app",
        "X-Title": "HunchEx QA Tree Generator",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();

    // Process the streaming response
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const processedChunks = streamProcessor.processChunk(chunk);

      // Send each processed chunk to the client
      for (const content of processedChunks) {
        // Only stream non-empty content
        if (content.trim()) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
          );
        }
      }
    }

    // Signal the end of the stream
    await writer.write(encoder.encode(`data: [DONE]\n\n`));
    console.log("Analysis completed and streamed successfully");

  } catch (error) {
    console.error("Error in OpenRouter API call:", error);
    throw error;
  } finally {
    try {
      await writer.close();
    } catch (e) {
      console.error("Error closing writer:", e);
    }
  }
}
