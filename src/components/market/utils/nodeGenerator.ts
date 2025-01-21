import { Node, Edge } from '@xyflow/react';
import { calculateChildPosition } from './treeSpacing';

export interface NodeData extends Record<string, unknown> {
  question: string;
  answer: string;
  updateNodeData?: (id: string, field: string, value: string) => void;
  addChildNode?: (id: string) => void;
  removeNode?: (id: string) => void;
}

export const createNode = (
  id: string,
  position: { x: number; y: number },
  data: NodeData
): Node<NodeData> => ({
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
  type: 'smoothstep',
  animated: currentLayer === 1,
  style: { stroke: '#666', strokeWidth: 2 }
});

export const generateNodePosition = (
  index: number,
  childrenCount: number,
  parentX: number,
  parentY: number,
  currentLayer: number
) => {
  return calculateChildPosition(
    index,
    childrenCount,
    parentX,
    parentY,
    currentLayer
  );
};