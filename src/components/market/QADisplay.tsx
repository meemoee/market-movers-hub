import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  const cleanStreamContent = (content: string): string => {
    return content
      .replace(/\{"id":"[^"]+","provider":"[^"]+","model":"[^"]+","object":"[^"]+"}/g, '')
      .replace(/\{"choices":\[\{"delta":\{"content":"/g, '')
      .replace(/"\}\}\]}/g, '')
      .replace(/\{"analysis":/g, '')
      .replace(/\}$/g, '')
      .replace(/\\"/g, '"')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  };

  const parseStreamChunk = (chunk: string): string | string[] => {
    try {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed.choices?.[0]?.delta?.content) {
        return cleanStreamContent(parsed.choices[0].delta.content);
      }
      // Handle the case where we get a complete message object
      if (parsed.choices?.[0]?.message?.content) {
        return cleanStreamContent(parsed.choices[0].message.content);
      }
      return '';
    } catch (e) {
      return cleanStreamContent(chunk);
    }
  };

  const getGeminiFollowups = async (question: string, analysis: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({
          marketId,
          question,
          parentContent: analysis,
        })
      });

      if (error) {
        console.error('Error getting follow-up questions:', error);
        return [];
      }

      const reader = new Response(data.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      let jsonContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        jsonContent += new TextDecoder().decode(value);
      }

      // Look for array pattern in the content
      const matches = jsonContent.match(/\[.*\]/);
      if (matches) {
        const parsedQuestions = JSON.parse(matches[0]);
        return Array.isArray(parsedQuestions) ? parsedQuestions : [];
      }
      return [];
    } catch (e) {
      console.error('Error parsing follow-up questions:', e);
      return [];
    }
  };

  const analyzeQuestion = async (question: string, parentId: string | null = null, depth: number = 0, parentContent: string | null = null) => {
    if (depth >= 3) return;
    
    const nodeId = `node-${Date.now()}-${depth}`;
    setCurrentNodeId(nodeId);
    setExpandedNodes(prev => new Set([...prev, nodeId]));
    
    try {
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

      setStreamingContent(prev => ({
        ...prev,
        [nodeId]: ''
      }));

      const { data: streamData, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({
          marketId,
          question,
          parentContent
        })
      });

      if (error) throw error;

      let streamContent = '';
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

            const parsedContent = parseStreamChunk(jsonStr);
            
            if (Array.isArray(parsedContent)) {
              for (const followUpQuestion of parsedContent) {
                await analyzeQuestion(followUpQuestion, nodeId, depth + 1, streamContent);
              }
            } else if (typeof parsedContent === 'string' && parsedContent) {
              streamContent += parsedContent;
              setStreamingContent(prev => ({
                ...prev,
                [nodeId]: streamContent
              }));

              setQaData(prev => {
                const updateNode = (nodes: QANode[]): QANode[] => {
                  return nodes.map(node => {
                    if (node.id === nodeId) {
                      return {
                        ...node,
                        analysis: streamContent
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
            }
          }
        }
      }

      if (!parentContent) {
        const followUpQuestions = await getGeminiFollowups(question, streamContent);
        for (const followUpQuestion of followUpQuestions) {
          await analyzeQuestion(followUpQuestion, nodeId, depth + 1, streamContent);
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

    return (
      <div key={node.id} className="relative flex flex-col">
        <div className="flex items-stretch">
          {depth > 0 && (
            <div className="relative w-6 sm:w-9 flex-shrink-0">
              <div className="absolute top-0 bottom-0 left-6 sm:left-9 w-[2px] bg-border" />
            </div>
          )}

          <div className="flex-grow min-w-0 pl-2 sm:pl-[72px] pb-6 relative">
            {depth > 0 && (
              <div className="absolute left-0 top-4 h-[2px] w-4 sm:w-6 bg-border" />
            )}

            <div className="absolute left-[12px] sm:left-[24px] top-0">
              <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border-2 border-background">
                <AvatarFallback className="bg-primary/10">
                  <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium text-sm leading-none pt-2">{node.question}</h3>
              <div 
                className="text-sm text-muted-foreground cursor-pointer"
                onClick={() => toggleNode(node.id)}
              >
                <div className="flex items-start gap-2">
                  <button className="mt-1 hover:bg-accent/50 rounded-full p-0.5">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  <div className="flex-1">
                    <ReactMarkdown>{analysisContent}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            {node.children.length > 0 && isExpanded && (
              <div className="mt-6">
                {node.children.map((child) => renderQANode(child, depth + 1))}
              </div>
            )}
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