
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface AnalysisRequest {
  webContent: string;
  analysis: string;
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { webContent, analysis } = await req.json() as AnalysisRequest;

    if (!webContent || !analysis) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: webContent and analysis' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Set up SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start the analysis process
    generateInsights(webContent, analysis, writer, encoder).catch(error => {
      console.error('Error generating insights:', error);
      writer.close();
    });

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function generateInsights(
  webContent: string, 
  analysis: string, 
  writer: WritableStreamDefaultWriter<Uint8Array>, 
  encoder: TextEncoder
) {
  try {
    const prompt = `You have researched information about a prediction market. Based on the research and analysis, extract:
1. The probability of the event occurring (as a percentage or decimal)
2. Key areas that need more research to make a better prediction

Research data: ${webContent.substring(0, 5000)}

Analysis so far: ${analysis}

Return your response as a valid JSON object with these fields:
{
  "probability": "your probability estimate as a string",
  "areasForResearch": ["area1", "area2", "area3"]
}

Ensure the JSON is properly formatted.`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://hunchex.com',
        'X-Title': 'Hunchex Research Insights'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are a research analyst for prediction markets. Provide clear, structured insights based on provided information.' },
          { role: 'user', content: prompt }
        ],
        stream: true,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body reader not available');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          await writer.write(encoder.encode(`${line}\n`));
        }
      }
    }

  } catch (error) {
    console.error('Error in generateInsights:', error);
    await writer.write(encoder.encode(`data: {"error": "${error.message}"}\n\n`));
  } finally {
    await writer.close();
  }
}
