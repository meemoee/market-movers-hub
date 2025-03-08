
/**
 * OpenRouter API client for Deno
 */
export class OpenRouter {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Complete a prompt using the specified model
   * @param model Model to use for completion
   * @param messages Array of messages for the conversation
   * @param maxTokens Maximum tokens to generate
   * @param temperature Sampling temperature (higher = more creative)
   * @returns Completion text
   */
  async complete(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number = 1000,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      console.log(`Making request to OpenRouter with model: ${model}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app',
          'X-Title': 'Market Research App'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error: ${response.status}`, errorText);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        console.error('No choices returned from OpenRouter API', data);
        throw new Error('No completion choices returned');
      }

      const content = data.choices[0].message?.content || '';
      console.log(`Received response from OpenRouter (${content.length} chars)`);
      
      return content;
    } catch (error) {
      console.error('Error making request to OpenRouter:', error);
      throw error;
    }
  }

  /**
   * Stream completion from OpenRouter
   * @param model Model to use
   * @param messages Messages for conversation
   * @param onChunk Callback for each chunk
   * @param maxTokens Maximum tokens
   * @param temperature Sampling temperature
   */
  async streamComplete(
    model: string,
    messages: Array<{ role: string; content: string }>,
    onChunk: (text: string) => void,
    maxTokens: number = 1000,
    temperature: number = 0.7
  ): Promise<void> {
    try {
      console.log(`Making streaming request to OpenRouter with model: ${model}`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hunchex.app',
          'X-Title': 'Market Research App'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenRouter API error: ${response.status}`, errorText);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = '';
      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
          
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.substring(6));
              if (isFirstChunk) {
                isFirstChunk = false;
                // Sometimes the first chunk contains the entire system message
                // which we don't want to send to the client
                continue;
              }
              
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                onChunk(content);
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      }
      
      console.log('Streaming completed from OpenRouter');
    } catch (error) {
      console.error('Error streaming from OpenRouter:', error);
      throw error;
    }
  }
}
