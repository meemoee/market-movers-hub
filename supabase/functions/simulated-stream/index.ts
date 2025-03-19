
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0"

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://lfmkoismabbhujycnqpn.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Create a single supabase client for interacting with the database
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!)

// Function to split text into chunks with approximately equal lengths
function splitIntoChunks(text: string, numChunks: number): string[] {
  const chunkSize = Math.ceil(text.length / numChunks);
  const chunks: string[] = [];
  
  // Split by sentence boundaries when possible
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  if (sentences.length >= numChunks) {
    // If we have enough sentences, try to group them into chunks
    let currentChunk = '';
    let currentSize = 0;
    
    for (const sentence of sentences) {
      if (currentSize + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = sentence;
        currentSize = sentence.length;
      } else {
        currentChunk += sentence;
        currentSize += sentence.length;
      }
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
  } else {
    // If not enough sentences, split by character
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
  }
  
  // Ensure we don't have more than numChunks
  while (chunks.length > numChunks) {
    const last = chunks.pop() || '';
    const secondLast = chunks.pop() || '';
    chunks.push(secondLast + last);
  }
  
  return chunks;
}

// Function to store chunks with controlled delay - now returns a Promise
async function storeChunksWithDelay(jobId: string, iteration: number, chunks: string[]): Promise<void> {
  console.log(`Storing ${chunks.length} chunks for job ${jobId}, iteration ${iteration}`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Store the chunk in the database
    const { data, error } = await supabase.rpc(
      'append_analysis_chunk',
      { 
        job_id: jobId, 
        iteration: iteration, 
        chunk: chunk, 
        seq: i 
      }
    );
    
    if (error) {
      console.error(`Error storing chunk ${i}:`, error);
    } else {
      console.log(`Stored chunk ${i} with ID: ${data}`);
    }
    
    // Add a delay between chunks to simulate streaming
    // Vary the delay slightly for more realistic streaming
    const baseDelay = 200; // Increased base delay to 200ms
    const randomFactor = Math.random() * 0.5 + 0.75; // Random factor between 0.75 and 1.25
    const delay = Math.floor(baseDelay * randomFactor);
    
    // For the last few chunks, add a bit more delay to simulate thinking
    if (i > chunks.length - 3 && chunks.length > 5) {
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log(`Finished storing all chunks for job ${jobId}, iteration ${iteration}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, chatHistory, jobId, iteration = 0 } = await req.json()
    console.log('Received request:', { message, jobId, iteration })

    if (!jobId) {
      throw new Error('Job ID is required for simulated streaming');
    }

    console.log('Making request to OpenRouter API...')
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            content: "You are a helpful assistant. Be concise and clear in your responses."
          },
          {
            role: "user",
            content: `Chat History:\n${chatHistory || 'No previous chat history'}\n\nCurrent Query: ${message}`
          }
        ],
        stream: false // We want the full response at once for simulated streaming
      })
    })

    if (!openRouterResponse.ok) {
      console.error('OpenRouter API error:', openRouterResponse.status, await openRouterResponse.text())
      throw new Error(`OpenRouter API error: ${openRouterResponse.status}`)
    }

    const responseData = await openRouterResponse.json()
    const fullText = responseData.choices[0].message.content
    console.log('Received full response, length:', fullText.length)

    // Determine number of chunks based on text length
    // Longer texts get more chunks for more realistic streaming
    const textLength = fullText.length
    let numChunks = Math.max(8, Math.min(25, Math.floor(textLength / 40)))
    
    // Split the text into chunks
    const chunks = splitIntoChunks(fullText, numChunks)
    console.log(`Split response into ${chunks.length} chunks`)
    
    // Start storing chunks with delay in the background
    // We don't await this so we can return a response immediately
    // Using EdgeRuntime.waitUntil to ensure the function continues running
    const storeChunksPromise = storeChunksWithDelay(jobId, iteration, chunks)
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(storeChunksPromise)
    }
    
    // Return the initial response to let the client know processing has started
    return new Response(
      JSON.stringify({
        success: true,
        message: "Simulated streaming started",
        jobId,
        iteration,
        totalChunks: chunks.length
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )

  } catch (error) {
    console.error('Error in simulated-stream function:', error)
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
