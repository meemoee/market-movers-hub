import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { GitBranch, Plus, X } from "lucide-react";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Handle,
  Node, 
  Edge, 
  Connection, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Position 
} from '@xyflow/react';
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
      <Handle type="target" position={Position.Top} id="target" />
      <Handle type="source" position={Position.Bottom} id="source" />
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
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

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

  const streamText = useCallback((
    nodeId: string, 
    isQuestion: boolean = true, 
    currentLayer: number,
    onComplete?: () => void
  ) => {
    const text = isQuestion 
      ? `Question for Layer ${currentLayer}, Node ${nodeId}`
      : `This is a detailed answer for Layer ${currentLayer}, Node ${nodeId}. It contains multiple lines of text to demonstrate dynamic height adjustment.`;
    
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

    const baseY = parent.position.y + 200; // Increased vertical spacing
    const parentX = parent.position.x;
    const totalWidth = (childrenCount - 1) * 400; // Increased horizontal spacing
    
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let completedStreams = 0;
    
    for (let i = 0; i < childrenCount; i++) {
      const timestamp = Date.now() + i; // Added i to ensure unique timestamps
      const newNodeId = `node-${timestamp}-${currentLayer}`;
      const xOffset = (i - (childrenCount - 1) / 2) * 400; // Increased spacing
      
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
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'smoothstep',
        style: { stroke: '#666', strokeWidth: 2 }, // Improved edge styling
        animated: currentLayer === 1 // Animate only first layer edges
      };

      newNodes.push(newNode);
      newEdges.push(newEdge);

      setTimeout(() => {
        streamText(newNodeId, true, currentLayer, () => {
          completedStreams++;
          if (completedStreams === childrenCount) {
            // Generate next layer for each node with delay
            newNodes.forEach((node, index) => {
              setTimeout(() => {
                generateChildNodes(
                  node.id,
                  currentLayer + 1,
                  maxLayers,
                  childrenCount,
                  node
                );
              }, index * 300); // Stagger child generation
            });
          }
        });
      }, i * 200);
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
    
  }, [nodes, setNodes, setEdges, streamText]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

  const handleGenerateNodes = useCallback(() => {
    if (selectedParentId) {
      generateChildNodes(selectedParentId, 1, layers, childrenPerLayer);
      setIsDialogOpen(false);
    }
  }, [selectedParentId, generateChildNodes, layers, childrenPerLayer]);

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

  const onConnect = useCallback(
    (params: Connection) => {
      // Prevent multiple parents by checking if target already has an incoming edge
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