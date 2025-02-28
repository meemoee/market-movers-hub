
interface Message {
  role: string;
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// Transform raw stream data into proper SSE format
export async function openaiStream(params: OpenAIRequest): Promise<ReadableStream> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable not set");
  }

  // Ensure stream is enabled
  params.stream = true;

  console.log(`Making request to OpenRouter with model: ${params.model}`);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://hunchex.io",
      "X-Title": "Hunchex",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenRouter API error (${response.status}):`, errorText);
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  // Return a stream that transforms the OpenAI stream into the format we need
  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      function push() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // Signal the end of the stream
            controller.enqueue(`data: [DONE]\n\n`);
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
            
            // Forward the data event
            controller.enqueue(trimmedLine + "\n\n");
          }
          
          push();
        }).catch((err) => {
          console.error("Stream reading error:", err);
          controller.error(err);
        });
      }
      
      // Start reading
      push();
    },
  });
}
