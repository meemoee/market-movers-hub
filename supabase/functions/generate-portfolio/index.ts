
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { getMarketsWithLatestPrices, getRelatedMarketsWithPrices } from "../_shared/db-helpers.ts";

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY') || "pcsk_4QJRdf_UqguV15pX5pCanrdL6iMpd9i1aAAmZU24u9c9FCvt3Dc9SM1sSNuiQBKf3YWWxX";
const PINECONE_HOST = Deno.env.get('PINECONE_HOST') || "https://new-xeve5gd.svc.aped-4627-b74a.pinecone.io";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// For tracking steps and timing
const logStepStart = (stepName: string) => {
  console.log(`[${new Date().toISOString()}] Starting step: ${stepName}`);
  return { name: stepName, startTime: Date.now() };
};

const logStepEnd = (step: { name: string, startTime: number }) => {
  const elapsed = Date.now() - step.startTime;
  console.log(`[${new Date().toISOString()}] Completed step: ${step.name} (took ${elapsed}ms)`);
  return { name: step.name, elapsed };
};

// Timeout wrapper for fetch calls
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
};

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] Request received: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract auth token from Authorization header
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error(`[${new Date().toISOString()}] Missing or invalid authorization header`);
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    // Extract the token
    const authToken = authHeader.substring(7);
    
    if (!authToken) {
      console.error(`[${new Date().toISOString()}] Missing authentication token`);
      return new Response(
        JSON.stringify({ error: 'Missing authentication token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    // Create a results object to track progress and collect data
    const results = {
      status: "processing",
      steps: [],
      errors: [],
      warnings: [],
      data: {
        news: "",
        keywords: "",
        markets: [],
        tradeIdeas: []
      }
    };
    
    // Utility function to add a completed step
    const addCompletedStep = (name: string, details?: any) => {
      results.steps.push({
        name,
        completed: true,
        timestamp: new Date().toISOString(),
        details
      });
      console.log(`[${new Date().toISOString()}] Step completed: ${name}`);
    };
    
    // Utility function to add an error
    const addError = (step: string, message: string, details?: any) => {
      console.error(`[${new Date().toISOString()}] Error in ${step}: ${message}`, details);
      results.errors.push({
        step,
        message,
        timestamp: new Date().toISOString(),
        details
      });
    };

    // For POST requests - initial submission
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      
      // Parse the request body based on content-type
      let content;
      if (contentType.includes('application/json')) {
        const body = await req.json();
        content = body.content;
      } else {
        const formData = await req.formData();
        content = formData.get('content')?.toString();
      }

      if (!content) {
        console.error(`[${new Date().toISOString()}] No content provided in POST request`);
        return new Response(
          JSON.stringify({ error: 'No content provided' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`[${new Date().toISOString()}] Processing initial portfolio generation request for content: ${content.substring(0, 50)}...`);
      
      // Return success to indicate the job has started
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Portfolio generation initiated",
          content: content
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } 
    // For GET requests - generate portfolio
    else if (req.method === 'GET') {
      // Extract content from URL parameters
      const url = new URL(req.url);
      const content = url.searchParams.get('content');
      
      if (!content) {
        console.error(`[${new Date().toISOString()}] No content provided in GET request URL parameters`);
        return new Response(
          JSON.stringify({ error: 'No content provided in request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      console.log(`[${new Date().toISOString()}] Starting portfolio generation for content: ${content.substring(0, 50)}...`);
      
      // Validate the token
      try {
        let step = logStepStart("Auth validation");
        // Create Supabase client to validate the token and get user details
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false } }
        );
        
        // Verify token is valid
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken);
        
        if (error || !user) {
          throw new Error('Invalid authentication token');
        }
        
        logStepEnd(step);
        addCompletedStep("auth_validation", { userId: user.id });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Auth error:`, error);
        return new Response(
          JSON.stringify({ error: `Authentication error: ${error.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }
      
      // 1️⃣ Generate news summary
      let news = '';
      try {
        const step = logStepStart("News summary generation");
        results.steps.push({
          name: "news_summary",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        const newsResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
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
        }, 15000);

        const newsData = await newsResponse.json();
        news = newsData.choices?.[0]?.message?.content?.trim() || "";
        results.data.news = news;
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "news_summary" ? {...s, completed: true} : s
        );
        
        addCompletedStep("news_summary");
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error generating news summary:`, error);
        addError("news_summary", error.message || "Error generating news summary");
      }

      // 2️⃣ Extract keywords
      let keywords = '';
      try {
        const step = logStepStart("Keywords extraction");
        results.steps.push({
          name: "keywords_extraction",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        const keywordPrompt = `Prediction: ${content} Return ONLY the 15-30 most relevant/specific nouns, names, or phrases deeply tied to the sentiment or prediction (comma-separated, no extra words). They must be specifically related to what circumstances might logically occur if the user is CORRECT in their sentiment or opinion, HIGHLY PRIORITIZING latest up-to-date happenings and news.`;
        
        const keywordResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
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
        }, 15000);

        const keywordData = await keywordResponse.json();
        keywords = keywordData.choices?.[0]?.message?.content?.trim() || "";
        results.data.keywords = keywords;
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "keywords_extraction" ? {...s, completed: true} : s
        );
        
        addCompletedStep("keywords_extraction", { keywordCount: keywords.split(',').length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error extracting keywords:`, error);
        addError("keywords_extraction", error.message || "Error extracting keywords");
      }

      // 3️⃣ Get embedding
      let vecArr: number[] = [];
      try {
        const step = logStepStart("Embedding creation");
        results.steps.push({
          name: "embedding_creation",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        console.log(`[${new Date().toISOString()}] Getting embedding for keywords: ${keywords.substring(0, 50)}...`);
        
        if (!keywords || keywords.length === 0) {
          throw new Error("No keywords available for embedding generation");
        }
        
        const embedResponse = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
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
        }, 10000);

        if (!embedResponse.ok) {
          const errorText = await embedResponse.text();
          throw new Error(`OpenAI API error: ${embedResponse.status} - ${errorText}`);
        }

        const embedData = await embedResponse.json();
        vecArr = embedData.data?.[0]?.embedding || [];
        
        if (vecArr.length === 0) {
          throw new Error("Failed to generate embedding");
        }
        
        console.log(`[${new Date().toISOString()}] Successfully generated embedding with ${vecArr.length} dimensions`);
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "embedding_creation" ? {...s, completed: true, details: { dimensions: vecArr.length }} : s
        );
        
        addCompletedStep("embedding_creation", { dimensions: vecArr.length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error creating embedding:`, error);
        addError("embedding_creation", error.message || "Error creating embedding");
      }

      // 4️⃣ Query Pinecone
      let matches: any[] = [];
      try {
        const step = logStepStart("Pinecone search");
        results.steps.push({
          name: "pinecone_search",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        if (vecArr.length === 0) {
          throw new Error("No embedding vector available for search");
        }
        
        const pineconeResponse = await fetchWithTimeout(`${PINECONE_HOST}/query`, {
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
        }, 20000);

        if (!pineconeResponse.ok) {
          const errorText = await pineconeResponse.text();
          throw new Error(`Pinecone query failed ${pineconeResponse.status}: ${errorText}`);
        }

        const pineconeData = await pineconeResponse.json();
        matches = pineconeData.matches || [];
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "pinecone_search" ? {...s, completed: true, details: { matchCount: matches.length }} : s
        );
        
        addCompletedStep("pinecone_search", { matchCount: matches.length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error querying Pinecone:`, error);
        addError("pinecone_search", error.message || "Error querying Pinecone");
      }

      // 5️⃣ Get data from Supabase
      let details: any[] = [];
      try {
        const step = logStepStart("Market details fetching");
        results.steps.push({
          name: "market_details",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        // Create Supabase client
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          { auth: { persistSession: false } }
        );

        const marketIds = matches.map(m => m.id);
        
        if (marketIds.length === 0) {
          console.log(`[${new Date().toISOString()}] No market IDs to fetch details for`);
          results.warnings.push({
            step: "market_details",
            message: "No market IDs available from vector search",
            timestamp: new Date().toISOString()
          });
        } else {
          console.log(`[${new Date().toISOString()}] Fetching details for ${marketIds.length} markets using helper function`);
          
          // Use the imported getMarketsWithLatestPrices function instead of the RPC call
          details = await getMarketsWithLatestPrices(supabaseAdmin, marketIds);
          
          if (details.length === 0) {
            results.warnings.push({
              step: "market_details",
              message: "No matching markets found with price data",
              timestamp: new Date().toISOString()
            });
          }
        }
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "market_details" ? {...s, completed: true, details: { count: details.length }} : s
        );
        
        addCompletedStep("market_details", { count: details.length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching market details:`, error);
        addError("market_details", error.message || "Error fetching market details");
        
        // Fallback to direct query
        try {
          const step = logStepStart("Market details fallback query");
          
          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
          );
          
          const marketIds = matches.map(m => m.id);
          
          if (marketIds.length > 0) {
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
            
            // Transform the data - using id instead of market_id in the mapping
            details = data.map(d => ({
              market_id: d.market_id,  // This already has the correct alias from the query
              event_id: d.event_id,
              event_title: d.events.title,
              question: d.question,
              description: d.description,
              yes_price: 0.5,
              no_price: 0.5
            }));
            
            addCompletedStep("market_details_fallback", { count: details.length });
            console.log(`[${new Date().toISOString()}] Fetched basic details for ${details.length} markets (fallback)`);
          }
          
          logStepEnd(step);
        } catch (fallbackError) {
          console.error(`[${new Date().toISOString()}] Fallback query also failed:`, fallbackError);
          addError("market_details_fallback", fallbackError.message || "Fallback market details query failed");
        }
      }

      // 6️⃣ Pick best per event
      let bests: any[] = [];
      try {
        const step = logStepStart("Best markets selection");
        results.steps.push({
          name: "best_markets",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        const seen = new Set();
        bests = [];
        for (const m of matches) {
          const d = details.find(d => d.market_id === m.id);
          if (d && !seen.has(d.event_id)) {
            seen.add(d.event_id);
            bests.push(d);
            if (bests.length >= 25) break;
          }
        }
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "best_markets" ? {...s, completed: true, details: { count: bests.length }} : s
        );
        
        addCompletedStep("best_markets", { count: bests.length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error selecting best markets:`, error);
        addError("best_markets", error.message || "Error selecting best markets");
      }

      // 7️⃣ Fetch related markets
      try {
        const step = logStepStart("Related markets fetching");
        results.steps.push({
          name: "related_markets",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        let relatedByEvent: Record<string, any[]> = {};
        const eventIds = bests.map(b => b.event_id);
        
        if (eventIds.length > 0) {
          // Create Supabase client
          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
          );
          
          // Use the imported getRelatedMarketsWithPrices function
          const rels = await getRelatedMarketsWithPrices(supabaseAdmin, eventIds);
          
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
        }

        // Add related markets to each best market
        bests.forEach(b => b.related_markets = relatedByEvent[b.event_id] || []);
        results.data.markets = bests;
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "related_markets" ? {...s, completed: true} : s
        );
        
        addCompletedStep("related_markets");
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching related markets:`, error);
        addError("related_markets", error.message || "Error fetching related markets");
      }

      // 8️⃣ Generate trade ideas
      let tradeIdeas = [];
      try {
        const step = logStepStart("Trade ideas generation");
        results.steps.push({
          name: "trade_ideas",
          completed: false,
          timestamp: new Date().toISOString()
        });
        
        if (bests.length > 0) {
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

          const ideasResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
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
          }, 15000);

          const ideasData = await ideasResponse.json();
          const rawIdeas = ideasData.choices?.[0]?.message?.content?.trim() || "[]";
          
          try {
            tradeIdeas = JSON.parse(rawIdeas);
            results.data.tradeIdeas = tradeIdeas;
          } catch (jsonError) {
            console.error(`[${new Date().toISOString()}] Error parsing trade ideas JSON:`, jsonError, rawIdeas);
            addError("trade_ideas_json_parse", jsonError.message || "Error parsing trade ideas JSON", { raw: rawIdeas });
          }
        } else {
          results.warnings.push({
            step: "trade_ideas",
            message: "No markets available to generate trade ideas",
            timestamp: new Date().toISOString()
          });
        }
        
        logStepEnd(step);
        
        // Update step status to completed
        results.steps = results.steps.map(s => 
          s.name === "trade_ideas" ? {...s, completed: true, details: { count: tradeIdeas.length }} : s
        );
        
        addCompletedStep("trade_ideas", { count: tradeIdeas.length });
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error generating trade ideas:`, error);
        addError("trade_ideas", error.message || "Error generating trade ideas");
      }

      // Mark as complete
      results.status = "completed";
      console.log(`[${new Date().toISOString()}] Portfolio generation complete`);
      
      // Return the full results
      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Unsupported method: ${req.method}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
      );
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in generate-portfolio function:`, error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        status: "error",
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
