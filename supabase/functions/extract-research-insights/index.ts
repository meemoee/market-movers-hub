import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { webContent, analysis, marketPrice, marketQuestion, focusText, iterations = [] } = await req.json()
    
    // Trim content to avoid token limits
    const trimmedContent = webContent.slice(0, 15000)
    console.log('Web content length:', trimmedContent.length)
    console.log('Analysis length:', analysis.length)
    console.log('Current market price:', marketPrice !== undefined ? marketPrice + '%' : 'not provided')
    console.log('Market question:', marketQuestion || 'not provided')
    console.log('Focus text:', focusText || 'not provided')
    console.log('Iterations count:', iterations.length)
    
    // Track existing research areas and analyzed data for better suggestions
    const existingAreas = new Set()
    const exploredTopics = new Set()
    const queryEffectiveness = new Map()
    
    if (iterations && iterations.length > 0) {
      iterations.forEach(iteration => {
        if (iteration.queries) {
          iteration.queries.forEach(query => {
            // Extract potential research areas from queries
            const words = query.split(/\s+/)
            if (words.length >= 3) {
              existingAreas.add(words.slice(0, 3).join(' ').toLowerCase())
            }
            
            // Track all substantial query parts for diversity check
            words.filter(w => w.length > 3).forEach(word => {
              exploredTopics.add(word.toLowerCase())
            })
            
            // Estimate query effectiveness based on result counts
            // More sophisticated effectiveness tracking could be implemented here
            if (iteration.results && iteration.results.length > 0) {
              const resultsForQuery = iteration.results.filter(r => 
                r.query === query || r.originalQuery === query
              )
              
              if (resultsForQuery.length > 0) {
                const relevantResultsCount = resultsForQuery.reduce((count, r) => {
                  // Consider content length and relevance to focus text as effectiveness metrics
                  const contentLength = r.content ? r.content.length : 0
                  const relevanceScore = focusText && contentLength > 0 ? 
                    (r.content.toLowerCase().includes(focusText.toLowerCase()) ? 2 : 1) : 1
                  return count + relevanceScore
                }, 0)
                
                queryEffectiveness.set(query, relevantResultsCount)
              }
            }
          })
        }
      })
    }
    
    console.log('Tracked existing research areas:', existingAreas.size)
    console.log('Tracked explored topics:', exploredTopics.size)
    console.log('Query effectiveness tracking:', 
      Array.from(queryEffectiveness.entries())
        .map(([query, score]) => `"${query}": ${score}`)
        .join(', ')
    )

    // Extract patterns from effective queries
    const effectiveQueryPatterns = []
    if (queryEffectiveness.size > 0) {
      // Sort queries by effectiveness score
      const sortedQueries = Array.from(queryEffectiveness.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3) // Take top 3 most effective queries
        
      console.log('Top effective queries:', 
        sortedQueries.map(([query, score]) => `"${query}" (score: ${score})`).join(', ')
      )
      
      // Extract patterns from effective queries for future query generation
      sortedQueries.forEach(([query]) => {
        const words = query.split(/\s+/)
        if (words.length >= 4) {
          // Extract query templates like "X analysis of Y" or "Z statistics for W"
          const template = words.map(w => {
            // Replace specific entities with placeholders but keep structural words
            return w.length > 5 && /^[A-Z]/.test(w) ? '{entity}' : 
                   w.length > 7 ? '{term}' : w
          }).join(' ')
          
          effectiveQueryPatterns.push(template)
        }
      })
    }
    
    console.log('Extracted query patterns:', effectiveQueryPatterns.join(', '))

    // Make request to OpenRouter API
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
            content: `You are a helpful market research analyst. Extract key insights from the provided web research and analysis. 
            You must return ONLY a JSON object with the requested fields. Extract ONLY factual points directly supported by the provided content. 
            Do not invent, interpolate, or add information not explicitly found in the source material.
            
            ${focusText ? `CRITICAL: Pay special attention to information related to "${focusText}" when forming your analysis.` : ''}
            ${existingAreas.size > 0 ? `Avoid suggesting already explored research areas: [${Array.from(existingAreas).join(', ')}]` : ''}
            ${effectiveQueryPatterns.length > 0 ? `Use these effective query patterns for research suggestions: [${effectiveQueryPatterns.join(', ')}]` : ''}`
          },
          {
            role: "user",
            content: `Based on this web research and analysis, provide the probability and insights:

${marketQuestion ? `Market Question: ${marketQuestion}` : ''}
${marketPrice !== undefined ? `Current Market Probability: ${marketPrice}%` : ''}
${focusText ? `Research Focus: ${focusText}` : ''}

Web Content:
${trimmedContent}

Analysis:
${analysis}

${marketPrice !== undefined ? `Consider if the current market probability of ${marketPrice}% is accurate based on the available information.` : ''}

Return ONLY a JSON object with these fields:
1. probability: your estimated probability as a percentage string (e.g., "65%")
2. areasForResearch: an array of strings describing specific areas needing more research (3-5 areas)
3. supportingPoints: specific points of evidence supporting the event occurring
4. negativePoints: specific points of evidence against the event occurring
5. reasoning: a brief paragraph explaining your probability estimate
6. queryEffectiveness: a number from 1-10 rating how well the current queries answered key questions

For areasForResearch, provide HIGHLY SPECIFIC and TARGETED research areas that:
- Are directly relevant to uncertainties in the current analysis
- Have clear, concrete phrasing (not vague topics)
- ${focusText ? `Build upon the current focus "${focusText}" with new angles` : 'Address the most critical knowledge gaps'}
- Would yield actionable insights if researched further
- Include specific entities, time periods, or contexts to investigate

Each point must be a direct fact or evidence found in the provided content. Do not create generic points or infer information not explicitly stated. Only include points that have specific evidence in the source material.`
          }
        ],
        response_format: { type: "json_object" },
        stream: false
      })
    });

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, await response.text())
      throw new Error('Failed to get insights from OpenRouter')
    }

    const data = await response.json()
    console.log('Got response from OpenRouter:', !!data)
    
    try {
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenRouter response')
      }
      
      console.log('Content type:', typeof content)
      
      // Parse JSON content if it's a string, or use it directly if it's already an object
      let parsed
      if (typeof content === 'string') {
        try {
          parsed = JSON.parse(content)
        } catch (err) {
          console.error('Error parsing JSON:', err)
          console.log('Raw content:', content)
          throw new Error('Failed to parse OpenRouter response as JSON')
        }
      } else if (typeof content === 'object') {
        parsed = content
      } else {
        throw new Error(`Unexpected content type: ${typeof content}`)
      }
      
      // Keep the result simple, use exactly what comes from the API
      const result = {
        probability: parsed.probability || "Unknown",
        areasForResearch: Array.isArray(parsed.areasForResearch) ? parsed.areasForResearch : [],
        supportingPoints: Array.isArray(parsed.supportingPoints) ? parsed.supportingPoints : [],
        negativePoints: Array.isArray(parsed.negativePoints) ? parsed.negativePoints : [],
        reasoning: parsed.reasoning || "No reasoning provided",
        queryEffectiveness: parsed.queryEffectiveness || 5
      }
      
      console.log('Returning formatted result with fields:', Object.keys(result).join(', '))
      console.log('Supporting points count:', result.supportingPoints.length)
      console.log('Negative points count:', result.negativePoints.length)
      console.log('Areas for research count:', result.areasForResearch.length)
      console.log('Query effectiveness score:', result.queryEffectiveness)
      
      // Return a direct Response with the result JSON instead of a stream
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Error processing OpenRouter response:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in extract-research-insights:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        probability: "Unknown",
        areasForResearch: [],
        supportingPoints: [],
        negativePoints: [],
        reasoning: "An error occurred while extracting insights.",
        queryEffectiveness: 0
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
