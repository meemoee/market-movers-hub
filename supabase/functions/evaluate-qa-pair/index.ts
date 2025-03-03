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
            content: "You are an evaluator that assesses the quality and completeness of answers to questions. Your task is to provide a score between 0 and 100 and a brief reason for the score. IMPORTANT: You must output ONLY a valid JSON object in this exact format without ANY additional text before or after: {\"score\": number, \"reason\": \"string\"}. DO NOT include any explanations, markdown, headings, bullet points, or code blocks. Just the raw JSON object and nothing else. Your entire response must be parseable as JSON."
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
      // First, remove any non-JSON content from the beginning and end of the response
      evaluationText = evaluationText.trim();
      
      // Remove markdown, headings, code blocks, and any explanatory text
      evaluationText = evaluationText.replace(/^[\s\S]*?(\{)/m, '$1'); // Remove everything before first {
      evaluationText = evaluationText.replace(/(\})[\s\S]*$/m, '$1'); // Remove everything after last }
      
      // Log the cleaned text for debugging
      console.log('Stripped evaluation text:', evaluationText);
      
      // Attempt to extract just the JSON object using a more aggressive approach
      let jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        evaluationText = jsonMatch[0];
      }
      
      let evaluation;
      
      // Try direct parsing first
      try {
        evaluation = JSON.parse(evaluationText);
        
        // Validate required fields
        if (typeof evaluation.score !== 'number' || typeof evaluation.reason !== 'string') {
          throw new Error('Invalid evaluation structure');
        }
      } catch (parseError) {
        console.log('Direct parsing failed, using regex extraction');
        
        // Extract the score using regex
        const scoreMatch = evaluationText.match(/"score"\s*:\s*(\d+)/);
        const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50; // Default to 50 if no match
        
        // Extract the reason text
        const reasonRegex = /"reason"\s*:\s*"([\s\S]*?)(?:"\s*}|"\s*,|"$)/;
        const reasonMatch = evaluationText.match(reasonRegex);
        let reason = reasonMatch ? reasonMatch[1] : 'Evaluation could not be fully processed';
        
        // Clean the reason text to remove problematic characters
        reason = reason
          .replace(/\r?\n/g, ' ')   // Replace newlines with spaces
          .replace(/\\(?!["\\/bfnrt])/g, '\\\\') // Escape backslashes
          .replace(/"/g, '\\"')     // Escape quotes
          .replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
        
        // Create a new, clean evaluation object
        evaluation = {
          score: Math.max(0, Math.min(100, score)), // Ensure score is between 0 and 100
          reason: reason
        };
      }
      
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
    
    // Simply return a valid fallback evaluation instead of an error response
    // This is the most reliable approach to prevent client-side errors
    return new Response(
      JSON.stringify({
        score: 50,
        reason: "Evaluation could not be generated. This is a fallback response."
      }),
      { 
        status: 200, // Always return 200 to prevent breaking the client
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})
