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
    const { question, marketId, parentContent, isFollowUp } = await req.json()
    
    if (!question) {
      throw new Error('Question is required')
    }
    
    console.log('Processing request:', {
      question,
      marketId,
      hasParentContent: !!parentContent,
      isFollowUp
    })

    // Handle follow-up questions generation
    if (isFollowUp && parentContent) {
      console.log('Generating follow-up questions')
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Market Analysis App',
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5",
          messages: [
            {
              role: "system",
              content: "Generate three analytical follow-up questions as a JSON array. Each question should be an object with a 'question' field. Return only the JSON array, nothing else."
            },
            {
              role: "user",
              content: `Generate three focused analytical follow-up questions based on this context:\n\nOriginal Question: ${question}\n\nAnalysis: ${parentContent}`
            }
          ]
        })
      })

      console.log('Follow-up response status:', response.status);
      const responseText = await response.clone().text();
      console.log('Raw follow-up response:', responseText);

      if (!response.ok) {
        throw new Error(`Follow-up generation failed: ${response.status}`)
      }

      try {
        const data = await response.json()
        console.log('Parsed follow-up data:', data);
        
        const rawContent = data.choices[0].message.content;
        console.log('Raw content before cleaning:', rawContent);
        
        const cleanContent = rawContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        
        console.log('Cleaned content:', cleanContent);
        
        const parsedContent = JSON.parse(cleanContent);
        if (!Array.isArray(parsedContent)) {
          throw new Error('Response is not an array');
        }
        
        return new Response(
          JSON.stringify(parsedContent), 
          { 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json'
            }
          }
        )
      } catch (e) {
        console.error('Invalid JSON in follow-up response:', e)
        throw new Error('Failed to parse follow-up questions')
      }
    }

    // Handle initial analysis with Perplexity model
    console.log('Generating analysis')
    const analysisResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            content: "You are a helpful assistant providing detailed analysis. Avoid using markdown headers or formatting. Start responses with complete sentences and use natural paragraph breaks. Include citations in square brackets [1] where relevant."
          },
          {
            role: "user",
            content: question
          }
        ],
        stream: true
      })
    })

    console.log('Analysis response status:', analysisResponse.status);
    const clonedResponse = analysisResponse.clone();
    const rawText = await clonedResponse.text();
    console.log('Raw analysis response:', rawText);

    if (!analysisResponse.ok) {
      throw new Error(`Analysis generation failed: ${analysisResponse.status}`)
    }

    // Create a transform stream to properly handle Perplexity chunks
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        try {
          const text = new TextDecoder().decode(chunk);
          console.log('Raw chunk before processing:', text);
          
          const lines = text.split('\n').filter(line => line.trim() !== '');
          console.log('Processing lines:', lines);
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              console.log('Extracted data:', data);
              
              if (data === '[DONE]') {
                console.log('Stream complete');
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                console.log('Parsed chunk data:', parsed);
                
                if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  console.log('Content to be sent:', content);
                  controller.enqueue(new TextEncoder().encode(line + '\n\n'));
                }
              } catch (e) {
                console.error('Error parsing chunk:', e);
              }
            }
          }
        } catch (error) {
          console.error('Error in transform stream:', error);
        }
      }
    });

    return new Response(analysisResponse.body?.pipeThrough(transformStream), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.stack : 'Unknown error'
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