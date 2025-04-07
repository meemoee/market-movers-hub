
export class OpenRouter {
  private readonly apiKey: string;
  private readonly baseUrl: string = "https://openrouter.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(
    model: string,
    messages: { role: string; content: string }[],
    maxTokens: number = 800,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://lovable.app",
          "X-Title": "Lovable Deep Research",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${error}`);
      }

      const data = await response.json();
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response format from OpenRouter");
      }

      return data.choices[0].message.content || "";
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      throw error;
    }
  }

  async streamComplete(
    model: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => Promise<void>,
    maxTokens: number = 800,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://lovable.app",
          "X-Title": "Lovable Deep Research",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${error}`);
      }

      if (!response.body) {
        throw new Error("No response body from OpenRouter");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode the chunk
        const chunk = decoder.decode(value);
        buffer += chunk;

        // Process any complete lines in the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          const data = line.substring(6); // Remove "data: " prefix

          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices[0]) {
              const content = parsed.choices[0].delta?.content || "";
              if (content) {
                fullText += content;
                await onChunk(content);
              }
            }
          } catch (e) {
            console.error("Error parsing chunk:", e);
            // Continue processing chunks
          }
        }
      }

      return fullText;
    } catch (error) {
      console.error("Error streaming from OpenRouter:", error);
      throw error;
    }
  }
}
