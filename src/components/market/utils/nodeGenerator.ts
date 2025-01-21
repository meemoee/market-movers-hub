import { Node, Edge } from '@xyflow/react';

interface NodeGeneratorOptions {
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
  // Increase spacing exponentially with layer depth to prevent overlapping
  const baseHorizontalSpacing = 400;
  const horizontalSpacing = baseHorizontalSpacing * Math.pow(1.2, currentLayer - 1);
  const verticalSpacing = 250; // Consistent vertical spacing
  
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
  const totalWidth = (childrenCount - 1) * horizontalSpacing;
  const xOffset = (index - (childrenCount - 1) / 2) * horizontalSpacing;
  
  return {
    x: parentX + xOffset,
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