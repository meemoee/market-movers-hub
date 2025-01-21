import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Calculate total nodes at a given layer
const calculateNodesAtLayer = (
  childrenCount: number,
  layer: number
): number => {
  return Math.pow(childrenCount, layer);
};

// Calculate the total width needed for all nodes at a specific layer
const calculateLayerWidth = (
  childrenCount: number,
  layer: number,
  baseNodeWidth: number = 300
): number => {
  const nodesInLayer = calculateNodesAtLayer(childrenCount, layer);
  const minSpacingBetweenNodes = baseNodeWidth * 1.5; // Ensure minimum spacing between nodes
  return nodesInLayer * minSpacingBetweenNodes;
};

// Find the widest layer in the entire tree
const findWidestLayerWidth = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): number => {
  let maxWidth = 0;
  // Check width of current layer and all layers below it
  for (let layer = currentLayer; layer <= maxLayers; layer++) {
    const layerWidth = calculateLayerWidth(childrenCount, layer);
    maxWidth = Math.max(maxWidth, layerWidth);
  }
  return maxWidth;
};

const calculateNodeSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): { horizontalSpacing: number; verticalSpacing: number } => {
  // Get the width of the widest layer in the remaining tree
  const widestLayerWidth = findWidestLayerWidth(childrenCount, currentLayer, maxLayers);
  
  // Calculate how many nodes are at the current layer
  const nodesAtCurrentLayer = calculateNodesAtLayer(childrenCount, currentLayer - 1);
  
  // Calculate spacing needed to fit widest layer underneath
  const horizontalSpacing = widestLayerWidth / nodesAtCurrentLayer;
  
  // Maintain consistent vertical spacing
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
  const { horizontalSpacing, verticalSpacing } = calculateNodeSpacing(
    childrenCount, 
    currentLayer,
    maxLayers
  );
  
  // For first layer nodes
  if (currentLayer === 1) {
    const startX = -((childrenCount - 1) * horizontalSpacing) / 2;
    return {
      x: startX + (index * horizontalSpacing),
      y: parentY + verticalSpacing
    };
  }
  
  // For subsequent layer nodes
  const nodesInCurrentLayer = calculateNodesAtLayer(childrenCount, currentLayer - 1);
  const totalWidth = horizontalSpacing * (nodesInCurrentLayer - 1);
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
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});
