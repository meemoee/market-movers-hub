
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ScrollArea } from "@/components/ui/scroll-area"

export interface AnalysisDisplayProps {
  content: string;
  streaming?: boolean;
}

export function AnalysisDisplay({ content }: AnalysisDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [content]);

  return (
    <ScrollArea className="h-[300px] rounded-md bg-card p-4" ref={scrollRef}>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </ScrollArea>
  );
}
