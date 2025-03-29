
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory } = await req.json()
    
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not set')
    }

    console.log('Processing market analysis request:', { 
      messageLength: message.length,
      chatHistoryLength: chatHistory?.length || 0 
    })

    // Construct the system prompt
    const systemPrompt = `You are a helpful assistant with expertise in prediction markets and data analysis.

CHARACTERISTICS:
- Provide analysis of market probabilities based on the available evidence
- Discuss factors that might influence market outcomes
- When appropriate, suggest related markets that might be of interest
- Explain your reasoning clearly and logically
- Acknowledge uncertainty when present
- Use statistics and data when relevant
- Do not speculate unnecessarily
- Focus on factual analysis rather than opinions

RESPONSE FORMAT:
- Use clear, concise language
- Structure responses with appropriate headings and bullet points when helpful
- Include quantitative reasoning where applicable
- Clearly separate different ideas or topics

When discussing prediction markets specifically:
- Explain how market mechanisms work when relevant
- Discuss how to interpret market prices as probabilities
- Reference historical precedents when helpful
- Acknowledge potential market inefficiencies or biases

YOUR ROLE:
You help users understand prediction markets and form their own thoughtful market predictions. You don't make explicit buy/sell recommendations, but you help users think through the factors that might affect market outcomes.`

    // User message
    const userMessage = chatHistory ? 
      `${chatHistory}\n\nUser: ${message}` : 
      message

    // Call the OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        stream: true
      })
    })

    if (!response.ok) {
      throw new Error(`Error from OpenRouter API: ${response.status}`)
    }

    // Return streaming response
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('Error in market-analysis:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
