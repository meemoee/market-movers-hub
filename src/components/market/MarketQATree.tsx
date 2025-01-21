import { useState, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { 
  ReactFlow, 
  Background, 
  Controls,
  Node, 
  Edge,
} from '@xyflow/react';
import { generateCompleteTreeLayout } from './utils/nodeGenerator';
import { QANodeComponent } from './nodes/QANodeComponent';
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
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [layers, setLayers] = useState(2);
  const [childrenPerLayer, setChildrenPerLayer] = useState(2);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const streamIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});
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
            },
          };
        }
        return node;
      })
    );
  }, []);

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

  const streamNodesByLevel = useCallback(async (nodes: Node[]) => {
    // Group nodes by level
    const nodesByLevel = nodes.reduce((acc, node) => {
      const level = node.data.currentLayer;
      if (!acc[level]) acc[level] = [];
      acc[level].push(node);
      return acc;
    }, {} as { [key: number]: Node[] });

    // Stream text level by level
    for (const level of Object.keys(nodesByLevel).map(Number).sort()) {
      const levelNodes = nodesByLevel[level];
      
      // Stream all nodes in the current level
      await Promise.all(levelNodes.map(node => 
        new Promise<void>((resolve) => {
          streamText(node.id, true, level, resolve);
        })
      ));
    }

    isGenerating.current = false;
  }, [streamText]);

  const addChildNode = useCallback((parentId: string) => {
    setSelectedParentId(parentId);
    setIsDialogOpen(true);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setNodes(nodes => nodes.filter(n => n.id !== nodeId));
    setEdges(edges => edges.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (isGenerating.current) return;
    isGenerating.current = true;

    // Clear any existing streaming intervals
    Object.values(streamIntervals.current).forEach(clearInterval);
    streamIntervals.current = {};

    // Generate complete tree layout
    const { nodes: newNodes, edges: newEdges } = generateCompleteTreeLayout(
      layers,
      childrenPerLayer,
      updateNodeData,
      addChildNode,
      removeNode
    );

    // Set the complete structure
    setNodes(newNodes);
    setEdges(newEdges);
    setIsDialogOpen(false);

    // Start streaming text to nodes level by level
    await streamNodesByLevel(newNodes);
  }, [layers, childrenPerLayer, updateNodeData, addChildNode, removeNode, streamNodesByLevel]);

  // Initialize with root node if needed
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
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
          fitViewOptions={{ 
            padding: 0.2,
            minZoom:
