import { Input } from "@/components/ui/input";
import { Handle, Position } from '@xyflow/react';
import { Plus, X } from "lucide-react";

interface QANodeProps {
  data: {
    question: string;
    answer: string;
    updateNodeData: (id: string, field: string, value: string) => void;
    addChildNode: (id: string) => void;
    removeNode: (id: string) => void;
  };
  id: string;
}

export const QANodeComponent = ({ data, id }: QANodeProps) => {
  const { updateNodeData, addChildNode, removeNode } = data;

  return (
    <div className="bg-[#1a1b1e] border border-white/10 rounded-lg p-4 w-[300px]">
      <div className="flex justify-between items-start gap-2 mb-2">
        <Input
          className="font-medium text-sm text-white bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
          value={data.question}
          onChange={(e) => updateNodeData(id, 'question', e.target.value)}
          placeholder="Enter question..."
        />
        <div className="flex space-x-1 shrink-0">
          <button 
            className="p-1 hover:bg-white/10 rounded"
            onClick={() => addChildNode(id)}
          >
            <Plus size={16} className="text-blue-500" />
          </button>
          <button 
            className="p-1 hover:bg-white/10 rounded"
            onClick={() => removeNode(id)}
          >
            <X size={16} className="text-red-500" />
          </button>
        </div>
      </div>
      <div className="border-t border-white/10 my-2" />
      <Input
        className="text-xs text-gray-300 bg-transparent border-none hover:bg-white/5 focus:bg-white/5"
        value={data.answer}
        onChange={(e) => updateNodeData(id, 'answer', e.target.value)}
        placeholder="Enter answer..."
      />
      <Handle type="target" position={Position.Top} id="target" />
      <Handle type="source" position={Position.Bottom} id="source" />
    </div>
  );
};