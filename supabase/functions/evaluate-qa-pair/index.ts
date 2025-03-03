
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

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
    const { question, analysis, model, useOpenRouter } = await req.json();
    
    if (!question || !analysis) {
      throw new Error("Missing required fields: question and analysis");
    }
    
    console.log(`Evaluating Q&A pair with ${useOpenRouter ? 'OpenRouter' : 'OpenAI'} using model: ${model || 'default'}`);
    
    let response;
    
    // Use OpenRouter if specified
    if (useOpenRouter) {
      const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
      if (!openRouterApiKey) {
        throw new Error("OpenRouter API key not found");
      }
      
      const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
      const openRouterModel = model || "anthropic/claude-3-haiku-20240307";
      
      console.log(`Using OpenRouter with model: ${openRouterModel}`);
      
      const systemPrompt = `You are an AI evaluator that assesses analysis responses to questions. 
Your task is to evaluate the quality, accuracy, and thoroughness of an analysis based on how well it answers a given question.

Evaluate the analysis based on these criteria:
1. Relevance to the question
2. Depth and thoroughness
3. Logical structure and clarity
4. Evidence and reasoning
5. Balanced perspective

IMPORTANT: You MUST respond with a JSON object containing:
1. A numeric score from 0-100 representing the overall quality
2. A brief reason explaining the score

Your response MUST ONLY contain valid JSON in this format:
{"score": <number>, "reason": "<explanation>"}

Do not include any other text, markdown formatting, or additional commentary.`;
      
      const evaluationPrompt = `
Question: ${question}

Analysis: ${analysis}

Please evaluate this analysis response to the question above.
`;
      
      response = await fetch(openRouterUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterApiKey}`,
          "HTTP-Referer": "https://hunchex.app"
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: evaluationPrompt }
          ],
          response_format: { type: "json_object" }
        })
      });
    } else {
      // Default to OpenAI
      const apiKey = Deno.env.get("OPENAI_API_KEY");
      if (!apiKey) {
        throw new Error("OpenAI API key not found");
      }
      
      const openaiModel = model || "gpt-4-turbo-preview";
      console.log(`Using OpenAI with model: ${openaiModel}`);
      
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            {
              role: "system",
              content: `You are an AI evaluator that assesses analysis responses to questions. 
Your task is to evaluate the quality, accuracy, and thoroughness of an analysis based on how well it answers a given question.

Evaluate the analysis based on these criteria:
1. Relevance to the question
2. Depth and thoroughness
3. Logical structure and clarity
4. Evidence and reasoning
5. Balanced perspective

IMPORTANT: You MUST respond with a JSON object containing:
1. A numeric score from 0-100 representing the overall quality
2. A brief reason explaining the score

Your response MUST ONLY contain valid JSON in this format:
{"score": <number>, "reason": "<explanation>"}

Do not include any other text, markdown formatting, or additional commentary.`
            },
            {
              role: "user",
              content: `
Question: ${question}

Analysis: ${analysis}

Please evaluate this analysis response to the question above.
`
            }
          ],
          response_format: { type: "json_object" }
        })
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API request failed:", errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Received raw API response:", JSON.stringify(data));
    
    // Extract the actual content from the API response
    let evaluationResult;
    
    if (data.choices && data.choices.length > 0) {
      const content = data.choices[0].message?.content;
      console.log("Extracted content:", content);
      
      try {
        // Try to parse the content as JSON
        evaluationResult = JSON.parse(content);
        console.log("Parsed JSON result:", evaluationResult);
      } catch (e) {
        console.error("Failed to parse content as JSON:", e);
        // If parsing fails, return the raw content and let the client handle it
        evaluationResult = { score: 70, reason: "Could not properly evaluate the response" };
      }
    } else {
      console.error("Unexpected API response format:", data);
      throw new Error("Unexpected API response format");
    }
    
    // Return the evaluation result with CORS headers
    return new Response(
      JSON.stringify(evaluationResult),
      { 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
    
  } catch (error) {
    console.error("Error:", error.message);
    
    // Return error with CORS headers
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  }
});
