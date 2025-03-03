
export function processStream(response: Response): ReadableStream<Uint8Array> {
  // The function processes a stream from an API response
  // and returns it in a format suitable for client consumption
  return response.body || new ReadableStream();
}

export function formatStreamResponse(streamData: ReadableStream<Uint8Array>): Response {
  // Return the stream directly with appropriate headers
  return new Response(streamData, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}

// Export functions to ensure they're available
export const streamProcessor = {
  processStream,
  formatStreamResponse
};
