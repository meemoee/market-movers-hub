import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

export const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  // Calculate total possible nodes at current layer
  const maxNodesAtLayer = Math.pow(childrenCount, currentLayer);
  
  // Base spacing per node that ensures no overlap
  const baseNodeSpacing = 350;
  
  // Calculate total width needed for this layer
  const totalWidthNeeded = maxNodesAtLayer * baseNodeSpacing;
  
  // Scale horizontal spacing based on total width needed
  const horizontalSpacing = totalWidthNeeded / childrenCount;
  
  // Keep vertical spacing consistent
  const verticalSpacing = 250;
  
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
  
  // Calculate parent's section width
  const parentSectionWidth = horizontalSpacing * childrenCount;
  
  // Calculate starting X position for this parent's children
  const startX = parentX - (parentSectionWidth / 2) + (horizontalSpacing / 2);
  
  // Position node within parent's section
  const x = startX + (index * horizontalSpacing);
  
  return {
    x: x,
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
  style: { stroke: '#666', strokeWidth: 2 },
  animated: currentLayer === 1
});
