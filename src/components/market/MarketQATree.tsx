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

      <div className="relative h-[600px] border border-border rounded-lg overflow-hidden">
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
          translate={{ x: 200, y: 100 }}
          nodeSize={{ x: 400, y: 200 }}
          separation={{ siblings: 2.5, nonSiblings: 3 }}
          zoomable={true}
          scaleExtent={{ min: 0.1, max: 2 }}
          renderCustomNodeElement={({ nodeDatum }) => (
            <g>
              <foreignObject width={300} height={150} x={-150} y={-75}>
                <div className="qa-tree-node-content">
                  <div className="px-6 py-4">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div 
                        className="font-medium text-sm"
                      >
                        {nodeDatum.name}
                      </div>
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          className="p-1 hover:bg-white/10 rounded"
                        >
                          <GitBranch className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-white/10 my-2" />
                    <div 
                      className="text-xs text-gray-400 whitespace-pre-wrap"
                    >
                      {nodeDatum.attributes?.answer}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="absolute bottom-2 right-2 w-6 h-6 hover:bg-white/10 rounded-full flex items-center justify-center bg-gray-800/90"
                  >
                    <span className="text-white text-lg leading-none">+</span>
                  </button>
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
