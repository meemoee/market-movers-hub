import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// SSE headers
const sseHeaders = {
  ...corsHeaders,
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

// Logging utility
function logStep(step: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${step}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// SSE message utility
function createSSEMessage(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  
  constructor(writer?: WritableStreamDefaultWriter<Uint8Array>) {
    this.writer = writer || null;
  }
  
  async startStep(name: string, details?: any): Promise<void> {
    logStep(name, 'Starting step', details);
    const step: PortfolioStep = {
      name,
      completed: false,
      timestamp: new Date().toISOString(),
      details
    };
    this.steps.push(step);
    
    // Send SSE update
    if (this.writer) {
      await this.sendUpdate();
    }
  }
  
  async completeStep(name: string, details?: any): Promise<void> {
    logStep(name, 'Completed step', details);
    const step = this.steps.find(s => s.name === name && !s.completed);
    if (step) {
      step.completed = true;
      step.details = { ...step.details, ...details };
    }
    
    // Send SSE update
    if (this.writer) {
      await this.sendUpdate();
    }
  }
  
  async failStep(name: string, error: string, details?: any): Promise<void> {
    logStep(name, 'Failed step', { error, details });
    const step = this.steps.find(s => s.name === name && !s.completed);
    if (step) {
      step.error = error;
      step.details = { ...step.details, ...details };
    }
    
    // Send SSE update
    if (this.writer) {
      await this.sendUpdate();
    }
  }
  
  private async sendUpdate(): Promise<void> {
    if (!this.writer) return;
    
    try {
      const updateData = {
        status: 'processing',
        steps: [...this.steps],
        errors: [],
        warnings: [],
        data: {
          news: '',
          keywords: '',
          markets: [],
          tradeIdeas: []
        }
      };
      
      const message = createSSEMessage(updateData);
      await this.writer.write(new TextEncoder().encode(message));
    } catch (error) {
      console.error('Error sending SSE update:', error);
    }
  }
  
  getSteps(): PortfolioStep[] {
    return [...this.steps];
  }
}

// Main portfolio generation function with SSE streaming
async function generatePortfolioWithSSE(
  content: string, 
  stepTracker: StepTracker,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<PortfolioResults> {
  logStep('INIT', 'Starting portfolio generation with SSE', { contentLength: content.length });
  
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
    await stepTracker.startStep('auth_validation');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    if (!supabaseClient) {
      throw new Error('Failed to initialize Supabase client');
    }
    
    await stepTracker.completeStep('auth_validation', { supabaseInitialized: true });

    // Step 2: News summary
    await stepTracker.startStep('news_summary');
    
    try {
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockNews = `Recent market analysis suggests increased volatility in prediction markets related to: ${content.substring(0, 100)}...`;
      results.data.news = mockNews;
      await stepTracker.completeStep('news_summary', { newsLength: mockNews.length });
    } catch (newsError: any) {
      await stepTracker.failStep('news_summary', newsError.message);
      results.warnings.push({
        step: 'news_summary',
        message: `Failed to fetch news: ${newsError.message}`,
        timestamp: new Date().toISOString()
      });
    }

    // Step 3: Keywords extraction
    await stepTracker.startStep('keywords_extraction');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 10);
      
      const keywords = [...new Set(words)].join(', ');
      results.data.keywords = keywords;
      await stepTracker.completeStep('keywords_extraction', { keywordCount: words.length });
    } catch (keywordError: any) {
      await stepTracker.failStep('keywords_extraction', keywordError.message);
      results.errors.push({
        step: 'keywords_extraction',
        message: keywordError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 4: Embedding creation
    await stepTracker.startStep('embedding_creation');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
      await stepTracker.completeStep('embedding_creation', { embeddingDimensions: mockEmbedding.length });
    } catch (embeddingError: any) {
      await stepTracker.failStep('embedding_creation', embeddingError.message);
      results.errors.push({
        step: 'embedding_creation',
        message: embeddingError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 5: Pinecone search
    await stepTracker.startStep('pinecone_search');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const mockSearchResults = [
        { id: 'market_1', score: 0.95 },
        { id: 'market_2', score: 0.87 },
        { id: 'market_3', score: 0.82 }
      ];
      await stepTracker.completeStep('pinecone_search', { resultsCount: mockSearchResults.length });
    } catch (searchError: any) {
      await stepTracker.failStep('pinecone_search', searchError.message);
      results.errors.push({
        step: 'pinecone_search',
        message: searchError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 6: Market details fetching
    await stepTracker.startStep('market_details');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockMarkets: Market[] = [
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
      await stepTracker.completeStep('market_details', { marketsFound: mockMarkets.length });
    } catch (marketError: any) {
      await stepTracker.failStep('market_details', marketError.message);
      results.errors.push({
        step: 'market_details',
        message: marketError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 7: Best markets selection
    await stepTracker.startStep('best_markets');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const bestMarkets = results.data.markets.slice(0, 5);
      await stepTracker.completeStep('best_markets', { selectedCount: bestMarkets.length });
    } catch (selectionError: any) {
      await stepTracker.failStep('best_markets', selectionError.message);
      results.errors.push({
        step: 'best_markets',
        message: selectionError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Step 8: Trade ideas generation
    await stepTracker.startStep('trade_ideas');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 700));
      
      const tradeIdeas: TradeIdea[] = [];
      
      for (const market of results.data.markets.slice(0, 3)) {
        const recommendYes = Math.random() > 0.5;
        
        const currentPrice = recommendYes ? market.yes_price : market.no_price;
        const targetPrice = currentPrice + 0.10;
        const stopPrice = Math.max(0.01, currentPrice - 0.05);
        
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
      await stepTracker.completeStep('trade_ideas', { ideasGenerated: tradeIdeas.length });
    } catch (ideasError: any) {
      await stepTracker.failStep('trade_ideas', ideasError.message);
      results.errors.push({
        step: 'trade_ideas',
        message: ideasError.message,
        timestamp: new Date().toISOString()
      });
    }

    // Update final status and send final result
    results.status = 'completed';
    results.steps = stepTracker.getSteps();
    
    // Send final SSE message with complete results
    const finalMessage = createSSEMessage(results);
    await writer.write(new TextEncoder().encode(finalMessage));
    
    logStep('COMPLETE', 'Portfolio generation completed successfully', {
      marketsFound: results.data.markets.length,
      tradeIdeasGenerated: results.data.tradeIdeas.length,
      errorsCount: results.errors.length,
      warningsCount: results.warnings.length
    });
    
    return results;

  } catch (error: any) {
    logStep('ERROR', 'Portfolio generation failed', { error: error.message, stack: error.stack });
    
    results.status = 'failed';
    results.steps = stepTracker.getSteps();
    results.errors.push({
      step: 'general',
      message: error.message,
      timestamp: new Date().toISOString(),
      details: { stack: error.stack }
    });
    
    // Send error result via SSE
    const errorMessage = createSSEMessage(results);
    await writer.write(new TextEncoder().encode(errorMessage));
    
    return results;
  }
}

// Main serve function
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      const authToken = url.searchParams.get('authToken');
      
      if (!content) {
        logStep('ERROR', 'No content provided in GET request');
        return new Response(
          JSON.stringify({ error: 'Content parameter is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!authToken) {
        logStep('ERROR', 'No auth token provided in GET request');
        return new Response(
          JSON.stringify({ error: 'Authentication token is required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate the auth token by creating a Supabase client with it
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        );
        
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authToken);
        
        if (authError || !user) {
          logStep('ERROR', 'Invalid auth token', { authError });
          return new Response(
            JSON.stringify({ error: 'Invalid authentication token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        logStep('AUTH', 'User authenticated successfully', { userId: user.id });
      } catch (authValidationError: any) {
        logStep('ERROR', 'Auth validation failed', { error: authValidationError.message });
        return new Response(
          JSON.stringify({ error: 'Authentication validation failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      } catch (parseError: any) {
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

    // For GET requests (SSE), return streaming response
    if (req.method === 'GET') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      const stepTracker = new StepTracker(writer);
      
      // Start portfolio generation in background
      generatePortfolioWithSSE(content, stepTracker, writer)
        .finally(() => {
          writer.close();
        });
      
      return new Response(readable, {
        status: 200,
        headers: sseHeaders
      });
    } 
    // For POST requests, return regular JSON response (for compatibility)
    else {
      const stepTracker = new StepTracker();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      const results = await generatePortfolioWithSSE(content, stepTracker, writer);
      writer.close();
      
      logStep('RESPONSE', 'Sending JSON response', {
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
    }

  } catch (error: any) {
    logStep('FATAL', 'Unhandled error in serve function', { 
      error: error.message, 
      stack: error.stack 
    });

    const errorResponse = {
      status: 'failed',
      steps: [],
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
