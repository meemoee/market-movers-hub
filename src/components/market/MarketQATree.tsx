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

const MAX_DEPTH = 3;
const CHILDREN_PER_NODE = 3;

export function MarketQATree({ marketId, marketQuestion }: { marketId: string, marketQuestion: string }) {
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingNodes, setProcessingNodes] = useState<Set<string>>(new Set());

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

  const analyzeNode = async (nodeId: string, nodeQuestion: string, depth: number) => {
    console.log('Starting analysis for node:', { nodeId, depth, question: nodeQuestion });
    if (depth >= MAX_DEPTH) {
      console.log('Max depth reached, stopping analysis');
      return;
    }
    
    setProcessingNodes(prev => new Set(prev).add(nodeId));
    
    try {
      console.log('Invoking edge function for node:', nodeId);
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
      const decoder = new TextDecoder();

      console.log('Starting to read stream for node:', nodeId);
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream complete for node:', nodeId);
          break;
        }

        const chunk = decoder.decode(value);
        console.log('Received chunk for node:', nodeId, chunk.substring(0, 50) + '...');
        
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
                console.log('Accumulated content for node:', nodeId, accumulatedContent.length, 'chars');
                try {
                  // Try to parse as JSON
                  const data: NodeData = JSON.parse(accumulatedContent);
                  console.log('Successfully parsed JSON for node:', nodeId, {
                    analysisLength: data.analysis.length,
                    questionsCount: data.questions.length
                  });
                  
                  // Update current node's analysis
                  updateNodeData(nodeId, 'answer', data.analysis);

                  // Create child nodes if we have questions and not at max depth
                  if (data.questions?.length === CHILDREN_PER_NODE && depth < MAX_DEPTH) {
                    console.log('Creating child nodes for:', nodeId);
                    const parent = nodes.find(n => n.id === nodeId);
                    if (parent) {
                      const parentElement = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement;
                      console.log('Found parent element:', !!parentElement);
                      
                      // Create child nodes and analyze them
                      for (let i = 0; i < data.questions.length; i++) {
                        const childQuestion = data.questions[i];
                        const childId = `node-${Date.now()}-${i}`;
                        console.log('Generating position for child:', childId);
                        const position = generateNodePosition(
                          i,
                          CHILDREN_PER_NODE,
                          parent.position.x,
                          parent.position.y,
                          depth + 1,
                          MAX_DEPTH,
                          parentElement
                        );
                        console.log('Generated position:', position);

                        const newNode = createNode(childId, position, {
                          question: childQuestion,
                          answer: '',
                          updateNodeData,
                        });

                        const newEdge = createEdge(nodeId, childId, depth + 1);

                        console.log('Adding new node and edge:', { nodeId: childId, parentId: nodeId });
                        setNodes(nds => {
                          console.log('Current nodes:', nds.length, 'Adding new node:', childId);
                          return [...nds, newNode];
                        });
                        setEdges(eds => {
                          console.log('Current edges:', eds.length, 'Adding new edge:', newEdge.id);
                          return [...eds, newEdge];
                        });

                        // Analyze the new child node
                        console.log('Starting analysis for child node:', childId);
                        await analyzeNode(childId, childQuestion, depth + 1);
                      }
                    } else {
                      console.log('Parent node not found:', nodeId);
                    }
                  }
                } catch (e) {
                  // Not valid JSON yet, keep accumulating
                  console.log('Invalid JSON, continuing to accumulate:', e.message);
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
