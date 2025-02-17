
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SavedQATree, SavedResearch } from "./types";

interface QAControlsProps {
  navigationHistory: any[][];
  selectedResearch: string;
  selectedQATree: string;
  savedResearch?: SavedResearch[];
  savedQATrees?: SavedQATree[];
  isAnalyzing: boolean;
  onBack: () => void;
  onResearchSelect: (value: string) => void;
  onQATreeSelect: (value: string) => void;
  onAnalyze: () => Promise<void>;
  onSave: () => Promise<void>;
  qaData: any[];
}

export function QAControls({
  navigationHistory,
  selectedResearch,
  selectedQATree,
  savedResearch,
  savedQATrees,
  isAnalyzing,
  onBack,
  onResearchSelect,
  onQATreeSelect,
  onAnalyze,
  onSave,
  qaData,
}: QAControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
      {navigationHistory.length > 0 && (
        <Button 
          variant="outline" 
          size="sm"
          onClick={onBack}
          className="mb-4 sm:mb-0"
        >
          ← Back to Previous Analysis
        </Button>
      )}
      <div className="flex-1 min-w-[200px] max-w-[300px]">
        <Select
          value={selectedResearch}
          onValueChange={onResearchSelect}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select saved research" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No saved research</SelectItem>
            {savedResearch?.map((research) => (
              <SelectItem key={research.id} value={research.id}>
                {research.query.substring(0, 50)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-w-[200px] max-w-[300px]">
        <Select
          value={selectedQATree}
          onValueChange={onQATreeSelect}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select saved QA tree" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No saved QA tree</SelectItem>
            {savedQATrees?.map((tree) => (
              <SelectItem key={tree.id} value={tree.id}>
                {tree.title.substring(0, 50)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
        <Button 
          onClick={onAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </Button>
        {qaData.length > 0 && !isAnalyzing && (
          <Button onClick={onSave} variant="outline">
            Save Analysis
          </Button>
        )}
      </div>
    </div>
  );
}
