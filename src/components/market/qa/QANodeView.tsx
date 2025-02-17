
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ReactMarkdown from 'react-markdown';
import { MessageSquare, ChevronUp, ChevronDown, ArrowRight, LinkIcon } from "lucide-react";
import type { Components as MarkdownComponents } from 'react-markdown';
import { QANode, StreamingContent } from "./types";

interface QANodeViewProps {
  node: QANode;
  depth: number;
  isStreaming: boolean;
  streamContent?: StreamingContent;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  onExpandQuestion: (node: QANode) => void;
  markdownComponents: MarkdownComponents;
  nodeExtensions: QANode[];
  onNavigateToExtension: (extension: QANode) => void;
  getPreviewText: (text: string | undefined) => string;
}

export function QANodeView({
  node,
  depth,
  isStreaming,
  streamContent,
  isExpanded,
  onToggle,
  onExpandQuestion,
  markdownComponents,
  nodeExtensions,
  onNavigateToExtension,
  getPreviewText,
}: QANodeViewProps) {
  const analysisContent = isStreaming ? streamContent?.content : node.analysis;
  const citations = isStreaming ? streamContent?.citations : node.citations;

  const getScoreBackgroundColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 60) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className="relative flex flex-col">
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
            
            <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => onToggle(node.id)}>
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
                      
                      <div className="mt-4 space-y-2">
                        {node.evaluation && (
                          <div className={`rounded-lg p-2 ${getScoreBackgroundColor(node.evaluation.score)}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium">
                                Score: {node.evaluation.score}%
                              </div>
                              {!node.isExtendedRoot && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onExpandQuestion(node);
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
                      </div>
                      
                      {nodeExtensions.length > 0 && (
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
                                  onNavigateToExtension(extension);
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
          
          {node.children.length > 0 && isExpanded && (
            <div className="mt-6">
              {node.children.map(child => (
                <QANodeView
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  isStreaming={isStreaming}
                  streamContent={streamContent}
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                  onExpandQuestion={onExpandQuestion}
                  markdownComponents={markdownComponents}
                  nodeExtensions={nodeExtensions}
                  onNavigateToExtension={onNavigateToExtension}
                  getPreviewText={getPreviewText}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
