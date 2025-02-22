import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { QANode } from './qa/types';
import { useQAData } from './qa/useQAData';
import { useStreamingContent } from './qa/useStreamingContent';
import { QANodeView } from './qa/QANodeView';
import { QAControls } from './qa/QAControls';

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription: string;
}

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedResearch, setSelectedResearch] = useState<string>('none');
  const [selectedQATree, setSelectedQATree] = useState<string>('none');

  const {
    qaData,
    setQaData,
    currentNodeId,
    setCurrentNodeId,
    expandedNodes,
    setExpandedNodes,
    rootExtensions,
    setRootExtensions,
    focusedNodeId,
    setFocusedNodeId,
    savedResearch,
    savedQATrees,
    findNodeById,
    getFocusedView,
    findParentNodes,
    buildHistoryContext,
    queryClient
  } = useQAData(marketId, marketQuestion, marketDescription);

  const {
    streamingContent,
    setStreamingContent,
    cleanStreamContent,
    processStreamContent,
    isLineComplete
  } = useStreamingContent();

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

  const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> => {
    let accumulatedContent = '';
    let accumulatedCitations: string[] = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const node = qaData.find(n => n.id === nodeId) || 
                      rootExtensions.find(n => n.id === nodeId);
          if (node && node.analysis) {
            console.log('Evaluating node after stream completion:', nodeId);
            await evaluateQAPair(node);
          }
          break;
        }
        const decoded = new TextDecoder().decode(value);
        buffer += decoded;

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (part.trim() && isLineComplete(part.trim())) {
            processPart(part);
            buffer = '';
          } else {
            processPart(part);
          }
        }
      }
    } catch (error) {
      console.error('Error processing stream:', error);
      throw error;
    }

    function processPart(text: string) {
      const lines = text.split('\n').filter(line => line.startsWith('data: '));
      for (const line of lines) {
        const { content, citations } = cleanStreamContent(line);
        if (content) {
          accumulatedContent = processStreamContent(content, accumulatedContent);
          accumulatedCitations = [...new Set([...accumulatedCitations, ...citations])];

          setStreamingContent(prev => ({
            ...prev,
            [nodeId]: {
              content: accumulatedContent,
              citations: accumulatedCitations,
            },
          }));
          
          setQaData(prev => {
            const updateNode = (nodes: QANode[]): QANode[] =>
              nodes.map(node => {
                if (node.id === nodeId) {
                  return {
                    ...node,
                    analysis: accumulatedContent,
                    citations: accumulatedCitations,
                  };
                }
                if (node.children.length > 0) {
                  return { ...node, children: updateNode(node.children) };
                }
                return node;
              });
            return updateNode(prev);
          });
        }
      }
    }

    return accumulatedContent;
  };

  const evaluateQAPair = async (node: QANode) => {
    if (!node.analysis || node.evaluation) {
      console.log('Skipping evaluation:', { nodeId: node.id, hasAnalysis: !!node.analysis, hasEvaluation: !!node.evaluation });
      return;
    }

    console.log('Starting evaluation for node:', node.id);

    try {
      const { data, error } = await supabase.functions.invoke('evaluate-qa-pair', {
        body: { 
          question: node.question,
          analysis: node.analysis,
          marketQuestion: marketQuestion,
          marketDescription: marketDescription
        }
      });

      if (error) throw error;

      console.log('Received evaluation:', { nodeId: node.id, evaluation: data });

      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(n => {
            if (n.id === node.id) {
              return { ...n, evaluation: data };
            }
            if (n.children.length > 0) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        return updateNode(prev);
      });

      setRootExtensions(prev => 
        prev.map(ext => ext.id === node.id ? { ...ext, evaluation: data } : ext)
      );

    } catch (error) {
      console.error('Error evaluating QA pair:', error);
      toast({
        variant: "destructive",
        title: "Evaluation Error",
        description: "Failed to evaluate Q&A pair"
      });
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
          children: [],
        };
        if (!parentId) return [newNode];
        const updateChildren = (nodes: QANode[]): QANode[] =>
          nodes.map(node => {
            if (node.id === parentId) return { ...node, children: [...node.children, newNode] };
            if (node.children.length > 0) return { ...node, children: updateChildren(node.children) };
            return node;
          });
        return updateChildren(prev);
      });

      setStreamingContent(prev => ({
        ...prev,
        [nodeId]: { content: '', citations: [] },
      }));

      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question, 
          isFollowUp: false,
          researchContext: selectedResearchData ? {
            analysis: selectedResearchData.analysis,
            probability: selectedResearchData.probability,
            areasForResearch: selectedResearchData.areas_for_research
          } : null
        }),
      });
      
      if (analysisError) throw analysisError;

      const reader = new Response(analysisData.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      const analysis = await processStream(reader, nodeId);
      console.log('Completed analysis for node', nodeId, ':', analysis);

      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(n => {
            if (n.id === nodeId) {
              return { ...n, analysis };
            }
            if (n.children.length > 0) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        return updateNode(prev);
      });

      // Evaluate after completion
      await evaluateQAPair({ id: nodeId, question, analysis, children: [] });

    } catch (error) {
      console.error('Error analyzing question:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Failed to analyze question"
      });
      throw error;
    }
  };

  const saveQATree = async () => {
    // TODO: Implement save functionality
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <QAControls
        isAnalyzing={isAnalyzing}
        selectedResearch={selectedResearch}
        setSelectedResearch={setSelectedResearch}
        selectedQATree={selectedQATree}
        setSelectedQATree={setSelectedQATree}
        savedResearch={savedResearch}
        savedQATrees={savedQATrees}
        onAnalyze={async () => {
          setIsAnalyzing(true);
          try {
            await analyzeQuestion(marketQuestion);
          } finally {
            setIsAnalyzing(false);
          }
        }}
        onSave={saveQATree}
        showSave={qaData.length > 0}
      />
      <ScrollArea className="h-[500px] pr-4">
        {(getFocusedView() ?? []).map(node => (
          <QANodeView
            key={node.id}
            node={node}
            depth={0}
            currentNodeId={currentNodeId}
            expandedNodes={expandedNodes}
            streamingContent={streamingContent}
            toggleNode={toggleNode}
            evaluateQAPair={evaluateQAPair}
            handleExpandQuestion={handleExpandQuestion}
          />
        ))}
      </ScrollArea>
    </Card>
  );
}
