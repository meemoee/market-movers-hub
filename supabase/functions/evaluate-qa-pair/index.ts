
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Set up retry logic with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  let retries = 0;
  let lastError;

  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      retries++;
      console.log(`Retry ${retries}/${maxRetries} after error:`, error);
      if (retries < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(1000 * 2 ** retries + Math.random() * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Evaluating QA pair...');
    const { question, analysis } = await req.json();
    
    if (!question || !analysis) {
      console.error('Missing required parameters:', { question: !!question, analysis: !!analysis });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters', 
          score: 50, 
          reason: 'Could not evaluate due to missing parameters' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('Evaluating question:', question.substring(0, 50) + '...');
    console.log('Evaluating analysis:', analysis.substring(0, 50) + '...');
    
    const prompt = `
    You are an expert evaluator assessing the quality of an analysis in response to a question.
    Your job is to rate the analysis on a scale of 1-100 where 100 is perfect.

    Question: ${question}
    
    Analysis: ${analysis}
    
    Rate this analysis on a scale of 1-100 based on:
    - Relevance to the question
    - Depth and comprehensiveness
    - Logical reasoning and structure
    - Use of evidence or examples (if applicable)
    - Clarity of communication
    
    Provide a JSON response with two properties: 
    - score: a number between 1-100
    - reason: a brief explanation (1-2 sentences) for your rating
    `;
    
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ 
          score: 70, 
          reason: "Evaluation service is unavailable. This is a default score." 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'HunchEx QA Evaluator'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'user', content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 300,
      })
    };
    
    console.log('Making request to OpenRouter...');
    try {
      const response = await fetchWithRetry(openRouterUrl, options);
      const data = await response.json();
      
      console.log('Received response from OpenRouter:', JSON.stringify(data).substring(0, 200) + '...');
      
      let evaluationResult;
      try {
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          const content = data.choices[0].message.content;
          
          // Try to parse as JSON
          try {
            evaluationResult = JSON.parse(content);
          } catch (parseError) {
            console.error('Failed to parse response as JSON:', parseError);
            
            // Try to extract JSON from text if direct parsing fails
            const jsonMatch = content.match(/({[\s\S]*})/);
            if (jsonMatch) {
              try {
                evaluationResult = JSON.parse(jsonMatch[0]);
              } catch (matchParseError) {
                console.error('Failed to parse matched JSON:', matchParseError);
              }
            }
          }
          
          // If we still don't have a valid result, use fallback
          if (!evaluationResult || typeof evaluationResult.score !== 'number') {
            console.error('Could not extract valid evaluation from response');
            evaluationResult = {
              score: 75,
              reason: "Evaluation service returned an invalid format. This is a default score."
            };
          }
        }
      } catch (error) {
        console.error('Error processing OpenRouter response:', error);
      }
      
      if (!evaluationResult) {
        evaluationResult = {
          score: 75,
          reason: "Evaluation service returned an unexpected response. This is a default score."
        };
      }
      
      console.log('Final evaluation result:', evaluationResult);
      
      return new Response(
        JSON.stringify(evaluationResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error calling OpenRouter:', error);
      
      // Return a fallback response
      return new Response(
        JSON.stringify({ 
          score: 65, 
          reason: "Evaluation service encountered an error. This is a default score." 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error('General error in evaluate-qa-pair function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        score: 60, 
        reason: "The evaluation service encountered an internal error. This is a default score." 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
