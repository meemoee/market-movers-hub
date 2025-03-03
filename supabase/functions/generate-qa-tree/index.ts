
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Create a Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

class StreamProcessor {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;

  constructor() {
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
  }

  createStream() {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.controller = null;
      },
    });
  }

  processChunk(chunk: Uint8Array) {
    if (!this.controller) return;
    
    const text = this.textDecoder.decode(chunk);
    const lines = text.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6).trim();
        
        if (jsonStr === '[DONE]') {
          this.controller.enqueue(this.textEncoder.encode(`data: [DONE]\n\n`));
          continue;
        }
        
        try {
          // Forward the chunk as is
          this.controller.enqueue(this.textEncoder.encode(`${line}\n\n`));
        } catch (e) {
          console.error('Error processing chunk:', e);
        }
      }
    }
  }

  close() {
    if (this.controller) {
      this.controller.close();
      this.controller = null;
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData = await req.json();
    const { 
      marketId, 
      question, 
      parentContent, 
      historyContext,
      isFollowUp,
      marketQuestion, 
      model = "google/gemini-2.0-flash-lite-001",
      useOpenRouter = true,
      researchContext
    } = requestData;

    console.log(`Processing ${isFollowUp ? 'follow-up' : 'initial'} analysis request for market ${marketId}`);
    console.log(`Question: ${question}`);
    console.log(`Using model: ${model}`);

    // Base system prompt
    let systemPrompt = `You are an expert market analyst who helps people understand prediction markets. You provide objective and factual analysis to help predict outcomes.`;

    // Add market context
    if (marketQuestion) {
      systemPrompt += `\nThe main market question is: "${marketQuestion}"`;
    }

    // Add research context if available
    if (researchContext) {
      systemPrompt += `\n\nBased on prior research:\n`;
      systemPrompt += `Analysis: ${researchContext.analysis}\n`;
      systemPrompt += `Probability: ${researchContext.probability}\n`;
      
      if (researchContext.areasForResearch && researchContext.areasForResearch.length > 0) {
        systemPrompt += `Areas needing further research: ${researchContext.areasForResearch.join(', ')}\n`;
      }
    }

    // For follow-up questions, we want to generate suggestions
    if (isFollowUp) {
      systemPrompt = `You are an expert research assistant who helps generate relevant follow-up questions for deeper analysis. Based on the previous analysis, suggest 3 focused follow-up questions that would help clarify important aspects or explore key uncertainties.`;
      
      if (historyContext) {
        systemPrompt += `\n\nHere is the context of previous questions and analyses:\n${historyContext}`;
      }
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://hunchex.app",
          "X-Title": "Hunchex"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Based on this analysis: "${parentContent}", what are 3 important follow-up questions we should ask to get a better understanding of the market "${question}"?` }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('OpenRouter error:', responseData);
        throw new Error(`OpenRouter API error: ${responseData.error?.message || 'Unknown error'}`);
      }

      // Process the follow-up questions into a structured format
      const followUpText = responseData.choices[0]?.message?.content || '';
      const followUpQuestions = followUpText
        .split(/\d+\./)
        .filter(text => text.trim().length > 0)
        .map(text => ({ question: text.trim() }));

      return new Response(
        JSON.stringify(followUpQuestions),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } 
    // For regular analysis, we stream the response
    else {
      // Create the stream
      const streamProcessor = new StreamProcessor();
      const stream = streamProcessor.createStream();

      // Set up the transform stream
      const transformStream = new TransformStream({
        transform: (chunk, controller) => {
          streamProcessor.processChunk(chunk);
        }
      });

      // Add historical context if available
      let userPrompt = question;
      if (historyContext) {
        userPrompt = `I need an analysis of the following question in the context of our previous discussions:\n\n${historyContext}\n\nCurrent Question: ${question}`;
      }

      // Fetch from OpenRouter
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://hunchex.app",
          "X-Title": "Hunchex"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.4,
          max_tokens: 2048,
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', errorText);
        throw new Error(`OpenRouter API error: ${errorText}`);
      }

      // Pipe the response to our stream
      response.body!.pipeTo(new WritableStream({
        write(chunk) {
          streamProcessor.processChunk(chunk);
        },
        close() {
          streamProcessor.close();
        }
      }));

      return new Response(stream, { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        } 
      });
    }
  } catch (error) {
    console.error('Error in generate-qa-tree function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
