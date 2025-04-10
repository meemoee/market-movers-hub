import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, Settings } from "lucide-react";
import { useResearchJobForm } from "@/hooks/research/useResearchJobForm"; // Import the hook

interface ResearchJobFormProps {
  marketId: string;
  description: string; // Used as the initial query for the job
  onJobCreated: (jobId: string) => void; // Callback when job is successfully created
}

export function ResearchJobForm({ marketId, description, onJobCreated }: ResearchJobFormProps) {
  const {
    focusText,
    setFocusText,
    maxIterations,
    setMaxIterations,
    notifyByEmail,
    setNotifyByEmail,
    notificationEmail,
    setNotificationEmail,
    isLoading,
    error, // Can optionally display this error
    submitResearchJob,
  } = useResearchJobForm({ marketId, description, onJobCreated });

  const handleStartResearch = () => {
    // The hook's submit function handles validation and API call
    submitResearchJob();
  };

  return (
    <div className="flex flex-col space-y-4 w-full">
      {/* Optional Focus Area Input */}
      <div className="flex items-center gap-2 w-full">
        <Input
          placeholder="Add an optional focus area for your research..."
          value={focusText}
          onChange={(e) => setFocusText(e.target.value)}
          disabled={isLoading}
          className="flex-1"
        />
      </div>

      {/* Iterations Selector */}
      <div className="flex flex-col space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <Label>Iterations</Label>
        </div>
        <Select
          value={maxIterations}
          onValueChange={setMaxIterations}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Number of iterations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 iteration</SelectItem>
            <SelectItem value="2">2 iterations</SelectItem>
            <SelectItem value="3">3 iterations (default)</SelectItem>
            <SelectItem value="4">4 iterations</SelectItem>
            <SelectItem value="5">5 iterations</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          More iterations provide deeper research but take longer to complete.
        </p>
      </div>

      {/* Email Notification Section */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="notify-email-form" // Use unique ID if needed
            checked={notifyByEmail}
            onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
            disabled={isLoading}
          />
          <Label htmlFor="notify-email-form" className="cursor-pointer">
            Notify me by email when research is complete
          </Label>
        </div>

        {notifyByEmail && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="Enter your email address"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
          </div>
        )}

        {/* Display error from the hook if needed */}
        {error && (
           <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleStartResearch}
          disabled={isLoading || (notifyByEmail && !notificationEmail.trim())}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Starting...
            </>
          ) : (
            "Start Background Research"
          )}
        </Button>
      </div>
    </div>
  );
}
