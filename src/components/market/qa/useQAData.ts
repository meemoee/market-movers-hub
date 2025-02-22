
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
      if (node.id === targetNodeId) return node;
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
    queryClient
  };
}
