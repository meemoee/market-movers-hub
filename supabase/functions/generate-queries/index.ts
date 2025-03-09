
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      query, 
      marketPrice, 
      marketQuestion, 
      focusText, 
      previousQueries = [],
      previousAnalyses = [],
      previousProbability,
      iteration = 1
    } = await req.json()

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    console.log('Generating sub-queries for:', query)
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Focus text:', focusText || 'not provided')
    console.log('Iteration:', iteration)
    console.log('Previous queries count:', previousQueries.length)
    console.log('Previous analyses count:', previousAnalyses.length)
    
    // Create context from previous research if available
    let previousResearchContext = '';
    if (previousQueries.length > 0 || previousAnalyses.length > 0) {
      previousResearchContext = `
PREVIOUS RESEARCH CONTEXT:
${previousQueries.length > 0 ? `Previous search queries used:\n${previousQueries.slice(-15).map((q, i) => `${i+1}. ${q}`).join('\n')}` : ''}
${previousAnalyses.length > 0 ? `\nPrevious analysis summary:\n${previousAnalyses.slice(-1)[0].substring(0, 800)}${previousAnalyses.slice(-1)[0].length > 800 ? '...' : ''}` : ''}
${previousProbability ? `\nPrevious probability assessment: ${previousProbability}` : ''}

DO NOT REPEAT OR CLOSELY RESEMBLE any of the previous queries listed above. Generate entirely new search directions SPECIFICALLY focused on "${focusText || query}".`;
    }

    // Build a more directive prompt for focused research
    const focusedPrompt = focusText ? 
      `You are a specialized research assistant focusing EXCLUSIVELY on: "${focusText}".
Your task is to generate highly specific search queries about ${focusText} that provide targeted information relevant to ${marketQuestion || query}.
IMPORTANT: Do not generate general queries. EVERY query MUST explicitly mention or relate to "${focusText}".
STRICT REQUIREMENT: Each query MUST contain "${focusText}" AND include additional specific qualifiers, angles, or dimensions.
RESPOND ONLY WITH A JSON OBJECT containing an array of 5 specific, detailed search queries.
EXAMPLE JSON FORMAT: {"queries": ["detailed query 1", "detailed query 2", ...]}` 
      : 
      `You are a helpful assistant that generates search queries. 
RESPOND ONLY WITH A JSON OBJECT containing an array of 5 specific, detailed search queries.
EXAMPLE JSON FORMAT: {"queries": ["detailed query 1", "detailed query 2", ...]}`;
    
    // Log additional debug information
    console.log('Using focused prompt:', focusedPrompt.substring(0, 100) + '...')
    
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
          {
            role: "system",
            content: focusedPrompt
          },
          {
            role: "user",
            content: `Generate 5 diverse search queries to gather highly specific information about: ${focusText || query}

${marketQuestion ? `Market Question: ${marketQuestion}` : `Topic: ${query}`}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${focusText ? `YOUR SEARCH FOCUS MUST BE ON: ${focusText}` : ''}
${iteration > 1 ? `Current research iteration: ${iteration}` : ''}
${previousResearchContext}

${marketPrice !== undefined ? `Generate search queries to explore both supporting and contradicting evidence for this probability.` : ''}
${focusText ? `CRITICAL: EVERY query MUST specifically target information about: ${focusText}. Do not generate generic queries that fail to directly address this focus area.` : ''}

Generate 5 search queries that are:
1. Highly specific and detailed about "${focusText || query}"
2. Each query MUST include additional aspects beyond just the focus term itself
3. Diverse in approach and perspective
4. COMPLETELY DIFFERENT from previous research queries
5. Include specific entities, dates, or details to target precise information

EXAMPLE FORMAT for focused queries on "economic impact":
- "economic impact detailed statistical analysis on employment rates 2022-2023"
- "economic impact case studies in developing countries with quantitative measurements"
- "economic impact negative consequences on small businesses documented research"

Respond with a JSON object containing a 'queries' array with exactly 5 search query strings. The format should be {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`
          }
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
    
    try {
      let queriesData
      
      // First try parsing the content directly
      try {
        queriesData = JSON.parse(content)
        console.log('Successfully parsed JSON response directly')
      } catch (parseError) {
        console.log('Standard JSON parsing failed, attempting alternate parsing methods:', parseError)
        
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/)
        if (jsonMatch && jsonMatch[1]) {
          try {
            queriesData = JSON.parse(jsonMatch[1])
            console.log('Successfully extracted JSON from markdown code block')
          } catch (error) {
            console.error('Error parsing extracted JSON from markdown:', error)
          }
        }
        
        // If still no valid JSON, attempt to construct it from the text
        if (!queriesData) {
          console.log('Attempting to construct JSON from text response')
          
          // Extract lines that look like queries
          const queryLines = content.match(/["']?(.*?)["']?(?:,|\n|$)/g)
          if (queryLines && queryLines.length > 0) {
            const cleanedQueries = queryLines
              .map(line => {
                // Extract the actual query text from the line
                const match = line.match(/["']?(.*?)["']?(?:,|\n|$)/)
                return match ? match[1].trim() : null
              })
              .filter(q => q && q.length > 5 && !q.includes('{') && !q.includes('}'))
              .slice(0, 5)
            
            if (cleanedQueries.length > 0) {
              queriesData = { queries: cleanedQueries }
              console.log('Constructed JSON from extracted query lines:', queriesData)
            }
          }
        }
        
        // Last resort: use fallback queries
        if (!queriesData || !queriesData.queries || !Array.isArray(queriesData.queries) || queriesData.queries.length === 0) {
          console.log('Using fallback queries for focus:', focusText || query)
          
          // Enhanced fallback queries for focused research
          if (focusText) {
            console.log('Creating specialized fallback queries for focus text:', focusText)
            queriesData = {
              queries: [
                `${focusText} detailed analysis and recent developments`,
                `${focusText} statistical evidence and research studies`,
                `${focusText} expert opinions and critical assessments`,
                `${focusText} quantitative measurements and impact evaluation`,
                `${focusText} future projections based on current trends`
              ]
            }
          } else {
            queriesData = {
              queries: [
                `${query} latest information`,
                `${query} analysis and trends`,
                `${query} expert opinions`,
                `${query} recent developments`,
                `${query} statistics and data`
              ]
            }
          }
        }
      }
      
      // Ensure we have exactly 5 queries
      if (!queriesData.queries || !Array.isArray(queriesData.queries)) {
        console.log('No valid queries array found, creating default queries')
        queriesData.queries = [
          `${focusText || query} information`, 
          `${focusText || query} analysis`, 
          `${focusText || query} latest`, 
          `${focusText || query} data`, 
          `${focusText || query} news`
        ]
      } else if (queriesData.queries.length < 5) {
        // Fill remaining queries with focus-specific ones
        console.log('Filling missing queries, current count:', queriesData.queries.length)
        const generics = [
          `${focusText || query} latest developments`, 
          `${focusText || query} recent research`, 
          `${focusText || query} analysis methods`, 
          `${focusText || query} critical factors`, 
          `${focusText || query} expert assessment`
        ]
        
        for (let i = queriesData.queries.length; i < 5; i++) {
          queriesData.queries.push(generics[i % generics.length])
        }
      } else if (queriesData.queries.length > 5) {
        // Trim to 5 queries
        console.log('Trimming excess queries from', queriesData.queries.length, 'to 5')
        queriesData.queries = queriesData.queries.slice(0, 5)
      }
      
      // Validate each query and ensure they contain the focus area if specified
      const prevQuerySet = previousQueries.length > 0 ? 
        new Set(previousQueries.map(q => q.toLowerCase().trim())) : new Set();
      
      queriesData.queries = queriesData.queries.map((q: any, i: number) => {
        if (typeof q !== 'string' || q.trim().length < 5) {
          console.log(`Query at index ${i} is invalid, replacing with default`)
          return `${focusText || query} specific information ${i+1}`
        }
        
        // If we have a focus text, ensure it's included in the query
        if (focusText && !q.toLowerCase().includes(focusText.toLowerCase())) {
          console.log(`Adding focus "${focusText}" to query: ${q}`)
          return `${focusText} ${q}`
        }
        
        // Check if this query is a duplicate of a previous query
        if (prevQuerySet.has(q.toLowerCase().trim())) {
          console.log(`Query "${q}" is a duplicate of a previous query, replacing...`)
          
          // Generate alternative query
          const focusPrefix = focusText || query;
          const alternatives = [
            `${focusPrefix} latest developments iteration ${iteration}-${i}`,
            `${focusPrefix} recent analysis ${iteration}-${i}`,
            `${focusPrefix} expert perspective ${iteration}-${i}`,
            `${focusPrefix} market indicators ${iteration}-${i}`,
            `${focusPrefix} future outlook ${iteration}-${i}`
          ];
          
          return alternatives[i % alternatives.length];
        }
        
        return q.trim()
      })
      
      // Enhanced focused query generation for research areas
      if (focusText) {
        console.log('Performing additional validation for focused queries')
        
        queriesData.queries = queriesData.queries.map((q: string, i: number) => {
          const lowercaseQ = q.toLowerCase();
          const lowercaseFocus = focusText.toLowerCase();
          
          // If query is too generic or just repeats the focus text
          if (q.length < 30 || q.toLowerCase() === focusText.toLowerCase() || 
              (q.toLowerCase().includes(focusText.toLowerCase()) && 
               q.replace(new RegExp(focusText, 'i'), '').trim().length < 10)) {
            
            console.log(`Query too generic: "${q}", replacing with more specific query`)
            
            // Generate more specific, contextual queries
            const specificAngles = [
              `${focusText} quantitative analysis with statistical trends since 2023`,
              `${focusText} critical expert assessments in peer-reviewed publications`,
              `${focusText} comparative case studies with measurable outcomes`,
              `${focusText} unexpected consequences documented in research papers`,
              `${focusText} methodological approaches for accurate assessment`
            ];
            
            // Choose alternative that doesn't exist in previous queries
            let alternative = specificAngles[i % specificAngles.length];
            if (prevQuerySet.has(alternative.toLowerCase().trim())) {
              alternative = `${focusText} specialized research angle ${iteration}-${i}: ${alternative.split(':')[1] || 'detailed analysis'}`;
            }
            
            return alternative;
          }
          
          // If query doesn't contain the focus text
          if (!lowercaseQ.includes(lowercaseFocus)) {
            console.log(`Focus "${focusText}" missing from query: "${q}"`)
            return `${focusText} in context of: ${q}`;
          }
          
          return q;
        });
      }
      
      console.log('Final generated queries:', queriesData.queries)

      return new Response(
        JSON.stringify({ queries: queriesData.queries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    } catch (parseError) {
      console.error('Error handling LLM response:', parseError)
      console.log('Raw content:', content)
      
      // Provide fallback queries instead of failing
      const fallbackQueries = focusText ? [
        `${focusText} latest information related to ${query}`,
        `${focusText} analysis and trends for ${query}`,
        `${focusText} expert opinions about ${query}`,
        `${focusText} recent developments impacting ${query}`,
        `${focusText} statistics and data regarding ${query}`
      ] : [
        `${query} latest information`,
        `${query} analysis and trends`,
        `${query} expert opinions`,
        `${query} recent developments`,
        `${query} statistics and data`
      ];
      
      return new Response(
        JSON.stringify({ queries: fallbackQueries }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          } 
        }
      )
    }

  } catch (error) {
    console.error('Error generating queries:', error)
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
})
