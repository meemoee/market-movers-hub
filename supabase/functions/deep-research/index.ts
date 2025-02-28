
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { openaiStream } from "./openRouter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { description, marketId, model } = await req.json();

    if (!description) {
      return new Response(
        JSON.stringify({ type: "error", message: "Missing description" }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
          status: 400,
        }
      );
    }

    // Always use the specified model
    const modelToUse = "google/gemini-2.0-flash-001";
    console.log(`Starting deep research for: "${description}" using model: ${modelToUse}`);

    // Send a progress message to let the client know we've started
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        // Send initial progress update
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "progress",
          message: "Initializing research...",
          currentStep: 0,
          totalSteps: 3
        })}\n\n`));

        // Start the OpenRouter stream
        openaiStream({
          model: modelToUse,
          messages: [
            {
              role: "system",
              content: `You are an AI research assistant. Your task is to conduct deep research on a market to help investors make informed decisions. The research should be iterative, with each step building on the previous one.

Important: For each important insight or question that arises during your research, you should search for more information before proceeding.

Please structure your response with specific markers that the client can parse:
- For each research step, output: {"type": "step", "data": {"query": "your search query", "results": "summary of findings"}, "total": 3}
- For the final report, output: {"type": "report", "data": {"title": "Report Title", "executiveSummary": "Brief summary", "keyFindings": ["Finding 1", "Finding 2", "..."], "analysis": "Detailed analysis...", "conclusion": "Final assessment"}}

I'll provide you with a description of a market or investment opportunity, and you should:
1. Break down the initial question into 2-3 specific research queries
2. For each query, provide what you would search for and a summary of what you'd expect to find
3. Synthesize all this information into a final research report

The total research report should have 3 iterations max. For each iteration, clearly mark the beginning and end.`,
            },
            {
              role: "user",
              content: `Please research the following market: ${description}

Remember to:
1. Break this down into 2-3 specific research queries
2. For each query, provide what you'd search for and summarize the expected findings
3. Synthesize all information into a final report with the JSON structure requested

Please ensure each step is clearly delineated with the JSON markers for proper client-side parsing.`,
            },
          ],
          stream: true,
        }).then(stream => {
          const reader = stream.getReader();
          
          function processStream() {
            reader.read().then(({ done, value }) => {
              if (done) {
                // Signal the end of the stream
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                controller.close();
                return;
              }
              
              // Forward the chunk to the client
              controller.enqueue(value);
              
              // Continue reading
              processStream();
            }).catch(error => {
              console.error("Stream reading error:", error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: "error",
                message: error.message || "Error reading stream"
              })}\n\n`));
              controller.close();
            });
          }
          
          processStream();
        }).catch(error => {
          console.error("OpenRouter API error:", error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: "error",
            message: error.message || "Failed to start research"
          })}\n\n`));
          controller.close();
        });
      }
    });

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in deep-research function:", error);
    return new Response(
      JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
