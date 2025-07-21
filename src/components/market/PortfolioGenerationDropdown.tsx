import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Sparkle, TrendingUp, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { TradeIdeaCard } from "./TradeIdeaCard";

interface PortfolioStep {
  name: string;
  completed: boolean;
  timestamp?: string;
  details?: any;
}

interface TradeIdea {
  market_id: string;
  market_title: string;
  outcome: string;
  current_price: number;
  target_price: number;
  stop_price: number;
  rationale: string;
  image?: string;
}

interface PortfolioResults {
  status: string;
  steps: PortfolioStep[];
  errors: any[];
  warnings: any[];
  data: {
    news: string;
    keywords: string;
    markets: any[];
    tradeIdeas: TradeIdea[];
  };
}

interface PortfolioGenerationDropdownProps {
  content: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export function PortfolioGenerationDropdown({ 
  content, 
  isOpen, 
  onClose, 
  onOpenChange,
  buttonRef 
}: PortfolioGenerationDropdownProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<PortfolioResults | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['trades']));
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalSteps = 8; // Based on the edge function steps
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  const stepNames = {
    'auth_validation': 'Validating authentication',
    'news_summary': 'Fetching latest news',
    'keywords_extraction': 'Extracting keywords',
    'embedding_creation': 'Creating embeddings',
    'pinecone_search': 'Searching markets',
    'market_details': 'Fetching market data',
    'best_markets': 'Selecting best markets',
    'related_markets': 'Finding related markets',
    'trade_ideas': 'Generating trade ideas'
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const cleanupConnections = () => {
    if (eventSourceRef.current) {
      console.log('Closing existing SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const processPortfolioResponse = (data: any) => {
    console.log('🔄 Processing portfolio response:', data);
    
    // Check if it's a streaming response or direct response
    if (data.status === 'completed') {
      console.log('✅ Portfolio generation completed successfully');
      setResults(data);
      setProgress(100);
      setCurrentStep('Portfolio generation complete!');
      setIsGenerating(false);
      setError(null);
      
      toast({
        title: "Portfolio Generated",
        description: "Your portfolio has been successfully generated!",
      });
    } else if (data.steps) {
      // Process steps for progress updates
      const uniqueSteps = data.steps.reduce((acc: PortfolioStep[], step: PortfolioStep) => {
        const existingStepIndex = acc.findIndex(s => s.name === step.name);
        if (existingStepIndex >= 0) {
          acc[existingStepIndex] = step;
        } else {
          acc.push(step);
        }
        return acc;
      }, []);
      
      const completedSteps = uniqueSteps.filter((step: PortfolioStep) => step.completed).length;
      const progressPercent = Math.min(Math.round((completedSteps / totalSteps) * 100), 100);
      setProgress(progressPercent);
      
      const currentStepData = uniqueSteps.find((step: PortfolioStep) => !step.completed);
      if (currentStepData) {
        setCurrentStep(stepNames[currentStepData.name] || currentStepData.name);
      } else if (completedSteps === totalSteps) {
        setCurrentStep('Completing portfolio generation...');
      }
      
      // If processing but not complete, set final results
      if (data.status === 'completed') {
        setResults(data);
        setProgress(100);
        setCurrentStep('Portfolio generation complete!');
        setIsGenerating(false);
        setError(null);
        
        toast({
          title: "Portfolio Generated",
          description: "Your portfolio has been successfully generated!",
        });
      }
    } else if (data.error) {
      console.error('❌ Server error:', data.error);
      throw new Error(data.error);
    } else {
      // Fallback: treat as completed if we have data
      console.log('📋 Treating response as completed portfolio');
      setResults(data);
      setProgress(100);
      setCurrentStep('Portfolio generation complete!');
      setIsGenerating(false);
      setError(null);
      
      toast({
        title: "Portfolio Generated",
        description: "Your portfolio has been successfully generated!",
      });
    }
  };

  const generatePortfolio = async (isRetry = false) => {
    // COMPREHENSIVE DEBUGGING - START
    console.log('🚀 === PORTFOLIO GENERATION DIAGNOSTICS START ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🔄 Is Retry:', isRetry);
    console.log('🎯 Retry Count:', retryCount);
    
    // SESSION DEBUGGING
    console.log('🔐 === SESSION ANALYSIS ===');
    console.log('📊 Session State:', {
      hasSession: !!session,
      sessionType: typeof session,
      sessionKeys: session ? Object.keys(session) : [],
      hasAccessToken: !!session?.access_token,
      hasUser: !!session?.user,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      tokenExists: !!session?.access_token,
      tokenType: typeof session?.access_token,
      tokenLength: session?.access_token?.length,
      tokenPrefix: session?.access_token?.substring(0, 30) + '...',
      sessionExpiresAt: session?.expires_at,
      sessionExpired: session?.expires_at ? Date.now() / 1000 > session.expires_at : 'unknown',
      refreshToken: !!session?.refresh_token,
      fullSessionStructure: JSON.stringify(session, null, 2)
    });

    // ENVIRONMENT DEBUGGING
    console.log('🌍 === ENVIRONMENT ANALYSIS ===');
    console.log('🌐 Browser Environment:', {
      userAgent: navigator.userAgent,
      onlineStatus: navigator.onLine,
      currentURL: window.location.href,
      origin: window.location.origin,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      port: window.location.port,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      referrer: document.referrer,
      cookieEnabled: navigator.cookieEnabled,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      connection: (navigator as any).connection ? {
        effectiveType: (navigator as any).connection.effectiveType,
        downlink: (navigator as any).connection.downlink,
        rtt: (navigator as any).connection.rtt
      } : 'not available'
    });

    // CONTENT DEBUGGING
    console.log('📝 === CONTENT ANALYSIS ===');
    console.log('📄 Request Content:', {
      content: content,
      contentType: typeof content,
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 200) + (content?.length > 200 ? '...' : ''),
      isEmpty: !content || content.trim().length === 0,
      isString: typeof content === 'string',
      hasSpecialChars: /[^\w\s]/.test(content || ''),
      wordCount: content?.split(/\s+/).length || 0,
      lineCount: content?.split('\n').length || 0,
      encoding: new TextEncoder().encode(content || '').length,
      rawContent: JSON.stringify(content)
    });

    // AUTHENTICATION VALIDATION
    if (!session?.access_token) {
      console.error('❌ === AUTHENTICATION FAILURE ===');
      console.error('🔐 No access token available');
      console.error('📊 Session dump:', session);
      console.error('🧪 Session test:', {
        sessionExists: !!session,
        sessionIsObject: typeof session === 'object',
        sessionIsNull: session === null,
        sessionIsUndefined: session === undefined,
        hasAccessToken: session && 'access_token' in session,
        accessTokenValue: session?.access_token,
        accessTokenType: typeof session?.access_token
      });
      setError('Authentication required. Please sign in and try again.');
      return;
    }

    if (!isRetry) {
      setRetryCount(0);
      setError(null);
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep(isRetry ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Connecting to portfolio service...');
    
    // Clean up any existing connections
    cleanupConnections();

    try {
      console.log('🚀 === DIRECT FETCH IMPLEMENTATION ===');
      
      const requestStartTime = Date.now();
      
      // Construct the full URL for the edge function
      const functionUrl = `https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio`;
      
      console.log('🌐 Request Configuration:', {
        method: 'POST',
        url: functionUrl,
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(7)
      });

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
        'x-client-info': 'lovable-project'
      };

      console.log('📋 Request Headers:', {
        'Content-Type': headers['Content-Type'],
        'Authorization': `Bearer ${session.access_token.substring(0, 20)}...`,
        'apikey': `${headers.apikey.substring(0, 20)}...`,
        'x-client-info': headers['x-client-info'],
        authTokenLength: session.access_token.length,
        authTokenStart: session.access_token.substring(0, 50),
        fullHeaders: headers
      });

      // Prepare request body
      const requestBody = { content };
      const bodyString = JSON.stringify(requestBody);
      
      console.log('📦 Request Body:', {
        body: requestBody,
        bodyString: bodyString,
        bodyLength: bodyString.length,
        bodySize: new Blob([bodyString]).size,
        serialized: JSON.stringify(requestBody, null, 2)
      });

      // Network diagnostics before request
      console.log('🔍 === PRE-REQUEST NETWORK DIAGNOSTICS ===');
      try {
        const testResponse = await fetch(window.location.origin, { method: 'HEAD' });
        console.log('✅ Basic connectivity test:', {
          status: testResponse.status,
          ok: testResponse.ok,
          headers: Object.fromEntries(testResponse.headers.entries())
        });
      } catch (netError) {
        console.error('❌ Basic connectivity test failed:', netError);
      }

      // Test CORS preflight
      try {
        const corsResponse = await fetch(functionUrl, { 
          method: 'OPTIONS',
          headers: {
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization,apikey'
          }
        });
        console.log('🔄 CORS preflight test:', {
          status: corsResponse.status,
          ok: corsResponse.ok,
          headers: Object.fromEntries(corsResponse.headers.entries())
        });
      } catch (corsError) {
        console.error('❌ CORS preflight failed:', corsError);
      }

      // Make the actual request
      console.log('📡 === MAKING ACTUAL REQUEST ===');
      console.log('⏰ Request start time:', new Date().toISOString());
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: headers,
        body: bodyString
      });
      
      const requestEndTime = Date.now();
      const requestDuration = requestEndTime - requestStartTime;
      
      console.log('📈 === RESPONSE ANALYSIS ===');
      console.log('📊 Response Metrics:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        type: response.type,
        url: response.url,
        redirected: response.redirected,
        requestDuration: requestDuration,
        responseTime: `${requestDuration}ms`,
        headers: Object.fromEntries(response.headers.entries()),
        bodyUsed: response.bodyUsed,
        size: response.headers.get('content-length')
      });

      // Check response status
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ === HTTP ERROR RESPONSE ===');
        console.error('🔥 Response Error Details:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url,
          requestDuration: requestDuration
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      // Parse response
      console.log('🔄 === PARSING RESPONSE ===');
      const responseText = await response.text();
      console.log('📄 Raw Response:', {
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''),
        fullResponse: responseText
      });

      let responseData;
      try {
        responseData = JSON.parse(responseText);
        console.log('✅ JSON Parsing Success:', {
          dataType: typeof responseData,
          dataKeys: responseData && typeof responseData === 'object' ? Object.keys(responseData) : [],
          hasStatus: 'status' in (responseData || {}),
          hasData: 'data' in (responseData || {}),
          hasSteps: 'steps' in (responseData || {}),
          hasErrors: 'errors' in (responseData || {}),
          parsedData: responseData
        });
      } catch (parseError) {
        console.error('❌ JSON Parsing Failed:', {
          error: parseError,
          responseText: responseText,
          parseErrorMessage: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
        });
        throw new Error(`Failed to parse JSON response: ${parseError}`);
      }

      // Process the successful response
      console.log('✅ === PROCESSING SUCCESS RESPONSE ===');
      console.log('🎯 Final Response Data:', responseData);
      
      processPortfolioResponse(responseData);

    } catch (error) {
      console.error('💥 === COMPREHENSIVE ERROR ANALYSIS ===');
      console.error('🔥 Error Details:', {
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        fullError: error,
        isNetworkError: error instanceof TypeError,
        isFetchError: error instanceof Error && error.message.includes('fetch'),
        isTimeoutError: error instanceof Error && error.message.includes('timeout'),
        isAbortError: error instanceof Error && error.message.includes('abort'),
        isCorsError: error instanceof Error && error.message.includes('cors'),
        timestamp: new Date().toISOString(),
        retryAttempt: retryCount
      });
      
      // Additional network debugging on error
      console.log('🔍 === POST-ERROR DIAGNOSTICS ===');
      console.log('🌐 Network State:', {
        onlineStatus: navigator.onLine,
        connectionType: (navigator as any).connection?.effectiveType || 'unknown',
        sessionStillValid: !!session?.access_token,
        tokenExpired: session?.expires_at ? Date.now() / 1000 > session.expires_at : 'unknown',
        currentTimestamp: new Date().toISOString()
      });
      
      handleRetry(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    console.log('🏁 === PORTFOLIO GENERATION DIAGNOSTICS END ===');
  };

  const handleRetry = (errorMessage: string) => {
    console.log(`🔄 Portfolio generation failed: ${errorMessage}`);
    
    if (retryCount < maxRetries) {
      console.log(`⏰ Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      setCurrentStep(`Retrying in ${retryDelay / 1000} seconds...`);
      
      retryTimeoutRef.current = setTimeout(() => {
        generatePortfolio(true);
      }, retryDelay);
    } else {
      console.log('❌ Max retries reached, giving up');
      setIsGenerating(false);
      setError(`Failed after ${maxRetries} attempts: ${errorMessage}`);
      setCurrentStep('Generation failed');
      
      toast({
        title: "Portfolio Generation Failed",
        description: `Failed after ${maxRetries} attempts. Please try again.`,
        variant: "destructive"
      });
    }
  };

  const handleManualRetry = () => {
    setRetryCount(0);
    setError(null);
    setResults(null);
    generatePortfolio(false);
  };

  useEffect(() => {
    return () => {
      cleanupConnections();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="w-full mt-2 animate-in slide-in-from-top-2 duration-200"
    >
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkle className="h-5 w-5 text-primary" />
            Portfolio Generation
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {!results && !isGenerating && !error && (
            <div className="text-center py-4">
              <Button onClick={() => generatePortfolio(false)} className="w-full">
                Generate Portfolio
              </Button>
            </div>
          )}

          {error && !isGenerating && (
            <div className="text-center py-4 space-y-3">
              <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
                {error}
              </div>
              <Button onClick={handleManualRetry} className="w-full" variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}

          {isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{currentStep}</span>
                <span className="text-sm font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
              {retryCount > 0 && (
                <div className="text-xs text-muted-foreground text-center">
                  Attempt {retryCount + 1} of {maxRetries + 1}
                </div>
              )}
            </div>
          )}

          {results && (
            <div className="space-y-4">
              {/* Trade Ideas Section */}
              <Collapsible 
                open={expandedSections.has('trades')} 
                onOpenChange={() => toggleSection('trades')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    <span className="font-medium">Trade Ideas ({results.data.tradeIdeas?.length || 0})</span>
                  </div>
                  {expandedSections.has('trades') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-2 space-y-3">
                  {results.data.tradeIdeas?.map((trade, index) => (
                    <TradeIdeaCard
                      key={index}
                      trade={trade}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* News Summary Section */}
              {results.data.news && (
                <Collapsible 
                  open={expandedSections.has('news')} 
                  onOpenChange={() => toggleSection('news')}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                    <span className="font-medium text-sm">News Summary</span>
                    {expandedSections.has('news') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">{results.data.news}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Keywords Section */}
              {results.data.keywords && (
                <Collapsible 
                  open={expandedSections.has('keywords')} 
                  onOpenChange={() => toggleSection('keywords')}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                    <span className="font-medium text-sm">Keywords</span>
                    {expandedSections.has('keywords') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">{results.data.keywords}</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Markets Section */}
              {results.data.markets && results.data.markets.length > 0 && (
                <Collapsible 
                  open={expandedSections.has('markets')} 
                  onOpenChange={() => toggleSection('markets')}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                    <span className="font-medium text-sm">Related Markets ({results.data.markets.length})</span>
                    {expandedSections.has('markets') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-2">
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {results.data.markets.slice(0, 10).map((market, index) => (
                        <div key={index} className="p-2 border border-border rounded text-xs">
                          <div className="font-medium line-clamp-1">{market.question}</div>
                          <div className="text-muted-foreground">
                            Yes: {(market.yes_price * 100).toFixed(0)}¢ | No: {(market.no_price * 100).toFixed(0)}¢
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
