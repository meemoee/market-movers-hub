import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Logging utility
function logStep(step: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${step}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// Step tracking utility
interface PortfolioStep {
  name: string;
  completed: boolean;
  timestamp: string;
  details?: any;
  error?: string;
}

// Portfolio result interfaces
interface TradeIdea {
  market_id: string;
  market_title: string;
  outcome: string;
  current_price: number;
  target_price: number;
  stop_price: number;
  rationale: string;
}

interface Market {
  market_id: string;
  event_id: string;
  event_title: string;
  question: string;
  yes_price: number;
  no_price: number;
  related_markets: any[];
}

interface PortfolioError {
  step: string;
  message: string;
  timestamp: string;
  details?: any;
}

interface PortfolioWarning {
  step: string;
  message: string;
  timestamp: string;
}

interface PortfolioResults {
  status: string;
  steps: PortfolioStep[];
  errors: PortfolioError[];
  warnings: PortfolioWarning[];
  data: {
    news: string;
    keywords: string;
    markets: Market[];
    tradeIdeas: TradeIdea[];
  };
}

class StepTracker {
  private steps: PortfolioStep[] = [];
  
  startStep(name: string, details?: any): void {
    logStep(name, 'Starting step', details);
    this.steps.push({
      name,
      completed: false,
      timestamp: new Date().toISOString(),
      details
    });
  }
  
  completeStep(name: string, details?: any): void {
    logStep(name, 'Completed step', details);
    const step = this.steps.find(s => s.name === name && !s.completed);
    if (step) {
      step.completed = true;
      step.details = { ...step.details, ...details };
    }
  }
  
  failStep(name: string, error: string, details?: any): void {
    logStep(name, 'Failed step', { error, details });
    const step = this.steps.find(s => s.name === name && !s.completed);
    if (step) {
      step.error = error;
      step.details = { ...step.details, ...details };
    }
  }
  
  getSteps(): PortfolioStep[] {
    return [...this.steps];
  }
}

// Main portfolio generation function
async function generatePortfolio(content: string, stepTracker: StepTracker): Promise<PortfolioResults> {
  logStep('INIT', 'Starting portfolio generation', { contentLength: content.length });
  
  const results: PortfolioResults = {
    status: 'processing',
    steps: [],
    errors: [],
    warnings: [],
    data: {
      news: '',
      keywords: '',
      markets: [],
      tradeIdeas: []
    }
  };

  try {
    // Step 1: Authentication validation
    stepTracker.startStep('auth_validation');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    if (!supabaseClient) {
      throw new Error('Failed to initialize Supabase client');
    }
    
    stepTracker.completeStep('auth_validation', { supabaseInitialized: true });

    // Step 2: News summary (mock for now - you can implement actual news fetching)
    stepTracker.startStep('news_summary');
    
    try {
      // This would typically call a news API or function
      const mockNews = `Recent market analysis suggests increased volatility in prediction markets related to: ${content.substring(0, 100)}...`;
      results.data.news = mockNews;
      stepTracker.completeStep('news_summary', { newsLength: mockNews.length });
    } catch (newsError) {
      stepTracker.failStep('news_summary', newsError.message);
      results.warnings.push({
        step: 'news_summary',
        message: `Failed to fetch news: ${newsError.message}`,
        timestamp: new Date().toISOString()
      });
    }

    // Step 3: Keywords extraction
    stepTracker.startStep('keywords_extraction');
    
    try {
      // Simple keyword extraction (you can enhance this with AI)
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 10);
      
      const keywords = [...new Set(words)].join(', ');
      results.data.keywords = keywords;
      stepTracker.completeStep('keywords_extraction', { keywordCount: words.length });
    } catch (keywordError) {
      stepTracker.failStep('keywords_extraction', keywordError.message);
      results.errors.push({
        step: 'keywords_extraction',
        message: keywordError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 4: Embedding creation
    stepTracker.startStep('embedding_creation');
    
    try {
      // Mock embedding creation - replace with actual embedding service
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
      stepTracker.completeStep('embedding_creation', { embeddingDimensions: mockEmbedding.length });
    } catch (embeddingError) {
      stepTracker.failStep('embedding_creation', embeddingError.message);
      results.errors.push({
        step: 'embedding_creation',
        message: embeddingError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 5: Pinecone search (mock for now)
    stepTracker.startStep('pinecone_search');
    
    try {
      // Mock search results - replace with actual Pinecone search
      const mockSearchResults = [
        { id: 'market_1', score: 0.95 },
        { id: 'market_2', score: 0.87 },
        { id: 'market_3', score: 0.82 }
      ];
      stepTracker.completeStep('pinecone_search', { resultsCount: mockSearchResults.length });
    } catch (searchError) {
      stepTracker.failStep('pinecone_search', searchError.message);
      results.errors.push({
        step: 'pinecone_search',
        message: searchError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 6: Market details fetching
    stepTracker.startStep('market_details');
    
    try {
      // Mock market data - replace with actual database queries
      const mockMarkets = [
        {
          market_id: 'market_1',
          event_id: 'event_1',
          event_title: 'Sample Event 1',
          question: 'Will this prediction come true?',
          yes_price: 0.65,
          no_price: 0.35,
          related_markets: []
        },
        {
          market_id: 'market_2',
          event_id: 'event_2',
          event_title: 'Sample Event 2',
          question: 'Will this other prediction happen?',
          yes_price: 0.42,
          no_price: 0.58,
          related_markets: []
        }
      ];
      
      results.data.markets = mockMarkets;
      stepTracker.completeStep('market_details', { marketsFound: mockMarkets.length });
    } catch (marketError) {
      stepTracker.failStep('market_details', marketError.message);
      results.errors.push({
        step: 'market_details',
        message: marketError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 7: Best markets selection
    stepTracker.startStep('best_markets');
    
    try {
      // Filter to best markets (already done in mock data above)
      const bestMarkets = results.data.markets.slice(0, 5);
      stepTracker.completeStep('best_markets', { selectedCount: bestMarkets.length });
    } catch (selectionError) {
      stepTracker.failStep('best_markets', selectionError.message);
      results.errors.push({
        step: 'best_markets',
        message: selectionError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 8: Trade ideas generation
    stepTracker.startStep('trade_ideas');
    
    try {
      // Generate trade ideas based on markets
      const tradeIdeas: TradeIdea[] = [];
      
      for (const market of results.data.markets.slice(0, 3)) {
        // Determine which outcome to recommend based on user content
        const recommendYes = Math.random() > 0.5; // Simple logic - enhance with AI
        
        const currentPrice = recommendYes ? market.yes_price : market.no_price;
        const targetPrice = currentPrice + 0.10; // 10 cent target
        const stopPrice = Math.max(0.01, currentPrice - 0.05); // 5 cent stop loss
        
        tradeIdeas.push({
          market_id: market.market_id,
          market_title: market.question,
          outcome: recommendYes ? 'Yes' : 'No',
          current_price: currentPrice,
          target_price: targetPrice,
          stop_price: stopPrice,
          rationale: `Based on your insight "${content.substring(0, 50)}...", this market shows potential for ${recommendYes ? 'positive' : 'negative'} movement.`
        });
      }
      
      results.data.tradeIdeas = tradeIdeas;
      stepTracker.completeStep('trade_ideas', { ideasGenerated: tradeIdeas.length });
    } catch (ideasError: any) {
      stepTracker.failStep('trade_ideas', ideasError.message);
      results.errors.push({
        step: 'trade_ideas',
        message: ideasError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Update final status
    results.status = 'completed';
    results.steps = stepTracker.getSteps();
    
    logStep('COMPLETE', 'Portfolio generation completed successfully', {
      marketsFound: results.data.markets.length,
      tradeIdeasGenerated: results.data.tradeIdeas.length,
      errorsCount: results.errors.length,
      warningsCount: results.warnings.length
    });
    
    return results;

  } catch (error) {
    logStep('ERROR', 'Portfolio generation failed', { error: error.message, stack: error.stack });
    
    results.status = 'failed';
    results.steps = stepTracker.getSteps();
    results.errors.push({
      step: 'general',
      message: error.message,
      timestamp: new Date().toISOString(),
      details: { stack: error.stack }
    });
    
    return results;
  }
}

// Main serve function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const stepTracker = new StepTracker();
  
  try {
    logStep('REQUEST', 'Received portfolio generation request', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    });

    let content: string;

    // Handle both GET and POST requests
    if (req.method === 'GET') {
      const url = new URL(req.url);
      content = url.searchParams.get('content') || '';
      
      if (!content) {
        logStep('ERROR', 'No content provided in GET request');
        return new Response(
          JSON.stringify({ error: 'Content parameter is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (req.method === 'POST') {
      try {
        const body = await req.json();
        content = body.content || '';
        
        if (!content) {
          logStep('ERROR', 'No content provided in POST body');
          return new Response(
            JSON.stringify({ error: 'Content field is required in request body' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (parseError) {
        logStep('ERROR', 'Failed to parse request body', { error: parseError.message });
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      logStep('ERROR', 'Unsupported HTTP method', { method: req.method });
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('INPUT', 'Processing content', { 
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
    });

    // Generate portfolio
    const results = await generatePortfolio(content, stepTracker);

    logStep('RESPONSE', 'Sending response', {
      status: results.status,
      stepsCompleted: results.steps.filter(s => s.completed).length,
      totalSteps: results.steps.length,
      errorsCount: results.errors.length
    });

    return new Response(
      JSON.stringify(results),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    logStep('FATAL', 'Unhandled error in serve function', { 
      error: error.message, 
      stack: error.stack 
    });

    const errorResponse = {
      status: 'failed',
      steps: stepTracker.getSteps(),
      errors: [{
        step: 'server',
        message: error.message,
        timestamp: new Date().toISOString(),
        details: { stack: error.stack }
      }],
      warnings: [],
      data: {
        news: '',
        keywords: '',
        markets: [],
        tradeIdeas: []
      }
    };

    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
