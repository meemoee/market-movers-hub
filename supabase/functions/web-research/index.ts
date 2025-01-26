import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/search"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateSearchQueries(intent: string, openrouterApiKey: string): Promise<string[]> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      "Authorization": `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": 'http://localhost:5173',
      "X-Title": 'Market Analysis App',
    },
    body: JSON.stringify({
      "model": "google/gemini-flash-1.5",
      "messages": [
        {"role": "system", "content": "You are a helpful assistant that generates search queries."},
        {"role": "user", "content": `Generate 3 diverse search queries to gather comprehensive information about: ${intent}\n\nRespond with a JSON object containing a 'queries' key with an array of search query strings.`}
      ],
      "response_format": {"type": "json_object"}
    })
  });

  if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
  const result = await response.json();
  const content = result.choices[0].message.content.trim();
  const queriesData = JSON.parse(content);
  return queriesData.queries || [];
}

async function performWebSearch(query: string, bingApiKey: string): Promise<any[]> {
  const response = await fetch(`${BING_SEARCH_URL}?q=${encodeURIComponent(query)}&count=50&responseFilter=Webpages`, {
    headers: {
      'Ocp-Apim-Subscription-Key': bingApiKey
    }
  });

  if (!response.ok) throw new Error(`Bing Search API error: ${response.status}`);
  const data = await response.json();
  return data.webPages?.value || [];
}

async function fetchContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/html')) return null;
    
    const text = await response.text();
    const cleanedText = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleanedText.slice(0, 5000);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
  const bingApiKey = Deno.env.get('BING_API_KEY');
  
  if (!openrouterApiKey || !bingApiKey) {
    return new Response(
      JSON.stringify({ error: 'API keys not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  try {
    const { description } = await req.json();
    if (!description) throw new Error('Description is required');

    // Set up timeout and state tracking
    const timeout = setTimeout(() => {
      writer.abort(new Error('Operation timed out'));
    }, 300000); // 5 minute timeout

    let processedCount = 0;
    let validContentCount = 0;
    const validContents: string[] = [];

    // Initialize SSE response
    const response = new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

    // Generate search queries
    const queries = await generateSearchQueries(description, openrouterApiKey);
    if (!queries.length) throw new Error('Failed to generate search queries');

    // Perform searches
    const searchPromises = queries.map(query => performWebSearch(query, bingApiKey));
    const searchResults = await Promise.all(searchPromises);
    const allResults = searchResults.flat();

    // Send initial count
    await writer.write(encoder.encode(
      `data: ${JSON.stringify({ type: 'websites', count: processedCount })}\n\n`
    ));

    // Process content in batches
    const batchSize = 5;
    for (let i = 0; i < allResults.length; i += batchSize) {
      const batch = allResults.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(result => fetchContent(result.url));
      const contents = await Promise.all(batchPromises);
      
      // Count valid contents
      contents.forEach(content => {
        if (content) {
          validContents.push(content);
          validContentCount++;
          processedCount++;
          // Send count update
          writer.write(encoder.encode(
            `data: ${JSON.stringify({ type: 'websites', count: processedCount })}\n\n`
          ));
        }
      });

      // Add delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process final analysis
    if (validContents.length > 0) {
      const analysisResponse = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": 'http://localhost:5173',
          "X-Title": 'Market Analysis App',
        },
        body: JSON.stringify({
          "model": "google/gemini-flash-1.5",
          "messages": [
            {"role": "system", "content": "You are a helpful assistant that synthesizes information from multiple sources."},
            {"role": "user", "content": `Analyze the following search results about ${description}:\n\n${validContents.join('\n\n')}`}
          ],
          "stream": true
        })
      });

      if (!analysisResponse.ok) throw new Error('Analysis request failed');

      const reader = analysisResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                await writer.write(encoder.encode(
                  `data: ${JSON.stringify({ type: 'analysis', content })}\n\n`
                ));
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
    }

    clearTimeout(timeout);
    await writer.close();
    return response;

  } catch (error) {
    console.error('Error in web-research function:', error);
    try {
      await writer.write(encoder.encode(
        `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`
      ));
      await writer.close();
    } catch (writeError) {
      console.error('Error writing error message:', writeError);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
