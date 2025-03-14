
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LoaderCircle } from "lucide-react";

interface JobQueueResearchCardProps {
  marketId: string;
  question: string;
  onSuccess?: (jobId: string) => void;
}

export function JobQueueResearchCard({ marketId, question, onSuccess }: JobQueueResearchCardProps) {
  const [query, setQuery] = useState(question);
  const [focusText, setFocusText] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      toast.error("Please enter a research question");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-research-job', {
        body: {
          marketId,
          query: query.trim(),
          focusText: focusText.trim(),
          maxIterations: 3
        }
      });
      
      if (error) {
        console.error('Error creating research job:', error);
        toast.error('Failed to create research job');
        return;
      }
      
      toast.success('Research job created successfully');
      if (onSuccess && data?.job?.id) {
        onSuccess(data.job.id);
      }
      
      // Reset form
      setQuery(question);
      setFocusText("");
      
    } catch (error) {
      console.error('Error submitting research job:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold">Create Research Job</CardTitle>
        <CardDescription>
          Submit a request for in-depth research on this market. The system will automatically search and analyze relevant information.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query">Research Question</Label>
            <Textarea
              id="query"
              placeholder="What do you want to research about this market?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-20"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="focus">Focus Area (Optional)</Label>
            <Input
              id="focus"
              placeholder="Specific aspect to focus on (e.g., 'recent developments', 'expert opinions')"
              value={focusText}
              onChange={(e) => setFocusText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Narrow your research to a specific aspect of the question
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Research Job'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
