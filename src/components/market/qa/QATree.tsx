import { QANode } from './QANode';

interface QATreeNode {
  id: string;
  question: string;
  analysis: string;
  children: QATreeNode[];
}

interface QATreeProps {
  data: QATreeNode[];
  expandedNodes: Set<string>;
  onToggleNode: (nodeId: string) => void;
  depth?: number;
}

export function QATree({ 
  data, 
  expandedNodes, 
  onToggleNode, 
  depth = 0 
}: QATreeProps) {
  return (
    <div className="space-y-1">
      {data.map((node, index) => (
        <div key={node.id}>
          <QANode
            question={node.question}
            analysis={node.analysis}
            isExpanded={expandedNodes.has(node.id)}
            onToggle={() => onToggleNode(node.id)}
            depth={depth}
            hasChildren={node.children.length > 0}
            isLast={index === data.length - 1}
          />
          {node.children.length > 0 && expandedNodes.has(node.id) && (
            <QATree
              data={node.children}
              expandedNodes={expandedNodes}
              onToggleNode={onToggleNode}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}