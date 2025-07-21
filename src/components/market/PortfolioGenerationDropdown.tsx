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

  // STEP 1: Test Supabase Client Configuration
  const testSupabaseClient = async () => {
    console.log('🔧 === STEP 1: TESTING SUPABASE CLIENT ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      console.log('📊 Supabase client exists:', !!supabase);
      console.log('📊 Supabase client type:', typeof supabase);
      console.log('📊 Supabase client constructor:', supabase?.constructor?.name);
      console.log('📊 Supabase client keys:', Object.keys(supabase || {}));
      
      // Test basic Supabase functionality
      const { data: { session: testSession } } = await supabase.auth.getSession();
      console.log('📊 Test session retrieval successful:', !!testSession);
      console.log('📊 Test session user ID:', testSession?.user?.id);
      
      return true;
    } catch (error) {
      console.error('❌ STEP 1 FAILED - Supabase client test error:', error);
      return false;
    }
  };

  // STEP 2: Validate Authentication Deep Dive
  const validateAuthenticationDeep = async () => {
    console.log('🔐 === STEP 2: DEEP AUTHENTICATION VALIDATION ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      // Get fresh session
      const { data: { session: freshSession }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('📊 Fresh session retrieval error:', sessionError);
      console.log('📊 Fresh session exists:', !!freshSession);
      console.log('📊 Fresh session keys:', freshSession ? Object.keys(freshSession) : 'N/A');
      console.log('📊 Fresh session user:', freshSession?.user ? 'EXISTS' : 'MISSING');
      console.log('📊 Fresh session access_token exists:', !!freshSession?.access_token);
      console.log('📊 Fresh session access_token length:', freshSession?.access_token?.length);
      console.log('📊 Fresh session expires_at:', freshSession?.expires_at);
      console.log('📊 Fresh session token_type:', freshSession?.token_type);
      
      if (!freshSession?.access_token) {
        throw new Error('No access token available in fresh session');
      }
      
      // Test token validity
      const tokenPreview = freshSession.access_token.substring(0, 20) + '...';
      console.log('📊 Token preview:', tokenPreview);
      
      return freshSession;
    } catch (error) {
      console.error('❌ STEP 2 FAILED - Authentication validation error:', error);
      throw error;
    }
  };

  // STEP 3: Test Direct Fetch to Edge Function
  const testDirectFetch = async (authToken: string) => {
    console.log('🌐 === STEP 3: DIRECT FETCH TEST ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    
    try {
      console.log('📡 Function URL:', functionUrl);
      console.log('📡 Auth token length:', authToken.length);
      console.log('📡 Content length:', content.length);
      console.log('📡 Content preview:', content.substring(0, 50));
      
      // Test OPTIONS request first
      console.log('🔍 Testing OPTIONS request...');
      const optionsResponse = await fetch(functionUrl, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      });
      
      console.log('📊 OPTIONS response status:', optionsResponse.status);
      console.log('📊 OPTIONS response headers:', Object.fromEntries(optionsResponse.headers.entries()));
      
      if (!optionsResponse.ok) {
        console.error('❌ OPTIONS request failed');
        throw new Error(`OPTIONS request failed: ${optionsResponse.status}`);
      }
      
      // Test POST request
      console.log('🔍 Testing POST request...');
      const requestBody = {
        content: content.trim(),
        authToken: authToken
      };
      
      console.log('📦 Request body keys:', Object.keys(requestBody));
      console.log('📦 Request body content length:', requestBody.content.length);
      console.log('📦 Request body auth token length:', requestBody.authToken.length);
      
      const postResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📊 POST response status:', postResponse.status);
      console.log('📊 POST response ok:', postResponse.ok);
      console.log('📊 POST response headers:', Object.fromEntries(postResponse.headers.entries()));
      
      if (!postResponse.ok) {
        const errorText = await postResponse.text();
        console.error('❌ POST request failed');
        console.error('❌ Error response:', errorText);
        throw new Error(`POST request failed: ${postResponse.status} - ${errorText}`);
      }
      
      const responseData = await postResponse.json();
      console.log('✅ POST request successful');
      console.log('📊 Response data keys:', Object.keys(responseData));
      console.log('📊 Response data status:', responseData.status);
      
      return responseData;
    } catch (error) {
      console.error('❌ STEP 3 FAILED - Direct fetch error:', error);
      throw error;
    }
  };

  // STEP 4: Test Supabase Functions Invoke
  const testSupabaseFunctionsInvoke = async (authToken: string) => {
    console.log('⚡ === STEP 4: SUPABASE FUNCTIONS INVOKE TEST ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      console.log('📡 Testing supabase.functions.invoke...');
      console.log('📡 Auth token length:', authToken.length);
      
      const requestBody = {
        content: content.trim(),
        authToken: authToken
      };
      
      console.log('📦 Invoke request body:', requestBody);
      
      const { data, error } = await supabase.functions.invoke('generate-portfolio', {
        body: requestBody
      });
      
      console.log('📊 Invoke response data:', data);
      console.log('📊 Invoke response error:', error);
      
      if (error) {
        console.error('❌ Supabase functions invoke failed:', error);
        throw error;
      }
      
      console.log('✅ Supabase functions invoke successful');
      return data;
    } catch (error) {
      console.error('❌ STEP 4 FAILED - Supabase functions invoke error:', error);
      throw error;
    }
  };

  const generatePortfolio = async (isRetry = false) => {
    console.log('🚀 === PORTFOLIO GENERATION START WITH GRANULAR DEBUGGING ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🔄 Is Retry:', isRetry);
    console.log('🎯 Retry Count:', retryCount);

    if (!content || content.trim().length === 0) {
      console.error('❌ No content provided or content is empty');
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
      // STEP 1: Test Supabase Client
      setCurrentStep('Step 1: Testing Supabase client...');
      const clientOk = await testSupabaseClient();
      if (!clientOk) {
        throw new Error('Supabase client test failed');
      }
      setProgress(10);

      // STEP 2: Validate Authentication 
      setCurrentStep('Step 2: Validating authentication...');
      const validSession = await validateAuthenticationDeep();
      if (!validSession?.access_token) {
        throw new Error('Authentication validation failed');
      }
      setProgress(20);

      // STEP 3: Test Direct Fetch
      setCurrentStep('Step 3: Testing direct fetch...');
      try {
        const directFetchResult = await testDirectFetch(validSession.access_token);
        console.log('✅ Direct fetch worked! Processing result...');
        processPortfolioResponse(directFetchResult);
        return;
      } catch (directFetchError) {
        console.warn('⚠️ Direct fetch failed, trying Supabase functions invoke:', directFetchError);
        setProgress(30);
      }

      // STEP 4: Test Supabase Functions Invoke (fallback)
      setCurrentStep('Step 4: Testing Supabase functions invoke...');
      const invokeResult = await testSupabaseFunctionsInvoke(validSession.access_token);
      console.log('✅ Supabase functions invoke worked! Processing result...');
      processPortfolioResponse(invokeResult);

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
