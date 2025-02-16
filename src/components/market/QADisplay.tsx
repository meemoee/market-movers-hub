import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import type { Components as MarkdownComponents } from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon, ArrowRight, RotateCw } from "lucide-react";
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

interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children: QANode[];
  expansionHistory?: {
    analysisId: string;
    timestamp: number;
  }[];
  currentExpansion?: {
    id: string;
    analysis: string;
    children: QANode[];
    citations?: string[];
    evaluation?: {
      score: number;
      reason: string;
    };
  };
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

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription: string;
}

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [qaData, setQaData] = useState<QANode[]>([]);
  const [streamingContent, setStreamingContent] = useState<{ [key: string]: StreamingContent }>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [selectedResearch, setSelectedResearch] = useState<string>('none');
  const [selectedQATree, setSelectedQATree] = useState<string>('none');
  const queryClient = useQueryClient();

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

  const isCompleteMarkdown = (text: string): boolean => {
    const stack: string[] = [];
    let inCode = false;
    let inList = false;
    let currentNumber = '';
    
    if (text.match(/[a-zA-Z]$/)) return false;
    if (text.match(/\([^)]*$/)) return false;
    if (text.match(/\[[^\]]*$/)) return false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      const prevChar = text[i - 1];
      
      if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
        inCode = !inCode;
        i += 2;
        continue;
      }
      
      if (inCode) continue;
      
      if (/^\d$/.test(char)) {
        currentNumber += char;
        continue;
      }
      if (char === '.' && currentNumber !== '') {
        inList = true;
        currentNumber = '';
        continue;
      }
      
      if (char === '\n') {
        inList = false;
        currentNumber = '';
      }
      
      if ((char === '*' || char === '_')) {
        if (nextChar === char) {
          if (stack.length > 0 && stack[stack.length - 1] === char + char) {
            stack.pop();
          } else {
            stack.push(char + char);
          }
          i++;
        } else {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          } else {
            stack.push(char);
          }
        }
      }
    }
    
    return stack.length === 0 && !inCode && !inList;
  };

  const cleanStreamContent = (chunk: string): { content: string; citations: string[] } => {
    try {
      let dataStr = chunk;
      if (dataStr.startsWith('data: ')) {
        dataStr = dataStr.slice(6);
      }
      dataStr = dataStr.trim();
      
      if (dataStr === '[DONE]') {
        return { content: '', citations: [] };
      }
      
      const parsed = JSON.parse(dataStr);
      const content = parsed.choices?.[0]?.delta?.content || 
                     parsed.choices?.[0]?.message?.content || '';
      return { content, citations: [] };
    } catch (e) {
      console.debug('Chunk parse error (expected during streaming):', e);
      return { content: '', citations: [] };
    }
  };

  const processStreamContent = (content: string, prevContent: string = ''): string => {
    let combinedContent = prevContent + content;
    
    combinedContent = combinedContent
      .replace(/\*\*\s*\*\*/g, '')
      .replace(/\*\s*\*/g, '')
      .replace(/`\s*`/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/:{2,}/g, ':')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (combinedContent.match(/[a-zA-Z]$/)) {
      combinedContent += '.';
    }
    
    return combinedContent;
  };

  const handleExpandQuestion = async (node: QANode) => {
    setIsAnalyzing(true);
    try {
      const expansionId = `expansion-${Date.now()}`;
      
      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(n => {
            if (n.id === node.id) {
              return {
                ...n,
                expansionHistory: [
                  ...(n.expansionHistory || []),
                  { analysisId: expansionId, timestamp: Date.now() }
                ],
                currentExpansion: {
                  id: expansionId,
                  analysis: '',
                  children: [],
                }
              };
            }
            if (n.children.length > 0) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        return updateNode(prev);
      });

      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question,
          isFollowUp: true,
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

      const analysis = await processStream(reader, expansionId);

      const { data: evaluationData, error: evaluationError } = await supabase.functions.invoke('evaluate-qa-pair', {
        body: { 
          question: node.question,
          analysis: analysis
        }
      });

      if (evaluationError) throw evaluationError;

      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(n => {
            if (n.id === node.id) {
              return {
                ...n,
                currentExpansion: {
                  id: expansionId,
                  analysis,
                  children: [],
                  evaluation: evaluationData
                }
              };
            }
            if (n.children.length > 0) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        return updateNode(prev);
      });

      const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question, 
          parentContent: analysis,
          isFollowUp: true
        }),
      });
      
      if (followUpError) throw followUpError;

      for (const item of followUpData) {
        if (item?.question) {
          await analyzeQuestion(item.question, expansionId, 1);
        }
      }

    } catch (error) {
      console.error('Expansion error:', error);
      toast({
        variant: "destructive",
        title: "Expansion Error",
        description: error instanceof Error ? error.message : "Failed to expand the analysis",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderQANode = (node: QANode) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasExpansions = node.expansionHistory && node.expansionHistory.length > 0;
    
    return (
      <div key={node.id} className="border border-border rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-medium">
            {node.question}
            {hasExpansions && (
              <span className="ml-2 text-xs text-muted-foreground">
                (Expanded {node.expansionHistory?.length} times)
              </span>
            )}
          </h3>
          <button
            onClick={() => toggleNode(node.id)}
            className="p-1 hover:bg-accent/50 rounded-full"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        
        {isExpanded && (
          <div className="space-y-4">
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>
                {node.analysis}
              </ReactMarkdown>
            </div>
            
            {node.currentExpansion ? (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Latest Analysis</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExpandQuestion(node)}
                    className="h-8"
                  >
                    <RotateCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>
                    {node.currentExpansion.analysis}
                  </ReactMarkdown>
                </div>
                {node.currentExpansion.evaluation && (
                  <div className="mt-4 p-2 bg-accent/50 rounded">
                    <div className="text-xs font-medium mb-1">
                      Score: {node.currentExpansion.evaluation.score}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {node.currentExpansion.evaluation.reason}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExpandQuestion(node)}
                disabled={isAnalyzing}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Expand Analysis
              </Button>
            )}
            
            {node.children.length > 0 && (
              <div className="mt-4 pl-4 border-l border-border">
                {node.children.map(child => renderQANode(child))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 mt-4 bg-card">
      <div className="flex items-center gap-4 mb-4">
        <Select
          value={selectedResearch}
          onValueChange={setSelectedResearch}
        >
          <SelectTrigger className="w-[200px]">
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
        
        <Button onClick={() => analyzeQuestion(marketQuestion)} disabled={isAnalyzing}>
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </Button>
      </div>

      <ScrollArea className="h-[500px]">
        {qaData.map(node => renderQANode(node))}
      </ScrollArea>
    </Card>
  );
}
