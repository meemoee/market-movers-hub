import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Main query generator function with context-aware generation
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      query,                  // Main research question 
      marketPrice,            // Current probability estimate (0-100%)
      marketQuestion,         // Original market question
      focusText,              // Specific focus area if specified
      previousQueries = [],   // Previously used search queries
      previousAnalyses = [],  // Previous analysis content
      previousProbability,    // Previous probability assessment
      parentQuery = '',       // Parent research question (when doing focused research)
      parentAnalysis = '',    // Analysis from parent research
      parentProbability = '', // Probability from parent research
      supportingPoints = [],  // Supporting evidence from parent
      negativePoints = [],    // Contradicting evidence from parent
      iteration = 1           // Current research iteration
    } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    // Log research parameters
    console.log('Generating queries for:', query)
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Focus text:', focusText || 'not provided')
    console.log('Iteration:', iteration)
    console.log('Previous queries count:', previousQueries.length)
    console.log('Previous analyses count:', previousAnalyses.length)
    console.log('Parent query provided:', !!parentQuery)
    console.log('Parent analysis provided:', !!parentAnalysis)
    
    // Build research context from previous work
    const researchContext = buildResearchContext({
      previousQueries,
      previousAnalyses,
      previousProbability,
      parentQuery,
      parentAnalysis,
      parentProbability,
      supportingPoints,
      negativePoints,
      focusText,
      query,
      iteration
    })
    
    // Set generation parameters based on research type
    const isFirstIteration = iteration === 1
    const isFocusedResearch = !!focusText
    const hasParentContext = !!parentQuery || !!parentAnalysis
    
    // Generate LLM prompt
    const { systemPrompt, userPrompt } = generatePrompts({
      query,
      marketQuestion,
      marketPrice,
      focusText,
      iteration,
      isFirstIteration,
      isFocusedResearch,
      hasParentContext,
      researchContext
    })
    
    // Get queries from LLM
    const queriesData = await generateQueriesFromLLM(systemPrompt, userPrompt)

    // Process and validate queries  
    const processedQueries = processQueries({
      generatedQueries: queriesData.queries,
      focusText,
      query,
      previousQueries,
      iteration
    })
    
    console.log('Final queries:', processedQueries)

    // Return processed queries
    return new Response(
      JSON.stringify({ queries: processedQueries }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Error generating queries:', error)
    return generateErrorResponse(error, corsHeaders)
  }
})

