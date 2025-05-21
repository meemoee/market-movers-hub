import { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TradeIdea {
  market_title: string;
  outcome: string;
  current_price: number;
  target_price: number;
  stop_price: number;
  rationale: string;
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
  yes_price: number;
  no_price: number;
  related_markets: RelatedMarket[];
}

interface PortfolioResultsProps {
  content: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PortfolioResults({
  content,
  open,
  onOpenChange
}: PortfolioResultsProps) {
  const [status, setStatus] = useState<string>('Starting portfolio generation...');
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ideas');
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  
  // Clean up fetch request when component unmounts or dialog closes
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!open || !content) {
      setStatus('Starting portfolio generation...');
      setNews('');
      setKeywords('');
      setMarkets([]);
      setTradeIdeas([]);
      setError('');
      return;
    }

    generatePortfolio(content);
  }, [open, content]);

  const processSSEMessage = (line: string) => {
    if (line.startsWith('event: ')) {
      const eventType = line.slice(7).trim();
      
      // Wait for the data line
      return eventType;
    } 
    else if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      return { type: 'data', data };
    }
    
    return null;
  };

  const generatePortfolio = async (content: string) => {
    try {
      setLoading(true);
      setError('');
      
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
        toast({
          title: "Authentication required",
          description: "Please sign in to generate portfolios",
          variant: "destructive"
        });
        return;
      }

      // Use Supabase function URL
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      
      // First make a POST request to start the generation process with proper authentication
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ content })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start portfolio generation: ${errorText}`);
      }
      
      // Now set up streaming using fetch API instead of EventSource for better auth handling
      abortControllerRef.current = new AbortController();
      const streamResponse = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal
      });
      
      if (!streamResponse.ok) {
        const errorText = await streamResponse.text();
        throw new Error(`Stream connection failed: ${errorText}`);
      }
      
      if (!streamResponse.body) {
        throw new Error('No response body from stream');
      }
      
      // Process the stream with TextDecoder
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = '';
      let currentEventType = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Portfolio stream complete');
            break;
          }
          
          // Decode the chunk and add it to our buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last potentially incomplete line
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Check if this is an event type or data
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
            }
            else if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              
              // Process based on event type
              switch (currentEventType) {
                case 'status':
                  setStatus(data);
                  break;
                case 'news':
                  setNews(data);
                  break;
                case 'keywords':
                  setKeywords(data);
                  break;
                case 'markets':
                  try {
                    const parsedData = JSON.parse(data);
                    setMarkets(parsedData);
                  } catch (e) {
                    console.error('Error parsing markets:', e);
                  }
                  break;
                case 'trade_ideas':
                  try {
                    const parsedData = JSON.parse(data);
                    setTradeIdeas(Array.isArray(parsedData) ? parsedData : []);
                  } catch (e) {
                    console.error('Error parsing trade ideas:', e);
                  }
                  break;
                case 'error':
                  setError(prev => prev ? `${prev}\n${data}` : data);
                  toast({
                    title: "Error",
                    description: data,
                    variant: "destructive"
                  });
                  break;
                case 'warning':
                  toast({
                    title: "Warning",
                    description: data,
                    variant: "destructive"
                  });
                  break;
                case 'done':
                  setStatus('Portfolio generation complete');
                  setLoading(false);
                  break;
              }
            }
          }
        }
      } catch (error: any) {
        // Check if this is an abort error (user cancelled)
        if (error.name === 'AbortError') {
          console.log('Portfolio generation aborted by user');
        } else {
          throw error;
        }
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Portfolio generation error:', error);
      setError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Portfolio
              </>
            ) : error ? (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                Portfolio Generation Failed
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 text-primary" />
                Portfolio Generated
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {loading && (
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{status}</span>
          </div>
        )}
        
        {error && (
          <div className="bg-destructive/10 p-3 rounded-md mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm whitespace-pre-wrap">{error}</p>
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="ideas">Trade Ideas</TabsTrigger>
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
          
          <TabsContent value="ideas" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              {tradeIdeas.length > 0 ? (
                <div className="space-y-4">
                  {tradeIdeas.map((idea, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{idea.market_title}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'}>
                            {idea.outcome}
                          </Badge>
                          <span>Current: ${idea.current_price.toFixed(2)}</span>
                          <span>⟶</span>
                          <span>Target: ${idea.target_price.toFixed(2)}</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{idea.rationale}</p>
                      </CardContent>
                      <CardFooter className="pt-0">
                        <div className="text-xs text-muted-foreground">
                          Stop price: ${idea.stop_price.toFixed(2)}
                        </div>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  {loading ? (
                    <p className="text-muted-foreground text-sm">Generating trade ideas...</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No trade ideas generated yet</p>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="markets" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              {markets.length > 0 ? (
                <div className="space-y-6">
                  {markets.map((market, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <h3 className="font-medium text-lg mb-2">{market.event_title}</h3>
                      <div className="border-l-2 border-primary/50 pl-3 mb-3">
                        <p className="font-medium">{market.question}</p>
                        <div className="flex gap-3 mt-1 text-sm">
                          <span>Yes: ${market.yes_price?.toFixed(2) || 'N/A'}</span>
                          <span>No: ${market.no_price?.toFixed(2) || 'N/A'}</span>
                        </div>
                      </div>
                      
                      {market.related_markets?.length > 0 && (
                        <>
                          <p className="text-sm text-muted-foreground mb-2">Related markets:</p>
                          <div className="space-y-2">
                            {market.related_markets.map((related, j) => (
                              <div key={j} className="text-sm border border-border/50 rounded-md p-2">
                                <p>{related.question}</p>
                                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>Yes: ${related.yes_price?.toFixed(2) || 'N/A'}</span>
                                  <span>No: ${related.no_price?.toFixed(2) || 'N/A'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  {loading ? (
                    <p className="text-muted-foreground text-sm">Finding relevant markets...</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">No markets found</p>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="analysis" className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Your Insight</h3>
                  <div className="border-l-2 border-primary/50 pl-3 py-1">
                    <p className="text-sm">{content}</p>
                  </div>
                </div>
                
                {news && (
                  <div>
                    <h3 className="font-medium mb-2">Market Context</h3>
                    <div className="border-l-2 border-primary/50 pl-3 py-1">
                      <p className="text-sm">{news}</p>
                    </div>
                  </div>
                )}
                
                {keywords && (
                  <div>
                    <h3 className="font-medium mb-2">Key Concepts</h3>
                    <div className="flex flex-wrap gap-2">
                      {keywords.split(',').map((keyword, i) => (
                        <Badge key={i} variant="outline" className="bg-primary/5">
                          {keyword.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end mt-4">
          <Button 
            onClick={() => onOpenChange(false)} 
            variant="outline"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
