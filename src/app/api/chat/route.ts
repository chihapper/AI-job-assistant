import { after } from "next/server";
import { errorResponse, readBody, requireApiAuth } from "@/lib/api";
import { runChatTurn, type ChatEvent } from "@/lib/ai/chat";
import { extractMemoriesForConversation } from "@/lib/ai/memory";

export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  let conversationId = "";
  let message = "";
  try {
    const { fields } = await readBody(req);
    conversationId = fields.conversationId ?? "";
    message = fields.message ?? "";
    if (!conversationId || !message.trim()) return Response.json({ error: "conversationId and message are required" }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client went away
        }
      };
      try {
        await runChatTurn({ conversationId, userText: message, emit, signal: req.signal });
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: err instanceof Error ? err.message : "Unexpected error" });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  after(async () => {
    try {
      await extractMemoriesForConversation(conversationId);
    } catch (err) {
      console.error("memory extraction failed", err);
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
