
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
    const { question, marketId, parentContent, isFollowUp, researchContext, historyContext, originalQuestion, isContinuation } = await req.json();
    if (!question) throw new Error('Question is required');

    console.log(`Processing ${isFollowUp ? 'follow-up' : 'primary'} question:`, question.substring(0, 50));
    console.log(`Context: marketId=${marketId}, hasParentContent=${!!parentContent}, hasResearchContext=${!!researchContext}, hasHistoryContext=${!!historyContext}, isContinuation=${!!isContinuation}`);

    // If this is a follow-up question, process it and return JSON array of follow-up questions
    if (isFollowUp && parentContent) {
      // Combine all available context for best results
      let contextualPrompt = '';
      
      if (historyContext) {
        contextualPrompt += `Previous analysis context:\n${historyContext}\n\n`;
      }
      
      if (researchContext) {
        contextualPrompt += `Consider this research data:\nAnalysis: ${researchContext.analysis}\nProbability Assessment: ${researchContext.probability}\nAreas Needing Research: ${researchContext.areasForResearch.join(', ')}\n\n`;
      }
      
      contextualPrompt += `Based on this analysis, generate follow-up questions:\n${parentContent}`;

      console.log("Generating follow-up questions with context length:", contextualPrompt.length);
      
      try {
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
                content: "Generate three analytical follow-up questions as a JSON array. Each question should be an object with a 'question' field. Return only the JSON array, nothing else."
              },
              {
                role: "user",
                content: `Generate three focused analytical follow-up questions based on this context:\n\nOriginal Question: ${isContinuation && originalQuestion ? originalQuestion : question}\n\nAnalysis: ${contextualPrompt}`
              }
            ]
          })
        });
        
        if (!followUpResponse.ok) {
          console.error(`Follow-up generation failed: ${followUpResponse.status}`);
          throw new Error(`Follow-up generation failed: ${followUpResponse.status}`);
        }
        
        const data = await followUpResponse.json();
        let rawContent = data.choices[0].message.content;
        
        // Clean up the raw content
        rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
          console.log("Successfully parsed follow-up questions:", JSON.stringify(parsed).substring(0, 100));
        } catch (err) {
          console.error('Failed to parse follow-up questions. Raw content:', rawContent);
          // Return a default set of questions if parsing fails
          parsed = [
            { question: "What additional data points would help clarify this market?" },
            { question: "What are the key factors that could change this prediction?" },
            { question: "What historical precedents are most relevant to this forecast?" }
          ];
        }
        
        // Ensure we return an array
        if (!Array.isArray(parsed)) {
          console.warn('Response is not an array, converting to array');
          parsed = [{ question: rawContent }];
        }
        
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error("Error generating follow-up questions:", error);
        // Return default questions if there's an error
        const defaultQuestions = [
          { question: "What are the most significant factors influencing this prediction?" },
          { question: "How might recent developments affect this forecast?" },
          { question: "What alternative scenarios should we consider?" }
        ];
        return new Response(JSON.stringify(defaultQuestions), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Construct system prompt based on available context
    let systemPrompt = "You are a helpful assistant providing detailed analysis.";
    
    if (isContinuation) {
      systemPrompt += "\n\nThis is a continuation or in-depth exploration of a previous analysis.";
    }
    
    if (historyContext) {
      systemPrompt += `\n\nConsider this previous analysis context when forming your response:\n${historyContext}`;
    }
    
    if (researchContext) {
      systemPrompt += `\n\nConsider this previous research when forming your response:
Previous Analysis: ${researchContext.analysis}
Probability Assessment: ${researchContext.probability}
Areas Needing Further Research: ${researchContext.areasForResearch.join(', ')}`;
    }
    
    systemPrompt += "\n\nStart your response with complete sentences, avoid markdown headers or numbered lists at the start. Include citations in square brackets [1] where relevant. Use **bold** text sparingly and ensure proper markdown formatting.";

    console.log("Generating primary analysis with system prompt length:", systemPrompt.length);

    const questionToUse = isContinuation && originalQuestion ? originalQuestion : question;
    console.log("Using question for analysis:", questionToUse.substring(0, 50));

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
            content: isContinuation ? 
              `Continuing our analysis of "${questionToUse}", let's explore: ${question}` : 
              question
          }
        ],
        stream: true
      })
    });
    
    if (!analysisResponse.ok) {
      console.error(`Analysis generation failed: ${analysisResponse.status}`);
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
              console.debug("Error parsing SSE chunk:", err);
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
            console.debug("Error parsing final SSE chunk:", err);
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
