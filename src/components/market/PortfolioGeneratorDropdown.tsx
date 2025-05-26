import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, AlertCircle, ImageIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProgressDisplay } from "./research/ProgressDisplay";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement>;
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

export function PortfolioGeneratorDropdown({
  content,
  open,
  onOpenChange,
  triggerRef
}: PortfolioGeneratorDropdownProps) {
  const [status, setStatus] = useState<string>('Starting portfolio generation...');
  const [progress, setProgress] = useState<number>(0);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ideas');
  const [isDetailsExpanded, setIsDetailsExpanded] = useState<boolean>(false);
  const [stepDetails, setStepDetails] = useState<any[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  
  // Calculate position based on trigger element
  useEffect(() => {
    if (open && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8, // 8px gap
        left: rect.left + window.scrollX,
        width: Math.min(rect.width * 4, window.innerWidth - 32) // max 4x button width, but not wider than viewport
      });
    }
  }, [open, triggerRef]);
  
  // Clean up fetch request when component unmounts or dialog closes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open || !content) {
      resetState();
      return;
    }

    generatePortfolio(content);
  }, [open, content]);

  const resetState = () => {
    setStatus('Starting portfolio generation...');
    setProgress(0);
    setProgressMessages([]);
    setNews('');
    setKeywords('');
    setMarkets([]);
    setTradeIdeas([]);
    setError('');
    setStepDetails([]);
    setIsStreaming(false);
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
    }
  };

  const addProgressMessage = (message: string) => {
    setProgressMessages(prev => [...prev, message]);
  };

  // Handle SSE events from the backend
  const handleSSEEvent = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (event.type) {
        case 'progress':
          if (data.message) {
            addProgressMessage(data.message);
          }
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
          break;
          
        case 'step_completed':
          if (data.step && data.message) {
            addProgressMessage(`✓ ${data.message}`);
          }
          if (data.progress !== undefined) {
            setProgress(data.progress);
          }
          
          // Add to step details
          const stepDetail = {
            name: data.step,
            completed: true,
            timestamp: new Date().toISOString(),
            details: data.details || { progress: data.progress }
          };
          setStepDetails(prev => [...prev, stepDetail]);
          break;
          
        case 'step_error':
          if (data.step && data.message) {
            addProgressMessage(`❌ Error in ${data.step}: ${data.message}`);
          }
          break;
          
        case 'completed':
          setProgress(100);
          setIsStreaming(false);
          addProgressMessage('✓ Portfolio generation complete');
          setStatus('Portfolio generation complete');
          
          // Set final results
          if (data.data) {
            setNews(data.data.news || '');
            setKeywords(data.data.keywords || '');
            setMarkets(data.data.markets || []);
            setTradeIdeas(data.data.tradeIdeas || []);
            
            addProgressMessage(`Found ${data.data.markets?.length || 0} relevant markets`);
            addProgressMessage(`Generated ${data.data.tradeIdeas?.length || 0} trade ideas`);
          }
          break;
          
        case 'error':
          setError(data.message || 'Unknown error occurred');
          setIsStreaming(false);
          addProgressMessage(`❌ Error: ${data.message}`);
          break;
      }
    } catch (parseError) {
      console.error('Error parsing SSE event data:', parseError);
    }
  };

  const generatePortfolio = async (content: string) => {
    try {
      setLoading(true);
      setIsStreaming(true);
      setError('');
      addProgressMessage('Initializing portfolio generation...');
      setProgress(0);
      
      // Clean up any existing fetch request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Get the current session to retrieve the auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      
      if (!authToken) {
        setError('Authentication required. Please sign in to use this feature.');
        setLoading(false);
        setIsStreaming(false);
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
        }
        toast({
          title: "Authentication required",
          description: "Please sign in to generate portfolios",
          variant: "destructive"
        });
        return;
      }

      // Create a new AbortController for this request
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      // Use SSE for real-time progress updates
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      const portfolioUrl = `${functionUrl}?content=${encodeURIComponent(content)}`;
      
      console.log('Making SSE portfolio request to:', portfolioUrl);
      
      const portfolioResponse = await fetch(portfolioUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'text/event-stream',
        },
        signal
      });
      
      if (!portfolioResponse.ok) {
        const errorText = await portfolioResponse.text();
        throw new Error(`Portfolio generation failed: ${errorText}`);
      }

      // Handle SSE stream
      const reader = portfolioResponse.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('event: ')) {
            const eventType = line.substring(7).trim();
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const eventData = line.substring(6).trim();
            
            try {
              const data = JSON.parse(eventData);
              
              // Create a mock event object for handleSSEEvent
              const mockEvent = {
                type: data.event || 'progress',
                data: eventData
              } as MessageEvent;
              
              handleSSEEvent(mockEvent);
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
            }
          }
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Portfolio generation error:', error);
      
      // Clear progress timer on error
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
      
      setError(errorMessage);
      setIsStreaming(false);
      
      addProgressMessage(`❌ Error: ${errorMessage}`);
      
      toast({
        title: "Portfolio Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const progressStatus = (loading || isStreaming) ? 'processing' : error ? 'failed' : progress === 100 ? 'completed' : null;

  if (!open) return null;

  const dropdownContent = (
    <div 
      className="fixed bg-background border rounded-lg shadow-2xl z-[99999] backdrop-blur-sm"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxWidth: '1024px' // max-w-4xl equivalent
      }}
    >
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(loading || isStreaming) ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">
                {isStreaming ? 'Processing Portfolio...' : 'Generating Portfolio'}
              </span>
            </>
          ) : error && !markets.length && !tradeIdeas.length ? (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium">Portfolio Generation Failed</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Portfolio Generated</span>
            </>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Progress display */}
      <div className="p-4 border-b">
        <ProgressDisplay 
          messages={progressMessages}
          progress={progress}
          status={progressStatus}
        />
        {isStreaming && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Processing in real-time...
          </div>
        )}
      </div>
      
      {error && !markets.length && !tradeIdeas.length && (
        <div className="p-4 bg-destructive/10">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm whitespace-pre-wrap">{error}</p>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <div className="border-b px-4">
          <TabsList className="grid grid-cols-3 h-10">
            <TabsTrigger value="ideas" className="text-xs">
              Trade Ideas ({tradeIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="markets" className="text-xs">
              Markets ({markets.length})
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs">
              Analysis
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="max-h-96 overflow-hidden">
          <TabsContent value="ideas" className="m-0">
            <ScrollArea className="h-96">
              <div className="p-4">
                {tradeIdeas.length > 0 ? (
                  <div className="space-y-3">
                    {tradeIdeas.map((idea, i) => (
                      <Card key={i} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded overflow-hidden flex-shrink-0">
                              {idea.image ? (
                                <AspectRatio ratio={1} className="bg-muted/20">
                                  <img 
                                    src={idea.image} 
                                    alt={idea.market_title}
                                    className="object-cover w-full h-full" 
                                  />
                                </AspectRatio>
                              ) : (
                                <div className="h-full w-full flex items-center justify-center bg-muted">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm truncate">{idea.market_title}</CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'} className="text-xs">
                                  {idea.outcome}
                                </Badge>
                                <span className="text-xs text-muted-foreground">${idea.current_price.toFixed(2)} → ${idea.target_price.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-xs text-muted-foreground">{idea.rationale}</p>
                        </CardContent>
                        <CardFooter className="pt-0">
                          <div className="text-xs text-muted-foreground">
                            Stop: ${idea.stop_price.toFixed(2)}
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    {(loading || isStreaming) ? (
                      <p className="text-muted-foreground text-sm">Generating trade ideas...</p>
                    ) : (
                      <p className="text-muted-foreground text-sm">No trade ideas generated yet</p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="markets" className="m-0">
            <ScrollArea className="h-96">
              <div className="p-4">
                {markets.length > 0 ? (
                  <div className="space-y-4">
                    {markets.slice(0, 10).map((market, i) => (
                      <div key={i} className="border rounded-lg p-3">
                        <div className="flex gap-3 mb-2">
                          <div className="h-10 w-10 rounded overflow-hidden flex-shrink-0">
                            {market.image ? (
                              <AspectRatio ratio={1} className="bg-muted/20">
                                <img 
                                  src={market.image} 
                                  alt={market.question} 
                                  className="object-cover w-full h-full" 
                                />
                              </AspectRatio>
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-muted">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate">{market.event_title}</h3>
                            <p className="text-xs text-muted-foreground">ID: {market.market_id}</p>
                          </div>
                        </div>
                        
                        <div className="border-l-2 border-primary/50 pl-3 mb-2">
                          <p className="font-medium text-sm">{market.question}</p>
                          <div className="flex gap-3 mt-1 text-xs">
                            <span>Yes: ${market.yes_price?.toFixed(2) || 'N/A'}</span>
                            <span>No: ${market.no_price?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                        
                        {market.related_markets?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">
                              +{market.related_markets.length} related markets
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    {(loading || isStreaming) ? (
                      <p className="text-muted-foreground text-sm">Finding relevant markets...</p>
                    ) : (
                      <p className="text-muted-foreground text-sm">No markets found</p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="analysis" className="m-0">
            <ScrollArea className="h-96">
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-medium text-sm mb-2">Your Insight</h3>
                  <div className="border-l-2 border-primary/50 pl-3 py-1">
                    <p className="text-sm">{content}</p>
                  </div>
                </div>
                
                {news && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Market Context</h3>
                    <div className="border-l-2 border-primary/50 pl-3 py-1">
                      <p className="text-sm">{news}</p>
                    </div>
                  </div>
                )}
                
                {keywords && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Key Concepts</h3>
                    <div className="flex flex-wrap gap-1">
                      {keywords.split(',').map((keyword, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-primary/5">
                          {keyword.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
      
      {/* Expandable step details */}
      <div className="border-t">
        <Collapsible open={isDetailsExpanded} onOpenChange={setIsDetailsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-10 px-4">
              <span className="text-xs">View Step Details</span>
              {isDetailsExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="max-h-32">
              <div className="p-4 space-y-2">
                {stepDetails.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {step.completed ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    <span className="font-mono">{step.name.replace(/_/g, ' ')}</span>
                    {step.details && (
                      <span className="text-muted-foreground">
                        {JSON.stringify(step.details)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );

  // Use portal to render outside the current DOM hierarchy
  return createPortal(dropdownContent, document.body);
}
