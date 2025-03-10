
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { OpenRouter } from "../deep-research/openRouter.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    })
  }

  try {
    const { description, marketId, iteration = 1, previousResults = [], focusText } = await req.json()
    
    if (!description) {
      return new Response(
        JSON.stringify({ error: 'Missing description parameter' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }
    
    console.log(`Generating search queries for market: ${marketId}`)
    console.log(`Description: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}`)
    console.log(`Focus area: ${focusText || 'none'}`)
    console.log(`Iteration: ${iteration}`)
    console.log(`Previous results count: ${previousResults.length}`)
    
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable not set')
    }
    
    const openRouter = new OpenRouter(openRouterApiKey)
    
    // Build query prompt based on iteration and focus
    let systemPrompt = `You are a research query generator specialized in breaking down complex topics into focused search queries.`
    
    if (focusText) {
      systemPrompt += `\nYou are specifically focusing on "${focusText}" and how it relates to the main topic.`
      systemPrompt += `\nEach query MUST explicitly include or relate to "${focusText}".`
    }
    
    if (iteration === 1) {
      systemPrompt += `\nFor the first research iteration, generate diverse search queries that ${focusText ? `explore different aspects of ${focusText} in relation to the topic` : 'explore different aspects of the topic'}.`
    } else {
      systemPrompt += `\nFor advanced research iterations, focus on specific details, technical aspects, and areas that might need deeper exploration.` 
    }
    
    // Define previous results context if available
    let previousContext = ""
    if (previousResults.length > 0) {
      previousContext = `\n\nPrevious research has found information about: ${previousResults.map((r: string) => `"${r.substring(0, 150)}..."`).join("\n")}`
    }
    
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `Generate 5 search queries to research ${focusText ? `specifically about "${focusText}" in relation to` : ''} the following topic: "${description}"
${previousContext}

${iteration > 1 ? "Generate more specific and detailed queries than before, focusing on aspects that need deeper investigation." : `Generate ${focusText ? 'focused' : 'diverse'} queries that explore different aspects of the topic.`}

Requirements:
1. Each query should be clear and specific
2. Use different angles and perspectives
3. Include relevant keywords that would yield useful search results
4. Make queries between 3-10 words in length
5. Don't include the market ID in the queries
${focusText ? `6. CRITICAL: Each query MUST explicitly mention or relate to "${focusText}"` : ''}

Format your response as a JSON array of strings containing ONLY the queries.
Example format: ["query 1", "query 2", "query 3", "query 4", "query 5"]`
      }
    ]
    
    try {
      // In production, use a streaming approach
      let queriesText = await openRouter.complete("google/gemini-flash-1.5", messages, 1000, 0.7)
      
      console.log("Raw response:", queriesText)
      
      // Extract the JSON part if the response is not properly formatted
      const jsonMatch = queriesText.match(/\[.*\]/s)
      if (jsonMatch) {
        queriesText = jsonMatch[0]
      }
      
      try {
        const queries = JSON.parse(queriesText)
        
        if (!Array.isArray(queries)) {
          console.error("Generated queries are not in array format")
          throw new Error("Generated queries are not in array format")
        }
        
        // Ensure we have 5 queries and they include the focus text if specified
        let finalQueries = queries.slice(0, 5).map((q: string) => {
          // Clean up the query
          let cleanedQuery = q.replace(/["""'']/g, '').trim()
          
          // If we have a focus text, ensure it's included
          if (focusText && !cleanedQuery.toLowerCase().includes(focusText.toLowerCase())) {
            cleanedQuery = `${focusText} ${cleanedQuery}`
          }
          
          // Remove market ID if it somehow got included
          if (marketId) {
            cleanedQuery = cleanedQuery.replace(new RegExp(` ?${marketId}`, 'g'), '')
          }
          
          return cleanedQuery
        })
        
        // If we have fewer than 5 queries, add some focused defaults
        while (finalQueries.length < 5) {
          const defaults = focusText ? [
            `${focusText} impact on ${description}`,
            `${focusText} analysis related to ${description}`,
            `${focusText} latest developments ${description}`,
            `${focusText} specific factors ${description}`,
            `${focusText} detailed examination ${description}`
          ] : [
            `${description} analysis`,
            `${description} latest information`,
            `${description} expert opinion`,
            `${description} statistics`,
            `${description} probability`
          ]
          finalQueries.push(defaults[finalQueries.length % defaults.length])
        }
        
        console.log("Generated queries:", finalQueries)
        
        return new Response(
          JSON.stringify({ queries: finalQueries }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } catch (error) {
        console.error("Error parsing queries:", error)
        
        // Create focused fallback queries
        const fallbackQueries = focusText ? [
          `${focusText} impact on ${description}`,
          `${focusText} analysis related to ${description}`,
          `${focusText} latest developments ${description}`,
          `${focusText} specific factors ${description}`,
          `${focusText} detailed examination ${description}`
        ] : [
          `${description} analysis`,
          `${description} latest information`,
          `${description} expert opinion`,
          `${description} statistics`,
          `${description} probability`
        ]
        
        return new Response(
          JSON.stringify({ 
            queries: fallbackQueries,
            error: "Failed to parse generated queries, using fallbacks"
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    } catch (error) {
      console.error("Error in OpenRouter request:", error)
      
      // Focused fallback queries
      const fallbackQueries = focusText ? [
        `${focusText} impact on ${description}`,
        `${focusText} analysis related to ${description}`,
        `${focusText} latest developments ${description}`,
        `${focusText} specific factors ${description}`,
        `${focusText} detailed examination ${description}`
      ] : [
        `${description} analysis`,
        `${description} latest information`,
        `${description} expert opinion`,
        `${description} statistics`,
        `${description} probability`
      ]
      
      return new Response(
        JSON.stringify({ 
          queries: fallbackQueries,
          error: `OpenRouter request failed: ${error.message}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
  } catch (error) {
    console.error("Error in generate-search-queries:", error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        queries: [
          "Error occurred, using fallback query 1",
          "Error occurred, using fallback query 2",
          "Error occurred, using fallback query 3",
          "Error occurred, using fallback query 4",
          "Error occurred, using fallback query 5"
        ]
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
