import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Settings, Mail } from "lucide-react";

interface ResearchJobFormProps {
  isLoading: boolean;
  onStartResearch: (focusText: string, maxIterations: string, notify: boolean, email: string) => void;
  initialFocusText?: string;
  initialMaxIterations?: string;
  initialNotifyByEmail?: boolean;
  initialNotificationEmail?: string;
}

export function ResearchJobForm({
  isLoading,
  onStartResearch,
  initialFocusText = '',
  initialMaxIterations = "3",
  initialNotifyByEmail = false,
  initialNotificationEmail = '',
}: ResearchJobFormProps) {
  const [focusText, setFocusText] = useState<string>(initialFocusText);
  const [maxIterations, setMaxIterations] = useState<string>(initialMaxIterations);
  const [notifyByEmail, setNotifyByEmail] = useState<boolean>(initialNotifyByEmail);
  const [notificationEmail, setNotificationEmail] = useState<string>(initialNotificationEmail);

  const handleStartClick = () => {
    onStartResearch(focusText, maxIterations, notifyByEmail, notificationEmail);
  };

  return (
    <>
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
              id="notify-email-form" // Changed ID to avoid conflict if rendered multiple times
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

          <Button
            onClick={handleStartClick}
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
    </>
  );
}
