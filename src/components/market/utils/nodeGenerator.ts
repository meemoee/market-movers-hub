import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

const calculateSubtreeWidth = (childrenCount: number, currentLayer: number, maxLayers: number): number => {
  // Base width for a single node
  const baseNodeWidth = 800;
  
  if (currentLayer >= maxLayers) {
    return baseNodeWidth;
  }
  
  // Calculate how many potential nodes could be in the deepest layer of this subtree
  const layersBelow = maxLayers - currentLayer;
  const nodesInDeepestLayer = Math.pow(childrenCount, layersBelow);
  
  // Add extra padding for leaf nodes to prevent overlap
  const leafNodePadding = currentLayer === maxLayers - 1 ? 50 : 0;
  
  // The subtree width should be wide enough to accommodate the maximum possible nodes
  // in its deepest layer, plus padding
  return (nodesInDeepestLayer * baseNodeWidth) + (leafNodePadding * (nodesInDeepestLayer - 1));
};

const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  // Calculate subtree width for this layer
  const subtreeWidth = calculateSubtreeWidth(childrenCount, currentLayer, maxLayers);
  
  // Add padding between subtrees
  const paddingBetweenSubtrees = 150;
  
  // Calculate horizontal spacing based on subtree width
  const horizontalSpacing = (subtreeWidth + paddingBetweenSubtrees) / Math.max(1, childrenCount - 1);
  
  // Keep vertical spacing consistent but larger to account for expanded nodes
  const verticalSpacing = 300; // Increased from 200 to 300 for more vertical space
  
  return { horizontalSpacing, verticalSpacing };
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  maxLayers: number,
  parentNode?: HTMLElement
) => {
  const { horizontalSpacing, verticalSpacing } = calculateNodeSpacing(childrenCount, currentLayer, maxLayers);
  
  // Ensure valid starting coordinates
  const validParentX = isNaN(parentX) ? 0 : parentX;
  const validParentY = isNaN(parentY) ? 0 : parentY;
  
  // Calculate offset with validation
  const totalWidth = horizontalSpacing * (childrenCount - 1);
  const startX = validParentX - (totalWidth / 2);
  
  // Get parent height or use default
  const parentHeight = parentNode?.offsetHeight || 100;
  const verticalOffset = Math.max(verticalSpacing, parentHeight + 100);

  // Return validated coordinates
  const x = startX + (index * horizontalSpacing);
  const y = validParentY + verticalOffset;

  return {
    x: isNaN(x) ? index * 200 : x, // Fallback for x
    y: isNaN(y) ? currentLayer * 200 : y // Fallback for y
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
  style: { 
    stroke: '#666', 
    strokeWidth: 2,
    // Add path styling to make parent-child relationships more visible
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});
