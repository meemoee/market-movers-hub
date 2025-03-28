import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface GenerateQueriesRequest {
  query: string;
  marketId: string;
  marketQuestion?: string;  // Added optional market question field
  marketDescription?: string;  // Added optional market description field
  iteration?: number;
  previousQueries?: string[];
  focusText?: string;
  previousAnalyses?: string[];
}

interface GenerateQueriesResponse {
  queries: string[];
}

/**
 * Generate search queries based on market information and previous research
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY is not set in environment" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const requestData: GenerateQueriesRequest = await req.json();
    const { 
      query, 
      marketId, 
      marketQuestion,
      marketDescription,
      iteration = 1, 
      previousQueries = [], 
      focusText, 
      previousAnalyses = [] 
    } = requestData;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use market question and description if available, otherwise fallback to query
    const topicTitle = marketQuestion || query;
    const topicDescription = marketDescription || query;
    
    console.log(`Generating queries for market: "${topicTitle}" (iteration ${iteration})`);
    console.log(`Market description: "${topicDescription}"`);
    if (focusText) {
      console.log(`With focus area: "${focusText}"`);
    }

    // Generate prompt using the buildQueryPrompt helper method
    const prompt = buildQueryPrompt(
      topicTitle,
      topicDescription,
      iteration,
      previousAnalyses,
      previousQueries,
      focusText
    );

    // Call OpenRouter API to generate queries
    const openRouterResponse = await callOpenRouterAPI(
      OPENROUTER_API_KEY,
      prompt
    );

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API error: ${openRouterResponse.status} ${await openRouterResponse.text()}`);
    }

    // Process the response
    const result = await openRouterResponse.json();
    const content = result.choices[0].message.content.trim();
    
    // Extract and process queries
    const queries = processQueriesResponse(content, query, focusText);
    
    console.log(`Generated ${queries.length} queries:`, queries);

    return new Response(
      JSON.stringify({ queries }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating queries:", error);
    
    // Provide fallback queries in case of an error
    const fallbackQueries = generateFallbackQueries(error.message, 
      typeof requestData === "object" ? requestData.query : "market research");
    
    return new Response(
      JSON.stringify({ 
        error: `Query generation error: ${error.message}`,
        queries: fallbackQueries
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Helper function to build the query generation prompt
 */
function buildQueryPrompt(
  topicTitle: string,
  topicDescription: string,
  iteration: number = 1,
  previousAnalyses: string[] = [],
  previousQueries: string[] = [],
  focusText?: string
): string {
  let prompt = `Generate 5 search queries that someone would type into a search engine to gather information about this topic:

Topic: ${topicTitle}
Description: ${topicDescription}

CRITICAL CONTEXT FOR QUERY GENERATION:
The topic title represents the key market question: "${topicTitle}"
The description provides additional context: "${topicDescription}"

Your search queries must:
1. Combine elements from BOTH the title and description to create comprehensive, targeted queries
2. Format as search queries, not sentences with questions or punctuation
3. Include specific entities, names, and key technical terms from both title and description
4. Each query should address a distinct aspect of the market question
5. Avoid filler words like "what is" or "how to" unless absolutely necessary
6. Include enough context for relevant search results
7. PRIORITIZE RECENT DATA: Include terms like "latest", "recent", "2025", or "update" where appropriate
8. TARGET STATISTICAL DATA: Focus on finding specific numbers, statistics, percentages, or quantitative data
9. Include timeframes, dates, or specific periods when relevant to get the most current information
10. RESOLUTION TIMING: Include queries that search for when this question will be resolved and when relevant data will become available

Focus on different aspects that would be relevant for market research.`;

  // Add focus text if provided
  if (focusText && focusText.trim()) {
    prompt += `\n\nFOCUS AREA:
"${focusText.trim()}"

Ensure that most of your queries address this focus area while providing sufficient context. When focusing on this area, prioritize finding recent data points and specific statistics.`;
  }

  // Adjust prompt based on iteration and include previous analyses
  if (iteration > 1) {
    prompt += `\n\nThis is iteration ${iteration}. Your goal is to identify SPECIFIC knowledge gaps from previous research and create targeted queries to fill those gaps.`;
    
    // Include previous analyses if available
    if (previousAnalyses.length > 0) {
      prompt += `\n\nBased on previous research, these were our findings:\n`;
      previousAnalyses.forEach((analysis, index) => {
        // Only use the first 300 characters of each analysis to keep prompt size manageable
        const truncatedAnalysis = analysis.length > 300 
          ? analysis.substring(0, 300) + "..." 
          : analysis;
        prompt += `\nAnalysis ${index + 1}: ${truncatedAnalysis}\n`;
      });
      
      prompt += `\nQUERY GENERATION INSTRUCTIONS:
1. Identify 5 SPECIFIC unanswered questions or knowledge gaps in the previous analyses
2. Create a targeted search query for EACH specific gap
3. Each query should be precise, focusing on one specific aspect or data point
4. Prioritize collecting factual information over opinions
5. Target recent or time-sensitive information where relevant
6. Specifically search for NUMERIC DATA and STATISTICS that were missing in previous analyses
7. Include date ranges or time periods to ensure you get the most current information
8. Look for trend data, historical comparisons, and up-to-date metrics
9. RESOLUTION TIMING: Generate at least one query specifically about resolution timing, deadlines, or when conclusive data will be available`;
    } else {
      prompt += `\n\nKNOWLEDGE GAP REQUIREMENTS:
1. Analyze previous queries and target NEW topics not yet covered
2. Focus on missing information crucial for comprehensive understanding
3. Explore specialized sub-topics or alternative perspectives
4. Maintain search query format (not sentences)
5. Prioritize queries that will find the LATEST DATA and SPECIFIC STATISTICS
6. Include date ranges or time periods to ensure you get the most current information
7. RESOLUTION TIMING: Include at least one query about when this market question will be resolved and when resolution data will become available`;
    }
  }

  // Add previous queries to avoid repetition
  if (previousQueries.length > 0) {
    prompt += `\n\nAVOID generating queries similar to these:
${previousQueries.join('\n')}`;
  }

  prompt += `\n\nFor example, if the topic is "Will SpaceX successfully land humans on Mars by 2030?" and the description mentions "Elon Musk's Mars colonization plans face technical and funding challenges", good queries would be:
- SpaceX Mars mission timeline 2030 technical challenges latest updates
- Elon Musk Mars colonization funding statistics 2025 current status
- SpaceX Starship human landing technology readiness metrics percentage
- Mars mission delays SpaceX historical timeline analysis 2020-2025 data
- NASA SpaceX Mars collaboration funding numbers 2030 goal recent changes
- SpaceX Mars mission resolution criteria official announcement date

Respond with a JSON object containing a 'queries' array with exactly 5 search queries.`;

  return prompt;
}

