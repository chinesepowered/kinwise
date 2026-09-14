import { tool } from "@strands-agents/sdk";
import { z } from "zod";
import { assess } from "../detectors";
import { incidentPayees } from "../policy";
import type { RunKind, WorldState } from "../types";

// Strands tools. Each one reads or mutates the world state for this run.
// Amounts and transaction links are always computed here, never taken from the model.

const json = (v: unknown) => JSON.stringify(v);

export function buildTools(world: WorldState, run: RunKind) {
  const incidentOrThrow = (id?: string) => {
    const inc = world.incident;
    if (!inc) throw new Error("No incident exists.");
    if (id && id !== inc.id) throw new Error(`Unknown incident ${id}; the open incident is ${inc.id}.`);
    return inc;
  };
  const eventById = (id: string) => world.events.find((e) => e.id === id);

  const review_activity = tool({
    name: "review_activity",
    description: "Review Ruth's activity so far today: deterministic detector signals, routine events, and the correlated assessment (pattern, score, linked money transactions, amount at risk).",
    inputSchema: z.object({}),
    callback: () => {
      const a = assess(world.events);
      return json({
        now: world.clock,
        routineEvents: a.routineEventIds.map((id) => eventById(id)?.title),
        signals: a.signals.map((s) => ({ eventId: s.eventId, at: s.at, label: s.label, evidence: s.evidence })),
        assessment: { escalate: a.escalate, score: a.score, threshold: 4, pattern: a.pattern, moneyEventIds: a.moneyEventIds, amountAtRisk: a.amountAtRisk },
      });
    },
  });

  const open_incident = tool({
    name: "open_incident",
    description: "Open a scam incident from the current assessment. Linked events and amount at risk are taken from the detectors.",
    inputSchema: z.object({
      pattern: z.string().describe("Scam pattern name, e.g. 'Grandparent scam'"),
      summary: z.string().describe("1-2 plain sentences for a worried adult child"),
      evidence: z.array(z.string()).describe("3-4 short bullets quoting what actually happened, with times"),
    }),
    callback: ({ pattern, summary, evidence }) => {
      const a = assess(world.events);
      const id = "INC-0917";
      world.incident = {
        id,
        pattern,
        summary,
        evidence: evidence.slice(0, 4),
        eventIds: [...new Set(a.signals.map((s) => s.eventId))],
        moneyEventIds: a.moneyEventIds,
        amountAtRisk: a.amountAtRisk,
        holds: [],
        notifications: [],
        blockedPayees: [],
        releaseAttempts: 0,
        status: "open",
      };
      return json({ incidentId: id, moneyEventIds: a.moneyEventIds, amountAtRisk: a.amountAtRisk });
    },
  });

  const place_hold = tool({
    name: "place_hold",
    description: "Place a temporary, reversible hold on money-moving transactions linked to the incident.",
    inputSchema: z.object({ incidentId: z.string(), transactionIds: z.array(z.string()) }),
    callback: ({ incidentId, transactionIds }) => {
      const inc = incidentOrThrow(incidentId);
      for (const tid of transactionIds) {
        const e = eventById(tid);
        if (!e || inc.holds.some((h) => h.eventId === tid)) continue;
        inc.holds.push({ eventId: tid, title: `${e.title} · ${e.detail.split(" · ")[0]}`, amount: e.amount ?? 0, status: "held" });
      }
      const totalHeld = inc.holds.filter((h) => h.status === "held").reduce((n, h) => n + h.amount, 0);
      return json({ held: inc.holds.map((h) => h.eventId), totalHeld });
    },
  });

  const draft_message_to_mom = tool({
    name: "draft_message_to_mom",
    description: "Draft a short, warm, non-shaming message Elena can send to her mother Ruth. Written in Elena's voice.",
    inputSchema: z.object({ incidentId: z.string(), message: z.string() }),
    callback: ({ incidentId, message }) => {
      const inc = incidentOrThrow(incidentId);
      inc.momMessage = message;
      return json({ saved: true });
    },
  });

  const notify_family = tool({
    name: "notify_family",
    description: "Send Elena (Ruth's daughter) a phone notification with one clear decision.",
    inputSchema: z.object({
      incidentId: z.string(),
      headline: z.string().describe("At most 60 characters"),
      whatHappened: z.string().describe("At most 2 plain sentences"),
      recommendedAction: z.string().describe("One sentence: what Elena should do now"),
    }),
    callback: ({ incidentId, headline, whatHappened, recommendedAction }) => {
      const inc = incidentOrThrow(incidentId);
      const n = { id: `n${inc.notifications.length + 1}`, at: world.clock, headline: headline.slice(0, 70), body: whatHappened, action: recommendedAction, urgent: true };
      inc.notifications.push(n);
      return json({ delivered: true, to: "Elena Alvarez", notificationId: n.id });
    },
  });

  const review_incident = tool({
    name: "review_incident",
    description: "Review the open incident: holds, notifications, family decision, and any pending hold-release request from Ruth.",
    inputSchema: z.object({}),
    callback: () => {
      const inc = incidentOrThrow();
      const req = [...world.events].reverse().find((e) => e.category === "hold_release_request");
      return json({
        incidentId: inc.id,
        pattern: inc.pattern,
        status: inc.status,
        amountAtRisk: inc.amountAtRisk,
        holds: inc.holds,
        payees: incidentPayees(world),
        familyDecision: inc.decision ?? "pending",
        pendingReleaseRequest: req ? { eventId: req.id, at: req.at, transactionId: req.targetEventId } : null,
        messageToRuthDrafted: Boolean(inc.momMessage),
      });
    },
  });

  const release_hold = tool({
    name: "release_hold",
    description: "Release held transactions so the money moves. The safety hook decides whether this is allowed.",
    inputSchema: z.object({ incidentId: z.string(), transactionIds: z.array(z.string()) }),
    callback: ({ incidentId, transactionIds }) => {
      const inc = incidentOrThrow(incidentId);
      for (const h of inc.holds) if (transactionIds.includes(h.eventId) && h.status === "held") h.status = "released";
      return json({ released: transactionIds });
    },
  });

  const cancel_held_transactions = tool({
    name: "cancel_held_transactions",
    description: "Cancel every held transaction in the incident so the money never leaves Ruth's accounts.",
    inputSchema: z.object({ incidentId: z.string() }),
    callback: ({ incidentId }) => {
      const inc = incidentOrThrow(incidentId);
      let total = 0;
      for (const h of inc.holds) if (h.status === "held") { h.status = "cancelled"; total += h.amount; }
      return json({ cancelled: inc.holds.filter((h) => h.status === "cancelled").map((h) => h.eventId), totalCancelled: total });
    },
  });

  const block_payee = tool({
    name: "block_payee",
    description: "Block a payee from receiving money from Ruth's accounts.",
    inputSchema: z.object({ incidentId: z.string(), payee: z.string() }),
    callback: ({ incidentId, payee }) => {
      const inc = incidentOrThrow(incidentId);
      if (!inc.blockedPayees.includes(payee)) inc.blockedPayees.push(payee);
      return json({ blocked: inc.blockedPayees });
    },
  });

  const send_message_to_mom = tool({
    name: "send_message_to_mom",
    description: "Send the drafted message to Ruth from Elena.",
    inputSchema: z.object({ incidentId: z.string() }),
    callback: ({ incidentId }) => {
      const inc = incidentOrThrow(incidentId);
      inc.momMessageSent = true;
      return json({ sent: true, message: inc.momMessage });
    },
  });

  const close_incident = tool({
    name: "close_incident",
    description: "Close the incident with a one-sentence outcome. Protected amount is computed from cancelled holds.",
    inputSchema: z.object({ incidentId: z.string(), outcome: z.string() }),
    callback: ({ incidentId, outcome }) => {
      const inc = incidentOrThrow(incidentId);
      inc.protectedAmount = inc.holds.filter((h) => h.status === "cancelled").reduce((n, h) => n + h.amount, 0);
      inc.status = inc.decision === "approve" ? "released" : "resolved";
      inc.outcome = outcome;
      return json({ status: inc.status, protectedAmount: inc.protectedAmount });
    },
  });

  if (run === "triage") return [review_activity, open_incident, place_hold, draft_message_to_mom, notify_family];
  if (run === "release_request") return [review_incident, release_hold, notify_family];
  return [review_incident, cancel_held_transactions, block_payee, release_hold, send_message_to_mom, close_incident];
}
