import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Connection, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QANodeComponent } from './nodes/QANodeComponent';
import { generateNodePosition, createNode, createEdge, NodeData } from './utils/nodeGenerator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NodeGenerationQueue {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
}

export function MarketQATree({ marketId }: { marketId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const generationQueue = useRef<NodeGenerationQueue[]>([]);
  const isGenerating = useRef(false);

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

  const processNextInQueue = useCallback(() => {
    if (isGenerating.current || generationQueue.current.length === 0) return;
    
    isGenerating.current = true;
    const { parentId, currentLayer, maxLayers, childrenCount } = generationQueue.current[0];
    
    if (currentLayer > maxLayers) {
      generationQueue.current.shift();
      isGenerating.current = false;
      processNextInQueue();
      return;
    }

    const parent = nodes.find(node => node.id === parentId);
    if (!parent) {
      generationQueue.current.shift();
      isGenerating.current = false;
      processNextInQueue();
      return;
    }

    const newNodes: Node<NodeData>[] = [];
    const newEdges: Edge[] = [];
    let completedStreams = 0;

    for (let i = 0; i < childrenCount; i++) {
      const nodeId = `node-${Date.now()}-${i}-${currentLayer}`;
      const position = generateNodePosition(
        i,
        childrenCount,
        parent.position.x,
        parent.position.y,
        currentLayer
      );

      const newNode = createNode(nodeId, position, {
        question: '',
        answer: '',
        updateNodeData,
        addChildNode,
        removeNode
      });

      const newEdge = createEdge(parentId, nodeId, currentLayer);
      newNodes.push(newNode);
      newEdges.push(newEdge);
    }

    setNodes(nds => [...nds, ...newNodes]);
    setEdges(eds => [...eds, ...newEdges]);

    // Queue up the next layer for each new node
    newNodes.forEach(node => {
      generationQueue.current.push({
        parentId: node.id,
        currentLayer: currentLayer + 1,
        maxLayers,
        childrenCount
      });
    });

    // Start streaming text for each node
    newNodes.forEach((node, index) => {
      setTimeout(() => {
        const text = `Question for Layer ${currentLayer}, Node ${node.id}`;
        let streamIndex = 0;

        if (streamIntervals.current[node.id]) {
          clearInterval(streamIntervals.current[node.id]);
        }

        streamIntervals.current[node.id] = setInterval(() => {
          if (streamIndex <= text.length) {
            updateNodeData(node.id, 'question', text.slice(0, streamIndex));
            streamIndex++;
          } else {
            clearInterval(streamIntervals.current[node.id]);
            delete streamIntervals.current[node.id];
            
            // Stream answer after question
            setTimeout(() => {
              const answerText = `This is a detailed answer for Layer ${currentLayer}, Node ${node.id}`;
              let answerIndex = 0;

              streamIntervals.current[node.id] = setInterval(() => {
                if (answerIndex <= answerText.length) {
                  updateNodeData(node.id, 'answer', answerText.slice(0, answerIndex));
                  answerIndex++;
                } else {
                  clearInterval(streamIntervals.current[node.id]);
                  delete streamIntervals.current[node.id];
                  completedStreams++;

                  if (completedStreams === childrenCount) {
                    generationQueue.current.shift();
                    isGenerating.current = false;
                    setTimeout(processNextInQueue, 500);
                  }
                }
              }, 50);
            }, 500);
          }
        }, 50);
      }, index * 200);
    });
  }, [nodes, setNodes, setEdges, updateNodeData]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

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
      const rootNode = createNode('node-1', { x: 0, y: 0 }, {
        question: 'Root Question',
        answer: 'Root Answer',
        updateNodeData,
        addChildNode,
        removeNode
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
                generationQueue.current = [{
                  parentId: selectedParentId,
                  currentLayer: 1,
                  maxLayers: layers,
                  childrenCount: childrenPerLayer
                }];
                processNextInQueue();
                setIsDialogOpen(false);
              }
            }}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}