/**
 * Helper function to call the OpenRouter API
 */
async function callOpenRouterAPI(apiKey: string, prompt: string): Promise<Response> {
  return await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "http://localhost",
      "X-Title": "Market Research App",
    },
    body: JSON.stringify({
      model: "google/gemini-flash-1.5",
      messages: [
        {
          role: "system",
          content: "You are a market research specialist that identifies specific knowledge gaps and generates effective search queries to fill those gaps. You create targeted queries that focus on obtaining precise information about specific aspects, data points, or examples needed. You have a strong preference for recent data and specific statistics."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" }
    })
  });
}

/**
 * Helper function to process and validate the query response
 */
function processQueriesResponse(content: string, fallbackPrefix: string, focusText?: string): string[] {
  let queries: string[] = [];
  try {
    const queriesData = JSON.parse(content);
    queries = queriesData.queries || [];
    
    // Process queries to ensure they're in search engine format
    queries = queries.map((q: string) => {
      // Remove question marks and unnecessary punctuation
      let processedQuery = q.replace(/\?|\.|!|"/g, '');
      
      // Remove filler question starts if present
      processedQuery = processedQuery.replace(/^(what is|how to|why does|when did|where can|how do|is there|are there|can i|should i|would a)/i, '');
      
      // Ensure first letter is capitalized if query doesn't start with a proper noun
      if (processedQuery.length > 0 && processedQuery[0].toLowerCase() === processedQuery[0]) {
        const firstChar = processedQuery.charAt(0).toUpperCase();
        processedQuery = firstChar + processedQuery.slice(1);
      }
      
      return processedQuery.trim();
    });
  } catch (error) {
    console.error("Error parsing OpenRouter response:", error, content);
    queries = generateFallbackQueries(fallbackPrefix, focusText);
  }
  
  return queries;
}

/**
 * Generate fallback queries in case of error
 */
function generateFallbackQueries(mainTopic: string, focusText?: string): string[] {
  // Generate fallback queries in search format style with recency and stats focus
  const topicForFallback = mainTopic || "market research";
  const queries = [
    `${topicForFallback} latest statistics 2025`,
    `${topicForFallback} recent data trends numbers`,
    `${topicForFallback} current metrics percentages`,
    `${topicForFallback} up-to-date analysis figures`,
    `${topicForFallback} resolution timeline when determined`
  ];
  
  // If focus text exists, add it to a couple of queries
  if (focusText && focusText.trim()) {
    const focusKeywords = focusText.trim().split(' ').slice(0, 3).join(' ');
    queries[1] = `${topicForFallback} ${focusKeywords} latest statistics data`;
    queries[3] = `${focusKeywords} impact on ${topicForFallback} recent numbers`;
  }
  
  return queries;
}
