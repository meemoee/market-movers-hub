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
import { InsightsDisplay } from "@/components/market/insights/InsightsDisplay";

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
  sequence_data?: {
    id: string;
    probability: string;
    areasForResearch: string[];
    analysis: string;
  }[];
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
  const [finalEvaluation, setFinalEvaluation] = useState<FinalEvaluation | null>(null);
  const [isFinalEvaluating, setIsFinalEvaluating] = useState(false);
  const [sequenceData, setSequenceData] = useState<{
    id: string;
    probability: string;
    areasForResearch: string[];
    analysis: string;
  }[]>([]);
  const [currentExtensionId, setCurrentExtensionId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const navigateToExtension = (extension: QANode) => {
    setNavigationHistory(prev => [...prev, qaData]);
    setQaData([extension]);
    setCurrentExtensionId(extension.id);
    
    const extensionEvaluation = sequenceData.find(seq => seq.id === extension.id);
    if (extensionEvaluation) {
      setFinalEvaluation({
        probability: extensionEvaluation.probability,
        areasForResearch: extensionEvaluation.areasForResearch,
        analysis: extensionEvaluation.analysis
      });
    } else {
      generateFinalEvaluationForExtension(extension);
    }
  };

  const navigateBack = () => {
    const previousTree = navigationHistory[navigationHistory.length - 1];
    if (previousTree) {
      setQaData(previousTree);
      setNavigationHistory(prev => prev.slice(0, -1));
      setCurrentExtensionId(null);
      
      if (navigationHistory.length === 1) {
        const mainEvaluation = sequenceData.find(seq => seq.id === 'main');
        if (mainEvaluation) {
          setFinalEvaluation({
            probability: mainEvaluation.probability,
            areasForResearch: mainEvaluation.areasForResearch,
            analysis: mainEvaluation.analysis
          });
        } else {
          setFinalEvaluation(null);
        }
      }
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
        tree_data: tree.tree_data as unknown as QANode[],
        sequence_data: tree.sequence_data as unknown as {
          id: string;
          probability: string;
          areasForResearch: string[];
          analysis: string;
        }[]
      })) || []) as SavedQATree[];
    },
  });

  const isCompleteMarkdown = (text: string): boolean => {
    const stack: string[] = [];
    let inCode = false;
    let inList = false;
    let currentNumber = '';
    
    if (text.match(/[a-zA-Z]$/)) return false; // Ends with a letter
    if (text.match(/\([^)]*$/)) return false; // Unclosed parenthesis
    if (text.match(/\[[^\]]*$/)) return false; // Unclosed square bracket
    
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
          i++; // Skip next character
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
      return { content: '', citations: [] };
    }
  };

  const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> => {
    let fullContent = '';
    let fullCitations: string[] = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            processPart(buffer);
          }
          
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
          if (part.trim()) {
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
          fullContent += content;
          fullCitations = [...new Set([...fullCitations, ...citations])];

          setStreamingContent(prev => {
            return {
              ...prev,
              [nodeId]: {
                content: fullContent,
                citations: fullCitations,
              },
            };
          });
        }
      }
      
      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(node => {
            if (node.id === nodeId) {
              return {
                ...node,
                analysis: fullContent,
                citations: fullCitations,
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

    return fullContent;
  };

  const flattenQATree = (nodes: QANode[]): string => {
    return nodes.map(node => {
      const childrenText = node.children.length > 0 
        ? `\nFollow-up Questions:\n${flattenQATree(node.children)}` 
        : '';
      
      return `Question: ${node.question}\nAnalysis: ${node.analysis}${childrenText}`;
    }).join('\n\n');
  };

  const generateFinalEvaluationForExtension = async (extension: QANode) => {
    setIsFinalEvaluating(true);
    try {
      const qaContext = flattenQATree([extension]);
      
      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      const researchContext = selectedResearchData ? {
        analysis: selectedResearchData.analysis,
        probability: selectedResearchData.probability,
        areasForResearch: selectedResearchData.areas_for_research
      } : null;
      
      console.log("Calling evaluate-qa-final for extension:", { 
        extensionId: extension.id,
        marketQuestion, 
        qaContextLength: qaContext.length
      });
      
      const { data, error } = await supabase.functions.invoke('evaluate-qa-final', {
        body: { 
          marketQuestion, 
          qaContext,
          researchContext
        },
      });
      
      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }
      
      console.log("Final evaluation result for extension:", data);
      
      setFinalEvaluation(data);
      
      setSequenceData(prev => [
        ...prev.filter(item => item.id !== extension.id),
        {
          id: extension.id,
          probability: data.probability,
          areasForResearch: data.areasForResearch,
          analysis: data.analysis
        }
      ]);
      
      toast({
        title: "Extension Evaluation Complete",
        description: "This continuation has been evaluated.",
      });
    } catch (error) {
      console.error('Extension evaluation error:', error);
      toast({
        variant: "destructive",
        title: "Evaluation Error",
        description: error instanceof Error ? error.message : "Failed to generate evaluation for continuation",
      });
    } finally {
      setIsFinalEvaluating(false);
    }
  };

  const generateFinalEvaluation = async () => {
    if (qaData.length === 0) return;
    
    setIsFinalEvaluating(true);
    try {
      const qaContext = flattenQATree(qaData);
      
      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      const researchContext = selectedResearchData ? {
        analysis: selectedResearchData.analysis,
        probability: selectedResearchData.probability,
        areasForResearch: selectedResearchData.areas_for_research
      } : null;
      
      console.log("Calling evaluate-qa-final with:", { 
        marketQuestion, 
        qaContextLength: qaContext.length,
        hasResearchContext: !!researchContext
      });
      
      const { data, error } = await supabase.functions.invoke('evaluate-qa-final', {
        body: { 
          marketQuestion, 
          qaContext,
          researchContext
        },
      });
      
      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }
      
      console.log("Final evaluation result:", data);
      
      setFinalEvaluation(data);
      
      setSequenceData(prev => [
        ...prev.filter(item => item.id !== 'main'),
        {
          id: 'main',
          probability: data.probability,
          areasForResearch: data.areasForResearch,
          analysis: data.analysis
        }
      ]);
      
      toast({
        title: "Final Evaluation Complete",
        description: "The QA tree has been evaluated.",
      });
    } catch (error) {
      console.error('Final evaluation error:', error);
      toast({
        variant: "destructive",
        title: "Evaluation Error",
        description: error instanceof Error ? error.message : "Failed to generate final evaluation",
      });
    } finally {
      setIsFinalEvaluating(false);
    }
  };

  async function saveQATree() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const completeTreeData = [...qaData, ...rootExtensions];

      const { data, error } = await supabase
        .from('qa_trees')
        .insert({
          user_id: user.user.id,
          market_id: marketId,
          title: marketQuestion,
          tree_data: completeTreeData as unknown as Database['public']['Tables']['qa_trees']['Insert']['tree_data'],
          sequence_data: sequenceData as unknown as any
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${rootExtensions.length} question expansions and ${sequenceData.length} evaluations`,
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

  async function evaluateQAPair(node: QANode) {
    if (!node.analysis || node.evaluation) {
      console.log('Skipping evaluation:', { nodeId: node.id, hasAnalysis: !!node.analysis, hasEvaluation: !!node.evaluation });
      return;
    }

    console.log('Starting evaluation for node:', node.id);

    try {
      const { data, error } = await supabase.functions.invoke('evaluate-qa-pair', {
        body: { 
          question: node.question,
          analysis: node.analysis
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
      
      console.log('Requesting analysis for question:', question);
      
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
      console.log('Received analysis data, creating stream reader');

      const reader = new Response(analysisData.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      const analysis = await processStream(reader, nodeId);
      console.log('Completed analysis for node', nodeId, ':', analysis.substring(0, 50) + '...');

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
    setFinalEvaluation(null);
    setSequenceData([]);
    setCurrentExtensionId(null);
    try {
      await analyzeQuestion(marketQuestion);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  useEffect(() => {
    if (qaData.length > 0 && !isAnalyzing && currentNodeId === null && !finalEvaluation && !isFinalEvaluating && !currentExtensionId) {
      generateFinalEvaluation();
    }
  }, [qaData, isAnalyzing, currentNodeId, currentExtensionId]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      newSet.has(nodeId) ? newSet.delete(nodeId) : newSet.add(nodeId);
      return newSet;
    });
  };

  const renderCitations = (citations?: string[]) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-muted-foreground font-medium">Sources:</div>
        <div className="flex flex-wrap gap-2">
          {citations.map((citation, index) => (
            <a
              key={index}
              href={citation}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <LinkIcon className="h-3 w-3" />
              {`[${index + 1}]`}
            </a>
          ))}
        </div>
      </div>
    );
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

  const loadSavedQATree = async (treeData: QANode[], savedSequenceData?: {
    id: string;
    probability: string;
    areasForResearch: string[];
    analysis: string;
  }[]) => {
    console.log('Loading saved QA tree:', treeData);
    
    const mainRoots = treeData.filter(node => !node.isExtendedRoot);
    const extensions = treeData.filter(node => node.isExtendedRoot);
    
    setRootExtensions(extensions);
    setQaData(mainRoots);
    setStreamingContent({});
    
    if (savedSequenceData && savedSequenceData.length > 0) {
      setSequenceData(savedSequenceData);
      
      const mainEvaluation = savedSequenceData.find(seq => seq.id === 'main');
      if (mainEvaluation) {
        setFinalEvaluation({
          probability: mainEvaluation.probability,
          areasForResearch: mainEvaluation.areasForResearch,
          analysis: mainEvaluation.analysis
        });
      }
    } else {
      setSequenceData([]);
      setFinalEvaluation(null);
    }
    
    populateStreamingContent([...mainRoots, ...extensions]);
    
    const evaluateAllNodes = async (nodes: QANode[]) => {
      console.log('Evaluating nodes:', nodes.length);
      for (const node of nodes) {
        if (node.analysis && !node.evaluation) {
          console.log('Evaluating saved node:', node.id);
          await evaluateQAPair(node);
        }
        if (node.children.length > 0) {
          await evaluateAllNodes(node.children);
        }
      }
    };

    await evaluateAllNodes([...mainRoots, ...extensions]);
    
    const allNodeIds = new Set<string>();
    const addNodeIds = (nodes: QANode[]) => {
      nodes.forEach(node => {
        allNodeIds.add(node.id);
        if (node.children) {
          addNodeIds(node.children);
        }
      });
    };
    addNodeIds([...mainRoots, ...extensions]);
    setExpandedNodes(allNodeIds);
    setCurrentNodeId(null);
    setCurrentExtensionId(null);
    
    console.log('Finished loading tree structure:', {
      mainRoots,
      extensions,
      totalNodes: [...mainRoots, ...extensions].length,
      sequenceData: savedSequenceData || []
    });
  };

  const getPreviewText = (text: string) => {
    const strippedText = text.replace(/[#*`_]/g, '');
    const preview = strippedText.slice(0, 150);
    return preview.length < strippedText.length ? `${preview}...` : preview;
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

      setRootExtensions(prev => {
        const currentTree = qaData[0];
        return prev.map(ext => ext.id === nodeId ? currentTree : ext);
      });

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

  const getNodeExtensions = (nodeId: string) => {
    return rootExtensions.filter(ext => ext.originalNodeId === nodeId);
  };

  function renderQANode(node: QANode, depth: number = 0) {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    const isExpanded = expandedNodes.has(node.id);
    const analysisContent = isStreaming && streamContent 
      ? streamContent.content || '' 
      : node.analysis || '';
    const citations = isStreaming && streamContent 
      ? streamContent.citations 
      : node.citations;
    
    const nodeExtensions = getNodeExtensions(node.id);
    
    const markdownComponents: MarkdownComponents = {
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      code: ({ children, className }) => {
        const isInline = !className;
        return isInline ? (
          <code className="px-1 py-0.5 bg-muted rounded text-sm">{children}</code>
        ) : (
          <pre className="p-2 bg-muted rounded-md overflow-x-auto">
            <code className="text-sm">{children}</code>
          </pre>
        );
      },
      ul: ({ children }) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
      li: ({ children }) => <li className="mb-1">{children}</li>,
      h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>,
      h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-2">{children}</h2>,
      h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>,
      h4: ({ children }) => <h4 className="text-base font-semibold mt-3 mb-1">{children}</h4>,
      blockquote: ({ children }) => (
        <blockquote className="pl-4 border-l-2 border-border/50 italic my-3 text-muted-foreground">
          {children}
        </blockquote>
      ),
    };

    return (
      <div
        key={node.id}
        className={`rounded-lg border ${depth > 0 ? 'mt-3' : 'mt-0'}`}
      >
        <div 
          className="flex items-start justify-between p-3 cursor-pointer hover:bg-muted/30"
          onClick={() => toggleNode(node.id)}
        >
          <div className="flex items-start space-x-3 flex-1">
            <div className="mt-0.5">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="font-medium">{node.question}</div>
              {node.evaluation && (
                <div className={`text-xs px-2 py-0.5 rounded inline-flex items-center ${
                  node.evaluation.score >= 8 ? 'bg-green-100 text-green-800' : 
                  node.evaluation.score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  Score: {node.evaluation.score}/10
                </div>
              )}
            </div>
          </div>
          {node.children.length > 0 && (
            <div className="flex items-center space-x-1">
              <div className="text-xs text-muted-foreground mr-1">
                {node.children.length} follow-ups
              </div>
              {isExpanded ? 
                <ChevronUp className="h-5 w-5 text-muted-foreground" /> : 
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              }
            </div>
          )}
        </div>
        
        {isExpanded && (
          <div className="p-3 pt-0 border-t">
            <div className="text-sm">
              {analysisContent ? (
                <ScrollArea className="h-auto max-h-[500px]">
                  <div className="p-3">
                    <ReactMarkdown components={markdownComponents}>
                      {analysisContent}
                    </ReactMarkdown>
                    {renderCitations(citations)}
                    
                    {node.evaluation && (
                      <div className="mt-3 pt-3 border-t text-sm">
                        <div className="font-medium mb-1">Evaluation:</div>
                        <div className="text-muted-foreground">{node.evaluation.reason}</div>
                      </div>
                    )}
                    
                    {nodeExtensions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="font-medium text-sm">Continuations:</div>
                        <div className="grid gap-2">
                          {nodeExtensions.map(ext => (
                            <Button 
                              key={ext.id}
                              variant="outline" 
                              size="sm" 
                              className="justify-start"
                              onClick={() => navigateToExtension(ext)}
                            >
                              <ArrowRight className="h-3.5 w-3.5 mr-2" />
                              Extension {ext.id.slice(0, 5)}...
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExpandQuestion(node)}
                        disabled={isAnalyzing}
                      >
                        Continue This Branch
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                </div>
              )}
            </div>
            
            {node.children.length > 0 && (
              <div className="mt-3 space-y-2">
                {node.children.map(childNode => renderQANode(childNode, depth + 1))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="default" 
              onClick={handleAnalyze} 
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze Question'}
            </Button>
            
            {qaData.length > 0 && (
              <Button
                variant="outline"
                onClick={saveQATree}
                disabled={isAnalyzing}
              >
                Save Analysis
              </Button>
            )}
            
            {currentExtensionId && (
              <Button
                variant="outline"
                onClick={navigateBack}
              >
                Back to Main Analysis
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:space-x-2">
          <Select
            value={selectedResearch}
            onValueChange={setSelectedResearch}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Research" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Research Context</SelectItem>
              {savedResearch?.map(research => (
                <SelectItem key={research.id} value={research.id}>
                  {new Date(research.created_at).toLocaleDateString()} ({research.probability})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select
            value={selectedQATree}
            onValueChange={(value) => {
              setSelectedQATree(value);
              if (value !== 'none') {
                const tree = savedQATrees?.find(tree => tree.id === value);
                if (tree) {
                  loadSavedQATree(tree.tree_data, tree.sequence_data);
                }
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Load Analysis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">New Analysis</SelectItem>
              {savedQATrees?.map(tree => (
                <SelectItem key={tree.id} value={tree.id}>
                  {new Date(tree.created_at).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {qaData.length > 0 ? (
        <div className="space-y-4">
          {qaData.map(node => renderQANode(node))}
          
          {finalEvaluation && (
            <Card className="mt-4">
              <div className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Final Evaluation</div>
                <div className="text-xl font-semibold">
                  Probability: {finalEvaluation.probability}
                </div>
                <div className="mt-2">
                  <InsightsDisplay 
                    isLoading={isFinalEvaluating}
                    probability={finalEvaluation.probability}
                    areasForResearch={finalEvaluation.areasForResearch}
                    analysis={finalEvaluation.analysis}
                  />
                </div>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <div className="p-6 text-center">
            <div className="mb-2">
              <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto" />
            </div>
            <h3 className="text-lg font-medium">Question Analysis</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Analyze Question" to start building a research tree for this market.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
