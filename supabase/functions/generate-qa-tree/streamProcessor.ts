
// Stream processor for handling streaming responses
export function processStream(response: Response): ReadableStream<Uint8Array> {
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send a "done" message and close the stream
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.trim() !== "") {
              // Format the line as an SSE event
              controller.enqueue(encoder.encode(`data: ${line}\n\n`));
            }
          }
        }
      } catch (error) {
        console.error("Error processing stream:", error);
        controller.error(error);
      }
    },
    
    async cancel() {
      await reader.cancel();
    }
  });
}
