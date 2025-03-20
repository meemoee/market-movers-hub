import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIKey = Deno.env.get('OPENAI_API_KEY') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Queue for managing outgoing stream chunks
const streamQueue = new Set<{ controller: ReadableStreamDefaultController, messageId: string }>();
const activeStreams = new Map<string, {
  lastActivity: number,
  controller: ReadableStreamDefaultController,
  aborted: boolean
}>();

// Constants for timeouts
const STREAM_TIMEOUT_MS = 120000; // 2 minutes
const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds

// Start heartbeat to keep streams alive
const heartbeatTimer = setInterval(() => {
  sendHeartbeats();
  checkStreamTimeouts();
}, HEARTBEAT_INTERVAL_MS);

// Setup cleanup for Deno deploy
addEventListener("unload", () => {
  clearInterval(heartbeatTimer);
  for (const {controller} of streamQueue) {
    try {
      controller.close();
    } catch (e) {
      console.error("Error closing controller during unload:", e);
    }
  }
  streamQueue.clear();
  activeStreams.clear();
});

// Send heartbeats to all active streams
function sendHeartbeats() {
  const now = Date.now();
  for (const [streamId, stream] of activeStreams.entries()) {
    if (now - stream.lastActivity > HEARTBEAT_INTERVAL_MS / 2) {
      try {
        const heartbeatEvent = `data: ${JSON.stringify({
          choices: [{ delta: { content: "" } }]
        })}\n\n`;
        stream.controller.enqueue(new TextEncoder().encode(heartbeatEvent));
        stream.lastActivity = now;
        console.log(`Sent heartbeat to stream ${streamId}`);
      } catch (e) {
        console.error(`Error sending heartbeat to stream ${streamId}:`, e);
        activeStreams.delete(streamId);
      }
    }
  }
}

// Check for stream timeouts
function checkStreamTimeouts() {
  const now = Date.now();
  for (const [streamId, stream] of activeStreams.entries()) {
    if (now - stream.lastActivity > STREAM_TIMEOUT_MS) {
      console.log(`Stream ${streamId} timed out after ${Math.round((now - stream.lastActivity)/1000)}s of inactivity`);
      try {
        if (!stream.aborted) {
          stream.aborted = true;
          stream.controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          stream.controller.close();
        }
      } catch (e) {
        console.error(`Error closing timed-out stream ${streamId}:`, e);
      } finally {
        activeStreams.delete(streamId);
      }
    }
  }
}

// Function to create a transformable readable stream
function createTransformStream(streamId: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      activeStreams.set(streamId, {
        controller,
        lastActivity: Date.now(),
        aborted: false
      });
      console.log(`Stream ${streamId} started`);
    },
    cancel(reason) {
      console.log(`Stream ${streamId} cancelled:`, reason);
      activeStreams.delete(streamId);
    }
  });
}

