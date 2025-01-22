import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; 
import { useToast } from '@/hooks/use-toast';
import { supabase } from "@/integrations/supabase/client";
import { 
  ReactFlow, 
  Background, 
  Controls,
  useNodesState, 
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateNodePosition, createNode, createEdge } from './utils/nodeGenerator';

interface NodeData {
  analysis: string;
  questions: string[];
}

const MAX_DEPTH = 3;
const CHILDREN_PER_NODE = 3;

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const [hasCreatedNodes, setHasCreatedNodes] = useState<Set<string>>(new Set());

  // Store function references in refs to avoid circular dependencies
  const analyzeNodeRef = useRef<any>(null);
  const createChildNodesRef = useRef<any>(null);

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    console.log('Updating node data:', { nodeId, field, value: value.substring(0, 50) + '...' });
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          console.log('Found node to update:', nodeId);
          return {
            ...node,
            data: {
              ...node.data,
              [field]: value,
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  // Define createChildNodes first but store in ref
  createChildNodesRef.current = (
    parentId: string,
    parentPosition: { x: number, y: number },
    questions: string[],
    depth: number
  ) => {
    console.log('Creating child nodes:', { parentId, questions, depth });
    const newNodes = [];
    const newEdges = [];

    for (let i = 0; i < questions.length; i++) {
      const childId = `node-${Date.now()}-${i}`;
      const position = generateNodePosition(
        i,
        CHILDREN_PER_NODE,
        parentPosition.x,
        parentPosition.y,
        depth + 1,
        MAX_DEPTH,
        document.querySelector(`[data-id="${parentId}"]`) as HTMLElement
      );

      const newNode = createNode(childId, position, {
        question: questions[i],
        answer: '',
        updateNodeData,
      });

      const newEdge = createEdge(parentId, childId, depth + 1);

      newNodes.push(newNode);
      newEdges.push(newEdge);

      // Use ref to call analyzeNode
      if (analyzeNodeRef.current) {
        analyzeNodeRef.current(childId, questions[i], depth + 1);
      }
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
  };

  // Define analyzeNode and store in ref
  analyzeNodeRef.current = async (nodeId: string, nodeQuestion: string, depth: number) => {
    console.log('Starting analysis for node:', { nodeId, depth, question: nodeQuestion });
    if (depth >= MAX_DEPTH) {
      console.log('Max depth reached, stopping analysis');
      return;
    }
    
    setProcessingNodes(prev => new Set(prev).add(nodeId));
    setStreamingContent(prev => ({ ...prev, [nodeId]: '' }));
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({
          marketId,
          question: nodeQuestion
        })
      });

      if (error) throw error;
      
      const reader = new Response(data.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      let accumulatedContent = '';
      let accumulatedJSON = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete for node:', nodeId);
          break;
        }
      
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
      
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
      
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                accumulatedJSON += content;
                console.log('Accumulated JSON progress:', accumulatedJSON);
                
                try {
                  // Extract analysis text as it streams in
                  const analysisMatch = accumulatedJSON.match(/"analysis":\s*"([^"]*)"(?:\s*,\s*"questions"|$)/);
                  if (analysisMatch && analysisMatch[1]) {
                    updateNodeData(nodeId, 'answer', analysisMatch[1]);
                  }
      
                  // Try to parse complete JSON when we have both analysis and questions
                  if (accumulatedJSON.includes('"analysis"') && accumulatedJSON.includes('"questions"')) {
                    const data = JSON.parse(accumulatedJSON);
                    console.log('Parsed complete JSON:', data);
                    
                    if (data.questions?.length > 0 && !hasCreatedNodes.has(nodeId) && depth < MAX_DEPTH) {
                      console.log('Node creation check passed:', {
                        hasQuestions: data.questions?.length > 0,
                        notCreated: !hasCreatedNodes.has(nodeId),
                        withinDepth: depth < MAX_DEPTH,
                        nodeId
                      });
                      
                      const parentNode = nodes.find(n => n.id === nodeId);
                      console.log('Parent node lookup result:', parentNode);
                      
                      if (parentNode && createChildNodesRef.current) {
                        console.log('Creating child nodes for:', nodeId, 'with questions:', data.questions);
                        createChildNodesRef.current(
                          nodeId,
                          parentNode.position,
                          data.questions,
                          depth
                        );
                        setHasCreatedNodes(prev => {
                          const next = new Set(prev);
                          next.add(nodeId);
                          console.log('Updated hasCreatedNodes:', next);
                          return next;
                        });
                      } else {
                        console.warn('Parent node not found in nodes state:', nodeId);
                      }
                    } else {
                      console.log('Node creation check failed:', {
                        hasQuestions: data.questions?.length > 0,
                        notCreated: !hasCreatedNodes.has(nodeId),
                        withinDepth: depth < MAX_DEPTH,
                        nodeId
                      });
                    }
                  }
                } catch (e) {
                  console.log('Parsing in progress:', e);
                  // Continue accumulating if we don't have valid JSON yet
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing node:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Failed to analyze the question. Please try again.",
      });
    } finally {
      setProcessingNodes(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handleAnalyze = async () => {
    console.log('Starting analysis with market question:', marketQuestion);
    if (!marketQuestion?.trim()) {
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Market question is required for analysis",
      });
      return;
    }

    setIsAnalyzing(true);
    setNodes([]);
    setEdges([]);
    setStreamingContent({});
    setHasCreatedNodes(new Set());
    
    try {
      // Create root node with market title
      const rootId = 'root-node';
      console.log('Creating root node:', rootId);
      const rootNode = createNode(rootId, { x: 0, y: 0 }, {
        question: marketQuestion,
        answer: '',
        updateNodeData,
      });
      
      setNodes([rootNode]);
      console.log('Root node created, starting analysis');
  
      // Start analysis with root node
      await analyzeNodeRef.current(rootId, marketQuestion, 0);
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Something went wrong during analysis. Please try again.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const nodeTypes = {
    qaNode: QANodeComponent
  };

  return (
    <Card className="p-4 mt-4 bg-card h-[600px] relative">
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="absolute top-2 right-2 z-10"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </Button>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
      >
        <Background />
        <Controls className="!bg-transparent [&>button]:!bg-transparent" />
      </ReactFlow>
    </Card>
  );
}
