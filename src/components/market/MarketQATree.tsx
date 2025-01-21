import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Connection, 
  useNodesState, 
  useEdgesState, 
  addEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateTreeStructure, createNode } from './utils/nodeGenerator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              [field]: value
            },
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  const addChildNode = useCallback((parentId: string) => {
    const parentNode = nodes.find(node => node.id === parentId);
    if (!parentNode) return;

    const newNodeId = `node-${Date.now()}`;
    const currentLayer = (parentNode.data.currentLayer as number) + 1;
    
    const newNode = createNode(
      newNodeId,
      {
        x: parentNode.position.x + 300,
        y: parentNode.position.y + 100
      },
      { 
        currentLayer,
        updateNodeData,
        addChildNode,
        removeNode: () => removeNode(newNodeId)
      }
    );

    setNodes(nds => [...nds, newNode]);
    setEdges(eds => [...eds, {
      id: `edge-${parentId}-${newNodeId}`,
      source: parentId,
      target: newNodeId,
      type: 'smoothstep'
    }]);
  }, [nodes, setNodes, setEdges, updateNodeData]);

  const removeNode = useCallback((nodeId: string) => {
    setNodes(nodes => nodes.filter(node => node.id !== nodeId));
    setEdges(edges => edges.filter(edge => 
      edge.source !== nodeId && edge.target !== nodeId
    ));
  }, [setNodes, setEdges]);

  const streamText = useCallback((
    nodeId: string, 
    isQuestion: boolean = true,
    currentLayer: number,
    onComplete?: () => void
  ) => {
    const text = isQuestion 
      ? `Question for Layer ${currentLayer}, Node ${nodeId}`
      : `This is a detailed answer for Layer ${currentLayer}, Node ${nodeId}`;
    
    let index = 0;
    if (streamIntervals.current[nodeId]) {
      clearInterval(streamIntervals.current[nodeId]);
    }
    
    streamIntervals.current[nodeId] = setInterval(() => {
      if (index <= text.length) {
        updateNodeData(nodeId, isQuestion ? 'question' : 'answer', text.slice(0, index));
        index++;
      } else {
        clearInterval(streamIntervals.current[nodeId]);
        delete streamIntervals.current[nodeId];
        
        if (isQuestion) {
          setTimeout(() => {
            streamText(nodeId, false, currentLayer, onComplete);
          }, 500);
        } else if (onComplete) {
          onComplete();
        }
      }
    }, 50);
  }, [updateNodeData]);

  const generateTree = useCallback(() => {
    const rootId = 'node-1';
    const { nodes: newNodes, edges: newEdges } = generateTreeStructure(
      rootId,
      layers,
      childrenPerLayer
    );
    
    // Add the necessary functions to each node's data
    const nodesWithFunctions = newNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        updateNodeData,
        addChildNode,
        removeNode: () => removeNode(node.id)
      }
    }));
    
    setNodes(nodesWithFunctions);
    setEdges(newEdges);

    const streamToNodesInOrder = (nodeIndex: number = 0) => {
      if (nodeIndex >= nodesWithFunctions.length) return;
      
      const node = nodesWithFunctions[nodeIndex];
      const currentLayer = node.data.currentLayer as number;
      
      streamText(node.id, true, currentLayer, () => {
        setTimeout(() => {
          streamToNodesInOrder(nodeIndex + 1);
        }, 300);
      });
    };

    streamToNodesInOrder();
  }, [layers, childrenPerLayer, setNodes, setEdges, streamText, updateNodeData, addChildNode, removeNode]);

  const onConnect = useCallback(
    (params: Connection) => {
      const targetHasParent = edges.some(edge => edge.target === params.target);
      if (!targetHasParent) {
        setEdges((eds) => addEdge(params, eds));
      }
    },
    [edges, setEdges]
  );

  useState(() => {
    if (nodes.length === 0) {
      const rootNode = createNode('node-1', { x: 0, y: 0 }, { 
        currentLayer: 1,
        updateNodeData,
        addChildNode,
        removeNode: () => removeNode('node-1')
      });
      setNodes([rootNode]);
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
          fitViewOptions={{ 
            padding: 0.2,
            minZoom: 0.1,
            maxZoom: 1.5,
            duration: 200
          }}
        >
          <Background />
          <Controls className="!bg-transparent [&>button]:!bg-transparent" />
        </ReactFlow>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate Tree</DialogTitle>
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
              generateTree();
              setIsDialogOpen(false);
            }}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}