
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
              content: "You are a follow-up question generator. Return ONLY a JSON object with a 'questions' array containing exactly three objects, each with a 'question' field. Example: {'questions':[{'question':'First question?'},{'question':'Second question?'},{'question':'Third question?'}]}"
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
      console.log('Full API response:', JSON.stringify(data));
      
      const content = data.choices[0].message.content;
      console.log('Raw content:', typeof content, JSON.stringify(content));
      
      // If content is a string, try to parse it
      let parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
      console.log('Parsed content:', JSON.stringify(parsedContent));

      // Expect content to be an object with a questions array
      if (!parsedContent.questions || !Array.isArray(parsedContent.questions)) {
        console.error('Invalid response format:', parsedContent);
        throw new Error('Response format is invalid - expected object with questions array');
      }

      return new Response(JSON.stringify(parsedContent.questions), {
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
