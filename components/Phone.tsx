"use client";

import { useEffect, useState } from "react";
import { PEOPLE, clock12, money } from "@/lib/scenario";
import type { RunKind, WorldState } from "@/lib/types";
import { CheckIcon, LockIcon, MarkIcon, PhoneIcon } from "./icons";

export type PhoneStage = "lock" | "sheet" | "calling" | "done";

// Elena is in Chicago, two hours ahead of Tucson in September.
const chicago = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return clock12(`${(h + 2) % 24}:${String(m).padStart(2, "0")}`);
};

export default function Phone({
  world,
  stage,
  setStage,
  onDecide,
  busy,
  awaiting,
}: {
  world: WorldState;
  stage: PhoneStage;
  setStage: (s: PhoneStage) => void;
  onDecide: (d: "approve" | "block") => void;
  busy: RunKind | null;
  awaiting: boolean;
}) {
  const inc = world.incident;
  const notes = inc?.notifications ?? [];
  const [buzz, setBuzz] = useState(0);
  useEffect(() => {
    if (notes.length) setBuzz((b) => b + 1);
  }, [notes.length]);

  const held = inc?.holds.filter((h) => h.status === "held") ?? [];
  const heldTotal = held.reduce((n, h) => n + h.amount, 0);
  const time = chicago(world.clock).replace(/ (AM|PM)$/, "");
  const canDecide = inc?.status === "open" && !busy;

  return (
    <section className="phone-col">
      <div className="phone-caption">
        <span className="eyebrow">{PEOPLE.family.first}&apos;s phone</span>
        <span className="muted">Chicago · 2 hours ahead</span>
      </div>
      <div key={buzz} className={`phone ${buzz ? "buzz" : ""}`} data-testid="phone">
        <div className="screen">
          <div className="status-bar">
            <span>{time}</span>
            <span className="island" />
            <span>5G ▮▮▮</span>
          </div>

          {(stage === "lock" || !inc) && (
            <div className="lock">
              <div className="lock-date">Tuesday, September 15</div>
              <div className="lock-time">{time}</div>
              <div className="notes">
                {[...notes].reverse().map((n, i) => (
                  <button key={n.id} className={`note ${i === 0 ? "latest" : ""} ${n.urgent ? "urgent" : ""}`} data-testid={i === 0 ? "notif" : undefined} onClick={() => setStage("sheet")}>
                    <span className="note-app">
                      <MarkIcon size={16} /> KINWISE <span className="note-when">{i === 0 ? "now" : chicago(n.at)}</span>
                    </span>
                    <span className="note-head">{n.headline}</span>
                    {i === 0 && <span className="note-body">{n.body}</span>}
                  </button>
                ))}
              </div>
              {!notes.length && <div className="lock-hint">Nothing needs you. Kinwise will only buzz when a person has to decide.</div>}
            </div>
          )}

          {inc && stage === "sheet" && (
            <div className="sheet" data-testid="sheet">
              <div className="sheet-grab" />
              <div className="sheet-kicker">{inc.pattern}</div>
              <div className="sheet-amount">
                <LockIcon size={18} /> {money(heldTotal)} on hold
              </div>
              {notes.at(-1) && (
                <div className={`sheet-alert ${inc.releaseAttempts ? "hot" : ""}`}>
                  <b>{notes.at(-1)!.headline}</b>
                  <span>{notes.at(-1)!.body}</span>
                  <em>{notes.at(-1)!.action}</em>
                </div>
              )}
              <div className="sheet-sec">What Kinwise saw</div>
              <ul className="sheet-ev">
                {inc.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <div className="sheet-sec">Already done</div>
              <ul className="sheet-done">
                {held.map((h) => (
                  <li key={h.eventId}>
                    <LockIcon size={12} /> Held {h.title} · {money(h.amount)}
                  </li>
                ))}
              </ul>
              {inc.momMessage && (
                <>
                  <div className="sheet-sec">Message for Mom (not sent yet)</div>
                  <div className="bubble">{inc.momMessage}</div>
                </>
              )}
              <div className="sheet-actions">
                <button className="decide block" data-testid="decide-block" disabled={!canDecide} onClick={() => onDecide("block")}>
                  <PhoneIcon size={15} /> Block &amp; call Mom
                </button>
                <button className="decide approve" data-testid="decide-approve" disabled={!canDecide} onClick={() => onDecide("approve")}>
                  It&apos;s legit, release
                </button>
              </div>
              {awaiting && <div className="sheet-wait">Only you can decide this. Kinwise is holding the money until you do.</div>}
            </div>
          )}

          {inc && stage === "calling" && (
            <div className="calling" data-testid="calling">
              <div className="call-avatar">R</div>
              <div className="call-name">Mom</div>
              <div className="call-sub">calling…</div>
              <div className="call-status">{busy ? "Kinwise is stopping the payments" : "Payments stopped"}</div>
              <div className="call-end">
                <PhoneIcon size={22} />
              </div>
            </div>
          )}

          {inc && stage === "done" && (
            <div className="resolved" data-testid="resolved">
              <div className="resolved-badge">
                <CheckIcon size={30} />
              </div>
              <div className="resolved-title">{inc.status === "released" ? "Payments released" : "Mom's money is safe"}</div>
              <div className="resolved-amount">{money(inc.protectedAmount ?? inc.holds.filter((h) => h.status === "cancelled").reduce((n, h) => n + h.amount, 0))} protected</div>
              <ul className="resolved-list">
                {inc.holds.map((h) => (
                  <li key={h.eventId}>
                    <CheckIcon size={12} /> {h.status === "cancelled" ? "Stopped" : h.status === "released" ? "Released" : "Held"} · {h.title}
                  </li>
                ))}
                {inc.blockedPayees.map((p) => (
                  <li key={p}>
                    <CheckIcon size={12} /> Blocked payee · {p}
                  </li>
                ))}
                {inc.momMessageSent && (
                  <li>
                    <CheckIcon size={12} /> Kind message sent to Mom
                  </li>
                )}
              </ul>
              {inc.outcome && <div className="resolved-outcome">{inc.outcome}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
