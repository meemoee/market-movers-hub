import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { processStream } from "./streamProcessor.ts";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Create a Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req: Request) => {
  console.log("Function generate-qa-tree called with method:", req.method);
  
  // Handle CORS preflight requests (OPTIONS)
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, {
      status: 204, // No content
      headers: corsHeaders,
    });
  }

  // Check for POST method
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  try {
    // Parse request body
    const reqBody = await req.json();
    const {
      marketId,
      question,
      parentContent,
      isFollowUp = false,
      historyContext = "",
      marketQuestion = "",
      model = "gpt-4-turbo",
      useOpenRouter = false,
      researchContext = null,
    } = reqBody;

    console.log("Processing request with params:", {
      marketId,
      question: question?.substring(0, 50) + "...",
      isFollowUp,
      model,
      useOpenRouter,
      hasResearchContext: !!researchContext,
    });

    // Create appropriate prompt based on whether it's a follow-up or not
    let prompt;
    let endpoint;
    let requestBody;

    // If using OpenRouter (for Gemini or other models)
    if (useOpenRouter) {
      console.log("Using OpenRouter with model:", model);
      const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") || "";
      endpoint = "https://openrouter.ai/api/v1/chat/completions";

      if (isFollowUp) {
        // Construct follow-up prompt
        prompt = [
          {
            role: "system",
            content: `You are a helpful AI research assistant helping analyze a prediction market question. 
            Your task is to generate 3 insightful follow-up questions based on the analysis provided.
            Each follow-up question should explore a different important aspect not fully covered in the analysis.
            Format your response as a JSON array of objects with 'question' field only.
            Example: [{"question":"What is the impact of X on Y?"},{"question":"How does Z affect the outcome?"},{"question":"What historical precedents exist for this situation?"}]`,
          },
          {
            role: "user",
            content: `Market Question: ${marketQuestion}\n\nAnalysis: ${parentContent}\n${historyContext ? `\nPrevious History: ${historyContext}\n` : ""}`,
          },
        ];

        requestBody = {
          model: model,
          messages: prompt,
        };
      } else {
        // Construct initial analysis prompt
        let systemPrompt = `You are a helpful AI research assistant analyzing a prediction market question.
        Your task is to provide a comprehensive analysis of the question, considering various perspectives and evidence.
        Be thorough but concise, and stick to factual information.`;

        if (researchContext) {
          systemPrompt += `\n\nHere is some research context to consider:
          Analysis: ${researchContext.analysis}
          Probability estimate: ${researchContext.probability}
          Key areas needing research: ${researchContext.areasForResearch.join(", ")}`;
        }

        prompt = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this prediction market question: "${question}"\n${historyContext ? `\nPrevious History: ${historyContext}\n` : ""}${marketQuestion ? `\nRelated to market question: "${marketQuestion}"` : ""}`,
          },
        ];

        requestBody = {
          model: model,
          messages: prompt,
          stream: true,
        };
      }

      // Setup fetch options for OpenRouter
      const fetchOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": supabaseUrl,
        },
        body: JSON.stringify(requestBody),
      };

      // For follow-up questions, handle directly (no streaming)
      if (isFollowUp) {
        console.log("Fetching follow-up questions (non-streaming)");
        const response = await fetch(endpoint, fetchOptions);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("OpenRouter API error:", errorText);
          throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        let followUpQuestions = [];
        
        try {
          // Get the response content from the API
          const content = data.choices[0].message.content;
          console.log("Received follow-up content:", content);
          
          // Parse the JSON response
          followUpQuestions = JSON.parse(content);
          console.log("Parsed follow-up questions:", followUpQuestions);
          
          // Fallback if parsing fails
          if (!Array.isArray(followUpQuestions)) {
            console.warn("Follow-up content was not a valid array, creating fallback");
            followUpQuestions = [
              { question: "What are the key factors that could change this prediction?" },
              { question: "What historical precedents exist for this situation?" },
              { question: "What contrarian viewpoints exist that might change the outcome?" }
            ];
          }
        } catch (error) {
          console.error("Error parsing follow-up questions:", error);
          // Fallback questions if parsing fails
          followUpQuestions = [
            { question: "What are the key factors that could change this prediction?" },
            { question: "What historical precedents exist for this situation?" },
            { question: "What contrarian viewpoints exist that might change the outcome?" }
          ];
        }
        
        return new Response(JSON.stringify(followUpQuestions), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For initial analysis, stream the response
      console.log("Streaming analysis from OpenRouter");
      const response = await fetch(endpoint, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
      }
      
      // Process streaming response
      const processedStream = processStream(response);
      
      return new Response(processedStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } 
    // Default to using OpenAI (legacy path)
    else {
      console.log("Using default OpenAI path");
      const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
      endpoint = "https://api.openai.com/v1/chat/completions";

      if (isFollowUp) {
        prompt = [
          {
            role: "system",
            content: `You are a helpful AI research assistant helping analyze a prediction market question. Your task is to generate 3 insightful follow-up questions based on the analysis provided. Each follow-up question should explore a different important aspect not fully covered in the analysis. Format your response as a JSON array of objects with 'question' field only. Example: [{"question":"What is the impact of X on Y?"},{"question":"How does Z affect the outcome?"},{"question":"What historical precedents exist for this situation?"}]`,
          },
          {
            role: "user",
            content: `Market Question: ${marketQuestion}\n\nAnalysis: ${parentContent}\n${historyContext ? `\nPrevious History: ${historyContext}\n` : ""}`,
          },
        ];

        requestBody = {
          model: model,
          messages: prompt,
        };
      } else {
        let systemPrompt = `You are a helpful AI research assistant analyzing a prediction market question. Your task is to provide a comprehensive analysis of the question, considering various perspectives and evidence. Be thorough but concise, and stick to factual information.`;

        if (researchContext) {
          systemPrompt += `\n\nHere is some research context to consider:
          Analysis: ${researchContext.analysis}
          Probability estimate: ${researchContext.probability}
          Key areas needing research: ${researchContext.areasForResearch.join(", ")}`;
        }

        prompt = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this prediction market question: "${question}"\n${historyContext ? `\nPrevious History: ${historyContext}\n` : ""}${marketQuestion ? `\nRelated to market question: "${marketQuestion}"` : ""}`,
          },
        ];

        requestBody = {
          model: model,
          messages: prompt,
          stream: true,
        };
      }

      const fetchOptions = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(requestBody),
      };

      if (isFollowUp) {
        console.log("Fetching follow-up questions (non-streaming)");
        const response = await fetch(endpoint, fetchOptions);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("OpenAI API error:", errorText);
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        let followUpQuestions = [];

        try {
          const content = data.choices[0].message.content;
          console.log("Received follow-up content:", content);

          followUpQuestions = JSON.parse(content);
          console.log("Parsed follow-up questions:", followUpQuestions);

          if (!Array.isArray(followUpQuestions)) {
            console.warn("Follow-up content was not a valid array, creating fallback");
            followUpQuestions = [
              { question: "What are the key factors that could change this prediction?" },
              { question: "What historical precedents exist for this situation?" },
              { question: "What contrarian viewpoints exist that might change the outcome?" },
            ];
          }
        } catch (error) {
          console.error("Error parsing follow-up questions:", error);
          followUpQuestions = [
            { question: "What are the key factors that could change this prediction?" },
            { question: "What historical precedents exist for this situation?" },
            { question: "What contrarian viewpoints exist that might change the outcome?" },
          ];
        }

        return new Response(JSON.stringify(followUpQuestions), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Streaming analysis from OpenAI");
      const response = await fetch(endpoint, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", errorText);
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const processedStream = processStream(response);

      return new Response(processedStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
