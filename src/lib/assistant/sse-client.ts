/**
 * Reading the assistant's server-sent events in the browser. Pure, so it is
 * tested without a browser (sse-client.test.ts).
 */

export type ChatSource = { label: string; href?: string };

export type ServerEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "tool_error"; tool: string; message: string }
  | { type: "navigate"; href: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Split a growing text buffer into complete server-sent events.
 * Returns the events found and whatever partial text is left for next time.
 */
export function parseSseBuffer(buffer: string): { events: ServerEvent[]; rest: string } {
  const events: ServerEvent[] = [];
  // Events are separated by a blank line. The last piece may be incomplete.
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.type === "string") events.push(parsed as ServerEvent);
    } catch {
      // A malformed line is skipped rather than breaking the whole answer.
    }
  }
  return { events, rest };
}

