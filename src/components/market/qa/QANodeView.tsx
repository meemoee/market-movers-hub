import React from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Link as LinkIcon, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from 'react-markdown';
import type { Components as MarkdownComponents } from 'react-markdown';
import { QANode, StreamingContent } from './types';

interface QANodeViewProps {
  node: QANode;
  depth: number;
  isExpanded?: boolean;
  isStreaming?: boolean;
  streamContent?: StreamingContent;
  nodeExtensions?: QANode[];
  expandedNodes: Set<string>;
  currentNodeId: string | null;
  streamingContent: { [key: string]: StreamingContent };
  toggleNode: (nodeId: string) => void;
  evaluateQAPair: (node: QANode) => Promise<void>;
  handleExpandQuestion: (node: QANode) => void;
}

const markdownComponents: MarkdownComponents = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  code: ({ children, className }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-muted/30 rounded px-1 py-0.5 text-sm font-mono">{children}</code>
    ) : (
      <code className="block bg-muted/30 rounded p-3 my-3 text-sm font-mono whitespace-pre-wrap">
        {children}
      </code>
    );
  },
  ul: ({ children }) => <ul className="list-disc pl-4 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-muted pl-4 italic my-3">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
  hr: () => <hr className="my-4 border-muted" />,
};

const getScoreBackgroundColor = (score: number) => {
  if (score >= 80) return 'bg-green-500/20';
  if (score >= 60) return 'bg-yellow-500/20';
  return 'bg-red-500/20';
};

const getPreviewText = (text: string | undefined) => {
  if (!text) return '';
  const strippedText = text.replace(/[#*`_]/g, '');
  const preview = strippedText.slice(0, 150);
  return preview.length < strippedText.length ? `${preview}...` : preview;
};

export function QANodeView({
  node,
  depth,
  expandedNodes,
  currentNodeId,
  streamingContent,
  toggleNode,
  evaluateQAPair,
  handleExpandQuestion
}: QANodeViewProps) {
  const isStreaming = currentNodeId === node.id;
  const streamContent = streamingContent[node.id];
  const isExpanded = expandedNodes.has(node.id);
  const analysisContent = isStreaming ? streamContent?.content : node.analysis;
  const citations = isStreaming ? streamContent?.citations : node.citations;

  return (
    <div key={node.id} className="relative flex flex-col">
      <div className="flex items-stretch">
        {depth > 0 && (
          <div className="relative w-6 sm:w-9 flex-shrink-0">
            <div className="absolute top-0 bottom-0 left-6 sm:left-9 w-[2px] bg-border" />
          </div>
        )}
        <div className="flex-grow min-w-0 pl-2 sm:pl-[72px] pb-6 relative">
          {depth > 0 && (
            <div className="absolute left-0 top-4 h-[2px] w-4 sm:w-6 bg-border" />
          )}
          <div className="absolute left-[12px] sm:left-[24px] top-0">
            <Avatar className="h-8 w-8 sm:h-9 sm:w-9 border-2 border-background">
              <AvatarFallback className="bg-primary/10">
                <MessageSquare className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-start">
              <h3 className="font-medium text-sm leading-none pt-2 flex-grow">
                {node.question}
              </h3>
            </div>
            
            <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => toggleNode(node.id)}>
              <div className="flex items-start gap-2">
                <button className="mt-1 hover:bg-accent/50 rounded-full p-0.5">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <div className="flex-1">
                  {isExpanded ? (
                    <>
                      <ReactMarkdown
                        components={markdownComponents}
                        className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      >
                        {analysisContent || ''}
                      </ReactMarkdown>

                      {citations && citations.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs text-muted-foreground font-medium">Sources:</div>
                          <div className="flex flex-wrap gap-2">
                            {citations.map((citation, index) => (
                              <a
                                key={index}
                                href={citation}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <LinkIcon className="h-3 w-3" />
                                {`[${index + 1}]`}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {node.evaluation && (
                        <div className={`mt-4 rounded-lg p-2 ${getScoreBackgroundColor(node.evaluation.score)}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium">
                              Score: {node.evaluation.score}%
                            </div>
                            {!node.isExtendedRoot && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExpandQuestion(node);
                                }}
                                className="p-1 hover:bg-accent/50 rounded-full transition-colors"
                                title="Expand this question into a follow-up analysis"
                              >
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <ReactMarkdown
                            components={markdownComponents}
                            className="text-xs text-muted-foreground"
                          >
                            {node.evaluation.reason}
                          </ReactMarkdown>
                        </div>
                      )}
                      
                      {nodeExtensions && nodeExtensions.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            Follow-up Analyses ({nodeExtensions.length}):
                          </div>
                          <div className="space-y-4">
                            {nodeExtensions.map((extension, index) => (
                              <div 
                                key={extension.id}
                                className="border border-border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // navigateToExtension(extension); // The navigateToExtension function was removed
                                }}
                              >
                                <div className="text-xs text-muted-foreground mb-2">
                                  Continuation #{index + 1}
                                </div>
                                <div className="line-clamp-3">
                                  {getPreviewText(extension.analysis)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="line-clamp-3">{getPreviewText(analysisContent)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {node.children && node.children.length > 0 && isExpanded && (
            <div className="mt-6">
              {node.children.map(child => (
                <QANodeView
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  expandedNodes={expandedNodes}
                  currentNodeId={currentNodeId}
                  streamingContent={streamingContent}
                  toggleNode={toggleNode}
                  evaluateQAPair={evaluateQAPair}
                  handleExpandQuestion={handleExpandQuestion}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
