"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { clock12, money } from "@/lib/scenario";
import type { ActivityEvent, Incident } from "@/lib/types";
import { KindIcon, LockIcon } from "./icons";

export type Mark = "routine" | "signal" | "linked" | "request";

export default function Feed({ events, marks, incident }: { events: ActivityEvent[]; marks: Record<string, Mark>; incident?: Incident }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [rail, setRail] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    const ids = incident?.eventIds ?? [];
    const rows = ids.map((id) => list.querySelector<HTMLElement>(`[data-event="${id}"]`)).filter((r): r is HTMLElement => Boolean(r));
    if (rows.length < 2) return setRail(null);
    const first = rows.reduce((a, b) => (a.offsetTop < b.offsetTop ? a : b));
    const last = rows.reduce((a, b) => (a.offsetTop > b.offsetTop ? a : b));
    setRail({ top: first.offsetTop + 26, height: last.offsetTop - first.offsetTop });
  }, [events.length, incident?.eventIds.length, incident]);

  return (
    <section className="panel feed" data-testid="feed">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Ruth&apos;s day</div>
          <div className="panel-title">Bank, cards, calls &amp; messages</div>
        </div>
        <div className="legend">
          <span className="lg lg-routine">routine</span>
          <span className="lg lg-signal">signal</span>
          <span className="lg lg-scam">scam chain</span>
        </div>
      </div>

      {!events.length && (
        <div className="feed-empty">
          <p>Ruth&apos;s Tuesday hasn&apos;t started yet.</p>
          <p className="muted">Kinwise watches every charge, call and message, and stays quiet unless something needs a person.</p>
        </div>
      )}

      <ol className="feed-list" ref={listRef}>
        {rail && <div className="rail" style={{ top: rail.top, height: rail.height }} />}
        {events.map((e) => {
          const inChain = incident?.eventIds.includes(e.id);
          const hold = incident?.holds.find((h) => h.eventId === e.id);
          const mark = marks[e.id];
          const open = incident?.status === "open";
          const cls = mark === "request" ? (open ? "request" : "chain request-done") : inChain ? "chain" : mark === "signal" ? "signal" : "routine";
          return (
            <li key={e.id} className={`row ${cls} ${incident && !open && (inChain || mark === "request") ? "resolved" : ""}`} data-event={e.id} data-testid={`event-${e.id}`}>
              <span className="row-time">{clock12(e.at)}</span>
              <span className="row-icon">
                <KindIcon kind={e.kind} size={15} />
              </span>
              <span className="row-body">
                <span className="row-title">{e.title}</span>
                <span className="row-detail">{e.detail}</span>
              </span>
              <span className="row-right">
                {e.amount !== undefined && <span className={`row-amount ${hold?.status === "cancelled" ? "struck" : ""}`}>{money(e.amount)}</span>}
                {hold && (
                  <span className={`stamp stamp-${hold.status}`}>
                    {hold.status === "held" && <LockIcon size={11} />}
                    {hold.status === "held" ? "held" : hold.status === "cancelled" ? "stopped" : "released"}
                  </span>
                )}
                {!hold && cls === "routine" && <span className="row-ok">✓</span>}
                {mark === "request" && <span className="stamp stamp-request">release?</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
