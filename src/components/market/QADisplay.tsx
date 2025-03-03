import { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import type { Components as MarkdownComponents } from 'react-markdown';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon, ArrowRight, Calculator } from "lucide-react";
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
import { SitePreviewList } from "./research/SitePreviewList";
import { InsightsDisplay } from "./insights/InsightsDisplay";
import { AnalysisDisplay } from "./research/AnalysisDisplay";

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
  const [navigationHistory, setNavigationHistory] = useState<QANode[][]>([[]]);
  const queryClient = useQueryClient();
  
  const [finalAnalysis, setFinalAnalysis] = useState<string>('');
  const [isGeneratingFinalAnalysis, setIsGeneratingFinalAnalysis] = useState(false);
  const [finalProbability, setFinalProbability] = useState<string>('');
  const [finalAreasForResearch, setFinalAreasForResearch] = useState<string[]>([]);
  const [streamingFinalAnalysis, setStreamingFinalAnalysis] = useState(false);
  const [treeUrls, setTreeUrls] = useState<Array<{url: string, title?: string}>>([]);

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

  const extractUrlsFromTree = (nodes: QANode[]): Array<{url: string, title?: string}> => {
    let urls: Array<{url: string, title?: string}> = [];
    
    const processNode = (node: QANode) => {
      if (node.citations && node.citations.length > 0) {
        node.citations.forEach(url => {
          if (!urls.some(u => u.url === url)) {
            urls.push({ url });
          }
        });
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(processNode);
      }
    };
    
    nodes.forEach(processNode);
    return urls;
  };

  useEffect(() => {
    if (qaData.length > 0) {
      const extractedUrls = extractUrlsFromTree(qaData);
      setTreeUrls(extractedUrls);
    }
  }, [qaData]);

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

        // Process complete chunks in buffer
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
        
        try {
          const { content, citations } = cleanStreamContent(jsonStr);
          if (content) {
            accumulatedContent += content;
            accumulatedCitations = [...new Set([...accumulatedCitations, ...citations])];

            // Real-time update of streaming content and node analysis
            setStreamingContent(prev => ({
              ...prev,
              [nodeId]: {
                content: accumulatedContent,
                citations: accumulatedCitations,
              },
            }));
            
            // Update the node in qaData tree with the latest streamed content
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
            
            // If the node is from root extensions, update it there as well
            setRootExtensions(prev => 
              prev.map(ext => 
                ext.id === nodeId ? 
                { ...ext, analysis: accumulatedContent, citations: accumulatedCitations } : 
                ext
              )
            );
          }
        } catch (e) {
          console.debug('Error processing content part:', e);
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
  };

  const buildQAContext = (): string => {
    const formatNode = (node: QANode, depth: number = 0): string => {
      const indent = '  '.repeat(depth);
      let result = `${indent}Q: ${node.question}\n${indent}A: ${node.analysis}\n`;
      
      if (node.children && node.children.length > 0) {
        result += node.children.map(child => formatNode(child, depth + 1)).join('\n');
      }
      
      return result;
    };
    
    const allNodes = [...qaData, ...rootExtensions];
    return allNodes.map(node => formatNode(node)).join('\n\n');
  };

  const generateFinalAnalysis = async () => {
    if (qaData.length === 0 && rootExtensions.length === 0) {
      toast({
        title: "No QA data",
        description: "Please analyze the question first to generate data for probability analysis.",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingFinalAnalysis(true);
    setStreamingFinalAnalysis(true);
    setFinalAnalysis('');
    setFinalProbability('');
    setFinalAreasForResearch([]);

    try {
      const selectedResearchData = savedResearch?.find(r => r.id === selectedResearch);
      const qaContext = buildQAContext();
      
      const { data, error } = await supabase.functions.invoke('extract-research-insights', {
        body: JSON.stringify({ 
          marketId,
          marketQuestion,
          researchType: 'qa-tree',
          qaContext,
          webResearchContext: selectedResearchData ? {
            analysis: selectedResearchData.analysis,
            sources: selectedResearchData.sources
          } : null
        }),
      });
      
      if (error) throw error;
      
      const reader = new Response(data.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');
      
      let accumulatedContent = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const decoded = new TextDecoder().decode(value);
          accumulatedContent += decoded;
          
          try {
            const parsedData = JSON.parse(accumulatedContent);
            setFinalAnalysis(parsedData.analysis || '');
            setFinalProbability(parsedData.probability || '');
            setFinalAreasForResearch(parsedData.areasForResearch || []);
          } catch (e) {
            setFinalAnalysis(accumulatedContent);
          }
        }
        
        try {
          const parsedData = JSON.parse(accumulatedContent);
          setFinalAnalysis(parsedData.analysis || accumulatedContent);
          setFinalProbability(parsedData.probability || '');
          setFinalAreasForResearch(parsedData.areasForResearch || []);
        } catch (e) {
          setFinalAnalysis(accumulatedContent);
        }
      } finally {
        setStreamingFinalAnalysis(false);
      }
    } catch (error) {
      console.error('Error generating final analysis:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: error instanceof Error ? error.message : "Failed to generate the analysis",
      });
      setStreamingFinalAnalysis(false);
    } finally {
      setIsGeneratingFinalAnalysis(false);
    }
  };

  function renderQANode(node: QANode, depth: number = 0) {
    const isStreaming = currentNodeId === node.id;
    const streamContent = streamingContent[node.id];
    const isExpanded = expandedNodes.has(node.id);
    
    const analysisContent = isStreaming && streamContent ? streamContent.content : node.analysis;
    const citations = isStreaming && streamContent ? streamContent.citations : node.citations;
    
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
      hr: () => <hr className="my-4" />
    };

    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{node.question}</h2>
            {getExtensionInfo(node)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleNode(node.id)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => handleExpandQuestion(node)}
              title="Expand this question with a fresh analysis"
              aria-label="Expand question"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="ml-2 mt-3 border-l-2 border-muted pl-4">
            <div className="prose prose-sm dark:prose-invert max-w-full">
              {node.evaluation && (
                <div className={`mb-3 text-sm p-2 rounded ${
                  node.evaluation.score > 0.7 ? 'bg-green-500/10' : 
                  node.evaluation.score > 0.4 ? 'bg-yellow-500/10' : 'bg-red-500/10'
                }`}>
                  <div className="font-semibold">Quality: {Math.round(node.evaluation.score * 100)}%</div>
                  <div className="text-muted-foreground">{node.evaluation.reason}</div>
                </div>
              )}
              
              {isStreaming && streamContent ? (
                <div>
                  <ReactMarkdown components={markdownComponents}>
                    {analysisContent || 'Generating analysis...'}
                  </ReactMarkdown>
                  <div className="mt-2 animate-pulse">▌</div>
                </div>
              ) : (
                <ReactMarkdown components={markdownComponents}>
                  {analysisContent || 'No analysis available'}
                </ReactMarkdown>
              )}
              
              {renderCitations(citations)}
              
              {nodeExtensions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium">Previous expansions:</div>
                  {nodeExtensions.map((extension, i) => (
                    <div key={extension.id} className="p-2 bg-muted/10 rounded-md">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-sm font-medium">Expansion {i + 1}</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateToExtension(extension)}
                          className="h-7 px-2"
                        >
                          <ArrowRight className="h-3 w-3 mr-1" /> View
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getPreviewText(extension.analysis)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {node.children && node.children.length > 0 && (
              <div className="mt-4 space-y-4">
                {node.children.map(childNode => (
                  <div key={childNode.id} className="border-t border-border pt-4">
                    {renderQANode(childNode, depth + 1)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row justify-between">
            <div className="flex gap-2">
              <Select
                value={selectedQATree}
                onValueChange={(value) => {
                  setSelectedQATree(value);
                  if (value !== 'none' && savedQATrees) {
                    const tree = savedQATrees.find(t => t.id === value);
                    if (tree) {
                      loadSavedQATree(tree.tree_data);
                    }
                  }
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Load saved analysis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">New analysis</SelectItem>
                  {savedQATrees?.map((tree) => (
                    <SelectItem key={tree.id} value={tree.id}>
                      {new Date(tree.created_at).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            
              <Select
                value={selectedResearch}
                onValueChange={setSelectedResearch}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select web research" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No web research</SelectItem>
                  {savedResearch?.map((research) => (
                    <SelectItem key={research.id} value={research.id}>
                      {new Date(research.created_at).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              {navigationHistory.length > 0 && (
                <Button
                  variant="outline" 
                  size="sm"
                  onClick={navigateBack}
                  disabled={navigationHistory.length === 0}
                >
                  Back to main tree
                </Button>
              )}
              
              <Button
                variant="outline" 
                size="sm"
                onClick={saveQATree}
                disabled={isAnalyzing || (qaData.length === 0 && rootExtensions.length === 0)}
              >
                Save analysis
              </Button>
              
              <Button
                onClick={handleAnalyze}
                size="sm"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze'}
              </Button>
            </div>
          </div>
          
          {navigationHistory.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Viewing extension of: {qaData[0]?.question}
            </div>
          )}
        </div>
      </Card>
      
      {treeUrls.length > 0 && (
        <div className="mb-4">
          <SitePreviewList results={treeUrls} />
        </div>
      )}
      
      <div className="space-y-6">
        {qaData.length > 0 ? (
          qaData.map((node) => (
            <Card key={node.id} className="p-4">
              {renderQANode(node)}
            </Card>
          ))
        ) : isAnalyzing ? (
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarFallback className="animate-pulse">
                  AI
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium">Analyzing question</h3>
                <p className="text-sm text-muted-foreground">
                  Building a tree of follow-up questions and answers...
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 bg-muted/5">
            <div className="text-center py-8 text-muted-foreground">
              <p>Click "Analyze" to create a Q&A tree for this market question</p>
            </div>
          </Card>
        )}
      </div>
      
      {(qaData.length > 0 || rootExtensions.length > 0) && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Probability Analysis
            </h3>
            <Button
              onClick={generateFinalAnalysis}
              disabled={isGeneratingFinalAnalysis || (qaData.length === 0 && rootExtensions.length === 0)}
              size="sm"
            >
              {isGeneratingFinalAnalysis ? 'Generating...' : 'Generate Analysis'}
            </Button>
          </div>
          
          {finalAnalysis ? (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-1">Analysis:</div>
                <div className="relative">
                  <ScrollArea className="h-[200px] rounded-md border p-4">
                    <div className="prose prose-sm dark:prose-invert max-w-full">
                      <ReactMarkdown components={markdownComponents as any}>
                        {finalAnalysis}
                      </ReactMarkdown>
                      {streamingFinalAnalysis && <div className="mt-2 animate-pulse">▌</div>}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              
              {finalProbability && (
                <div>
                  <div className="text-sm font-medium mb-1">Probability estimate:</div>
                  <div className="p-3 bg-accent/10 rounded-md">
                    {finalProbability}
                  </div>
                </div>
              )}
              
              {finalAreasForResearch.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Areas for further research:</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {finalAreasForResearch.map((area, index) => (
                      <li key={index} className="text-sm">{area}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              {isGeneratingFinalAnalysis ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Generating analysis...
                </div>
              ) : (
                <p>
                  Generate a comprehensive analysis based on the Q&A tree to better understand the probability of this market resolving as YES.
                </p>
              )}
            </div>
          )}
        </Card>
      )}
      
      {qaData.length > 0 && finalAnalysis && (
        <Card className="p-4">
          <InsightsDisplay 
            probability={finalProbability} 
            areasForResearch={finalAreasForResearch}
          />
        </Card>
      )}
    </div>
  );
}
