
import React from 'react';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SavedResearch, SavedQATree } from './types';

interface QAControlsProps {
  isAnalyzing: boolean;
  selectedResearch: string;
  setSelectedResearch: (value: string) => void;
  selectedQATree: string;
  setSelectedQATree: (value: string) => void;
  savedResearch?: SavedResearch[];
  savedQATrees?: SavedQATree[];
  onAnalyze: () => void;
  onSave: () => void;
  showSave: boolean;
}

export function QAControls({
  isAnalyzing,
  selectedResearch,
  setSelectedResearch,
  selectedQATree,
  setSelectedQATree,
  savedResearch,
  savedQATrees,
  onAnalyze,
  onSave,
  showSave
}: QAControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
      <div className="flex-1 min-w-[200px] max-w-[300px]">
        <Select
          value={selectedResearch}
          onValueChange={setSelectedResearch}
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
          onValueChange={setSelectedQATree}
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
        {showSave && !isAnalyzing && (
          <Button onClick={onSave} variant="outline">
            Save Analysis
          </Button>
        )}
      </div>
    </div>
  );
}
