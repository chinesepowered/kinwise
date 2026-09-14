import { assess } from "./detectors";
import type { WorldState } from "./types";

// The safety rail. Every tool call the Strands agent makes passes through checkToolCall()
// from a BeforeToolCallEvent hook. The model cannot talk its way past these rules.

export interface PolicyDecision {
  allowed: boolean;
  rule: string;
  reason: string;
}

export const MAX_TOOL_CALLS = 12;
const SHAMING = /\b(stupid|foolish|fell for|should have known|careless|gullible|naive|silly|embarrass\w*|how could you)\b/i;

const allow = (rule: string, reason: string): PolicyDecision => ({ allowed: true, rule, reason });
const block = (rule: string, reason: string): PolicyDecision => ({ allowed: false, rule, reason });

export const RULES: { id: string; short: string; text: string }[] = [
  { id: "R1", short: "Family decides on money", text: "Money never moves or unfreezes without the family's decision" },
  { id: "R2", short: "Holds stay on linked charges", text: "Holds and blocks only touch transactions and payees linked to the incident" },
  { id: "R3", short: "Secure money, then alert", text: "Put money on hold before alerting the family" },
  { id: "R4", short: "Evidence threshold", text: "Incidents open only when detectors cross the threshold" },
  { id: "R5", short: "Kind to Ruth", text: "Messages to Ruth are kind and sent only after the family decides" },
];

type Input = Record<string, unknown>;

export function incidentPayees(world: WorldState): string[] {
  const inc = world.incident;
  if (!inc) return [];
  return [...new Set(inc.moneyEventIds.map((id) => world.events.find((e) => e.id === id)?.payee).filter((p): p is string => Boolean(p)))];
}

export function checkToolCall(name: string, raw: unknown, world: WorldState, callsSoFar: number): PolicyDecision {
  if (callsSoFar >= MAX_TOOL_CALLS) return block("R0", `Step cap reached (${MAX_TOOL_CALLS} tool calls per run).`);
  const input = (raw ?? {}) as Input;
  const inc = world.incident;
  const held = inc?.holds.filter((h) => h.status === "held") ?? [];
  const ids = Array.isArray(input.transactionIds) ? (input.transactionIds as string[]) : [];

  switch (name) {
    case "review_activity":
    case "review_incident":
      return allow("R0", "Read-only.");

    case "open_incident": {
      if (inc && inc.status === "open") return block("R4", `Incident ${inc.id} is already open.`);
      const a = assess(world.events);
      if (!a.escalate) return block("R4", `Detector score ${a.score} is below the threshold; keep watching quietly.`);
      return allow("R4", `Detector score ${a.score} ≥ 4 with money at risk.`);
    }

    case "place_hold": {
      if (!inc) return block("R2", "No open incident.");
      const stray = ids.filter((id) => !inc.moneyEventIds.includes(id));
      if (!ids.length || stray.length) return block("R2", `Only linked transactions can be held (${inc.moneyEventIds.join(", ")}). Not linked: ${stray.join(", ") || "none given"}.`);
      return allow("R2", "Protective and reversible: hold on linked transactions.");
    }

    case "draft_message_to_mom": {
      const msg = String(input.message ?? "");
      const hit = msg.match(SHAMING);
      if (hit) return block("R5", `The message must not blame or shame Ruth. Rewrite it without "${hit[0]}".`);
      if (msg.length < 20 || msg.length > 700) return block("R5", "Keep the message between 20 and 700 characters.");
      return allow("R5", "Kind-tone check passed.");
    }

    case "notify_family":
      if (!inc) return block("R3", "No open incident.");
      if (!held.length && inc.status === "open") return block("R3", "Place holds before alerting the family.");
      return allow("R3", "Money is on hold; send the family one decision.");

    case "release_hold": {
      if (!inc) return block("R1", "No incident.");
      if (inc.decision !== "approve") {
        const requested = held.filter((h) => ids.includes(h.eventId));
        const amt = (requested.length ? requested : held).reduce((n, h) => n + h.amount, 0);
        return block("R1", `Releasing $${amt.toLocaleString()} while incident ${inc.id} is open needs Elena's approval. Nothing was released.`);
      }
      return allow("R1", "Elena approved the release.");
    }

    case "cancel_held_transactions":
      if (inc?.decision !== "block") return block("R1", "Only after the family chooses Block.");
      return allow("R1", "Elena chose Block.");

    case "block_payee": {
      if (inc?.decision !== "block") return block("R1", "Only after the family chooses Block.");
      const payees = incidentPayees(world);
      const payee = String(input.payee ?? "");
      if (!payees.includes(payee)) return block("R2", `"${payee}" is not a payee in this incident (payees: ${payees.join(", ") || "none"}).`);
      return allow("R2", "Payee is linked to the incident; Elena chose Block.");
    }

    case "send_message_to_mom":
      if (!inc?.momMessage) return block("R5", "Draft the message first.");
      if (!inc.decision) return block("R5", "Elena decides before anything is sent to Ruth.");
      return allow("R5", "Elena decided; message may be sent.");

    case "close_incident":
      if (!inc?.decision) return block("R1", "The family has not decided yet.");
      return allow("R1", "Family decision recorded.");

    default:
      return block("R0", `Unknown tool ${name}.`);
  }
}
