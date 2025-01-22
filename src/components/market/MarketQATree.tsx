import { useState, useCallback } from 'react';
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

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const maxDepth = 3;

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
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

  const analyzeNode = async (nodeId: string, nodeQuestion: string, depth: number) => {
    if (depth >= maxDepth) return;
    
    setProcessingNodes(prev => new Set(prev).add(nodeId));
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: JSON.stringify({
          marketId,
          question: nodeQuestion
        })
      });

      if (error) throw error;
      if (!data?.body) throw new Error('No response body');

      const reader = new Response(data.body).body?.getReader();
      if (!reader) throw new Error('Failed to create reader');

      const decoder = new TextDecoder();
      let accumulatedContent = '';

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
                accumulatedContent += content;
                try {
                  const data: NodeData = JSON.parse(accumulatedContent);
                  
                  // Update current node's analysis
                  updateNodeData(nodeId, 'answer', data.analysis);

                  // Spawn children if we have questions and not at max depth
                  if (data.questions?.length === 3 && depth < maxDepth) {
                    const parent = nodes.find(n => n.id === nodeId);
                    if (parent) {
                      const parentElement = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement;
                      
                      // Create and analyze child nodes
                      for (let i = 0; i < data.questions.length; i++) {
                        const childQuestion = data.questions[i];
                        const childId = `node-${Date.now()}-${i}`;
                        const position = generateNodePosition(
                          i,
                          3,
                          parent.position.x,
                          parent.position.y,
                          depth + 1,
                          maxDepth,
                          parentElement
                        );

                        const newNode = createNode(childId, position, {
                          question: childQuestion,
                          answer: '',
                          updateNodeData,
                        });

                        const newEdge = createEdge(nodeId, childId, depth + 1);

                        setNodes(nds => [...nds, newNode]);
                        setEdges(eds => [...eds, newEdge]);

                        // Analyze the new child node
                        await analyzeNode(childId, childQuestion, depth + 1);
                      }
                    }
                  }
                } catch (e) {
                  // Not valid JSON yet, keep accumulating
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
    if (!marketQuestion?.trim()) {
      toast({
        variant: "destructive",
        title: "Analysis Error",
        description: "Market question is required to perform analysis",
      });
      return;
    }

    setIsAnalyzing(true);
    setNodes([]);
    setEdges([]);
    
    try {
      // Create root node
      const rootId = 'root-node';
      const rootNode = createNode(rootId, { x: 0, y: 0 }, {
        question: marketQuestion,
        answer: '',
        updateNodeData,
      });
      
      setNodes([rootNode]);
  
      // Start analysis with root node
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
