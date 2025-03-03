
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  if (!API_KEY) {
    console.error('OPENROUTER_API_KEY is not set');
    return new Response(
      JSON.stringify({ error: 'OpenRouter API key is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { question, analysis, model, useOpenRouter } = await req.json();

    console.log(`Evaluating Q&A pair: Question length: ${question.length}, Analysis length: ${analysis.length}`);
    console.log(`Using model: ${model}, OpenRouter: ${useOpenRouter}`);

    if (!question || !analysis) {
      return new Response(
        JSON.stringify({ error: 'Question and analysis are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use OpenRouter for evaluation
    const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';

    const systemPrompt = `
You are an expert evaluator of question-answer pairs. Your task is to assess the quality of an analysis that answers a specific question. 
Evaluate the analysis on how well it addresses the question, the depth and accuracy of the information provided, and the logical reasoning demonstrated.

Rate the analysis on a scale from 0 to 100, where:
- 0-40: Poor (fails to address the question or contains significant errors)
- 41-60: Fair (addresses the question partially but lacks depth or has some errors)
- 61-80: Good (addresses the question well with adequate depth and few errors)
- 81-100: Excellent (comprehensively addresses the question with great depth, accuracy, and strong reasoning)

Provide ONLY a JSON response in the following format:
{"score": <numeric_score>, "reason": "<brief_explanation_of_the_score>"}

DO NOT include any additional text, markdown formatting, or explanations outside of the JSON object.
`;

    const userPrompt = `
Question: ${question}

Analysis to evaluate: ${analysis}

Remember, provide ONLY a JSON response with a score and reason. No additional text.
`;

    const response = await fetch(openRouterUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': 'https://hunchex.xyz',
        'X-Title': 'HunchEx QA Evaluation'
      },
      body: JSON.stringify({
        model: model || "google/gemini-1.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },  // Explicitly request JSON format
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error from OpenRouter:', errorText);
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const responseData = await response.json();
    console.log('OpenRouter response:', JSON.stringify(responseData));

    // Extract content from the OpenRouter response
    const content = responseData.choices?.[0]?.message?.content || '';
    console.log('Extracted content:', content);

    try {
      // Try to parse the content as JSON
      const jsonResult = JSON.parse(content);
      
      // Validate the expected structure
      if (typeof jsonResult.score !== 'number' || typeof jsonResult.reason !== 'string') {
        console.error('Invalid evaluation format:', jsonResult);
        throw new Error('Invalid evaluation format');
      }

      // Return the valid JSON evaluation
      return new Response(
        JSON.stringify(jsonResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (parseError) {
      console.error('Failed to parse content as JSON:', parseError);
      console.error('Content received:', content);
      
      // Attempt to extract JSON from possible text format
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          const extractedJson = JSON.parse(jsonMatch[0]);
          console.log('Extracted JSON from text:', extractedJson);
          return new Response(
            JSON.stringify(extractedJson),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (e) {
          console.error('Failed to extract JSON from match:', e);
        }
      }

      // If all parsing attempts fail, return a fallback evaluation
      return new Response(
        JSON.stringify({ 
          score: 50, 
          reason: "Error parsing evaluation response. This is a fallback score." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in evaluate-qa-pair function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
