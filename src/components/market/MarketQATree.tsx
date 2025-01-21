import { useState, useCallback, useRef } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from '@/integrations/supabase/client';

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const generationQueue = useRef<Promise<void>>(Promise.resolve());

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

  const handleStreamResponse = async (reader: ReadableStreamDefaultReader<Uint8Array>, nodeId: string) => {
    const decoder = new TextDecoder();
    let accumulatedResponse = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices[0]?.delta?.content || '';
              accumulatedResponse += content;
              updateNodeData(nodeId, 'answer', accumulatedResponse);
            } catch (e) {
              console.error('Error parsing JSON:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading stream:', error);
    }
  };

  const generateChildNodes = useCallback((
    parentId: string, 
    currentLayer: number = 1, 
    maxLayers: number,
    childrenCount: number,
    parentNode?: Node
  ) => {
    if (currentLayer > maxLayers) return;

    const parent = parentNode || nodes.find(node => node.id === parentId);
    if (!parent) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    const parentElement = document.querySelector(`[data-id="${parentId}"]`) as HTMLElement;
    
    for (let i = 0; i < childrenCount; i++) {
      const timestamp = Date.now() + i;
      const newNodeId = `node-${timestamp}-${currentLayer}`;
      
      const hasParent = edges.some(edge => edge.target === newNodeId);
      if (hasParent) continue;

      const position = generateNodePosition(
        i,
        childrenCount,
        parent.position.x,
        parent.position.y,
        currentLayer,
        maxLayers,
        parentElement
      );
      
      const newNode = createNode(newNodeId, position, {
        question: '',
        answer: '',
        updateNodeData,
        addChildNode,
        removeNode
      });

      const newEdge = createEdge(parentId, newNodeId, currentLayer);

      newNodes.push(newNode);
      newEdges.push(newEdge);
    }

    setNodes(nds => {
      const existingNodeIds = new Set(nds.map(n => n.id));
      const uniqueNewNodes = newNodes.filter(n => !existingNodeIds.has(n.id));
      return [...nds, ...uniqueNewNodes];
    });

    setEdges(eds => {
      const existingTargets = new Set(eds.map(e => e.target));
      const uniqueNewEdges = newEdges.filter(e => !existingTargets.has(e.target));
      return [...eds, ...uniqueNewEdges];
    });

    newNodes.forEach((node, index) => {
      generationQueue.current = generationQueue.current.then(() => 
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (currentLayer < maxLayers) {
              generateChildNodes(
                node.id,
                currentLayer + 1,
                maxLayers,
                childrenCount,
                node
              );
            }
            resolve();
          }, index * 300);
        })
      );
    });
  }, [nodes, edges, setNodes, setEdges, updateNodeData, addChildNode, removeNode]);

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

  useState(() => {
    if (nodes.length === 0) {
      const rootNode: Node = {
        id: 'node-1',
        type: 'qaNode',
        position: { x: 0, y: 0 },
        data: {
          question: 'Root Question',
          answer: 'Root Answer',
          updateNodeData,
          addChildNode,
          removeNode
        }
      };
      setNodes([rootNode]);

      // Start streaming for the root node
      const streamResponse = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const response = await supabase.functions.invoke('generate-qa-tree', {
            body: { marketId, userId: user.id }
          });

          if (response.error) throw response.error;

          // Handle the streaming response
          const reader = response.data.getReader();
          await handleStreamResponse(reader, 'node-1');
        } catch (error) {
          console.error('Error streaming response:', error);
        }
      };

      streamResponse();
    }
  });

  const nodeTypes = {
    qaNode: QANodeComponent
  };

  return (
    <>
      <Card className="p-4 mt-4 bg-card h-[600px]">
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