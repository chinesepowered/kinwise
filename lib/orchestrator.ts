import { assess, detect, linkedToIncident } from "./detectors";
import { money } from "./scenario";
import type { ActivityEvent, RunKind, WorldState } from "./types";

// Deterministic "quiet mode". Runs on every new event with no model call.
// It only returns a trigger (wake the Strands agent) when a human-relevant decision is near.

export type LogTone = "routine" | "signal" | "policy" | "trigger";

export interface SweepLog {
  id: string;
  at: string;
  eventId: string;
  tone: LogTone;
  text: string;
}

export interface IngestResult {
  state: WorldState;
  logs: SweepLog[];
  trigger?: RunKind;
  mark: "routine" | "signal" | "linked" | "request";
}

let seq = 0;
const log = (e: ActivityEvent, tone: LogTone, text: string): SweepLog => ({ id: `l${++seq}`, at: e.at, eventId: e.id, tone, text });

export function ingest(prev: WorldState, event: ActivityEvent): IngestResult {
  const state: WorldState = structuredClone(prev);
  state.events.push(event);
  state.clock = event.at;
  const inc = state.incident;
  const logs: SweepLog[] = [];

  if (event.category === "hold_release_request") {
    if (inc?.status === "open") {
      logs.push(log(event, "trigger", `Ruth asked the bank to release a held wire → waking the Strands agent`));
      return { state, logs, trigger: "release_request", mark: "request" };
    }
    logs.push(log(event, "routine", "Release request with no open incident · no action"));
    return { state, logs, mark: "routine" };
  }

  const linked = linkedToIncident(event, inc, state.events);
  if (inc && linked.length) {
    if (!inc.eventIds.includes(event.id)) inc.eventIds.push(event.id);
    for (const s of linked) {
      if (s.money && !inc.holds.some((h) => h.eventId === event.id)) {
        const amount = event.amount ?? 0;
        inc.moneyEventIds.push(event.id);
        inc.amountAtRisk += amount;
        inc.holds.push({ eventId: event.id, title: `${event.title} · ${event.payee ?? event.detail}`, amount, status: "held" });
        const total = inc.holds.filter((h) => h.status === "held").reduce((n, h) => n + h.amount, 0);
        inc.notifications.push({
          id: `n${inc.notifications.length + 1}`,
          at: event.at,
          headline: `Another ${money(amount)} is on hold`,
          body: `A ${event.title.toLowerCase()} to ${event.payee} is part of the same scam. Kinwise held it automatically. Total on hold: ${money(total)}.`,
          action: "Nothing leaves Mom's account until you decide.",
          urgent: false,
        });
        logs.push(log(event, "policy", `${s.label} · linked to ${inc.id} · held by policy, no model call`));
      } else {
        logs.push(log(event, "signal", `${s.label} · linked to ${inc.id}`));
      }
    }
    return { state, logs, mark: "linked" };
  }

  const mine = detect([event]);
  if (!mine.length) {
    logs.push(log(event, "routine", `Routine · no action`));
    return { state, logs, mark: "routine" };
  }
  for (const s of mine) logs.push(log(event, "signal", s.label));
  if (inc) return { state, logs, mark: "signal" };

  const a = assess(state.events);
  if (a.escalate && mine.some((s) => s.money)) {
    logs.push(log(event, "trigger", `Risk score ${a.score} ≥ 4 with ${money(a.amountAtRisk)} at risk → waking the Strands agent`));
    return { state, logs, trigger: "triage", mark: "signal" };
  }
  logs.push(log(event, "signal", `Watching · risk score ${a.score} of 4`));
  return { state, logs, mark: "signal" };
}

export const emptyWorld = (): WorldState => ({ clock: "07:00", events: [] });
