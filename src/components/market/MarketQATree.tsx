import { useState, useCallback, useRef, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Node, 
  Edge, 
  Connection, 
  useNodesState, 
  useEdgesState, 
  addEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateNodePosition, createNode, createEdge } from './utils/nodeGenerator';
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  const removeNode = useCallback((nodeId: string) => {
    const nodesToRemove = new Set<string>();
    const edgesToRemove = new Set<string>();
    
    const findDescendants = (id: string) => {
      nodesToRemove.add(id);
      edges.forEach(edge => {
        if (edge.source === id) {
          edgesToRemove.add(edge.id);
          findDescendants(edge.target);
        }
      });
    };
    
    findDescendants(nodeId);
    
    setNodes((nds) => nds.filter((node) => !nodesToRemove.has(node.id)));
    setEdges((eds) => eds.filter((edge) => !edgesToRemove.has(edge.id)));
  }, [edges, setNodes, setEdges]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              [field]: value,
              updateNodeData,
              addChildNode,
              removeNode
            },
          };
        }
        return node;
      })
    );
  }, [setNodes, addChildNode, removeNode]);

  const onConnect = useCallback(
    (params: Connection) => {
      const targetHasParent = edges.some(edge => edge.target === params.target);
      if (!targetHasParent) {
        setEdges((eds) => addEdge({
          ...params,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#666', strokeWidth: 2 }
        }, eds));
      }
    },
    [edges, setEdges]
  );

  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to generate analysis.",
          variant: "destructive"
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      console.log('Generating analysis for market:', marketId, 'user:', user.id);
      const { data, error } = await supabase.functions.invoke('generate-qa-tree', {
        body: { marketId, userId: user.id }
      });

      if (error) {
        console.error('Generate analysis error:', error);
        throw error;
      }

      let accumulatedContent = '';
      
      const stream = new ReadableStream({
        start(controller) {
          const textDecoder = new TextDecoder();
          const reader = new Response(data.body).body?.getReader();
          
          function push() {
            reader?.read().then(({done, value}) => {
              if (done) {
                console.log('Stream complete');
                controller.close();
                return;
              }
              
              const chunk = textDecoder.decode(value);
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
                      setStreamingContent(accumulatedContent);
                      
                      // Update root node with streaming content
                      setNodes((nds) =>
                        nds.map((node) => {
                          if (node.id === 'node-1') {
                            return {
                              ...node,
                              data: {
                                ...node.data,
                                answer: accumulatedContent
                              },
                            };
                          }
                          return node;
                        })
                      );
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e);
                  }
                }
              }
              
              push();
            });
          }
          
          push();
        }
      });

      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

    } catch (error) {
      console.error('Error generating analysis:', error);
      toast({
        title: "Error",
        description: "Failed to generate analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (nodes.length === 0) {
      const rootNode = createNode('node-1', { x: 0, y: 0 }, {
        question: 'Root Question',
        answer: '',
        updateNodeData,
        addChildNode,
        removeNode
      });
      setNodes([rootNode]);
    }
  }, [nodes.length, setNodes, updateNodeData, addChildNode, removeNode]);

  const nodeTypes = {
    qaNode: QANodeComponent
  };

  return (
    <>
      <Card className="p-4 mt-4 bg-card h-[600px]">
        <div className="flex justify-end mb-4">
          <Button 
            onClick={handleGenerateAnalysis}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Analysis'}
          </Button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate Child Nodes</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="layers">Number of Layers</label>
              <Input
                id="layers"
                type="number"
                value={layers}
                onChange={(e) => setLayers(parseInt(e.target.value))}
                min={1}
                max={5}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="children">Children per Layer</label>
              <Input
                id="children"
                type="number"
                value={childrenPerLayer}
                onChange={(e) => setChildrenPerLayer(parseInt(e.target.value))}
                min={1}
                max={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              if (selectedParentId) {
                generateChildNodes(selectedParentId, 1, layers, childrenPerLayer);
                setIsDialogOpen(false);
              }
            }}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}