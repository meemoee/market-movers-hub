
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { StreamProcessor } from "./streamProcessor.ts";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stream transform using the StreamProcessor
async function* transformStream(
  readableStream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = readableStream.getReader();
  const processor = new StreamProcessor();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const finalContent = processor.finalize();
        if (finalContent) {
          yield finalContent;
        }
        break;
      }
      
      const processedContent = processor.processChunk(value);
      if (processedContent) {
        yield processedContent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function analyzeAndGenerateFollowups(marketQuery: string): Promise<Response> {
  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY environment variable not set");
    }
    
    console.log(`Analyzing market query: ${marketQuery}`);
    
    // Prepare the analysis prompt
    const analysisPrompt = `Analyze this prediction market question: "${marketQuery}"
    1. What is this question asking?
    2. What are the key components that would affect the outcome?
    3. What data would be useful to evaluate this question?
    4. What are the potential outcomes and their implications?`;
    
    // Prepare the OpenRouter API request
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost:3000",
        "X-Title": "Market Research Assistant",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-opus:beta",
        messages: [
          { role: "system", content: "You're a research assistant helping users analyze prediction market questions. Provide thorough, insightful analysis." },
          { role: "user", content: analysisPrompt }
        ],
        stream: true,
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });
    
    // Create a ReadableStream that will process and transform the streaming response
    const transformedStream = new ReadableStream({
      async start(controller) {
        try {
          // Send opening JSON to establish stream structure
          controller.enqueue(new TextEncoder().encode('{"analysis":"'));
          
          // Process the stream of tokens
          for await (const chunk of transformStream(response.body!)) {
            controller.enqueue(new TextEncoder().encode(
              chunk.replace(/\n/g, "\\n").replace(/"/g, '\\"')
            ));
          }
          
          // Generate follow-up questions after analysis completes
          const followupQuestions = await generateFollowupQuestions(marketQuery);
          
          // Append follow-up questions to the stream and close
          controller.enqueue(new TextEncoder().encode(`","followups":${JSON.stringify(followupQuestions)}}`));
          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.error(error);
        }
      }
    });
    
    return new Response(transformedStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Error in analyzeMarket:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function generateFollowupQuestions(marketQuery: string): Promise<string[]> {
  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY environment variable not set");
    }
    
    // Prepare the follow-up questions prompt
    const followupPrompt = `For the prediction market question: "${marketQuery}"
    
    Generate 3-5 specific, focused follow-up questions that would help someone research this topic more deeply.
    Each question should:
    1. Target a specific aspect that affects the prediction
    2. Be answerable through research
    3. Help clarify the likelihood of different outcomes
    
    Format your response as a JSON array of strings containing only the questions.`;
    
    // Make API request for follow-up questions
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost:3000",
        "X-Title": "Market Research Assistant",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku",  // Using a smaller, faster model for follow-ups
        messages: [
          { role: "system", content: "You're a research assistant helping users analyze prediction market questions. Generate specific follow-up questions to help with research." },
          { role: "user", content: followupPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });
    
    const data = await response.json();
    
    // Parse the JSON response to extract questions
    try {
      const content = data.choices[0].message.content;
      const parsedContent = JSON.parse(content);
      
      // Handle different possible formats in the returned JSON
      if (Array.isArray(parsedContent)) {
        return parsedContent;
      } else if (parsedContent.questions && Array.isArray(parsedContent.questions)) {
        return parsedContent.questions;
      } else {
        // Fallback to extracting any array property found
        const arrayProps = Object.values(parsedContent).find(val => Array.isArray(val));
        if (arrayProps) return arrayProps;
      }
      
      // If we can't parse it properly, log and return default
      console.log("Couldn't extract questions array from:", content);
      return ["What historical precedents exist for this situation?", 
              "What are the key factors that could change the outcome?", 
              "What expert opinions exist on this topic?"];
    } catch (error) {
      console.error("Error parsing follow-up questions:", error);
      return ["What historical precedents exist for this situation?", 
              "What are the key factors that could change the outcome?", 
              "What expert opinions exist on this topic?"];
    }
  } catch (error) {
    console.error("Error generating follow-up questions:", error);
    return ["What historical precedents exist for this situation?", 
            "What are the key factors that could change the outcome?", 
            "What expert opinions exist on this topic?"];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Parse request body
    const requestData = await req.json();
    const marketQuery = requestData.marketQuery;
    
    if (!marketQuery) {
      return new Response(JSON.stringify({ error: "Missing marketQuery parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Process the market query
    return analyzeAndGenerateFollowups(marketQuery);
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
