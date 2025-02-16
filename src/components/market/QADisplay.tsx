import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children?: QANode[];
  isExtendedRoot?: boolean;
  originalNodeId?: string;
  evaluation?: {
    score: number;
    reason: string;
  };
}

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription?: string;
}

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<QANode[][]>([]);
  const [rootExtensions, setRootExtensions] = useState<QANode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<Record<string, { content: string; citations: string[] }>>({});
  const queryClient = useQueryClient();

  const saveQATree = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const convertNodeToJson = (node: QANode): Record<string, any> => ({
        id: node.id,
        question: node.question,
        analysis: node.analysis,
        citations: node.citations || [],
        children: node.children ? node.children.map(convertNodeToJson) : [],
        isExtendedRoot: node.isExtendedRoot || false,
        originalNodeId: node.originalNodeId,
        evaluation: node.evaluation ? {
          score: node.evaluation.score,
          reason: node.evaluation.reason
        } : undefined
      });

      const allTrees = navigationHistory.length > 0 ? [...navigationHistory] : [];
      if (!allTrees.some(tree => tree[0]?.id === qaData[0]?.id)) {
        allTrees.push(qaData);
      }

      const sequenceData = allTrees.map((tree, index) => ({
        treeIndex: index,
        rootNodeId: tree[0]?.id,
        isMain: index === 0,
        extensions: rootExtensions
          .filter(ext => ext.originalNodeId && tree.some(node => node.id === ext.originalNodeId))
          .map(ext => ({
            extensionNodeId: ext.id,
            originalNodeId: ext.originalNodeId
          }))
      }));

      let treesToSave = allTrees.flatMap(tree => tree);
      rootExtensions.forEach(extension => {
        if (!treesToSave.some(node => node.id === extension.id)) {
          treesToSave.push(extension);
        }
      });

      const treeDataJson = treesToSave.map(convertNodeToJson);
      
      console.log('Saving complete QA tree structure:', {
        totalNodes: treeDataJson.length,
        navigationHistoryDepth: navigationHistory.length,
        sequence: sequenceData,
        currentTree: qaData.map(n => n.id),
        extensions: rootExtensions.map(ext => ({
          id: ext.id,
          originalNodeId: ext.originalNodeId,
        }))
      });

      const { data, error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: marketQuestion,
          tree_data: treeDataJson,
          sequence_data: sequenceData,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved complete QA tree with ${treesToSave.length} nodes including ${rootExtensions.length} extensions`,
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

  const loadSavedQATree = async (treeData: QANode[], sequenceData: any[] = []) => {
    console.log('Loading saved QA tree with:', { 
      rawData: treeData,
      sequence: sequenceData
    });
    
    try {
      setStreamingContent({});
      setCurrentNodeId(null);
      setNavigationHistory([]);
      
      const nodeMap = new Map<string, QANode>();
      treeData.forEach(node => {
        nodeMap.set(node.id, node);
        const mapChildren = (n: QANode) => {
          if (n.children) {
            n.children.forEach(child => {
              nodeMap.set(child.id, child);
              mapChildren(child);
            });
          }
        };
        mapChildren(node);
      });

      if (sequenceData && sequenceData.length > 0) {
        const mainSequence = sequenceData.find(seq => seq.isMain);
        if (mainSequence && mainSequence.rootNodeId) {
          const mainRoot = nodeMap.get(mainSequence.rootNodeId);
          if (mainRoot) {
            setQaData([mainRoot]);
            
            const orderedTrees = sequenceData
              .filter(seq => seq.rootNodeId)
              .map(seq => {
                const rootNode = nodeMap.get(seq.rootNodeId);
                return rootNode ? [rootNode] : null;
              })
              .filter((tree): tree is QANode[] => tree !== null);
            
            setNavigationHistory(orderedTrees);
          }
        }

        const extensions = treeData.filter(node => 
          node.isExtendedRoot && 
          sequenceData.some(seq => 
            seq.extensions?.some((ext: any) => ext.extensionNodeId === node.id)
          )
        );
        setRootExtensions(extensions);
      } else {
        const mainRoots = treeData.filter(node => !node.isExtendedRoot);
        const extensions = treeData.filter(node => node.isExtendedRoot);
        
        if (mainRoots.length > 0) {
          setQaData(mainRoots);
        } else if (extensions.length > 0) {
          const baseExtension = extensions[0];
          setQaData([baseExtension]);
        }
        
        setRootExtensions(extensions);
      }

      const allNodes = new Set<string>();
      const populateNodeContent = (node: QANode) => {
        allNodes.add(node.id);
        setStreamingContent(prev => ({
          ...prev,
          [node.id]: {
            content: node.analysis || '',
            citations: node.citations || [],
          },
        }));
        
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => populateNodeContent(child));
        }
      };

      treeData.forEach(node => populateNodeContent(node));
      setExpandedNodes(allNodes);

      console.log('Finished loading tree:', {
        qaData: qaData,
        navigationHistory: navigationHistory,
        rootExtensions: rootExtensions,
        expandedNodes: Array.from(allNodes),
        nodeMapSize: nodeMap.size
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

  const renderNode = (node: QANode) => {
    const isExpanded = expandedNodes.has(node.id);
    const content = streamingContent[node.id];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="mb-4">
        <Card className="p-4 hover:shadow-md transition-shadow">
          <div className="space-y-2">
            <h3 className="font-medium text-lg">{node.question}</h3>
            
            {content && (
              <div className="prose prose-sm max-w-none dark:prose-invert mt-2">
                {content.content}
                {content.citations && content.citations.length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium">Citations:</h4>
                    <ul className="list-disc pl-5 text-sm">
                      {content.citations.map((citation, index) => (
                        <li key={index}>{citation}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {node.evaluation && (
              <div className="mt-2 p-2 bg-muted rounded-md">
                <p className="text-sm">
                  <span className="font-medium">Evaluation Score: </span>
                  {node.evaluation.score}
                </p>
                <p className="text-sm mt-1">
                  <span className="font-medium">Reason: </span>
                  {node.evaluation.reason}
                </p>
              </div>
            )}
          </div>
        </Card>

        {hasChildren && isExpanded && (
          <div className="ml-8 mt-2 space-y-4 border-l-2 border-muted pl-4">
            {node.children!.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (!qaData.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {qaData.map(node => renderNode(node))}
      
      {rootExtensions.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium mb-4">Extended Analysis</h3>
          {rootExtensions.map(node => renderNode(node))}
        </div>
      )}
    </div>
  );
}
