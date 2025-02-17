
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { QANode, SavedResearch, SavedQATree } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Json } from '@/integrations/supabase/types';

// Constants from the supabase client configuration
const SUPABASE_URL = "https://lfmkoismabbhujycnqpn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWtvaXNtYWJiaHVqeWNucXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNzQ2NTAsImV4cCI6MjA1MjY1MDY1MH0.OXlSfGb1nSky4rF6IFm1k1Xl-kz7K_u3YgebgP_hBJc";

export function useQAData(marketId: string, marketQuestion: string, marketDescription: string) {
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

  const analyzeQuestion = async (question: string, selectedResearchId: string): Promise<string[]> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-qa-tree`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          question,
          marketId,
          parentContent: selectedResearchId,
          isFollowUp: true
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
      return []; // Return empty array instead of throwing
    }
  };

  const loadSavedQATree = async (treeData: QANode[]) => {
    console.log('Loading saved QA tree with raw data:', treeData);
    
    try {
      // Create a map of all nodes first
      const nodeMap = new Map<string, QANode>();
      
      // First pass: Create all nodes with minimal data
      treeData.forEach(node => {
        nodeMap.set(node.id, {
          ...node,
          children: [], // Initialize with empty array, will populate in second pass
          isExtendedRoot: node.isExtendedRoot || false,
          originalNodeId: node.originalNodeId
        });
      });

      // Second pass: Reconstruct the relationships
      treeData.forEach(node => {
        const currentNode = nodeMap.get(node.id);
        if (!currentNode) return;

        // Handle both array of IDs and array of nodes formats
        const childIds = Array.isArray(node.children) 
          ? node.children.map(child => typeof child === 'string' ? child : child.id)
          : [];

        // Reconstruct children array using the node map
        currentNode.children = childIds
          .map(id => nodeMap.get(id))
          .filter((child): child is QANode => child !== undefined);
      });

      // Separate extensions and main nodes
      const extensions = new Map<string, QANode>();
      const mainNodes = new Map<string, QANode>();
      
      nodeMap.forEach(node => {
        if (node.isExtendedRoot) {
          extensions.set(node.id, node);
        } else {
          mainNodes.set(node.id, node);
        }
      });

      // Find nodes that don't have a parent in the tree
      const allChildIds = new Set(
        Array.from(nodeMap.values())
          .flatMap(node => node.children)
          .map(child => child.id)
      );

      // Find nodes that aren't referenced as originalNodeId by any extension
      const allOriginalNodeIds = new Set(
        Array.from(extensions.values())
          .map(ext => ext.originalNodeId)
          .filter((id): id is string => id !== undefined)
      );

      // True root nodes are those that:
      // 1. Aren't children of any node
      // 2. Aren't extension nodes themselves
      // 3. Aren't referenced as originalNodeId by any extension
      const trueRootNodes = Array.from(mainNodes.values())
        .filter(node => 
          !allChildIds.has(node.id) && 
          !node.isExtendedRoot &&
          !allOriginalNodeIds.has(node.id)
        );

      console.log('Processing tree structure:', {
        trueRootNodes: trueRootNodes.map(n => ({ 
          id: n.id, 
          hasChildren: n.children.length > 0,
          childIds: n.children.map(c => c.id)
        })),
        extensions: Array.from(extensions.values()).map(n => ({ 
          id: n.id, 
          originalNodeId: n.originalNodeId,
          hasChildren: n.children.length > 0,
          childIds: n.children.map(c => c.id)
        }))
      });

      // Set the main tree and extensions
      if (trueRootNodes.length > 0) {
        setQaData(trueRootNodes);
      } else {
        // If no true root nodes found, find the base extension
        const baseExtension = Array.from(extensions.values())
          .find(ext => !Array.from(extensions.values())
            .some(other => other.children
              .some(child => child.id === ext.id)));
        
        if (baseExtension) {
          setQaData([baseExtension]);
        }
      }

      setRootExtensions(Array.from(extensions.values()));
      setNavigationHistory([]);

    } catch (error) {
      console.error('Error loading QA tree:', error);
      toast({
        variant: "destructive",
        title: "Load Error",
        description: "Failed to load the QA tree",
      });
    }
  };

  const navigateToExtension = (extension: QANode) => {
    const findAllChildExtensions = (nodeId: string): QANode[] => {
      // Find direct extensions of this node
      const directExtensions = rootExtensions.filter(ext => ext.originalNodeId === nodeId);
      
      // For each direct extension, get its children's extensions
      const childExtensions = directExtensions.flatMap(ext => {
        // Get extensions for ALL nodes in the extension's subtree
        const allSubtreeExtensions = [
          ext,
          ...ext.children.flatMap(child => [
            ...findAllChildExtensions(child.id),
            ...rootExtensions.filter(e => e.originalNodeId === child.id)
          ])
        ];
        return allSubtreeExtensions;
      });

      return childExtensions;
    };

    const buildCompleteTree = (node: QANode): QANode => {
      // Get all extensions for this node and its entire subtree
      const allExtensions = findAllChildExtensions(node.id);
      
      // Process children recursively
      const processedChildren = node.children.map(child => buildCompleteTree(child));
      
      // Create the complete node with all its extensions
      return {
        ...node,
        children: [
          ...processedChildren,
          ...allExtensions
            .filter(ext => ext.originalNodeId === node.id)
            .map(buildCompleteTree)
        ]
      };
    };

    console.log('Navigating to extension:', {
      extensionId: extension.id,
      originalNodeId: extension.originalNodeId,
      childCount: extension.children.length,
      rootExtensionsCount: rootExtensions.length
    });

    const completeExtensionTree = buildCompleteTree(extension);
    console.log('Built complete tree:', {
      rootId: completeExtensionTree.id,
      childCount: completeExtensionTree.children.length,
      allNodes: getAllNodes(completeExtensionTree).length
    });

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

  // Helper function to count all nodes in a tree
  const getAllNodes = (node: QANode): QANode[] => {
    return [
      node,
      ...node.children.flatMap(child => getAllNodes(child))
    ];
  };

  const handleExpandQuestion = async (node: QANode) => {
    try {
      // Create a continuation node that extends from the clicked node
      const continuationNode: QANode = {
        id: crypto.randomUUID(),
        question: `Continuation of: ${node.question}`,
        analysis: node.analysis,
        citations: node.citations || [],
        children: [],
        isExtendedRoot: true,
        originalNodeId: node.id  // Link to the parent node
      };

      // Process follow-up questions and ensure they link back to the continuation
      const followUps = await analyzeQuestion(node.question, node.analysis);
      const followUpNodes = followUps.map(q => ({
        id: crypto.randomUUID(),
        question: q,
        analysis: '',
        citations: [],
        children: [],
        originalNodeId: continuationNode.id  // Link to the continuation node
      }));

      continuationNode.children = followUpNodes;

      setRootExtensions(prev => [...prev, continuationNode]);
      return continuationNode;
    } catch (error) {
      console.error('Error expanding question:', error);
      toast({
        variant: "destructive",
        title: "Expansion Error",
        description: error instanceof Error ? error.message : "Failed to expand the question",
      });
      return null;
    }
  };

  const saveQATree = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const processedNodes = new Map<string, QANode>();
      
      const flattenTree = (node: QANode): void => {
        if (processedNodes.has(node.id)) {
          return;
        }
        
        // Create a processed version of this node with references to children
        const processedNode: QANode = {
          id: node.id,
          question: node.question,
          analysis: node.analysis || '',
          citations: node.citations || [],
          children: node.children, // Keep the actual QANode[] reference
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
        
        // Recursively process all children
        node.children.forEach(child => flattenTree(child));
      };

      // Process main tree and extensions
      qaData.forEach(node => flattenTree(node));
      rootExtensions.forEach(node => flattenTree(node));

      const allNodes = Array.from(processedNodes.values());

      // When saving to Supabase, convert to a serializable format
      const serializableNodes = allNodes.map(node => ({
        ...node,
        children: node.children.map(child => child.id) // Convert to IDs for storage
      }));

      const { error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: 'QA Analysis',
          tree_data: serializableNodes as unknown as Json,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${allNodes.length} nodes including ${rootExtensions.length} extensions`,
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
    rootExtensions,
    setRootExtensions,
    navigationHistory,
    setNavigationHistory,
    savedResearch,
    savedQATrees,
    saveQATree,
    navigateToExtension,
    navigateBack,
    loadSavedQATree,
    analyzeQuestion,
    handleExpandQuestion
  };
}
