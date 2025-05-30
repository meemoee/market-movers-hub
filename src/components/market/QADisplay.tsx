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
};

interface FinalEvaluation {
  probability: string;
  areasForResearch: string[];
  analysis: string;
}

interface QADisplayProps {
  marketId: string;
  question: string;  // Changed from marketQuestion to question to match usage in MarketDetails.tsx
  description?: string;  // Changed from marketDescription to description to match usage
  userId: string | null;  // Updated to allow null since userId could be null
}

export function QADisplay({ marketId, question, description, userId }: QADisplayProps) {
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
  const [navigatedFinalEvaluations, setNavigatedFinalEvaluations] = useState<{[id: string]: FinalEvaluation}>({});
  const [activeFinalEvaluation, setActiveFinalEvaluation] = useState<FinalEvaluation | null>(null);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const queryClient = useQueryClient();

  const navigateToExtension = (extension: QANode) => {
    if (finalEvaluation) {
      setNavigatedFinalEvaluations(prev => ({ 
        ...prev, 
        [qaData[0]?.id || 'root']: finalEvaluation 
      }));
    }
    
    const extensionEval = navigatedFinalEvaluations[extension.id];
    if (extensionEval) {
      setActiveFinalEvaluation(extensionEval);
    } else {
      setActiveFinalEvaluation(null);
    }
    
    setNavigationHistory(prev => [...prev, qaData]);
    setQaData([extension]);
    setFinalEvaluation(null);
  };

  const navigateBack = () => {
    const previousTree = navigationHistory[navigationHistory.length - 1];
    if (previousTree) {
      if (finalEvaluation) {
        setNavigatedFinalEvaluations(prev => ({ 
          ...prev, 
          [qaData[0]?.id || 'root']: finalEvaluation 
        }));
      }
      
      const prevTreeId = previousTree[0]?.id;
      if (prevTreeId && navigatedFinalEvaluations[prevTreeId]) {
        setActiveFinalEvaluation(navigatedFinalEvaluations[prevTreeId]);
      } else {
        setActiveFinalEvaluation(null);
      }
      
      setQaData(previousTree);
      setNavigationHistory(prev => prev.slice(0, -1));
      setFinalEvaluation(null);
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
      console.debug('Chunk parse error (expected during streaming):', e);
      return { content: '', citations: [] };
    }
  };

  const processStreamContent = (content: string, prevContent: string = ''): string => {
    let combinedContent = prevContent + content;
    
    combinedContent = combinedContent
      .replace(/\*\*\s*\*\*/g, '') // Remove empty bold tags
      .replace(/\*\s*\*/g, '') // Remove empty italic tags
      .replace(/`\s*`/g, '') // Remove empty code tags
      .replace(/\[\s*\]/g, '') // Remove empty links
      .replace(/\(\s*\)/g, '') // Remove empty parentheses
      .replace(/:{2,}/g, ':') // Fix multiple colons
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    if (combinedContent.match(/[a-zA-Z]$/)) {
      combinedContent += '.';
    }
    
    return combinedContent;
  };

  const getExtensionInfo = (node: QANode): string => {
    if (!node.isExtendedRoot) {
      const extensionCount = rootExtensions.filter(n => n.originalNodeId === node.id).length;
      return extensionCount > 0 ? ` (Expanded ${extensionCount} times)` : '';
    }
    return '';
  };

  const processStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> => {
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
  };

  const flattenQATree = (nodes: QANode[]): string => {
    return nodes.map(node => {
      const childrenText = node.children.length > 0 
        ? `\nFollow-up Questions:\n${flattenQATree(node.children)}` 
        : '';
      
      return `Question: ${node.question}\nAnalysis: ${node.analysis}${childrenText}`;
    }).join('\n\n');
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
      
      const isContinuation = qaData[0]?.isExtendedRoot === true;
      const originalNodeId = qaData[0]?.originalNodeId;
      let originalQuestion = question;
      
      if (isContinuation && originalNodeId) {
        const originalNode = rootExtensions.find(ext => ext.id === originalNodeId);
        if (originalNode) {
          console.log("Found original node:", originalNode.id, "with question:", originalNode.question);
          originalQuestion = originalNode.question;
        }
      }
      
      console.log("Calling evaluate-qa-final with:", { 
        marketQuestion: question, 
        qaContextLength: qaContext.length,
        hasResearchContext: !!researchContext,
        isContinuation,
        originalQuestion: isContinuation ? originalQuestion : undefined
      });
      
      const { data, error } = await supabase.functions.invoke('evaluate-qa-final', {
        body: { 
          marketQuestion: question, 
          qaContext,
          researchContext,
          isContinuation,
          originalQuestion: isContinuation ? originalQuestion : undefined
        },
      });
      
      if (error) {
        console.error("Edge function error:", error);
        throw error;
      }
      
      console.log("Final evaluation result:", data);
      
      setFinalEvaluation(data);
      
      if (qaData[0]?.id) {
        setNavigatedFinalEvaluations(prev => ({
          ...prev,
          [qaData[0].id]: data
        }));
      }
      
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
    setSaveInProgress(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const completeTreeData = [...qaData, ...rootExtensions];
      
      const allEvaluations = {
        ...navigatedFinalEvaluations,
        ...(finalEvaluation ? { [qaData[0]?.id || 'root']: finalEvaluation } : {})
      };
      
      const treeWithEvaluations = completeTreeData.map(node => {
        const nodeEvaluation = allEvaluations[node.id];
        if (nodeEvaluation) {
          return {
            ...node,
            finalEvaluation: nodeEvaluation
          };
        }
        return node;
      });

      const { data, error } = await supabase
        .from('qa_trees')
        .insert({
          user_id: user.user.id,
          market_id: marketId,
          title: question,
          tree_data: treeWithEvaluations as unknown as Database['public']['Tables']['qa_trees']['Insert']['tree_data'],
          final_evaluation: finalEvaluation || activeFinalEvaluation || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${rootExtensions.length} question expansions and final evaluations`,
      });

      await queryClient.invalidateQueries({ queryKey: ['saved-qa-trees', marketId] });

    } catch (error) {
      console.error('Error saving QA tree:', error);
      toast({
        variant: "destructive",
        title: "Save Error",
        description: error instanceof Error ? error.message : "Failed to save the QA tree",
      });
    } finally {
      setSaveInProgress(false);
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
        children: [] // Add the required children property
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
    try {
      await analyzeQuestion(question);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

  useEffect(() => {
    if (qaData.length > 0 && !isAnalyzing && currentNodeId === null && !finalEvaluation && !isFinalEvaluating && !activeFinalEvaluation) {
      generateFinalEvaluation();
    }
  }, [qaData, isAnalyzing, currentNodeId]);

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

  const loadSavedQATree = async (treeData: QANode[]) => {
    console.log('Loading saved QA tree:', treeData);
    
    const mainRoots = treeData.filter(node => !node.isExtendedRoot);
    const extensions = treeData.filter(node => node.isExtendedRoot);
    
    setRootExtensions(extensions);
    setQaData(mainRoots);
    setStreamingContent({});
    
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
    
    console.log('Finished loading tree structure:', {
      mainRoots,
      extensions,
      totalNodes: [...mainRoots, ...extensions].length
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

      // Store the current final evaluation for the current node
      if (finalEvaluation) {
        setNavigatedFinalEvaluations(prev => ({
          ...prev,
          [qaData[0]?.id || 'root']: finalEvaluation
        }));
      }

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
      setFinalEvaluation(null);
      setActiveFinalEvaluation(null);

      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question,
          isFollowUp: false,
          historyContext,
          originalQuestion: question, // Pass original market question
          isContinuation: true, // Flag this as a continuation
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
      console.log("Completed continuation analysis for node:", nodeId);

      // Update the data with the completed analysis
      setQaData(prev => 
        prev.map(n => n.id === nodeId ? { ...n, analysis } : n)
      );

      const { data: followUpData, error: followUpError } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({ 
          marketId, 
          question: node.question, 
          parentContent: analysis,
          historyContext,
          isFollowUp: true,
          originalQuestion: question, // Pass original market question
          isContinuation: true, // Flag this as a continuation
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
        const updatedExtensions = prev.map(ext => {
          if (ext.id === nodeId) {
            const currentTree = qaData[0];
            return { ...currentTree, analysis };
          }
          return ext;
        });
        return updatedExtensions;
      });
      
      // Generate evaluation for this continuation immediately
      await generateFinalEvaluation();

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
    const analysisContent = isStreaming ? streamContent?.content : node.analysis;
    const citations = isStreaming ? streamContent?.citations : node.citations;
    
    const nodeExtensions = getNodeExtensions(node.id);
    
    const markdownComponents: MarkdownComponents = {
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      code: ({ children, className }) => {
        const isInline = !className;
        return isInline ? (
          <code className="bg-muted/30 rounded px-1 py-0.5 text-sm font-mono">{children}</code>
        ) : (
          <code className="block bg-muted/30 rounded p-3 my-3 text-sm font-mono whitespace-pre-wrap">
            {children}
          </code>
        );
      },
      ul: ({ children }) => <ul className="list-disc pl-4 mb-3 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-4 mb-3 space-y-1">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-muted pl-4 italic my-3">{children}</blockquote>
      ),
      a: ({ href, children }) => (
        <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
      em: ({ children }) => <em className="italic">{children}</em>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
      h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
      h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
      hr: () => <hr className="my-4 border-muted" />,
    };

    return (
      <div key={node.id} className="relative flex flex-col">
        <div className="flex items-stretch">
          {depth > 0 && (
            <div className="relative w-6 sm:w-9 flex-shrink-0">
              <div className="absolute top-0 bottom-0 left-6 sm:left-9 w-[2px] bg-border" />
            </div>
          )}
          <div className="flex-grow min-w-0 pl-2 sm:pl-[72px] pb-6 relative">
            {depth > 0 && (
              <div className="absolute left-0 top-4 h-[2px] w-4 sm:w-6 bg-border" />
            )}
            <div className="absolute left-[12px] sm:left-[24px] top-0">
              <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border-2 border-background">
                <AvatarFallback className="bg-primary/10">
                  <MessageSquare className="h-3 w-3" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <h3 className="font-medium text-sm leading-none pt-2 flex-grow">
                  {node.question}
                  {getExtensionInfo(node)}
                </h3>
                {!node.isExtendedRoot && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExpandQuestion(node);
                    }}
                    className="p-1 hover:bg-accent/50 rounded-full transition-colors"
                    title="Expand this question into a follow-up analysis"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => toggleNode(node.id)}>
                <div className="flex items-start gap-2">
                  <button className="mt-1 hover:bg-accent/50 rounded-full p-0.5">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="flex-1">
                    {isExpanded ? (
                      <>
                        <ReactMarkdown
                          components={markdownComponents}
                          className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                        >
                          {analysisContent}
                        </ReactMarkdown>
                        {renderCitations(citations)}
                        
                        <div className="mt-4 flex items-center gap-2">
                          {node.evaluation && (
                            <div className="flex items-center gap-2">
                              <div className={`px-2 py-1 rounded text-xs font-medium ${
                                node.evaluation.score >= 80 ? 'bg-green-500/20 text-green-500' :
                                node.evaluation.score >= 60 ? 'bg-yellow-500/20 text-yellow-500' :
                                'bg-red-500/20 text-red-500'
                              }`}>
                                Score: {node.evaluation.score}%
                              </div>
                              <span className="text-xs text-muted-foreground">{node.evaluation.reason}</span>
                            </div>
                          )}
                        </div>
                        
                        {nodeExtensions.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              Follow-up Analyses ({nodeExtensions.length}):
                            </div>
                            <div className="space-y-4">
                              {nodeExtensions.map((extension, index) => (
                                <div 
                                  key={extension.id}
                                  className="border border-border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToExtension(extension);
                                  }}
                                >
                                  <div className="text-xs text-muted-foreground mb-2">
                                    Continuation #{index + 1}
                                  </div>
                                  <div className="line-clamp-3">
                                    {getPreviewText(extension.analysis)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="line-clamp-3">{getPreviewText(analysisContent)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {node.children.length > 0 && isExpanded && (
              <div className="mt-6">
                {node.children.map(child => renderQANode(child, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
              setNavigationHistory([]); // Reset navigation history when loading new tree
              setFinalEvaluation(null); // Reset final evaluation
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
          <Button onClick={handleAnalyze} disabled={isAnalyzing || isFinalEvaluating || saveInProgress}>
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          {qaData.length > 0 && !isAnalyzing && (
            <Button onClick={saveQATree} variant="outline" disabled={isFinalEvaluating || saveInProgress}>
              {saveInProgress ? 'Saving...' : 'Save Analysis'}
            </Button>
          )}
        </div>
      </div>
      
      {(finalEvaluation || activeFinalEvaluation) && (
        <div className="mb-4">
          <InsightsDisplay 
            probability={(finalEvaluation || activeFinalEvaluation)?.probability || ''} 
            areasForResearch={(finalEvaluation || activeFinalEvaluation)?.areasForResearch || []} 
          />
          <div className="mt-4 bg-accent/5 rounded-md p-4">
            <h3 className="text-sm font-medium mb-2">Final Analysis</h3>
            <p className="text-sm text-muted-foreground">{(finalEvaluation || activeFinalEvaluation)?.analysis || ''}</p>
          </div>
        </div>
      )}
      
      {isFinalEvaluating && (
        <div className="mb-4 p-4 bg-accent/5 rounded-md">
          <p className="text-sm animate-pulse">Generating final evaluation...</p>
        </div>
      )}
      
      <ScrollArea className="h-[500px] pr-4">
        {qaData.map(node => renderQANode(node))}
      </ScrollArea>
    </Card>
  );
}
