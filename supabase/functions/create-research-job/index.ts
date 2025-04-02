
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.23.0';
import { OpenAI } from "https://deno.land/x/openai@v4.4.0/mod.ts";
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.49/deno-dom-wasm.ts';

interface ResearchJob {
  id: string;
  market_id: string;
  market_question: string;
  focus_area: string;
  max_iterations: number;
  supabase_id: string;
	market_price: number;
  related_markets: {
    market_id: string;
    question: string;
    probability: number;
    price_change?: number;
  }[];
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? '';

const openAI = new OpenAI(openAIKey);
const supabaseClient = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const job: ResearchJob = await req.json();
    console.log('Starting research job:', job);

    if (!job.market_id || !job.market_question || !job.id) {
      console.error('Invalid job parameters:', job);
      return new Response(JSON.stringify({ error: 'Invalid job parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await performWebResearch(job);

    return new Response(JSON.stringify({ message: 'Research job completed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in create-research-job function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function performWebResearch(job: ResearchJob) {
  const jobId = job.id;
  const marketId = job.market_id;
  const marketQuestion = job.market_question;
  const focusArea = job.focus_area;
  const maxIterations = job.max_iterations;
  const marketPrice = job.market_price;
  const relatedMarkets = job.related_markets;

  let currentQuery = marketQuestion + (focusArea ? ` - ${focusArea}` : '');
  let iterationResults: any[] = [];
  let allQueries: string[] = [];
  let allAreasForResearch: string[] = [];

  try {
    // Initialize job status
    await supabaseClient
      .from('research_jobs')
      .update({ status: 'running' })
      .eq('id', jobId);

    console.log(`Starting research for market "${marketQuestion}" (ID: ${marketId}), focus: "${focusArea}"`);

    // Perform the web research iterations
    for (let i = 0; i < job.max_iterations; i++) {
      console.log(`Iteration ${i + 1}: Querying the web with "${currentQuery}"`);

      // Update job status with current iteration
      await supabaseClient
        .from('research_jobs')
        .update({ current_iteration: i + 1 })
        .eq('id', jobId);

      // Call the web-research function
      const webResearchResponse = await fetch(Deno.env.get('WEB_RESEARCH_URL') ?? '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        },
        body: JSON.stringify({ query: currentQuery }),
      });

      if (!webResearchResponse.ok) {
        const errorDetails = await webResearchResponse.text();
        console.error(`Web research function failed: ${webResearchResponse.status} - ${errorDetails}`);
        throw new Error(`Web research function failed: ${webResearchResponse.status} - ${errorDetails}`);
      }

      const webResearchData = await webResearchResponse.json();
      const webContent = webResearchData.results.map(result => `Source: ${result.link}\n${result.content}`).join('\n\n');

      console.log(`Web research completed. Found ${webResearchData.results.length} results.`);

      // Call the analysis function
      const analysisResponse = await fetch(Deno.env.get('ANALYZE_WEBPAGE_URL') ?? '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        },
        body: JSON.stringify({ 
          webContent, 
          marketQuestion, 
          focusArea 
        }),
      });

      if (!analysisResponse.ok) {
        const errorDetails = await analysisResponse.text();
        console.error(`Analysis function failed: ${analysisResponse.status} - ${errorDetails}`);
        throw new Error(`Analysis function failed: ${analysisResponse.status} - ${errorDetails}`);
      }

      const analysisData = await analysisResponse.json();
      const analysis = analysisData.analysis;

      console.log(`Analysis completed. Analysis length: ${analysis.length}`);

      // Call the next query function
      const nextQueryResponse = await fetch(Deno.env.get('GENERATE_NEXT_QUERY_URL') ?? '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        },
        body: JSON.stringify({ 
          analysis, 
          marketQuestion, 
          focusArea 
        }),
      });

      if (!nextQueryResponse.ok) {
        const errorDetails = await nextQueryResponse.text();
        console.error(`Next query function failed: ${nextQueryResponse.status} - ${errorDetails}`);
        throw new Error(`Next query function failed: ${nextQueryResponse.status} - ${errorDetails}`);
      }

      const nextQueryData = await nextQueryResponse.json();
      currentQuery = nextQueryData.nextQuery;
      const areasForResearch = nextQueryData.areasForResearch || [];

      console.log(`Next query generated: "${currentQuery}"`);

      iterationResults.push({
        query: marketQuestion,
        content: webContent,
        analysis: analysis,
        nextQuery: currentQuery,
        areasForResearch: areasForResearch
      });

      allQueries.push(marketQuestion);
      allAreasForResearch.push(...areasForResearch);
    }

    // Create insights payload without the analysis field
    const insightsPayload = {
      webContent: iterationResults.map(r => r.content || '').join('\n\n'),
      marketId: job.market_id,
      marketQuestion: job.market_question,
      previousAnalyses: iterationResults.map(r => r.analysis || ''),
      iterations: iterationResults,
      queries: allQueries,
      areasForResearch: allAreasForResearch,
      focusText: job.focus_area,
      marketPrice: job.market_price,
      relatedMarkets: job.related_markets
    };

    // Extract insights from the collected data
    console.log('Extracting structured insights from research data...');
    
    const extractInsightsResponse = await fetch(Deno.env.get('EXTRACT_RESEARCH_INSIGHTS_URL') ?? '', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
      body: JSON.stringify(insightsPayload),
    });

    if (!extractInsightsResponse.ok) {
      const errorDetails = await extractInsightsResponse.text();
      console.error(`Extract insights function failed: ${extractInsightsResponse.status} - ${errorDetails}`);
      throw new Error(`Extract insights function failed: ${extractInsightsResponse.status} - ${errorDetails}`);
    }

    const structuredInsights = await extractInsightsResponse.json();

    // Update final results without the analysis field
    const finalResults = {
      structuredInsights: structuredInsights,
      data: {
        iterations: iterationResults,
        queries: allQueries
      }
    };

    // Update job status with final results
    await supabaseClient
      .from('research_jobs')
      .update({ 
        status: 'completed', 
        results: finalResults 
      })
      .eq('id', jobId);

    console.log(`Research job ${jobId} completed successfully.`);
    return;

  } catch (error) {
    console.error(`Error during research job ${jobId}:`, error);

    // Update job status to failed
    await supabaseClient
      .from('research_jobs')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', jobId);

    throw error;
  }
}
