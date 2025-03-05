
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface AnalysisRequest {
  content: string;
  query: string;
  question: string;
  marketId?: string;
  focusText?: string;
  previousAnalyses?: string;
  areasForResearch?: string[];
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
    const { 
      content, 
      query, 
      question, 
      marketId, 
      focusText,
      previousAnalyses,
      areasForResearch 
    } = await req.json() as AnalysisRequest;
    
    // Log request info for debugging
    console.log(`Analyze web content request for market ID ${marketId || 'unknown'}:`, {
      contentLength: content?.length || 0,
      query: query?.substring(0, 100) || 'Not provided',
      question: question?.substring(0, 100) || 'Not provided',
      focusText: focusText ? `${focusText.substring(0, 100)}...` : 'None specified',
      previousAnalysesLength: previousAnalyses?.length || 0,
      areasForResearchCount: areasForResearch?.length || 0
    });

    // Get OpenRouter API key
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!openRouterKey) {
      throw new Error('No API key configured for OpenRouter');
    }

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

    // Include previous areas for research if available
    const researchAreasContext = areasForResearch && areasForResearch.length > 0
      ? `\nPreviously identified research areas to focus on: ${areasForResearch.join(', ')}\n`
      : '';

    const systemPrompt = `You are an expert market research analyst.${marketContext}${focusContext}${researchAreasContext}
Your task is to analyze content scraped from the web relevant to the following market question: "${question}".
Provide a comprehensive, balanced analysis of the key information, focusing on facts that help assess probability.
Be factual and evidence-based, not speculative.`;

    // Create the prompt for the user message
    let prompt = `Here is the web content I've collected during research:
---
${truncatedContent}
---`;

    // Include previous analyses if available
    if (previousAnalyses && previousAnalyses.length > 0) {
      prompt += `\n\nPrevious research has identified the following insights:
---
${previousAnalyses.substring(0, 10000)}${previousAnalyses.length > 10000 ? '... [truncated]' : ''}
---`;
    }

    prompt += `\nBased solely on the information in this content:
1. What are the key facts and insights relevant to the market question "${question}"?
${focusText ? `1a. Specifically analyze aspects related to: "${focusText}"` : ''}
2. What evidence supports or contradicts the proposition?
3. How does this information affect the probability assessment?
4. What conclusions can we draw about the likely outcome?

Ensure your analysis is factual, balanced, and directly addresses the market question.`;

    // Make the streaming request with Gemini model
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Hunchex Analysis'
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
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

    // Return the streaming response directly
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
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
