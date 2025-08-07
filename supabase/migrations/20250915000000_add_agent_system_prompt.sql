-- Add column for storing custom agent system prompts
ALTER TABLE profiles
ADD COLUMN agent_system_prompt text;
