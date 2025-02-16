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
  expansions?: {
    id: string;
    analysis: string;
    timestamp: number;
    evaluation?: {
      score: number;
      reason: string;
    };
  }[];
  evaluation?: {
    score: number;
    reason: string;
  };
  isExtendedRoot?: boolean;
  originalNodeId?: string;
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
  expansions: {
    original_node_id: string;
    expansion_id: string;
    analysis: string;
    timestamp: number;
    evaluation?: {
      score: number;
      reason: string;
    };
  }[];
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

      // Convert QANode array to a JSON-compatible format
      const treeDataJson = JSON.parse(JSON.stringify(qaData));
      const flattenedExpansions = qaData.flatMap(node => 
        (node.expansions || []).map(expansion => ({
          original_node_id: node.id,
          expansion_id: expansion.id,
          analysis: expansion.analysis,
          timestamp: expansion.timestamp,
          evaluation: expansion.evaluation
        }))
      );

      const { data, error } = await supabase
        .from('qa_trees')
        .insert({
          market_id: marketId,
          title: marketQuestion,
          tree_data: treeDataJson,
          expansions: flattenedExpansions,
          user_id: user.user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Analysis saved",
        description: `Saved QA tree with ${flattenedExpansions.length} expansions`,
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
          citations: node.citations || [],
        },
      }));
      if (node.children.length > 0) {
        populateStreamingContent(node.children);
      }
    });
  };

  const loadSavedQATree = async (treeData: any[]) => {
    console.log('Loading saved QA tree with raw data:', treeData);
    
    try {
      // Reset states
      setStreamingContent({});
      setExpandedNodes(new Set());
      setCurrentNodeId(null);
      setNavigationHistory([]);

      // Helper function to restore node structure with proper typing
      const deserializeNode = (node: any): QANode => {
        return {
          id: node.id,
          question: node.question,
          analysis: node.analysis || '',
          children: Array.isArray(node.children) ? node.children.map(deserializeNode) : [],
          citations: Array.isArray(node.citations) ? node.citations : [],
          isExtendedRoot: Boolean(node.isExtendedRoot),
          originalNodeId: node.originalNodeId || null,
          evaluation: node.evaluation ? {
            score: Number(node.evaluation.score),
            reason: String(node.evaluation.reason)
          } : null
        };
      };

      // Type guard to verify the tree data structure
      const isValidTreeData = (data: any): data is any[] => {
        return Array.isArray(data) && data.every(node => 
          typeof node.id === 'string' && 
          typeof node.question === 'string' &&
          (!node.analysis || typeof node.analysis === 'string')
        );
      };

      if (!isValidTreeData(treeData)) {
        console.error('Invalid tree data structure:', treeData);
        throw new Error('Invalid tree data structure');
      }

      // First, deserialize all nodes
      const allNodes = treeData.map(deserializeNode);\
      
      // Find all extended nodes and their original nodes
      const extensionsByOriginalId = new Map<string, QANode[]>();
      const mainNodes: QANode[] = [];
      
      // First pass: collect all extensions and main nodes
      allNodes.forEach(node => {
        if (node.isExtendedRoot && node.originalNodeId) {
          const extensions = extensionsByOriginalId.get(node.originalNodeId) || [];
          extensions.push(node);
          extensionsByOriginalId.set(node.originalNodeId, extensions);
        } else if (!node.isExtendedRoot) {
          mainNodes.push(node);
        }
      });

      // Function to recursively process a node and its children
      const processNodeTree = (node: QANode): QANode => {
        // Process children recursively
        const processedChildren = node.children.map(child => processNodeTree(child));
        
        return {
          ...node,
          children: processedChildren,
        };
      };

      // Process the main tree
      const processedMainNodes = mainNodes.map(node => processNodeTree(node));

      // Get all extensions as a flat array
      const allExtensions = Array.from(extensionsByOriginalId.values()).flat();

      console.log('Processed tree structure:', {
        mainNodes: processedMainNodes,
        extensions: allExtensions,
        extensionMappings: Object.fromEntries(extensionsByOriginalId)
      });

      // Set the initial tree state
      if (processedMainNodes.length > 0) {
        setQaData(processedMainNodes);
        setRootExtensions(allExtensions);
      } else if (allExtensions.length > 0) {
        setQaData([allExtensions[0]]);
        setRootExtensions(allExtensions.slice(1));
      }

      // Populate streaming content for all nodes
      const populateContent = (node: QANode) => {
        if (node.analysis) {
          setStreamingContent(prev => ({
            ...prev,
            [node.id]: {
              content: node.analysis,
              citations: node.citations || [],
            },
          }));
        }
        node.children.forEach(populateContent);
      };

      // Process all nodes for streaming content
      [...processedMainNodes, ...allExtensions].forEach(populateContent);

      // Collect all node IDs for expansion
      const collectNodeIds = (node: QANode): string[] => {
        return [node.id, ...node.children.flatMap(collectNodeIds)];
      };

      // Expand all nodes from both main tree and extensions
      const allNodeIds = new Set([...processedMainNodes, ...allExtensions].flatMap(collectNodeIds));
      setExpandedNodes(allNodeIds);\

      console.log('Final loaded state:', {
        qaData: processedMainNodes.length > 0 ? processedMainNodes : [allExtensions[0]],
        rootExtensions: processedMainNodes.length > 0 ? allExtensions : allExtensions.slice(1),
        expandedNodes: Array.from(allNodeIds),
        streamingContent: Object.keys(streamingContent).length
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
      const expansionId = `expansion-${Date.now()}`;
      const timestamp = Date.now();
      
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

      // Update the node with the new expansion
      setQaData(prev => {
        const updateNode = (nodes: QANode[]): QANode[] =>
          nodes.map(n => {
            if (n.id === node.id) {
              return {
                ...n,
                expansions: [
                  ...(n.expansions || []),
                  {
                    id: expansionId,
                    analysis,
                    timestamp,
                    evaluation: evaluationData
                  }
                ]
              };
            }
            if (n.children.length > 0) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        return updateNode(prev);
      });

      setExpandedNodes(prev => new Set([...prev, node.id]));

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
          analysis: node.analysis,
          marketQuestion: marketQuestion,
          marketDescription: marketDescription
        }
      });

      if (error) throw error;

      console.log('Received evaluation:', { nodeId: node.id, evaluation: data });

      // Update qaData with evaluation
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

      // Update rootExtensions with evaluation
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
  };

  function renderQANode(node: QANode, depth: number = 0) {
    const isExpanded = expandedNodes.has(node.id);
    const hasExpansions = node.expansions && node.expansions.length > 0;
    const latestExpansion = hasExpansions ? node.expansions[node.expansions.length - 1] : null;
    
    return (
      <div key={node.id} className="border border-border rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-medium">
            {node.question}
            {hasExpansions && (
              <span className="ml-2 text-xs text-muted-foreground">
                (Expanded {node.expansions.length} times)
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
              <ReactMarkdown components={markdownComponents}>
                {node.analysis}
              </ReactMarkdown>
            </div>
            
            {hasExpansions && latestExpansion && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Latest Analysis</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExpandQuestion(node)}
                    disabled={isAnalyzing}
                    className="h-8"
                  >
                    Regenerate
                  </Button>
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown components={markdownComponents}>
                    {latestExpansion.analysis}
                  </ReactMarkdown>
                </div>
                {latestExpansion.evaluation && (
                  <div className="mt-4 p-2 bg-accent/50 rounded">
                    <div className="text-xs font-medium mb-1">
                      Score: {latestExpansion.evaluation.score}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {latestExpansion.evaluation.reason}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {!hasExpansions && (
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
  }

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
          {
