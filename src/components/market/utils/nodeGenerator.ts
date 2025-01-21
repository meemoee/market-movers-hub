import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Calculate lane height for a parent node
const calculateLaneHeight = (
  childrenCount: number,
  currentLayer: number
): number => {
  const baseNodeHeight = 120;
  const minSpacing = 40;
  // Add extra padding between lanes based on depth
  const lanePadding = (3 - currentLayer) * 40;
  return (childrenCount * (baseNodeHeight + minSpacing)) + lanePadding;
};

// Track vertical positions of lanes for each parent
const parentLanes: { [key: string]: { start: number; end: number } } = {};
let nextLaneStart = 0;

// Reserve a vertical lane for a parent and its children
const reserveLane = (
  parentId: string,
  childrenCount: number,
  currentLayer: number
): { start: number; end: number } => {
  if (currentLayer === 1) {
    // Root level - reset lane tracking
    parentLanes.root = { start: 0, end: 0 };
    nextLaneStart = 0;
  }

  const laneHeight = calculateLaneHeight(childrenCount, currentLayer);
  const laneStart = nextLaneStart;
  const laneEnd = laneStart + laneHeight;
  
  parentLanes[parentId] = { start: laneStart, end: laneEnd };
  nextLaneStart = laneEnd + 40; // Add padding between lanes
  
  return { start: laneStart, end: laneEnd };
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  parentId: string
) => {
  // Fixed horizontal spacing between layers
  const horizontalSpacing = 400;
  const x = parentX + horizontalSpacing;

  // If this is a first level node, distribute vertically with large gaps
  if (currentLayer === 1) {
    const parentLane = reserveLane(parentId, childrenCount, currentLayer);
    const availableHeight = parentLane.end - parentLane.start;
    const ySpacing = availableHeight / (childrenCount + 1);
    const y = parentLane.start + (ySpacing * (index + 1));
    return { x, y };
  }

  // For subsequent layers, position within parent's lane
  const parentLane = parentLanes[parentId];
  if (!parentLane) {
    console.warn('No lane found for parent:', parentId);
    return { x, y: parentY };
  }

  const availableHeight = parentLane.end - parentLane.start;
  const ySpacing = availableHeight / (childrenCount + 1);
  const y = parentLane.start + (ySpacing * (index + 1));

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
    parentId: data.parentId, // Track parent ID for lane management
    style: {
      // Nodes get slightly smaller at deeper levels
      width: Math.max(300 - data.currentLayer * 20, 200),
      // Add visual indication of depth
      opacity: Math.max(0.7, 1 - data.currentLayer * 0.1)
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
    stroke: getEdgeColor(currentLayer), // Different colors for different layers
    strokeWidth: Math.max(3 - currentLayer * 0.5, 1), // Edges get thinner at deeper levels
    strokeDasharray: currentLayer === 1 ? '0' : '5,5'
  },
  animated: currentLayer === 1
});

// Get different colors for different layer depths
const getEdgeColor = (layer: number): string => {
  const colors = [
    '#666666', // First level
    '#4A90E2', // Second level
    '#50C878', // Third level
    '#9B59B6'  // Fourth level
  ];
  return colors[layer - 1] || colors[colors.length - 1];
};
