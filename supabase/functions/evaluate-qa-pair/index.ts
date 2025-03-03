
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Retry function for API calls
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, backoff = 300) {
  try {
    const response = await fetch(url, options);
    if (response.ok) return response;
    
    // If we got a 429 or 5xx, retry
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
      console.log(`Retrying due to ${response.status} response, ${retries} retries left`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying due to network error, ${retries} retries left: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// Safely parse JSON with multiple fallback methods
function safeParseJSON(text: string) {
  console.log('Attempting to parse JSON:', text);
  
  // Method 1: Direct JSON.parse
  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.log('Direct parsing failed, trying cleanup methods');
  }

  // Method 2: Clean up common syntax issues
  try {
    // Remove markdown code blocks
    const cleanedText = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*$/g, '')
      .trim();
      
    // Fix unescaped characters
    const fixedJson = cleanedText
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\b/g, "\\b")
      .replace(/\f/g, "\\f");
    
    return JSON.parse(fixedJson);
  } catch (cleaningError) {
    console.log('Cleanup parsing failed, trying regex extraction');
  }

  // Method 3: Regex extraction
  try {
    const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
    const reasonMatch = text.match(/"reason"\s*:\s*"([^"]*)"/);
    
    if (scoreMatch && reasonMatch) {
      return {
        score: parseInt(scoreMatch[1], 10),
        reason: reasonMatch[1]
      };
    }
  } catch (regexError) {
    console.log('Regex extraction failed');
  }
  
  // Method 4: Last resort - create a default response
  console.log('All parsing methods failed, using default values');
  return {
    score: 50,
    reason: "Evaluation could not be parsed from model response. Please review the analysis manually."
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Received evaluation request');
    const { question, analysis } = await req.json()
    
    if (!question || !analysis) {
      throw new Error('Missing required parameters: question or analysis');
    }

    console.log(`Processing evaluation for question: ${question.substring(0, 50)}...`);
    
    // Truncate analysis if too long to avoid context limits
    const truncatedAnalysis = analysis.length > 8000 
      ? analysis.substring(0, 8000) + "... (truncated)"
      : analysis;

    const modelRequestBody = JSON.stringify({
      model: "google/gemini-pro",
      messages: [
        {
          role: "system",
          content: "You are an evaluator that assesses the quality and completeness of answers to questions. Your task is to provide a score between 0 and 100 and a brief reason for the score. IMPORTANT: You must ONLY output valid JSON in this exact format: {\"score\": number, \"reason\": \"string\"}. Do not include any markdown or code block syntax, just the raw JSON object."
        },
        {
          role: "user",
          content: `Please evaluate how well this analysis answers the question:\n\nQuestion: ${question}\n\nAnalysis: ${truncatedAnalysis}`
        }
      ]
    });

    const openRouterResponse = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: modelRequestBody
    }, 3, 1000);

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error(`OpenRouter API error ${openRouterResponse.status}: ${errorText}`);
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`);
    }

    const data = await openRouterResponse.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid response format from OpenRouter:', data);
      throw new Error('Invalid response format from OpenRouter');
    }

    let evaluationText = data.choices[0].message.content;
    console.log('Raw evaluation text:', evaluationText);

    try {
      const evaluation = safeParseJSON(evaluationText);
      
      // Validate the evaluation object structure
      if (typeof evaluation.score !== 'number' || typeof evaluation.reason !== 'string') {
        console.warn('Invalid evaluation format, using default values');
        evaluation.score = evaluation.score || 50;
        evaluation.reason = evaluation.reason || "Evaluation format was invalid. Please review manually.";
      }
      
      // Ensure score is between 0 and 100
      evaluation.score = Math.max(0, Math.min(100, evaluation.score));
      
      console.log('Successfully processed evaluation:', evaluation);
      
      return new Response(JSON.stringify(evaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error processing evaluation:', error);
      console.error('Received content:', evaluationText);
      
      // Return a graceful fallback instead of throwing
      return new Response(JSON.stringify({
        score: 50,
        reason: "Could not process evaluation. Please review the analysis manually."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error);
    
    // Never fail completely - return a valid response with error information
    return new Response(
      JSON.stringify({ 
        score: 0,
        reason: `Error during evaluation: ${error.message}. Please try again or review manually.`
      }),
      { 
        status: 200, // Return 200 to prevent client-side failures
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})
