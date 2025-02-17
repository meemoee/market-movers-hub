
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { QANode, SavedResearch, SavedQATree } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Json } from '@/integrations/supabase/types';

export function useQAData(marketId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [rootExtensions, setRootExtensions] = useState<QANode[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<QANode[][]>([]);

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

  const saveQATree = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const processedNodes = new Map<string, QANode>();
      
      const processNode = (node: QANode): QANode => {
        if (processedNodes.has(node.id)) {
          return processedNodes.get(node.id)!;
        }
        
        const processedNode: QANode = {
          id: node.id,
          question: node.question,
          analysis: node.analysis || '',
          citations: node.citations || [],
          children: node.children.map(child => processNode(child)),
          isExtendedRoot: node.isExtendedRoot || false,
          originalNodeId: node.originalNodeId
        };

        if (node.evaluation) {
          processedNode.evaluation = {
            score: Number(node.evaluation.score),
            reason: String(node.evaluation.reason)
          };
        }

        processedNodes.set(node.id, processedNode);
        return processedNode;
      };

      const processedMainTree = qaData.map(node => processNode(node));
      const processedExtensions = rootExtensions.map(ext => processNode(ext));
      const allNodes = Array.from(processedNodes.values());

      const { error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: 'QA Analysis',
          tree_data: allNodes as unknown as Json,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${allNodes.length} nodes including ${processedExtensions.length} extensions`,
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
  };

  const navigateToExtension = (extension: QANode) => {
    // First, we build a complete tree of the extension including all its nested extensions
    const buildCompleteTree = (node: QANode): QANode => {
      // Find all extensions that are based on this node's children
      const childExtensions = rootExtensions.filter(ext => 
        node.children.some(child => child.id === ext.originalNodeId)
      );
      
      // Recursively process children and their extensions
      const processedChildren = node.children.map(child => buildCompleteTree(child));
      
      // Add child extensions to the children array
      return {
        ...node,
        children: [...processedChildren, ...childExtensions.map(buildCompleteTree)]
      };
    };

    const completeExtensionTree = buildCompleteTree(extension);
    setNavigationHistory(prev => [...prev, qaData]);
    setQaData([completeExtensionTree]);
  };

  const navigateBack = () => {
    const previousTree = navigationHistory[navigationHistory.length - 1];
    if (previousTree) {
      setQaData(previousTree);
      setNavigationHistory(prev => prev.slice(0, -1));
    }
  };

  return {
    qaData,
    setQaData,
    rootExtensions,
    setRootExtensions,
    navigationHistory,
    savedResearch,
    savedQATrees,
    saveQATree,
    navigateToExtension,
    navigateBack
  };
}
