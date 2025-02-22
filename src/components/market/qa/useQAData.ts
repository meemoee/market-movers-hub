
import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QANode, SavedResearch, SavedQATree } from './types';

export function useQAData(marketId: string, marketQuestion: string, marketDescription: string) {
  const { toast } = useToast();
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rootExtensions, setRootExtensions] = useState<QANode[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: savedResearch } = useQuery({
    queryKey: ['saved-research', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId);
      if (error) throw error;
      return data as SavedResearch[];
    }
  });

  const { data: savedQATrees } = useQuery({
    queryKey: ['saved-qa-trees', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qa_trees')
        .select('*')
        .eq('market_id', marketId);
      if (error) throw error;
      return data as SavedQATree[];
    }
  });

  const findNodeById = (nodeId: string, nodes: QANode[]): QANode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children.length > 0) {
        const found = findNodeById(nodeId, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const getFocusedView = (): QANode[] => {
    if (!focusedNodeId) return qaData;
    
    const focusedNode = findNodeById(focusedNodeId, qaData);
    if (focusedNode) return [focusedNode];
    
    const focusedExtension = rootExtensions.find(ext => ext.id === focusedNodeId);
    if (focusedExtension) return [focusedExtension];
    
    return qaData;
  };

  const findParentNodes = (targetNodeId: string, nodes: QANode[], parentNodes: QANode[] = []): QANode[] | null => {
    for (const node of nodes) {
      if (node.id === targetNodeId) return parentNodes;
      if (node.children.length > 0) {
        const found = findParentNodes(targetNodeId, node.children, [...parentNodes, node]);
        if (found) return found;
      }
    }
    return null;
  };

  const buildHistoryContext = (node: QANode, parentNodes: QANode[] = []): string => {
    const history = [...parentNodes, node];
    return history.map((n, index) => {
      const prefix = index === 0 ? 'Original Question' : `Follow-up Question ${index}`;
      return `${prefix}: ${n.question}\nAnalysis: ${n.analysis}\n`;
    }).join('\n');
  };

  const saveQATree = async () => {
    try {
      const { data, error } = await supabase
        .from('qa_trees')
        .insert([
          {
            market_id: marketId,
            title: marketQuestion,
            tree_data: qaData,
          }
        ]);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['saved-qa-trees', marketId] });
      toast({
        title: "Success",
        description: "QA tree saved successfully"
      });
    } catch (error) {
      console.error('Error saving QA tree:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save QA tree"
      });
    }
  };

  const loadSavedQATree = (treeData: QANode[]) => {
    setQaData(treeData);
    setExpandedNodes(new Set());
    setCurrentNodeId(null);
  };

  const handleExpandQuestion = async (node: QANode) => {
    if (!node.analysis) return;
    
    const parentNodes = findParentNodes(node.id, qaData) || [];
    const historyContext = buildHistoryContext(node, parentNodes);
    
    const newNodeId = `node-${Date.now()}`;
    setCurrentNodeId(newNodeId);
    
    try {
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: {
          marketId,
          question: node.question,
          isFollowUp: true,
          analysisContext: historyContext
        },
      });
      
      if (analysisError) throw analysisError;

      setRootExtensions(prev => [
        ...prev,
        {
          id: newNodeId,
          question: node.question,
          analysis: '',
          children: [],
          isExtendedRoot: true,
          parentNodeId: node.id,
        },
      ]);

      // Handle stream processing here...
      
    } catch (error) {
      console.error('Error expanding question:', error);
      toast({
        variant: "destructive",
        title: "Expansion Error",
        description: "Failed to expand question"
      });
    }
  };

  // Return all the state and functions needed by the components
  return {
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
    saveQATree,
    loadSavedQATree,
    handleExpandQuestion,
    queryClient
  };
}

