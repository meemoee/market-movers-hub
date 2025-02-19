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
import { Database, Json } from '@/integrations/supabase/types';

interface QANode {
  id: string;
  question: string;
  analysis: string;
  citations?: string[];
  children: QANode[];
  isExtendedRoot?: boolean;
  originalNodeId?: string;
  parentId?: string | null;
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
  const [rootExtensions, setRootExtensions] = useState<QANode[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: savedResearch } = useQuery({
    queryKey: ['saved-research', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('web_research')
        .select('*')
        .eq('market_id', marketId);
      if (error) throw error;
      return data as SavedResearch[];
    }
  });

  const { data: savedQATrees } = useQuery({
    queryKey: ['saved-qa-trees', marketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qa_trees')
        .select('*')
        .eq('market_id', marketId);
      if (error) throw error;
      return data as SavedQATree[];
    }
  });

  const findNodeById = (nodeId: string, nodes: QANode[]): QANode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children.length > 0) {
        const found = findNodeById(nodeId, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const getFocusedView = (): QANode[] => {
    if (!focusedNodeId) return qaData;
    
    const focusedNode = findNodeById(focusedNodeId, qaData);
    if (focusedNode) return [focusedNode];
    
    const focusedExtension = rootExtensions.find(ext => ext.id === focusedNodeId);
    if (focusedExtension) return [focusedExtension];
    
    return qaData;
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const navigateToExtension = (extension: QANode) => {
    setFocusedNodeId(extension.id);
  };

  const navigateBack = () => {
    if (focusedNodeId) {
      const focusedNode = findNodeById(focusedNodeId, qaData) || 
                         rootExtensions.find(ext => ext.id === focusedNodeId);
      
      if (focusedNode?.originalNodeId) {
        setFocusedNodeId(focusedNode.originalNodeId);
      } else if (focusedNode?.parentId) {
        setFocusedNodeId(focusedNode.parentId);
      } else {
        setFocusedNodeId(null);
      }
    }
  };

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

  const isLineComplete = (line: string): boolean => {
    return /[.!?]$/.test(line.trim()) || isCompleteMarkdown(line);
  };

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
          originalNodeId: node.originalNodeId,
          parentId: node.parentId || null
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

      const allNodes = [...processedMainTree, ...processedExtensions];

      console.log('Saving complete tree structure:', {
        totalNodes: allNodes.length,
        mainRoots: processedMainTree.map(n => n.id),
        extensions: processedExtensions.map(n => ({
          id: n.id,
          originalNodeId: n.originalNodeId,
          childrenCount: n.children.length
        }))
      });

      const { data, error } = await supabase
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
        description: `Saved complete QA tree with ${allNodes.length} nodes including ${processedExtensions.length} extensions`,
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

  const loadSavedQATree = async (treeData: QANode[]) => {
    console.log('Loading saved QA tree with raw data:', treeData);
    
    try {
      setStreamingContent({});
      setCurrentNodeId(null);
      setFocusedNodeId(null);
      
      if (!Array.isArray(treeData)) {
        console.error('Invalid tree data:', treeData);
        throw new Error('Invalid tree data format');
      }

      const nodeMap = new Map<string, QANode>();
      const extensionMap = new Map<string, QANode>();
      const processedNodes = new Set<string>();
      
      // First pass: Create all nodes
      treeData.forEach(rawNode => {
        if (rawNode && typeof rawNode.id === 'string') {
          const node: QANode = {
            id: rawNode.id,
            question: rawNode.question || '',
            analysis: rawNode.analysis || '',
            citations: Array.isArray(rawNode.citations) ? rawNode.citations : [],
            children: [],
            isExtendedRoot: rawNode.isExtendedRoot || false,
            originalNodeId: rawNode.originalNodeId,
            parentId: rawNode.parentId || null,
            evaluation: rawNode.evaluation ? {
              score: Number(rawNode.evaluation.score),
              reason: String(rawNode.evaluation.reason)
            } : undefined
          };

          if (node.isExtendedRoot) {
            extensionMap.set(node.id, node);
          }
          nodeMap.set(node.id, node);
        }
      });

      // Second pass: Build relationships
      treeData.forEach(rawNode => {
        if (!rawNode || !rawNode.id) return;
        
        const node = nodeMap.get(rawNode.id);
        if (!node) return;

        if (Array.isArray(rawNode.children)) {
          node.children = rawNode.children
            .map(childId => {
              const childNode = typeof childId === 'string' 
                ? nodeMap.get(childId)
                : nodeMap.get(childId.id);
              if (childNode) {
                processedNodes.add(childNode.id);
              }
              return childNode;
            })
            .filter((child): child is QANode => child !== undefined);
        }
      });

      // Third pass: Identify main nodes and extensions
      const mainRoots: QANode[] = [];
      const extensions: QANode[] = [];

      // Process each node
      nodeMap.forEach(node => {
        if (node.isExtendedRoot) {
          // Add to extensions regardless of being processed
          extensions.push(node);
        } else if (!processedNodes.has(node.id) && !node.parentId) {
          // Only add to main roots if it's a true root node (no parent)
          mainRoots.push(node);
        }
      });

      // Sort extensions to maintain continuation order
      extensions.sort((a, b) => {
        const aId = Number(a.id.split('-')[1]) || 0;
        const bId = Number(b.id.split('-')[1]) || 0;
        return aId - bId;
      });

      console.log('Processed tree structure:', {
        mainRootsCount: mainRoots.length,
        extensionsCount: extensions.length,
        totalNodes: nodeMap.size,
        nodeMap: Array.from(nodeMap.keys()),
        processedNodes: Array.from(processedNodes),
        mainRoots: mainRoots.map(n => ({ 
          id: n.id, 
          childCount: n.children.length
        })),
        extensions: extensions.map(n => ({
          id: n.id,
          originalId: n.originalNodeId,
          parentId: n.parentId,
          childCount: n.children.length
        }))
      });

      // Set the state
      setQaData(mainRoots.length > 0 ? mainRoots : [extensions[0]]);
      setRootExtensions(extensions);
      
      // Expand all nodes
      const allNodeIds = new Set(Array.from(nodeMap.keys()));
      setExpandedNodes(allNodeIds);
      
      // Initialize streaming content for all nodes
      const initialStreamingContent: { [key: string]: StreamingContent } = {};
      nodeMap.forEach((node, nodeId) => {
        initialStreamingContent[nodeId] = {
          content: node.analysis || '',
          citations: node.citations || [],
        };
      });
      setStreamingContent(initialStreamingContent);

      // Evaluate nodes if needed
      const evaluateNodesIfNeeded = async (nodes: QANode[]) => {
        for (const node of nodes) {
          if (node.analysis && !node.evaluation) {
            await evaluateQAPair(node);
          }
          if (node.children.length > 0) {
            await evaluateNodesIfNeeded(node.children);
          }
        }
      };

      await evaluateNodesIfNeeded([...mainRoots, ...extensions]);

    } catch (error) {
      console.error('Error loading QA tree:', error);
      toast({
        variant: "destructive",
        title: "Load Error",
        description: "Failed to load the QA tree. Please try again.",
      });
    }
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
          analysis: node.analysis,
          marketQuestion: marketQuestion,
          marketDescription: marketDescription
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
        prev.map(ext => ext.id === node.id ? { ...ext, evaluation: data } : ext
      ));

    } catch (error) {
      console.error('Error evaluating QA pair:', error);
      toast({
        title: "Evaluation Error",
        description: "Failed to evaluate Q&A pair",
        variant: "destructive"
      });
    }
  };

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
        originalNodeId: node.id,
        parentId: node.id
      };

      setRootExtensions(prev => [...prev, newRootNode]);
      
      setFocusedNodeId(nodeId);

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

      const completeNode: QANode = {
        ...newRootNode,
        analysis
      };

      const { data: evaluationData, error: evaluationError } = await supabase.functions.invoke('evaluate-qa-pair', {
        body: { 
          question: completeNode.question,
          analysis: completeNode.analysis
        }
      });

      if (evaluationError) throw evaluationError;

      const evaluatedNode: QANode = {
        ...completeNode,
        evaluation: evaluationData
      };

      setQaData([evaluatedNode]);
      setRootExtensions(prev => 
        prev.map(ext => ext.id === nodeId ? evaluatedNode : ext)
      );

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

  const getPreviewText = (text: string | undefined) => {
    if (!text) return '';
    const strippedText = text.replace(/[#*`_]/g, '');
    const preview = strippedText.slice(0, 150);
    return preview.length < strippedText.length ? `${preview}...` : preview;
  };

  const renderQANode = (node: QANode, depth: number = 0) => {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    const isExpanded = expandedNodes.has(node.id);
    const analysisContent = isStreaming ? streamContent?.content : node.analysis;
    const citations = isStreaming ? streamContent?.citations : node.citations;
    
    const nodeExtensions = rootExtensions.filter(ext => ext.originalNodeId === node.id);

    const getScoreBackgroundColor = (score: number) => {
      if (score >= 80) return 'bg-green-500/20';
      if (score >= 60) return 'bg-yellow-500/20';
      return 'bg-red-500/20';
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
              <div className="flex items-start">
                <h3 className="font-medium text-sm leading-none pt-2 flex-grow">
                  {node.question}
                </h3>
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
                          {analysisContent || ''}
                        </ReactMarkdown>

                        {citations && citations.length > 0 && (
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
                        )}
                        
                        <div className="mt-4 space-y-2">
                          {node.evaluation && (
                            <div className={`rounded-lg p-2 ${getScoreBackgroundColor(node.evaluation.score)}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium">
                                  Score: {node.evaluation.score}%
                                </div>
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
                              <ReactMarkdown
                                components={markdownComponents}
                                className="text-xs text-muted-foreground"
                              >
                                {node.evaluation.reason}
                              </ReactMarkdown>
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
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
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
              setFocusedNodeId(null);
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
          <Button 
            onClick={async () => {
              setIsAnalyzing(true);
              setQaData([]);
              setStreamingContent({});
              setExpandedNodes(new Set());
              setFocusedNodeId(null);
              try {
                await analyzeQuestion(marketQuestion);
              } finally {
                setIsAnalyzing(false);
                setCurrentNodeId(null);
              }
            }} 
            disabled={isAnalyzing}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          {qaData.length > 0 && !isAnalyzing && (
            <Button onClick={saveQATree} variant="outline">
              Save Analysis
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="h-[500px] pr-4">
        {getFocusedView().map(node => renderQANode(node))}
      </ScrollArea>
    </Card>
  );
}
