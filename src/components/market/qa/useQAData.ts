
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { QANode, SavedResearch, SavedQATree } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Json } from '@/integrations/supabase/types';

export function useQAData(marketId: string, marketQuestion: string, marketDescription: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState(new Set<string>());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  const { data: savedResearch } = useQuery({
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

  const { data: savedQATrees } = useQuery({
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

  const buildTree = (nodes: QANode[]): QANode[] => {
    const nodeMap = new Map<string, QANode>();
    const roots: QANode[] = [];

    // Initialize nodes with empty children arrays
    nodes.forEach(node => {
      nodeMap.set(node.id, {
        ...node,
        children: []
      });
    });

    // Build the tree structure
    nodes.forEach(node => {
      const processedNode = nodeMap.get(node.id)!;
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(processedNode);
        } else {
          console.warn(`Parent node ${node.parentId} not found for node ${node.id}`);
          roots.push(processedNode);
        }
      } else {
        roots.push(processedNode);
      }
    });

    return roots;
  };

  const analyzeQuestion = async (question: string, parentId: string | null = null): Promise<string[]> => {
    try {
      const selectedResearchId = null; // Update this if you need to pass research context
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qa-tree`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          question,
          marketId,
          parentContent: selectedResearchId,
          isFollowUp: parentId !== null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate follow-up questions');
      }

      const data = await response.json();
      return data.map((item: { question: string }) => item.question);
    } catch (error) {
      console.error('Error analyzing question:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to analyze the question",
      });
      return [];
    }
  };

  const loadSavedQATree = async (treeData: QANode[]) => {
    try {
      // Clear current state
      setQaData([]);
      setExpandedNodes(new Set());

      // Build tree from flat data
      const roots = buildTree(treeData);
      
      // Set all nodes as expanded initially
      const allNodeIds = new Set<string>();
      const collectNodeIds = (nodes: QANode[]) => {
        nodes.forEach(node => {
          allNodeIds.add(node.id);
          collectNodeIds(node.children);
        });
      };
      collectNodeIds(roots);
      
      setExpandedNodes(allNodeIds);
      setQaData(roots);

      console.log('Loaded QA tree:', {
        rootCount: roots.length,
        totalNodes: allNodeIds.size
      });
    } catch (error) {
      console.error('Error loading QA tree:', error);
      toast({
        variant: "destructive",
        title: "Load Error",
        description: "Failed to load the QA tree",
      });
    }
  };

  const handleExpandQuestion = async (node: QANode) => {
    setCurrentNodeId(node.id);
    try {
      const followUps = await analyzeQuestion(node.question, node.id);
      
      const followUpNodes: QANode[] = followUps.map(q => ({
        id: crypto.randomUUID(),
        parentId: node.id,
        question: q,
        analysis: '',
        citations: [],
        children: []
      }));

      // Update the tree by adding new nodes to their parent
      setQaData(prev => {
        const updateChildren = (nodes: QANode[]): QANode[] => {
          return nodes.map(n => {
            if (n.id === node.id) {
              return {
                ...n,
                children: [...n.children, ...followUpNodes]
              };
            }
            if (n.children.length > 0) {
              return {
                ...n,
                children: updateChildren(n.children)
              };
            }
            return n;
          });
        };
        return updateChildren(prev);
      });

      // Expand the parent node to show new children
      setExpandedNodes(prev => {
        const newExpanded = new Set(prev);
        newExpanded.add(node.id);
        followUpNodes.forEach(n => newExpanded.add(n.id));
        return newExpanded;
      });

    } catch (error) {
      console.error('Error expanding question:', error);
      toast({
        variant: "destructive",
        title: "Expansion Error",
        description: error instanceof Error ? error.message : "Failed to expand the question",
      });
    } finally {
      setCurrentNodeId(null);
    }
  };

  const saveQATree = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Flatten the tree for storage
      const flattenTree = (node: QANode): QANode[] => {
        return [node, ...node.children.flatMap(child => flattenTree(child))];
      };

      const allNodes = qaData.flatMap(node => flattenTree(node));

      const { error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: marketQuestion,
          tree_data: allNodes as unknown as Json,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${allNodes.length} nodes`,
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

  return {
    qaData,
    setQaData,
    expandedNodes,
    setExpandedNodes,
    currentNodeId,
    setCurrentNodeId,
    savedResearch,
    savedQATrees,
    saveQATree,
    loadSavedQATree,
    analyzeQuestion,
    handleExpandQuestion
  };
}
