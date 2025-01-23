import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from 'react-markdown';

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

  const analyzeQuestion = async (question: string, parentId: string | null = null, depth: number = 0) => {
    if (depth >= 3) return; // Max depth of 3
    
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
                  // Try to parse accumulated content as JSON
                  const parsedContent = JSON.parse(accumulatedContent);
                  if (parsedContent.analysis && parsedContent.questions) {
                    // We have a complete response
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

                    // Analyze child questions
                    for (const childQuestion of parsedContent.questions) {
                      await analyzeQuestion(childQuestion, nodeId, depth + 1);
                    }
                  }
                } catch (e) {
                  // Not valid JSON yet, keep accumulating
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
    
    try {
      await analyzeQuestion(marketQuestion);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  const renderQANode = (node: QANode, depth: number = 0) => {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    
    return (
      <div key={node.id} className="mb-4" style={{ marginLeft: `${depth * 20}px` }}>
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-medium mb-2">{node.question}</h3>
          {isStreaming && streamContent ? (
            <div className="text-sm text-muted-foreground">
              <ReactMarkdown>{streamContent}</ReactMarkdown>
            </div>
          ) : node.analysis && (
            <div className="text-sm text-muted-foreground">
              <ReactMarkdown>{node.analysis}</ReactMarkdown>
            </div>
          )}
        </div>
        {node.children.map(child => renderQANode(child, depth + 1))}
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
      
      <div className="mt-8">
        {qaData.map(node => renderQANode(node))}
      </div>
    </Card>
  );
}
