
import React, { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  children: ReactNode;
}

export function Markdown({ children }: MarkdownProps) {
  // Handle string content with optional streaming cursor
  if (typeof children === 'string') {
    return (
      <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
        {children}
      </ReactMarkdown>
    );
  }
  
  // Handle case where children is an array with content and cursor
  if (Array.isArray(children)) {
    // Check if all non-string children are just the cursor element
    const stringParts: string[] = [];
    let hasCursor = false;
    
    React.Children.forEach(children, child => {
      if (typeof child === 'string') {
        stringParts.push(child);
      } else if (React.isValidElement(child) && 
                 child.props && 
                 child.props.className === 'animate-pulse') {
        hasCursor = true;
      }
    });
    
    // If we have string content and just a cursor, combine and use ReactMarkdown
    if (stringParts.length > 0 && hasCursor) {
      const content = stringParts.join('');
      return (
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
          <span className="animate-pulse">▌</span>
        </div>
      );
    }
  }
  
  // Fall back to rendering children directly for other cases
  return <div className="prose prose-sm prose-invert max-w-none">{children}</div>;
}
