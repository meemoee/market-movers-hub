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

// Create encoder upfront to avoid scope issues
const encoder = new TextEncoder()

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
    // For GET requests - generate portfolio with SSE
    else if (req.method === 'GET') {
      // Extract content and auth token from URL parameters
      const url = new URL(req.url);
      const content = url.searchParams.get('content');
      const authToken = url.searchParams.get('authToken');
      
      if (!content) {
        console.error(`[${new Date().toISOString()}] No content provided in GET request URL parameters`);
        return new Response(
          JSON.stringify({ error: 'No content provided in request' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      
      console.log(`[${new Date().toISOString()}] Starting SSE portfolio generation for content: ${content.substring(0, 50)}...`);
      
      // Set up SSE headers for proper streaming
      const headers = {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
      
      // Create a new ReadableStream with a controller for proper SSE streaming
      const stream = new TransformStream()
      const writer = stream.writable.getWriter()
      
      // Helper function to send properly formatted SSE events
      const sendSSE = async (event: string, data: string) => {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
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
      
      // Utility function to add a completed step and send update
      const addCompletedStep = async (name: string, details?: any) => {
        results.steps.push({
          name,
          completed: true,
          timestamp: new Date().toISOString(),
          details
        });
        console.log(`[${new Date().toISOString()}] Step completed: ${name}`);
        await sendSSE('message', JSON.stringify(results));
      };
      
      // Utility function to add an error
      const addError = async (step: string, message: string, details?: any) => {
        console.error(`[${new Date().toISOString()}] Error in ${step}: ${message}`, details);
        results.errors.push({
          step,
          message,
          timestamp: new Date().toISOString(),
          details
        });
        await sendSSE('message', JSON.stringify(results));
      };

      // Start the portfolio generation process
      (async () => {
        try {
          // Validate the token if provided
          if (authToken) {
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
              await addCompletedStep("auth_validation", { userId: user.id });
            } catch (error) {
              console.error(`[${new Date().toISOString()}] Auth error:`, error);
              await addError("auth_validation", error.message);
              await sendSSE('error', `Authentication error: ${error.message}`);
              writer.close();
              return;
            }
          }
          
          // 1️⃣ Generate news summary
          let news = '';
          try {
            const step = logStepStart("News summary generation");
            console.log(`[DEBUG] Starting news summary with content: ${content}`);
            console.log(`[DEBUG] OpenRouter API Key available: ${!!OPENROUTER_API_KEY}`);
            
            results.steps.push({
              name: "news_summary",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            console.log(`[DEBUG] Making request to OpenRouter API...`);
            const newsResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://hunchex.app",
                "X-Title": "Market Analysis App"
              },
              body: JSON.stringify({
                model: "perplexity/sonar",
                messages: [
                  { role: "system", content: "You give short news summaries." },
                  { role: "user", content: `Comment: ${content}\nToday's date: ${new Date().toISOString().slice(0,10)}\nProvide a concise update.` }
                ]
              })
            }, 15000);

            console.log(`[DEBUG] News response status: ${newsResponse.status}`);
            if (!newsResponse.ok) {
              throw new Error(`News API failed with status ${newsResponse.status}`);
            }
            
            const newsData = await newsResponse.json();
            console.log(`[DEBUG] News response received, data:`, JSON.stringify(newsData, null, 2));
            news = newsData.choices?.[0]?.message?.content?.trim() || "";
            results.data.news = news;
            console.log(`[DEBUG] Extracted news summary: ${news.substring(0, 100)}...`);
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "news_summary" ? {...s, completed: true} : s
            );
            
            await addCompletedStep("news_summary");
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error generating news summary:`, error);
            console.error(`[DEBUG] Full error details:`, error);
            await addError("news_summary", error.message || "Error generating news summary");
          }

          // 2️⃣ Extract keywords
          let keywords = '';
          try {
            const step = logStepStart("Keywords extraction");
            console.log(`[DEBUG] Starting keyword extraction for content: ${content}`);
            
            results.steps.push({
              name: "keywords_extraction",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            const keywordPrompt = `Prediction: ${content} Return ONLY the 15-30 most relevant/specific nouns, names, or phrases deeply tied to the sentiment or prediction (comma-separated, no extra words). They must be specifically related to what circumstances might logically occur if the user is CORRECT in their sentiment or opinion, HIGHLY PRIORITIZING latest up-to-date happenings and news.`;
            console.log(`[DEBUG] Keyword prompt: ${keywordPrompt}`);
            
            const keywordResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://hunchex.app",
                "X-Title": "Market Analysis App"
              },
              body: JSON.stringify({
                model: "perplexity/sonar",
                messages: [
                  { role: "system", content: "You are a keyword extractor." },
                  { role: "user", content: keywordPrompt }
                ]
              })
            }, 15000);

            console.log(`[DEBUG] Keyword response status: ${keywordResponse.status}`);
            if (!keywordResponse.ok) {
              throw new Error(`Keyword API failed with status ${keywordResponse.status}`);
            }
            
            const keywordData = await keywordResponse.json();
            console.log(`[DEBUG] Keyword response:`, JSON.stringify(keywordData, null, 2));
            keywords = keywordData.choices?.[0]?.message?.content?.trim() || "";
            results.data.keywords = keywords;
            console.log(`[DEBUG] Extracted keywords: ${keywords}`);
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "keywords_extraction" ? {...s, completed: true} : s
            );
            
            await addCompletedStep("keywords_extraction", { keywordCount: keywords.split(',').length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error extracting keywords:`, error);
            console.error(`[DEBUG] Full keyword error:`, error);
            await addError("keywords_extraction", error.message || "Error extracting keywords");
          }

          // 3️⃣ Get embedding
          let vecArr: number[] = [];
          try {
            const step = logStepStart("Embedding creation");
            console.log(`[DEBUG] Starting embedding creation`);
            console.log(`[DEBUG] OpenAI API Key available: ${!!OPENAI_API_KEY}`);
            console.log(`[DEBUG] Keywords length: ${keywords?.length || 0}`);
            
            results.steps.push({
              name: "embedding_creation",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            console.log(`[${new Date().toISOString()}] Getting embedding for keywords: ${keywords.substring(0, 50)}...`);
            
            if (!keywords || keywords.length === 0) {
              console.log(`[DEBUG] No keywords available, keywords: "${keywords}"`);
              throw new Error("No keywords available for embedding generation");
            }
            
            console.log(`[DEBUG] Making embedding request to OpenAI...`);
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

            console.log(`[DEBUG] Embedding response status: ${embedResponse.status}`);
            if (!embedResponse.ok) {
              const errorText = await embedResponse.text();
              console.log(`[DEBUG] Embedding error response: ${errorText}`);
              throw new Error(`OpenAI API error: ${embedResponse.status} - ${errorText}`);
            }

            const embedData = await embedResponse.json();
            console.log(`[DEBUG] Embedding response data keys: ${Object.keys(embedData)}`);
            vecArr = embedData.data?.[0]?.embedding || [];
            
            if (vecArr.length === 0) {
              console.log(`[DEBUG] Empty embedding vector received`);
              throw new Error("Failed to generate embedding");
            }
            
            console.log(`[${new Date().toISOString()}] Successfully generated embedding with ${vecArr.length} dimensions`);
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "embedding_creation" ? {...s, completed: true, details: { dimensions: vecArr.length }} : s
            );
            
            await addCompletedStep("embedding_creation", { dimensions: vecArr.length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error creating embedding:`, error);
            console.error(`[DEBUG] Full embedding error:`, error);
            await addError("embedding_creation", error.message || "Error creating embedding");
          }

          // 4️⃣ Query Pinecone
          let matches: any[] = [];
          try {
            const step = logStepStart("Pinecone search");
            console.log(`[DEBUG] Starting Pinecone search`);
            console.log(`[DEBUG] Pinecone API Key available: ${!!PINECONE_API_KEY}`);
            console.log(`[DEBUG] Pinecone Host: ${PINECONE_HOST}`);
            console.log(`[DEBUG] Vector array length: ${vecArr.length}`);
            
            results.steps.push({
              name: "pinecone_search",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            if (vecArr.length === 0) {
              console.log(`[DEBUG] No embedding vector available for search`);
              throw new Error("No embedding vector available for search");
            }
            
            console.log(`[DEBUG] Making Pinecone query request...`);
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

            console.log(`[DEBUG] Pinecone response status: ${pineconeResponse.status}`);
            if (!pineconeResponse.ok) {
              const errorText = await pineconeResponse.text();
              console.log(`[DEBUG] Pinecone error response: ${errorText}`);
              throw new Error(`Pinecone query failed ${pineconeResponse.status}: ${errorText}`);
            }

            const pineconeData = await pineconeResponse.json();
            console.log(`[DEBUG] Pinecone response data:`, JSON.stringify(pineconeData, null, 2));
            matches = pineconeData.matches || [];
            console.log(`[DEBUG] Found ${matches.length} matches from Pinecone`);
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "pinecone_search" ? {...s, completed: true, details: { matchCount: matches.length }} : s
            );
            
            await addCompletedStep("pinecone_search", { matchCount: matches.length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error querying Pinecone:`, error);
            console.error(`[DEBUG] Full Pinecone error:`, error);
            await addError("pinecone_search", error.message || "Error querying Pinecone");
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
            await sendSSE('message', JSON.stringify(results));
            
            // Create Supabase client
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
            const supabaseAdmin = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
              { auth: { persistSession: false } }
            );

            const marketIds = matches.map(m => m.id);
            console.log(`[DEBUG] Extracted ${marketIds.length} market IDs from matches`);
            console.log(`[DEBUG] Market IDs: ${marketIds.slice(0, 5).join(', ')}${marketIds.length > 5 ? '...' : ''}`);
            
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
              console.log(`[DEBUG] Calling getMarketsWithLatestPrices...`);
              details = await getMarketsWithLatestPrices(supabaseAdmin, marketIds);
              console.log(`[DEBUG] Retrieved ${details.length} market details`);
              
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
            
            await addCompletedStep("market_details", { count: details.length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching market details:`, error);
            await addError("market_details", error.message || "Error fetching market details");
            
            // Fallback to direct query using the same helper function
            try {
              const step = logStepStart("Market details fallback query");
              console.log(`[${new Date().toISOString()}] Main market details query failed, trying fallback with real prices`);
              
              const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
              const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
                { auth: { persistSession: false } }
              );
              
              const marketIds = matches.map(m => m.id);
              
              if (marketIds.length > 0) {
                console.log(`[DEBUG] Fallback query - fetching ${marketIds.length} markets with REAL prices`);
                
                // Use the same helper function to get real price data in fallback
                details = await getMarketsWithLatestPrices(supabaseAdmin, marketIds.slice(0, 30));
                console.log(`[DEBUG] Fallback query successful - retrieved ${details.length} markets with real prices`);
                
                await addCompletedStep("market_details_fallback", { count: details.length });
                console.log(`[${new Date().toISOString()}] Fetched basic details for ${details.length} markets (fallback)`);
              }
              
              logStepEnd(step);
            } catch (fallbackError) {
              console.error(`[${new Date().toISOString()}] Fallback query also failed:`, fallbackError);
              await addError("market_details_fallback", fallbackError.message || "Fallback market details query failed");
            }
          }

          // 6️⃣ Pick markets without duplicating events
          let bests: any[] = [];
          try {
            const step = logStepStart("Best markets selection");
            results.steps.push({
              name: "best_markets",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            // Track event IDs we've already included to avoid duplicates
            const includedEventIds = new Set<string>();
            bests = [];
            let count = 0;
            
            // Process matches in order of relevance
            for (const m of matches) {
              const marketDetail = details.find(d => d.market_id === m.id);
              if (marketDetail) {
                // Only include the market if we haven't seen this event ID yet
                if (!includedEventIds.has(marketDetail.event_id)) {
                  includedEventIds.add(marketDetail.event_id);
                  bests.push(marketDetail);
                  count++;
                  
                  // Limit to 25 markets total
                  if (count >= 25) break;
                }
              }
            }
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "best_markets" ? {...s, completed: true, details: { count: bests.length }} : s
            );
            
            await addCompletedStep("best_markets", { count: bests.length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error selecting best markets:`, error);
            await addError("best_markets", error.message || "Error selecting best markets");
          }

          // 7️⃣ Fetch related markets
          try {
            const step = logStepStart("Related markets fetching");
            results.steps.push({
              name: "related_markets",
              completed: false,
              timestamp: new Date().toISOString()
            });
            await sendSSE('message', JSON.stringify(results));
            
            let relatedByEvent: Record<string, any[]> = {};
            const eventIds = bests.map(b => b.event_id);
            
            console.log(`[${new Date().toISOString()}] ===== RELATED MARKETS DEBUG =====`);
            console.log(`[${new Date().toISOString()}] We have ${bests.length} best markets selected`);
            console.log(`[${new Date().toISOString()}] Event IDs for related markets: ${JSON.stringify(eventIds)}`);
            
            if (eventIds.length > 0) {
              // Create Supabase client
              const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
              const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
                { auth: { persistSession: false } }
              );
              
              console.log(`[${new Date().toISOString()}] Calling getRelatedMarketsWithPrices with ${eventIds.length} event IDs`);
              
              // Use the imported getRelatedMarketsWithPrices function
              const rels = await getRelatedMarketsWithPrices(supabaseAdmin, eventIds);
              
              console.log(`[${new Date().toISOString()}] getRelatedMarketsWithPrices returned ${rels.length} related markets`);
              if (rels.length > 0) {
                console.log(`[${new Date().toISOString()}] Sample related market:`, JSON.stringify(rels[0], null, 2));
              } else {
                console.log(`[${new Date().toISOString()}] No related markets found! This is the issue.`);
              }
              
              // Group by event_id
              relatedByEvent = {};
              for (const r of rels) {
                if (!relatedByEvent[r.event_id]) {
                  relatedByEvent[r.event_id] = [];
                }
                relatedByEvent[r.event_id].push({
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
            console.log(`[${new Date().toISOString()}] Adding related markets to ${bests.length} best markets`);
            bests.forEach(b => {
              const relatedForEvent = relatedByEvent[b.event_id] || [];
              b.related_markets = relatedForEvent;
              console.log(`[${new Date().toISOString()}] Market ${b.market_id} (event ${b.event_id}) has ${relatedForEvent.length} related markets`);
            });
            results.data.markets = bests;
            
            console.log(`[${new Date().toISOString()}] Final related markets summary:`);
            const totalRelated = bests.reduce((sum, m) => sum + (m.related_markets?.length || 0), 0);
            console.log(`[${new Date().toISOString()}] Total related markets across all best markets: ${totalRelated}`);
            
            logStepEnd(step);
            
            // Update step status to completed
            results.steps = results.steps.map(s => 
              s.name === "related_markets" ? {...s, completed: true} : s
            );
            
            await addCompletedStep("related_markets");
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error fetching related markets:`, error);
            await addError("related_markets", error.message || "Error fetching related markets");
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
            await sendSSE('message', JSON.stringify(results));
            
            if (bests.length > 0) {
              // Create a mapping of market details for easy lookup in the OpenRouter response
              const marketDetailsMap = bests.reduce((acc, market) => {
                acc[market.market_id] = {
                  image: market.image || null
                };
                return acc;
              }, {});
              
              const listText = bests
                .map((r, i) => `${i+1}. ID: ${r.market_id} | ${r.question} — yes:${r.yes_price}, no:${r.no_price}`)
                .join("\n");
                
               const ideasPrompt = `
User prediction: ${content}

Here are the top markets that matched:
${listText}

Based on these, suggest the 3 best trade ideas that would make the user money if their prediction or sentiment ends up being CORRECT.

Return a JSON object with a "trades" array containing exactly three trade objects. Don't pick an outcome with very small (<10%) or very high (90%+) odds unless you have good reason. NEVER suggest an outcome with price of 0 or 1 since those were already resolved.

Format:
{
  "trades": [
    {
      "market_id": "must be one of the specific IDs provided above, CRITICAL",
      "market_title": "brief market title", 
      "outcome": "YES or NO", 
      "current_price": 0.45, 
      "target_price": 0.65, 
      "stop_price": 0.35, 
      "rationale": "why this trade makes sense"
    }
  ]
}`;

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
                    { role: "system", content: "You are a trading strategy assistant. Output ONLY valid JSON objects." },
                    { role: "user", content: ideasPrompt }
                  ],
                  response_format: { type: "json_object" }
                })
              }, 15000);

              const ideasData = await ideasResponse.json();
              const rawIdeas = ideasData.choices?.[0]?.message?.content?.trim() || '{"trades":[]}';
              
              console.log(`[${new Date().toISOString()}] Raw trade ideas response:`, rawIdeas);
              
              try {
                const parsedResponse = JSON.parse(rawIdeas);
                const parsedIdeas = parsedResponse.trades || [];
                
                console.log(`[${new Date().toISOString()}] Parsed ${parsedIdeas.length} trade ideas from response`);
                
                // Add image URL from our market details to each trade idea
                tradeIdeas = parsedIdeas.map(idea => {
                  const marketDetails = marketDetailsMap[idea.market_id] || {};
                  return {
                    ...idea,
                    image: marketDetails.image || null
                  };
                });
                
                results.data.tradeIdeas = tradeIdeas;
                
                console.log(`[${new Date().toISOString()}] Generated ${tradeIdeas.length} trade ideas with market details`);
              } catch (jsonError) {
                console.error(`[${new Date().toISOString()}] Error parsing trade ideas JSON:`, jsonError);
                console.error(`[${new Date().toISOString()}] Raw response that failed to parse:`, rawIdeas);
                await addError("trade_ideas_json_parse", jsonError.message || "Error parsing trade ideas JSON", { raw: rawIdeas });
                
                // Fallback: try to extract any meaningful information
                try {
                  if (rawIdeas.includes('"market_id"')) {
                    console.log(`[${new Date().toISOString()}] Attempting fallback extraction from malformed JSON`);
                    // At least log that we got some response with market data
                    results.warnings.push({
                      step: "trade_ideas",
                      message: "Trade ideas response received but couldn't parse JSON format",
                      timestamp: new Date().toISOString()
                    });
                  }
                } catch (fallbackError) {
                  console.error(`[${new Date().toISOString()}] Fallback extraction also failed:`, fallbackError);
                }
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
            
            await addCompletedStep("trade_ideas", { count: tradeIdeas.length });
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Error generating trade ideas:`, error);
            await addError("trade_ideas", error.message || "Error generating trade ideas");
          }

          // Mark as complete
          results.status = "completed";
          console.log(`[${new Date().toISOString()}] Portfolio generation complete`);
          
          // Send final results
          await sendSSE('message', JSON.stringify(results));
          await sendSSE('done', 'Portfolio generation complete');
          
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Error in portfolio generation:`, error);
          await sendSSE('error', error.message);
        } finally {
          writer.close();
        }
      })();

      // Return the stream response
      return new Response(stream.readable, { headers })

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
