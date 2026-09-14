import { AfterToolCallEvent, Agent, BeforeToolCallEvent, ModelMessageEvent } from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { checkToolCall } from "../policy";
import type { RunKind, StreamMsg, WorldState } from "../types";
import { buildTools } from "./tools";

export const MODEL_ID = process.env.OPENAI_MODEL ?? "Qwen/Qwen3.8-27B";

const SYSTEM = `You are Kinwise, a Strands agent that quietly watches over Ruth Alvarez (81, lives alone in Tucson) on behalf of her daughter Elena.
Deterministic detectors have already scanned Ruth's bank, card, phone and email activity. You only run when they escalate.
Rules:
- Do all work through tools. Never invent facts, times, amounts or transaction ids; use what the tools return.
- Follow the numbered steps in the task, in order, one tool call per step.
- A safety hook checks every tool call. If a call is blocked, do not retry it; carry on with the next step and mention the block.
- Notifications go to Elena, so refer to Ruth as "your mom". Be calm, plain and specific, no jargon.
- Never blame or shame Ruth; scammers are professionals. Never claim facts nobody has verified (for example, that Danny is fine).
- Final reply: one short sentence.`;

function taskFor(run: RunKind, decision?: "approve" | "block") {
  if (run === "triage")
    return `New activity crossed the escalation threshold. Steps:
1. review_activity.
2. open_incident with the pattern name, a 1-2 sentence plain summary, and 3-4 short evidence bullets (with times) quoting what happened.
3. place_hold on every transaction id in assessment.moneyEventIds.
4. draft_message_to_mom: 2-3 warm sentences in Elena's voice. Tell Ruth she did nothing wrong, that the calls were a known scam that uses a grandchild's name, that Elena will check on Danny herself, and ask her not to send anything and to pick up when Elena calls.
5. notify_family: headline (max 60 chars), whatHappened (max 2 sentences, include the amount on hold), recommendedAction (one sentence).`;
  if (run === "release_request")
    return `Ruth just used her banking app to ask for a held transaction to be released. The scammer is probably still on the phone with her. Steps:
1. review_incident.
2. release_hold for the incident with the transaction id from pendingReleaseRequest. The safety hook will decide whether that is allowed.
3. notify_family with an urgent update: what your mom just tried to do, whether the money is still safe, and that Elena should call her right now.`;
  if (decision === "approve")
    return `Elena reviewed the incident and chose APPROVE: she confirmed the payments are legitimate. Steps:
1. review_incident.
2. release_hold for the incident with every held transaction id.
3. close_incident with a one-sentence outcome.`;
  return `Elena reviewed the incident and chose BLOCK & CALL MOM. Steps:
1. review_incident.
2. cancel_held_transactions.
3. block_payee for each name in payees (skip if payees is empty).
4. send_message_to_mom.
5. close_incident with a one-sentence outcome.`;
}

const clean = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

export async function runAgent(run: RunKind, world: WorldState, decision: "approve" | "block" | undefined, emit: (m: StreamMsg) => void) {
  if (run === "family_decision") {
    if (!world.incident || !decision) throw new Error("family_decision needs an incident and a decision");
    world.incident.decision = decision; // recorded by the app from Elena's tap, not by the model
  }

  const model = new OpenAIModel({
    api: "chat",
    apiKey: process.env.OPENAI_API_KEY,
    modelId: MODEL_ID,
    clientConfig: { baseURL: process.env.OPENAI_BASE_URL, timeout: 60_000, maxRetries: 2 },
    temperature: 0,
    maxTokens: 1500,
  });
  const agent = new Agent({ model, tools: buildTools(world, run), systemPrompt: SYSTEM, printer: false });

  let calls = 0;
  agent.addHook(BeforeToolCallEvent, (e) => {
    const { name, toolUseId, input } = e.toolUse;
    const d = checkToolCall(name, input, world, calls++);
    emit({ type: "tool", id: toolUseId, name, input });
    emit({ type: "hook", id: toolUseId, tool: name, allowed: d.allowed, rule: d.rule, reason: d.reason });
    if (!d.allowed) {
      if (name === "release_hold" && world.incident) world.incident.releaseAttempts++;
      e.cancel = `BLOCKED by Kinwise safety hook (${d.rule}): ${d.reason}`;
    }
  });
  agent.addHook(AfterToolCallEvent, (e) => {
    const content = e.result.content as unknown as Array<{ text?: string; json?: unknown }>;
    const text = content.map((c) => c.text ?? JSON.stringify(c.json ?? c)).join(" ");
    emit({ type: "tool_result", id: e.toolUse.toolUseId, name: e.toolUse.name, ok: e.result.status === "success" && !e.error, summary: text.slice(0, 400) });
    emit({ type: "state", state: world });
  });
  agent.addHook(ModelMessageEvent, (e) => {
    const text = clean(
      e.message.content
        .map((b) => (b.type === "textBlock" ? b.text : ""))
        .join(" "),
    );
    if (text) emit({ type: "say", text });
  });

  await agent.invoke(taskFor(run, decision));
  return calls;
}
