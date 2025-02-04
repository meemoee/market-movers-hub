import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children: QANode[];
}

interface StreamingContent {
  content: string;
  citations: string[];
}

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
}

const MarkdownComponents = {
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="mb-4 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc pl-4 mb-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal pl-4 mb-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => (
    <li className="mb-1 last:mb-0">{children}</li>
  ),
};

export function QADisplay({ marketId, marketQuestion }: QADisplayProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [streamingContent, setStreamingContent] = useState<{[key: string]: StreamingContent}>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

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

  const cleanStreamContent = (chunk: string): { content: string; citations: string[] } => {
    console.log('Raw chunk before cleaning:', chunk);
    try {
      const parsed = JSON.parse(chunk);
      console.log('Parsed JSON:', parsed);
      
      const content = parsed.choices?.[0]?.delta?.content || 
                     parsed.choices?.[0]?.message?.content || '';
      
      if (!content) {
        console.log('No content found in chunk');
        return { content: '', citations: [] };
      }
      
      // Remove markdown headers and normalize spaces
      const cleanedContent = content
        .replace(/^###\s*/gm, '')
        .replace(/^##\s*/gm, '')
        .replace(/^#\s*/gm, '')
        .trim();
      
      console.log('Cleaned content:', cleanedContent);
      
      return {
        content: cleanedContent,
        citations: parsed.citations || []
      };
    } catch (e) {
      console.error('Error parsing stream chunk:', e);
      return { content: '', citations: [] };
    }
  };

  const ensureProperSpacing = (current: string, newContent: string): string => {
    if (/\w$/.test(current) && /^\w/.test(newContent)) {
      return current + ' ' + newContent;
    }
    return current + newContent;
  };

  const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> => {
    let accumulatedContent = '';
    let accumulatedCitations: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        console.log('Processing chunk:', chunk);
        
        const lines = chunk.split('\n').filter(line => line.trim());
        console.log('Processing lines:', lines);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            const { content, citations } = cleanStreamContent(jsonStr);
            if (content) {
              accumulatedContent = ensureProperSpacing(accumulatedContent, content);
              
              if (citations) {
                accumulatedCitations = [...new Set([...accumulatedCitations, ...citations])];
              }
              
              setStreamingContent(prev => ({
                ...prev,
                [nodeId]: {
                  content: accumulatedContent,
                  citations: accumulatedCitations
                }
              }));

              setQaData(prev => {
                const updateNode = (nodes: QANode[]): QANode[] => {
                  return nodes.map(node => {
                    if (node.id === nodeId) {
                      return {
                        ...node,
                        analysis: accumulatedContent,
                        citations: accumulatedCitations
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
    } catch (error) {
      console.error('Error processing stream:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process the analysis stream. Please try again.",
      });
      throw error;
    }

    return accumulatedContent;
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      await analyzeQuestion(marketQuestion);
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to analyze the question. Please try again.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeQuestion = async (question: string, parentId: string | null = null, depth: number = 0) => {
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
        [nodeId]: {
          content: '',
          citations: []
        }
      }));

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: {
          marketId,
          question,
          isFollowUp: false
        }
      });

      if (analysisError) {
        console.error('Analysis error:', analysisError);
        throw analysisError;
      }

      if (!analysisData?.body) {
        throw new Error('No response data received from analysis');
      }

      const reader = new Response(analysisData.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      const analysis = await processStream(reader, nodeId);

      if (!parentId) {
        const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
          body: {
            marketId,
            question,
            parentContent: analysis,
            isFollowUp: true
          }
        });

        if (followUpError) throw followUpError;

        if (followUpData && Array.isArray(followUpData)) {
          for (const item of followUpData) {
            if (item?.question) {
              await analyzeQuestion(item.question, nodeId, depth + 1);
            }
          }
        }
      }

    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to analyze the question",
      });
    }
  };

  const renderCitations = (citations?: string[]) => {
    if (!citations?.length) return null;

    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-muted-foreground font-medium">Sources:</div>
        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => (
            <a
              key={index}
              href={citation}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <LinkIcon className="h-3 w-3" />
              {`[${index + 1}]`}
            </a>
          ))}
        </div>
      </div>
    );
  };

  const renderQANode = (node: QANode, depth: number = 0) => {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    const isExpanded = expandedNodes.has(node.id);
    const analysisContent = isStreaming ? streamContent?.content : node.analysis;
    const citations = isStreaming ? streamContent?.citations : node.citations;

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
                    <ReactMarkdown 
                      components={MarkdownComponents}
                      className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                    >
                      {analysisContent}
                    </ReactMarkdown>
                    {renderCitations(citations)}
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