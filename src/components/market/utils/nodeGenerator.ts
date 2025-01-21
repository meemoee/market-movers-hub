import { Node, Edge } from '@xyflow/react';

interface NodeGeneratorResult {
  nodes: Node[];
  edges: Edge[];
}

interface NodeSpacingConfig {
  baseNodeWidth: number;
  minSpacing: number;
  depthSpacing: number;
  verticalSpacing: number;
  verticalSpacingMultiplier: number;
}

const DEFAULT_SPACING_CONFIG: NodeSpacingConfig = {
  baseNodeWidth: 400,
  minSpacing: 100,
  depthSpacing: 200,
  verticalSpacing: 250,
  verticalSpacingMultiplier: 1.1
};

// Calculate the total width needed for a subtree
const calculateSubtreeWidth = (
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  depth: number,
  config: NodeSpacingConfig = DEFAULT_SPACING_CONFIG,
  cache: Map<string, number> = new Map()
): number => {
  // Check cache first
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  // Find all edges where this node is the source
  const childEdges = edges.filter(edge => edge.source === nodeId);
  
  // Find all child nodes using the edges
  const children = childEdges.map(edge => 
    nodes.find(node => node.id === edge.target)
  ).filter((node): node is Node => node !== undefined);

  if (children.length === 0) {
    const width = config.baseNodeWidth;
    cache.set(nodeId, width);
    return width;
  }

  // Calculate total width needed for children
  const childrenWidth = children.reduce((total, child) => {
    return total + calculateSubtreeWidth(child.id, nodes, edges, depth + 1, config, cache);
  }, 0);

  // Add spacing between children based on depth
  const spacing = depth === 0 ? config.depthSpacing : config.minSpacing;
  const totalWidth = Math.max(
    config.baseNodeWidth,
    childrenWidth + (spacing * (children.length - 1))
  );

  cache.set(nodeId, totalWidth);
  return totalWidth;
};

// Calculate position for a node
const calculateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number,
  subtreeWidth: number,
  totalWidth: number,
  config: NodeSpacingConfig = DEFAULT_SPACING_CONFIG
) => {
  // Calculate x position
  const startX = parentX - (totalWidth / 2) + (subtreeWidth / 2);
  const xPos = startX + (index * subtreeWidth);
  
  // Calculate y position with exponential spacing increase
  const yPos = parentY + (config.verticalSpacing * 
    Math.pow(config.verticalSpacingMultiplier, currentLayer - 1));

  return { x: xPos, y: yPos };
};

export const generateNodes = (
  parentId: string,
  childrenCount: number,
  currentLayer: number,
  nodes: Node[],
  edges: Edge[],
  parentNode?: Node,
  config: NodeSpacingConfig = DEFAULT_SPACING_CONFIG
): NodeGeneratorResult => {
  const newNodes: Node[] = [];
  const newEdges: Edge[] = [];

  // If no parent node provided, find it in the nodes array
  const parent = parentNode || nodes.find(node => node.id === parentId);
  if (!parent) {
    throw new Error(`Parent node not found: ${parentId}`);
  }

  for (let i = 0; i < childrenCount; i++) {
    const nodeId = `node-${Date.now()}-${i}-${currentLayer}`;
    
    // Calculate width for this node's future subtree
    const subtreeWidth = calculateSubtreeWidth(nodeId, [...nodes, ...newNodes], [...edges, ...newEdges], currentLayer, config);
    const totalWidth = childrenCount * subtreeWidth;

    // Calculate position
    const position = calculateNodePosition(
      i, 
      childrenCount,
      parent.position.x,
      parent.position.y,
      currentLayer,
      subtreeWidth,
      totalWidth,
      config
    );

    // Create new node
    const newNode = createNode(nodeId, position, {
      question: '',
      answer: '',
      layer: currentLayer
    });
    
    // Create edge from parent to new node
    const newEdge = createEdge(parentId, nodeId, currentLayer);

    newNodes.push(newNode);
    newEdges.push(newEdge);
  }

  return { nodes: newNodes, edges: newEdges };
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
