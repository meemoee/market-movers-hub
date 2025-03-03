
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Add CORS headers to all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  try {
    const { question, analysis, model = "google/gemini-2.0-flash-lite-001", useOpenRouter = true } = await req.json();
    
    if (!question || !analysis) {
      return new Response(
        JSON.stringify({ error: 'Question and analysis are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API Key from environment
    const apiKey = useOpenRouter 
      ? Deno.env.get('OPENROUTER_API_KEY')
      : Deno.env.get('OPENAI_API_KEY');
      
    if (!apiKey) {
      const keyName = useOpenRouter ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY';
      throw new Error(`${keyName} environment variable not set`);
    }

    // Prepare the API request
    const apiEndpoint = useOpenRouter 
      ? "https://openrouter.ai/api/v1/chat/completions" 
      : "https://api.openai.com/v1/chat/completions";

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useOpenRouter) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['HTTP-Referer'] = 'https://hunchex.app';
      headers['X-Title'] = 'HunchEx';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log(`Evaluating QA pair using model: ${model} via ${useOpenRouter ? 'OpenRouter' : 'OpenAI'}`);

    const systemPrompt = `You are an expert evaluator of question-answer pairs. Your task is to assess the quality, comprehensiveness, and usefulness of an analysis provided for a specific question.`;
    
    const userPrompt = `Evaluate the following question and its analysis:

Question: "${question}"

Analysis: "${analysis}"

Score this analysis on a scale of 0-100 based on these criteria:
- Comprehensiveness: Does it cover all important aspects?
- Balance: Does it consider different perspectives?
- Clarity: Is it clearly explained and well-structured?
- Usefulness: Does it provide actionable insights?

Provide your evaluation as a JSON object with two fields:
- score: a number between 0 and 100
- reason: a brief explanation (25 words or less) for your score

Format your response ONLY as valid JSON like: {"score": 85, "reason": "Comprehensive analysis with balanced perspectives but lacks some clarity."}`;

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}):`, errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      // Parse the JSON response
      const evaluation = JSON.parse(content);
      
      console.log('Evaluation result:', evaluation);
      return new Response(
        JSON.stringify(evaluation),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('Error parsing evaluation result:', error, 'Content:', content);
      // Return a fallback evaluation
      return new Response(
        JSON.stringify({ score: 70, reason: "Could not parse model output. Default evaluation applied." }),
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
