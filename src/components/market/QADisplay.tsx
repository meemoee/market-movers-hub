
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

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription?: string;  // Added this prop definition
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
  const queryClient = useQueryClient();

  const navigateToExtension = (extension: QANode) => {
    setNavigationHistory(prev => [...prev, qaData]);
    setQaData([extension]);
  };

  const navigateBack = () => {
    const previousTree = navigationHistory[navigationHistory.length - 1];
    if (previousTree) {
      setQaData(previousTree);
      setNavigationHistory(prev => prev.slice(0, -1));
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
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${rootExtensions.length} question expansions`,
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

  async function processStream(reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string): Promise<string> {
    let accumulatedContent = '';
    let accumulatedCitations: string[] = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // When stream is done, find the node and evaluate it
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

      // Update the node with the complete analysis and trigger evaluation
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

      // Create a complete QANode object for evaluation
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
    try {
      await analyzeQuestion(marketQuestion);
    } finally {
      setIsAnalyzing(false);
      setCurrentNodeId(null);
    }
  };

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
          citations: node.citations || [], // Make sure to populate citations
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
    
    // Populate streaming content for both main roots and extensions
    populateStreamingContent([...mainRoots, ...extensions]);
    
    // Evaluate all nodes that don't have evaluations
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
    // Check if the line ends with a proper sentence ending
    return /[.!?]$/.test(line.trim()) || isCompleteMarkdown(line);
  };

  const getNodeExtensions = (nodeId: string) => {
    return rootExtensions.filter(ext => ext.originalNodeId === nodeId);
  };

  const evaluateQAPair = async (node: QANode) => {
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

      if (error) {
        console.error('Error in evaluate-qa-pair function:', error);
        toast({
          title: "Evaluation Error",
          description: "Failed to evaluate Q&A pair. Using fallback evaluation.",
          variant: "destructive"
        });
        
        // Use fallback evaluation to prevent UI issues
        const fallbackEvaluation = {
          score: 65,
          reason: "Evaluation service unavailable. This is a fallback score."
        };
        
        // Update qaData with fallback evaluation
        updateNodeWithEvaluation(node.id, fallbackEvaluation);
        return;
      }

      console.log('Received evaluation:', { nodeId: node.id, evaluation: data });
      
      // Validate evaluation data
      const validEvaluation = validateEvaluation(data);
      if (!validEvaluation) {
        console.error('Invalid evaluation format:', data);
        toast({
          title: "Invalid Evaluation",
          description: "Received malformed evaluation data. Using fallback.",
          variant: "destructive"
        });
        
        // Use fallback evaluation
        const fallbackEvaluation = {
          score: 65,
          reason: "Received invalid evaluation format. This is a fallback score."
        };
        
        updateNodeWithEvaluation(node.id, fallbackEvaluation);
        return;
      }

      // Update qaData with evaluation
      updateNodeWithEvaluation(node.id, data);

    } catch (error) {
      console.error('Error evaluating QA pair:', error);
      toast({
        title: "Evaluation Error",
        description: "Failed to evaluate Q&A pair",
        variant: "destructive"
      });
      
      // Use fallback evaluation to prevent UI issues
      const fallbackEvaluation = {
        score: 65,
        reason: "An error occurred during evaluation. This is a fallback score."
      };
      
      updateNodeWithEvaluation(node.id, fallbackEvaluation);
    }
  };
  
  // Helper function to validate evaluation format
  const validateEvaluation = (data: any): boolean => {
    return (
      data && 
      typeof data === 'object' &&
      'score' in data && 
      'reason' in data &&
      typeof data.score === 'number' &&
      typeof data.reason === 'string'
    );
  };
  
  // Helper function to update nodes with evaluation
  const updateNodeWithEvaluation = (nodeId: string, evaluation: { score: number, reason: string }) => {
    // Update qaData with evaluation
    setQaData(prev => {
      const updateNode = (nodes: QANode[]): QANode[] =>
        nodes.map(n => {
          if (n.id === nodeId) {
            return { ...n, evaluation };
          }
          if (n.children.length > 0) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      return updateNode(prev);
    });

    // Update rootExtensions with evaluation
    setRootExtensions(prev => 
      prev.map(ext => 
        ext.id === nodeId ? { ...ext, evaluation } : ext
      )
    );
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
                          <div className="mt-3 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              Related expansions:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {nodeExtensions.map(ext => (
                                <button
                                  key={ext.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateToExtension(ext);
                                  }}
                                  className="px-2 py-1 bg-accent/50 hover:bg-accent rounded text-xs flex items-center gap-1"
                                >
                                  <span>Expansion {new Date(parseInt(ext.id.split('-')[1])).toLocaleDateString()}</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="pt-1 text-sm">
                        {getPreviewText(analysisContent || '')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {isExpanded && node.children.length > 0 && (
                <div className="mt-4 space-y-4">
                  {node.children.map(childNode => renderQANode(childNode, depth + 1))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 flex-grow">
          <h3 className="font-medium">{marketQuestion}</h3>
          {marketDescription && (
            <p className="text-xs text-muted-foreground line-clamp-2">{marketDescription}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {savedResearch && savedResearch.length > 0 && (
            <Select value={selectedResearch} onValueChange={setSelectedResearch}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Use research context..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No research context</SelectItem>
                {savedResearch.map(research => (
                  <SelectItem key={research.id} value={research.id}>
                    {new Date(research.created_at).toLocaleDateString()} ({Math.round(research.probability * 100)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {savedQATrees && savedQATrees.length > 0 && (
            <Select 
              value={selectedQATree} 
              onValueChange={(value) => {
                setSelectedQATree(value);
                if (value !== 'none') {
                  const selectedTree = savedQATrees.find(tree => tree.id === value);
                  if (selectedTree) {
                    loadSavedQATree(selectedTree.tree_data);
                  }
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Load saved analysis..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Create new analysis</SelectItem>
                {savedQATrees.map(tree => (
                  <SelectItem key={tree.id} value={tree.id}>
                    {new Date(tree.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {qaData.length > 0 && !isAnalyzing && navigationHistory.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={navigateBack}
            >
              Back to previous
            </Button>
          )}
          
          {qaData.length > 0 && !isAnalyzing ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={saveQATree}
            >
              Save Analysis
            </Button>
          ) : (
            <Button 
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full sm:w-auto"
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze Question'}
            </Button>
          )}
        </div>
      </div>
      
      {isAnalyzing ? (
        <div className="p-6 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Analyzing question...</p>
          </div>
        </div>
      ) : qaData.length > 0 ? (
        <ScrollArea className="h-[500px]">
          <div className="p-6">
            {qaData.map(node => renderQANode(node))}
          </div>
        </ScrollArea>
      ) : (
        <div className="p-6 text-center text-muted-foreground">
          <p>Click "Analyze Question" to generate a question and answer tree</p>
        </div>
      )}
    </Card>
  );
}
