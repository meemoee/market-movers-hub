
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY') || "pcsk_4QJRdf_UqguV15pX5pCanrdL6iMpd9i1aAAmZU24u9c9FCvt3Dc9SM1sSNuiQBKf3YWWxX";
const PINECONE_HOST = Deno.env.get('PINECONE_HOST') || "https://new-xeve5gd.svc.aped-4627-b74a.pinecone.io";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create encoder upfront to avoid scope issues
const encoder = new TextEncoder();

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the prediction from the request
    const { content, authToken } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No content provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Generating portfolio for content:', content);

    // Set up SSE headers for streaming
    const headers = {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    // Create a new stream with a controller
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Helper function to send SSE events
    const sendSSE = async (event: string, data: string) => {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
    };

    // Send initial status
    await sendSSE('status', 'Summarizing input...');

    // 1️⃣ Generate news summary
    let news = '';
    try {
      const newsResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hunchex.app",
          "X-Title": "Market Analysis App"
        },
        body: JSON.stringify({
          model: "perplexity/llama-3.1-sonar-small-128k-online",
          messages: [
            { role: "system", content: "You give short news summaries." },
            { role: "user", content: `Comment: ${content}\nToday's date: ${new Date().toISOString().slice(0,10)}\nProvide a concise update.` }
          ]
        })
      });

      const newsData = await newsResponse.json();
      news = newsData.choices?.[0]?.message?.content?.trim() || "";
      await sendSSE('news', news);
    } catch (error) {
      console.error('Error generating news summary:', error);
      await sendSSE('error', `Error generating news summary: ${error.message}`);
    }

    // 2️⃣ Extract keywords
    await sendSSE('status', 'Extracting keywords...');
    let keywords = '';
    try {
      const keywordPrompt = `Prediction: ${content} Return ONLY the 15-30 most relevant/specific nouns, names, or phrases deeply tied to the sentiment or prediction (comma-separated, no extra words). They must be specifically related to what circumstances might logically occur if the user is CORRECT in their sentiment or opinion, HIGHLY PRIORITIZING latest up-to-date happenings and news.`;
      
      const keywordResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hunchex.app",
          "X-Title": "Market Analysis App"
        },
        body: JSON.stringify({
          model: "perplexity/llama-3.1-sonar-small-128k-online",
          messages: [
            { role: "system", content: "You are a keyword extractor." },
            { role: "user", content: keywordPrompt }
          ]
        })
      });

      const keywordData = await keywordResponse.json();
      keywords = keywordData.choices?.[0]?.message?.content?.trim() || "";
      await sendSSE('keywords', keywords);
    } catch (error) {
      console.error('Error extracting keywords:', error);
      await sendSSE('error', `Error extracting keywords: ${error.message}`);
    }

    // 3️⃣ Get embedding
    await sendSSE('status', 'Creating embedding...');
    let vecArr: number[] = [];
    try {
      const embedResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: keywords,
          encoding_format: "float"
        })
      });

      const embedData = await embedResponse.json();
      vecArr = embedData.data?.[0]?.embedding || [];
      
      if (vecArr.length === 0) {
        throw new Error("Failed to generate embedding");
      }
      
      await sendSSE('status', `Embedding generated with ${vecArr.length} dimensions`);
    } catch (error) {
      console.error('Error creating embedding:', error);
      await sendSSE('error', `Error creating embedding: ${error.message}`);
    }

    // 4️⃣ Query Pinecone
    await sendSSE('status', 'Searching for relevant markets...');
    let matches: any[] = [];
    try {
      const pineconeResponse = await fetch(`${PINECONE_HOST}/query`, {
        method: "POST",
        headers: {
          "Api-Key": PINECONE_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          vector: vecArr,
          topK: 100,
          includeMetadata: false,
          filter: {
            active: { "$eq": true },
            closed: { "$eq": false },
            archived: { "$eq": false }
          }
        })
      });

      if (!pineconeResponse.ok) {
        const errorText = await pineconeResponse.text();
        throw new Error(`Pinecone query failed ${pineconeResponse.status}: ${errorText}`);
      }

      const pineconeData = await pineconeResponse.json();
      matches = pineconeData.matches || [];
      await sendSSE('status', `Found ${matches.length} relevant markets`);
    } catch (error) {
      console.error('Error querying Pinecone:', error);
      await sendSSE('error', `Error querying Pinecone: ${error.message}`);
    }

    // 5️⃣ Get data from Supabase
    await sendSSE('status', 'Fetching market details...');
    
    // Create Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const marketIds = matches.map(m => m.id);
    let details: any[] = [];
    
    try {
      // Query for market details
      const { data, error } = await supabaseAdmin
        .rpc('get_markets_with_latest_prices', { 
          p_market_ids: marketIds 
        });
        
      if (error) throw error;
      
      details = data || [];
      
      if (details.length === 0) {
        await sendSSE('warning', 'No matching markets found with price data');
      } else {
        await sendSSE('status', `Fetched details for ${details.length} markets`);
      }
    } catch (error) {
      console.error('Error fetching market details:', error);
      await sendSSE('error', `Error fetching market details: ${error.message}`);
      
      // Fallback to direct query
      try {
        const { data, error } = await supabaseAdmin
          .from('markets')
          .select(`
            id as market_id,
            event_id,
            question,
            description,
            events!inner(title)
          `)
          .in('id', marketIds)
          .eq('active', true)
          .eq('closed', false)
          .eq('archived', false);
          
        if (error) throw error;
        
        // Transform the data
        details = data.map(d => ({
          market_id: d.market_id,
          event_id: d.event_id,
          event_title: d.events.title,
          question: d.question,
          description: d.description,
          yes_price: 0.5,
          no_price: 0.5
        }));
        
        await sendSSE('status', `Fetched basic details for ${details.length} markets (prices unavailable)`);
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }
    }

    // 6️⃣ Pick best per event
    const seen = new Set();
    const bests = [];
    for (const m of matches) {
      const d = details.find(d => d.market_id === m.id);
      if (d && !seen.has(d.event_id)) {
        seen.add(d.event_id);
        bests.push(d);
        if (bests.length >= 25) break;
      }
    }

    await sendSSE('status', `Selected ${bests.length} best markets`);

    // 7️⃣ Fetch related markets
    let relatedByEvent: Record<string, any[]> = {};
    try {
      const eventIds = bests.map(b => b.event_id);
      const { data: rels, error } = await supabaseAdmin
        .rpc('get_related_markets_with_prices', { 
          p_event_ids: eventIds 
        });
        
      if (error) throw error;
      
      // Group by event_id
      relatedByEvent = {};
      for (const r of rels) {
        (relatedByEvent[r.event_id] ||= []).push({
          id: r.market_id,
          question: r.question,
          yes_price: r.yes_price,
          no_price: r.no_price,
          best_bid: r.best_bid,
          best_ask: r.best_ask,
          last_traded_price: r.last_traded_price,
          volume: r.volume,
          liquidity: r.liquidity
        });
      }
    } catch (error) {
      console.error('Error fetching related markets:', error);
      await sendSSE('error', `Error fetching related markets: ${error.message}`);
    }

    // Add related markets to each best market
    bests.forEach(b => b.related_markets = relatedByEvent[b.event_id] || []);
    
    // Send best markets to client
    await sendSSE('markets', JSON.stringify(bests));

    // 8️⃣ Generate trade ideas
    await sendSSE('status', 'Generating trade ideas...');
    let tradeIdeas = [];
    try {
      const listText = bests
        .map((r, i) => `${i+1}. ${r.question} — yes:${r.yes_price}, no:${r.no_price}`)
        .join("\n");
        
      const ideasPrompt = `
User prediction: ${content}

Here are the top markets that matched:
${listText}

Based on these, suggest the 3 best trade ideas that would make the user money if their prediction or sentiment ends up being CORRECT.

Return ONLY a valid JSON array of exactly three such objects. No extra text.

Suggest 3 trades as a JSON array of objects with:
  market_title, outcome, current_price, target_price, stop_price, rationale.`;

      const ideasResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://hunchex.app",
          "X-Title": "Market Analysis App"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-preview-05-20",
          messages: [
            { role: "system", content: "You are a trading strategy assistant. Output ONLY valid JSON." },
            { role: "user", content: ideasPrompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      const ideasData = await ideasResponse.json();
      const rawIdeas = ideasData.choices?.[0]?.message?.content?.trim() || "[]";
      
      try {
        tradeIdeas = JSON.parse(rawIdeas);
        await sendSSE('trade_ideas', JSON.stringify(tradeIdeas));
      } catch (jsonError) {
        console.error('Error parsing trade ideas JSON:', jsonError, rawIdeas);
        await sendSSE('error', `Error parsing trade ideas: ${jsonError.message}`);
        await sendSSE('raw_ideas', rawIdeas);
      }
    } catch (error) {
      console.error('Error generating trade ideas:', error);
      await sendSSE('error', `Error generating trade ideas: ${error.message}`);
    }

    // Send completion
    await sendSSE('done', 'Portfolio generation complete');
    writer.close();
    
    return new Response(stream.readable, { headers });
  } catch (error) {
    console.error('Error in generate-portfolio function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
