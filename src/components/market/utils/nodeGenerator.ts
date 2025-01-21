import { Node, Edge } from '@xyflow/react';

interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Calculate the total width needed for a subtree
const calculateSubtreeWidth = (
  nodeId: string,
  nodes: Node[],
  depth: number,
  cache: Map<string, number> = new Map()
): number => {
  // Check cache first
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  const children = nodes.filter(
    node => nodes.some(
      n => n.id === nodeId && 
      (n as any).data?.edges?.some((e: Edge) => e.source === nodeId && e.target === node.id)
    )
  );

  if (children.length === 0) {
    const width = 400; // Base node width
    cache.set(nodeId, width);
    return width;
  }

  // Calculate total width needed for children
  const childrenWidth = children.reduce((total, child) => {
    return total + calculateSubtreeWidth(child.id, nodes, depth + 1, cache);
  }, 0);

  // Add spacing between children
  const spacing = depth === 0 ? 200 : 100;
  const totalWidth = Math.max(
    400, // Minimum width for a single node
    childrenWidth + (spacing * (children.length - 1))
  );

  cache.set(nodeId, totalWidth);
  return totalWidth;
}

// Calculate vertical spacing based on tree depth
const calculateVerticalSpacing = (currentLayer: number): number => {
  const baseSpacing = 250;
  const spacingMultiplier = 1.1;
  return baseSpacing * Math.pow(spacingMultiplier, currentLayer - 1);
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  nodeId: string,
  nodes: Node[]
) => {
  // Calculate width needed for this node's subtree
  const subtreeWidth = calculateSubtreeWidth(nodeId, nodes, currentLayer);
  
  // Calculate total width needed for all siblings
  const totalWidth = childrenCount * subtreeWidth;
  
  // Calculate x position based on subtree width
  const startX = parentX - (totalWidth / 2) + (subtreeWidth / 2);
  const xPos = startX + (index * subtreeWidth);
  
  // Calculate y position with increasing vertical gaps
  const yPos = parentY + calculateVerticalSpacing(currentLayer);

  return {
    x: xPos,
    y: yPos
  };
};

export const createNode = (
  id: string,
  position: { x: number; y: number },
  data: any
): Node => ({
  id,
  type: 'qaNode',
  position,
  data
});

export const createEdge = (
  sourceId: string, 
  targetId: string,
  currentLayer: number
): Edge => ({
  id: `edge-${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
  sourceHandle: 'source',
  targetHandle: 'target',
  type: 'smoothstep',
  style: { stroke: '#666', strokeWidth: 2 },
  animated: currentLayer === 1
});
