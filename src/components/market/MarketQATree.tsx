import { useState, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { GitBranch, Plus } from "lucide-react";
import Tree from 'react-d3-tree';
import '@/styles/qa-tree.css';

interface QANode {
  question: string;
  answer: string;
  children?: QANode[];
}

const initialData: QANode[] = [
  {
    question: "What are the key factors influencing this market?",
    answer: "Several economic and market-specific factors could impact the outcome.",
    children: [
      {
        question: "How do economic indicators affect this market?",
        answer: "Economic indicators like GDP and inflation can significantly influence market sentiment.",
        children: [
          {
            question: "Which economic indicator has the strongest correlation?",
            answer: "Historical data suggests GDP growth has the strongest correlation with market movements."
          }
        ]
      }
    ]
  }
];

interface MarketQATreeProps {
  marketId: string;
}

export function MarketQATree({ marketId }: MarketQATreeProps) {
  const [selectedNode, setSelectedNode] = useState<QANode | null>(null);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Transform QA data to tree-compatible format
  const treeData = useMemo(() => {
    const transformNode = (node: QANode) => ({
      name: node.question,
      attributes: {
        answer: node.answer
      },
      children: node.children?.map(transformNode)
    });

    return transformNode(initialData[0]);
  }, []);

  return (
    <Card className="p-4 mt-4 bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Market Analysis Tree</h3>
        <div className="flex gap-2">
          <button
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            title="Generate New Branch"
          >
            <GitBranch className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            title="Add Node"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-[400px] border border-border rounded-lg">
        <svg style={{ width: 0, height: 0, position: 'absolute' }}>
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
            </marker>
          </defs>
        </svg>

        <Tree
          data={treeData}
          orientation="vertical"
          translate={{ x: 200, y: 50 }}
          nodeSize={{ x: 400, y: 100 }}
          separation={{ siblings: 2, nonSiblings: 2.5 }}
          renderCustomNodeElement={({ nodeDatum }) => (
            <g>
              <foreignObject width={300} height={100} x={-150} y={-50}>
                <div className="qa-tree-node-content">
                  <p className="text-sm font-medium mb-2">{nodeDatum.name}</p>
                  <p className="text-xs text-muted-foreground">{nodeDatum.attributes?.answer}</p>
                </div>
              </foreignObject>
            </g>
          )}
          pathClassFunc={() => 'node__link'}
        />
      </div>

      {selectedNode && (
        <div className="mt-4 p-4 rounded-lg bg-accent/50">
          <h4 className="font-medium mb-2">{selectedNode.question}</h4>
          <p className="text-sm text-muted-foreground">{selectedNode.answer}</p>
        </div>
      )}
    </Card>
  );
}