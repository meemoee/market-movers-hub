import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const MarkdownComponents = {
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 mt-4">{children}</h3>,
  h4: ({ children }) => <h4 className="text-base font-semibold mb-2 mt-3">{children}</h4>,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-muted pl-4 italic my-3">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ inline, children }) => {
    return inline ? (
      <code className="bg-muted/30 rounded px-1 py-0.5 text-sm font-mono">{children}</code>
    ) : (
      <code className="block bg-muted/30 rounded p-3 my-3 text-sm font-mono whitespace-pre-wrap">
        {children}
      </code>
    );
  },
  em: ({ children }) => <em className="italic">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

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

export function QADisplay({ marketId, marketQuestion }: QADisplayProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [streamingContent, setStreamingContent] = useState<{[key: string]: StreamingContent}>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  const cleanStreamContent = (chunk: string): { content: string; citations: string[] } => {
    try {
      const parsed = JSON.parse(chunk);
      const content = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || '';
      const citations = parsed.citations || [];
      
      if (!content) {
        return { content: '', citations: [] };
      }
      
      const unescapedContent = content
        .replace(/\\([\\/*_`~[\]])/g, '$1')
        .replace(/\\n/g, '\n')
        .replace(/\\s/g, ' ');
      
      const cleanedContent = unescapedContent
        .replace(/\{"id":".*"\}$/, '')
        .replace(/(\s*)\*\*(.*?)\*\*(\s*)/g, '$1**$2**$3')
        .replace(/(\s*)(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)(\s*)/g, '$1*$3*$4')
        .replace(/(\s*)__(.+?)__(\s*)/g, '$1__$2__$3')
        .replace(/(\s*)`(.+?)`(\s*)/g, '$1`$2`$3')
        .replace(/(\s*)~~(.+?)~~(\s*)/g, '$1~~$2~~$3')
        .replace(/^(\s*[-*+]\s+)/gm, '$1')
        .replace(/^(\s*\d+\.\s+)/gm, '$1')
        .replace(/^(\s*>\s+)/gm, '$1')
        .replace(/(\s*)\\\{([^}]+)\}\{([^}]+)\}(\s*)/g, '$1\\{$2}{$3}$4')
        .replace(/(\s*)\\text\{([^}]+)\}(\s*)/g, '$1\\text{$2}$3')
        .replace(/\\approx/g, '≈')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/[ \t]+/g, ' ')
        .replace(/^\s+/gm, (match) => match)
        .replace(/\s+$/gm, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/([.!?])\s*(?=\S)/g, '$1 ');
  
      return {
        content: cleanedContent,
        citations: citations
      };
    } catch (e) {
      console.error('Error parsing stream chunk:', e);
      try {
        const match = chunk.match(/"content":"(.*?)(?<!\\)"/);
        if (match && match[1]) {
          return {
            content: match[1].replace(/\\"/g, '"').replace(/\\s/g, ' '),
            citations: []
          };
        }
      } catch {
        return { content: '', citations: [] };
      }
      return { content: '', citations: [] };
    }
  };

  const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> => {
    let accumulatedContent = '';
    let accumulatedCitations: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            const { content, citations } = cleanStreamContent(jsonStr);
            if (content) {
              accumulatedContent += content;
              
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
      throw error;
    }

    return accumulatedContent;
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
        body: JSON.stringify({
          marketId,
          question,
          isFollowUp: false
        })
      });

      if (analysisError) throw analysisError;

      const reader = new Response(analysisData.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      const analysis = await processStream(reader, nodeId);

      if (!parentId) {
        const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
          body: JSON.stringify({
            marketId,
            question,
            parentContent: analysis,
            isFollowUp: true
          })
        });

        if (followUpError) throw followUpError;

        const followUpQuestions = followUpData;

        for (const item of followUpQuestions) {
          if (item?.question) {
            await analyzeQuestion(item.question, nodeId, depth + 1);
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

  const renderCitations = (citations?: string[]) => {
    if (!citations?.length) return null;

    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-muted-foreground font-medium">Sources:</div>
        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => (
            
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
                      remarkPlugins={[remarkGfm]}
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
