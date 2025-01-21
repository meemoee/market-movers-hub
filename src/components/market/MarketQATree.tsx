import { useState, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { GitBranch, Plus, X } from "lucide-react";
import { ReactFlow, Background, Controls, Node, Edge, Connection, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Input } from "@/components/ui/input";

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

  const addChildNode = useCallback((parentId: string) => {
    const parentNode = nodes.find(node => node.id === parentId);
    if (!parentNode) return;

    const newNodeId = `node-${nodes.length + 1}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'qaNode',
      position: {
        x: parentNode.position.x,
        y: parentNode.position.y + 150
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
  }, [nodes, setNodes, setEdges]);

  const removeNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, [setNodes, setEdges]);

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
  );
}