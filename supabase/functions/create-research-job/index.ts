
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { load } from "https://esm.sh/cheerio@1.0.0-rc.12";

interface WebResearchSource {
  url: string;
  content: string;
  title?: string;
}

interface WebResearchData {
  sources: WebResearchSource[];
  query: string;
  analysis: string;
  probability: string;
  areas_for_research: string[];
  focus_text?: string;
  market_id?: string;
}

interface ResearchJobInput {
  marketId: string; // This is the key that needs to match what's being sent
  focus_text?: string;
  notification_email?: string;
  maxIterations?: number;
}

interface ResearchIteration {
  iteration: number;
  queries: string[];
  web_content: any[];
  analysis?: string;
  areas_for_research?: string[];
}

interface MarketData {
  id: string;
  question: string;
  description?: string;
  price?: number;
  related_markets?: any[];
}

// Create a custom fetch with longer timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    // Log the incoming request body to diagnose the issue
    console.log('Request body:', requestBody);
    
    // Extract parameters with proper validation
    const { marketId, focus_text, notification_email, maxIterations = 2 } = requestBody as ResearchJobInput;
    
    if (!marketId) {
      throw new Error('Missing required parameter: marketId');
    }

    console.log(`Starting research job for market ID: ${marketId}`);
    
    // Create research job in database
    const jobId = crypto.randomUUID();
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Get market data
    console.log("Retrieving market data");
    const { data: marketData, error: marketError } = await supabaseClient
      .from('markets')
      .select('id, question, description')
      .eq('id', marketId)
      .single();

    if (marketError || !marketData) {
      throw new Error(`Error retrieving market data: ${marketError?.message || 'Market not found'}`);
    }

    // Get market price
    const { data: priceData, error: priceError } = await supabaseClient
      .from('market_prices')
      .select('yes_price')
      .eq('market_id', marketId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    let marketPrice = undefined;
    
    if (!priceError && priceData) {
      marketPrice = priceData.yes_price ? parseInt(priceData.yes_price) : undefined;
      console.log(`Found market price: ${marketPrice}`);
    }

    const completeMarketData: MarketData = {
      id: marketData.id,
      question: marketData.question,
      description: marketData.description,
      price: marketPrice
    };

    // Get related markets
    const { data: relatedMarkets, error: relatedMarketsError } = await supabaseClient
      .rpc('get_related_markets', { market_id: marketId, limit_num: 5 });

    if (!relatedMarketsError && relatedMarkets) {
      completeMarketData.related_markets = relatedMarkets;
    }

    // Create research job record
    const { error: insertError } = await supabaseClient
      .from('research_jobs')
      .insert({
        id: jobId,
        market_id: marketId,
        status: 'queued',
        query: marketData.question,
        focus_text: focus_text,
        notification_email: notification_email,
        market_data: completeMarketData,
        max_iterations: maxIterations
      });

    if (insertError) {
      throw new Error(`Error creating research job: ${insertError.message}`);
    }

    // Start the background processing
    EdgeRuntime.waitUntil(performWebResearch(jobId, supabaseClient, completeMarketData, focus_text));

    return new Response(
      JSON.stringify({ 
        jobId, 
        message: "Research job created and processing started" 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    );
  } catch (error) {
    console.error(`Error in create-research-job:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

// Function to create Supabase client with service role key
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    from: (table: string) => ({
      insert: (data: any) => 
        fetch(`${supabaseUrl}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(data)
        }).then(res => res.ok ? {error: null} : res.json().then(err => ({error: err}))),
      update: (data: any) => ({
        eq: (column: string, value: any) =>
          fetch(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
          }).then(res => res.ok ? {error: null} : res.json().then(err => ({error: err})))
      }),
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          single: () =>
            fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&limit=1`, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              }
            })
            .then(res => res.ok ? res.json().then(data => ({data: data[0] || null, error: null})) : res.json().then(err => ({data: null, error: err}))),
          limit: (limit: number) =>
            fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&limit=${limit}`, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              }
            })
            .then(res => res.ok ? res.json().then(data => ({data, error: null})) : res.json().then(err => ({data: null, error: err}))),
          order: (orderColumn: string, options: { ascending: boolean }) =>
            ({
              limit: (limit: number) =>
                fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&order=${orderColumn}.${options.ascending ? 'asc' : 'desc'}&limit=${limit}`, {
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                  }
                })
                .then(res => res.ok ? res.json().then(data => ({data, error: null})) : res.json().then(err => ({data: null, error: err}))),
              single: () => 
                fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&order=${orderColumn}.${options.ascending ? 'asc' : 'desc'}&limit=1`, {
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                  }
                })
                .then(res => res.ok ? res.json().then(data => ({data: data[0] || null, error: null})) : res.json().then(err => ({data: null, error: err})))
            })
        }),
        order: (orderColumn: string, options: { ascending: boolean }) => ({
          limit: (limit: number) =>
            fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}&order=${orderColumn}.${options.ascending ? 'asc' : 'desc'}&limit=${limit}`, {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              }
            })
            .then(res => res.ok ? res.json().then(data => ({data, error: null})) : res.json().then(err => ({data: null, error: err})))
        })
      })
    }),
    rpc: (functionName: string, params: object) =>
      fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify(params)
      })
      .then(res => res.ok ? res.json().then(data => ({data, error: null})) : res.json().then(err => ({data: null, error: err}))),
  };
}

async function performWebResearch(
  jobId: string, 
  supabaseClient: any, 
  marketData: MarketData, 
  focusText?: string
): Promise<void> {
  console.log(`Starting background research for job ${jobId}`);
  
  // Update job status to processing
  await supabaseClient
    .from('research_jobs')
    .update({ 
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', jobId);

  try {
    // Variables for tracking research progress
    const maxIterations = 2;
    const iterations: ResearchIteration[] = [];
    let currentIteration = 1;
    let areasForResearch: string[] = [];
    let previousAnalyses: string[] = [];

    // Store job state
    await supabaseClient
      .from('research_jobs')
      .update({ 
        max_iterations: maxIterations
      })
      .eq('id', jobId);

    while (currentIteration <= maxIterations) {
      console.log(`Processing iteration ${currentIteration} for job ${jobId}`);
      
      // Update job status with current iteration
      await supabaseClient
        .from('research_jobs')
        .update({ 
          current_iteration: currentIteration,
          iterations: iterations
        })
        .eq('id', jobId);

      // 1. Generate search queries
      const queries = await generateQueries(
        marketData.question, 
        marketData.description || '', 
        currentIteration,
        areasForResearch
      );
      
      console.log(`Generated ${queries.length} queries for iteration ${currentIteration}: ${JSON.stringify(queries)}`);

      // Create iteration data object
      const iterationData: ResearchIteration = {
        iteration: currentIteration,
        queries: queries,
        web_content: []
      };
      
      // 2. Execute web research with queries
      const webResults = await executeWebResearch(
        marketData.question,
        queries,
        focusText
      );
      
      iterationData.web_content = webResults;
      
      // 3. Generate analysis for the current iteration
      try {
        // Find market price if available
        let marketPrice: number | undefined = undefined;
        
        if (marketData.price !== undefined) {
          marketPrice = marketData.price;
          console.log(`Found market price for ${marketData.id}: ${marketPrice}%`);
        }
        
        // Prepare related markets data if available
        const relatedMarkets = marketData.related_markets || [];
        
        const analysisResult = await generateAnalysisWithStreaming(
          jobId,
          currentIteration,
          marketData,
          webResults,
          previousAnalyses,
          queries,
          areasForResearch,
          focusText,
          marketPrice,
          relatedMarkets
        );
        
        if (analysisResult) {
          iterationData.analysis = analysisResult.analysis;
          iterationData.areas_for_research = analysisResult.areasForResearch;
          
          // Update areas for research for next iteration
          areasForResearch = analysisResult.areasForResearch;
          
          // Add to previous analyses
          if (analysisResult.analysis) {
            previousAnalyses.push(analysisResult.analysis);
          }
        }
      } catch (error) {
        console.error(`Error analyzing iteration ${currentIteration} results:`, error);
      }
      
      // Add iteration to the history
      iterations.push(iterationData);
      
      // Update the job with the latest iteration data
      await supabaseClient
        .from('research_jobs')
        .update({ 
          iterations: iterations,
          progress_log: [...(iterations.map(it => ({
            timestamp: new Date().toISOString(),
            message: `Completed iteration ${it.iteration}`
          })))]
        })
        .eq('id', jobId);
      
      // Increment iteration counter
      currentIteration++;
    }
    
    // All iterations complete, generate final comprehensive analysis
    try {
      // Prepare web content with all iterations
      const allWebContent = iterations.flatMap(iteration => iteration.web_content);
      
      // Find market price if available
      let marketPrice: number | undefined = undefined;
      
      if (marketData.price !== undefined) {
        marketPrice = marketData.price;
        console.log(`Found market price for final analysis ${marketData.id}: ${marketPrice}%`);
      }
      
      // Prepare related markets data if available
      const relatedMarkets = marketData.related_markets || [];
      
      const allQueries = iterations.flatMap(iteration => iteration.queries);
      
      // Generate final comprehensive analysis
      const finalAnalysis = await generateFinalAnalysisWithStreaming(
        jobId,
        marketData,
        allWebContent,
        previousAnalyses,
        allQueries,
        areasForResearch,
        focusText,
        marketPrice,
        relatedMarkets
      );
      
      // 5. Extract structured insights from all research data
      try {
        // Prepare web content data as one large string
        const webContentText = allWebContent.map(source => 
          `SOURCE: ${source.url}\nTITLE: ${source.title || 'No title'}\nCONTENT:\n${source.content}`
        ).join('\n\n');
        
        // Prepare analysis text (use final analysis or the last iteration analysis)
        const analysisText = finalAnalysis || 
          (iterations.length > 0 && iterations[iterations.length - 1].analysis) || 
          "No analysis available.";
        
        // Prepare context for insights
        console.log(`Preparing web content with ${previousAnalyses.length} analyses prominently included`);
        
        // Find market price if available
        if (marketData.price !== undefined) {
          console.log(`Found market price for ${marketData.id}: ${marketPrice}%`);
        }
        
        // Log what we're sending to the extract-research-insights function
        console.log(`Sending extract-research-insights payload with:
        - ${allWebContent.length} web results
        - ${previousAnalyses.length} previous analyses (prominently included in webContent)
        - ${allQueries.length} queries
        - ${areasForResearch.length} areas for research
        - marketPrice: ${marketPrice}
        - ${relatedMarkets.length} related markets
        - focusText: ${focusText}`);
        
        // Extract structured insights
        const insightsResponse = await fetchWithTimeout(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/extract-research-insights`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({
              webContent: webContentText,
              analysis: analysisText,
              marketId: marketData.id,
              marketQuestion: marketData.question,
              previousAnalyses: previousAnalyses,
              iterations: iterations,
              queries: allQueries,
              areasForResearch: areasForResearch,
              focusText: focusText,
              marketPrice: marketPrice,
              relatedMarkets: relatedMarkets
            })
          },
          60000 // 60 second timeout for this request
        );
        
        if (!insightsResponse.ok) {
          const errorText = await insightsResponse.text();
          throw new Error(`Failed to extract insights: ${insightsResponse.status} ${errorText}`);
        }
        
        const insightsData = await insightsResponse.json();
        const insights = insightsData.choices[0].message.content;
        
        // Update the job with structured results
        await supabaseClient
          .from('research_jobs')
          .update({
            results: insights,
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
        
        // Try to send notification if email is provided
        const { data: jobData } = await supabaseClient
          .from('research_jobs')
          .select('notification_email')
          .eq('id', jobId)
          .single();

        if (jobData && jobData.notification_email) {
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-research-notification`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
              },
              body: JSON.stringify({
                job_id: jobId,
                email: jobData.notification_email
              })
            });
          } catch (notifError) {
            console.error(`Error sending notification for job ${jobId}:`, notifError);
          }
        }
      } catch (extractError) {
        console.error(`Error extracting structured insights for job ${jobId}:`, extractError);
        
        // Update job status as completed even if insights extraction failed
        await supabaseClient
          .from('research_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            error_message: extractError.message
          })
          .eq('id', jobId);
      }
    } catch (finalAnalysisError) {
      console.error(`Error generating final analysis for job ${jobId}:`, finalAnalysisError);
      
      // Update job status as completed with error
      await supabaseClient
        .from('research_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: finalAnalysisError.message
        })
        .eq('id', jobId);
    }
  } catch (error) {
    console.error(`Error in web research job ${jobId}:`, error);
    
    // Update job status as failed
    await supabaseClient
      .from('research_jobs')
      .update({ 
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
  
  console.log(`Completed background research for job ${jobId}`);
}

async function generateQueries(
  marketQuestion: string,
  marketDescription: string,
  iteration: number,
  areasForResearch: string[] = []
): Promise<string[]> {
  try {
    // Call the generate-queries function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-queries`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({
          marketQuestion,
          marketDescription,
          iteration,
          areasForResearch
        })
      }
    );
    
    if (!response.ok) {
      throw new Error(`Error from generate-queries: ${response.status}`);
    }
    
    const queries = await response.json();
    return queries;
  } catch (error) {
    console.error("Error generating queries:", error);
    
    // Fallback to simple query generation
    return [
      `${marketQuestion} latest data 2023-2025`,
      `${marketQuestion} statistics recent analysis`,
      `${marketQuestion} prediction market probability`,
      `${marketQuestion} historical trends data`,
      `${marketQuestion} expert opinion recent`
    ];
  }
}

async function executeWebResearch(
  query: string,
  searchQueries: string[],
  focusText?: string
): Promise<WebResearchSource[]> {
  try {
    // Call the web-research function with the provided queries
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/web-research`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({
          query,
          queries: searchQueries,
          focusText
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error from web-research: ${response.status} ${errorText}`);
    }
    
    // Process the response as a stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const sources: WebResearchSource[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        
        const data = JSON.parse(line.substring(6));
        
        if (data.error) {
          console.error("Web research error:", data.error);
          continue;
        }
        
        if (data.type === 'results' && Array.isArray(data.data)) {
          // Add the new sources
          sources.push(...data.data);
        }
      }
    }
    
    // Deduplicate sources by URL
    const uniqueSources = [...new Map(sources.map(item => [item.url, item])).values()];
    
    return uniqueSources;
  } catch (error) {
    console.error("Error in web research:", error);
    return [];
  }
}

async function generateAnalysisWithStreaming(
  jobId: string,
  iteration: number,
  marketData: MarketData,
  webResults: WebResearchSource[],
  previousAnalyses: string[],
  queries: string[],
  areasForResearch: string[],
  focusText?: string,
  marketPrice?: number,
  relatedMarkets?: any[]
): Promise<{ analysis: string, areasForResearch: string[] } | null> {
  try {
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }
    
    console.log(`Generating Iteration ${iteration} analysis for "${marketData.question}${marketData.description ? ' - ' + marketData.description : ''}" using OpenRouter with streaming enabled`);
    
    // Prepare web content
    const webContentText = webResults.map(source => 
      `SOURCE: ${source.url}\nTITLE: ${source.title || 'No title'}\nCONTENT:\n${source.content}`
    ).join('\n\n');
    
    // Prepare previous analyses context
    const previousAnalysesContext = previousAnalyses.length > 0
      ? `PREVIOUS ANALYSES:\n${previousAnalyses.map((analysis, idx) => 
          `ITERATION ${idx + 1}:\n${analysis}`
        ).join('\n\n')}`
      : '';
    
    // Prepare focus text context
    const focusContext = focusText 
      ? `\nIMPORTANT FOCUS: Your analysis must specifically emphasize: "${focusText}"\n` 
      : '';
    
    // Prepare market price context
    const priceContext = marketPrice !== undefined
      ? `\nCURRENT MARKET PRICE: ${marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability of this event occurring.`
      : '';
    
    // Prepare related markets context if available
    let relatedMarketsContext = '';
    if (relatedMarkets && relatedMarkets.length > 0) {
      relatedMarketsContext = "\nRELATED MARKETS:\n";
      relatedMarkets.forEach(market => {
        relatedMarketsContext += `- "${market.question}": ${Math.round(market.probability * 100)}%\n`;
      });
    }
    
    // Prepare areas for research context
    const areasForResearchContext = areasForResearch.length > 0
      ? `\nPREVIOUSLY IDENTIFIED AREAS FOR RESEARCH:\n${areasForResearch.map(area => `- ${area}`).join('\n')}`
      : '';
    
    // Prepare prompt 
    const systemPrompt = `You are a skilled market research analyst and probability forecaster analyzing data for a prediction market.
${focusContext}

Your current task is to analyze web research results for ITERATION ${iteration} of a multi-step research process on the question: "${marketData.question}"${marketData.description ? `\nAdditional context: ${marketData.description}` : ''}
${priceContext}
${relatedMarketsContext}
${areasForResearchContext}

TASK:
1. Thoroughly analyze all provided web research
2. Identify key facts, statistics, and insights relevant to the prediction market question
3. Evaluate the reliability and relevance of the information
4. Synthesize findings into a coherent analysis
5. Identify areas where more research is needed in future iterations

FORMAT YOUR RESPONSE AS A JSON OBJECT WITH:
{
  "analysis": "Your detailed analysis of all the evidence found in this iteration (500+ words)",
  "areasForResearch": ["Area 1 that needs more research", "Area 2 that needs more research", ...] (list at least 3 specific areas)
}

IMPORTANT GUIDELINES:
- Maintain a neutral, analytical tone
- Cite specific evidence from the provided sources
- Clearly indicate when making inferences versus stating facts
- Consider multiple perspectives and potential outcomes
- The analysis should be detailed and thorough
- Explicitly connect your findings to the probability of the event occurring${focusText ? `\n- Focus specifically on the requested aspect: "${focusText}"` : ''}
- Be concise but comprehensive`;

    const userPrompt = `ITERATION ${iteration} WEB RESEARCH:
${webContentText}

${previousAnalysesContext}

${areasForResearchContext}

Search queries used: ${queries.join(', ')}

Based on this research for the prediction market question "${marketData.question}", provide a detailed analysis and identify specific areas that need more research for the next iteration.

Remember to format your response as requested JSON object with "analysis" and "areasForResearch" fields.`;

    // Set up streaming response
    const iterationId = `${jobId}-iteration-${iteration}`;
    const messagesArray = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    // Create a sequence to store chunks in the database
    let sequence = 0;
    let analysisText = '';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: messagesArray,
        stream: true,
        temperature: 0.3,
        response_format: { "type": "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    
    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        
        // Skip the [DONE] message
        if (line === 'data: [DONE]') continue;
        
        try {
          // Parse the chunk data
          const data = JSON.parse(line.substring(6));
          
          // Extract content from the delta
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) {
            analysisText += content;
            
            // Write the chunk to the database
            const supabaseClient = createClient(
              Deno.env.get('SUPABASE_URL') || '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
            );
            
            await supabaseClient.from('analysis_stream').insert({
              job_id: jobId,
              chunk: content,
              sequence: sequence++,
              iteration: iteration
            });
          }
        } catch (error) {
          console.error(`Error processing stream chunk: ${error}`);
        }
      }
    }
    
    try {
      // Parse the complete analysisText as JSON
      const result = JSON.parse(analysisText);
      
      // Ensure the result has the expected structure
      if (typeof result.analysis === 'string' && Array.isArray(result.areasForResearch)) {
        return {
          analysis: result.analysis,
          areasForResearch: result.areasForResearch
        };
      } else {
        throw new Error('Invalid response format');
      }
    } catch (jsonError) {
      console.error(`Error parsing analysis as JSON: ${jsonError}`);
      
      // Fallback - try to extract what we can
      return {
        analysis: analysisText,
        areasForResearch: ['Evidence quality and reliability', 'Recent developments', 'Alternative perspectives']
      };
    }
  } catch (error) {
    console.error(`Error generating analysis with streaming for iteration ${iteration}:`, error);
    throw error;
  }
}

