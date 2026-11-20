"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playersDatabase = void 0;
exports.getPersistedDbPlayers = getPersistedDbPlayers;
exports.getDbPlayers = getDbPlayers;
exports.getDbPlayerById = getDbPlayerById;
const db_1 = require("../db");
const team_model_1 = require("./team.model");
exports.playersDatabase = [];
// PostgreSQL DATE is a calendar date. UTC serialization can move it to the previous day in Thailand.
function birthDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime()))
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return typeof value === 'string' ? value : '';
}
function mapPlayerRow(r) {
    return {
        id: r.id, teamId: r.team_id || '', name: r.name, prefix: r.prefix || '',
        firstName: r.first_name || '', middleName: r.middle_name || '', lastName: r.last_name || '',
        jerseyName: r.jersey_name || '', idCard: r.id_card || '', birthDate: birthDateValue(r.birth_date),
        jerseyNo: r.jersey_no, position: r.position || '', fivbId: r.fivb_id || '', domicile: r.domicile || '',
        height: r.height || '', weight: r.weight || '', school: r.school || '', grade: r.grade || '',
        guardianName: r.guardian_name || '', guardianRelation: r.guardian_relation || '',
        phone: r.phone || '',
        category: r.category || 'U14', categories: r.category || 'U14',
        photoUrl: r.photo_url || r.photoUrl || '', photo_url: r.photo_url || r.photoUrl || '',
        docIdCard: r.doc_id_card || r.docIdCard || '', doc_id_card: r.doc_id_card || r.docIdCard || '',
        docSchoolCert: r.doc_school_cert, docParentConsent: r.doc_parent_consent,
        docTeamCert: r.doc_team_cert, docRoster: r.doc_roster, docStatus: r.doc_status || 'PENDING',
        remarks: r.remarks || ''
    };
}
/** Reads only persisted player rows. Errors are propagated so callers cannot mistake cache data for saved data. */
async function getPersistedDbPlayers(teamId) {
    const res = await db_1.pool.query('SELECT * FROM football_player WHERE team_id = $1 ORDER BY jersey_no ASC, id ASC', [teamId]);
    return (res?.rows || []).map(mapPlayerRow);
}
async function getDbPlayers(teamId, includeTestData = false) {
    try {
        let res = null;
        if (teamId && teamId !== 'ALL') {
            res = await db_1.pool.query('SELECT * FROM football_player WHERE team_id = $1 ORDER BY jersey_no ASC, id ASC', [teamId]);
        }
        else {
            res = await db_1.pool.query(`SELECT p.* FROM football_player p ${includeTestData ? '' : 'LEFT JOIN football_registered_team t ON t.id = p.team_id WHERE COALESCE(t.is_test, FALSE) = FALSE'} ORDER BY p.jersey_no ASC, p.id ASC`);
        }
        const dbPlayers = (res && res.rows) ? res.rows.filter((r) => r.category !== 'U18F').map(mapPlayerRow) : [];
        const testTeamIds = new Set(team_model_1.teamsDatabase.filter((team) => team.isTest || team.is_test).map((team) => String(team.id)));
        const memPlayers = (teamId && teamId !== 'ALL')
            ? exports.playersDatabase.filter((p) => (p.teamId || p.team_id || '') === teamId)
            : exports.playersDatabase.filter((p) => includeTestData || (!p.isTest && !testTeamIds.has(String(p.teamId || p.team_id || ''))));
        const merged = [...dbPlayers];
        for (const memP of memPlayers) {
            if (!merged.some(dbP => String(dbP.id).trim() === String(memP.id).trim())) {
                merged.push(memP);
            }
        }
        return merged;
    }
    catch (err) {
        console.error('Database query error in getDbPlayers, fallback to memory:', err);
    }
    if (teamId && teamId !== 'ALL') {
        return exports.playersDatabase.filter((p) => (p.teamId || p.team_id || '') === teamId);
    }
    const testTeamIds = new Set(team_model_1.teamsDatabase.filter((team) => team.isTest || team.is_test).map((team) => String(team.id)));
    return exports.playersDatabase.filter((p) => includeTestData || (!p.isTest && !testTeamIds.has(String(p.teamId || p.team_id || ''))));
}
async function getDbPlayerById(id) {
    try {
        const res = await db_1.pool.query('SELECT * FROM football_player WHERE id = $1', [id]);
        if (res.rows.length > 0) {
            const r = res.rows[0];
            return {
                id: r.id,
                teamId: r.team_id || 'FTM-001',
                name: r.name,
                prefix: r.prefix || '',
                firstName: r.first_name || '',
                middleName: r.middle_name || '',
                lastName: r.last_name || '',
                jerseyName: r.jersey_name || '',
                idCard: r.id_card || '',
                birthDate: birthDateValue(r.birth_date),
                jerseyNo: r.jersey_no,
                position: r.position || '',
                fivbId: r.fivb_id || '',
                domicile: r.domicile || '',
                height: r.height || '',
                weight: r.weight || '',
                school: r.school || '',
                grade: r.grade || '',
                guardianName: r.guardian_name || '',
                guardianRelation: r.guardian_relation || '',
                phone: r.phone || '',
                category: r.category || 'U12',
                photoUrl: r.photo_url || r.photoUrl || '',
                photo_url: r.photo_url || r.photoUrl || '',
                docIdCard: r.doc_id_card || r.docIdCard || '',
                doc_id_card: r.doc_id_card || r.docIdCard || '',
                docSchoolCert: r.doc_school_cert,
                docParentConsent: r.doc_parent_consent,
                docTeamCert: r.doc_team_cert,
                docRoster: r.doc_roster,
                docStatus: r.doc_status || 'PENDING',
                remarks: r.remarks || ''
            };
        }
    }
    catch (err) {
        console.error('Database query error in getDbPlayerById, fallback to memory:', err);
    }
    return exports.playersDatabase.find((p) => p.id === id);
}
