import { Node, Edge } from '@xyflow/react';

interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Track vertical zones for each layer to prevent overlap
const layerZones = new Map<number, { start: number; end: number }[]>();

// Calculate space needed for a node and its children
const calculateNodeSpace = (childrenCount: number, currentLayer: number): number => {
  const baseNodeHeight = 120;
  const minSpacing = 40;
  // Add exponentially more padding for deeper layers
  const depthPadding = Math.pow(2, currentLayer) * 20;
  return (childrenCount * (baseNodeHeight + minSpacing)) + depthPadding;
};

// Find a free vertical zone for a node
const findFreeZone = (spaceNeeded: number, currentLayer: number): { start: number; end: number } => {
  const currentZones = layerZones.get(currentLayer) || [];
  let start = 0;

  // Find first free space that can fit the node
  while (true) {
    const overlapping = currentZones.find(zone => 
      (start >= zone.start && start <= zone.end) ||
      (start + spaceNeeded >= zone.start && start + spaceNeeded <= zone.end)
    );

    if (!overlapping) {
      break;
    }
    start = overlapping.end + 40; // Add padding between zones
  }

  const newZone = { start, end: start + spaceNeeded };
  
  // Update zones for this layer
  layerZones.set(currentLayer, [...currentZones, newZone]);
  
  return newZone;
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  parentId: string
) => {
  // Increase horizontal spacing exponentially with depth
  const horizontalBase = 400;
  const horizontalSpacing = horizontalBase + (Math.pow(1.5, currentLayer) * 50);
  const x = parentX + horizontalSpacing;

  // Calculate space needed for this node's subtree
  const spaceNeeded = calculateNodeSpace(childrenCount, currentLayer);
  
  // Find a free vertical zone
  const zone = findFreeZone(spaceNeeded, currentLayer);
  
  // Calculate y position within the zone
  const ySpacing = (zone.end - zone.start) / (childrenCount + 1);
  const y = zone.start + (ySpacing * (index + 1));

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
    parentId: data.parentId,
    style: {
      // Scale node width based on layer depth
      width: Math.max(300 - data.currentLayer * 20, 200),
      opacity: Math.max(0.7, 1 - data.currentLayer * 0.1)
    }
  }
});

export const createEdge = (
  sourceId: string,
  targetId: string,
  currentLayer: number
): Edge => ({
  id: \`edge-\${sourceId}-\${targetId}\`,
  source: sourceId,
  target: targetId,
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'smoothstep',
  // Adjust edge styling based on depth
  style: { 
    stroke: getEdgeColor(currentLayer),
    strokeWidth: Math.max(3 - currentLayer * 0.5, 1),
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});

// Different colors for different layer depths
const getEdgeColor = (layer: number): string => {
  const colors = [
    '#666666', // First level
    '#4A90E2', // Second level
    '#50C878', // Third level
    '#9B59B6'  // Fourth level
  ];
  return colors[layer - 1] || colors[colors.length - 1];
};