// Main function to analyze web content
async function analyzeWebContent(requestBody: any): Promise<Response> {
  const { data, query, marketId, previousContent, iteration, jobId, focusText } = requestBody;
  
  if (!data || !Array.isArray(data)) {
    return new Response(JSON.stringify({ error: 'Invalid data format. Expected array.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Analyzing ${data.length} sources for ${marketId}, iteration ${iteration || 1}`);
  
  // Generate a unique stream ID
  const streamId = `analyze-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
  // Create and return a streaming response
  const stream = createTransformStream(streamId);
  
  // Process the analysis in the background
  processAnalysisStream(streamId, data, query, marketId, previousContent, focusText, iteration, jobId)
    .catch(error => console.error(`Error in background analysis for stream ${streamId}:`, error));
  
  // Return the stream response
  return new Response(stream, {
    headers: { 
      ...corsHeaders, 
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// Process the analysis and send through the stream
async function processAnalysisStream(
  streamId: string, 
  data: any[], 
  query: string, 
  marketId: string,
  previousContent?: string,
  focusText?: string,
  iteration?: number, 
  jobId?: string
): Promise<void> {
  try {
    // Create a clean representation of the web content
    const contentItems = data.map((item, index) => {
      return `SOURCE ${index + 1}: ${item.title || 'Untitled'}
URL: ${item.url || 'No URL'}
CONTENT:
${item.content || 'No content'}
`;
    }).join('\n\n');
    
    // Create the analysis system prompt
    let systemPrompt = `You are a research analyst with expertise in analyzing market information and making probability assessments. You're analyzing research data for the question: "${query}"`;
    
    if (focusText) {
      systemPrompt += `\n\nFocus specifically on this aspect: ${focusText}`;
    }
    
    systemPrompt += `\n\nAnalyze the provided web content thoroughly and objectively. Look for relevant facts, expert opinions, recent developments, and consensus views.`;
    
    // Add guidance based on iteration
    if (iteration && iteration > 1) {
      systemPrompt += `\n\nThis is iteration ${iteration} of research. Build upon previous findings, focus on new information, and increase the depth of analysis.`;
    }
    
    // Create the user message
    let userMessage = `Please analyze the following web content related to: "${query}"`;
    
    if (previousContent) {
      userMessage += `\n\nPrevious research found: ${previousContent.slice(0, 2000)}${previousContent.length > 2000 ? '...' : ''}`;
    }
    
    userMessage += `\n\nHere's the content to analyze:\n\n${contentItems}`;
    
    if (focusText) {
      userMessage += `\n\nRemember to focus specifically on: ${focusText}`;
    }
    
    userMessage += `\n\nProvide a thorough analysis of this information. Include relevant facts, uncertainties, conflicting information, and your assessment of the reliability of the sources.`;
    
    // Call OpenAI API with streaming enabled
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // Use an appropriate model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: true,
        temperature: 0.2
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }
    
    const stream = activeStreams.get(streamId);
    if (!stream || stream.aborted) {
      console.log(`Stream ${streamId} was aborted before processing could begin`);
      return;
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from OpenAI response");
    }
    
    const decoder = new TextDecoder();
    let openaiResponse = '';
    let buffer = '';
    
    try {
      // Process the streaming response from OpenAI
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`OpenAI stream for ${streamId} completed normally`);
          break;
        }
        
        // Get the stream associated with this ID
        const stream = activeStreams.get(streamId);
        if (!stream || stream.aborted) {
          console.log(`Stream ${streamId} was aborted during processing`);
          await reader.cancel("Stream was aborted by client");
          break;
        }
        
        // Update last activity timestamp to prevent timeout
        stream.lastActivity = Date.now();
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process all complete lines in the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // Keep the last potentially incomplete line in the buffer
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const dataContent = line.substring(6);
            
            if (dataContent === '[DONE]') {
              console.log(`Received [DONE] marker for stream ${streamId}`);
              continue;
            }
            
            // Forward the line to our response stream
            stream.controller.enqueue(new TextEncoder().encode(`${line}\n`));
            
            // Extract content if possible for appending to response
            try {
              const jsonData = JSON.parse(dataContent);
              const content = jsonData.choices?.[0]?.delta?.content || '';
              if (content) {
                openaiResponse += content;
              }
            } catch (e) {
              // Ignore JSON parsing errors for incomplete chunks
            }
          }
        }
      }
      
      // Process any remaining buffer content
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            const dataContent = line.substring(6);
            
            if (dataContent === '[DONE]') {
              continue;
            }
            
            // Get the stream (again, to ensure it still exists)
            const stream = activeStreams.get(streamId);
            if (stream && !stream.aborted) {
              stream.controller.enqueue(new TextEncoder().encode(`${line}\n`));
              
              try {
                const jsonData = JSON.parse(dataContent);
                const content = jsonData.choices?.[0]?.delta?.content || '';
                if (content) {
                  openaiResponse += content;
                }
              } catch (e) {
                // Ignore JSON parsing errors
              }
            }
          }
        }
      }
      
      // Send completion marker
      const stream = activeStreams.get(streamId);
      if (stream && !stream.aborted) {
        stream.controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
        stream.controller.close();
        activeStreams.delete(streamId);
      }
      
      console.log(`Analysis for stream ${streamId} completed with ${openaiResponse.length} chars`);
      
      // Update job if jobId is provided
      if (jobId && iteration) {
        try {
          console.log(`Updating job ${jobId} iteration ${iteration} with analysis of length ${openaiResponse.length}`);
          
          // Check if the iteration already exists
          const { data: jobData, error: getJobError } = await supabase
            .from('research_jobs')
            .select('iterations')
            .eq('id', jobId)
            .single();
          
          if (getJobError) {
            console.error(`Error getting job ${jobId} data:`, getJobError);
          } else {
            // Update the iterations array
            let iterations = jobData.iterations || [];
            
            // Find the iteration with the matching iteration number
            const existingIndex = iterations.findIndex((iter: any) => iter.iteration === iteration);
            
            if (existingIndex >= 0) {
              // Update existing iteration with analysis
              iterations[existingIndex] = {
                ...iterations[existingIndex],
                analysis: openaiResponse,
                // Ensure these arrays exist
                queries: iterations[existingIndex].queries || [],
                results: iterations[existingIndex].results || []
              };
              
              // Update the job record
              const { error: updateError } = await supabase
                .from('research_jobs')
                .update({
                  iterations,
                  updated_at: new Date().toISOString()
                })
                .eq('id', jobId);
              
              if (updateError) {
                console.error(`Error updating job ${jobId} iterations with analysis:`, updateError);
              } else {
                console.log(`Successfully updated iteration ${iteration} with ${openaiResponse.length} analysis chars`);
              }
            } else {
              console.warn(`Could not find iteration ${iteration} in job ${jobId} to update with analysis`);
            }
          }
        } catch (error) {
          console.error(`Error saving analysis to job ${jobId}:`, error);
        }
      }
      
    } catch (error) {
      console.error(`Error processing OpenAI stream for ${streamId}:`, error);
      
      // Try to close the stream with an error message
      const stream = activeStreams.get(streamId);
      if (stream && !stream.aborted) {
        try {
          // Send error as a SSE event
          const errorEvent = `data: ${JSON.stringify({
            error: `Analysis error: ${error.message}`,
            choices: [{ delta: { content: `\n\nAnalysis error: ${error.message}` } }]
          })}\n\n`;
          stream.controller.enqueue(new TextEncoder().encode(errorEvent));
          
          // Send completion marker
          stream.controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          stream.controller.close();
        } catch (e) {
          console.error(`Error sending error message to stream ${streamId}:`, e);
        } finally {
          activeStreams.delete(streamId);
        }
      }
    }
  } catch (error) {
    console.error(`Error in processAnalysisStream for ${streamId}:`, error);
    
    // Clean up the stream
    const stream = activeStreams.get(streamId);
    if (stream && !stream.aborted) {
      try {
        stream.controller.close();
      } catch (e) {
        console.error(`Error closing stream ${streamId} after error:`, e);
      } finally {
        activeStreams.delete(streamId);
      }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestBody = await req.json();
    
    return await analyzeWebContent(requestBody);
  } catch (error) {
    console.error("Error in analyze-web-content function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
