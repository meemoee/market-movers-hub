import { useState, useCallback, useRef, useEffect } from 'react';
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
import { 
  generateNodePosition, 
  createNode, 
  createEdge,
  updateDescendantCounts,
  type NodeData 
} from './utils/nodeGenerator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const nodeTypes = {
  qaNode: QANodeComponent
};

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const updateNodeData = useCallback((nodeId: string, field: string, value: string) => {
    setNodes(nds => 
      nds.map(node => 
        node.id === nodeId
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    );
  }, [setNodes]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    const getDescendants = (id: string): string[] => {
      const childEdges = edges.filter(e => e.source === id);
      return childEdges.reduce(
        (acc, edge) => [...acc, edge.target, ...getDescendants(edge.target)],
        [] as string[]
      );
    };

    const descendantIds = getDescendants(nodeId);
    const idsToRemove = [nodeId, ...descendantIds];

    setNodes(nds => nds.filter(node => !idsToRemove.includes(node.id)));
    setEdges(eds => eds.filter(edge => 
      !idsToRemove.includes(edge.source) && !idsToRemove.includes(edge.target)
    ));
  }, [edges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  const streamText = useCallback((
    nodeId: string,
    isQuestion: boolean = true,
    currentLayer: number,
    onComplete?: () => void
  ) => {
    const text = isQuestion
      ? `Question for Layer ${currentLayer}`
      : `This is a detailed answer for Layer ${currentLayer}`;

    let index = 0;
    if (streamIntervals.current[nodeId]) {
      clearInterval(streamIntervals.current[nodeId]);
    }

    streamIntervals.current[nodeId] = setInterval(() => {
      if (index <= text.length) {
        updateNodeData(
          nodeId,
          isQuestion ? 'question' : 'answer',
          text.slice(0, index)
        );
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
    childrenCount: number
  ) => {
    if (currentLayer > maxLayers) return;

    const parent = nodes.find(node => node.id === parentId);
    if (!parent) return;

    const newNodes = [];
    const newEdges = [];
    let completedStreams = 0;

    for (let i = 0; i < childrenCount; i++) {
      const timestamp = Date.now() + i;
      const newNodeId = `node-${timestamp}`;
      
      const position = generateNodePosition(
        i,
        childrenCount,
        nodes,
        edges,
        parentId,
        parent.position,
        currentLayer
      );

      const nodeCallbacks = {
        updateNodeData,
        addChildNode,
        removeNode: () => removeNode(newNodeId)
      };

      const newNode = createNode(
        newNodeId,
        position,
        {
          question: '',
          answer: '',
          currentLayer,
          ...nodeCallbacks
        }
      );

      const newEdge = createEdge(parentId, newNodeId);

      newNodes.push(newNode);
      newEdges.push(newEdge);

      setTimeout(() => {
        streamText(newNodeId, true, currentLayer, () => {
          completedStreams++;
          if (completedStreams === childrenCount) {
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
      }, i * 200);
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);
  }, [nodes, edges, setNodes, setEdges, updateNodeData, addChildNode, removeNode, streamText]);

  // Initialize root node
  useEffect(() => {
    if (nodes.length === 0) {
      const rootNodeId = 'root';
      const rootNode = createNode(
        rootNodeId,
        { x: 0, y: 0 },
        {
          question: 'Root Question',
          answer: 'Root Answer',
          currentLayer: 1,
          updateNodeData,
          addChildNode,
          removeNode: () => removeNode(rootNodeId)
        }
      );
      setNodes([rootNode]);
    }
  }, [nodes.length, setNodes, updateNodeData, addChildNode, removeNode]);

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