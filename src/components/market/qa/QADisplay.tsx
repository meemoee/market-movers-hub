
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Components as MarkdownComponents } from 'react-markdown';
import { QAControls } from './QAControls';
import { QANodeView } from './QANodeView';
import { QADisplayProps, QANode } from './types';
import { useQAData } from './useQAData';
import { useStreamingContent } from './useStreamingContent';

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const {
    qaData,
    setQaData,
    rootExtensions,
    setRootExtensions,
    navigationHistory,
    savedResearch,
    savedQATrees,
    saveQATree,
    navigateToExtension,
    navigateBack
  } = useQAData(marketId);

  const {
    streamingContent,
    setStreamingContent,
    currentNodeId,
    setCurrentNodeId,
    expandedNodes,
    setExpandedNodes,
    toggleNode,
    cleanStreamContent
  } = useStreamingContent();

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

  const getPreviewText = (text: string | undefined) => {
    if (!text) return '';
    const strippedText = text.replace(/[#*`_]/g, '');
    const preview = strippedText.slice(0, 150);
    return preview.length < strippedText.length ? `${preview}...` : preview;
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <QAControls
        navigationHistory={navigationHistory}
        selectedResearch={selectedResearch}
        selectedQATree={selectedQATree}
        savedResearch={savedResearch}
        savedQATrees={savedQATrees}
        isAnalyzing={isAnalyzing}
        onBack={navigateBack}
        onResearchSelect={setSelectedResearch}
        onQATreeSelect={(value) => {
          setSelectedQATree(value);
          setNavigationHistory([]);
          if (value !== 'none') {
            const tree = savedQATrees?.find(t => t.id === value);
            if (tree) {
              loadSavedQATree(tree.tree_data);
            }
          }
        }}
        onAnalyze={async () => {
          setIsAnalyzing(true);
          setQaData([]);
          setStreamingContent({});
          setExpandedNodes(new Set());
          try {
            await analyzeQuestion(marketQuestion);
          } finally {
            setIsAnalyzing(false);
            setCurrentNodeId(null);
          }
        }}
        onSave={saveQATree}
        qaData={qaData}
      />
      <ScrollArea className="h-[500px] pr-4">
        {qaData.map(node => (
          <QANodeView
            key={node.id}
            node={node}
            depth={0}
            isStreaming={currentNodeId === node.id}
            streamContent={streamingContent[node.id]}
            isExpanded={expandedNodes.has(node.id)}
            onToggle={toggleNode}
            onExpandQuestion={handleExpandQuestion}
            markdownComponents={markdownComponents}
            nodeExtensions={rootExtensions.filter(ext => ext.originalNodeId === node.id)}
            onNavigateToExtension={navigateToExtension}
            getPreviewText={getPreviewText}
          />
        ))}
      </ScrollArea>
    </Card>
  );
}
