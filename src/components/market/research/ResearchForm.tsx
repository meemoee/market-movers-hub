
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Mail, Loader2 } from "lucide-react";

interface ResearchFormProps {
  onStartResearch: (focusText: string, maxIterations: number, notifyByEmail: boolean, notificationEmail: string) => void;
  isLoading: boolean;
}

export function ResearchForm({ onStartResearch, isLoading }: ResearchFormProps) {
  const [focusText, setFocusText] = useState<string>('');
  const [maxIterations, setMaxIterations] = useState<string>("3");
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');

  const handleSubmit = () => {
    onStartResearch(
      focusText, 
      parseInt(maxIterations, 10),
      notifyByEmail,
      notificationEmail
    );
  };

  return (
    <div className="flex flex-col space-y-4 w-full">
      <div className="flex items-center gap-2 w-full">
        <Input
          placeholder="Add an optional focus area for your research..."
          value={focusText}
          onChange={(e) => setFocusText(e.target.value)}
          disabled={isLoading}
          className="flex-1"
        />
      </div>
      
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
    
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="notify-email" 
            checked={notifyByEmail} 
            onCheckedChange={(checked) => setNotifyByEmail(checked === true)}
          />
          <Label htmlFor="notify-email" className="cursor-pointer">
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
              className="flex-1"
            />
          </div>
        )}
        
        <Button 
          onClick={handleSubmit} 
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
