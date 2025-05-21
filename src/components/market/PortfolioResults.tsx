
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
import { Loader2, CheckCircle, XCircle, AlertCircle, ImageIcon } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ProgressDisplay } from "../market/research/ProgressDisplay";
import { useJobLogger } from "@/hooks/research/useJobLogger";
import { AspectRatio } from "@/components/ui/aspect-ratio";

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

interface PortfolioResultsProps {
  content: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function PortfolioResults({
  content,
  open,
  onOpenChange
}: PortfolioResultsProps) {
  const [status, setStatus] = useState<string>('Starting portfolio generation...');
  const [progress, setProgress] = useState<number>(0);
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ideas');
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { logUpdate } = useJobLogger('PortfolioResults');
  
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
  };

  const addProgressMessage = (message: string) => {
    setProgressMessages(prev => [...prev, message]);
  };

  const updateProgressFromSteps = (steps: any[]) => {
    if (!steps || steps.length === 0) return;
    
    // Assuming we have 8 total steps in the portfolio generation process
    const totalSteps = 8;
    const completedSteps = steps.filter(step => step.completed).length;
    const progressPercentage = Math.min(Math.round((completedSteps / totalSteps) * 100), 95);
    
    setProgress(progressPercentage);
  };

  const generatePortfolio = async (content: string) => {
    try {
      logUpdate('info', `Starting portfolio generation for: ${content.substring(0, 30)}...`);
      setLoading(true);
      setError('');
      addProgressMessage('Authenticating user...');
      setProgress(5);
      
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

      addProgressMessage('Preparing portfolio generation...');
      
      // Use Supabase function URL
      const functionUrl = 'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio';
      
      // First make a POST request to start the generation process with proper authentication
      addProgressMessage('Initializing generation process...');
      setProgress(10);
      
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
      addProgressMessage('Starting portfolio analysis...');
      abortControllerRef.current = new AbortController();
      
      // Include the content as a URL parameter
      const portfolioUrl = `${functionUrl}?content=${encodeURIComponent(content)}`;
      
      logUpdate('info', `Making request to: ${portfolioUrl}`);
      addProgressMessage('Analyzing your insight...');
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
        logUpdate('error', `Portfolio generation failed: ${errorText}`);
        throw new Error(`Portfolio generation failed: ${errorText}`);
      }
      
      const results: PortfolioResults = await portfolioResponse.json();
      logUpdate('info', `Received portfolio results with status: ${results.status}`);
      
      // Process errors if any
      if (results.errors && results.errors.length > 0) {
        results.errors.forEach(err => {
          logUpdate('error', `Error in ${err.step}: ${err.message}`);
          toast({
            title: `Error in ${err.step}`,
            description: err.message,
            variant: "destructive"
          });
        });
        
        // Only set error if we have no data
        if (!results.data.markets.length && !results.data.tradeIdeas.length) {
          setError(results.errors.map(e => `${e.step}: ${e.message}`).join('\n'));
        }
      }
      
      // Process all steps
      if (results.steps && results.steps.length > 0) {
        // Update progress
        updateProgressFromSteps(results.steps);
        
        // Add step messages to progress
        results.steps.forEach(step => {
          if (step.completed) {
            addProgressMessage(`Completed: ${step.name.replace(/_/g, ' ')}`);
          }
        });
      }
      
      // Set data
      if (results.data) {
        setNews(results.data.news || '');
        setKeywords(results.data.keywords || '');
        
        // Display all markets from the embedding search (all 25 results)
        setMarkets(results.data.markets || []);
        
        setTradeIdeas(results.data.tradeIdeas || []);
        
        // Add data summaries to progress
        addProgressMessage(`Found ${results.data.markets.length} relevant markets`);
        addProgressMessage(`Generated ${results.data.tradeIdeas.length} trade ideas`);
      }
      
      if (results.status === 'completed') {
        setStatus('Portfolio generation complete');
        addProgressMessage('Portfolio generation complete');
        setProgress(100);
      } else {
        setStatus('Portfolio generation encountered issues');
        addProgressMessage('Portfolio generation completed with warnings');
        setProgress(100);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logUpdate('error', `Portfolio generation error: ${errorMessage}`);
      console.error('Portfolio generation error:', error);
      setError(errorMessage);
      
      addProgressMessage(`Error: ${errorMessage}`);
      
      toast({
        title: "Portfolio Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const progressStatus = loading ? 'processing' : error ? 'failed' : progress === 100 ? 'completed' : null;

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
            ) : error && !markets.length && !tradeIdeas.length ? (
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
        
        {/* Progress display */}
        <ProgressDisplay 
          messages={progressMessages}
          progress={progress}
          status={progressStatus}
        />
        
        {error && !markets.length && !tradeIdeas.length && (
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
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md overflow-hidden">
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
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div>
                            <CardTitle className="text-base">{idea.market_title}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'}>
                                {idea.outcome}
                              </Badge>
                              <span>Current: ${idea.current_price.toFixed(2)}</span>
                              <span>⟶</span>
                              <span>Target: ${idea.target_price.toFixed(2)}</span>
                            </CardDescription>
                          </div>
                        </div>
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
                      <div className="flex gap-3 mb-3">
                        <div className="h-12 w-12 rounded-md overflow-hidden flex-shrink-0">
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
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium text-lg">{market.event_title}</h3>
                          <div className="flex gap-3 text-sm text-muted-foreground">
                            <span>ID: {market.market_id}</span>
                          </div>
                        </div>
                      </div>
                      
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
