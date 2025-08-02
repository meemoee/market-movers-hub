
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

// Logging utility with extensive debugging
function logStep(step: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${step}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

// Enhanced debugging utility
function debugLog(category: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG-${timestamp}] [${category}] ${message}`);
  if (data) {
    console.log(`[DEBUG-${timestamp}] [${category}] DATA:`, JSON.stringify(data, null, 2));
  }
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
    debugLog('StepTracker', 'Initialized', { hasWriter: !!this.writer });
  }
  
  async startStep(name: string, details?: any): Promise<void> {
    debugLog('StepTracker', `Starting step: ${name}`, details);
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
    debugLog('StepTracker', `Completing step: ${name}`, details);
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
    debugLog('StepTracker', `Failing step: ${name}`, { error, details });
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
      
      debugLog('StepTracker', 'Sending SSE update', { stepCount: this.steps.length });
      const message = createSSEMessage(updateData);
      await this.writer.write(new TextEncoder().encode(message));
    } catch (error) {
      console.error('Error sending SSE update:', error);
      debugLog('StepTracker', 'SSE update error', error);
    }
  }
  
  getSteps(): PortfolioStep[] {
    return [...this.steps];
  }
}

// Enhanced authentication validation function
async function validateAuthentication(authToken?: string): Promise<{ valid: boolean, user?: any, error?: string }> {
  debugLog('AUTH', 'Starting authentication validation', { hasToken: !!authToken, tokenLength: authToken?.length });
  
  if (!authToken) {
    debugLog('AUTH', 'No auth token provided');
    return { valid: false, error: 'No authentication token provided' };
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );
    
    debugLog('AUTH', 'Created Supabase client for auth validation');
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authToken);
    
    debugLog('AUTH', 'Auth validation result', { 
      hasUser: !!user, 
      userId: user?.id, 
      userEmail: user?.email,
      hasError: !!authError,
      errorMessage: authError?.message 
    });
    
    if (authError || !user) {
      debugLog('AUTH', 'Authentication failed', { authError });
      return { valid: false, error: authError?.message || 'Invalid token' };
    }
    
    debugLog('AUTH', 'Authentication successful', { userId: user.id });
    return { valid: true, user };
  } catch (error: any) {
    debugLog('AUTH', 'Auth validation exception', { error: error.message, stack: error.stack });
    return { valid: false, error: error.message };
  }
}

// Main portfolio generation function with SSE streaming
async function generatePortfolioWithSSE(
  content: string, 
  stepTracker: StepTracker,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<PortfolioResults> {
  debugLog('PORTFOLIO', 'Starting portfolio generation', { contentLength: content.length });
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
    
    debugLog('PORTFOLIO', 'Supabase client initialized');
    await stepTracker.completeStep('auth_validation', { supabaseInitialized: true });

    // Step 2: News summary
    await stepTracker.startStep('news_summary');
    
    try {
      debugLog('PORTFOLIO', 'Processing news summary');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockNews = `Recent market analysis suggests increased volatility in prediction markets related to: ${content.substring(0, 100)}...`;
      results.data.news = mockNews;
      debugLog('PORTFOLIO', 'News summary completed', { newsLength: mockNews.length });
      await stepTracker.completeStep('news_summary', { newsLength: mockNews.length });
    } catch (newsError: any) {
      debugLog('PORTFOLIO', 'News summary failed', { error: newsError.message });
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
      debugLog('PORTFOLIO', 'Processing keywords extraction');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 10);
      
      const keywords = [...new Set(words)].join(', ');
      results.data.keywords = keywords;
      debugLog('PORTFOLIO', 'Keywords extraction completed', { keywordCount: words.length, keywords });
      await stepTracker.completeStep('keywords_extraction', { keywordCount: words.length });
    } catch (keywordError: any) {
      debugLog('PORTFOLIO', 'Keywords extraction failed', { error: keywordError.message });
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
      debugLog('PORTFOLIO', 'Processing embedding creation');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
      debugLog('PORTFOLIO', 'Embedding creation completed', { embeddingDimensions: mockEmbedding.length });
      await stepTracker.completeStep('embedding_creation', { embeddingDimensions: mockEmbedding.length });
    } catch (embeddingError: any) {
      debugLog('PORTFOLIO', 'Embedding creation failed', { error: embeddingError.message });
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
      debugLog('PORTFOLIO', 'Processing Pinecone search');
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const mockSearchResults = [
        { id: 'market_1', score: 0.95 },
        { id: 'market_2', score: 0.87 },
        { id: 'market_3', score: 0.82 }
      ];
      debugLog('PORTFOLIO', 'Pinecone search completed', { resultsCount: mockSearchResults.length, results: mockSearchResults });
      await stepTracker.completeStep('pinecone_search', { resultsCount: mockSearchResults.length });
    } catch (searchError: any) {
      debugLog('PORTFOLIO', 'Pinecone search failed', { error: searchError.message });
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
      debugLog('PORTFOLIO', 'Processing market details');
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
      debugLog('PORTFOLIO', 'Market details completed', { marketsFound: mockMarkets.length, markets: mockMarkets });
      await stepTracker.completeStep('market_details', { marketsFound: mockMarkets.length });
    } catch (marketError: any) {
      debugLog('PORTFOLIO', 'Market details failed', { error: marketError.message });
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
      debugLog('PORTFOLIO', 'Processing best markets selection');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const bestMarkets = results.data.markets.slice(0, 5);
      debugLog('PORTFOLIO', 'Best markets selection completed', { selectedCount: bestMarkets.length });
      await stepTracker.completeStep('best_markets', { selectedCount: bestMarkets.length });
    } catch (selectionError: any) {
      debugLog('PORTFOLIO', 'Best markets selection failed', { error: selectionError.message });
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
      debugLog('PORTFOLIO', 'Processing trade ideas generation');
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
      debugLog('PORTFOLIO', 'Trade ideas generation completed', { ideasGenerated: tradeIdeas.length, ideas: tradeIdeas });
      await stepTracker.completeStep('trade_ideas', { ideasGenerated: tradeIdeas.length });
    } catch (ideasError: any) {
      debugLog('PORTFOLIO', 'Trade ideas generation failed', { error: ideasError.message });
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
    
    debugLog('PORTFOLIO', 'Portfolio generation completed successfully', {
      marketsFound: results.data.markets.length,
      tradeIdeasGenerated: results.data.tradeIdeas.length,
      errorsCount: results.errors.length,
      warningsCount: results.warnings.length,
      totalSteps: results.steps.length,
      completedSteps: results.steps.filter(s => s.completed).length
    });
    
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
    debugLog('PORTFOLIO', 'Portfolio generation failed with exception', { error: error.message, stack: error.stack });
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
  const requestId = crypto.randomUUID();
  debugLog('REQUEST', `New request received [${requestId}]`, {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    debugLog('REQUEST', `CORS preflight request [${requestId}]`);
    return new Response(null, { headers: corsHeaders });
  }

  try {
    debugLog('REQUEST', `Processing ${req.method} request [${requestId}]`);
    logStep('REQUEST', 'Received portfolio generation request', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    });

    let content: string;
    let authToken: string | undefined;

    // Handle both GET and POST requests
    if (req.method === 'GET') {
      debugLog('REQUEST', `Processing GET request [${requestId}]`);
      const url = new URL(req.url);
      content = url.searchParams.get('content') || '';
      authToken = url.searchParams.get('authToken') || undefined;
      
      debugLog('REQUEST', `GET parameters [${requestId}]`, { 
        hasContent: !!content, 
        contentLength: content.length,
        hasAuthToken: !!authToken,
        authTokenLength: authToken?.length
      });
      
      if (!content) {
        debugLog('REQUEST', `GET request missing content [${requestId}]`);
        logStep('ERROR', 'No content provided in GET request');
        return new Response(
          JSON.stringify({ error: 'Content parameter is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!authToken) {
        debugLog('REQUEST', `GET request missing auth token [${requestId}]`);
        logStep('ERROR', 'No auth token provided in GET request');
        return new Response(
          JSON.stringify({ error: 'Authentication token is required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate the auth token
      const authResult = await validateAuthentication(authToken);
      if (!authResult.valid) {
        debugLog('REQUEST', `GET auth validation failed [${requestId}]`, { error: authResult.error });
        logStep('ERROR', 'Invalid auth token', { authError: authResult.error });
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      debugLog('REQUEST', `GET auth validation successful [${requestId}]`, { userId: authResult.user?.id });
      logStep('AUTH', 'User authenticated successfully', { userId: authResult.user?.id });
    } else if (req.method === 'POST') {
      debugLog('REQUEST', `Processing POST request [${requestId}]`);
      try {
        const body = await req.json();
        debugLog('REQUEST', `POST body received [${requestId}]`, { 
          bodyKeys: Object.keys(body || {}),
          hasContent: !!body?.content,
          hasAuthToken: !!body?.authToken,
          contentLength: body?.content?.length,
          authTokenLength: body?.authToken?.length
        });
        
        content = body.content || '';
        authToken = body.authToken || undefined;
        
        if (!content) {
          debugLog('REQUEST', `POST request missing content [${requestId}]`);
          logStep('ERROR', 'No content provided in POST body');
          return new Response(
            JSON.stringify({ error: 'Content field is required in request body' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!authToken) {
          debugLog('REQUEST', `POST request missing auth token [${requestId}]`);
          logStep('ERROR', 'No auth token provided in POST body');
          return new Response(
            JSON.stringify({ error: 'Authentication token is required in request body' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate the auth token for POST requests
        const authResult = await validateAuthentication(authToken);
        if (!authResult.valid) {
          debugLog('REQUEST', `POST auth validation failed [${requestId}]`, { error: authResult.error });
          logStep('ERROR', 'POST authentication validation failed', { error: authResult.error });
          return new Response(
            JSON.stringify({ error: 'Invalid authentication token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        debugLog('REQUEST', `POST auth validation successful [${requestId}]`, { userId: authResult.user?.id });
        logStep('AUTH', 'POST User authenticated successfully', { userId: authResult.user?.id });
      } catch (parseError: any) {
        debugLog('REQUEST', `POST body parsing failed [${requestId}]`, { error: parseError.message });
        logStep('ERROR', 'Failed to parse request body', { error: parseError.message });
        return new Response(
          JSON.stringify({ error: 'Invalid JSON in request body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      debugLog('REQUEST', `Unsupported method [${requestId}]`, { method: req.method });
      logStep('ERROR', 'Unsupported HTTP method', { method: req.method });
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    debugLog('REQUEST', `Request validation successful [${requestId}]`, { 
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      hasAuthToken: !!authToken
    });

    logStep('INPUT', 'Processing content', { 
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
    });

    // For GET requests (SSE), return streaming response
    if (req.method === 'GET') {
      debugLog('REQUEST', `Starting SSE response [${requestId}]`);
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      const stepTracker = new StepTracker(writer);
      
      // Start portfolio generation in background
      generatePortfolioWithSSE(content, stepTracker, writer)
        .finally(() => {
          debugLog('REQUEST', `SSE response completed [${requestId}]`);
          writer.close();
        });
      
      return new Response(readable, {
        status: 200,
        headers: sseHeaders
      });
    } 
    // For POST requests, return regular JSON response
    else {
      debugLog('REQUEST', `Starting JSON response [${requestId}]`);
      const stepTracker = new StepTracker();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      
      const results = await generatePortfolioWithSSE(content, stepTracker, writer);
      writer.close();
      
      // Ensure we have proper data structure for frontend
      const responseData = {
        status: results.status,
        steps: results.steps,
        errors: results.errors,
        warnings: results.warnings,
        data: {
          news: results.data.news || '',
          keywords: results.data.keywords || '',
          markets: results.data.markets || [],
          tradeIdeas: results.data.tradeIdeas || []
        }
      };
      
      debugLog('REQUEST', `JSON response prepared [${requestId}]`, {
        status: responseData.status,
        stepsCompleted: responseData.steps.filter(s => s.completed).length,
        totalSteps: responseData.steps.length,
        errorsCount: responseData.errors.length,
        marketsCount: responseData.data.markets.length,
        tradeIdeasCount: responseData.data.tradeIdeas.length
      });
      
      logStep('RESPONSE', 'Sending JSON response', {
        status: responseData.status,
        stepsCompleted: responseData.steps.filter(s => s.completed).length,
        totalSteps: responseData.steps.length,
        errorsCount: responseData.errors.length,
        marketsCount: responseData.data.markets.length,
        tradeIdeasCount: responseData.data.tradeIdeas.length
      });

      return new Response(
        JSON.stringify(responseData),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error: any) {
    debugLog('REQUEST', `Fatal error [${requestId}]`, { 
      error: error.message, 
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
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
