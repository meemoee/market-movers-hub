import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Loader2, CheckCircle, XCircle, AlertCircle, ImageIcon, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useJobLogger } from "@/hooks/research/useJobLogger";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";
import { useIsMobile } from '@/hooks/use-mobile';

interface TradeIdea {
  market_id: string;
  market_title: string;
  outcome: string;
  current_price: number;
  target_price: number;
  stop_price: number;
  rationale: string;
  image?: string | null;
}

interface RelatedMarket {
  id: string;
  question: string;
  yes_price: number;
  no_price: number;
  last_traded_price: number;
  volume: number;
}

interface Market {
  market_id: string;
  event_id: string;
  event_title: string;
  question: string;
  description?: string;
  image?: string;
  yes_price: number;
  no_price: number;
  related_markets: RelatedMarket[];
}

interface PortfolioGeneratorDropdownProps {
  content: string;
  onGenerateClick?: () => void;
  className?: string;
}

interface PortfolioResults {
  status: string;
  steps: Array<{
    name: string;
    completed: boolean;
    timestamp: string;
    details?: any;
  }>;
  errors: Array<{
    step: string;
    message: string;
    timestamp: string;
    details?: any;
  }>;
  warnings: Array<{
    step: string;
    message: string;
    timestamp: string;
  }>;
  data: {
    news: string;
    keywords: string;
    markets: Market[];
    tradeIdeas: TradeIdea[];
  }
}

const STEP_DESCRIPTIONS: Record<string, string> = {
  'fetch_news': 'Analyzing market news and trends',
  'extract_keywords': 'Extracting key investment themes',
  'search_markets': 'Searching for relevant prediction markets',
  'analyze_markets': 'Analyzing market opportunities',
  'generate_ideas': 'Generating trade recommendations',
  'validate_results': 'Validating portfolio suggestions'
};

