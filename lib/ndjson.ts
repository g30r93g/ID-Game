/**
 * Newline-delimited JSON: one JSON value per line. Used to stream results to
 * the client as they are produced, e.g. AI-generated scenarios, rather than
 * making it wait for the whole batch.
 */

export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

/** One value as an NDJSON line, newline included. */
export function ndjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/**
 * Yields each value from an NDJSON byte stream as its line completes. A value
 * can arrive split across chunks, and a chunk can hold several; blank lines are
 * skipped, and a final line without a trailing newline still counts.
 */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffered += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      // The last piece is an incomplete line until the stream ends.
      buffered = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line);
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
