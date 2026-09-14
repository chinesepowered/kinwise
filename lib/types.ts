export type EventKind = "card" | "call" | "text" | "email" | "bank";

export type Category =
  | "groceries"
  | "pharmacy"
  | "dining"
  | "medical"
  | "utilities"
  | "social"
  | "gift_cards"
  | "wire"
  | "payee_added"
  | "hold_release_request"
  | "crypto_atm"
  | "remote_access";

export interface ActivityEvent {
  id: string;
  at: string; // "11:52" local time, Ruth's day
  kind: EventKind;
  title: string;
  detail: string;
  category?: Category;
  amount?: number;
  from?: string;
  callerId?: string;
  contactKnown?: boolean;
  durationMin?: number;
  body?: string;
  payee?: string;
  payeeAddedAt?: string;
  targetEventId?: string;
}

export interface Signal {
  id: string;
  detector: string;
  label: string;
  eventId: string;
  at: string;
  weight: number;
  money: boolean;
  evidence: string;
}

export interface Hold {
  eventId: string;
  title: string;
  amount: number;
  status: "held" | "cancelled" | "released";
}

export interface FamilyNotification {
  id: string;
  at: string;
  headline: string;
  body: string;
  action: string;
  urgent: boolean;
}

export interface Incident {
  id: string;
  pattern: string;
  summary: string;
  evidence: string[];
  eventIds: string[];
  moneyEventIds: string[];
  amountAtRisk: number;
  holds: Hold[];
  notifications: FamilyNotification[];
  momMessage?: string;
  momMessageSent?: boolean;
  decision?: "approve" | "block";
  blockedPayees: string[];
  releaseAttempts: number;
  status: "open" | "resolved" | "released";
  outcome?: string;
  protectedAmount?: number;
}

export interface WorldState {
  clock: string;
  events: ActivityEvent[];
  incident?: Incident;
}

export type RunKind = "triage" | "release_request" | "family_decision";

export type StreamMsg =
  | { type: "run"; run: RunKind; model: string }
  | { type: "tool"; id: string; name: string; input: unknown }
  | { type: "hook"; id: string; tool: string; allowed: boolean; rule: string; reason: string }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string }
  | { type: "say"; text: string }
  | { type: "state"; state: WorldState }
  | { type: "error"; message: string }
  | { type: "done"; ms: number; toolCalls: number };
