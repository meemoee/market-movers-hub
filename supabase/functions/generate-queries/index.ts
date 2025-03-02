import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

interface QueryGenerationRequest {
  query: string;
  previousResults?: string;
  previousIterations?: Array<{
    iteration: number;
    analysis: string;
    queries: string[];
  }>;
  currentIteration?: number;
  areasForResearch?: string[];
  iteration?: number;
  marketId?: string;
  marketDescription?: string;
  question?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse the request
    const requestData: QueryGenerationRequest = await req.json()
    
    console.log("Request received:", {
      query: requestData.query,
      iteration: requestData.iteration || requestData.currentIteration || 0,
      hasPreviousResults: !!requestData.previousResults,
      hasPreviousIterations: !!requestData.previousIterations && requestData.previousIterations.length > 0,
      areasForResearchCount: requestData.areasForResearch?.length || 0
    })
    
    let queries: string[] = []
    
    // Extract meaningful information from the query
    const mainQuery = requestData.query || ''
    const currentIteration = requestData.iteration || requestData.currentIteration || 1
    const previousAnalysis = requestData.previousResults || ''
    const previousIterations = requestData.previousIterations || []
    const areasForResearch = requestData.areasForResearch || []
    
    // Generate initial default queries (for fallback)
    const defaultQueries = [
      `${mainQuery} latest information`,
      `${mainQuery} expert analysis`,
      `${mainQuery} statistics data`
    ]
    
    // For the first iteration, generate broad queries to gather general information
    if (currentIteration === 1) {
      // Keep the base queries slightly broader for the first iteration
      queries = [
        `${mainQuery} explained`,
        `${mainQuery} analysis data`,
        `${mainQuery} recent developments`,
        `${mainQuery} expert opinions`,
        `${mainQuery} factors affecting`
      ]
    } 
    // For subsequent iterations, focus on expanding areas identified in previous research
    else {
      // Compile insights from previous iterations to identify knowledge gaps
      const allPreviousAnalysis = previousIterations
        .map(iter => `Iteration ${iter.iteration} Analysis: ${iter.analysis}`)
        .join("\n\n") + "\n\nLatest Analysis: " + previousAnalysis
      
      console.log("Building on previous iterations:", previousIterations.length)
      
      // If we have areas for research, prioritize those
      if (areasForResearch && areasForResearch.length > 0) {
        console.log("Using areas for research to generate queries:", areasForResearch.length)
        
        // Use the identified areas for research to create targeted queries
        queries = areasForResearch.slice(0, 3).map(area => 
          `${mainQuery} ${area.toLowerCase().replace(/[^\w\s]/gi, '')}`
        )
        
        // Add a couple of general queries based on previous analysis
        const analysisBasedQueries = generateQueriesFromAnalysis(allPreviousAnalysis, mainQuery, currentIteration)
        queries = [...queries, ...analysisBasedQueries].slice(0, 5)
      } else {
        // Generate queries based on the previous analysis
        queries = generateQueriesFromAnalysis(allPreviousAnalysis, mainQuery, currentIteration)
      }
    }
    
    // Ensure we have at least 3 queries
    if (queries.length < 3) {
      console.log("Not enough queries generated, adding defaults")
      queries = [...queries, ...defaultQueries].slice(0, 5)
    }
    
    // Ensure queries are unique
    queries = [...new Set(queries)]
    
    // Clean queries from potential artifacts
    queries = queries.map(q => 
      q.trim()
       .replace(/\s+/g, ' ')
       .replace(/['"]/g, '')
       .replace(/\?$/, '')
    )
    
    console.log("Generated queries:", queries)
    
    return new Response(
      JSON.stringify({ 
        queries: queries,
        iteration: currentIteration 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Error generating queries:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateQueriesFromAnalysis(analysis: string, baseQuery: string, iteration: number): string[] {
  // Extract potential knowledge gaps and areas needing more research
  const lowerAnalysis = analysis.toLowerCase()
  const queries: string[] = []
  
  // Keywords that suggest uncertainty or need for more information
  const uncertaintyIndicators = [
    "unclear", "unknown", "uncertain", "lack of information",
    "not enough data", "more research needed", "further investigation",
    "remains to be seen", "questionable", "potentially", "might be",
    "could be", "possibly", "ambiguous", "contradictory", "conflicting"
  ]
  
  // Look for uncertainty indicators in the analysis
  const analysisLines = analysis.split(/[.!?]\s+/)
  
  for (const line of analysisLines) {
    const lowerLine = line.toLowerCase()
    
    // Check if the line contains any uncertainty indicators
    const containsUncertainty = uncertaintyIndicators.some(indicator => 
      lowerLine.includes(indicator)
    )
    
    if (containsUncertainty) {
      // Extract key noun phrases or topics from the line
      // This is a simplified approach - in a real system we'd use NLP
      const words = lowerLine.split(/\s+/)
      const keyPhrases = extractKeyPhrases(lowerLine, 3)
      
      if (keyPhrases.length > 0) {
        // Create a query based on the key phrase
        const query = `${baseQuery} ${keyPhrases[0]}`
        queries.push(query)
      }
    }
  }
  
  // For later iterations, make queries more specific and targeted
  if (iteration >= 3) {
    const specificQueries = queries.map(q => `${q} detailed evidence data`)
    queries.push(...specificQueries)
  }
  
  // If we couldn't extract uncertainty-based queries, fall back to topic-based ones
  if (queries.length < 3) {
    const topPhrases = extractKeyPhrases(analysis, 5)
    const topicQueries = topPhrases.map(phrase => 
      `${baseQuery} ${phrase} ${iteration >= 3 ? 'evidence' : 'information'}`
    )
    queries.push(...topicQueries)
  }
  
  return [...new Set(queries)].slice(0, 5)
}

function extractKeyPhrases(text: string, count: number): string[] {
  // This is a simplified approach to extract key phrases
  // Ideally, we would use NLP techniques for better phrase extraction
  
  // Remove common stop words
  const stopWords = ["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", "by", "about", "as", "of", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should", "may", "might", "must", "can", "could", "it", "its", "this", "that", "these", "those"]
  
  // Tokenize and filter
  const words = text.toLowerCase().split(/\W+/).filter(w => 
    w.length > 3 && !stopWords.includes(w)
  )
  
  // Count word frequencies
  const wordFreq: Record<string, number> = {}
  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1
  }
  
  // Get top words by frequency
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count * 2)
    .map(entry => entry[0])
  
  // Try to extract bigrams (pairs of words that appear together)
  const phrases: string[] = []
  const tokens = text.toLowerCase().split(/\W+/)
  
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i+1]}`
    if (
      tokens[i].length > 3 && 
      tokens[i+1].length > 3 && 
      !stopWords.includes(tokens[i]) && 
      !stopWords.includes(tokens[i+1])
    ) {
      phrases.push(bigram)
    }
  }
  
  // Combine top words and bigrams
  return [...phrases, ...topWords].slice(0, count)
}
