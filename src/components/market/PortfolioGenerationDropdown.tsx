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
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const { session } = useAuth();
  const { toast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalSteps = 8;
  const maxRetries = 3;
  const retryDelay = 2000;

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

  const addDebugLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}${data ? ` | DATA: ${JSON.stringify(data, null, 2)}` : ''}`;
    console.log(logEntry);
    setDebugLogs(prev => [...prev, logEntry]);
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
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  };

  const updateProgress = (percent: number, step: string) => {
    setProgress(percent);
    setCurrentStep(step);
    addDebugLog(`Progress: ${percent}% - ${step}`);
  };

  const debugAuthenticationDetails = async () => {
    addDebugLog("=== AUTHENTICATION DEBUG START ===");
    
    // Session details
    addDebugLog("Session from useAuth hook", {
      exists: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      accessTokenLength: session?.access_token?.length,
      refreshTokenLength: session?.refresh_token?.length,
      expiresAt: session?.expires_at,
      expiresIn: session?.expires_in,
      tokenType: session?.token_type
    });

    // Get fresh session
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      addDebugLog("Fresh session from supabase.auth.getSession()", {
        exists: !!sessionData.session,
        error: sessionError,
        userId: sessionData.session?.user?.id,
        email: sessionData.session?.user?.email,
        accessTokenLength: sessionData.session?.access_token?.length,
        tokenType: sessionData.session?.token_type,
        expiresAt: sessionData.session?.expires_at
      });

      // Compare tokens
      if (session && sessionData.session) {
        addDebugLog("Token comparison", {
          hookTokenMatchesFresh: session.access_token === sessionData.session.access_token,
          hookTokenPreview: session.access_token?.substring(0, 50) + '...',
          freshTokenPreview: sessionData.session.access_token?.substring(0, 50) + '...'
        });
      }
    } catch (error) {
      addDebugLog("Error getting fresh session", error);
    }

    // Test user validation
    try {
      const testToken = session?.access_token;
      if (testToken) {
        const { data: userData, error: userError } = await supabase.auth.getUser(testToken);
        addDebugLog("User validation with current token", {
          success: !!userData.user,
          error: userError,
          userId: userData.user?.id,
          email: userData.user?.email
        });
      }
    } catch (error) {
      addDebugLog("Error validating user", error);
    }

    addDebugLog("=== AUTHENTICATION DEBUG END ===");
  };

  const testMultipleAuthMethods = async (content: string) => {
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    const methods = [];

    // Method 1: Current session token in body
    if (session?.access_token) {
      methods.push({
        name: "Session token in body",
        payload: { 
          content: content.trim(),
          authToken: session.access_token
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
          'x-client-info': 'lovable-project'
        }
      });
    }

    // Method 2: Fresh session token
    try {
      const { data: freshSession } = await supabase.auth.getSession();
      if (freshSession.session?.access_token && freshSession.session.access_token !== session?.access_token) {
        methods.push({
          name: "Fresh session token in body",
          payload: { 
            content: content.trim(),
            authToken: freshSession.session.access_token
          },
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshSession.session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
            'x-client-info': 'lovable-project'
          }
        });
      }
    } catch (error) {
      addDebugLog("Failed to get fresh session for method 2", error);
    }

    // Method 3: Refreshed token
    try {
      const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshedSession.session?.access_token) {
        methods.push({
          name: "Refreshed token in body",
          payload: { 
            content: content.trim(),
            authToken: refreshedSession.session.access_token
          },
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshedSession.session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
            'x-client-info': 'lovable-project'
          }
        });
      }
    } catch (error) {
      addDebugLog("Failed to refresh session for method 3", error);
    }

    // Test each method
    for (const method of methods) {
      try {
        addDebugLog(`Testing method: ${method.name}`, {
          payloadKeys: Object.keys(method.payload),
          headerKeys: Object.keys(method.headers),
          authTokenLength: method.payload.authToken?.length,
          authTokenPreview: method.payload.authToken?.substring(0, 50) + '...'
        });

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: method.headers,
          body: JSON.stringify(method.payload),
          signal: AbortSignal.timeout(10000)
        });

        const responseText = await response.text();
        
        addDebugLog(`Response for ${method.name}`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          responsePreview: responseText.substring(0, 500),
          responseLength: responseText.length
        });

        if (response.ok) {
          addDebugLog(`SUCCESS: ${method.name} worked!`);
          try {
            const results = JSON.parse(responseText);
            return { success: true, results, method: method.name };
          } catch (parseError) {
            addDebugLog(`Parse error for successful response from ${method.name}`, parseError);
          }
        } else {
          addDebugLog(`FAILED: ${method.name} returned ${response.status}`);
        }

      } catch (error) {
        addDebugLog(`ERROR testing ${method.name}`, error);
      }
    }

    return { success: false };
  };

  const generatePortfolio = async (isRetry = false) => {
    addDebugLog("=== PORTFOLIO GENERATION START ===", {
      isRetry,
      retryCount,
      contentLength: content?.length,
      hasSession: !!session,
      timestamp: new Date().toISOString()
    });

    if (!content || content.trim().length === 0) {
      addDebugLog("ERROR: No content provided");
      setError('Content is required for portfolio generation.');
      return;
    }

    if (!session?.access_token) {
      addDebugLog("ERROR: No session or access token", {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token
      });
      setError('Authentication required. Please log in.');
      return;
    }

    if (!isRetry) {
      setRetryCount(0);
      setError(null);
      setDebugLogs([]);
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep(isRetry ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Starting portfolio generation...');
    
    cleanupConnections();

    try {
      // Get fresh session to ensure we have valid token
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const authToken = freshSession?.access_token || session.access_token;
      
      addDebugLog("Using auth token", {
        tokenLength: authToken?.length,
        tokenPreview: authToken?.substring(0, 50) + '...',
        isFreshToken: authToken === freshSession?.access_token
      });

      updateProgress(10, 'Connecting to portfolio service...');
      
      // Use SSE for streaming progress updates
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      const url = new URL(functionUrl);
      url.searchParams.set('content', content.trim());
      url.searchParams.set('authToken', authToken);
      
      addDebugLog("Starting SSE connection", {
        url: url.toString(),
        hasAuthToken: !!authToken
      });

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
          'x-client-info': 'lovable-project'
        },
        signal: AbortSignal.timeout(120000) // 2 minute timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        addDebugLog("SSE connection failed", {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResults = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            addDebugLog("SSE stream completed");
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              try {
                const parsed = JSON.parse(data);
                addDebugLog("Received SSE update", { 
                  status: parsed.status,
                  stepsCompleted: parsed.steps?.filter((s: any) => s.completed)?.length || 0,
                  totalSteps: parsed.steps?.length || 0
                });

                // Update progress based on completed steps
                const completedSteps = parsed.steps?.filter((s: any) => s.completed)?.length || 0;
                const currentTotalSteps = parsed.steps?.length || totalSteps;
                const progressPercent = Math.min(95, (completedSteps / currentTotalSteps) * 100);

                // Update current step based on last incomplete step
                const currentStepData = parsed.steps?.find((s: any) => !s.completed);
                const currentStepName = currentStepData ? stepNames[currentStepData.name] || currentStepData.name : 'Processing...';

                updateProgress(progressPercent, currentStepName);

                // Store final results when status is completed
                if (parsed.status === 'completed' || parsed.status === 'failed') {
                  finalResults = parsed;
                  updateProgress(100, parsed.status === 'completed' ? 'Portfolio generation complete!' : 'Generation failed');
                }
              } catch (parseError) {
                addDebugLog("Failed to parse SSE data", { data, error: parseError });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (finalResults) {
        if (finalResults.status === 'completed') {
          setResults(finalResults);
          setError(null);
          
          toast({
            title: "Portfolio Generated Successfully",
            description: `Generated ${finalResults.data?.tradeIdeas?.length || 0} trade ideas`,
          });
        } else {
          throw new Error(finalResults.errors?.[0]?.message || 'Portfolio generation failed');
        }
      } else {
        throw new Error('No final results received from stream');
      }

    } catch (error: any) {
      addDebugLog("Portfolio generation failed with error", {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      if (retryCount < maxRetries) {
        addDebugLog(`Scheduling retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`);
        setRetryCount(prev => prev + 1);
        setCurrentStep(`Retrying in ${retryDelay / 1000} seconds...`);
        
        retryTimeoutRef.current = setTimeout(() => {
          generatePortfolio(true);
        }, retryDelay);
      } else {
        setIsGenerating(false);
        setError(`Portfolio generation failed: ${error.message}`);
        setCurrentStep('Generation failed');
        
        addDebugLog("Max retries reached, giving up");
        
        toast({
          title: "Portfolio Generation Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    } finally {
      if (retryCount >= maxRetries || results) {
        setIsGenerating(false);
      }
    }
  };

  const handleManualRetry = () => {
    setRetryCount(0);
    setError(null);
    setResults(null);
    setDebugLogs([]);
    generatePortfolio(false);
  };

  useEffect(() => {
    return () => {
      cleanupConnections();
    };
  }, []);

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

          {debugLogs.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                <span className="font-medium text-sm">Debug Logs ({debugLogs.length})</span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-2">
                <div className="max-h-60 overflow-y-auto p-3 bg-black/20 rounded-lg font-mono text-xs">
                  {debugLogs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap mb-1 text-green-400">
                      {log}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {results && (
            <div className="space-y-4">
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
