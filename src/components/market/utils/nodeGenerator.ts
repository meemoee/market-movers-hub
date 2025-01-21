import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Calculate total width needed for a complete subtree at a given depth
const calculateSubtreeWidth = (
  childrenCount: number, 
  layersBelow: number
): number => {
  // Base width for a leaf node
  const baseNodeWidth = 300;

  if (layersBelow === 0) {
    return baseNodeWidth;
  }

  // Calculate width needed for bottom layer of this subtree
  const childrenAtBottom = Math.pow(childrenCount, layersBelow);
  const bottomLayerWidth = childrenAtBottom * baseNodeWidth;

  // Add padding proportional to the number of layers below
  const padding = layersBelow * 100;

  return bottomLayerWidth + padding;
};

// Calculate appropriate spacing for nodes at the current layer
const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  // Calculate how many layers are below this one
  const layersBelow = maxLayers - currentLayer;
  
  // Calculate width needed for a complete subtree at this level
  const subtreeWidth = calculateSubtreeWidth(childrenCount, layersBelow);
  
  // For first layer, space nodes far apart to accommodate all descendants
  // For deeper layers, bring nodes closer together
  const horizontalSpacing = subtreeWidth / childrenCount;
  
  // Consistent vertical spacing
  const verticalSpacing = 200;
  
  return { horizontalSpacing, verticalSpacing };
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  maxLayers: number = 3  // Default to 3 if not specified
) => {
  const { horizontalSpacing, verticalSpacing } = calculateNodeSpacing(childrenCount, currentLayer, maxLayers);
  
  // Center the nodes around the parent
  const totalWidth = (childrenCount - 1) * horizontalSpacing;
  const startX = parentX - totalWidth / 2;
  
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
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});
