import { ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from 'react-markdown';

interface QANodeProps {
  question: string;
  analysis: string;
  isExpanded: boolean;
  onToggle: () => void;
  depth: number;
  hasChildren: boolean;
  isLast?: boolean;
}

export function QANode({ 
  question, 
  analysis, 
  isExpanded, 
  onToggle,
  depth,
  hasChildren,
  isLast = false
}: QANodeProps) {
  const firstLine = analysis?.split('\n')[0] || '';
  
  return (
    <div className="relative">
      {depth > 0 && (
        <div className="absolute left-0 -translate-x-[20px] top-0 h-full w-[20px]">
          <svg
            className="absolute left-0 top-0 w-full h-full"
            style={{ 
              opacity: 0.15,
              overflow: 'visible'
            }}
          >
            {/* Horizontal connecting line with curve */}
            <path
              d={`M0,24 C10,24 15,24 20,24`}
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
              className="text-muted-foreground"
            />
            {/* Vertical line that extends down if there are siblings */}
            {!isLast && (
              <line
                x1="0"
                y1="24"
                x2="0"
                y2="100%"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground"
              />
            )}
          </svg>
        </div>
      )}
      
      <div 
        className={`
          pl-[20px] mb-3 group
          ${hasChildren ? 'cursor-pointer' : ''}
        `}
        onClick={hasChildren ? onToggle : undefined}
      >
        <div className="rounded-lg p-4 transition-colors group-hover:bg-accent/5">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">{question}</h3>
            <div className="text-sm text-muted-foreground flex items-start gap-2">
              {hasChildren && (
                <button className="mt-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}
              <div className="flex-1">
                {isExpanded ? (
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                ) : (
                  <div className="line-clamp-1">{firstLine}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}