
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

serve(async (req) => {
  console.log("Generate queries function called")
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENROUTER_API_KEY) {
      console.error("OPENROUTER_API_KEY environment variable is required");
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }

    const payload = await req.json();
    console.log("Request payload:", payload);
    
    const { query } = payload;
    
    if (!query || typeof query !== "string") {
      console.error("Query parameter must be provided as a string");
      throw new Error("Query parameter must be provided as a string");
    }

    console.log("Generating queries for:", query);

    // Call OpenRouter API to generate search queries
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemini-flash-1.5",
        "messages": [
          {"role": "system", "content": "You are an expert research assistant that creates effective search queries."},
          {"role": "user", "content": `Generate 5 very short, simple search queries (2-3 terms maximum) to find information about:

"${query}"

IMPORTANT:
1. Keep queries VERY SHORT (2-3 terms maximum)
2. Include only the most important names and terms
3. DO NOT include special characters, dates, symbols or punctuation
4. Make each query different to capture diverse perspectives
5. Each query should be 2-3 words max

Respond with a JSON object containing a 'queries' key with an array of search query strings.`}
        ],
        "response_format": {"type": "json_object"}
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Response from OpenRouter:", data);
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error("Invalid response from OpenRouter API:", data);
      throw new Error("Invalid response from OpenRouter API");
    }

    const content = data.choices[0].message.content.trim();
    console.log("Content from OpenRouter:", content);
    
    let parsedContent;
    
    try {
      parsedContent = JSON.parse(content);
      console.log("Parsed JSON content:", parsedContent);
    } catch (error) {
      console.error(`Failed to parse JSON response: ${error.message}`);
      throw new Error(`Failed to parse JSON response: ${error.message}`);
    }

    const queries = parsedContent.queries || [];
    console.log("Extracted queries:", queries);
    
    // Sanitize all queries and ensure they're not empty
    const sanitizedQueries = queries
      .map(q => q.replace(/[^\w\s]/gi, ' ').trim())
      .filter(q => q.length > 0);
    
    console.log("Sanitized queries:", sanitizedQueries);
    
    if (sanitizedQueries.length === 0) {
      // Fallback to simple terms from the original query
      console.log("No valid queries found, falling back to terms from original query");
      const fallbackTerms = query
        .split(/\s+/)
        .filter(term => term.length > 3)
        .slice(0, 5)
        .map(term => term.replace(/[^\w\s]/gi, '').trim());
      
      sanitizedQueries.push(...fallbackTerms);
      console.log("Fallback queries:", sanitizedQueries);
    }

    const result = { queries: sanitizedQueries };
    console.log("Final result:", result);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  } catch (error) {
    console.error("Generate queries error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});