// Create structured research context from previous knowledge
function buildResearchContext({
  previousQueries,
  previousAnalyses,
  previousProbability,
  parentQuery,
  parentAnalysis,
  parentProbability,
  supportingPoints,
  negativePoints,
  focusText,
  query,
  iteration
}) {
  let context = {
    previousResearch: '',
    parentResearch: ''
  }
  
  // Build context from previous research iterations
  if (previousQueries.length > 0 || previousAnalyses.length > 0) {
    context.previousResearch = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.length > 0 ? `Previous search queries used:\n${previousQueries.slice(-15).map((q, i) => `${i+1}. ${q}`).join('\n')}` : ''}
${previousAnalyses.length > 0 ? `\nPrevious analysis summary:\n${previousAnalyses.slice(-1)[0].substring(0, 800)}${previousAnalyses.slice(-1)[0].length > 800 ? '...' : ''}` : ''}
${previousProbability ? `\nPrevious probability assessment: ${previousProbability}` : ''}

DO NOT REPEAT OR CLOSELY RESEMBLE any of the previous queries listed above. Generate entirely new search directions ${focusText ? `SPECIFICALLY focused on "${focusText}"` : ''}.`;
  }

  // Build context from parent research (for focused research)
  if (parentQuery || parentAnalysis) {
    context.parentResearch = `
PARENT RESEARCH CONTEXT:
${parentQuery ? `Original research question: "${parentQuery}"` : ''}
${parentProbability ? `\nProbability assessment from parent research: ${parentProbability}` : ''}
${parentAnalysis ? `\nKey findings from parent research:\n${parentAnalysis.substring(0, 800)}${parentAnalysis.length > 800 ? '...' : ''}` : ''}
${supportingPoints && supportingPoints.length > 0 ? `\nSupporting evidence from parent research:\n${supportingPoints.slice(0, 3).map((p, i) => `- ${p}`).join('\n')}` : ''}
${negativePoints && negativePoints.length > 0 ? `\nCountering evidence from parent research:\n${negativePoints.slice(0, 3).map((p, i) => `- ${p}`).join('\n')}` : ''}

Your task is to create search queries that DEEPEN the investigation on "${focusText}" based on this parent research context. Generate queries that EXTEND beyond what was already discovered.`;
  }
  
  return context
}

// Generate system and user prompts based on research parameters
function generatePrompts({
  query,
  marketQuestion,
  marketPrice,
  focusText,
  iteration,
  isFirstIteration,
  isFocusedResearch,
  hasParentContext,
  researchContext
}) {
  // System prompt - sets the core role and behavior
  const systemPrompt = isFocusedResearch ? 
    `You are a specialized research assistant focusing EXCLUSIVELY on: "${focusText}".
Your ONLY task is to generate highly specific search queries about ${focusText} that provide targeted information relevant to ${marketQuestion || query}.
CRITICAL INSTRUCTION: Every single query you generate MUST explicitly include "${focusText}" AND add additional specific qualifiers, angles, or dimensions.
You MUST NOT generate any query that doesn't directly and explicitly investigate "${focusText}".` 
    : 
    "You are a helpful assistant that generates search queries."
  
  // User prompt - provides specific instructions for this query generation
  let userPrompt = `Generate 5 diverse search queries to gather highly specific information about: ${focusText || query}

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${focusText ? `YOUR SEARCH FOCUS MUST BE ON: ${focusText}` : ''}
${iteration > 1 ? `Current research iteration: ${iteration}` : ''}`

  // Add context based on research type
  if (researchContext.parentResearch) {
    userPrompt += researchContext.parentResearch
  }
  
  if (researchContext.previousResearch) {
    userPrompt += researchContext.previousResearch
  }

  // Add focused research instructions for all iterations
  if (focusText) {
    userPrompt += `
CRITICAL INSTRUCTIONS FOR FOCUSED RESEARCH:
1. EVERY SINGLE QUERY must explicitly contain the term "${focusText}"
2. EVERY QUERY must include specific aspects, angles, or dimensions beyond just the focus term
3. DO NOT generate any general queries about ${query} that aren't specifically about "${focusText}"
4. Your queries should investigate different aspects and perspectives about "${focusText}"
5. Consider causality, impact, evidence, mechanisms, and expert opinions related to "${focusText}"

EXAMPLE FORMAT for focused queries on "${focusText}":
- "${focusText} detailed statistical analysis on [specific aspect] 2022-2023"
- "${focusText} case studies in [specific context] with quantitative measurements"
- "${focusText} negative consequences on [specific area] documented research"
- "${focusText} causal relationship with [related factor] scientific evidence"
- "${focusText} expert opinions from [specific field] regarding [aspect]"
`
  }

  // Add specific generation guidelines
  userPrompt += `
${marketPrice !== undefined ? `Generate search queries to explore both supporting and contradicting evidence for this probability.` : ''}

Generate 5 search queries that are:
1. Highly specific and detailed ${focusText ? `about "${focusText}"` : ''}
2. ${focusText ? `Each query MUST include "${focusText}" AND additional aspects beyond just the focus term itself` : 'Diverse in perspective and approach'}
3. ${isFirstIteration && isFocusedResearch ? 'Include fundamental/definitional queries, connection queries, and impact assessment queries' : 'Diverse in approach and perspective'}
4. COMPLETELY DIFFERENT from previous research queries
5. Include specific entities, dates, or details to target precise information

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings. The format should be {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`

  return { systemPrompt, userPrompt }
}

// Call LLM to generate queries 
async function generateQueriesFromLLM(systemPrompt, userPrompt) {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Research App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0].message.content.trim()
    
    console.log('Raw LLM response:', content)
    
    return parseAndValidateResponse(content)
  } catch (error) {
    console.error('Error calling OpenRouter:', error)
    throw error
  }
}

