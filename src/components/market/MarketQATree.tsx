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
  const [streamingContent, setStreamingContent] = useState('');
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

  const handleStreamResponse = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    
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
              accumulatedContent += content;
              setStreamingContent(accumulatedContent);
              
              // Update the root node with the streaming content
              updateNodeData('node-1', 'answer', accumulatedContent);
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

  useEffect(() => {
    if (nodes.length === 0) {
      const rootNode: Node = {
        id: 'node-1',
        type: 'qaNode',
        position: { x: 0, y: 0 },
        data: {
          question: 'Root Question',
          answer: 'Analyzing market data...',
          updateNodeData,
          addChildNode,
          removeNode
        }
      };
      setNodes([rootNode]);

      const streamResponse = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          abortControllerRef.current = new AbortController();

          console.log('Generating analysis for market:', marketId, 'user:', user.id);
          const response = await supabase.functions.invoke('generate-qa-tree', {
            body: { marketId, userId: user.id }
          });

          if (response.error) throw response.error;

          const stream = new ReadableStream({
            start(controller) {
              const reader = new Response(response.data).body?.getReader();
              if (!reader) throw new Error('No reader available');
              
              handleStreamResponse(reader);
            }
          });

          const reader = stream.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }

        } catch (error) {
          console.error('Error streaming response:', error);
          updateNodeData('node-1', 'answer', 'Error generating analysis');
        } finally {
          abortControllerRef.current = null;
        }
      };

      streamResponse();
    }
  }, [marketId, setNodes, updateNodeData, addChildNode, removeNode]);

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
