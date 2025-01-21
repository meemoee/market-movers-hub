import { useState, useCallback, useRef, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  useNodesState, 
  useEdgesState,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateNodes } from './utils/nodeGenerator';
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
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const nodeTypes = useMemo(() => ({
    qaNode: QANodeComponent
  }), []);

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

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

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

  const generateChildNodes = useCallback((
    parentId: string,
    currentLayer: number = 1,
    maxLayers: number,
    childrenCount: number
  ) => {
    if (currentLayer > maxLayers) return;

    try {
      // Generate new nodes and edges using the utility
      const { nodes: newNodes, edges: newEdges } = generateNodes(
        parentId,
        childrenCount,
        currentLayer,
        nodes,
        edges
      );

      // Add the new nodes and edges to the state
      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);

      // Start streaming text for each new node
      let completedStreams = 0;
      newNodes.forEach((node, index) => {
        setTimeout(() => {
          streamText(node.id, true, currentLayer, () => {
            completedStreams++;
            // When all nodes at this level are done, generate the next layer
            if (completedStreams === newNodes.length) {
              newNodes.forEach((node, index) => {
                setTimeout(() => {
                  generateChildNodes(
                    node.id,
                    currentLayer + 1,
                    maxLayers,
                    childrenCount
                  );
                }, index * 300);
              });
            }
          });
        }, index * 200);
      });
    } catch (error) {
      console.error("Error generating nodes:", error);
    }
  }, [nodes, edges, setNodes, setEdges, streamText]);

  // Initialize root node if needed
  useState(() => {
    if (nodes.length === 0) {
      const rootNode: Node = {
        id: 'node-root',
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

  return (
    <>
      <Card className="p-4 mt-4 bg-card h-[600px]">
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
