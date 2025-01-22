import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { marketId, userId, question } = await req.json()
    console.log('Received request:', { marketId, userId, question })

    if (!marketId || !userId || !question) {
      throw new Error('Market ID, user ID, and question are required')
    }

    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Fetch market context
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select(`
        *,
        event:events(
          title,
          category,
          sub_title
        )
      `)
      .eq('id', marketId)
      .single()

    if (marketError) {
      console.error('Error fetching market:', marketError)
      throw marketError
    }

    const marketContext = `
      Market Question: ${market.question}
      Description: ${market.description || 'No description available'}
      Event: ${market.event?.title || 'No event title'}
      Category: ${market.event?.category || 'No category'}
      Status: ${market.status}
      Active: ${market.active}
      Closed: ${market.closed}
    `.trim()

    // First call to Perplexity to generate answer and questions
    const perplexityResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "perplexity/llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that analyzes market predictions. For each question, provide a detailed answer and generate 3 relevant follow-up questions that would help deepen the analysis. Format your response as: ANSWER: [your answer] QUESTIONS: 1. [question1] 2. [question2] 3. [question3]"
          },
          {
            role: "user",
            content: `Based on this market information, provide an answer and 3 follow-up questions for: "${question}"\n\nContext:\n${marketContext}`
          }
        ],
        stream: true
      })
    })

    // Create a TransformStream to parse the Perplexity response
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        const lines = text.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(jsonStr)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(`data: ${JSON.stringify({ content })}\n\n`)
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    })

    // Second call to Gemini Flash for structured parsing
    const geminiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Market Analysis App',
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5-8b",
        messages: [
          {
            role: "system",
            content: "You are a parser that extracts answers and questions from analysis text. Return a JSON object with 'answer' and 'questions' fields, where questions is an array of 3 strings."
          },
          {
            role: "user",
            content: await perplexityResponse.text()
          }
        ],
        response_format: { type: "json_object" },
        stream: true
      })
    })

    return new Response(geminiResponse.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Error in generate-qa-tree function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
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