// Parse JSON response, handling various response formats
function parseAndValidateResponse(content) {
  try {
    // Try direct parsing first
    try {
      return JSON.parse(content)
    } catch (parseError) {
      console.log('Direct JSON parsing failed, trying alternative methods')
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/)
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1])
        } catch (error) {
          console.error('Error parsing JSON from markdown:', error)
        }
      }
      
      // Try to extract queries from the text
      const queryLines = content.match(/["']?(.*?)["']?(?:,|\n|$)/g)
      if (queryLines && queryLines.length > 0) {
        const cleanedQueries = queryLines
          .map(line => {
            const match = line.match(/["']?(.*?)["']?(?:,|\n|$)/)
            return match ? match[1].trim() : null
          })
          .filter(q => q && q.length > 5 && !q.includes('{') && !q.includes('}'))
          .slice(0, 5)
        
        if (cleanedQueries.length > 0) {
          return { queries: cleanedQueries }
        }
      }
      
      // Use fallback if nothing else works
      throw new Error("Cannot parse response")
    }
  } catch (error) {
    console.error('Failed to parse LLM response:', error)
    return { queries: [] }
  }
}

// Process the generated queries to ensure quality and relevance
function processQueries({
  generatedQueries,
  focusText,
  query,
  previousQueries,
  iteration
}) {
  // Ensure we have queries array
  if (!generatedQueries || !Array.isArray(generatedQueries)) {
    return generateFallbackQueries(focusText, query, iteration)
  }
  
  // Ensure we have exactly 5 queries
  let processedQueries = [...generatedQueries]
  
  // Add fallbacks if we don't have enough
  if (processedQueries.length < 5) {
    const fallbacks = generateFallbackQueries(focusText, query, iteration)
    for (let i = processedQueries.length; i < 5; i++) {
      processedQueries.push(fallbacks[i % fallbacks.length])
    }
  }
  
  // Trim if we have too many
  if (processedQueries.length > 5) {
    processedQueries = processedQueries.slice(0, 5)
  }
  
  // Process each query
  processedQueries = processedQueries.map((q, i) => {
    // Validate query format
    if (typeof q !== 'string' || q.trim().length < 5) {
      return focusText ? 
        `${focusText} specific information on ${query} iteration ${iteration}-${i+1}` :
        `${query} specific information ${i+1}`
    }
    
    // CRITICAL: Ensure focus text is included in focused queries
    if (focusText && !q.toLowerCase().includes(focusText.toLowerCase())) {
      // Instead of just appending, integrate the focus text more naturally
      if (q.toLowerCase().includes(query.toLowerCase())) {
        // Replace the general topic with focused topic where possible
        return q.replace(new RegExp(query, 'i'), focusText)
      } else {
        // Otherwise create a well-formed query that contains the focus text
        return `${focusText} in relation to ${q}`
      }
    }
    
    return q.trim()
  })
  
  // Check for duplicates with previous queries
  if (previousQueries.length > 0) {
    const prevQuerySet = new Set(previousQueries.map(q => q.toLowerCase().trim()))
    
    processedQueries = processedQueries.map((q, i) => {
      if (prevQuerySet.has(q.toLowerCase().trim())) {
        console.log(`Replacing duplicate query: "${q}"`)
        
        // Generate alternative focused queries
        if (focusText) {
          const alternatives = [
            `${focusText} latest developments in context of ${query} iteration ${iteration}-${i}`,
            `${focusText} recent analysis by experts iteration ${iteration}-${i}`,
            `${focusText} significant impact on ${query} iteration ${iteration}-${i}`,
            `${focusText} evidence-based assessment iteration ${iteration}-${i}`,
            `${focusText} future implications for ${query} iteration ${iteration}-${i}`
          ]
          return alternatives[i % alternatives.length]
        } else {
          // Fallback alternatives for non-focused research
          const alternatives = [
            `${query} latest developments iteration ${iteration}-${i}`,
            `${query} recent analysis ${iteration}-${i}`,
            `${query} expert perspective ${iteration}-${i}`,
            `${query} market indicators ${iteration}-${i}`,
            `${query} future outlook ${iteration}-${i}`
          ]
          return alternatives[i % alternatives.length]
        }
      }
      return q
    })
  }
  
  // Enhanced processing for focused queries
  if (focusText) {
    processedQueries = enhanceFocusedQueries(processedQueries, focusText, query, iteration, previousQueries)
  }
  
  return processedQueries
}

// Generate fallback queries if needed
function generateFallbackQueries(focusText, query, iteration) {
  if (focusText) {
    return [
      `${focusText} latest information related to ${query}`,
      `${focusText} analysis and trends for ${query}`,
      `${focusText} expert opinions about ${query}`,
      `${focusText} recent developments impacting ${query}`,
      `${focusText} statistics and data regarding ${query}`
    ]
  } else {
    return [
      `${query} latest information`,
      `${query} analysis and trends`,
      `${query} expert opinions`,
      `${query} recent developments`,
      `${query} statistics and data`
    ]
  }
}

// Enhance focused queries to ensure quality and diversity
function enhanceFocusedQueries(queries, focusText, query, iteration, previousQueries) {
  const prevQuerySet = previousQueries.length > 0 
    ? new Set(previousQueries.map(q => q.toLowerCase().trim()))
    : new Set()
    
  // Improve quality of each query
  let enhancedQueries = queries.map((q, i) => {
    const lowercaseQ = q.toLowerCase()
    const lowercaseFocus = focusText.toLowerCase()
    
    // Replace generic or too-simple queries
    if (q.length < 30 || q.toLowerCase() === focusText.toLowerCase() || 
        (q.toLowerCase().includes(focusText.toLowerCase()) && 
         q.replace(new RegExp(focusText, 'i'), '').trim().length < 10)) {
      
      // More structured query templates based on query phase
      const specificAngles = [
        `${focusText} quantitative analysis with statistical trends since 2022`,
        `${focusText} critical expert assessments from leading researchers`,
        `${focusText} detailed case studies with measurable outcomes`,
        `${focusText} impact on ${query} according to recent publications`,
        `${focusText} causal mechanisms and factors based on research`
      ]
      
      // Choose alternative not in previous queries
      let alternative = specificAngles[i % specificAngles.length]
      if (prevQuerySet && prevQuerySet.has(alternative.toLowerCase().trim())) {
        alternative = `${focusText} specialized research angle ${iteration}-${i}: ${alternative.split(':')[1] || 'detailed analysis'}`
      }
      
      return alternative
    }
    
    // ALWAYS ensure focus text is included
    if (!lowercaseQ.includes(lowercaseFocus)) {
      return `${focusText} in context of: ${q}`
    }
    
    return q
  })
  
  // Ensure diversity between queries
  const queryWords = enhancedQueries.map(q => 
    new Set(q.toLowerCase().split(/\s+/).filter(w => 
      w.length > 3 && w !== focusText.toLowerCase()
    ))
  )
  
  // Check each query pair for similarity
  for (let i = 0; i < enhancedQueries.length; i++) {
    for (let j = i + 1; j < enhancedQueries.length; j++) {
      const similarity = [...queryWords[i]].filter(word => queryWords[j].has(word)).length
      const uniqueWordsThreshold = Math.max(queryWords[i].size, queryWords[j].size) * 0.5
      
      // Replace similar queries
      if (similarity > uniqueWordsThreshold) {
        const templates = [
          `${focusText} alternative perspectives from ${['economic', 'political', 'social', 'technological', 'environmental'][j % 5]} analysis`,
          `${focusText} contrasting viewpoints based on ${['historical', 'current', 'theoretical', 'practical', 'futuristic'][j % 5]} evidence`,
          `${focusText} ${['challenges', 'opportunities', 'misconceptions', 'breakthroughs', 'failures'][j % 5]} documented in recent studies related to ${query}`
        ]
        
        enhancedQueries[j] = templates[j % templates.length]
      }
    }
  }
  
  return enhancedQueries
}

// Generate error response with fallback queries
function generateErrorResponse(error, corsHeaders) {
  console.error('Error in generate-queries:', error)
  
  return new Response(
    JSON.stringify({ 
      error: error.message,
      queries: [
        "fallback query 1",
        "fallback query 2",
        "fallback query 3", 
        "fallback query 4",
        "fallback query 5"
      ] 
    }),
    { 
      status: 500,
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  )
}
