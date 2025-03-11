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

  try {
    const requestData = await req.json();
    const { 
      query, 
      marketId, 
      marketDescription, 
      question, 
      previousResults = "", 
      iteration = 1,
      areasForResearch = [],
      focusText = "",
      isFocusedResearch = false
    } = requestData;
    
    // Use either question or query parameter
    const researchQuery = question || query || "";
    const description = marketDescription || "";
    
    console.log("Received request for query generation:", { 
      researchQuery, 
      marketId, 
      description,
      previousResults: previousResults ? "present" : "absent",
      iteration,
      areasForResearch: Array.isArray(areasForResearch) ? areasForResearch.length : 0,
      focusText: focusText ? focusText.substring(0, 100) + "..." : "none",
      isFocusedResearch
    });
    
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }
    
    let contextInfo = `
      Market Question: ${researchQuery}
      ${description ? `Market Description: ${description}` : ''}
      ${marketId ? `Market ID: ${marketId}` : ''}
    `;
    
    // Add research focus if provided
    if (focusText) {
      contextInfo += `
        Research Focus: ${focusText}
      `;
    }
    
    // Add previous results and areas for research for iterations after the first
    if (iteration > 1 && previousResults) {
      contextInfo += `
        Previous Analysis: ${previousResults}
      `;
      
      if (Array.isArray(areasForResearch) && areasForResearch.length > 0) {
        contextInfo += `
          Areas Needing Further Research: ${areasForResearch.join(', ')}
        `;
      }
    }
    
    // Different prompts for initial vs subsequent iterations
    let systemPrompt;
    
    if (iteration === 1) {
      systemPrompt = `You are a research query generator for a prediction market platform. 
      Given a prediction market question and description, generate 3 search queries that would help research this topic.
      ${focusText ? `CRITICAL REQUIREMENT: You MUST focus specifically on: "${focusText}" - ALL generated queries SHOULD directly address this focus area` : ''}
      ${isFocusedResearch ? `This is a FOCUSED research request. The user has explicitly asked to drill down on: "${focusText}". Your primary goal is to generate queries that explore this specific aspect, NOT the general market question.` : ''}
      
      CRITICAL GUIDELINES FOR QUERIES:
      1. Each query MUST be self-contained and provide full context - a search engine should understand exactly what you're asking without any external context
      2. Include specific entities, dates, events, or proper nouns from the original question
      3. AVOID vague terms like "this event", "the topic", or pronouns without clear referents
      4. Make each query a complete, standalone question or statement that contains ALL relevant context
      5. If the original question asks about a future event, include timeframes or dates
      6. Use precise terminology and specific entities mentioned in the original question
      ${focusText ? `7. EVERY query MUST explicitly mention "${focusText}" or directly address this specific focus area` : ''}
      
      Focus on factual information that would help determine the likelihood of the event.
      Output ONLY valid JSON in the following format:
      {
        "queries": [
          "first search query with full context focusing on ${focusText || 'the market question'}",
          "second search query with full context focusing on ${focusText || 'the market question'}", 
          "third search query with full context focusing on ${focusText || 'the market question'}"
        ]
      }`;
    } else {
      systemPrompt = `You are a research query generator for a prediction market platform.
      Based on previous analysis and identified areas needing further research, generate 3 NEW search queries that address knowledge gaps.
      ${focusText ? `CRITICAL REQUIREMENT: You MUST focus specifically on: "${focusText}" - ALL generated queries SHOULD directly address this focus area` : ''}
      ${isFocusedResearch ? `This is a FOCUSED research request. The user has explicitly asked to drill down on: "${focusText}". Your primary goal is to generate queries that explore this specific aspect, NOT the general market question.` : ''}
      
      CRITICAL GUIDELINES FOR QUERIES:
      1. Each query MUST be self-contained and provide full context - a search engine should understand exactly what you're asking without any external context
      2. Include specific entities, dates, events, or proper nouns from the original question
      3. AVOID vague terms like "this event", "the topic", or pronouns without clear referents
      4. Make each query a complete, standalone question or statement that contains ALL relevant context
      5. If researching a future event, include timeframes or dates
      6. Use precise terminology and specific entities mentioned in the original question
      ${focusText ? `7. EVERY query MUST explicitly mention "${focusText}" or directly address this specific focus area` : ''}
      
      Focus specifically on areas that need additional investigation based on previous research.
      Queries should be more targeted than previous iterations, diving deeper into unclear aspects.
      DO NOT repeat previous queries, but build upon what has been learned.
      Output ONLY valid JSON in the following format:
      {
        "queries": [
          "first refined search query with full context focusing on ${focusText || 'the market question'}",
          "second refined search query with full context focusing on ${focusText || 'the market question'}", 
          "third refined search query with full context focusing on ${focusText || 'the market question'}"
        ]
      }`;
    }
    
    console.log(`Sending request to OpenRouter with ${iteration > 1 ? 'refined' : 'initial'} query generation${focusText ? ` focused on: ${focusText.substring(0, 50)}...` : ''}`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'https://hunchex.app',
        'X-Title': 'HunchEx',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextInfo }
        ],
        response_format: { type: "json_object" }
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenRouter API error:", errorData);
      throw new Error(`OpenRouter API returned error: ${response.status} ${errorData}`);
    }
    
    const data = await response.json();
    console.log("Received response from OpenRouter:", data);
    
    let queries = [];
    
    try {
      // Parse the JSON from the content field
      const content = data.choices[0]?.message?.content;
      console.log("Raw content from model:", content);
      
      if (content) {
        // Try to parse as JSON
        try {
          const parsedContent = JSON.parse(content);
          queries = parsedContent.queries || [];
          
          // Check if queries contain undefined values and replace them if needed
          if (queries.some(q => q === "undefined" || q === undefined)) {
            console.log("Found undefined values in queries, using fallback queries");
            queries = generateFallbackQueries(researchQuery, iteration, previousResults, focusText);
          }
        } catch (parseError) {
          console.error("Error parsing JSON from model response:", parseError);
          // If JSON parsing fails, try to extract queries with regex
          const match = content.match(/"queries"\s*:\s*\[(.*?)\]/s);
          if (match && match[1]) {
            queries = match[1].split(',')
              .map(q => q.trim().replace(/^"/, '').replace(/"$/, ''))
              .filter(q => q.length > 0 && q !== "undefined");
          }
        }
      }
    } catch (parseError) {
      console.error("Error extracting queries from model response:", parseError);
    }
    
    // If extraction failed or no queries were found, fall back to smart fallback queries
    if (!queries.length || queries.every(q => q === "undefined" || q === undefined)) {
      console.log("Falling back to smart query generation");
      queries = generateFallbackQueries(researchQuery, iteration, previousResults, focusText);
    }
    
    // Clean up queries and ensure they contain sufficient context
    queries = queries.map(q => {
      let cleanQuery = q.trim();
      
      // If focus text is provided but not included in the query, add it explicitly
      if (focusText && !cleanQuery.toLowerCase().includes(focusText.toLowerCase())) {
        cleanQuery = `${focusText} in relation to ${cleanQuery}`;
      }
      
      // Ensure the query has enough context by checking for common issues
      if (!containsSufficientContext(cleanQuery, researchQuery)) {
        cleanQuery = addContextToQuery(cleanQuery, researchQuery, focusText);
      }
      
      // Limit query length to 150 chars for efficiency
      if (cleanQuery.length > 150) {
        cleanQuery = cleanQuery.substring(0, 150);
      }
      
      return cleanQuery;
    });
    
    console.log("Final generated queries:", queries);
    
    // Return the result
    return new Response(JSON.stringify({ queries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("Error in generate-queries function:", error);
    
    // Get the query from the request if possible
    let query = "unknown";
    let iteration = 1;
    let focusText = "";
    try {
      const requestData = await req.json();
      query = requestData.query || requestData.question || "unknown";
      iteration = requestData.iteration || 1;
      const previousResults = requestData.previousResults || "";
      focusText = requestData.focusText || "";
      
      // Generate intelligent fallback queries
      const fallbackQueries = generateFallbackQueries(query, iteration, previousResults, focusText);
      
      return new Response(JSON.stringify({ queries: fallbackQueries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (parseError) {
      // If we can't parse the request, use very basic fallback
      console.error("Error parsing request in fallback:", parseError);
      const basicFallbackQueries = generateBasicFallbackQueries(query, focusText);
      
      return new Response(JSON.stringify({ queries: basicFallbackQueries }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
});

// Check if a query contains sufficient context
function containsSufficientContext(query: string, originalQuestion: string): boolean {
  // Extract key entities from original question
  const keyEntities = extractKeyEntities(originalQuestion);
  
  // Check if the query contains vague terms
  const vagueTerms = ["this", "it", "that", "these", "those", "the event", "the topic", "the question"];
  const hasVagueTerms = vagueTerms.some(term => 
    new RegExp(`\\b${term}\\b`, 'i').test(query)
  );
  
  // Check if the query contains at least one key entity
  const hasKeyEntity = keyEntities.some(entity => 
    query.toLowerCase().includes(entity.toLowerCase())
  );
  
  return hasKeyEntity && !hasVagueTerms;
}

// Add context to a query
function addContextToQuery(query: string, originalQuestion: string, focusText?: string): string {
  // Extract key entities and phrases from original question
  const keyEntities = extractKeyEntities(originalQuestion);
  
  // If query already has sufficient length and seems detailed, just return it
  if (query.length > 50 && keyEntities.some(entity => query.toLowerCase().includes(entity.toLowerCase()))) {
    // If focus text is provided but not included, add it
    if (focusText && !query.toLowerCase().includes(focusText.toLowerCase())) {
      return `${focusText} in context of ${query}`;
    }
    return query;
  }
  
  // Simplify original question to its core
  const simplifiedQuestion = originalQuestion.split(/[.?!]/).filter(s => s.trim().length > 0)[0].trim();
  
  // Combine the query with context from the original question
  if (focusText) {
    return `${query} regarding ${focusText} in context of ${simplifiedQuestion}`;
  }
  return `${query} regarding ${simplifiedQuestion}`;
}

// Extract key entities and phrases from text
function extractKeyEntities(text: string): string[] {
  // Basic extraction of proper nouns and important terms
  const entities: string[] = [];
  
  // Find potential proper nouns (words starting with capital letters)
  const properNouns = text.match(/\b[A-Z][a-z]+\b/g) || [];
  entities.push(...properNouns);
  
  // Extract date references
  const datePatterns = [
    /\b\d{4}\b/g, // years
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/gi, // full dates
    /\b(?:20\d{2}|19\d{2})\b/g // 4-digit years
  ];
  
  datePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    entities.push(...matches);
  });
  
  // Get key terms (longer words are often more significant)
  const words = text.split(/\s+/)
    .filter(word => word.length > 5)
    .map(word => word.replace(/[.,?!;:"'()]/g, ''))
    .filter(word => word.length > 0);
  
  entities.push(...words);
  
  // Remove duplicates and return
  return [...new Set(entities)];
}

// Helper function to generate intelligent fallback queries based on iteration
function generateFallbackQueries(query: string, iteration: number, previousResults: string = "", focusText: string = ""): string[] {
  // Clean up query text
  const cleanQuery = query.trim();
  
  // Extract key terms (simple approach)
  const words = cleanQuery.split(/\s+/).filter(word => 
    word.length > 3 && 
    !['this', 'that', 'will', 'with', 'from', 'have', 'been', 'were', 'when', 'what', 'where'].includes(word.toLowerCase())
  );
  
  const keyEntities = extractKeyEntities(cleanQuery);
  const keyTerms = keyEntities.length > 0 ? keyEntities.slice(0, 3).join(' ') : words.slice(0, 5).join(' ');
  
  // Add focus prefix if focus text is provided
  const focusPrefix = focusText ? `${focusText} in relation to ` : '';
  
  if (iteration === 1) {
    // First iteration - general exploration with full context
    return [
      `${focusPrefix}${cleanQuery} recent developments and current status`,
      `${focusPrefix}${cleanQuery} expert analysis and predictions`,
      `${focusPrefix}${cleanQuery} historical precedents and similar cases`
    ];
  } else if (iteration === 2) {
    // Second iteration - more targeted based on topic
    // Look for potential entities in the query
    const potentialEntities = words.filter(word => 
      word.length > 2 && word[0] === word[0].toUpperCase()
    ).slice(0, 2).join(' ');
    
    const entityPhrase = potentialEntities || keyTerms;
    
    return [
      `${focusPrefix}${entityPhrase} latest data and statistics regarding ${cleanQuery}`,
      `${focusPrefix}${cleanQuery} future outlook and probability assessments`,
      `${focusPrefix}${cleanQuery} expert opinions and consensus view`
    ];
  } else {
    // Third+ iteration - focus on specifics and filling gaps
    // If we have previous results, extract some key terms
    const prevTerms = previousResults 
      ? extractKeyTermsFromText(previousResults) 
      : keyTerms;
    
    return [
      `${focusPrefix}${prevTerms} statistical analysis in context of ${cleanQuery}`,
      `${focusPrefix}${cleanQuery} historical precedent and outcome patterns`,
      `${focusPrefix}${cleanQuery} expert forecast methodology and confidence levels`
    ];
  }
}

// Helper to generate very basic fallback queries when everything else fails
function generateBasicFallbackQueries(query: string, focusText: string = ""): string[] {
  const cleanQuery = query.trim();
  const focusPrefix = focusText ? `${focusText} in relation to ` : '';
  
  return [
    `${focusPrefix}${cleanQuery} comprehensive analysis`,
    `${focusPrefix}${cleanQuery} recent developments and current status`,
    `${focusPrefix}${cleanQuery} expert predictions and probability estimates`
  ];
}

// Helper to extract key terms from previous analysis text
function extractKeyTermsFromText(text: string): string {
  // Simple extraction of capitalized multi-word phrases
  const matches = text.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || [];
  
  if (matches.length > 0) {
    return matches[0];
  }
  
  // Fallback: find sentences with "need" or "missing" or "unclear"
  const sentences = text.split(/[.!?]+/).filter(s => 
    s.toLowerCase().includes('need') || 
    s.toLowerCase().includes('missing') || 
    s.toLowerCase().includes('unclear')
  );
  
  if (sentences.length > 0) {
    // Extract a few key words from the first relevant sentence
    const words = sentences[0].split(/\s+/).filter(w => 
      w.length > 4 && 
      !['needs', 'needed', 'need', 'missing', 'unclear', 'would', 'should', 'could'].includes(w.toLowerCase())
    ).slice(0, 3);
    
    return words.join(' ');
  }
  
  // Final fallback: just return first 2-3 substantial words
  const words = text.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  return words.join(' ');
}
