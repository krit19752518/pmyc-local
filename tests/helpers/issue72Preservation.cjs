const fs = require('node:fs');
const path = require('node:path');
const edits = JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/issue72-approved-source-edits.json'),'utf8'));
function reverseIssue72Source(module, source) {
  for (const edit of [...edits].reverse().filter(e => e.module === module)) {
    if (source.split(edit.after).length !== 2) throw new Error('Issue72 delta missing/nonunique: '+module);
    source=source.replace(edit.after,edit.before);
  }
  return source;
}
module.exports={reverseIssue72Source, issue72Modules:[...new Set(edits.map(e=>e.module))]};
