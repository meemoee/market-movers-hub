import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Sparkle, TrendingUp, DollarSign, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

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

  const generatePortfolio = async (isRetry = false) => {
    if (!session?.access_token) {
      console.error('No authentication token available');
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
      // First make the POST request to initiate
      console.log('Initiating portfolio generation...');
      const { error: postError } = await supabase.functions.invoke('generate-portfolio', {
        body: { content }
      });

      if (postError) {
        console.error('Error initiating portfolio generation:', postError);
        throw new Error(`Failed to start generation: ${postError.message}`);
      }

      // Wait a moment for the server to process the request
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Then start SSE connection for real-time updates
      const authToken = session.access_token;
      const encodedContent = encodeURIComponent(content);
      const eventSourceUrl = `https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio?content=${encodedContent}&authToken=${authToken}`;
      
      console.log('Starting SSE connection to:', eventSourceUrl);
      
      const eventSource = new EventSource(eventSourceUrl);
      eventSourceRef.current = eventSource;

      // Set a timeout for the entire operation
      const connectionTimeout = setTimeout(() => {
        console.log('SSE connection timeout');
        eventSource.close();
        handleRetry('Connection timeout');
      }, 60000); // 60 second timeout

      eventSource.onopen = () => {
        console.log('SSE connection opened successfully');
        setCurrentStep('Connected - generating portfolio...');
        clearTimeout(connectionTimeout);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received SSE data:', data);
          
          if (data.status === 'completed') {
            console.log('Portfolio generation completed successfully');
            setResults(data);
            setProgress(100);
            setCurrentStep('Portfolio generation complete!');
            setIsGenerating(false);
            setError(null);
            eventSource.close();
            clearTimeout(connectionTimeout);
            
            toast({
              title: "Portfolio Generated",
              description: "Your portfolio has been successfully generated!",
            });
          } else if (data.steps) {
            // Get unique completed steps by removing duplicates based on step name
            const uniqueSteps = data.steps.reduce((acc: PortfolioStep[], step: PortfolioStep) => {
              const existingStepIndex = acc.findIndex(s => s.name === step.name);
              if (existingStepIndex >= 0) {
                // Update existing step with latest data
                acc[existingStepIndex] = step;
              } else {
                // Add new step
                acc.push(step);
              }
              return acc;
            }, []);
            
            // Update progress based on unique completed steps
            const completedSteps = uniqueSteps.filter((step: PortfolioStep) => step.completed).length;
            const progressPercent = Math.min(Math.round((completedSteps / totalSteps) * 100), 100);
            setProgress(progressPercent);
            
            // Find the current step (first incomplete step)
            const currentStepData = uniqueSteps.find((step: PortfolioStep) => !step.completed);
            if (currentStepData) {
              setCurrentStep(stepNames[currentStepData.name] || currentStepData.name);
            } else if (completedSteps === totalSteps) {
              setCurrentStep('Completing portfolio generation...');
            }
          } else if (data.error) {
            console.error('Server error:', data.error);
            eventSource.close();
            clearTimeout(connectionTimeout);
            handleRetry(data.error);
          }
        } catch (parseError) {
          console.error('Error parsing SSE data:', parseError);
          // Don't retry on parse errors, they're usually not recoverable
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error occurred:', error);
        eventSource.close();
        clearTimeout(connectionTimeout);
        
        // Check if the connection was just closed normally
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('SSE connection closed');
          return;
        }
        
        handleRetry('Connection error');
      };

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
                
                <CollapsibleContent className="mt-2 space-y-2">
                  {results.data.tradeIdeas?.map((trade, index) => (
                    <div key={index} className="p-3 border border-border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm line-clamp-2">{trade.market_title}</h4>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span>Outcome: {trade.outcome}</span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              Current: {(trade.current_price * 100).toFixed(0)}¢
                            </span>
                            <span>Target: {(trade.target_price * 100).toFixed(0)}¢</span>
                            {trade.stop_price && (
                              <span>Stop: {(trade.stop_price * 100).toFixed(0)}¢</span>
                            )}
                          </div>
                        </div>
                        {trade.image && (
                          <img 
                            src={trade.image} 
                            alt={trade.market_title}
                            className="w-10 h-10 rounded object-cover flex-shrink-0 ml-2"
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{trade.rationale}</p>
                    </div>
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
