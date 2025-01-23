import { useState, useCallback, useRef, useEffect } from 'react';
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
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const [hasCreatedNodes, setHasCreatedNodes] = useState<Set<string>>(new Set());
  const [currentLayer, setCurrentLayer] = useState<string[]>([]);
  const [layerComplete, setLayerComplete] = useState(true);
  
  const currentNodesRef = useRef(nodes);
  
  useEffect(() => {
    currentNodesRef.current = nodes;
  }, [nodes]);

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    console.log('Updating node data:', { nodeId, field, value: value.substring(0, 50) + '...' });
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
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

  const createChildNodes = useCallback((
    parentId: string,
    parentPosition: { x: number, y: number },
    questions: string[],
    depth: number
  ) => {
    console.log('Creating child nodes:', { parentId, questions, depth });
    const newNodes = [];
    const newEdges = [];
    const newLayerNodes = [];

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
      newLayerNodes.push(childId);
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
    setCurrentLayer(newLayerNodes);
    setLayerComplete(false);

    // Start processing the first node in the layer
    if (newLayerNodes.length > 0) {
      const firstNode = newNodes.find(n => n.id === newLayerNodes[0]);
      if (firstNode) {
        setTimeout(() => {
          analyzeNode(firstNode.id, firstNode.data.question, depth + 1, 0);
        }, 500);
      }
    }
  }, [setNodes, setEdges]);

  const processNextInLayer = useCallback((currentNodeId: string, depth: number) => {
    console.log('Processing next in layer:', { currentNodeId, depth, currentLayer });
    const nodeIndex = currentLayer.indexOf(currentNodeId);
    
    if (nodeIndex < currentLayer.length - 1) {
      // Process next node in current layer
      const nextNodeId = currentLayer[nodeIndex + 1];
      const nextNode = currentNodesRef.current.find(n => n.id === nextNodeId);
      if (nextNode) {
        console.log('Processing next node:', nextNodeId);
        setTimeout(() => {
          analyzeNode(nextNodeId, nextNode.data.question, depth, 0);
        }, 1000); // Add delay between nodes
      }
    } else {
      // Layer is complete
      console.log('Layer complete:', depth);
      setLayerComplete(true);
      setCurrentLayer([]);
    }
  }, [currentLayer]);

  const analyzeNode = useCallback(async (nodeId: string, nodeQuestion: string, depth: number, retryCount: number = 0) => {
    console.log('Starting analysis for node:', { nodeId, depth, question: nodeQuestion, retryCount });
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

      let accumulatedJSON = '';
      const decoder = new TextDecoder();
      let hasAnalysis = false;
      
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
                
                try {
                  const analysisMatch = accumulatedJSON.match(/"analysis":\s*"([^"]*)"(?:\s*,\s*"questions"|$)/);
                  if (analysisMatch && analysisMatch[1] && !hasAnalysis) {
                    updateNodeData(nodeId, 'answer', analysisMatch[1]);
                    hasAnalysis = true;
                  }
      
                  if (accumulatedJSON.includes('"analysis"') && accumulatedJSON.includes('"questions"') && hasAnalysis) {
                    const data = JSON.parse(accumulatedJSON);
                    
                    if (data.questions?.length > 0 && !hasCreatedNodes.has(nodeId) && depth < MAX_DEPTH) {
                      const parentNode = currentNodesRef.current.find(n => n.id === nodeId);
                      
                      if (parentNode) {
                        createChildNodes(
                          nodeId,
                          parentNode.position,
                          data.questions,
                          depth
                        );
                        setHasCreatedNodes(prev => new Set(prev).add(nodeId));
                      }
                    }
                  }
                } catch (e) {
                  console.log('Parsing in progress:', e);
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      if (!hasAnalysis && retryCount < MAX_RETRIES) {
        console.log(`Retrying node ${nodeId}, attempt ${retryCount + 1}`);
        setTimeout(() => {
          analyzeNode(nodeId, nodeQuestion, depth, retryCount + 1);
        }, RETRY_DELAY * Math.pow(2, retryCount));
        return;
      }

      // Process next node in layer
      processNextInLayer(nodeId, depth);

    } catch (error) {
      console.error('Error analyzing node:', error);
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying node ${nodeId}, attempt ${retryCount + 1}`);
        setTimeout(() => {
          analyzeNode(nodeId, nodeQuestion, depth, retryCount + 1);
        }, RETRY_DELAY * Math.pow(2, retryCount));
      } else {
        toast({
          variant: "destructive",
          title: "Analysis Error",
          description: "Failed to analyze the question after multiple attempts.",
        });
        processNextInLayer(nodeId, depth);
      }
    } finally {
      setProcessingNodes(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  }, [createChildNodes, hasCreatedNodes, updateNodeData, processNextInLayer, marketId]);

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
    setCurrentLayer([]);
    setLayerComplete(true);
    
    try {
      const rootId = 'root-node';
      const rootNode = createNode(rootId, { x: 0, y: 0 }, {
        question: marketQuestion,
        answer: '',
        updateNodeData,
      });
      
      setNodes([rootNode]);
      currentNodesRef.current = [rootNode];
      setCurrentLayer([rootId]);
      setLayerComplete(false);
      
      await analyzeNode(rootId, marketQuestion, 0);
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