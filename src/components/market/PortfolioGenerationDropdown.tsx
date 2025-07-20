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
    // EXTENSIVE DEBUGGING - RAW INFO
    console.log('=== PORTFOLIO GENERATION DEBUG START ===');
    console.log('Session state:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      hasUser: !!session?.user,
      sessionKeys: session ? Object.keys(session) : [],
      userEmail: session?.user?.email,
      tokenLength: session?.access_token?.length
    });
    
    if (!session?.access_token) {
      console.error('❌ No authentication token available');
      console.log('Raw session object:', session);
      setError('Authentication required. Please sign in and try again.');
      return;
    }

    if (!isRetry) {
      setRetryCount(0);
      setError(null);
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep(isRetry ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Starting portfolio generation...');
    
    // Clean up any existing connections
    cleanupConnections();

    try {
      console.log('✅ Starting portfolio generation...');
      console.log('Content to send:', {
        content: content,
        contentLength: content.length,
        contentPreview: content.substring(0, 100) + '...'
      });
      
      setCurrentStep('Connecting to portfolio service...');
      
      // Get the project URL for direct calls
      const projectUrl = 'https://lfmkoismabbhujycnqpn.supabase.co';
      console.log('Project URL:', projectUrl);
      
      // Method 1: Try standard supabase.functions.invoke (simplified)
      console.log('🔄 Attempting Method 1: Standard supabase.functions.invoke...');
      
      const invokeStartTime = Date.now();
      const { data, error } = await supabase.functions.invoke('generate-portfolio', {
        body: { content }
      });
      const invokeEndTime = Date.now();
      
      console.log('📊 supabase.functions.invoke result:', {
        success: !error,
        error: error,
        data: data,
        responseTime: invokeEndTime - invokeStartTime,
        dataType: typeof data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : null
      });

      if (error) {
        console.error('❌ Supabase function error:', error);
        console.log('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          context: error.context
        });
        
        // Try alternative method with direct fetch
        console.log('🔄 Trying Method 2: Direct fetch...');
        
        const fetchUrl = `${projectUrl}/functions/v1/generate-portfolio`;
        console.log('Fetch URL:', fetchUrl);
        
        const fetchOptions = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc'
          },
          body: JSON.stringify({ content })
        };
        
        console.log('Fetch options:', {
          method: fetchOptions.method,
          headers: fetchOptions.headers,
          bodyLength: fetchOptions.body.length
        });
        
        const fetchStartTime = Date.now();
        const response = await fetch(fetchUrl, fetchOptions);
        const fetchEndTime = Date.now();
        
        console.log('📊 Direct fetch result:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          responseTime: fetchEndTime - fetchStartTime
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Fetch failed:', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText
          });
          throw new Error(`Direct fetch failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const fetchData = await response.json();
        console.log('✅ Direct fetch data:', fetchData);
        
        // Use the fetch data instead
        if (fetchData) {
          console.log('Using fetch data as response');
          processPortfolioResponse(fetchData);
          return;
        } else {
          throw new Error(`Portfolio generation failed: ${error.message}`);
        }
      }

      // Handle the successful response from supabase.functions.invoke
      if (data) {
        console.log('✅ Received portfolio data from supabase.functions.invoke:', data);
        processPortfolioResponse(data);
      } else {
        console.log('⚠️ No data received from supabase.functions.invoke, but no error either');
        throw new Error('No data received from portfolio service');
      }

    } catch (error) {
      console.error('Error in generatePortfolio:', error);
      handleRetry(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleRetry = (errorMessage: string) => {
    console.log(`Portfolio generation failed: ${errorMessage}`);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      setCurrentStep(`Retrying in ${retryDelay / 1000} seconds...`);
      
      retryTimeoutRef.current = setTimeout(() => {
        generatePortfolio(true);
      }, retryDelay);
    } else {
      console.log('Max retries reached, giving up');
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
