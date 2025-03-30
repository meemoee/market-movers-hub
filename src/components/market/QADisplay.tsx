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
import { Markdown } from "@/components/Markdown";

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
      
      // Determine if this is a continuation and get the original question
      const isContinuation = qaData[0]?.isExtendedRoot === true;
      const originalNodeId = qaData[0]?.originalNodeId;
      let originalQuestion = marketQuestion;
      
      if (isContinuation && originalNodeId) {
        // Find the original node's question by looking through all extensions
        const originalNode = rootExtensions.find(ext => ext.id === originalNodeId);
        if (originalNode) {
          console.log("Found original node:", originalNode.id, "with question:", originalNode.question);
          originalQuestion = originalNode.question;
        }
      }
      
      console.log("Calling evaluate-qa-final with:", { 
        marketQuestion, 
        qaContextLength: qaContext.length,
        hasResearchContext: !!researchContext,
        isContinuation,
        originalQuestion: isContinuation ? originalQuestion : undefined
      });
      
      const { data, error } = await supabase.functions.invoke('evaluate-qa-final', {
        body: { 
          marketQuestion, 
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
          title: marketQuestion,
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
      await analyzeQuestion(marketQuestion);
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
          originalQuestion: marketQuestion, // Pass original market question
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
          originalQuestion: marketQuestion, // Pass original market question
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
        <a 
          href={href}
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),
    };

    return (
      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <p className="text-lg font-semibold">{node.question}</p>
            {getExtensionInfo(node)}
          </div>
          <div className="flex items-center">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {isStreaming && <MessageSquare className="h-4 w-4 ml-2" />}
          </div>
        </div>
        {isExpanded && (
          <div className="space-y-2">
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown components={markdownComponents}>
                {analysisContent || ''}
              </ReactMarkdown>
              {renderCitations(citations)}
            </div>
            
            {node.evaluation && (
              <div className="mt-2 text-sm">
                <span className="text-xs text-muted-foreground">Quality score: </span>
                <span className={`font-medium ${node.evaluation.score >= 8 ? 'text-green-500' : 
                                             node.evaluation.score >= 5 ? 'text-yellow-500' : 
                                             'text-red-500'}`}>
                  {node.evaluation.score}/10
                </span>
                <p className="text-xs text-muted-foreground mt-1">{node.evaluation.reason}</p>
              </div>
            )}
            
            {nodeExtensions.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Expanded analysis:</p>
                <div className="space-y-2">
                  {nodeExtensions.map(ext => (
                    <Button 
                      key={ext.id} 
                      variant="outline" 
                      size="sm" 
                      className="w-full flex justify-between"
                      onClick={() => navigateToExtension(ext)}
                    >
                      <span className="truncate">{getPreviewText(ext.analysis)}</span>
                      <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
            
            {node.children.length > 0 && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-muted">
                {node.children.map(childNode => (
                  <div key={childNode.id} onClick={() => toggleNode(childNode.id)} className="cursor-pointer">
                    {renderQANode(childNode, depth + 1)}
                  </div>
                ))}
              </div>
            )}
            
            {depth === 0 && node.children.length === 0 && isAnalyzing && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4 animate-pulse" />
                <span>Generating follow-up questions...</span>
              </div>
            )}
            
            {depth === 0 && !isAnalyzing && (
              <div className="flex justify-end">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleExpandQuestion(node)}
                  disabled={isAnalyzing}
                >
                  Expand Analysis
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Question Analysis</h2>
            {navigationHistory.length > 0 && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 gap-1"
                onClick={navigateBack}
              >
                <ChevronUp className="h-3 w-3" />
                Back
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">{marketDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          {savedQATrees && savedQATrees.length > 0 && (
            <Select value={selectedQATree} onValueChange={value => {
              if (value !== 'none') {
                const treeData = savedQATrees.find(tree => tree.id === value)?.tree_data;
                if (treeData) {
                  loadSavedQATree(treeData);
                  setSelectedQATree(value);
                }
              } else {
                setSelectedQATree('none');
              }
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select saved analysis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">New analysis</SelectItem>
                {savedQATrees.map(tree => (
                  <SelectItem key={tree.id} value={tree.id}>
                    {new Date(tree.created_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {savedResearch && savedResearch.length > 0 && (
            <Select value={selectedResearch} onValueChange={setSelectedResearch}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select research" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No research</SelectItem>
                {savedResearch.map(research => (
                  <SelectItem key={research.id} value={research.id}>
                    {new Date(research.created_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          <Button onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          
          {qaData.length > 0 && (
            <Button 
              onClick={saveQATree} 
              variant="outline" 
              disabled={isAnalyzing || saveInProgress}
            >
              {saveInProgress ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>
      
      <Card className="flex-1 flex flex-col overflow-hidden">
        {qaData.length > 0 ? (
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {qaData.map(node => (
                <div 
                  key={node.id} 
                  onClick={() => toggleNode(node.id)} 
                  className="cursor-pointer"
                >
                  {renderQANode(node)}
                </div>
              ))}
              
              {finalEvaluation && !isAnalyzing && !isFinalEvaluating && (
                <Card className="p-4 mt-6 bg-muted/10">
                  <h3 className="text-lg font-semibold mb-2">Final Evaluation</h3>
                  <div className="text-sm space-y-4">
                    <div>
                      <p className="font-medium">Probability Assessment:</p>
                      <p className="text-muted-foreground">{finalEvaluation.probability}</p>
                    </div>
                    
                    {finalEvaluation.areasForResearch.length > 0 && (
                      <div>
                        <p className="font-medium">Areas for Further Research:</p>
                        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                          {finalEvaluation.areasForResearch.map((area, i) => (
                            <li key={i}>{area}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div>
                      <p className="font-medium">Analysis:</p>
                      <p className="text-muted-foreground">{finalEvaluation.analysis}</p>
                    </div>
                  </div>
                </Card>
              )}
              
              {activeFinalEvaluation && !finalEvaluation && !isAnalyzing && !isFinalEvaluating && (
                <Card className="p-4 mt-6 bg-muted/10">
                  <h3 className="text-lg font-semibold mb-2">Previous Evaluation</h3>
                  <div className="text-sm space-y-4">
                    <div>
                      <p className="font-medium">Probability Assessment:</p>
                      <p className="text-muted-foreground">{activeFinalEvaluation.probability}</p>
                    </div>
                    
                    {activeFinalEvaluation.areasForResearch.length > 0 && (
                      <div>
                        <p className="font-medium">Areas for Further Research:</p>
                        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                          {activeFinalEvaluation.areasForResearch.map((area, i) => (
                            <li key={i}>{area}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div>
                      <p className="font-medium">Analysis:</p>
                      <p className="text-muted-foreground">{activeFinalEvaluation.analysis}</p>
                    </div>
                  </div>
                </Card>
              )}
              
              {isFinalEvaluating && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
                    <p className="text-sm text-muted-foreground">Generating final evaluation...</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <h3 className="text-lg font-medium mb-2">Analyze Question</h3>
            <p className="text-muted-foreground mb-4">
              Use AI to analyze "{marketQuestion}" and evaluate possible outcomes
            </p>
            <Button onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Start Analysis'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
