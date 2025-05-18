
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
    const { question, marketId, parentContent, isFollowUp, researchContext, historyContext, originalQuestion, isContinuation, userId } = await req.json();
    if (!question) throw new Error('Question is required');

    console.log(`Processing ${isFollowUp ? 'follow-up' : 'primary'} question:`, question.substring(0, 50));
    console.log(`Context: marketId=${marketId}, hasParentContent=${!!parentContent}, hasResearchContext=${!!researchContext}, hasHistoryContext=${!!historyContext}, isContinuation=${!!isContinuation}, hasOriginalQuestion=${!!originalQuestion}, hasUserId=${!!userId}`);

    // Determine which API key to use
    let apiKey = OPENROUTER_API_KEY;

    // If userId is provided, try to get their personal API key
    if (userId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
      )

      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('openrouter_api_key')
        .eq('id', userId)
        .single()

      if (!error && data?.openrouter_api_key) {
        console.log('Using user-provided API key')
        apiKey = data.openrouter_api_key
      } else if (error) {
        console.error('Error fetching user API key:', error)
      }
    }

    if (!apiKey) {
      throw new Error('No API key available for OpenRouter')
    }

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
            'Authorization': `Bearer ${apiKey}`,
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

    systemPrompt += "\n\nCritical analysis requirements:";
    systemPrompt += "\n- Consider the market resolution timeline and examine if changes are likely before the deadline";
    systemPrompt += "\n- Prioritize the LATEST numbers and statistics available, especially from OFFICIAL SOURCES";
    systemPrompt += "\n- Assess the momentum of current trends and whether they will continue until resolution";
    systemPrompt += "\n- Explicitly address time-dependent factors that could impact the outcome";
    systemPrompt += "\n- Evaluate information recency relative to the current date";
    systemPrompt += "\n- For each factor, consider whether there is sufficient time for it to change before deadline";

    console.log("Generating primary analysis with system prompt length:", systemPrompt.length);

    const questionToUse = isContinuation && originalQuestion ? originalQuestion : question;
    console.log("Using question for analysis:", questionToUse.substring(0, 50));

    // For analysis, stream the response from OpenRouter.
    const startTime = Date.now();
    console.log(`[STREAM_START] OpenRouter request initiated at ${new Date().toISOString()}`);
    
    const analysisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
    
    console.log(`[STREAM_RESPONSE] OpenRouter response received after ${Date.now() - startTime}ms, status: ${analysisResponse.status}, headers: ${JSON.stringify([...analysisResponse.headers])}`);
    
    if (!analysisResponse.ok) {
      console.error(`Analysis generation failed: ${analysisResponse.status}`);
      throw new Error(`Analysis generation failed: ${analysisResponse.status}`);
    }

    // Improved TransformStream with detailed chunk tracking and logging
    let buffer = "";
    let chunkCounter = 0;
    let lastLogTime = Date.now();
    let totalBytesProcessed = 0;
    
    const transformStream = new TransformStream({
      start() {
        console.log(`[STREAM_PROCESSOR] Transform stream initialized at ${new Date().toISOString()}`);
      },
      
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        
        chunkCounter++;
        totalBytesProcessed += text.length;
        
        // Log every chunk with detailed metrics
        console.log(`[STREAM_CHUNK #${chunkCounter}] Size: ${text.length} bytes, Buffer size: ${buffer.length}, Timestamp: ${new Date().toISOString()}`);
        console.log(`[STREAM_CHUNK #${chunkCounter}] Raw content preview: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
        
        // Process complete SSE events
        const parts = buffer.split("\n\n");
        // Keep the last (possibly incomplete) part in the buffer.
        buffer = parts.pop() || "";
        
        // Process each complete part
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith("data: ")) {
            const dataStr = part.slice(6).trim();
            console.log(`[STREAM_EVENT #${i+1}] Processing event from chunk #${chunkCounter}, data: ${dataStr.substring(0, 30)}${dataStr.length > 30 ? '...' : ''}`);
            
            if (dataStr === "[DONE]") {
              console.log(`[STREAM_COMPLETE] Stream finished marker received at ${new Date().toISOString()}`);
              continue;
            }
            
            try {
              const parsed = JSON.parse(dataStr);
              console.log(`[STREAM_PARSED #${i+1}] Successfully parsed JSON from event, sending downstream`);
              
              // Forward the event without modification to preserve streaming
              const outputEvent = `data: ${JSON.stringify(parsed)}\n\n`;
              controller.enqueue(new TextEncoder().encode(outputEvent));
            } catch (err) {
              console.error(`[STREAM_ERROR] Error parsing SSE event #${i+1} from chunk #${chunkCounter}:`, err);
              console.log(`[STREAM_ERROR] Problematic data: ${dataStr}`);
            }
          }
        }
        
        // Log timing metrics periodically
        const now = Date.now();
        if (now - lastLogTime > 1000) { // Log every second
          console.log(`[STREAM_STATS] Processed ${chunkCounter} chunks, ${totalBytesProcessed} bytes in the last ${(now - lastLogTime)/1000}s`);
          lastLogTime = now;
        }
      },
      
      flush(controller) {
        console.log(`[STREAM_FLUSH] Processing final buffer of size ${buffer.length} at ${new Date().toISOString()}`);
        
        if (buffer.trim()) {
          const parts = buffer.split("\n\n");
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (part && part.startsWith("data: ")) {
              const dataStr = part.slice(6).trim();
              console.log(`[STREAM_FLUSH] Processing final event #${i+1}, data: ${dataStr.substring(0, 30)}${dataStr.length > 30 ? '...' : ''}`);
              
              try {
                const parsed = JSON.parse(dataStr);
                const outputEvent = `data: ${JSON.stringify(parsed)}\n\n`;
                controller.enqueue(new TextEncoder().encode(outputEvent));
              } catch (err) {
                console.error("[STREAM_FLUSH] Error parsing final SSE chunk:", err);
              }
            }
          }
        }
        
        console.log(`[STREAM_COMPLETE] Transform stream finished, processed ${chunkCounter} total chunks, ${totalBytesProcessed} total bytes`);
        buffer = "";
      }
    });

    console.log(`[STREAM_PIPE] Starting to pipe response to transform stream at ${new Date().toISOString()}`);
    
    // Return the streamed response
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
