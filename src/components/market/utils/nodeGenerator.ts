import { Node, Edge } from '@xyflow/react';

interface NodeData {
  question?: string;
  answer?: string;
  currentLayer: number;
  updateNodeData?: (nodeId: string, field: string, value: string) => void;
  addChildNode?: (parentId: string) => void;
  removeNode?: () => void;
}

export const createNode = (
  id: string,
  position: { x: number; y: number },
  data: NodeData
): Node => ({
  id,
  type: 'qaNode',
  position,
  data: {
    ...data,
    question: '',
    answer: '',
    style: {
      width: 300,
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
  },
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
          0,
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

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  maxLayers: number
) => {
  const totalWidth = calculateTotalTreeWidth(childrenCount, maxLayers);
  const { horizontalGap, verticalGap } = calculateLayerSpacing(
    childrenCount,
    currentLayer,
    maxLayers,
    totalWidth
  );

  const x = (index + 1) * horizontalGap - totalWidth / 2;
  const y = currentLayer * verticalGap;

  return { x, y };
};

const calculateTotalTreeWidth = (childrenCount: number, maxLayers: number): number => {
  const maxNodesAtDeepestLayer = Math.pow(childrenCount, maxLayers - 1);
  const baseNodeSpacing = 300;
  return maxNodesAtDeepestLayer * baseNodeSpacing;
};

const calculateLayerSpacing = (
  childrenCount: number,
  currentLayer: number,
  maxLayers: number,
  totalWidth: number
): { horizontalGap: number; verticalGap: number } => {
  const nodesAtCurrentLayer = Math.pow(childrenCount, currentLayer - 1);
  const horizontalGap = totalWidth / (nodesAtCurrentLayer + 1);
  const verticalGap = 200;
  
  return { horizontalGap, verticalGap };
};