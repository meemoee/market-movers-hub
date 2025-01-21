import { Node, Edge } from '@xyflow/react';

// Types for node generation
export interface NodeData {
  question: string;
  answer: string;
  descendants?: number;
  updateNodeData?: (id: string, field: string, value: string) => void;
  addChildNode?: (id: string) => void;
  removeNode?: (id: string) => void;
}

interface TreeMetrics {
  width: number;
  descendants: number;
  depth: number;
}

const NODE_WIDTH = 300;
const NODE_HEIGHT = 150;
const MIN_NODE_SPACING = 50;
const BASE_VERTICAL_SPACING = 250;

// Calculate metrics for the entire subtree rooted at a node
function calculateTreeMetrics(
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
  cache = new Map<string, TreeMetrics>()
): TreeMetrics {
  // Return cached results if available
  if (cache.has(nodeId)) {
    return cache.get(nodeId)!;
  }

  // Find child nodes
  const childEdges = edges.filter(edge => edge.source === nodeId);
  const childNodes = childEdges.map(edge => 
    nodes.find(node => node.id === edge.target)!
  );

  if (childNodes.length === 0) {
    const metrics = { width: NODE_WIDTH, descendants: 0, depth: 0 };
    cache.set(nodeId, metrics);
    return metrics;
  }

  // Calculate metrics for all children
  const childMetrics = childNodes.map(child =>
    calculateTreeMetrics(nodes, edges, child.id, cache)
  );

  // Calculate total width needed for this subtree
  let totalChildrenWidth = childMetrics.reduce((sum, metrics) => sum + metrics.width, 0);
  totalChildrenWidth += (childNodes.length - 1) * MIN_NODE_SPACING;

  // Calculate total descendants and maximum depth
  const totalDescendants = childMetrics.reduce(
    (sum, metrics) => sum + metrics.descendants + 1, 
    0
  );
  const maxDepth = Math.max(...childMetrics.map(m => m.depth)) + 1;

  // The subtree width should be at least as wide as the node itself
  const width = Math.max(NODE_WIDTH, totalChildrenWidth);

  const metrics = {
    width,
    descendants: totalDescendants,
    depth: maxDepth
  };

  cache.set(nodeId, metrics);
  return metrics;
}

// Calculate spacing for nodes at a given layer
export function calculateNodeSpacing(
  nodes: Node[],
  edges: Edge[],
  parentId: string,
  currentLayer: number
): { horizontalSpacing: number; verticalSpacing: number } {
  const metrics = calculateTreeMetrics(nodes, edges, parentId);
  
  // Base horizontal spacing based on tree metrics
  const baseSpacing = Math.max(
    metrics.width / (metrics.descendants || 1),
    NODE_WIDTH + MIN_NODE_SPACING
  );

  // Add extra spacing for higher levels
  const layerMultiplier = Math.pow(1.5, Math.max(0, 3 - currentLayer));
  const horizontalSpacing = baseSpacing * layerMultiplier;

  // Vertical spacing increases slightly with depth
  const verticalSpacing = BASE_VERTICAL_SPACING + (currentLayer * 25);

  return { horizontalSpacing, verticalSpacing };
}

// Generate position for a new node
export function generateNodePosition(
  index: number,
  childCount: number,
  nodes: Node[],
  edges: Edge[],
  parentId: string,
  parentPosition: { x: number; y: number },
  currentLayer: number
): { x: number; y: number } {
  const { horizontalSpacing, verticalSpacing } = calculateNodeSpacing(
    nodes, 
    edges, 
    parentId, 
    currentLayer
  );

  // Calculate total width of all children
  const totalWidth = (childCount - 1) * horizontalSpacing;
  
  // Center the nodes relative to parent
  const startX = parentPosition.x - (totalWidth / 2);

  return {
    x: startX + (index * horizontalSpacing),
    y: parentPosition.y + verticalSpacing
  };
}

// Create a new node
export function createNode(
  id: string,
  position: { x: number; y: number },
  data: NodeData,
  callbacks: {
    updateNodeData: (id: string, field: string, value: string) => void;
    addChildNode: (id: string) => void;
    removeNode: (id: string) => void;
  }
): Node<NodeData> {
  return {
    id,
    type: 'qaNode',
    position,
    data: {
      ...data,
      descendants: 0,
      updateNodeData: callbacks.updateNodeData,
      addChildNode: callbacks.addChildNode,
      removeNode: callbacks.removeNode
    }
  };
}

// Create an edge between nodes
export function createEdge(
  sourceId: string,
  targetId: string,
  currentLayer: number
): Edge {
  return {
    id: `edge-${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
    style: { 
      stroke: '#666', 
      strokeWidth: 2,
      opacity: currentLayer === 1 ? 1 : 0.7
    },
    animated: currentLayer === 1
  };
}

// Update descendant counts for all nodes
export function updateDescendantCounts(
  nodes: Node<NodeData>[],
  edges: Edge[]
): Node<NodeData>[] {
  const getDescendantCount = (nodeId: string, visited = new Set<string>()): number => {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const childEdges = edges.filter(edge => edge.source === nodeId);
    return childEdges.reduce((count, edge) => 
      count + getDescendantCount(edge.target, visited) + 1, 
      0
    );
  };

  return nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      descendants: getDescendantCount(node.id)
    }
  }));
}
