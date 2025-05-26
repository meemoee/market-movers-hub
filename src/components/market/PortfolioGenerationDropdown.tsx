import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Sparkle, TrendingUp, DollarSign } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const { session } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalSteps = 8; // Based on the edge function steps

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

  // Calculate dropdown position when opened or on scroll
  useEffect(() => {
    if (!isOpen || !buttonRef?.current) return;

    const updatePosition = () => {
      if (buttonRef?.current) {
        const buttonRect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: buttonRect.bottom + 8,
          left: buttonRect.left,
          width: Math.max(500, buttonRect.width)
        });
      }
    };

    updatePosition();
    
    // Update position on scroll and resize
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, buttonRef]);

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

  const generatePortfolio = async () => {
    if (!session?.access_token) {
      console.error('No authentication token available');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setCurrentStep('Starting portfolio generation...');
    setResults(null);

    try {
      // First make the POST request to initiate
      const { error: postError } = await supabase.functions.invoke('generate-portfolio', {
        body: { content }
      });

      if (postError) {
        console.error('Error initiating portfolio generation:', postError);
        return;
      }

      // Then start SSE connection for real-time updates
      const authToken = session.access_token;
      const encodedContent = encodeURIComponent(content);
      const eventSourceUrl = `https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio?content=${encodedContent}&authToken=${authToken}`;
      
      console.log('Starting SSE connection to:', eventSourceUrl);
      
      const eventSource = new EventSource(eventSourceUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received SSE data:', data);
          
          if (data.status === 'completed') {
            setResults(data);
            setProgress(100);
            setCurrentStep('Portfolio generation complete!');
            setIsGenerating(false);
            eventSource.close();
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
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setIsGenerating(false);
        setCurrentStep('Error generating portfolio');
        eventSource.close();
      };

    } catch (error) {
      console.error('Error generating portfolio:', error);
      setIsGenerating(false);
      setCurrentStep('Error generating portfolio');
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
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

  const dropdownContent = (
    <div 
      ref={dropdownRef}
      className="fixed z-40 bg-background border border-border rounded-lg shadow-2xl"
      style={{
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        width: `${Math.min(dropdownPosition.width, 600)}px`,
        minWidth: '500px'
      }}
    >
      <Card className="border-0 shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkle className="h-5 w-5 text-primary" />
            Portfolio Generation
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {!results && !isGenerating && (
            <div className="text-center py-4">
              <Button onClick={generatePortfolio} className="w-full">
                Generate Portfolio
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
            </div>
          )}

          {results && (
            <div className="space-y-4">
              {/* Trade Ideas Section */}
              <Collapsible 
                open={expandedSections.has('trades')} 
                onOpenChange={() => toggleSection('trades')}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-accent/50 rounded-lg hover:bg-accent/70">
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
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-accent/30 rounded-lg hover:bg-accent/50">
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
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-accent/30 rounded-lg hover:bg-accent/50">
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
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-accent/30 rounded-lg hover:bg-accent/50">
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

  // Use portal to render outside of the clipped container
  return createPortal(dropdownContent, document.body);
}
