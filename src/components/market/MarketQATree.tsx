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

const MAX_DEPTH = 3;

interface Node {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    question: string;
    answer: string;
    updateNodeData: (id: string, field: string, value: string) => void;
  };
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
}

const QANodeComponent = ({ data }: { data: Node['data'] }) => {
  return (
    <div className="bg-[#1a1b1e] border border-white/10 rounded-lg p-4 w-[300px]">
      <div className="text-sm font-medium text-white">
        {data.question}
      </div>
      {data.answer && (
        <>
          <div className="border-t border-white/10 my-2" />
          <div className="text-xs text-gray-300">
            {data.answer}
          </div>
        </>
      )}
    </div>
  );
};

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const [hasCreatedNodes, setHasCreatedNodes] = useState<Set<string>>(new Set());
  
  const currentNodesRef = useRef(nodes);
  useEffect(() => {
    currentNodesRef.current = nodes;
  }, [nodes]);

  const calculatePosition = (depth: number, index: number, totalNodes: number) => {
    const baseX = window.innerWidth / 3;
    const baseY = 100;
    const horizontalSpacing = 350;
    const verticalSpacing = 200;
    
    const x = baseX + (index - (totalNodes - 1) / 2) * horizontalSpacing;
    const y = baseY + (depth * verticalSpacing);
    
    return { x, y };
  };

  const createNode = (id: string, position: { x: number; y: number }, data: Partial<Node['data']>): Node => {
    return {
      id,
      type: 'qaNode',
      position,
      data: {
        question: data.question || '',
        answer: data.answer || '',
        updateNodeData: (nodeId: string, field: string, value: string) => {
          setNodes((nodes) =>
            nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, [field]: value } }
                : node
            )
          );
        },
      },
    };
  };

  const createChildNodes = useCallback(async (
    parentId: string,
    questions: string[],
    depth: number
  ) => {
    const newNodes = questions.map((question, index) => {
      const position = calculatePosition(depth, index, questions.length);
      return createNode(`node-${Date.now()}-${index}`, position, { question });
    });

    const newEdges = newNodes.map(node => ({
      id: `edge-${parentId}-${node.id}`,
      source: parentId,
      target: node.id,
      type: 'smoothstep',
    }));

    setNodes(nodes => [...nodes, ...newNodes]);
    setEdges(edges => [...edges, ...newEdges]);

    for (const node of newNodes) {
      await analyzeNode(node.id, node.data.question, depth);
    }
  }, [setNodes, setEdges]);

  const analyzeNode = useCallback(async (nodeId: string, nodeQuestion: string, depth: number) => {
    if (depth >= MAX_DEPTH) return;
    
    setProcessingNodes(prev => new Set(prev).add(nodeId));
    
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
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
      
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
                  if (analysisMatch && analysisMatch[1]) {
                    setNodes((nodes) =>
                      nodes.map((node) =>
                        node.id === nodeId
                          ? {
                              ...node,
                              data: { ...node.data, answer: analysisMatch[1] },
                            }
                          : node
                      )
                    );
                  }
      
                  if (accumulatedJSON.includes('"analysis"') && accumulatedJSON.includes('"questions"')) {
                    const data = JSON.parse(accumulatedJSON);
                    
                    if (data.questions?.length > 0 && !hasCreatedNodes.has(nodeId) && depth < MAX_DEPTH) {
                      await createChildNodes(nodeId, data.questions, depth + 1);
                      setHasCreatedNodes(prev => new Set(prev).add(nodeId));
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
  }, [createChildNodes, hasCreatedNodes, marketId, toast]);

  const handleAnalyze = async () => {
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
    setHasCreatedNodes(new Set());
    
    try {
      const rootId = 'root-node';
      const rootPosition = calculatePosition(0, 0, 1);
      const rootNode = createNode(rootId, rootPosition, { question: marketQuestion });
      
      setNodes([rootNode]);
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
