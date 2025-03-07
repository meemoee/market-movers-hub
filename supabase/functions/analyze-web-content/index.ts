
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface AnalysisRequest {
  content: string;
  query: string;
  question: string;
  marketId?: string; // Add market ID to the request
  focusText?: string; // Add research focus to the request
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, query, question, marketId, focusText } = await req.json() as AnalysisRequest;
    
    // Log request info for debugging
    console.log(`Analyze web content request for market ID ${marketId || 'unknown'}:`, {
      contentLength: content?.length || 0,
      query: query?.substring(0, 100) || 'Not provided',
      question: question?.substring(0, 100) || 'Not provided',
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified'
    });

    // Determine which API to use
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openAIKey && !openRouterKey) {
      throw new Error('No API keys configured for LLM services');
    }

    // Choose OpenAI or OpenRouter based on available keys
    const apiKey = openAIKey || openRouterKey;
    const apiEndpoint = openAIKey 
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';
    
    // Determine auth header based on which service we're using
    const authHeader = openAIKey
      ? { 'Authorization': `Bearer ${apiKey}` }
      : { 'HTTP-Referer': 'https://hunchex.com', 'X-Title': 'Hunchex Analysis', 'Authorization': `Bearer ${apiKey}` };

    // Set up content limiter to prevent tokens from being exceeded
    const contentLimit = 80000; // Arbitrary limit to prevent token overages
    const truncatedContent = content.length > contentLimit 
      ? content.substring(0, contentLimit) + "... [content truncated]" 
      : content;

    // Create a system prompt that incorporates the specific market context
    const marketContext = marketId
      ? `\nImportant context: You are analyzing content for prediction market ID: ${marketId}\n`
      : '';

    const focusContext = focusText
      ? `\nIMPORTANT: Focus your analysis specifically on: "${focusText}"\n`
      : '';

    const systemPrompt = `You are an expert market research analyst.${marketContext}${focusContext}
Your task is to analyze content scraped from the web relevant to the following market question: "${question}".
Provide a comprehensive, balanced analysis of the key information, focusing on facts that help assess probability.
Be factual and evidence-based, not speculative.`;

    // Create the prompt for the user message
    const prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---

Based solely on the information in this content:
1. What are the key facts and insights relevant to the market question "${question}"?
${focusText ? `1a. Specifically analyze aspects related to: "${focusText}"` : ''}
2. What evidence supports or contradicts the proposition?
3. How does this information affect the probability assessment?
4. What conclusions can we draw about the likely outcome?

Ensure your analysis is factual, balanced, and directly addresses the market question.`;

    // Make the streaming request
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
      body: JSON.stringify({
        model: openAIKey ? 'gpt-4o-mini' : 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        stream: true,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    // Return the streaming response directly without transformation
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error) {
    console.error('Error in analyze-web-content:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
