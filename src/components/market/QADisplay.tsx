
import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QAControls } from './qa/QAControls';
import { QANodeView } from './qa/QANodeView';
import { useQAData } from './qa/useQAData';
import { useStreamingContent } from './qa/useStreamingContent';

interface QADisplayProps {
  marketId: string;
  marketQuestion: string;
  marketDescription: string;
}

export function QADisplay({ marketId, marketQuestion, marketDescription }: QADisplayProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedResearch, setSelectedResearch] = useState<string>('none');
  const [selectedQATree, setSelectedQATree] = useState<string>('none');

  const {
    qaData,
    setQaData,
    currentNodeId,
    setCurrentNodeId,
    expandedNodes,
    setExpandedNodes,
    evaluateQAPair,
    savedResearch,
    savedQATrees,
    getFocusedView,
    handleExpandQuestion,
    saveQATree,
    analyzeQuestion
  } = useQAData(marketId, marketQuestion, marketDescription);

  const {
    streamingContent,
    setStreamingContent
  } = useStreamingContent();

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  return (
    <Card className="p-4 mt-4 bg-card relative">
      <QAControls
        isAnalyzing={isAnalyzing}
        selectedResearch={selectedResearch}
        setSelectedResearch={setSelectedResearch}
        selectedQATree={selectedQATree}
        setSelectedQATree={setSelectedQATree}
        savedResearch={savedResearch}
        savedQATrees={savedQATrees}
        onAnalyze={async () => {
          setIsAnalyzing(true);
          try {
            await analyzeQuestion(marketQuestion);
          } finally {
            setIsAnalyzing(false);
          }
        }}
        onSave={saveQATree}
        showSave={qaData.length > 0}
      />
      <ScrollArea className="h-[500px] pr-4">
        {(getFocusedView() ?? []).map(node => (
          <QANodeView
            key={node.id}
            node={node}
            depth={0}
            currentNodeId={currentNodeId}
            expandedNodes={expandedNodes}
            streamingContent={streamingContent}
            toggleNode={toggleNode}
            evaluateQAPair={evaluateQAPair}
            handleExpandQuestion={handleExpandQuestion}
          />
        ))}
      </ScrollArea>
    </Card>
  );
}
