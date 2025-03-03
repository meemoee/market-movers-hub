
import { corsHeaders } from '../_shared/cors';
import OpenAI from 'openai';

type RequestPayload = {
  question: string;
  analysis: string;
};

type EvaluationResponse = {
  score: number;
  reason: string;
};

// Initialize OpenAI
const openRouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://hunchex.app',
  }
});

// Better JSON parsing function with multiple fallbacks
const safeParseJSON = (text: string): any => {
  try {
    // First attempt: Regular JSON parse
    return JSON.parse(text);
  } catch (e) {
    try {
      // Second attempt: Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
    } catch (_) {
      // Third attempt: Try to extract anything that looks like JSON
      try {
        const jsonRegex = /\{[\s\S]*"score"\s*:\s*(\d+)[\s\S]*"reason"\s*:\s*"([^"]*)"[\s\S]*\}/;
        const match = text.match(jsonRegex);
        if (match) {
          return {
            score: parseInt(match[1]),
            reason: match[2]
          };
        }
      } catch (_) {
        // Fallback to a default response
        console.error("Failed to parse evaluation response, using fallback");
        return {
          score: 70,
          reason: "Evaluation could not be parsed properly. This is a default score."
        };
      }
    }
  }
  
  // Final fallback
  console.warn("Using default fallback evaluation");
  return {
    score: 70,
    reason: "Evaluation could not be generated properly. This is a default score."
  };
};

// Function to sanitize text for API calls
const sanitizeText = (text: string): string => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, analysis } = await req.json() as RequestPayload;
    
    if (!question || !analysis) {
      return new Response(
        JSON.stringify({ error: 'Question and analysis are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedQuestion = sanitizeText(question);
    const sanitizedAnalysis = sanitizeText(analysis);

    // Create retry mechanism with backoff
    const maxRetries = 3;
    let retryCount = 0;
    let evaluation: EvaluationResponse | null = null;

    while (retryCount < maxRetries && !evaluation) {
      try {
        const response = await openRouter.chat.completions.create({
          model: 'openai/gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are an expert evaluator of analyses related to prediction markets. Your job is to evaluate the quality and usefulness of an analysis based on:
              
1. Relevance to the original question
2. Depth and comprehensiveness of the analysis
3. Logical coherence and structure
4. Use of evidence and examples to support points
5. Clarity of expression

Provide your evaluation as a valid JSON object with these properties:
- score: a number between 0-100 representing the quality (0 = terrible, 100 = perfect)
- reason: a concise explanation of your score, highlighting strengths and potential improvements

IMPORTANT: Return ONLY valid JSON with these two fields, no other text.`
            },
            {
              role: 'user',
              content: `Question: ${sanitizedQuestion}\n\nAnalysis: ${sanitizedAnalysis}`
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 500
        });

        console.log("Raw evaluation response:", response.choices[0]?.message?.content);
        
        // Parse response
        if (response.choices[0]?.message?.content) {
          evaluation = safeParseJSON(response.choices[0].message.content);
          console.log("Parsed evaluation:", evaluation);
        }
      } catch (error) {
        console.error(`Attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        if (retryCount < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries failed, provide a default evaluation
    if (!evaluation) {
      console.warn("All evaluation attempts failed, using default evaluation");
      evaluation = {
        score: 65,
        reason: "Unable to evaluate the analysis due to technical issues. This is a fallback score."
      };
    }

    // Ensure score is within valid range
    if (typeof evaluation.score !== 'number' || isNaN(evaluation.score)) {
      evaluation.score = 65;
    } else {
      evaluation.score = Math.max(0, Math.min(100, Math.round(evaluation.score)));
    }

    // Ensure reason is a non-empty string
    if (typeof evaluation.reason !== 'string' || !evaluation.reason.trim()) {
      evaluation.reason = "No reason provided for the evaluation score.";
    }

    return new Response(
      JSON.stringify(evaluation),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Evaluation error:', error);
    
    // Return a helpful error response that won't break the client
    return new Response(
      JSON.stringify({
        score: 60,
        reason: "An error occurred during evaluation. This is a default score provided to prevent client errors."
      }),
      {
        status: 200, // Return 200 to avoid client errors
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
