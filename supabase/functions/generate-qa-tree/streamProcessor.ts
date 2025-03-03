
// Helper function for stream processing

export const processStream = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> => {
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          if (abortSignal?.aborted) {
            controller.close();
            break;
          }

          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }

          controller.enqueue(value);
        }
      } catch (error) {
        console.error('Stream processing error:', error);
        controller.error(error);
      }
    }
  });
};
