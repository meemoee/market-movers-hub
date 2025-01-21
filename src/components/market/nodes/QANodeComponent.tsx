import { Input } from "@/components/ui/input";
import { Handle, Position } from '@xyflow/react';
import { Plus, X } from "lucide-react";

interface NodeData {
  question?: string;
  answer?: string;
  currentLayer: number;
  updateNodeData: (nodeId: string, field: string, value: string) => void;
  addChildNode: (parentId: string) => void;
  removeNode: () => void;
}

interface QANodeProps {
  data: NodeData;
  id: string;
}

export const QANodeComponent = ({ data, id }: QANodeProps) => {
  const { updateNodeData, addChildNode, removeNode } = data;
  const layer = data.currentLayer || 1;

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (addChildNode) {
      addChildNode(id);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (removeNode) {
      removeNode();
    }
  };

  const getBackgroundColor = () => {
    const colors = [
      'rgba(26, 27, 30, 1)',      // First level
      'rgba(29, 35, 42, 1)',      // Second level
      'rgba(32, 40, 48, 1)',      // Third level
      'rgba(35, 45, 54, 1)'       // Fourth level
    ];
    return colors[layer - 1] || colors[colors.length - 1];
  };

  return (
    <div 
      className="border border-white/10 rounded-lg p-4 transition-colors"
      style={{ 
        width: '300px',
        backgroundColor: getBackgroundColor(),
        boxShadow: `0 0 ${20 - layer * 4}px rgba(0,0,0,0.2)`
      }}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <Input
          className="font-medium text-sm text-white bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
          value={data.question || ''}
          onChange={(e) => updateNodeData(id, 'question', e.target.value)}
          placeholder={`Question for Layer ${layer}...`}
        />
        <div className="flex space-x-1 shrink-0">
          <button 
            className="p-1 hover:bg-white/10 rounded transition-colors"
            onClick={handleAddChild}
            type="button"
          >
            <Plus size={16} className="text-blue-500" />
          </button>
          <button 
            className="p-1 hover:bg-white/10 rounded transition-colors"
            onClick={handleRemove}
            type="button"
          >
            <X size={16} className="text-red-500" />
          </button>
        </div>
      </div>
      
      <div className="border-t border-white/10 my-2" />
      
      <Input
        className="text-xs text-gray-300 bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
        value={data.answer || ''}
        onChange={(e) => updateNodeData(id, 'answer', e.target.value)}
        placeholder={`Answer for Layer ${layer}...`}
      />
      
      <Handle 
        type="target" 
        position={Position.Left} 
        id="left"
        className="w-2 h-2 rounded-full transition-colors"
        style={{ background: getBackgroundColor() }}
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id="right"
        className="w-2 h-2 rounded-full transition-colors"
        style={{ background: getBackgroundColor() }}
      />
    </div>
  );
};