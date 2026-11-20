const moduleName = 'routes/team/teamRoster.router';
const before = `    const duplicateOfficial = systemWideOfficials.find(o => {
        if (id && String(o.id).trim() === String(id).trim())
            return false; // exclude currently edited official
        const officialTeamId = String(o.teamId || '').trim();
        if (officialTeamId === String(loggedTeamId).trim())
            return false;
        return normalizeOfficialIdCardForDuplicateCheck(o.idCard) === idCardDuplicateKey;
    });`;
const after = `    const duplicateOfficial = isTeamManager ? systemWideOfficials.find(o => {
        if (id && String(o.id).trim() === String(id).trim())
            return false; // exclude currently edited official
        const officialTeamId = String(o.teamId || '').trim();
        if (officialTeamId === String(loggedTeamId).trim())
            return false;
        return normalizeOfficialIdCardForDuplicateCheck(o.idCard) === idCardDuplicateKey;
    }) : undefined;`;

function reverseIssue86Runtime(module, source) {
  if (module !== moduleName) return source;
  if (source.split(after).length !== 2) throw new Error('Issue86 delta missing/nonunique: ' + module);
  return source.replace(after, before);
}

module.exports = { reverseIssue86Runtime, issue86Module: moduleName };
