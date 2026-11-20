const { createHash } = require('node:crypto');
const delta = require('../fixtures/issue77-source-delta.json');
function reverseIssue77Source(module, source) {
  const baseline = delta.modules.find(entry => entry.module === module);
  if (!baseline) return source;
  for (const edit of [...delta.edits].reverse().filter(entry => entry.module === module)) {
    if (source.split(edit.after).length !== 2) throw new Error('Issue77 delta missing/nonunique: ' + module);
    source = source.replace(edit.after, edit.before);
  }
  if (createHash('sha256').update(source).digest('hex') !== baseline.baseline_sha256) {
    throw new Error('Issue77 unrelated source drift: ' + module);
  }
  return source;
}
module.exports = { reverseIssue77Source };
