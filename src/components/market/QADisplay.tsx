import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QANode, StreamingContent, SavedResearch, SavedQATree, QADisplayProps } from './qa/types';
import { QANodeViewer } from './qa/QANodeViewer';
import {
  cleanStreamContent,
  processStreamContent,
  isCompleteMarkdown,
  isLineComplete,
  buildHistoryContext,
  findParentNodes,
  getPreviewText
} from './qa/utils';

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  console.log('QADisplay rendered with marketId:', marketId, 'and source component:', new Error().stack);
  
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [streamingContent, setStreamingContent] = useState<{ [key: string]: StreamingContent }>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [selectedResearch, setSelectedResearch] = useState<string>('none');
  const [selectedQATree, setSelectedQATree] = useState<string>('none');
  const [rootExtensions, setRootExtensions] = useState<QANode[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<QANode[][]>([]);
  const [originalTree, setOriginalTree] = useState<QANode[]>([]);
  const queryClient = useQueryClient();

  const navigateToExtension = (extension: QANode) => {
    setNavigationHistory(prev => [...prev, qaData]);
    setQaData([extension]);
  };

  const navigateBack = () => {
    const previousTree = navigationHistory[navigationHistory.length - 1];
    if (previousTree) {
      setQaData(previousTree);
      setNavigationHistory(prev => prev.slice(0, -1));
    }
  };

  const { data: savedResearch } = useQuery<SavedResearch[]>({
    queryKey: ['saved-research', marketId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as SavedResearch[]) || [];
    },
  });

  const { data: savedQATrees } = useQuery<SavedQATree[]>({
    queryKey: ['saved-qa-trees', marketId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('qa_trees')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data?.map(tree => ({
        ...tree,
        tree_data: tree.tree_data as unknown as QANode[]
      })) || []) as SavedQATree[];
    },
  });

  async function saveQATree() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const serializeNode = (node: QANode): Record<string, any> => ({
        id: node.id,
        question: node.question,
        analysis: node.analysis || '',
        children: node.children.map(serializeNode),
        citations: node.citations || [],
        isExtendedRoot: Boolean(node.isExtendedRoot),
        originalNodeId: node.originalNodeId || null,
        evaluation: node.evaluation
      });

      const treeToSave = [
        ...originalTree,
        ...rootExtensions
      ];

      console.log('Save Debug:', {
        originalTree: originalTree.map(n => ({ id: n.id, question: n.question })),
        extensions: rootExtensions.map(n => ({ id: n.id, question: n.question })),
        totalNodes: treeToSave.length
      });

      const serializedData = treeToSave.map(serializeNode);

      const { data, error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: marketQuestion,
          tree_data: serializedData,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${originalTree.length} original nodes and ${rootExtensions.length} extensions`,
      });

      await queryClient.invalidateQueries({ queryKey: ['saved-qa-trees', marketId] });

    } catch (error) {
      console.error('Error saving QA tree:', error);
      toast({
        variant: "destructive",
        title: "Save Error",
        description: error instanceof Error ? error.message : "Failed to save the QA tree",
      });
    }
  }

  async function processStream(reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> {
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
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        const { content, citations } = cleanStreamContent(jsonStr);
        if (content) {
          accumulatedContent += content;
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
  }

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

      const currentNode: QANode = {
        id: nodeId,
        question,
        analysis,
        children: []
      };
      await evaluateQAPair(currentNode);

      if (!parentId) {
        const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
          body: JSON.stringify({ 
            marketId, 
            question, 
            parentContent: analysis, 
            isFollowUp: true,
            researchContext: selectedResearchData ? {
              analysis: selectedResearchData.analysis,
              probability: selectedResearchData.probability,
              areasForResearch: selectedResearchData.areas_for_research
            } : null
          }),
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
      setOriginalTree(qaData);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      newSet.has(nodeId) ? newSet.delete(nodeId) : newSet.add(nodeId);
      return newSet;
    });
  };

  const populateStreamingContent = (nodes: QANode[]) => {
    nodes.forEach(node => {
      setStreamingContent(prev => ({
        ...prev,
        [node.id]: {
          content: node.analysis,
          citations: node.citations || [],
        },
      }));
      if (node.children.length > 0) {
        populateStreamingContent(node.children);
      }
    });
  };

  const loadSavedQATree = async (treeData: any[]) => {
    console.log('Loading tree:', treeData);
    
    try {
      setStreamingContent({});
      setExpandedNodes(new Set());
      setCurrentNodeId(null);
      setNavigationHistory([]);

      const deserializeNode = (node: any): QANode => ({
        id: node.id,
        question: node.question,
        analysis: node.analysis || '',
        children: Array.isArray(node.children) ? node.children.map(deserializeNode) : [],
        citations: Array.isArray(node.citations) ? node.citations : [],
        isExtendedRoot: Boolean(node.isExtendedRoot),
        originalNodeId: node.originalNodeId || null,
        evaluation: node.evaluation
      });

      const deserializedNodes = treeData.map(deserializeNode);
      
      const mainTree = deserializedNodes.filter(node => !node.isExtendedRoot);
      const extensions = deserializedNodes.filter(node => node.isExtendedRoot);

      console.log('Load Debug:', {
        mainTreeNodes: mainTree.length,
        extensionNodes: extensions.length
      });

      if (mainTree.length === 0) {
        toast({
          variant: "destructive",
          title: "Load Error",
          description: "Could not find the original analysis tree",
        });
        return;
      }

      setOriginalTree(mainTree);
      setQaData(mainTree);
      setRootExtensions(extensions);

      const allNodeIds = new Set<string>();
      const collectNodeIds = (node: QANode) => {
        allNodeIds.add(node.id);
        node.children.forEach(collectNodeIds);
      };
      mainTree.forEach(collectNodeIds);
      setExpandedNodes(allNodeIds);

      const streamContent: { [key: string]: StreamingContent } = {};
      const populateContent = (node: QANode) => {
        if (node.analysis) {
          streamContent[node.id] = {
            content: node.analysis,
            citations: node.citations || [],
          };
        }
        node.children.forEach(populateContent);
      };

      [...mainTree, ...extensions].forEach(populateContent);
      setStreamingContent(streamContent);

    } catch (error) {
      console.error('Error loading QA tree:', error);
      toast({
        variant: "destructive",
        title: "Load Error",
        description: "Failed to load the QA tree",
      });
    }
  };

  const buildHistoryContext = (node: QANode, parentNodes: QANode[] = []): string => {
    const history = [...parentNodes, node];
    return history.map((n, index) => {
      const prefix = index === 0 ? 'Original Question' : `Follow-up Question ${index}`;
      return `${prefix}: ${n.question}\nAnalysis: ${n.analysis}\n`;
    }).join('\n');
  };

  const findParentNodes = (targetNodeId: string, nodes: QANode[], parentNodes: QANode[] = []): QANode[] | null => {
    for (const node of nodes) {
      if (node.id === targetNodeId) {
        return parentNodes;
      }
      if (node.children.length > 0) {
        const found = findParentNodes(targetNodeId, node.children, [...parentNodes, node]);
        if (found) return found;
      }
    }
    return null;
  };

  const handleExpandQuestion = async (node: QANode) => {
    const parentNodes = findParentNodes(node.id, qaData) || [];
    const historyContext = buildHistoryContext(node, parentNodes);
    
    setIsAnalyzing(true);
    try {
      const nodeId = `node-${Date.now()}-0`;
      setCurrentNodeId(nodeId);
      setExpandedNodes(prev => new Set([...prev, nodeId]));

      const newRootNode: QANode = {
        id: nodeId,
        question: node.question,
        analysis: '',
        children: [],
        isExtendedRoot: true,
        originalNodeId: node.id
      };

      setRootExtensions(prev => [...prev, newRootNode]);
      setQaData([newRootNode]);

      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question,
          isFollowUp: false,
          historyContext,
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

      const completeNode: QANode = {
        ...newRootNode,
        analysis
      };

      const { data: evaluationData, error: evaluationError } = await supabase.functions.invoke('evaluate-qa-pair', {
        body: { 
          question: completeNode.question,
          analysis: completeNode.analysis
        }
      });

      if (evaluationError) throw evaluationError;

      setQaData([completeNode]);
      setRootExtensions(prev => 
        prev.map(ext => ext.id === nodeId ? completeNode : ext)
      );

      const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question, 
          parentContent: analysis,
          historyContext,
          isFollowUp: true,
          researchContext: selectedResearchData ? {
            analysis: selectedResearchData.analysis,
            probability: selectedResearchData.probability,
            areasForResearch: selectedResearchData.areas_for_research
          } : null
        }),
      });
      
      if (followUpError) throw followUpError;

      for (const item of followUpData) {
        if (item?.question) {
          await analyzeQuestion(item.question, nodeId, 1);
        }
      }

    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to analyze the question",
      });
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  const isLineComplete = (line: string): boolean => {
    return /[.!?]$/.test(line.trim()) || isCompleteMarkdown(line);
  };

  const getNodeExtensions = (nodeId: string): QANode[] => {
    return rootExtensions.filter(ext => ext.originalNodeId === nodeId);
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
        prev.map(ext => 
          ext.id === node.id ? { ...ext, evaluation: data } : ext
        )
      );

    } catch (error) {
      console.error('Error evaluating QA pair:', error);
      toast({
        title: "Evaluation Error",
        description: "Failed to evaluate Q&A pair",
        variant: "destructive"
      });
    }
  };

  const getExtensionInfo = (node: QANode): string => {
    if (!node.isExtendedRoot) {
      const extensionCount = rootExtensions.filter(n => n.originalNodeId === node.id).length;
      return extensionCount > 0 ? ` (Expanded ${extensionCount} times)` : '';
    }
    return '';
  };

  const renderNode = (node: QANode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const nodeExtensions = getNodeExtensions(node.id);
    const streamContent = streamingContent[node.id];

    return (
      <QANodeViewer
        key={node.id}
        node={node}
        depth={depth}
        isStreaming={currentNodeId === node.id}
        streamContent={streamContent}
        isExpanded={isExpanded}
        nodeExtensions={nodeExtensions}
        getExtensionInfo={(node) => ''}
        toggleNode={toggleNode}
        navigateToExtension={navigateToExtension}
        handleExpandQuestion={handleExpandQuestion}
        renderSubNodes={(childNode, childDepth) => renderNode(childNode, childDepth)}
      />
    );
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
        {navigationHistory.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={navigateBack}
            className="mb-4 sm:mb-0"
          >
            ← Back to Previous Analysis
          </Button>
        )}
        <div className="flex-1 min-w-[200px] max-w-[300px]">
          <Select
            value={selectedResearch}
            onValueChange={setSelectedResearch}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select saved research" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No saved research</SelectItem>
              {savedResearch?.map((research) => (
                <SelectItem key={research.id} value={research.id}>
                  {research.query.substring(0, 50)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px] max-w-[300px]">
          <Select
            value={selectedQATree}
            onValueChange={(value) => {
              setSelectedQATree(value);
              setNavigationHistory([]);
              if (value !== 'none') {
                const tree = savedQATrees?.find(t => t.id === value);
                if (tree) {
                  loadSavedQATree(tree.tree_data);
                }
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select saved QA tree" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No saved QA tree</SelectItem>
              {savedQATrees?.map((tree) => (
                <SelectItem key={tree.id} value={tree.id}>
                  {tree.title.substring(0, 50)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
          <Button onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          {qaData.length > 0 && !isAnalyzing && (
            <Button onClick={saveQATree} variant="outline">
              Save Analysis
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-[500px] pr-4">
        {qaData.map(node => renderNode(node))}
      </ScrollArea>
    </Card>
  );
}
