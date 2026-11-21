// Change ledger + experiment records + learned outcome statistics.
// Every content/config change the engine (or an admin) makes is appended to
// changes.jsonl with its reason; experiments carry before/after measurements;
// outcome stats per change type feed back into how aggressively the content
// agent uses that type of change in future.
import crypto from 'node:crypto';
import { appendJsonl, readJsonl, readJson, writeJson } from './store.js';

export function recordChange({ pageId, type, by, reason, before, after, experimentId, meta }) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    pageId: pageId || null,
    type,
    by: by || 'system',
    reason: reason || '',
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
    experimentId: experimentId || null,
    meta: meta || null
  };
  appendJsonl('history/changes.jsonl', entry);
  return entry;
}

export function listChanges({ limit = 100 } = {}) {
  return readJsonl('history/changes.jsonl', { limit }).reverse();
}

export function listExperiments() {
  return readJson('history/experiments.json', []);
}

export function saveExperiments(list) {
  writeJson('history/experiments.json', list);
}

export function addExperiment(exp) {
  const list = listExperiments();
  const record = { id: crypto.randomUUID(), status: 'running', startedAt: new Date().toISOString(), ...exp };
  list.push(record);
  saveExperiments(list);
  return record;
}

export function updateExperiment(id, patch) {
  const list = listExperiments();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  saveExperiments(list);
  return list[idx];
}

// Per change-type outcome statistics, used to decide whether a type of change
// is worth trying again. Only concluded experiments count.
export function outcomeStats() {
  const stats = {};
  for (const e of listExperiments()) {
    if (!['kept', 'reverted', 'inconclusive'].includes(e.status)) continue;
    const s = (stats[e.type] ||= { trials: 0, improved: 0, worsened: 0, inconclusive: 0, ctrDeltas: [] });
    s.trials += 1;
    if (e.evaluation?.verdict === 'improved') s.improved += 1;
    else if (e.evaluation?.verdict === 'worsened') s.worsened += 1;
    else s.inconclusive += 1;
    if (typeof e.evaluation?.ctrDelta === 'number') s.ctrDeltas.push(e.evaluation.ctrDelta);
  }
  for (const s of Object.values(stats)) {
    s.successRate = s.trials ? s.improved / s.trials : null;
    s.meanCtrDelta = s.ctrDeltas.length ? s.ctrDeltas.reduce((a, b) => a + b, 0) / s.ctrDeltas.length : null;
    delete s.ctrDeltas;
  }
  return stats;
}

// Learned policy: after enough concluded trials, a change type that rarely
// helps is deprioritised (weight < 1) and one that reliably helps is favoured.
export function changeTypeWeight(type) {
  const s = outcomeStats()[type];
  if (!s || s.trials < 5) return 1; // not enough evidence yet: neutral
  if (s.successRate < 0.2 && s.worsened >= s.improved) return 0.25;
  if (s.successRate >= 0.5) return 1.5;
  return 1;
}
