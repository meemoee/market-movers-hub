
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

  const processPortfolioResponse = (data: any) => {
    console.log('🔄 Processing portfolio response:', JSON.stringify(data, null, 2));
    
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
    console.log('🚀 === PORTFOLIO GENERATION START WITH EXTENSIVE DEBUG ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🔄 Is Retry:', isRetry);
    console.log('🎯 Retry Count:', retryCount);

    // SESSION DEBUGGING
    console.log('🔐 === COMPREHENSIVE SESSION ANALYSIS ===');
    console.log('📊 Session exists:', !!session);
    console.log('📊 Session object keys:', session ? Object.keys(session) : 'N/A');
    console.log('📊 Session data (full):', JSON.stringify(session, null, 2));
    console.log('📊 Has access token:', !!session?.access_token);
    console.log('📊 Token type:', typeof session?.access_token);
    console.log('📊 Token length:', session?.access_token?.length);
    console.log('📊 Token preview:', session?.access_token ? session.access_token.substring(0, 20) + '...' : 'N/A');
    console.log('📊 User ID:', session?.user?.id);
    console.log('📊 User email:', session?.user?.email);
    console.log('📊 Token expires at:', session?.expires_at);
    console.log('📊 Token expiry date:', session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A');
    console.log('📊 Is token expired:', session?.expires_at ? Date.now() / 1000 > session.expires_at : 'Unknown');

    // CONTENT DEBUGGING
    console.log('📝 === COMPREHENSIVE CONTENT ANALYSIS ===');
    console.log('📄 Content:', content);
    console.log('📄 Content type:', typeof content);
    console.log('📄 Content length:', content?.length);
    console.log('📄 Content is string:', typeof content === 'string');
    console.log('📄 Content is empty:', !content || content.trim().length === 0);
    console.log('📄 Content trimmed:', content?.trim());
    console.log('📄 Content first 50 chars:', content?.substring(0, 50));

    // AUTHENTICATION VALIDATION
    if (!session?.access_token) {
      console.error('❌ === AUTHENTICATION FAILURE ===');
      console.error('🔐 No access token available in session');
      console.error('🔐 Session state:', session);
      setError('Authentication required. Please sign in and try again.');
      return;
    }

    if (!content || content.trim().length === 0) {
      console.error('❌ === CONTENT VALIDATION FAILURE ===');
      console.error('📄 No content provided or content is empty');
      setError('Content is required for portfolio generation.');
      return;
    }

    if (!isRetry) {
      setRetryCount(0);
      setError(null);
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep(isRetry ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Starting portfolio generation...');
    
    cleanupConnections();

    try {
      console.log('🚀 === SUPABASE FUNCTION INVOCATION WITH EXPLICIT AUTH ===');
      
      const functionStartTime = Date.now();
      
      // Prepare the request body with explicit auth token
      const requestBody = { 
        content: content.trim(),
        authToken: session.access_token
      };
      
      console.log('📦 === COMPREHENSIVE REQUEST ANALYSIS ===');
      console.log('📦 Function Request Details:', {
        functionName: 'generate-portfolio',
        body: requestBody,
        bodyKeys: Object.keys(requestBody),
        contentLength: requestBody.content.length,
        hasAuthToken: !!requestBody.authToken,
        authTokenType: typeof requestBody.authToken,
        authTokenLength: requestBody.authToken?.length,
        authTokenPreview: requestBody.authToken ? requestBody.authToken.substring(0, 20) + '...' : 'N/A',
        sessionValid: !!session,
        timestamp: new Date().toISOString()
      });

      console.log('📡 === CALLING SUPABASE FUNCTION ===');
      console.log('📡 Supabase client exists:', !!supabase);
      console.log('📡 Supabase client functions exists:', !!supabase.functions);
      console.log('📡 About to invoke generate-portfolio function...');
      
      const { data, error } = await supabase.functions.invoke('generate-portfolio', {
        body: requestBody
      });
      
      const functionEndTime = Date.now();
      const functionDuration = functionEndTime - functionStartTime;
      
      console.log('📈 === COMPREHENSIVE FUNCTION RESPONSE ANALYSIS ===');
      console.log('📊 Function call duration:', functionDuration, 'ms');
      console.log('📊 Response has error:', !!error);
      console.log('📊 Response error type:', typeof error);
      console.log('📊 Response error:', error);
      console.log('📊 Response error message:', error?.message);
      console.log('📊 Response error details:', JSON.stringify(error, null, 2));
      console.log('📊 Response data exists:', !!data);
      console.log('📊 Response data type:', typeof data);
      console.log('📊 Response data keys:', data ? Object.keys(data) : 'N/A');
      console.log('📊 Response data (full):', JSON.stringify(data, null, 2));

      // Check for function invocation errors
      if (error) {
        console.error('❌ === COMPREHENSIVE FUNCTION INVOCATION ERROR ===');
        console.error('🔥 Function Error Object:', error);
        console.error('🔥 Error message:', error.message);
        console.error('🔥 Error name:', error.name);
        console.error('🔥 Error stack:', error.stack);
        console.error('🔥 Error details (full):', JSON.stringify(error, null, 2));
        console.error('🔥 Error type:', typeof error);
        console.error('🔥 Error constructor:', error.constructor?.name);
        throw new Error(`Function invocation failed: ${error.message}`);
      }

      // Check for data
      if (!data) {
        console.error('❌ === NO RESPONSE DATA ===');
        console.error('🔥 Function returned null/undefined data');
        console.error('🔥 Data value:', data);
        console.error('🔥 Data type:', typeof data);
        throw new Error('Function returned no data');
      }

      // Process the successful response
      console.log('✅ === PROCESSING SUCCESS RESPONSE ===');
      console.log('🎯 Response Data Structure Analysis:', {
        hasStatus: 'status' in data,
        hasSteps: 'steps' in data,
        hasData: 'data' in data,
        hasErrors: 'errors' in data,
        status: data.status,
        stepsCount: data.steps?.length,
        stepsArray: data.steps,
        dataKeys: data.data ? Object.keys(data.data) : [],
        dataObject: data.data,
        errorsCount: data.errors?.length,
        errorsArray: data.errors,
        warningsCount: data.warnings?.length,
        fullDataStructure: data
      });
      
      console.log('🔄 About to process portfolio response...');
      processPortfolioResponse(data);
      console.log('✅ Portfolio response processed successfully');

    } catch (error) {
      console.error('💥 === COMPREHENSIVE ERROR ANALYSIS ===');
      console.error('🔥 Error caught in try-catch block');
      console.error('🔥 Error type:', typeof error);
      console.error('🔥 Error instanceof Error:', error instanceof Error);
      console.error('🔥 Error constructor:', error?.constructor?.name);
      console.error('🔥 Error name:', error instanceof Error ? error.name : 'Unknown');
      console.error('🔥 Error message:', error instanceof Error ? error.message : String(error));
      console.error('🔥 Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('🔥 Full error object:', error);
      console.error('🔥 Error JSON:', JSON.stringify(error, null, 2));
      console.error('🔥 Error toString():', error?.toString());
      console.error('🔥 Is network error:', error instanceof TypeError);
      console.error('🔥 Is fetch error:', error instanceof Error && error.message.includes('fetch'));
      console.error('🔥 Is timeout error:', error instanceof Error && error.message.includes('timeout'));
      console.error('🔥 Is CORS error:', error instanceof Error && error.message.includes('cors'));
      console.error('🔥 Session at error time:', !!session?.access_token);
      console.error('🔥 Content at error time:', content?.length);
      console.error('🔥 Timestamp:', new Date().toISOString());
      
      handleRetry(error instanceof Error ? error.message : 'Unknown error occurred');
    }

    console.log('🏁 === PORTFOLIO GENERATION END ===');
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
