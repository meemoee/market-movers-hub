
import React, { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

const formSchema = z.object({
  openrouterApiKey: z.string().optional(),
  agentSystemPrompt: z.string().optional(),
});

type AccountSettingsProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AccountSettings({ isOpen, onClose }: AccountSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      openrouterApiKey: "",
      agentSystemPrompt: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      loadUserSettings();
    }
  }, [isOpen]);

  const loadUserSettings = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("openrouter_api_key, agent_system_prompt")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;
        
        if (data?.openrouter_api_key) {
          form.setValue("openrouterApiKey", data.openrouter_api_key);
          setHasApiKey(true);
        } else {
          setHasApiKey(false);
        }
        if (data?.agent_system_prompt) {
          form.setValue("agentSystemPrompt", data.agent_system_prompt);
        }
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");

      let apiKeyValue = values.openrouterApiKey?.trim();
      let agentPromptValue = values.agentSystemPrompt?.trim();
      
      // If the API key field is empty and user already has a key, ask for confirmation
      if (!apiKeyValue && hasApiKey) {
        if (!confirm("Are you sure you want to remove your API key?")) {
          setIsSaving(false);
          return;
        }
      }

      // If API key is provided, validate it (simple validation for now)
      if (apiKeyValue) {
        if (!apiKeyValue.startsWith("sk-") && !confirm("This doesn't look like a valid OpenRouter API key. Continue anyway?")) {
          setIsSaving(false);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          openrouter_api_key: apiKeyValue || null,
          agent_system_prompt: agentPromptValue || null,
        })
        .eq("id", session.user.id);

      if (error) throw error;
      
      toast.success("Settings saved successfully");
      setHasApiKey(!!apiKeyValue);
      onClose();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleShowApiKey = () => {
    setShowApiKey(!showApiKey);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>
            Configure your personal settings and API keys
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="openrouterApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenRouter API Key</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          placeholder="Enter your OpenRouter API key"
                          type={showApiKey ? "text" : "password"}
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2"
                        onClick={toggleShowApiKey}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hasApiKey 
                        ? "You already have an API key set. Leave empty to remove it." 
                        : "Add your personal OpenRouter API key to use for AI functionality"}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
                />

                <FormField
                  control={form.control}
                  name="agentSystemPrompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Agent Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional system prompt additions for analysis agents"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        These instructions will be appended to the default system prompt.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span>
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
