import { describe, expect, test } from "vitest";
import { ndjsonLine, readNdjson } from "./ndjson";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const values: unknown[] = [];
  for await (const value of readNdjson(body)) values.push(value);
  return values;
}

describe("ndjsonLine", () => {
  test("writes one JSON value and a newline", () => {
    expect(ndjsonLine({ description: "a\nb" })).toBe(
      '{"description":"a\\nb"}\n',
    );
  });
});

describe("readNdjson", () => {
  test("reads each line as a value", async () => {
    const body = streamOf(ndjsonLine({ a: 1 }) + ndjsonLine({ b: 2 }));
    expect(await collect(body)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("joins a value split across chunks", async () => {
    const body = streamOf('{"description":"Most li', 'kely to"}\n{"x"', ":1}\n");
    expect(await collect(body)).toEqual([
      { description: "Most likely to" },
      { x: 1 },
    ]);
  });

  test("joins a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode('{"s":"’"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ s: "’" }]);
  });

  test("keeps a last line with no trailing newline", async () => {
    expect(await collect(streamOf('{"a":1}\n{"error":"boom"}'))).toEqual([
      { a: 1 },
      { error: "boom" },
    ]);
  });

  test("skips blank lines and reads an empty stream as nothing", async () => {
    expect(await collect(streamOf("\n", '{"a":1}\n\n'))).toEqual([{ a: 1 }]);
    expect(await collect(streamOf())).toEqual([]);
  });
});
