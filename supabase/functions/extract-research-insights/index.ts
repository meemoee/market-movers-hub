import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Stream event types for structured streaming
enum StreamEventType {
  START = 'start',
  CONTENT = 'content',
  ERROR = 'error',
  DONE = 'done',
  HEARTBEAT = 'heartbeat'
}

// Helper to send stream events
function createStreamEvent(type: StreamEventType, data?: any) {
  return `data: ${JSON.stringify({
    type,
    data,
    timestamp: Date.now()
  })}\n\n`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get request parameters
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    const iteration = url.searchParams.get('iteration');
    const stream = url.searchParams.get('stream') === 'true';

    if (!jobId || !iteration) {
      return new Response(JSON.stringify({ 
        type: StreamEventType.ERROR,
        error: 'Missing jobId or iteration parameter' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create a TransformStream for streaming response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start the insight extraction process
    (async () => {
      try {
        console.log(`Starting insight extraction for job ${jobId}, iteration ${iteration}`);
        
        // Send start event
        await writer.write(encoder.encode(createStreamEvent(StreamEventType.START)));
        
        const { data, error } = await fetch(`https://lfmkoismabbhujycnqpn.supabase.co/rest/v1/research_jobs?id=eq.${jobId}&select=*`, {
          headers: {
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`
          }
        }).then(res => res.json());
        
        if (error || !data || data.length === 0) {
          console.error("Error fetching job data:", error || "Job not found");
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.ERROR, "Error fetching job data")));
          await writer.close();
          return;
        }
        
        const job = data[0];
        
        if (!job.iterations || !Array.isArray(job.iterations)) {
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.ERROR, "No iterations found in job")));
          await writer.close();
          return;
        }
        
        const iterationData = job.iterations.find(iter => iter.iteration === parseInt(iteration));
        
        if (!iterationData) {
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.ERROR, "Iteration not found")));
          await writer.close();
          return;
        }
        
        const sources = iterationData.results || [];
        const sourcesText = sources.map(source => `URL: ${source.url}\nTitle: ${source.title || 'No title'}\nContent: ${source.content}`).join('\n\n');
        
        // Send heartbeat every 5 seconds to keep connection alive
        const heartbeatInterval = setInterval(async () => {
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.HEARTBEAT)));
        }, 5000);
        
        // Prepare OpenAI request for analysis
        const prompt = `
Analyze the web content gathered about this topic: "${job.query}". 
${job.focus_text ? `With specific focus on: ${job.focus_text}\n` : ''}

Based ONLY on the content below, provide a detailed analysis. Do not make up information and only use what's provided:

${sourcesText}

Analyze the credibility, relevance, and implications of the information. Highlight areas where more research would be valuable.
`.trim();

        const messages = [
          {
            role: "system",
            content: "You are a helpful market research assistant that provides detailed analysis of web content."
          },
          { role: "user", content: prompt }
        ];

        // Make the OpenAI API request
        if (stream) {
          const response = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: messages,
              temperature: 0.3,
              stream: true
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API error:", response.status, errorText);
            await writer.write(encoder.encode(createStreamEvent(
              StreamEventType.ERROR, 
              `OpenAI API error: ${response.status} ${errorText}`
            )));
            clearInterval(heartbeatInterval);
            await writer.close();
            return;
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n').filter(line => line.trim() !== '');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    await writer.write(encoder.encode(createStreamEvent(StreamEventType.DONE)));
                    continue;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content || '';
                    
                    if (content) {
                      // Send content in structured format
                      await writer.write(encoder.encode(createStreamEvent(StreamEventType.CONTENT, content)));
                    }
                  } catch (e) {
                    console.error('Error parsing or writing stream data:', e);
                  }
                }
              }
            }
          } catch (streamError) {
            console.error("Stream processing error:", streamError);
            await writer.write(encoder.encode(createStreamEvent(
              StreamEventType.ERROR, 
              `Stream processing error: ${streamError.message}`
            )));
          }
          
          // Send done event
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.DONE)));
        } else {
          // Non-streaming response
          const response = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: messages,
              temperature: 0.3
            })
          });
          
          const result = await response.json();
          
          // Send full content at once
          const content = result.choices?.[0]?.message?.content || '';
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.CONTENT, content)));
          await writer.write(encoder.encode(createStreamEvent(StreamEventType.DONE)));
        }
        
        clearInterval(heartbeatInterval);
        await writer.close();
      } catch (error) {
        console.error("Error in extract-research-insights:", error);
        await writer.write(encoder.encode(createStreamEvent(
          StreamEventType.ERROR, 
          `Server error: ${error.message}`
        )));
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ 
      type: StreamEventType.ERROR,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
