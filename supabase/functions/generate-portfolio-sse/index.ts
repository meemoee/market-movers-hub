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

// SSE helper function
const sendSSE = (writer: WritableStreamDefaultWriter, event: string, data: any) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  writer.write(new TextEncoder().encode(message));
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
  console.log(`[${new Date().toISOString()}] SSE Portfolio Request: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract auth token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    
    const authToken = authHeader.substring(7);
    if (!authToken) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Extract content from request
    let content: string;
    if (req.method === 'POST') {
      const body = await req.json();
      content = body.content;
    } else {
      const url = new URL(req.url);
      content = url.searchParams.get('content') || '';
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No content provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Set up SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const writer = controller.getWriter();
        const encoder = new TextEncoder();
        
        try {
          // Send initial status
          await sendSSE(writer, 'status', {
            step: 'initializing',
            message: 'Starting portfolio generation...',
            progress: 0
          });

          // Validate auth token
          await sendSSE(writer, 'status', {
            step: 'auth_validation',
            message: 'Validating authentication...',
            progress: 5
          });

          const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
          );

          const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken);
          if (error || !user) {
            await sendSSE(writer, 'error', {
              step: 'auth_validation',
              message: 'Invalid authentication token',
              error: true
            });
            return;
          }

          await sendSSE(writer, 'step_complete', {
            step: 'auth_validation',
            message: 'Authentication validated',
            progress: 10
          });

          // Step 1: Generate news summary
          await sendSSE(writer, 'status', {
            step: 'news_summary',
            message: 'Generating market context...',
            progress: 15
          });

          let news = '';
          try {
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

            await sendSSE(writer, 'step_complete', {
              step: 'news_summary',
              message: 'Market context generated',
              progress: 25,
              data: { news }
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'news_summary',
              message: `Error generating news: ${error.message}`,
              error: true
            });
          }

          // Step 2: Extract keywords
          await sendSSE(writer, 'status', {
            step: 'keywords_extraction',
            message: 'Extracting key concepts...',
            progress: 30
          });

          let keywords = '';
          try {
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

            await sendSSE(writer, 'step_complete', {
              step: 'keywords_extraction',
              message: `Extracted ${keywords.split(',').length} key concepts`,
              progress: 40,
              data: { keywords }
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'keywords_extraction',
              message: `Error extracting keywords: ${error.message}`,
              error: true
            });
          }

          // Step 3: Create embedding
          await sendSSE(writer, 'status', {
            step: 'embedding_creation',
            message: 'Creating semantic embedding...',
            progress: 45
          });

          let vecArr: number[] = [];
          try {
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

            await sendSSE(writer, 'step_complete', {
              step: 'embedding_creation',
              message: `Created ${vecArr.length}-dimensional embedding`,
              progress: 55
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'embedding_creation',
              message: `Error creating embedding: ${error.message}`,
              error: true
            });
          }

          // Step 4: Search similar markets
          await sendSSE(writer, 'status', {
            step: 'market_search',
            message: 'Searching for relevant markets...',
            progress: 60
          });

          let matches: any[] = [];
          try {
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

            await sendSSE(writer, 'step_complete', {
              step: 'market_search',
              message: `Found ${matches.length} matching markets`,
              progress: 70
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'market_search',
              message: `Error searching markets: ${error.message}`,
              error: true
            });
          }

          // Step 5: Fetch market details
          await sendSSE(writer, 'status', {
            step: 'market_details',
            message: 'Fetching market details...',
            progress: 75
          });

          let details: any[] = [];
          try {
            const marketIds = matches.map(m => m.id);
            
            if (marketIds.length === 0) {
              await sendSSE(writer, 'warning', {
                step: 'market_details',
                message: 'No market IDs available from search',
              });
            } else {
              details = await getMarketsWithLatestPrices(supabaseAdmin, marketIds);
              
              if (details.length === 0) {
                await sendSSE(writer, 'warning', {
                  step: 'market_details',
                  message: 'No matching markets found with price data',
                });
              }
            }

            await sendSSE(writer, 'step_complete', {
              step: 'market_details',
              message: `Retrieved details for ${details.length} markets`,
              progress: 80
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'market_details',
              message: `Error fetching market details: ${error.message}`,
              error: true
            });
          }

          // Step 6: Select best markets
          await sendSSE(writer, 'status', {
            step: 'market_selection',
            message: 'Selecting best markets...',
            progress: 85
          });

          let bests: any[] = [];
          try {
            const includedEventIds = new Set<string>();
            bests = [];
            let count = 0;
            
            for (const m of matches) {
              const marketDetail = details.find(d => d.market_id === m.id);
              if (marketDetail) {
                if (!includedEventIds.has(marketDetail.event_id)) {
                  includedEventIds.add(marketDetail.event_id);
                  bests.push(marketDetail);
                  count++;
                  
                  if (count >= 25) break;
                }
              }
            }

            await sendSSE(writer, 'step_complete', {
              step: 'market_selection',
              message: `Selected ${bests.length} unique markets`,
              progress: 90
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'market_selection',
              message: `Error selecting markets: ${error.message}`,
              error: true
            });
          }

          // Step 7: Generate trade ideas
          await sendSSE(writer, 'status', {
            step: 'trade_ideas',
            message: 'Generating trade recommendations...',
            progress: 95
          });

          let tradeIdeas = [];
          try {
            if (bests.length > 0) {
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

Return ONLY a valid JSON array of exactly three such objects. No extra text. Don't pick an outcome with very small (<10%) or very high (90%+) odds unless you have good reason. NEVER suggest an outcome with price of 0 or 1 since those were already resolved.

Suggest 3 trades as a JSON array of objects with:
  market_id (must be one of the specific IDs provided above, CRITICAL),
  market_title, 
  outcome, 
  current_price, 
  target_price, 
  stop_price, 
  rationale.`;

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
                const parsedIdeas = JSON.parse(rawIdeas);
                
                tradeIdeas = parsedIdeas.map(idea => {
                  const marketDetails = marketDetailsMap[idea.market_id] || {};
                  return {
                    ...idea,
                    image: marketDetails.image || null
                  };
                });
              } catch (jsonError) {
                await sendSSE(writer, 'error', {
                  step: 'trade_ideas',
                  message: `Error parsing trade ideas: ${jsonError.message}`,
                  error: true
                });
              }
            }

            await sendSSE(writer, 'step_complete', {
              step: 'trade_ideas',
              message: `Generated ${tradeIdeas.length} trade recommendations`,
              progress: 100
            });
          } catch (error) {
            await sendSSE(writer, 'error', {
              step: 'trade_ideas',
              message: `Error generating trade ideas: ${error.message}`,
              error: true
            });
          }

          // Send final results
          await sendSSE(writer, 'complete', {
            message: 'Portfolio generation complete',
            progress: 100,
            data: {
              news,
              keywords,
              markets: bests,
              tradeIdeas
            }
          });

          // Send done signal
          await sendSSE(writer, 'done', {});
          
        } catch (error) {
          console.error('SSE Stream error:', error);
          await sendSSE(writer, 'error', {
            step: 'stream_error',
            message: error.message,
            error: true
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('SSE Portfolio generation error:', error);
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
