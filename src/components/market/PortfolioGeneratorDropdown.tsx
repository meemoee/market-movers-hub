import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  TrendingUp,
  Target,
  Shield,
  ImageIcon
} from 'lucide-react';
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

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
  related_markets?: any[];
}

interface PortfolioGeneratorDropdownProps {
  content: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
}

interface SSEEvent {
  step: string;
  message: string;
  progress: number;
  data?: any;
  error?: boolean;
}

export function PortfolioGeneratorDropdown({
  content,
  isOpen,
  onClose,
  triggerRef
}: PortfolioGeneratorDropdownProps) {
  const [currentStep, setCurrentStep] = useState<string>('');
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isComplete, setIsComplete] = useState<boolean>(false);
  
  // Results
  const [news, setNews] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>([]);
  
  // UI state
  const [dropdownPosition, setDropdownPosition] = useState<{top: number; left: number; width: number}>({top: 0, left: 0, width: 0});
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { toast } = useToast();

  // Position dropdown relative to trigger button
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(400, rect.width)
      });
    }
  }, [isOpen, triggerRef]);

  // Start portfolio generation when opened
  useEffect(() => {
    if (isOpen && content) {
      resetState();
      generatePortfolio();
    }
    
    // Cleanup on close
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen, content]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const resetState = () => {
    setCurrentStep('');
    setCurrentMessage('');
    setProgress(0);
    setIsStreaming(false);
    setError('');
    setIsComplete(false);
    setNews('');
    setKeywords('');
    setMarkets([]);
    setTradeIdeas([]);
    setExpandedSections({});
  };

  const generatePortfolio = async () => {
    try {
      setIsStreaming(true);
      setError('');
      
      // Clean up any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        throw new Error('Authentication required. Please sign in.');
      }

      // Start SSE connection
      const response = await fetch(
        'https://lfmkoismabbhujycnqpn.supabase.co/functions/v1/generate-portfolio',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'X-Stream': 'true',
          },
          body: JSON.stringify({ content }),
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Portfolio generation failed: ${errorText}`);
      }

      // Check if we have SSE response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                processSSEMessage(line.trim());
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            processSSEMessage(buffer.trim());
          }

        } catch (streamError: any) {
          if (streamError.name !== 'AbortError') {
            throw streamError;
          }
        }
      } else {
        throw new Error('Expected SSE response but got regular response');
      }

    } catch (error: any) {
      console.error('Portfolio generation error:', error);
      if (error.name !== 'AbortError') {
        setError(error.message || 'Portfolio generation failed');
        toast({
          title: "Portfolio Generation Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const processSSEMessage = (line: string) => {
    if (line.startsWith('event: ')) {
      const eventType = line.slice(7).trim();
      return; // Event type is handled with the data
    }
    
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      
      if (data === '{}') return; // Skip empty data
      
      try {
        const parsed = JSON.parse(data);
        
        // Handle different event types based on the parsed data structure
        if (parsed.error) {
          setError(parsed.message || 'An error occurred');
          setIsStreaming(false);
        } else if (parsed.step === 'stream_error') {
          setError(parsed.message || 'Stream error occurred');
          setIsStreaming(false);
        } else if (parsed.data && parsed.data.tradeIdeas) {
          // Complete event
          setNews(parsed.data.news || '');
          setKeywords(parsed.data.keywords || '');
          setMarkets(parsed.data.markets || []);
          setTradeIdeas(parsed.data.tradeIdeas || []);
          setIsComplete(true);
          setIsStreaming(false);
          setCurrentMessage('Portfolio generation complete!');
          
          toast({
            title: "Portfolio Generated",
            description: `Found ${parsed.data.tradeIdeas?.length || 0} trade ideas and ${parsed.data.markets?.length || 0} markets`,
          });
        } else {
          // Progress event
          if (parsed.step) setCurrentStep(parsed.step);
          if (parsed.message) setCurrentMessage(parsed.message);
          if (typeof parsed.progress === 'number') setProgress(parsed.progress);
          
          // Store intermediate data
          if (parsed.data?.news) setNews(parsed.data.news);
          if (parsed.data?.keywords) setKeywords(parsed.data.keywords);
        }
      } catch (parseError) {
        console.error('Error parsing SSE data:', parseError, data);
      }
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getStepIcon = () => {
    if (error) return <XCircle className="h-4 w-4 text-destructive" />;
    if (isComplete) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (isStreaming) return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    return null;
  };

  const formatStepName = (step: string) => {
    return step.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="fixed bg-background border border-border rounded-lg shadow-lg max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999
      }}
    >
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStepIcon()}
            <h3 className="font-semibold text-sm">
              {error ? 'Generation Failed' : isComplete ? 'Portfolio Ready' : 'Generating Portfolio'}
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            ×
          </Button>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{formatStepName(currentStep)}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{currentMessage}</p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        {/* Trade Ideas Section */}
        {tradeIdeas.length > 0 && (
          <div className="mb-4">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trade Ideas ({tradeIdeas.length})
            </h4>
            <div className="space-y-3">
              {tradeIdeas.map((idea, i) => (
                <Card key={i} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-md overflow-hidden flex-shrink-0">
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
                      <h5 className="font-medium text-sm leading-tight mb-1">{idea.market_title}</h5>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={idea.outcome.toLowerCase() === 'yes' ? 'default' : 'outline'} className="text-xs">
                          {idea.outcome}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ${idea.current_price.toFixed(2)} → ${idea.target_price.toFixed(2)}
                        </span>
                      </div>
                      <Collapsible open={expandedSections[`trade-${i}`]} onOpenChange={() => toggleSection(`trade-${i}`)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                            Details {expandedSections[`trade-${i}`] ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <p className="text-xs text-muted-foreground mb-2">{idea.rationale}</p>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              Target: ${idea.target_price.toFixed(2)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Stop: ${idea.stop_price.toFixed(2)}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Markets Section */}
        {markets.length > 0 && (
          <div className="mb-4">
            <Collapsible open={expandedSections.markets} onOpenChange={() => toggleSection('markets')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-0 text-sm font-medium justify-start mb-2">
                  Relevant Markets ({markets.length})
                  {expandedSections.markets ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2">
                  {markets.slice(0, 5).map((market, i) => (
                    <div key={i} className="border rounded-md p-2">
                      <div className="flex gap-2 mb-1">
                        <div className="h-8 w-8 rounded overflow-hidden flex-shrink-0">
                          {market.image ? (
                            <img src={market.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h6 className="font-medium text-xs leading-tight">{market.event_title}</h6>
                          <p className="text-xs text-muted-foreground truncate">{market.question}</p>
                          <div className="flex gap-2 text-xs mt-1">
                            <span>Yes: ${market.yes_price?.toFixed(2) || 'N/A'}</span>
                            <span>No: ${market.no_price?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {markets.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{markets.length - 5} more markets found
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Analysis Section */}
        {(news || keywords) && (
          <div className="mb-4">
            <Collapsible open={expandedSections.analysis} onOpenChange={() => toggleSection('analysis')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-0 text-sm font-medium justify-start mb-2">
                  Analysis Details
                  {expandedSections.analysis ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3">
                <div>
                  <h6 className="font-medium text-xs mb-1">Your Insight</h6>
                  <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">{content}</p>
                </div>
                
                {news && (
                  <div>
                    <h6 className="font-medium text-xs mb-1">Market Context</h6>
                    <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">{news}</p>
                  </div>
                )}
                
                {keywords && (
                  <div>
                    <h6 className="font-medium text-xs mb-1">Key Concepts</h6>
                    <div className="flex flex-wrap gap-1">
                      {keywords.split(',').slice(0, 8).map((keyword, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-primary/5">
                          {keyword.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Empty state */}
        {!isStreaming && !error && !isComplete && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Ready to generate portfolio...</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
