
import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronRight, Sparkle, ImageIcon } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";

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

interface Market {
  market_id: string;
  event_id: string;
  event_title: string;
  question: string;
  description?: string;
  image?: string;
  yes_price: number;
  no_price: number;
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
  data: {
    news: string;
    keywords: string;
    markets: Market[];
    tradeIdeas: TradeIdea[];
  }
}

interface PortfolioGeneratorDropdownProps {
  content: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement>;
}

export function PortfolioGeneratorDropdown({
  content,
  isOpen,
  onOpenChange,
  triggerRef
}: PortfolioGeneratorDropdownProps) {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && content) {
      generatePortfolio(content);
    } else if (!isOpen) {
      resetState();
    }
  }, [isOpen, content]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onOpenChange, triggerRef]);

  const resetState = () => {
    setStatus('');
    setProgress(0);
    setCurrentStep('');
    setCompletedSteps([]);
    setTradeIdeas([]);
    setMarkets([]);
    setNews('');
    setKeywords('');
    setError('');
    setExpandedSections({});
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const updateProgressFromSteps = (steps: any[]) => {
    if (!steps || steps.length === 0) return;
    
    const totalSteps = 8;
    const completed = steps.filter(step => step.completed).length;
    const progressPercentage = Math.min(Math.round((completed / totalSteps) * 100), 95);
    
    setProgress(progressPercentage);
    setCompletedSteps(steps.filter(step => step.completed).map(step => step.name));
    
    const currentStepData = steps.find(step => !step.completed);
    if (currentStepData) {
      setCurrentStep(currentStepData.name.replace(/_/g, ' '));
    } else if (completed === totalSteps) {
      setCurrentStep('Complete');
      setProgress(100);
    }
  };

  const generatePortfolio = async (content: string) => {
    try {
      setLoading(true);
      setError('');
      setCurrentStep('Initializing...');
      setProgress(5);
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
      if (!authToken) {
        setError('Authentication required. Please sign in to use this feature.');
        setLoading(false);
        return;
      }

      setCurrentStep('Starting analysis...');
      setProgress(10);
      
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      
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
      
      abortControllerRef.current = new AbortController();
      const portfolioUrl = `${functionUrl}?content=${encodeURIComponent(content)}`;
      
      setCurrentStep('Analyzing your insight...');
      setProgress(15);
      
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
        throw new Error(`Portfolio generation failed: ${errorText}`);
      }
      
      const results: PortfolioResults = await portfolioResponse.json();
      
      if (results.errors && results.errors.length > 0) {
        results.errors.forEach(err => {
          toast({
            title: `Error in ${err.step}`,
            description: err.message,
            variant: "destructive"
          });
        });
        
        if (!results.data.markets.length && !results.data.tradeIdeas.length) {
          setError(results.errors.map(e => `${e.step}: ${e.message}`).join('\n'));
        }
      }
      
      if (results.steps && results.steps.length > 0) {
        updateProgressFromSteps(results.steps);
      }
      
      if (results.data) {
        setNews(results.data.news || '');
        setKeywords(results.data.keywords || '');
        setMarkets(results.data.markets || []);
        setTradeIdeas(results.data.tradeIdeas || []);
      }
      
      if (results.status === 'completed') {
        setStatus('Portfolio generation complete');
        setCurrentStep('Complete');
        setProgress(100);
      } else {
        setStatus('Portfolio generation completed with warnings');
        setCurrentStep('Complete with warnings');
        setProgress(100);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Portfolio generation error:', error);
      setError(errorMessage);
      setCurrentStep('Failed');
      
      toast({
        title: "Portfolio Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-1 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden"
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Portfolio Generation</span>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        
        {loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentStep}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
        
        {error && (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </div>

      <ScrollArea className="max-h-64">
        <div className="p-4 space-y-3">
          {tradeIdeas.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Trade Ideas ({tradeIdeas.length})
              </h4>
              <div className="space-y-2">
                {tradeIdeas.slice(0, 2).map((idea, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded overflow-hidden flex-shrink-0">
                        {idea.image ? (
                          <img src={idea.image} alt={idea.market_title} className="object-cover w-full h-full" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{idea.market_title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'} className="text-xs px-1 py-0">
                            {idea.outcome}
                          </Badge>
                          <span>${idea.current_price.toFixed(2)} → ${idea.target_price.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{idea.rationale}</p>
                  </Card>
                ))}
                {tradeIdeas.length > 2 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{tradeIdeas.length - 2} more ideas available
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Expandable Sections */}
          <div className="space-y-1">
            {markets.length > 0 && (
              <Collapsible open={expandedSections.markets} onOpenChange={() => toggleSection('markets')}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Markets Found ({markets.length})
                  </span>
                  {expandedSections.markets ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pl-6">
                  {markets.slice(0, 3).map((market, i) => (
                    <div key={i} className="text-xs p-2 border border-border/50 rounded">
                      <p className="font-medium">{market.question}</p>
                      <div className="flex gap-2 mt-1 text-muted-foreground">
                        <span>Yes: ${market.yes_price?.toFixed(2) || 'N/A'}</span>
                        <span>No: ${market.no_price?.toFixed(2) || 'N/A'}</span>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {news && (
              <Collapsible open={expandedSections.news} onOpenChange={() => toggleSection('news')}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Market Context
                  </span>
                  {expandedSections.news ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6">
                  <p className="text-xs text-muted-foreground p-2 border-l-2 border-primary/50">{news}</p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {keywords && (
              <Collapsible open={expandedSections.keywords} onOpenChange={() => toggleSection('keywords')}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Key Concepts
                  </span>
                  {expandedSections.keywords ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-6">
                  <div className="flex flex-wrap gap-1">
                    {keywords.split(',').map((keyword, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-primary/5">
                        {keyword.trim()}
                      </Badge>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
