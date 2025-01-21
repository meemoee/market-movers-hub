import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { GitBranch, Plus, X } from "lucide-react";
import { ReactFlow, Background, Controls, Node, Edge, Connection, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface QANode {
  id: string;
  question: string;
  answer: string;
  children?: QANode[];
}

const QANodeComponent = ({ data, id }: { data: any; id: string }) => {
  const { updateNodeData, addChildNode, removeNode } = data;

  return (
    <div className="bg-[#1a1b1e] border border-white/10 rounded-lg p-4 w-[300px]">
      <div className="flex justify-between items-start gap-2 mb-2">
        <Input
          className="font-medium text-sm text-white bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
          value={data.question}
          onChange={(e) => updateNodeData(id, 'question', e.target.value)}
          placeholder="Enter question..."
        />
        <div className="flex space-x-1 shrink-0">
          <button 
            className="p-1 hover:bg-white/10 rounded"
            onClick={() => addChildNode(id)}
          >
            <Plus size={16} className="text-blue-500" />
          </button>
          <button 
            className="p-1 hover:bg-white/10 rounded"
            onClick={() => removeNode(id)}
          >
            <X size={16} className="text-red-500" />
          </button>
        </div>
      </div>
      <div className="border-t border-white/10 my-2" />
      <Input
        className="text-xs text-gray-300 bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
        value={data.answer}
        onChange={(e) => updateNodeData(id, 'answer', e.target.value)}
        placeholder="Enter answer..."
      />
    </div>
  );
};

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamInterval = useRef<NodeJS.Timeout | null>(null);

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
  }, [setNodes]);

  const streamText = useCallback((nodeId: string, text: string) => {
    let index = 0;
    streamInterval.current = setInterval(() => {
      if (index <= text.length) {
        updateNodeData(nodeId, 'question', text.slice(0, index));
        index++;
      } else {
        if (streamInterval.current) {
          clearInterval(streamInterval.current);
        }
      }
    }, 50);
  }, [updateNodeData]);

  const generateChildNodes = useCallback((parentId: string, currentLayer: number = 1) => {
    if (currentLayer > layers) return;

    const parentNode = nodes.find(node => node.id === parentId);
    if (!parentNode) return;

    const baseY = parentNode.position.y + 150;
    const parentX = parentNode.position.x;
    const width = 300 * (childrenPerLayer - 1);
    
    for (let i = 0; i < childrenPerLayer; i++) {
      const newNodeId = `node-${nodes.length + i + 1}-${currentLayer}`;
      const xOffset = (i - (childrenPerLayer - 1) / 2) * 350;
      
      const newNode: Node = {
        id: newNodeId,
        type: 'qaNode',
        position: {
          x: parentX + xOffset,
          y: baseY
        },
        data: {
          question: '',
          answer: '',
          updateNodeData,
          addChildNode,
          removeNode
        }
      };

      const newEdge: Edge = {
        id: `edge-${parentId}-${newNodeId}`,
        source: parentId,
        target: newNodeId,
        type: 'smoothstep'
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);

      // Start streaming text after a delay
      setTimeout(() => {
        streamText(newNodeId, `Question for Layer ${currentLayer} Node ${i + 1}`);
      }, i * 500);

      // Recursively generate next layer
      setTimeout(() => {
        generateChildNodes(newNodeId, currentLayer + 1);
      }, (i + 1) * 200);
    }
  }, [nodes, setNodes, setEdges, layers, childrenPerLayer, streamText]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

  const handleGenerateNodes = useCallback(() => {
    if (selectedParentId) {
      generateChildNodes(selectedParentId);
      setIsDialogOpen(false);
    }
  }, [selectedParentId, generateChildNodes]);

  const removeNode = useCallback((nodeId: string) => {
    // Remove the node and all its descendants
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

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Initialize with root node if no nodes exist
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
            <Button onClick={handleGenerateNodes}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}