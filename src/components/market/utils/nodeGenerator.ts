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

// Pre-calculate total width needed for the entire tree
const calculateTotalTreeWidth = (childrenCount: number, maxLayers: number): number => {
  // Calculate max number of nodes at the deepest layer
  const maxNodesAtDeepestLayer = Math.pow(childrenCount, maxLayers - 1);
  // Base spacing between nodes at the deepest layer
  const baseNodeSpacing = 300;
  return maxNodesAtDeepestLayer * baseNodeSpacing;
};

// Calculate spacing for a specific layer
const calculateLayerSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number,
  totalWidth: number
): { horizontalGap: number; verticalGap: number } => {
  // Calculate how many nodes could be at this layer
  const nodesAtCurrentLayer = Math.pow(childrenCount, currentLayer - 1);
  // Distribute total width proportionally
  const horizontalGap = totalWidth / (nodesAtCurrentLayer + 1);
  // Fixed vertical gap between layers
  const verticalGap = 200;
  
  return { horizontalGap, verticalGap };
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  maxLayers: number
) => {
  // Calculate total tree width needed
  const totalWidth = calculateTotalTreeWidth(childrenCount, maxLayers);
  const { horizontalGap, verticalGap } = calculateLayerSpacing(
    childrenCount,
    currentLayer,
    maxLayers,
    totalWidth
  );

  // Calculate x position based on index and total width
  const x = (index + 1) * horizontalGap - totalWidth / 2;
  // Calculate y position based on layer
  const y = currentLayer * verticalGap;

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
    question: '',
    answer: '',
    style: {
      width: getNodeDimensions(data.currentLayer || 1).width,
      opacity: Math.max(0.7, 1 - (data.currentLayer || 1) * 0.1)
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

// Generate entire tree structure upfront
export const generateTreeStructure = (
  rootId: string,
  maxLayers: number,
  childrenCount: number
): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // Create root node
  nodes.push(createNode(rootId, { x: 0, y: 0 }, { currentLayer: 1 }));
  
  // Generate nodes layer by layer
  const generateLayer = (parentIds: string[], currentLayer: number) => {
    if (currentLayer > maxLayers) return;
    
    const newParentIds: string[] = [];
    
    parentIds.forEach((parentId, parentIndex) => {
      for (let i = 0; i < childrenCount; i++) {
        const nodeId = `node-${Date.now()}-${currentLayer}-${i}-${parentIndex}`;
        const position = generateNodePosition(
          i,
          childrenCount,
          0, // Will be calculated based on parent later
          0,
          currentLayer,
          maxLayers
        );
        
        nodes.push(createNode(nodeId, position, { currentLayer }));
        edges.push(createEdge(parentId, nodeId, currentLayer));
        newParentIds.push(nodeId);
      }
    });
    
    generateLayer(newParentIds, currentLayer + 1);
  };
  
  generateLayer([rootId], 2);
  
  return { nodes, edges };
};