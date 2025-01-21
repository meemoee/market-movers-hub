import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { GitBranch, Plus } from "lucide-react";
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

      <div className="relative min-h-[300px] border border-border rounded-lg p-4">
        <div className="flex items-start space-x-4">
          {initialData.map((node, index) => (
            <div key={index} className="flex-1">
              <div 
                className="qa-tree-node-content"
                onClick={() => setSelectedNode(node)}
              >
                <p className="text-sm font-medium mb-2">{node.question}</p>
                <p className="text-xs text-muted-foreground">{node.answer}</p>
              </div>
              {node.children && (
                <div className="mt-4 pl-8 border-l border-border">
                  {node.children.map((child, childIndex) => (
                    <div 
                      key={childIndex}
                      className="mb-4 last:mb-0"
                    >
                      <div 
                        className="qa-tree-node-content"
                        onClick={() => setSelectedNode(child)}
                      >
                        <p className="text-sm font-medium mb-2">{child.question}</p>
                        <p className="text-xs text-muted-foreground">{child.answer}</p>
                      </div>
                      {child.children && (
                        <div className="mt-4 pl-8 border-l border-border">
                          {child.children.map((grandChild, grandChildIndex) => (
                            <div 
                              key={grandChildIndex}
                              className="mb-4 last:mb-0"
                            >
                              <div 
                                className="qa-tree-node-content"
                                onClick={() => setSelectedNode(grandChild)}
                              >
                                <p className="text-sm font-medium mb-2">{grandChild.question}</p>
                                <p className="text-xs text-muted-foreground">{grandChild.answer}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
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