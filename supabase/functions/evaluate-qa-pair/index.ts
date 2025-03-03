
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to add delay for retries
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function evaluateQAPair(question: string, analysis: string, retryCount = 0): Promise<any> {
  try {
    const maxRetries = 3;
    const backoffFactor = 1.5;
    const initialBackoff = 1000; // 1 second

    // Prepare the prompt for evaluation
    const prompt = `
You are an expert evaluator of question and answer quality. 
Your task is to evaluate how well an analysis answers a given question.

Question: ${question}

Analysis: ${analysis}

Evaluate the quality of this analysis considering:
1. Relevance to the question
2. Completeness of the answer
3. Accuracy of information
4. Clarity and readability
5. Logical structure

Provide a score from 0-100 where:
- 0-40: Poor (irrelevant, incomplete, inaccurate)
- 41-60: Fair (partially addresses the question with some issues)
- 61-80: Good (addresses the question well with minor issues)
- 81-100: Excellent (fully addresses the question with clarity and accuracy)

Your evaluation format must be exactly as follows (JSON object):
{
  "score": [numeric score between 0-100],
  "reason": [brief explanation of your evaluation in 1-2 sentences]
}
`;

    console.log(`Evaluating Q&A pair (attempt ${retryCount + 1}/${maxRetries + 1})...`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://market-analysis.hunchex.com", 
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error (${response.status}): ${errorText}`);
      
      // Retry with exponential backoff if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        const backoffTime = initialBackoff * Math.pow(backoffFactor, retryCount);
        console.log(`Retrying in ${backoffTime}ms...`);
        await sleep(backoffTime);
        return evaluateQAPair(question, analysis, retryCount + 1);
      }
      
      throw new Error(`OpenRouter API returned status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log("Evaluation completed successfully");
    
    try {
      // Extract the JSON content from the response
      const content = result.choices[0]?.message?.content || "{}";
      let evaluation;
      
      // Handle both string JSON and direct JSON objects
      if (typeof content === 'string') {
        evaluation = JSON.parse(content);
      } else {
        evaluation = content;
      }
      
      // Validate the response
      if (!evaluation.score || !evaluation.reason) {
        console.error("Invalid evaluation format", evaluation);
        throw new Error("Invalid evaluation format");
      }
      
      return {
        score: evaluation.score,
        reason: evaluation.reason
      };
    } catch (parseError) {
      console.error("Error parsing evaluation response:", parseError);
      console.error("Raw response:", result);
      
      // Retry on parsing errors if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        const backoffTime = initialBackoff * Math.pow(backoffFactor, retryCount);
        console.log(`Retrying after parse error in ${backoffTime}ms...`);
        await sleep(backoffTime);
        return evaluateQAPair(question, analysis, retryCount + 1);
      }
      
      throw new Error("Failed to parse evaluation response");
    }
  } catch (error) {
    console.error("Error in evaluateQAPair:", error);
    
    // Retry on any other errors if we haven't exceeded max retries
    if (retryCount < 3) {
      const backoffTime = 1000 * Math.pow(1.5, retryCount);
      console.log(`Retrying after error in ${backoffTime}ms...`);
      await sleep(backoffTime);
      return evaluateQAPair(question, analysis, retryCount + 1);
    }
    
    // If we've exhausted retries, return a fallback response
    return {
      score: 70,
      reason: "Evaluation service encountered errors. This is a fallback score."
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      throw new Error(`Method ${req.method} not allowed`);
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const body = await req.json();
    
    if (!body.question || !body.analysis) {
      throw new Error("Missing required fields: question and analysis");
    }

    const evaluation = await evaluateQAPair(body.question, body.analysis);

    return new Response(JSON.stringify(evaluation), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 200,
    });
  } catch (error) {
    console.error("Function error:", error.message);
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
      status: 500,
    });
  }
});
