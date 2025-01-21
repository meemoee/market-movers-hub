import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

const calculateVerticalSpace = (
  childrenCount: number,
  currentLayer: number
): number => {
  const baseNodeHeight = 100;
  const minSpacing = 20;
  const depthFactor = Math.max(0.5, 1 - (currentLayer * 0.1));
  return (baseNodeHeight + minSpacing) * depthFactor;
};

const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  const horizontalSpacing = 350;
  const verticalSpacing = calculateVerticalSpace(childrenCount, currentLayer);
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
  
  const totalHeight = verticalSpacing * (childrenCount - 1);
  const startY = parentY - (totalHeight / 2);
  const y = startY + (index * verticalSpacing);
  const x = parentX + horizontalSpacing;
  
  return { x, y };
};

export const createNode = (
  id: string,
  position: { x: number; y: number },
  data: any
): Node => ({
  id,
  type: 'qaNode',
  position,
  data: {
    ...data,
    style: {
      width: Math.max(300 - data.currentLayer * 20, 200),
    }
  }
});

export const createEdge = (
  sourceId: string,
  targetId: string,
  currentLayer: number
): Edge => ({
  id: `edge-${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'smoothstep',
  style: { 
    stroke: '#666', 
    strokeWidth: 2,
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});
