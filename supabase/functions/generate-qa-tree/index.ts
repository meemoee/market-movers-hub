
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
    const { question, marketId, parentContent, isFollowUp, researchContext } = await req.json();
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
                "Generate three analytical follow-up questions as a JSON array. Each question should be an object with a 'question' field. Your response must be a valid JSON array. Do not include any text before or after the JSON array."
            },
            {
              role: "user",
              content: `Generate three focused analytical follow-up questions based on this context:\n\nOriginal Question: ${question}\n\nAnalysis: ${researchPrompt}`
            }
          ],
          response_format: { type: "json_object" }
        })
      });
      if (!followUpResponse.ok) {
        throw new Error(`Follow-up generation failed: ${followUpResponse.status}`);
      }
      const data = await followUpResponse.json();
      let parsed;
      try {
        // Check if the content is already a JSON array
        const content = data.choices[0].message.content;
        parsed = typeof content === 'string' ? JSON.parse(content) : content;
        
        // If we got an object with a queries field, extract it
        if (parsed.queries) {
          parsed = parsed.queries;
        }
        
        // Ensure we have an array of objects with question fields
        if (!Array.isArray(parsed)) {
          throw new Error('Response is not an array');
        }
        
        // Normalize the response format
        const normalizedQuestions = parsed.map(item => {
          if (typeof item === 'string') {
            return { question: item };
          }
          return item.question ? item : { question: Object.values(item)[0] };
        });

        return new Response(JSON.stringify(normalizedQuestions), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Parse error:', err, 'Raw content:', data.choices[0].message.content);
        throw new Error('Failed to parse follow-up questions');
      }
    }

    const systemPrompt = researchContext 
      ? `You are a helpful assistant providing detailed analysis. Consider this previous research when forming your response:

Previous Analysis: ${researchContext.analysis}
Probability Assessment: ${researchContext.probability}
Areas Needing Further Research: ${researchContext.areasForResearch.join(', ')}

Start your response with complete sentences, avoid markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant. Use **bold** text sparingly and ensure proper markdown formatting.`
      : "You are a helpful assistant providing detailed analysis. Start responses with complete sentences, avoid markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant. Use **bold** text sparingly and ensure proper markdown formatting.";

    // For analysis, stream the response from OpenRouter.
    const analysisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
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
            content: question
          }
        ],
        stream: true
      })
    });
    if (!analysisResponse.ok) {
      throw new Error(`Analysis generation failed: ${analysisResponse.status}`);
    }

    // A simple TransformStream that buffers incoming text until full SSE events are available.
    let buffer = "";
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        const parts = buffer.split("\n\n");
        // Keep the last (possibly incomplete) part in the buffer.
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(dataStr);
              // Re-emit the SSE event unmodified.
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`));
            } catch (err) {
              console.error("Error parsing SSE chunk:", err);
            }
          }
        }
      },
      flush(controller) {
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.trim());
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(parsed)}\n\n`));
          } catch (err) {
            console.error("Error parsing final SSE chunk:", err);
          }
        }
        buffer = "";
      }
    });

    return new Response(analysisResponse.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
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
