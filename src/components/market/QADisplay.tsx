import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface QANode {
  id: string;
  question: string;
  analysis: string;
  children: QANode[];
}

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
}

export function QADisplay({ marketId, marketQuestion }: QADisplayProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [streamingContent, setStreamingContent] = useState<{[key: string]: string}>({});
  const [parsedContent, setParsedContent] = useState<{[key: string]: any}>({});
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const analyzeQuestion = async (question: string, parentId: string | null = null, depth: number = 0) => {
    if (depth >= 3) return;
    
    const nodeId = `node-${Date.now()}-${depth}`;
    setCurrentNodeId(nodeId);
    
    try {
      const { data: streamData, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({
          marketId,
          question
        })
      });

      if (error) throw error;

      let accumulatedContent = '';
      const reader = new Response(streamData.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      setStreamingContent(prev => ({
        ...prev,
        [nodeId]: ''
      }));

      setQaData(prev => {
        const newNode: QANode = {
          id: nodeId,
          question,
          analysis: '',
          children: []
        };

        if (!parentId) {
          return [newNode];
        }

        const updateChildren = (nodes: QANode[]): QANode[] => {
          return nodes.map(node => {
            if (node.id === parentId) {
              return {
                ...node,
                children: [...node.children, newNode]
              };
            }
            if (node.children.length > 0) {
              return {
                ...node,
                children: updateChildren(node.children)
              };
            }
            return node;
          });
        };

        return updateChildren(prev);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                accumulatedContent += content;
                
                try {
                  const parsedJson = JSON.parse(accumulatedContent);
                  
                  if (parsedJson && typeof parsedJson === 'object' && parsedJson.analysis) {
                    setParsedContent(prev => ({
                      ...prev,
                      [nodeId]: parsedJson
                    }));
                    
                    setStreamingContent(prev => ({
                      ...prev,
                      [nodeId]: parsedJson.analysis
                    }));
                    
                    setQaData(prev => {
                      const updateNode = (nodes: QANode[]): QANode[] => {
                        return nodes.map(node => {
                          if (node.id === nodeId) {
                            return {
                              ...node,
                              analysis: parsedJson.analysis
                            };
                          }
                          if (node.children.length > 0) {
                            return {
                              ...node,
                              children: updateNode(node.children)
                            };
                          }
                          return node;
                        });
                      };
                      return updateNode(prev);
                    });

                    if (parsedJson.questions) {
                      for (const childQuestion of parsedJson.questions) {
                        await analyzeQuestion(childQuestion, nodeId, depth + 1);
                      }
                    }
                  }
                } catch (parseError) {
                  continue;
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in analysis:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Failed to analyze the question. Please try again.",
      });
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setQaData([]);
    setStreamingContent({});
    setParsedContent({});
    setExpandedNodes(new Set());
    
    try {
      await analyzeQuestion(marketQuestion);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const renderQANode = (node: QANode, depth: number = 0) => {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    const isExpanded = expandedNodes.has(node.id);
    const analysisContent = isStreaming ? streamContent : node.analysis;
    const firstLine = analysisContent?.split('\n')[0] || '';
    
    return (
      <div key={node.id} className="relative">
        {depth > 0 && (
          <div 
            className="absolute left-0 top-0 w-px bg-border"
            style={{
              left: '2.25rem',
              height: 'calc(100% - 0.75rem)',
              width: '2px',
              backgroundColor: 'hsl(var(--border) / 0.4)',
              zIndex: 0
            }}
          />
        )}
        <div className="mb-4 pl-[72px] relative">
          {depth > 0 && (
            <div 
              className="absolute left-0 top-4 h-px bg-border"
              style={{
                left: '2.25rem',
                width: '2.25rem',
                height: '2px',
                backgroundColor: 'hsl(var(--border) / 0.4)',
                zIndex: 0
              }}
            />
          )}
          <div className="absolute left-0 top-0 z-10">
            <Avatar className="h-9 w-9 border-2 border-background bg-primary/5">
              <AvatarFallback>
                <MessageSquare className="h-5 w-5 text-primary" />
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-medium text-sm leading-none pt-2">{node.question}</h3>
            <div 
              className="text-sm text-muted-foreground cursor-pointer group"
              onClick={() => toggleNode(node.id)}
            >
              <div className="flex items-start gap-2">
                <button className="mt-1 hover:bg-accent/50 rounded-full p-0.5 transition-colors">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <div className="flex-1 group-hover:text-foreground transition-colors">
                  {isExpanded ? (
                    <ReactMarkdown>{analysisContent}</ReactMarkdown>
                  ) : (
                    <div className="line-clamp-1">{firstLine}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 mt-4">
            {node.children.map(child => renderQANode(child, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="absolute top-2 right-2 z-10"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </Button>
      
      <ScrollArea className="h-[500px] mt-8 pr-4">
        {qaData.map(node => renderQANode(node))}
      </ScrollArea>
    </Card>
  );
}