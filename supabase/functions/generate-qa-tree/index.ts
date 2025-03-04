
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { streamContent } from "./streamProcessor.ts";

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

    // Handle follow-up questions
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

    // Handle main analysis with streaming
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

    console.log(`Starting OpenRouter streaming request for question: ${question}`);
    
    // Create response transformation stream
    const { readable, writable } = new TransformStream();
    const encoder = new TextEncoder();
    const writer = writable.getWriter();
    
    // Make the streaming request to OpenRouter
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        stream: true
      })
    }).then(async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter error: ${response.status} - ${errorText}`);
        writer.write(encoder.encode(`error: ${response.status}\n\n`));
        writer.close();
        return;
      }
      
      console.log("OpenRouter stream started, processing chunks");
      
      if (!response.body) {
        console.error("No response body from OpenRouter");
        writer.write(encoder.encode("error: No response body\n\n"));
        writer.close();
        return;
      }
      
      const reader = response.body.getReader();
      
      try {
        // Use our streamContent generator to process the stream
        for await (const content of streamContent(reader)) {
          if (content) {
            writer.write(encoder.encode(`data: ${content}\n\n`));
          }
        }
      } catch (err) {
        console.error("Stream processing error:", err);
        writer.write(encoder.encode(`error: ${err.message}\n\n`));
      } finally {
        console.log("OpenRouter stream completed");
        writer.close();
      }
    }).catch(err => {
      console.error("OpenRouter request failed:", err);
      writer.write(encoder.encode(`error: ${err.message}\n\n`));
      writer.close();
    });
    
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
