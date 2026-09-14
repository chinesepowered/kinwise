"use client";

import { useEffect, useRef, useState } from "react";
import { emptyWorld, ingest, type SweepLog } from "@/lib/orchestrator";
import { DAY, PEOPLE, clock12, money } from "@/lib/scenario";
import type { RunKind, StreamMsg, WorldState } from "@/lib/types";
import AgentPanel from "./AgentPanel";
import Feed, { type Mark } from "./Feed";
import { MarkIcon, PlayIcon, ResetIcon } from "./icons";
import Phone, { type PhoneStage } from "./Phone";

export type ActivityItem =
  | { kind: "sweep"; id: string; log: SweepLog; title: string }
  | { kind: "run"; id: string; run: RunKind; model: string }
  | { kind: "tool"; id: string; name: string; input: unknown; hook?: { allowed: boolean; rule: string; reason: string }; result?: { ok: boolean; summary: string } }
  | { kind: "say"; id: string; text: string }
  | { kind: "done"; id: string; ms: number; toolCalls: number }
  | { kind: "error"; id: string; message: string };

declare global {
  interface Window {
    __kinwiseResume?: () => void;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let uid = 0;
const nextId = () => `a${++uid}`;

// ?director=1 pauses playback before these events so a narrated recording can stay in sync.
const DIRECTOR_GATES = new Set(["e6", "e10", "e13"]);

export default function KinwiseApp() {
  const [world, setWorldState] = useState<WorldState>(emptyWorld);
  const worldRef = useRef(world);
  const setWorld = (w: WorldState) => {
    worldRef.current = w;
    setWorldState(w);
  };
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [busy, setBusy] = useState<RunKind | null>(null);
  const [playing, setPlaying] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [gate, setGate] = useState("");
  const [phoneStage, setPhoneStage] = useState<PhoneStage>("lock");
  const [flash, setFlash] = useState<{ rule: string; allowed: boolean; n: number } | null>(null);
  const token = useRef(0);
  const decisionWaiter = useRef<(() => void) | null>(null);
  const speed = useRef(1);
  const director = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = Number(q.get("speed"));
    if (s > 0) speed.current = s;
    director.current = q.get("director") === "1";
  }, []);

  const push = (item: ActivityItem) => setItems((l) => [...l, item]);
  const patchTool = (id: string, patch: Partial<Extract<ActivityItem, { kind: "tool" }>>) =>
    setItems((l) => l.map((it) => (it.kind === "tool" && it.id === id ? { ...it, ...patch } : it)));

  const handle = (m: StreamMsg) => {
    switch (m.type) {
      case "run":
        push({ kind: "run", id: nextId(), run: m.run, model: m.model });
        break;
      case "tool":
        push({ kind: "tool", id: m.id, name: m.name, input: m.input });
        break;
      case "hook":
        patchTool(m.id, { hook: { allowed: m.allowed, rule: m.rule, reason: m.reason } });
        setFlash((f) => ({ rule: m.rule, allowed: m.allowed, n: (f?.n ?? 0) + 1 }));
        break;
      case "tool_result":
        patchTool(m.id, { result: { ok: m.ok, summary: m.summary } });
        break;
      case "say":
        push({ kind: "say", id: nextId(), text: m.text });
        break;
      case "state":
        setWorld(m.state);
        break;
      case "done":
        push({ kind: "done", id: nextId(), ms: m.ms, toolCalls: m.toolCalls });
        break;
      case "error":
        push({ kind: "error", id: nextId(), message: m.message });
        break;
    }
  };

  const streamRun = async (run: RunKind, decision?: "approve" | "block") => {
    const t = token.current;
    setBusy(run);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run, state: worldRef.current, decision }) });
      if (!res.ok || !res.body) {
        push({ kind: "error", id: nextId(), message: `Agent request failed (${res.status})` });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          if (t !== token.current) return;
          handle(JSON.parse(line) as StreamMsg);
        }
      }
    } catch (err) {
      push({ kind: "error", id: nextId(), message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (t === token.current) setBusy(null);
    }
  };

  const play = async () => {
    if (playing) return;
    setPlaying(true);
    const t = token.current;
    for (let i = worldRef.current.events.length; i < DAY.length; i++) {
      if (t !== token.current) return;
      const ev = DAY[i];
      if (director.current && DIRECTOR_GATES.has(ev.id)) {
        setGate(ev.id);
        await new Promise<void>((res) => (window.__kinwiseResume = res));
        setGate("");
        if (t !== token.current) return;
      }
      const r = ingest(worldRef.current, ev);
      setWorld(r.state);
      setMarks((m) => ({ ...m, [ev.id]: r.mark }));
      setItems((l) => [...l, ...r.logs.map((log) => ({ kind: "sweep" as const, id: log.id, log, title: ev.title }))]);
      await sleep((r.mark === "routine" ? 1100 : 2000) / speed.current);
      if (!r.trigger) continue;
      await streamRun(r.trigger);
      if (t !== token.current) return;
      await sleep(900 / speed.current);
      if (r.trigger === "release_request" && worldRef.current.incident?.status === "open") {
        setAwaiting(true);
        await new Promise<void>((res) => (decisionWaiter.current = res));
        await sleep(1600 / speed.current);
      }
    }
    if (t === token.current) setPlaying(false);
  };

  const decide = async (d: "approve" | "block") => {
    if (!worldRef.current.incident || busy) return;
    setAwaiting(false);
    setPhoneStage(d === "block" ? "calling" : "sheet");
    await streamRun("family_decision", d);
    setPhoneStage("done");
    decisionWaiter.current?.();
    decisionWaiter.current = null;
  };

  const reset = () => {
    token.current++;
    decisionWaiter.current = null;
    window.__kinwiseResume?.();
    setWorld(emptyWorld());
    setItems([]);
    setMarks({});
    setBusy(null);
    setPlaying(false);
    setAwaiting(false);
    setGate("");
    setPhoneStage("lock");
    setFlash(null);
  };

  const inc = world.incident;
  const held = inc?.holds.filter((h) => h.status === "held").reduce((n, h) => n + h.amount, 0) ?? 0;
  const protectedAmt = inc?.holds.filter((h) => h.status === "cancelled").reduce((n, h) => n + h.amount, 0) ?? 0;
  const started = world.events.length > 0;

  return (
    <div className="app" data-busy={busy ? "true" : "false"} data-awaiting={awaiting ? "true" : "false"} data-gate={gate}>
      <header className="topbar">
        <div className="brand">
          <MarkIcon size={34} />
          <div>
            <div className="brand-name">Kinwise</div>
            <div className="brand-sub">
              Watching over <b>{PEOPLE.parent.name}</b>, {PEOPLE.parent.age} · {PEOPLE.parent.city} · for {PEOPLE.family.first}
            </div>
          </div>
        </div>

        <div className="clock" data-testid="clock">
          <span className={`clock-dot ${busy ? "awake" : started ? "quiet" : ""}`} />
          <span className="clock-day">Tuesday</span>
          <span className="clock-time">{started ? clock12(world.clock) : "7:00 AM"}</span>
          <span className="clock-mode">{busy ? "Strands agent awake" : "Quiet mode"}</span>
        </div>

        <div className="top-right">
          <div className={`counter ${protectedAmt ? "protected" : held ? "held" : ""}`} data-testid="counter">
            <span className="counter-label">{protectedAmt ? "Protected" : held ? "On hold" : "Protected today"}</span>
            <span className="counter-value">{money(protectedAmt || held)}</span>
          </div>
          <button className="btn btn-primary" data-testid="play" onClick={play} disabled={playing}>
            <PlayIcon /> {playing ? "Playing Ruth's day" : started ? "Resume" : "Play Ruth's day"}
          </button>
          <button className="btn btn-ghost" data-testid="reset" onClick={reset} title="Reset demo">
            <ResetIcon size={16} />
          </button>
        </div>
      </header>

      <main className="grid">
        <Feed events={world.events} marks={marks} incident={inc} />
        <AgentPanel items={items} busy={busy} flash={flash} />
        <Phone world={world} stage={phoneStage} setStage={setPhoneStage} onDecide={decide} busy={busy} awaiting={awaiting} />
      </main>
    </div>
  );
}
