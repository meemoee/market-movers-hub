
import { QANode, StreamingContent } from './types';
import { MessageSquare, ChevronUp, ChevronDown, ArrowRight, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import ReactMarkdown from 'react-markdown';
import type { Components as MarkdownComponents } from 'react-markdown';
import { Citations } from './Citations';
import { Badge } from "@/components/ui/badge";

interface QANodeViewerProps {
  node: QANode;
  depth: number;
  isStreaming: boolean;
  streamContent?: StreamingContent;
  isExpanded: boolean;
  nodeExtensions: QANode[];
  getExtensionInfo: (node: QANode) => string;
  toggleNode: (nodeId: string) => void;
  navigateToExtension: (extension: QANode) => void;
  handleExpandQuestion: (node: QANode) => void;
  renderSubNodes?: (node: QANode, depth: number) => React.ReactNode;
}

export function QANodeViewer({
  node,
  depth,
  isStreaming,
  streamContent,
  isExpanded,
  nodeExtensions,
  getExtensionInfo,
  toggleNode,
  navigateToExtension,
  handleExpandQuestion,
  renderSubNodes
}: QANodeViewerProps) {
  const analysisContent = isStreaming ? streamContent?.content : node.analysis;
  const citations = isStreaming ? streamContent?.citations : node.citations;

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
            <Avatar className="h-6 w-6 sm:h-9 sm:w-9">
              <AvatarFallback>
                <MessageSquare className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleNode(node.id)}
                className="text-sm font-medium hover:underline cursor-pointer"
              >
                {node.question}
              </button>

              {/* Show expansion info and navigation */}
              <div className="flex items-center gap-2">
                {nodeExtensions.length > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    <span>Expanded {nodeExtensions.length}x</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1"
                      onClick={() => navigateToExtension(nodeExtensions[0])}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Badge>
                )}
                {node.isExtendedRoot && node.originalNodeId && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    <span>Extended Analysis</span>
                  </Badge>
                )}
              </div>

              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            {isExpanded && (
              <div className="mt-4">
                <ReactMarkdown components={markdownComponents}>
                  {analysisContent || ''}
                </ReactMarkdown>
                <Citations citations={citations} />
                {node.evaluation && (
                  <div className={`mt-4 p-3 rounded ${getScoreBackgroundColor(node.evaluation.score)}`}>
                    <div className="font-medium mb-1">Evaluation Score: {node.evaluation.score}/100</div>
                    <div className="text-sm">{node.evaluation.reason}</div>
                  </div>
                )}
                {!node.isExtendedRoot && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => handleExpandQuestion(node)}
                  >
                    Expand this question
                  </Button>
                )}
              </div>
            )}
            {isExpanded && node.children.length > 0 && renderSubNodes && (
              <div className="mt-6">
                {node.children.map((child) => renderSubNodes(child, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
