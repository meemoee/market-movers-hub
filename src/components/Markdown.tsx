
import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
      {children}
    </ReactMarkdown>
  );
}
