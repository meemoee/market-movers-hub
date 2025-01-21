import { Node, Edge } from '@xyflow/react';

export interface NodeGeneratorOptions {
  parentId: string;
  currentLayer: number;
  maxLayers: number;
  childrenCount: number;
  parentNode?: Node;
  nodes: Node[];
}

// Calculate total width needed for a subtree at a given depth
const calculateSubtreeWidth = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): number => {
  // Base node spacing that accounts for node width and minimum separation
  const baseNodeWidth = 400;
  
  // If we're at max depth, just return single node width
  if (currentLayer === maxLayers) {
    return baseNodeWidth;
  }

  // Calculate how many layers are below this one
  const remainingLayers = maxLayers - currentLayer;
  
  // Calculate max children at each remaining layer
  const maxNodesAtBottom = Math.pow(childrenCount, remainingLayers);
  
  // Return width needed to accommodate maximum possible nodes at bottom layer
  return maxNodesAtBottom * baseNodeWidth;
};

// Calculate spacing between parent nodes to accommodate their subtrees
const calculateParentSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number
): number => {
  // Get width needed for each parent's subtree
  const subtreeWidth = calculateSubtreeWidth(childrenCount, currentLayer, maxLayers);
  
  // Add padding between subtrees to make relationships clear
  const paddingBetweenSubtrees = 200;
  
  return subtreeWidth + paddingBetweenSubtrees;
};

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  maxLayers: number
) => {
  // Get spacing needed between parent nodes at this level
  const parentSpacing = calculateParentSpacing(childrenCount, currentLayer, maxLayers);
  
  // Calculate x position relative to parent
  // Center the first child and space others based on parent spacing
  const centeringOffset = ((childrenCount - 1) * parentSpacing) / 2;
  const x = parentX - centeringOffset + (index * parentSpacing);
  
  // Consistent vertical spacing
  const verticalSpacing = 200;
  const y = parentY + verticalSpacing;
  
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
  // Only animate first-level connections
  animated: currentLayer === 1
});

// Function to determine all nodes in a subtree given a parent ID
export const getSubtreeNodeIds = (
  parentId: string,
  nodes: Node[],
  edges: Edge[]
): Set<string> => {
  const subtreeNodes = new Set<string>();
  const processNode = (nodeId: string) => {
    subtreeNodes.add(nodeId);
    // Find all edges where this node is the source
    edges
      .filter(edge => edge.source === nodeId)
      .forEach(edge => {
        if (!subtreeNodes.has(edge.target)) {
          processNode(edge.target);
        }
      });
  };
  
  processNode(parentId);
  return subtreeNodes;
};
