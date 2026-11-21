// Versioned page store. Two kinds of records:
//   - 'override': metadata overrides (title / meta description) for built-in pages
//     (home, services hub, service pages, project pages). Page bodies of
//     built-in pages stay in code/content.json; only metadata is tuned here.
//   - 'article': full educational articles published by the content agent.
// Nothing is ever deleted: every save appends a version, rollback re-publishes
// an earlier version as a new version, and archiving keeps the record.
import { readJson, writeJson, listFiles } from './store.js';
import { recordChange } from './learning.js';

function fileFor(id) {
  return `pages/${String(id).replace(/[^a-z0-9-]/gi, '_')}.json`;
}

export function getPage(id) {
  return readJson(fileFor(id), null);
}

export function listPages({ kind, status } = {}) {
  const out = [];
  for (const f of listFiles('pages')) {
    if (!f.endsWith('.json')) continue;
    const page = readJson(`pages/${f}`, null);
    if (!page) continue;
    if (kind && page.kind !== kind) continue;
    if (status && page.status !== status) continue;
    out.push(page);
  }
  return out;
}

export function currentData(page) {
  if (!page) return null;
  const v = page.versions.find((x) => x.v === page.currentVersion);
  return v ? v.data : null;
}

export function savePageVersion(id, { kind, data, by = 'system', reason = '', status, changeType, experimentId }) {
  const existing = getPage(id);
  const now = new Date().toISOString();
  const page = existing || { id, kind, status: status || 'published', createdAt: now, versions: [], currentVersion: 0 };
  const before = currentData(existing);
  const v = (page.versions.at(-1)?.v || 0) + 1;
  page.versions.push({ v, at: now, by, reason, data });
  page.currentVersion = v;
  page.updatedAt = now;
  if (status) page.status = status;
  if (page.status === 'published' && !page.publishedAt) page.publishedAt = now;
  writeJson(fileFor(id), page);
  recordChange({ pageId: id, type: changeType || `${kind}-update`, by, reason, before, after: data, experimentId });
  return page;
}

export function rollbackPage(id, toVersion, { by = 'admin', reason = 'manual rollback' } = {}) {
  const page = getPage(id);
  if (!page) return null;
  const target = page.versions.find((x) => x.v === Number(toVersion));
  if (!target) return null;
  return savePageVersion(id, { kind: page.kind, data: target.data, by, reason: `${reason} (restored v${target.v})`, changeType: 'rollback' });
}

export function setPageStatus(id, status, { by = 'admin', reason = '' } = {}) {
  const page = getPage(id);
  if (!page) return null;
  const before = page.status;
  page.status = status;
  page.updatedAt = new Date().toISOString();
  if (status === 'published' && !page.publishedAt) page.publishedAt = page.updatedAt;
  writeJson(fileFor(id), page);
  recordChange({ pageId: id, type: 'status-change', by, reason, before, after: status });
  return page;
}

// Effective metadata for a built-in page: the published override if any,
// otherwise the defaults computed from the catalog/content.
export function effectiveMeta(id, defaults) {
  const page = getPage(id);
  if (!page || page.kind !== 'override' || page.status !== 'published') return defaults;
  const data = currentData(page) || {};
  return {
    ...defaults,
    title: data.title || defaults.title,
    metaDescription: data.metaDescription || defaults.metaDescription
  };
}

export function lastModified(id, fallback) {
  const page = getPage(id);
  return page?.updatedAt || fallback || null;
}
