import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp } from "lucide-react";

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
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const analyzeQuestion = async (question: string, parentId: string | null = null, depth: number = 0) => {
    if (depth >= 3) return;
    
    const nodeId = `node-${Date.now()}-${depth}`;
    setCurrentNodeId(nodeId);
    
    console.log('Analyzing question:', { nodeId, question, depth });
    
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
                  const parsedContent = JSON.parse(accumulatedContent);
                  if (parsedContent.analysis && parsedContent.questions) {
                    setQaData(prev => {
                      const newNode: QANode = {
                        id: nodeId,
                        question,
                        analysis: parsedContent.analysis,
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

                    for (const childQuestion of parsedContent.questions) {
                      await analyzeQuestion(childQuestion, nodeId, depth + 1);
                    }
                  }
                } catch (e) {
                  setStreamingContent(prev => ({
                    ...prev,
                    [nodeId]: accumulatedContent
                  }));
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
            className="absolute left-[-20px] top-0 w-[20px] h-full"
            style={{
              background: `
                linear-gradient(90deg, 
                  transparent calc(50% - 1px), 
                  hsl(var(--muted-foreground)) calc(50% - 1px), 
                  hsl(var(--muted-foreground)) calc(50% + 1px), 
                  transparent calc(50% + 1px)
                )
              `,
              opacity: 0.2,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '0 24px',
              backgroundSize: '100% 2px'
            }}
          >
            <div
              className="absolute left-[50%] top-0 w-[2px] h-full -translate-x-[1px]"
              style={{
                background: 'hsl(var(--muted-foreground))',
                opacity: 0.2,
                clipPath: 'polygon(0 24px, 100% 24px, 100% 100%, 0 100%)'
              }}
            />
          </div>
        )}
        <div className="mb-3 pl-[20px]">
          <div className="hover:bg-accent/5 transition-colors rounded-lg p-4">
            <div className="space-y-2">
              <h3 className="font-medium text-sm">{node.question}</h3>
              <div 
                className="text-sm text-muted-foreground cursor-pointer flex items-start gap-2"
                onClick={() => toggleNode(node.id)}
              >
                <button className="mt-1">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                <div className="flex-1">
                  {isExpanded ? (
                    <ReactMarkdown>{analysisContent}</ReactMarkdown>
                  ) : (
                    <div className="line-clamp-1">{firstLine}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
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