export function PortfolioGeneratorDropdown({
  content,
  onGenerateClick,
  className
}: PortfolioGeneratorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<string[]>([]);
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ideas');
  const [completedSteps, setCompletedSteps] = useState<Record<string, any>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { logUpdate } = useJobLogger('PortfolioGeneratorDropdown');
  const isMobile = useIsMobile();

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleGenerateClick = async () => {
    if (!content.trim()) {
      toast({
        title: "No content provided",
        description: "Please share your market insight before generating a portfolio",
        variant: "destructive"
      });
      return;
    }

    if (onGenerateClick) {
      onGenerateClick();
    }
    
    setIsOpen(true);
    setIsGenerating(true);
    setError('');
    setProgress(0);
    setCurrentStep('Initializing...');
    setCompletedSteps({});
    setExpandedSteps([]);
    
    await generatePortfolio(content);
  };

  const toggleStepExpansion = (stepName: string) => {
    setExpandedSteps(prev => 
      prev.includes(stepName) 
        ? prev.filter(s => s !== stepName)
        : [...prev, stepName]
    );
  };

  const updateProgressFromSteps = (steps: any[]) => {
    if (!steps || steps.length === 0) return;
    
    const totalSteps = Object.keys(STEP_DESCRIPTIONS).length;
    const completedCount = steps.filter(step => step.completed).length;
    const progressPercentage = Math.min(Math.round((completedCount / totalSteps) * 100), 95);
    
    setProgress(progressPercentage);
    
    // Update current step description
    const currentStepObj = steps.find(step => !step.completed) || steps[steps.length - 1];
    if (currentStepObj) {
      const description = STEP_DESCRIPTIONS[currentStepObj.name] || currentStepObj.name.replace(/_/g, ' ');
      setCurrentStep(description);
    }
    
    // Store completed steps data
    const completed: Record<string, any> = {};
    steps.forEach(step => {
      if (step.completed && step.details) {
        completed[step.name] = step.details;
      }
    });
    setCompletedSteps(completed);
  };

  const generatePortfolio = async (content: string) => {
    try {
      logUpdate('info', `Starting portfolio generation for: ${content.substring(0, 30)}...`);
      
      // Get the current session to retrieve the auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
      if (!authToken) {
        setError('Authentication required. Please sign in to use this feature.');
        setIsGenerating(false);
        toast({
          title: "Authentication required",
          description: "Please sign in to generate portfolios",
          variant: "destructive"
        });
        return;
      }

      // Clean up any existing fetch request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      
      // First make a POST request to start the generation process
      setCurrentStep('Initializing portfolio generation...');
      const initResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ content })
      });
      
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        throw new Error(`Failed to start portfolio generation: ${errorText}`);
      }
      
      // Now make the actual request to generate the portfolio
      abortControllerRef.current = new AbortController();
      const portfolioUrl = `${functionUrl}?content=${encodeURIComponent(content)}`;
      
      logUpdate('info', `Making request to: ${portfolioUrl}`);
      setProgress(10);
      
      const portfolioResponse = await fetch(portfolioUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal
      });
      
      if (!portfolioResponse.ok) {
        const errorText = await portfolioResponse.text();
        logUpdate('error', `Portfolio generation failed: ${errorText}`);
        throw new Error(`Portfolio generation failed: ${errorText}`);
      }
      
      const results: PortfolioResults = await portfolioResponse.json();
      logUpdate('info', `Received portfolio results with status: ${results.status}`);
      
      // Process errors if any
      if (results.errors && results.errors.length > 0) {
        results.errors.forEach(err => {
          logUpdate('error', `Error in ${err.step}: ${err.message}`);
        });
        
        // Only set error if we have no data
        if (!results.data.markets.length && !results.data.tradeIdeas.length) {
          setError(results.errors.map(e => `${e.step}: ${e.message}`).join('\n'));
        }
      }
      
      // Process all steps
      if (results.steps && results.steps.length > 0) {
        updateProgressFromSteps(results.steps);
      }
      
      // Set data
      if (results.data) {
        setNews(results.data.news || '');
        setKeywords(results.data.keywords || '');
        setMarkets(results.data.markets || []);
        setTradeIdeas(results.data.tradeIdeas || []);
      }
      
      if (results.status === 'completed') {
        setCurrentStep('Portfolio generation complete!');
        setProgress(100);
      } else {
        setCurrentStep('Portfolio generation completed with some issues');
        setProgress(100);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logUpdate('error', `Portfolio generation error: ${errorMessage}`);
      console.error('Portfolio generation error:', error);
      setError(errorMessage);
      setCurrentStep('Generation failed');
      
      toast({
        title: "Portfolio Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      {/* Generate Portfolio Button */}
      <Button
        onClick={handleGenerateClick}
        disabled={isGenerating || !content.trim()}
        variant="ghost"
        size="sm"
        className="h-7 px-3 text-xs font-medium rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center gap-1"
      >
        {isMobile ? (
          <Sparkles className="h-3 w-3" />
        ) : (
          <>
            Generate portfolio
            <Sparkles className="h-3 w-3" />
          </>
        )}
        {isOpen && !isMobile ? (
          <ChevronUp className="h-3 w-3 ml-1" />
        ) : !isMobile ? (
          <ChevronDown className="h-3 w-3 ml-1" />
        ) : null}
      </Button>

      {/* Dropdown Content */}
      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-[min(500px,calc(100vw-2rem))] max-h-[600px] bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg z-[1000] overflow-hidden">
          {/* Progress Section */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : error && !markets.length && !tradeIdeas.length ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : progress === 100 ? (
                  <CheckCircle className="h-4 w-4 text-primary" />
                ) : null}
                <span className="text-sm font-medium">{currentStep}</span>
              </div>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            
            {/* Expandable Steps */}
            {Object.keys(completedSteps).length > 0 && (
              <div className="mt-3 space-y-1">
                {Object.entries(completedSteps).map(([step, data]) => (
                  <div key={step} className="text-xs">
                    <button
                      onClick={() => toggleStepExpansion(step)}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span>{STEP_DESCRIPTIONS[step] || step}</span>
                      {expandedSteps.includes(step) ? 
                        <ChevronUp className="h-3 w-3" /> : 
                        <ChevronDown className="h-3 w-3" />
                      }
                    </button>
                    {expandedSteps.includes(step) && (
                      <div className="ml-4 mt-1 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && !markets.length && !tradeIdeas.length && (
            <div className="p-4 bg-destructive/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Results Tabs */}
          {(tradeIdeas.length > 0 || markets.length > 0) && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
              <TabsList className="w-full justify-start rounded-none border-b">
                <TabsTrigger value="ideas">
                  Trade Ideas ({tradeIdeas.length})
                </TabsTrigger>
                <TabsTrigger value="markets">
                  Markets ({markets.length})
                </TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="h-[400px]">
                <TabsContent value="ideas" className="p-4 space-y-3">
                  {tradeIdeas.map((idea, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded overflow-hidden flex-shrink-0">
                          {idea.image ? (
                            <img 
                              src={idea.image} 
                              alt={idea.market_title}
                              className="object-cover w-full h-full" 
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{idea.market_title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'} className="text-xs">
                              {idea.outcome}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ${idea.current_price.toFixed(2)} → ${idea.target_price.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {idea.rationale}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </TabsContent>
                
                <TabsContent value="markets" className="p-4 space-y-3">
                  {markets.map((market, i) => (
                    <Card key={i} className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded overflow-hidden flex-shrink-0">
                          {market.image ? (
                            <img 
                              src={market.image} 
                              alt={market.question} 
                              className="object-cover w-full h-full" 
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm">{market.event_title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {market.question}
                          </p>
                          <div className="flex gap-3 mt-2 text-xs">
                            <span>Yes: ${market.yes_price?.toFixed(2) || 'N/A'}</span>
                            <span>No: ${market.no_price?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </TabsContent>
                
                <TabsContent value="analysis" className="p-4 space-y-4">
                  <div>
                    <h3 className="font-medium text-sm mb-2">Your Insight</h3>
                    <p className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3">
                      {content}
                    </p>
                  </div>
                  
                  {news && (
                    <div>
                      <h3 className="font-medium text-sm mb-2">Market Context</h3>
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/50 pl-3">
                        {news}
                      </p>
                    </div>
                  )}
                  
                  {keywords && (
                    <div>
                      <h3 className="font-medium text-sm mb-2">Key Concepts</h3>
                      <div className="flex flex-wrap gap-1">
                        {keywords.split(',').map((keyword, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {keyword.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          )}
          
          {/* Close button */}
          <div className="p-3 border-t flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
