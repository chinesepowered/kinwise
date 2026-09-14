import type { ActivityEvent, Incident, Signal } from "./types";

// Deterministic scam-pattern detectors. No model involved: these run on every new event,
// and the Strands agent is only woken up when they cross the escalation threshold.

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const FAMILY = /\b(grandma|grandpa|nana|papa|grandson|granddaughter|it'?s me)\b/i;
const DISTRESS = /\b(accident|jail|arrest(ed)?|holding me|bail|hospital|lawyer|attorney|in trouble)\b/i;
const SECRECY = /(don'?t tell|do not tell|gag order|keep (this|it) (between us|secret)|tell no one)/i;
const PAY_INSTRUCTIONS = /\b(gift ?cards?|scratch|photos? of|pin|codes?|bitcoin|crypto|wire|cash app|zelle)\b/i;
const GOVERNMENT = /\b(irs|social security|ssa|medicare|u\.?s\.? marshals?)\b/i;
const THREAT = /\b(arrest|warrant|suspend(ed)?|immediately|lawsuit)\b/i;
const TECH_ALARM = /\b(virus|infected|hacked|microsoft support|apple support|refund department)\b/i;

const quote = (s = "", n = 90) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
const isMessage = (e: ActivityEvent) => e.kind === "text" || e.kind === "email";

interface Detector {
  id: string;
  label: string;
  weight: number;
  money: boolean;
  test: (e: ActivityEvent) => string | null;
}

export const DETECTORS: Detector[] = [
  {
    id: "unknown_long_call",
    label: "Long call from an unknown number",
    weight: 1,
    money: false,
    test: (e) =>
      e.kind === "call" && !e.contactKnown && (e.durationMin ?? 0) >= 5
        ? `${e.durationMin}-minute call from ${e.from}${e.callerId ? ` (caller ID "${e.callerId}")` : ""}, not in Ruth's contacts`
        : null,
  },
  {
    id: "family_emergency_script",
    label: "Family-emergency script from a new number",
    weight: 3,
    money: false,
    test: (e) =>
      isMessage(e) && !e.contactKnown && e.body && FAMILY.test(e.body) && DISTRESS.test(e.body) && SECRECY.test(e.body)
        ? `Text from ${e.from}: "${quote(e.body)}"`
        : null,
  },
  {
    id: "payment_instructions",
    label: "Asked for gift-card codes, with secrecy",
    weight: 3,
    money: false,
    test: (e) =>
      isMessage(e) && !e.contactKnown && e.body && PAY_INSTRUCTIONS.test(e.body) && SECRECY.test(e.body)
        ? `Text from ${e.from}: "${quote(e.body)}"`
        : null,
  },
  {
    id: "government_impersonation",
    label: "Government impersonation threat",
    weight: 3,
    money: false,
    test: (e) =>
      isMessage(e) && !e.contactKnown && e.body && GOVERNMENT.test(e.body) && THREAT.test(e.body)
        ? `Message from ${e.from}: "${quote(e.body)}"`
        : null,
  },
  {
    id: "tech_support_alarm",
    label: "Tech-support alarm from unknown sender",
    weight: 2,
    money: false,
    test: (e) => (isMessage(e) && !e.contactKnown && e.body && TECH_ALARM.test(e.body) ? `Message from ${e.from}: "${quote(e.body)}"` : null),
  },
  {
    id: "remote_access_install",
    label: "Remote-access app installed",
    weight: 3,
    money: false,
    test: (e) => (e.category === "remote_access" ? `${e.title} installed on Ruth's computer` : null),
  },
  {
    id: "new_payee",
    label: "New payee added",
    weight: 1,
    money: false,
    test: (e) => (e.category === "payee_added" ? `New payee "${e.payee}" added at ${e.at}` : null),
  },
  {
    id: "gift_card_purchase",
    label: "Large gift-card purchase",
    weight: 2,
    money: true,
    test: (e) => (e.category === "gift_cards" && (e.amount ?? 0) >= 250 ? `$${e.amount} of gift cards at ${e.title}` : null),
  },
  {
    id: "wire_to_new_payee",
    label: "Wire to a payee added minutes earlier",
    weight: 2,
    money: true,
    test: (e) =>
      e.category === "wire" && (e.amount ?? 0) >= 1000 && e.payeeAddedAt && toMinutes(e.at) - toMinutes(e.payeeAddedAt) <= 24 * 60
        ? `$${e.amount} wire to "${e.payee}", a payee added at ${e.payeeAddedAt}`
        : null,
  },
  {
    id: "crypto_atm_deposit",
    label: "Crypto ATM deposit",
    weight: 3,
    money: true,
    test: (e) => (e.category === "crypto_atm" && (e.amount ?? 0) >= 300 ? `$${e.amount} deposited at ${e.title}` : null),
  },
];

export function detect(events: ActivityEvent[]): Signal[] {
  const out: Signal[] = [];
  for (const e of events) {
    for (const d of DETECTORS) {
      const evidence = d.test(e);
      if (evidence) out.push({ id: `${d.id}:${e.id}`, detector: d.id, label: d.label, eventId: e.id, at: e.at, weight: d.weight, money: d.money, evidence });
    }
  }
  return out;
}

export const WINDOW_MIN = 180;
export const ESCALATION_SCORE = 4;

export function classify(detectorIds: Set<string>): string {
  if (detectorIds.has("family_emergency_script")) return "Grandparent scam (family-emergency impersonation)";
  if (detectorIds.has("government_impersonation")) return "Government impersonation scam";
  if (detectorIds.has("tech_support_alarm") || detectorIds.has("remote_access_install")) return "Tech-support scam";
  if (detectorIds.has("crypto_atm_deposit")) return "Crypto ATM payment scam";
  return "Payment-pressure scam";
}

export interface Assessment {
  signals: Signal[];
  routineEventIds: string[];
  score: number;
  escalate: boolean;
  pattern: string;
  moneyEventIds: string[];
  amountAtRisk: number;
}

// Correlates signals inside a time window ending at the latest money-moving signal.
export function assess(events: ActivityEvent[]): Assessment {
  const signals = detect(events);
  const flagged = new Set(signals.map((s) => s.eventId));
  const routineEventIds = events.filter((e) => !flagged.has(e.id) && e.category !== "hold_release_request").map((e) => e.id);
  const lastMoney = [...signals].reverse().find((s) => s.money);
  if (!lastMoney) return { signals, routineEventIds, score: 0, escalate: false, pattern: "", moneyEventIds: [], amountAtRisk: 0 };
  const end = toMinutes(lastMoney.at);
  const inWindow = signals.filter((s) => toMinutes(s.at) <= end && end - toMinutes(s.at) <= WINDOW_MIN);
  const score = inWindow.reduce((n, s) => n + s.weight, 0);
  const hasContact = inWindow.some((s) => !s.money);
  const moneyEventIds = [...new Set(inWindow.filter((s) => s.money).map((s) => s.eventId))];
  const amountAtRisk = moneyEventIds.reduce((n, id) => n + (events.find((e) => e.id === id)?.amount ?? 0), 0);
  return {
    signals: inWindow,
    routineEventIds,
    score,
    escalate: hasContact && score >= ESCALATION_SCORE,
    pattern: classify(new Set(inWindow.map((s) => s.detector))),
    moneyEventIds,
    amountAtRisk,
  };
}

// After an incident is open, a new flagged event within the window is linked to it without asking the model.
export function linkedToIncident(event: ActivityEvent, incident: Incident | undefined, events: ActivityEvent[]): Signal[] {
  if (!incident || incident.status !== "open") return [];
  const first = events.find((e) => e.id === incident.eventIds[0]);
  if (!first || toMinutes(event.at) - toMinutes(first.at) > WINDOW_MIN) return [];
  return detect([event]);
}
