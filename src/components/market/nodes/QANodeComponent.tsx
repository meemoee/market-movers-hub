import { Handle, Position } from '@xyflow/react';
import { Plus, X } from "lucide-react";

interface QANodeData {
  question: string;
  answer: string;
  subQuestions?: string[];
  updateNodeData: (nodeId: string, field: string, value: string | string[]) => void;
  addChildNode: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;
}

export function QANodeComponent({ id, data }: { id: string, data: QANodeData }) {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-white border-2 border-stone-400 min-w-[300px]">
      <div className="flex justify-between items-start">
        <Handle type="target" position={Position.Top} className="w-16 !bg-teal-500" />
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <p className="text-sm font-bold text-gray-700">{data.question}</p>
            <button
              className="ml-2 p-1 rounded hover:bg-gray-100"
              onClick={() => data.removeNode(id)}
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-2">{data.answer}</p>
          
          {data.subQuestions && data.subQuestions.length > 0 && (
            <div className="mt-4 border-t pt-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Follow-up Questions:</p>
              <ul className="list-disc list-inside text-xs text-gray-500 space-y-1">
                {data.subQuestions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} className="w-16 !bg-teal-500" />
      </div>
      <button
        className="mt-2 flex items-center justify-center w-full p-2 text-xs text-teal-500 hover:bg-teal-50 rounded-md transition-colors"
        onClick={() => data.addChildNode(id)}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Follow-up
      </button>
    </div>
  );
}