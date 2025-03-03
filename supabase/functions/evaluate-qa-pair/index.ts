import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { question, analysis } = await req.json()

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "google/gemini-pro",
        messages: [
          {
            role: "system",
            content: "You are an evaluator that assesses the quality and completeness of answers to questions. Your task is to provide a score between 0 and 100 and a brief reason for the score. IMPORTANT: You must ONLY output valid JSON in this exact format: {\"score\": number, \"reason\": \"string\"}. Do not include any markdown or code block syntax, just the raw JSON object. Ensure your reason contains NO newlines or special characters that would break JSON parsing."
          },
          {
            role: "user",
            content: `Please evaluate how well this analysis answers the question:\n\nQuestion: ${question}\n\nAnalysis: ${analysis}`
          }
        ]
      })
    })

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    const data = await openRouterResponse.json()
    let evaluationText = data.choices[0].message.content

    try {
      // Clean up any potential markdown or code block syntax
      evaluationText = evaluationText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
      console.log('Cleaned evaluation text:', evaluationText)
      
      // Reliable extraction approach: Extract the score and reason separately
      // and then construct a new valid JSON object
      
      // Extract the score using regex
      const scoreMatch = evaluationText.match(/"score"\s*:\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
      
      if (!score && score !== 0) {
        throw new Error('Could not extract valid score');
      }
      
      // Extract the reason by finding the text between "reason": " and the last "
      // This is more reliable than trying to parse invalid JSON
      const reasonRegex = /"reason"\s*:\s*"([\s\S]*?)(?:"\s*}|"\s*,|"$)/;
      const reasonMatch = evaluationText.match(reasonRegex);
      let reason = reasonMatch ? reasonMatch[1] : '';
      
      // Clean the reason text to remove newlines and problematic characters
      reason = reason
        .replace(/\r?\n/g, ' ')   // Replace newlines with spaces
        .replace(/\\(?!["\\/bfnrt])/g, '\\\\') // Escape backslashes that aren't part of escape sequences
        .replace(/"/g, '\\"')     // Escape quotes
        .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
      
      // Create a new, clean evaluation object
      const evaluation = {
        score: Math.max(0, Math.min(100, score)), // Ensure score is between 0 and 100
        reason: reason
      };
      
      console.log('Successfully created clean evaluation:', evaluation);
      
      return new Response(JSON.stringify(evaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error processing evaluation:', error);
      console.error('Received content:', evaluationText);
      
      // Fallback: Return a simple valid response instead of failing
      const fallbackEvaluation = {
        score: 50,
        reason: "Evaluation could not be processed. This is a fallback response."
      };
      
      return new Response(JSON.stringify(fallbackEvaluation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        fallback: {
          score: 50,
          reason: "Evaluation could not be generated due to a server error."
        }
      }),
      { 
        status: 200, // Return 200 instead of 500 to prevent breaking the client
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})
