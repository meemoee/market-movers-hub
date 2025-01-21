import { Card } from "@/components/ui/card";
import { GitBranch, Plus } from "lucide-react";
import { ReactFlow, Background, Controls, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState } from 'react';

interface QANode {
  id: string;
  question: string;
  answer: string;
  children?: QANode[];
}

interface MarketQATreeProps {
  marketId: string;
}

const initialData: QANode[] = [
  {
    id: '1',
    question: 'Will AI replace human jobs?',
    answer: 'The impact of AI on employment is complex and varies by industry.',
    children: [
      {
        id: '2',
        question: 'Which jobs are most at risk?',
        answer: 'Repetitive and routine tasks are most likely to be automated.',
        children: [
          {
            id: '3',
            question: 'What about creative jobs?',
            answer: 'Creative and emotional intelligence-based roles are less likely to be fully automated.'
          }
        ]
      },
      {
        id: '4',
        question: 'How can workers adapt?',
        answer: 'Focus on developing skills that complement AI capabilities.',
        children: [
          {
            id: '5',
            question: 'What skills are important?',
            answer: 'Critical thinking, creativity, and emotional intelligence are key skills for the future.'
          }
        ]
      }
    ]
  }
];

const transformToNodesAndEdges = (qaNodes: QANode[]) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let yOffset = 0;

  const processNode = (node: QANode, xOffset: number) => {
    nodes.push({
      id: node.id,
      position: { x: xOffset, y: yOffset },
      data: { question: node.question, answer: node.answer },
      type: 'qaNode',
      style: { width: 300 }
    });

    if (node.children) {
      yOffset += 200;
      node.children.forEach((child, index) => {
        const childXOffset = xOffset + (index * 400) - ((node.children?.length || 1) - 1) * 200;
        edges.push({
          id: `${node.id}-${child.id}`,
          source: node.id,
          target: child.id,
          type: 'smoothstep'
        });
        processNode(child, childXOffset);
      });
    }
  };

  qaNodes.forEach(node => processNode(node, 0));
  return { nodes, edges };
};

const QANodeComponent = ({ data }: { data: { question: string; answer: string } }) => (
  <div className="bg-[#1a1b1e] border border-white/10 rounded-lg p-4 w-full">
    <div className="flex justify-between items-start gap-2 mb-2">
      <div className="font-medium text-sm text-white break-words">
        {data.question}
      </div>
      <div className="flex space-x-1 shrink-0">
        <button className="p-1 hover:bg-white/10 rounded">
          <Plus size={16} className="text-blue-500" />
        </button>
        <button className="p-1 hover:bg-white/10 rounded">
          <GitBranch size={16} className="text-blue-500" />
        </button>
      </div>
    </div>
    <div className="border-t border-white/10 my-2" />
    <div className="text-xs text-gray-300 break-words">
      {data.answer}
    </div>
  </div>
);

export function MarketQATree({ marketId }: MarketQATreeProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const { nodes, edges } = transformToNodesAndEdges(initialData);
  const nodeTypes = { qaNode: QANodeComponent };

  return (
    <Card className="p-4 mt-4 bg-card">
      <div className="h-[600px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
}