import { Handle, Position } from '@xyflow/react';
import { useEffect, useRef } from 'react';

interface QANodeProps {
  data: {
    question: string;
    answer: string;
    updateNodeData: (id: string, field: string, value: string) => void;
  };
  id: string;
}

export const QANodeComponent = ({ data, id }: QANodeProps) => {
  const { updateNodeData } = data;
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  useEffect(() => {
    if (questionRef.current) {
      adjustTextareaHeight(questionRef.current);
    }
    if (answerRef.current) {
      adjustTextareaHeight(answerRef.current);
    }
  }, [data.question, data.answer]);

  return (
    <div 
      className="bg-[#1a1b1e] border border-white/10 rounded-lg p-4 w-[300px] flex flex-col"
      style={{ minHeight: 'fit-content' }}
    >
      <textarea
        ref={questionRef}
        className="font-medium text-sm text-white bg-transparent border-none hover:bg-white/5 focus:bg-white/5 break-words whitespace-pre-wrap w-full resize-none overflow-hidden focus:outline-none min-h-[40px]"
        value={data.question}
        onChange={(e) => {
          updateNodeData(id, 'question', e.target.value);
          adjustTextareaHeight(e.target);
        }}
        placeholder="Enter question..."
        rows={1}
      />
      
      <div className="border-t border-white/10 my-2" />
      
      <textarea
        ref={answerRef}
        className="text-xs text-gray-300 bg-transparent border-none hover:bg-white/5 focus:bg-white/5 w-full resize-none overflow-hidden focus:outline-none min-h-[40px] break-words whitespace-pre-wrap"
        value={data.answer}
        onChange={(e) => {
          updateNodeData(id, 'answer', e.target.value);
          adjustTextareaHeight(e.target);
        }}
        placeholder="Enter answer..."
        rows={1}
      />
      
      <Handle type="target" position={Position.Top} id="target" />
      <Handle type="source" position={Position.Bottom} id="source" />
    </div>
  );
};
