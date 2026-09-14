import { MODEL_ID, runAgent } from "@/lib/agent/run";
import { rateLimit } from "@/lib/ratelimit";
import type { RunKind, StreamMsg, WorldState } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const RUNS: RunKind[] = ["triage", "release_request", "family_decision"];

export async function GET() {
  return Response.json({ ok: true, agent: "Kinwise", framework: "Strands Agents SDK (TypeScript)", model: MODEL_ID, runs: RUNS });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(ip)) return Response.json({ error: "Too many agent runs, try again in a few minutes." }, { status: 429 });

  let body: { run?: RunKind; state?: WorldState; decision?: "approve" | "block" };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { run, state, decision } = body;
  if (!run || !RUNS.includes(run) || !state || !Array.isArray(state.events) || state.events.length > 100)
    return Response.json({ error: "Expected { run, state }" }, { status: 400 });
  if (decision && decision !== "approve" && decision !== "block") return Response.json({ error: "Bad decision" }, { status: 400 });

  const world: WorldState = structuredClone(state);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (m: StreamMsg) => controller.enqueue(enc.encode(JSON.stringify(m) + "\n"));
      const t0 = Date.now();
      let calls = 0;
      emit({ type: "run", run, model: MODEL_ID });
      try {
        calls = await runAgent(run, world, decision, emit);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        emit({ type: "state", state: world });
        emit({ type: "done", ms: Date.now() - t0, toolCalls: calls });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
