import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

const calculateSubtreeWidth = (childrenCount: number, currentLayer: number): number => {
  // Base node spacing that accounts for node width and minimum separation
  const baseNodeWidth = 400;
  // Calculate how many potential nodes could be at this layer
  const potentialNodes = Math.pow(childrenCount, currentLayer);
  return potentialNodes * baseNodeWidth;
};

const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  // Calculate subtree width for this layer
  const subtreeWidth = calculateSubtreeWidth(childrenCount, currentLayer);
  
  // Add padding between subtrees
  const paddingBetweenSubtrees = 200;
  
  // Calculate horizontal spacing based on subtree width
  const horizontalSpacing = (subtreeWidth + paddingBetweenSubtrees) / childrenCount;
  
  // Keep vertical spacing consistent
  const verticalSpacing = 200;
  
  return { horizontalSpacing, verticalSpacing };
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number
) => {
  const { horizontalSpacing, verticalSpacing } = calculateNodeSpacing(childrenCount, currentLayer);
  
  // Calculate offset from parent's center
  const totalWidth = horizontalSpacing * (childrenCount - 1);
  const startX = parentX - (totalWidth / 2);
  
  return {
    x: startX + (index * horizontalSpacing),
    y: parentY + verticalSpacing
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
