import React, { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  children: ReactNode;
}

export function Markdown({ children }: MarkdownProps) {
  // If children is a string, render it with ReactMarkdown
  // Otherwise, render it directly (for when children includes JSX elements)
  if (typeof children === 'string') {
    return (
      <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
        {children}
      </ReactMarkdown>
    );
  }
  
  // If children includes JSX elements, render them directly
  return <div className="prose prose-sm prose-invert max-w-none">{children}</div>;
}
