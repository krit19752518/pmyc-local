import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const { reverseIssue77Source } = require('./helpers/issue77Preservation.cjs');
const delta: { issue: number; base: string; modules: Array<{ module: string; baseline_sha256: string }>; edits: Array<{ module: string; before: string; after: string }> } = require('./fixtures/issue77-source-delta.json');
const source = (module: string) => fs.readFileSync(path.join(__dirname, '../src', module + '.ts'), 'utf8');

it('limits Issue77 to the report policy/explanation and a shared-counter comment', () => {
  expect(delta.issue).toBe(77);
  expect(delta.base).toBe('20a947cf10e43b805e65336f35db085bc225d3bd');
  expect(delta.modules.map((entry: any) => entry.module)).toEqual([
    'routes/admin/adminReports.router', 'services/registrationStatistics.service']);
  expect(delta.edits).toHaveLength(3);
});
it.each(delta.modules)('reconstructs the entire reviewed prior source in $module', (entry: any) => {
  const restored = reverseIssue77Source(entry.module, source(entry.module));
  expect(createHash('sha256').update(restored).digest('hex')).toBe(entry.baseline_sha256);
});
it('rejects missing/nonunique approved deltas and unrelated edits', () => {
  const edit = delta.edits[0];
  const original = source(edit.module);
  expect(() => reverseIssue77Source(edit.module, original.replace(edit.after, edit.before))).toThrow('missing/nonunique');
  expect(() => reverseIssue77Source(edit.module, original + edit.after)).toThrow('missing/nonunique');
  expect(() => reverseIssue77Source(edit.module, original + '\n// unrelated change')).toThrow('unrelated source drift');
});
