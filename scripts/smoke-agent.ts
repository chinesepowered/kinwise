// End-to-end check of the deterministic sweep + Strands agent runs, without the UI.
// Run: node --env-file=.env.local --import tsx scripts/smoke-agent.ts
import { runAgent } from "../lib/agent/run";
import { emptyWorld, ingest } from "../lib/orchestrator";
import { DAY } from "../lib/scenario";
import type { RunKind, StreamMsg, WorldState } from "../lib/types";

const print = (m: StreamMsg) => {
  if (m.type === "tool") console.log(`  → ${m.name} ${JSON.stringify(m.input).slice(0, 160)}`);
  else if (m.type === "hook") console.log(`    hook ${m.allowed ? "ALLOW" : "BLOCK"} ${m.rule}: ${m.reason}`);
  else if (m.type === "tool_result") console.log(`    ${m.ok ? "ok" : "ERR"} ${m.summary.slice(0, 160)}`);
  else if (m.type === "say") console.log(`  agent: ${m.text}`);
};

async function agentRun(run: RunKind, state: WorldState, decision?: "approve" | "block") {
  const world = structuredClone(state);
  const t = Date.now();
  console.log(`\n=== ${run}${decision ? ` (${decision})` : ""}`);
  await runAgent(run, world, decision, print);
  console.log(`=== ${run} done in ${Date.now() - t} ms`);
  return world;
}

async function main() {
let state = emptyWorld();
for (const ev of DAY) {
  const r = ingest(state, ev);
  state = r.state;
  for (const l of r.logs) console.log(`${l.at} [${l.tone}] ${ev.title}: ${l.text}`);
  if (r.trigger) state = await agentRun(r.trigger, state);
  if (r.trigger === "release_request") state = await agentRun("family_decision", state, (process.argv[2] as "approve" | "block") ?? "block");
}
const inc = state.incident!;
console.log("\nFINAL", JSON.stringify({ status: inc.status, holds: inc.holds, protectedAmount: inc.protectedAmount, notifications: inc.notifications.map((n) => n.headline), mom: inc.momMessage, sent: inc.momMessageSent, blocked: inc.blockedPayees, releaseAttempts: inc.releaseAttempts, outcome: inc.outcome }, null, 1));
}
main();
