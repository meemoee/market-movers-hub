-- Add system prompt column to agents table
ALTER TABLE agents
ADD COLUMN system_prompt text;
