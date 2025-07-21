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

interface NetworkTestResult {
  test: string;
  passed: boolean;
  error?: string;
  details?: any;
  duration?: number;
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
  const [networkTests, setNetworkTests] = useState<NetworkTestResult[]>([]);
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

  const addNetworkTest = (result: NetworkTestResult) => {
    console.log(`🔍 NETWORK TEST: ${result.test} - ${result.passed ? 'PASSED' : 'FAILED'}`, result);
    setNetworkTests(prev => [...prev, result]);
  };

  const updateProgress = (percent: number, step: string) => {
    setProgress(percent);
    setCurrentStep(step);
    console.log(`📊 PROGRESS: ${percent}% - ${step}`);
  };

  // Phase 1: Basic connectivity and CORS testing
  const runConnectivityTests = async (authToken: string): Promise<boolean> => {
    console.log('🔍 === PHASE 1: CONNECTIVITY TESTS ===');
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    
    // Test 1: Basic URL reachability
    updateProgress(5, 'Testing basic connectivity...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      
      addNetworkTest({
        test: 'Basic Connectivity (HEAD)',
        passed: true,
        duration,
        details: { status: response.status, headers: Object.fromEntries(response.headers.entries()) }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'Basic Connectivity (HEAD)',
        passed: false,
        error: error.message,
        details: { errorType: error.name, stack: error.stack }
      });
      return false;
    }

    // Test 2: OPTIONS request (CORS preflight)
    updateProgress(10, 'Testing CORS preflight...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type, apikey'
        },
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      
      addNetworkTest({
        test: 'CORS Preflight (OPTIONS)',
        passed: response.ok,
        duration,
        details: { 
          status: response.status, 
          corsHeaders: {
            allowOrigin: response.headers.get('Access-Control-Allow-Origin'),
            allowMethods: response.headers.get('Access-Control-Allow-Methods'),
            allowHeaders: response.headers.get('Access-Control-Allow-Headers')
          }
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'CORS Preflight (OPTIONS)',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
    }

    // Test 3: Simple GET request
    updateProgress(15, 'Testing GET request...');
    try {
      const startTime = Date.now();
      const response = await fetch(`${functionUrl}?test=connectivity`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'Simple GET Request',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'Simple GET Request',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
    }

    return true;
  };

  // Phase 2: Authentication and header testing
  const runAuthenticationTests = async (authToken: string): Promise<boolean> => {
    console.log('🔍 === PHASE 2: AUTHENTICATION TESTS ===');
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    
    // Test 4: POST without auth
    updateProgress(20, 'Testing POST without auth...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: 'no-auth' }),
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'POST Without Auth',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'POST Without Auth',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
      return false;
    }

    // Test 5: POST with Bearer auth only
    updateProgress(25, 'Testing POST with Bearer auth...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ test: 'bearer-auth' }),
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'POST With Bearer Auth',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'POST With Bearer Auth',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
      return false;
    }

    // Test 6: POST with all headers
    updateProgress(30, 'Testing POST with full headers...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
          'x-client-info': 'lovable-project'
        },
        body: JSON.stringify({ test: 'full-headers' }),
        signal: AbortSignal.timeout(5000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'POST With Full Headers',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'POST With Full Headers',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
      return false;
    }

    return true;
  };

  // Phase 3: Request body testing
  const runRequestBodyTests = async (authToken: string): Promise<boolean> => {
    console.log('🔍 === PHASE 3: REQUEST BODY TESTS ===');
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    
    // Test 7: Small request body
    updateProgress(35, 'Testing small request body...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc'
        },
        body: JSON.stringify({ content: 'test' }),
        signal: AbortSignal.timeout(10000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'Small Request Body',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200)
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'Small Request Body',
        passed: false,
        error: error.message,
        details: { errorType: error.name }
      });
      return false;
    }

    // Test 8: Actual content (truncated for safety)
    updateProgress(40, 'Testing with actual content...');
    try {
      const startTime = Date.now();
      const truncatedContent = content.substring(0, 100); // Limit size for testing
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc'
        },
        body: JSON.stringify({ content: truncatedContent }),
        signal: AbortSignal.timeout(15000)
      });
      const duration = Date.now() - startTime;
      const responseText = await response.text();
      
      addNetworkTest({
        test: 'Actual Content Request',
        passed: true,
        duration,
        details: { 
          status: response.status, 
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200),
          contentLength: truncatedContent.length
        }
      });
    } catch (error: any) {
      addNetworkTest({
        test: 'Actual Content Request',
        passed: false,
        error: error.message,
        details: { errorType: error.name, contentLength: content.length }
      });
      return false;
    }

    return true;
  };

  // Phase 4: Full request testing
  const runFullRequestTest = async (authToken: string): Promise<PortfolioResults | null> => {
    console.log('🔍 === PHASE 4: FULL REQUEST TEST ===');
    const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
    
    updateProgress(50, 'Testing full portfolio request...');
    try {
      const startTime = Date.now();
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc',
          'x-client-info': 'lovable-project'
        },
        body: JSON.stringify({ content: content.trim() }),
        signal: AbortSignal.timeout(30000)
      });
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        const errorText = await response.text();
        addNetworkTest({
          test: 'Full Portfolio Request',
          passed: false,
          duration,
          error: `HTTP ${response.status}: ${errorText}`,
          details: { status: response.status, errorText }
        });
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      
      addNetworkTest({
        test: 'Full Portfolio Request',
        passed: true,
        duration,
        details: { 
          status: response.status,
          dataKeys: Object.keys(responseData),
          responseSize: JSON.stringify(responseData).length
        }
      });

      updateProgress(100, 'Portfolio generation complete!');
      return responseData;
      
    } catch (error: any) {
      addNetworkTest({
        test: 'Full Portfolio Request',
        passed: false,
        error: error.message,
        details: { errorType: error.name, stack: error.stack }
      });
      throw error;
    }
  };

  const generatePortfolio = async (isRetry = false) => {
    console.log('🚀 === STARTING COMPREHENSIVE NETWORK DEBUG ===');
    console.log('🚀 Timestamp:', new Date().toISOString());
    console.log('🚀 Is Retry:', isRetry);
    console.log('🚀 Content length:', content?.length);

    if (!content || content.trim().length === 0) {
      console.error('❌ No content provided');
      setError('Content is required for portfolio generation.');
      return;
    }

    if (!session?.access_token) {
      console.error('❌ No session or access token');
      setError('Authentication required. Please log in.');
      return;
    }

    if (!isRetry) {
      setRetryCount(0);
      setError(null);
      setNetworkTests([]);
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep(isRetry ? `Retrying... (${retryCount + 1}/${maxRetries})` : 'Starting network diagnostics...');
    
    cleanupConnections();

    try {
      const authToken = session.access_token;
      console.log('🔑 Auth token length:', authToken.length);

      // Run comprehensive network tests
      const phase1Success = await runConnectivityTests(authToken);
      if (!phase1Success) {
        throw new Error('Basic connectivity tests failed');
      }

      const phase2Success = await runAuthenticationTests(authToken);
      if (!phase2Success) {
        throw new Error('Authentication tests failed');
      }

      const phase3Success = await runRequestBodyTests(authToken);
      if (!phase3Success) {
        throw new Error('Request body tests failed');
      }

      // If all tests pass, try the full request
      const portfolioResults = await runFullRequestTest(authToken);
      
      if (portfolioResults) {
        setResults(portfolioResults);
        setError(null);
        
        toast({
          title: "Portfolio Generated Successfully",
          description: "All network tests passed and portfolio was generated!",
        });
      }

    } catch (error: any) {
      console.error('💥 === NETWORK DEBUG FAILED ===');
      console.error('💥 Error:', error.message);
      
      if (retryCount < maxRetries) {
        console.log(`⏰ Scheduling retry in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
        setRetryCount(prev => prev + 1);
        setCurrentStep(`Retrying in ${retryDelay / 1000} seconds...`);
        
        retryTimeoutRef.current = setTimeout(() => {
          generatePortfolio(true);
        }, retryDelay);
      } else {
        setIsGenerating(false);
        setError(`All network tests completed. Last error: ${error.message}`);
        setCurrentStep('Network diagnostics complete');
        
        toast({
          title: "Network Diagnostics Complete",
          description: "Check the test results below for detailed information.",
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
    setNetworkTests([]);
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
            Portfolio Generation - Network Diagnostics
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {!results && !isGenerating && !error && networkTests.length === 0 && (
            <div className="text-center py-4">
              <Button onClick={() => generatePortfolio(false)} className="w-full">
                Start Network Diagnostics & Generate Portfolio
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
                Run Diagnostics Again
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

          {/* Network Test Results */}
          {networkTests.length > 0 && (
            <Collapsible 
              open={expandedSections.has('network-tests')} 
              onOpenChange={() => toggleSection('network-tests')}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-transparent border border-white/10 rounded-lg hover:bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Network Test Results ({networkTests.length})</span>
                  <div className="flex gap-1">
                    <span className="text-xs text-green-400">
                      ✓ {networkTests.filter(t => t.passed).length}
                    </span>
                    <span className="text-xs text-red-400">
                      ✗ {networkTests.filter(t => !t.passed).length}
                    </span>
                  </div>
                </div>
                {expandedSections.has('network-tests') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
              
              <CollapsibleContent className="mt-2 space-y-2">
                {networkTests.map((test, index) => (
                  <div key={index} className={`p-3 border rounded-lg ${test.passed ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{test.test}</span>
                      <div className="flex items-center gap-2">
                        {test.duration && <span className="text-xs text-muted-foreground">{test.duration}ms</span>}
                        <span className={`text-xs ${test.passed ? 'text-green-400' : 'text-red-400'}`}>
                          {test.passed ? '✓ PASSED' : '✗ FAILED'}
                        </span>
                      </div>
                    </div>
                    {test.error && (
                      <div className="text-xs text-red-400 mb-2">{test.error}</div>
                    )}
                    {test.details && (
                      <div className="text-xs text-muted-foreground font-mono bg-black/20 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(test.details, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Results section - keep existing trade ideas display */}
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
