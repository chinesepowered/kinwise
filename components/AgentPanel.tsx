"use client";

import { useEffect, useRef } from "react";
import { RULES } from "@/lib/policy";
import { clock12 } from "@/lib/scenario";
import type { RunKind } from "@/lib/types";
import { BoltIcon, ShieldIcon, ShieldXIcon } from "./icons";
import type { ActivityItem } from "./KinwiseApp";

const TOOL_LABEL: Record<string, string> = {
  review_activity: "Review Ruth's activity",
  open_incident: "Open incident",
  place_hold: "Put money on hold",
  draft_message_to_mom: "Draft a message to Mom",
  notify_family: "Alert Elena",
  review_incident: "Review incident",
  release_hold: "Release held money",
  cancel_held_transactions: "Stop held payments",
  block_payee: "Block payee",
  send_message_to_mom: "Send message to Mom",
  close_incident: "Close incident",
};

const RUN_LABEL: Record<RunKind, string> = {
  triage: "Triage: correlate, hold, alert",
  release_request: "Ruth asked to release the money",
  family_decision: "Carry out Elena's decision",
};

function fmt(v: unknown): string {
  if (Array.isArray(v)) return v.map(fmt).join(", ");
  if (typeof v === "string") return v.length > 120 ? v.slice(0, 118) + "…" : v;
  return JSON.stringify(v);
}

export default function AgentPanel({ items, busy, flash }: { items: ActivityItem[]; busy: RunKind | null; flash: { rule: string; allowed: boolean; n: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  return (
    <section className="panel agent" data-testid="agent-panel">
      <div className="panel-head dark">
        <div>
          <div className="eyebrow">Kinwise agent</div>
          <div className="panel-title">
            Built on <span className="strands">Strands Agents</span>
          </div>
        </div>
        <div className={`status ${busy ? "awake" : "quiet"}`} data-testid="agent-status">
          <span className="status-dot" />
          {busy ? "agent is working" : "quiet · deterministic sweeps"}
        </div>
      </div>

      <div className="stream" ref={ref}>
        {!items.length && (
          <div className="stream-empty">
            <p>Every new event is checked by deterministic detectors first.</p>
            <p>The Strands agent only wakes up when they find a pattern with money at risk, and every tool it calls passes a safety hook.</p>
          </div>
        )}
        {items.map((it) => {
          if (it.kind === "sweep") {
            return (
              <div key={it.id} className={`sweep sweep-${it.log.tone}`}>
                <span className="sweep-time">{clock12(it.log.at)}</span>
                {it.log.tone === "trigger" && <BoltIcon size={13} />}
                <span className="sweep-title">{it.title}</span>
                <span className="sweep-text">{it.log.text}</span>
              </div>
            );
          }
          if (it.kind === "run")
            return (
              <div key={it.id} className="run-head" data-testid="run-head">
                <span className="run-kicker">Strands agent run</span>
                <span className="run-name">{RUN_LABEL[it.run]}</span>
                <span className="run-model">{it.model}</span>
              </div>
            );
          if (it.kind === "tool") {
            const blocked = it.hook && !it.hook.allowed;
            const entries = Object.entries((it.input ?? {}) as Record<string, unknown>).filter(([k]) => k !== "incidentId").slice(0, 3);
            return (
              <div key={it.id} className={`tool ${blocked ? "blocked" : ""}`} data-testid={blocked ? "tool-blocked" : "tool-call"}>
                <div className="tool-top">
                  <span className="tool-label">{TOOL_LABEL[it.name] ?? it.name}</span>
                  <code className="tool-name">{it.name}()</code>
                  <span className={`tool-state ${it.result ? (it.result.ok ? "ok" : "err") : "pending"}`}>{it.result ? (it.result.ok ? "done" : blocked ? "blocked" : "error") : "…"}</span>
                </div>
                {entries.length > 0 && (
                  <div className="tool-args">
                    {entries.map(([k, v]) => (
                      <div key={k}>
                        <span className="arg-k">{k}</span> <span className="arg-v">{fmt(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {it.hook && (
                  <div className={`hook ${it.hook.allowed ? "allow" : "deny"}`}>
                    {it.hook.allowed ? <ShieldIcon size={14} /> : <ShieldXIcon size={16} />}
                    <span className="hook-rule">{it.hook.allowed ? `hook ${it.hook.rule} · allowed` : `BLOCKED by safety hook · ${it.hook.rule}`}</span>
                    <span className="hook-reason">{it.hook.reason}</span>
                  </div>
                )}
              </div>
            );
          }
          if (it.kind === "say")
            return (
              <div key={it.id} className="say" data-testid="agent-say">
                {it.text}
              </div>
            );
          if (it.kind === "done")
            return (
              <div key={it.id} className="run-done" data-testid="run-done">
                run finished · {it.toolCalls} tool calls · {(it.ms / 1000).toFixed(1)} s · back to quiet mode
              </div>
            );
          return (
            <div key={it.id} className="run-error">
              {it.message}
            </div>
          );
        })}
      </div>

      <div className="rules">
        <div className="rules-title">BeforeToolCall safety hook</div>
        <div className="rules-list">
          {RULES.map((r) => (
            <span key={r.id + (flash?.rule === r.id ? flash.n : "")} className={`rule ${flash?.rule === r.id ? (flash.allowed ? "flash-allow" : "flash-deny") : ""}`} title={r.text}>
              <b>{r.id}</b> {r.short}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
