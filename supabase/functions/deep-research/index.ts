
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { runDeepResearch } from "./openRouter.ts";

interface ResearchRequest {
  description: string;
  marketId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Parse the request body
    const { description, marketId } = await req.json() as ResearchRequest;
    
    if (!description) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing 'description' in request body" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Set up streaming response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start the research process in the background
    const sendUpdate = async (data: any) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    EdgeRuntime.waitUntil((async () => {
      try {
        // Provide initial progress update
        await sendUpdate({
          type: 'progress',
          message: 'Initializing research process...',
          currentStep: 0,
          totalSteps: 5
        });

        // Run the deep research with streaming updates
        const { report, steps } = await runDeepResearch(description, marketId, async (step, query, results, total) => {
          // Send step update
          await sendUpdate({
            type: 'step',
            data: { query, results },
            currentStep: step,
            total
          });

          // Send progress update
          await sendUpdate({
            type: 'progress',
            message: `Processing research query ${step}/${total}: ${query}`,
            currentStep: step,
            totalSteps: total
          });
        });

        // Send the final research report
        await sendUpdate({
          type: 'report',
          data: report
        });

        // Close the stream
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('Error in research process:', error);
        await sendUpdate({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error during research'
        });
      } finally {
        await writer.close();
      }
    })());

    // Return the stream response immediately
    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (err) {
    console.error('Error:', err);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'An unknown error occurred'
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
