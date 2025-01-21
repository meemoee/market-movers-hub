import { Node, Edge } from '@xyflow/react';

interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Track ancestor paths and their assigned channels
const ancestorChannels = new Map<string, number>();
let nextChannelId = 0;

// Reset state
const resetLayout = () => {
  ancestorChannels.clear();
  nextChannelId = 0;
};

// Get or create channel for an ancestor path
const getAncestorChannel = (ancestorPath: string): number => {
  if (!ancestorChannels.has(ancestorPath)) {
    ancestorChannels.set(ancestorPath, nextChannelId++);
  }
  return ancestorChannels.get(ancestorPath)!;
};

// Calculate node dimensions based on layer
const getNodeDimensions = (layer: number) => ({
  width: Math.max(300 - layer * 20, 200),
  height: 120
});

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  parentId: string,
  nodes: Node[] = []
) => {
  // Reset layout when starting from root
  if (currentLayer === 1) {
    resetLayout();
  }

  // Build ancestor path
  const ancestorPath = buildAncestorPath(parentId, nodes);
  const channel = getAncestorChannel(ancestorPath);
  
  // Calculate horizontal position
  const LAYER_HORIZONTAL_GAP = 400;
  const x = currentLayer * LAYER_HORIZONTAL_GAP;

  // Calculate vertical position based on channel and siblings
  const CHANNEL_VERTICAL_GAP = 200; // Gap between channels
  const SIBLING_VERTICAL_GAP = 40;  // Gap between siblings in same channel
  const channelBaseY = channel * CHANNEL_VERTICAL_GAP;
  
  // Position within channel based on sibling index
  const siblingOffset = (childrenCount - 1) / 2;
  const relativeY = (index - siblingOffset) * (getNodeDimensions(currentLayer).height + SIBLING_VERTICAL_GAP);
  
  const y = channelBaseY + relativeY;

  return { x, y };
};

// Helper to build ancestor path string
const buildAncestorPath = (nodeId: string, nodes: Node[]): string => {
  const path: string[] = [nodeId];
  let current = nodes.find(n => n.id === nodeId);
  
  while (current?.data?.parentId) {
    path.unshift(current.data.parentId);
    current = nodes.find(n => n.id === current?.data.parentId);
  }
  
  return path.join('-');
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
      width: getNodeDimensions(data.currentLayer).width,
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
    stroke: getEdgeColor(currentLayer),
    strokeWidth: Math.max(3 - currentLayer * 0.5, 1),
    // Make deeper edges more curvey to avoid overlap
    curvature: currentLayer * 0.2
  },
  // Animate only first level
  animated: currentLayer === 1
});

const getEdgeColor = (layer: number): string => {
  const colors = [
    '#666666', // First level
    '#4A90E2', // Second level
    '#50C878', // Third level
    '#9B59B6'  // Fourth level
  ];
  return colors[layer - 1] || colors[colors.length - 1];
};
