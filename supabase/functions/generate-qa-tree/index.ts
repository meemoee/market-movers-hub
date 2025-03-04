
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, marketId, parentContent, isFollowUp, researchContext, historyContext } = await req.json();
    if (!question) throw new Error('Question is required');

    // If this is a follow-up question, process it and return JSON.
    if (isFollowUp && parentContent) {
      const researchPrompt = researchContext ? `
Consider this previous research:
Analysis: ${researchContext.analysis}
Probability Assessment: ${researchContext.probability}
Areas Needing Research: ${researchContext.areasForResearch.join(', ')}

Based on this research and the following analysis, generate follow-up questions:
${parentContent}
` : parentContent;

      const promptContent = historyContext ? 
        `${historyContext}\n\nBased on the above context, generate follow-up questions for: ${question}` : 
        `Generate three focused analytical follow-up questions based on this context:\n\nOriginal Question: ${question}\n\nAnalysis: ${researchPrompt}`;

      const followUpResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Market Analysis App',
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5",
          messages: [
            {
              role: "system",
              content:
                "Generate three analytical follow-up questions as a JSON array. Each question should be an object with a 'question' field. Return only the JSON array, nothing else."
            },
            {
              role: "user",
              content: promptContent
            }
          ]
        })
      });
      
      if (!followUpResponse.ok) {
        throw new Error(`Follow-up generation failed: ${followUpResponse.status}`);
      }
      
      const data = await followUpResponse.json();
      let rawContent = data.choices[0].message.content;
      rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      let parsed;
      try {
        parsed = JSON.parse(rawContent);
      } catch (err) {
        console.error("Failed to parse JSON:", rawContent);
        throw new Error('Failed to parse follow-up questions');
      }
      
      if (!Array.isArray(parsed)) throw new Error('Response is not an array');
      
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = researchContext 
      ? `You are a helpful assistant providing detailed analysis. Consider this previous research when forming your response:

Previous Analysis: ${researchContext.analysis}
Probability Assessment: ${researchContext.probability}
Areas Needing Further Research: ${researchContext.areasForResearch.join(', ')}

Start your response with complete sentences, avoid markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant. Use **bold** text sparingly and ensure proper markdown formatting.`
      : "You are a helpful assistant providing detailed analysis. Start responses with complete sentences, avoid markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant. Use **bold** text sparingly and ensure proper markdown formatting.";

    const userContent = historyContext ? 
      `${historyContext}\n\nAnalyze the following question based on the above context: ${question}` : 
      question;

    console.log("Sending streaming request to OpenRouter");
    
    // Create a TransformStream to handle streaming back to the client
    const { readable, writable } = new TransformStream();
    const encoder = new TextEncoder();
    const writer = writable.getWriter();
    
    // Start a fetch to the OpenRouter API but don't await it
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userContent
          }
        ],
        stream: true
      })
    }).then(async (openRouterResponse) => {
      if (!openRouterResponse.ok) {
        const errorText = await openRouterResponse.text();
        console.error("OpenRouter API error:", openRouterResponse.status, errorText);
        writer.write(encoder.encode(`data: {"error":"OpenRouter API error: ${openRouterResponse.status}"}\n\n`));
        writer.close();
        return;
      }
      
      console.log("Received OpenRouter stream, piping to client");
      
      // Get the reader from the OpenRouter response
      const reader = openRouterResponse.body?.getReader();
      if (!reader) {
        console.error("Failed to get reader from OpenRouter response");
        writer.write(encoder.encode(`data: {"error":"Failed to get reader from OpenRouter response"}\n\n`));
        writer.close();
        return;
      }
      
      // Pipe the OpenRouter response to the client
      try {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Forward the raw SSE data directly to the client
          const chunk = decoder.decode(value, { stream: true });
          console.log("Streaming chunk to client:", chunk.length, "bytes");
          writer.write(encoder.encode(chunk));
        }
      } catch (error) {
        console.error("Error processing OpenRouter stream:", error);
        writer.write(encoder.encode(`data: {"error":"Error processing stream: ${error.message}"}\n\n`));
      } finally {
        writer.close();
        reader.releaseLock();
      }
    }).catch((error) => {
      console.error("Fetch to OpenRouter failed:", error);
      writer.write(encoder.encode(`data: {"error":"Fetch to OpenRouter failed: ${error.message}"}\n\n`));
      writer.close();
    });
    
    // Return the readable side of the transform stream to the client immediately
    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
    
  } catch (error) {
    console.error("Function error:", error);
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
