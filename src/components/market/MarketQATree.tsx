import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; 
import { supabase } from "@/integrations/supabase/client";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Node,
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());
  const maxDepth = 3; // Hardcoded for now

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

  // Function to analyze a single node
  const analyzeNode = async (nodeId: string, question: string, depth: number) => {
    if (depth >= maxDepth) return;
    
    setProcessingNodes(prev => new Set(prev).add(nodeId));
    
    try {
      const { data: { body }, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { question }
      });

      if (error) throw error;

      const reader = new Response(body).body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      while (reader) {
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
                  // Try parsing accumulated JSON
                  const data: NodeData = JSON.parse(accumulatedContent);
                  
                  // Update current node's analysis
                  updateNodeData(nodeId, 'answer', data.analysis);

                  // If we have complete data with 3 questions, spawn children
                  if (data.questions?.length === 3 && depth < maxDepth) {
                    const parent = nodes.find(n => n.id === nodeId);
                    if (parent) {
                      const parentElement = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement;
                      
                      // Create child nodes
                      data.questions.forEach(async (childQuestion, i) => {
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

                        // Analyze child node
                        await analyzeNode(childId, childQuestion, depth + 1);
                      });
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
    } finally {
      setProcessingNodes(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setNodes([]);
    setEdges([]);
    
    // Create root node with market question
    const rootId = 'root-node';
    setNodes([createNode(rootId, { x: 0, y: 0 }, {
      question: marketQuestion,
      answer: '',
      updateNodeData,
    })]);

    // Start analysis from root
    await analyzeNode(rootId, marketQuestion, 0);
    
    setIsAnalyzing(false);
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
