
import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import type { Components as MarkdownComponents } from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database } from '@/integrations/supabase/types';
import { InsightsDisplay } from "@/components/market/research/InsightsDisplay";

interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children: QANode[];
  isExtendedRoot?: boolean;
  originalNodeId?: string;
  evaluation?: {
    score: number;
    reason: string;
  };
}

interface StreamingContent {
  content: string;
  citations: string[];
}

type SavedResearch = Database['public']['Tables']['web_research']['Row'] & {
  areas_for_research: string[];
  sources: string[];
};

type SavedQATree = Database['public']['Tables']['qa_trees']['Row'] & {
  tree_data: QANode[];
};

interface FinalEvaluation {
  probability: string;
  areasForResearch: string[];
  analysis: string;
}

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription?: string;
}

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
  const [currentQATree, setCurrentQATree] = useState<QANode | null>(null);
  const [finalEvaluation, setFinalEvaluation] = useState<FinalEvaluation | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: savedTrees, isLoading: isLoadingTrees } = useQuery({
    queryKey: ['qa-trees', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qa_trees')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching saved trees:', error);
        throw error;
      }
      
      return data as SavedQATree[];
    },
    enabled: !!marketId,
  });

  // Function to handle node expansion toggle
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  // Function to load a saved tree
  const loadSavedTree = async (treeId: string) => {
    try {
      const { data, error } = await supabase
        .from('qa_trees')
        .select('*')
        .eq('id', treeId)
        .single();

      if (error) {
        console.error('Error loading tree:', error);
        toast({
          title: 'Error loading tree',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        setSelectedTreeId(treeId);
        setCurrentQATree(data.tree_data as unknown as QANode);
        
        if (data.final_evaluation) {
          setFinalEvaluation(data.final_evaluation as unknown as FinalEvaluation);
        } else {
          setFinalEvaluation(null);
        }
      }
    } catch (error) {
      console.error('Error in loadSavedTree:', error);
      toast({
        title: 'Unexpected error',
        description: 'Failed to load the selected tree.',
        variant: 'destructive',
      });
    }
  };

  // Choose the first tree by default when trees are loaded
  useEffect(() => {
    if (savedTrees && savedTrees.length > 0 && !selectedTreeId) {
      loadSavedTree(savedTrees[0].id);
    }
  }, [savedTrees, selectedTreeId]);

  // Recursive function to render a QA node and its children
  const renderQANode = (node: QANode, depth = 0): JSX.Element => {
    const isExpanded = !!expandedNodes[node.id];
    const hasChildren = node.children && node.children.length > 0;
    
    return (
      <div key={node.id} className={`qa-node ${depth > 0 ? 'ml-6' : ''}`}>
        <div 
          className={`qa-header flex items-start gap-3 p-3 rounded-lg ${
            isExpanded ? 'bg-accent/10' : 'hover:bg-accent/5'
          } cursor-pointer transition-colors`}
          onClick={() => toggleNode(node.id)}
        >
          <div className="mt-1">
            {hasChildren ? (
              isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">
              {node.question}
            </div>
            
            {isExpanded && (
              <div className="mt-3 space-y-3">
                {node.analysis && (
                  <div className="prose prose-sm max-w-none text-muted-foreground">
                    <ReactMarkdown>
                      {node.analysis}
                    </ReactMarkdown>
                  </div>
                )}
                
                {node.citations && node.citations.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <LinkIcon className="h-3 w-3" />
                      Citations
                    </div>
                    <div className="space-y-1.5">
                      {node.citations.map((citation, index) => (
                        <div key={index} className="text-xs text-muted-foreground">
                          {citation}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {node.evaluation && (
                  <div className="mt-3 p-3 bg-primary/5 rounded-md">
                    <div className="text-xs font-medium mb-1">Evaluation Score: {node.evaluation.score}/10</div>
                    <div className="text-xs text-muted-foreground">{node.evaluation.reason}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div className="qa-children mt-2 border-l-2 border-border pl-3">
            {node.children.map(childNode => renderQANode(childNode, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Function to research a specific area
  const handleResearchArea = (area: string) => {
    // Implementation for research area functionality
    console.log('Researching area:', area);
    toast({
      title: 'Research initiated',
      description: `Researching more on: ${area}`,
    });
  };

  return (
    <div className="space-y-4">
      {isLoadingTrees ? (
        <div className="flex items-center justify-center p-6">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : savedTrees && savedTrees.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <Select
              value={selectedTreeId || ''}
              onValueChange={(value) => loadSavedTree(value)}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select analysis tree" />
              </SelectTrigger>
              <SelectContent>
                {savedTrees.map((tree) => (
                  <SelectItem key={tree.id} value={tree.id}>
                    {new Date(tree.created_at).toLocaleString()} {tree.name ? `- ${tree.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['qa-trees', marketId] });
                setSelectedTreeId(null);
                setCurrentQATree(null);
              }}
            >
              Refresh
            </Button>
          </div>
          
          {finalEvaluation && (
            <InsightsDisplay
              probability={finalEvaluation.probability}
              areasForResearch={finalEvaluation.areasForResearch}
              reasoning={finalEvaluation.analysis}
              onResearchArea={handleResearchArea}
            />
          )}
          
          {currentQATree ? (
            <Card className="mt-4">
              <ScrollArea className="h-[600px] pr-4">
                <div className="p-4 space-y-3">
                  {renderQANode(currentQATree)}
                </div>
              </ScrollArea>
            </Card>
          ) : (
            <div className="text-center p-6 text-muted-foreground">
              Select a tree to view analysis
            </div>
          )}
        </>
      ) : (
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-primary/10 p-3 rounded-full">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-medium">No analysis trees available</h3>
            <p className="text-sm text-muted-foreground">
              Generate a new analysis tree to explore this market in depth.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