async function generateFinalAnalysisWithStreaming(
  jobId: string,
  marketData: MarketData,
  webResults: WebResearchSource[],
  previousAnalyses: string[],
  queries: string[],
  areasForResearch: string[],
  focusText?: string,
  marketPrice?: number,
  relatedMarkets?: any[]
): Promise<string | null> {
  try {
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }
    
    console.log(`Generating final comprehensive analysis using OpenRouter with streaming enabled`);
    
    // Prepare web content
    const webContentText = webResults.map(source => 
      `SOURCE: ${source.url}\nTITLE: ${source.title || 'No title'}\nCONTENT:\n${source.content}`
    ).join('\n\n');
    
    // Prepare previous analyses context
    const previousAnalysesContext = previousAnalyses.length > 0
      ? `PREVIOUS ITERATION ANALYSES:\n${previousAnalyses.map((analysis, idx) => 
          `ITERATION ${idx + 1}:\n${analysis}`
        ).join('\n\n')}`
      : '';
    
    // Prepare focus text context
    const focusContext = focusText 
      ? `\nIMPORTANT FOCUS: Your analysis must specifically emphasize: "${focusText}"\n` 
      : '';
    
    // Prepare market price context
    const priceContext = marketPrice !== undefined
      ? `\nCURRENT MARKET PRICE: ${marketPrice}%. In prediction markets, this price reflects the market's current assessment of the probability of this event occurring.`
      : '';
    
    // Prepare related markets context if available
    let relatedMarketsContext = '';
    if (relatedMarkets && relatedMarkets.length > 0) {
      relatedMarketsContext = "\nRELATED MARKETS:\n";
      relatedMarkets.forEach(market => {
        relatedMarketsContext += `- "${market.question}": ${Math.round(market.probability * 100)}%\n`;
      });
    }
    
    // Prepare areas for research context
    const areasForResearchContext = areasForResearch.length > 0
      ? `\nIDENTIFIED AREAS FOR RESEARCH:\n${areasForResearch.map(area => `- ${area}`).join('\n')}`
      : '';
    
    // Prepare prompt 
    const systemPrompt = `You are a skilled market research analyst and probability forecaster creating a FINAL COMPREHENSIVE ANALYSIS for a prediction market.
${focusContext}

Your task is to create a thorough final analysis of all research iterations for the prediction market question: "${marketData.question}"${marketData.description ? `\nAdditional context: ${marketData.description}` : ''}
${priceContext}
${relatedMarketsContext}
${areasForResearchContext}

TASK:
1. Synthesize findings from all research iterations into one comprehensive analysis
2. Evaluate the most critical evidence and insights from all web research
3. Assess the overall reliability and quality of the information
4. Provide a nuanced analysis of the probability of the event occurring
5. Present a balanced view of supporting and opposing evidence

FORMAT:
- Present a well-structured, thorough analysis (1000+ words)
- Use sections with headings to organize your analysis
- Use Markdown formatting for readability

IMPORTANT GUIDELINES:
- Maintain a neutral, analytical tone
- Cite specific evidence from the provided sources
- Clearly indicate when making inferences versus stating facts
- Consider multiple perspectives and potential outcomes
- Include specific probability estimates with reasoning${focusText ? `\n- Focus specifically on the requested aspect: "${focusText}"` : ''}
- Be comprehensive yet concise and focused`;

    const userPrompt = `FINAL ANALYSIS REQUEST - ALL WEB RESEARCH:
${webContentText}

${previousAnalysesContext}

${areasForResearchContext}

Search queries used across all iterations: ${queries.join(', ')}

Create a final comprehensive analysis for the prediction market question "${marketData.question}" based on all the research iterations.`;

    // Set up streaming response
    const finalAnalysisId = `${jobId}-final-analysis`;
    const messagesArray = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    
    // Create a sequence to store chunks in the database
    let sequence = 0;
    let analysisText = '';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hunchex.app'
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: messagesArray,
        stream: true,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    
    // Process the stream
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        
        // Skip the [DONE] message
        if (line === 'data: [DONE]') continue;
        
        try {
          // Parse the chunk data
          const data = JSON.parse(line.substring(6));
          
          // Extract content from the delta
          const content = data.choices?.[0]?.delta?.content || '';
          if (content) {
            analysisText += content;
            
            // Write the chunk to the database
            const supabaseClient = createClient(
              Deno.env.get('SUPABASE_URL') || '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
            );
            
            await supabaseClient.from('analysis_stream').insert({
              job_id: jobId,
              chunk: content,
              sequence: sequence++,
              iteration: 999 // Use 999 to indicate final analysis
            });
          }
        } catch (error) {
          console.error(`Error processing stream chunk: ${error}`);
        }
      }
    }
    
    return analysisText;
  } catch (error) {
    console.error(`Error generating final analysis with streaming:`, error);
    throw error;
  }
}
