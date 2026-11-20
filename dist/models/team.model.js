"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamProfile = exports.teamsDatabase = void 0;
exports.getDbTeamProfile = getDbTeamProfile;
exports.getDbRegisteredTeams = getDbRegisteredTeams;
exports.getLoggedTeamId = getLoggedTeamId;
const db_1 = require("../db");
const helpers_1 = require("../utils/helpers");
exports.teamsDatabase = [];
exports.teamProfile = {
    school: '',
    school_code: '',
    province: '',
    bkk_zone: '',
    district: '',
    gender: 'boy',
    categories: [],
    managerName: '',
    email: '',
    phone: '',
    line_id: '',
    house_no: '',
    road: '',
    subdistrict: '',
    contact_district: '',
    contact_subdistrict: '',
    contact_province: '',
    docTeamCert: '',
    docRoster: '',
    submitted_categories: '',
    cancelled_categories: '',
    status: 'PENDING',
    reject_reason: ''
};
async function getDbTeamProfile(req) {
    const cookies = req ? (0, helpers_1.parseCookies)(req) : {};
    const rawId = (req?.query?.id || '');
    const queryTeamId = (req?.query?.teamId || (rawId.startsWith('FTM-') ? rawId : ''));
    const loggedTeamId = queryTeamId || cookies.team_id || '';
    const loggedTeamUser = cookies.team_user ? decodeURIComponent(cookies.team_user) : '';
    try {
        let res = null;
        if (loggedTeamId && loggedTeamId !== 'default') {
            res = await db_1.pool.query('SELECT * FROM football_registered_team WHERE id::text = $1', [String(loggedTeamId)]);
        }
        else if (loggedTeamUser) {
            res = await db_1.pool.query('SELECT t.* FROM football_registered_team t LEFT JOIN (SELECT team_id, COUNT(*) as p_count FROM football_player GROUP BY team_id) p ON t.id = p.team_id WHERE t.phone = $1 OR t.username = $1 OR t.email = $1 OR t.team_name = $1 ORDER BY COALESCE(p.p_count, 0) DESC, t.id ASC LIMIT 1', [loggedTeamUser]);
        }
        if (res && res.rows && res.rows.length > 0) {
            const row = res.rows[0];
            const cats = row.categories === '' ? [] : (0, helpers_1.parseCategories)({ categories: row.categories, category: row.category });
            let userTeamsList = [];
            if (loggedTeamUser) {
                try {
                    const userTeamsRes = await db_1.pool.query('SELECT id, team_name FROM football_registered_team WHERE phone = $1 OR username = $1 OR email = $1 OR team_name = $1 ORDER BY id ASC', [loggedTeamUser]);
                    if (userTeamsRes && userTeamsRes.rows.length > 1) {
                        userTeamsList = userTeamsRes.rows.map(r => ({
                            id: r.id,
                            school: r.team_name || r.id,
                            isCurrent: String(r.id) === String(row.id)
                        }));
                    }
                }
                catch (e) { }
            }
            const memTeam = exports.teamsDatabase.find(t => String(t.id).trim() === String(row.id).trim());
            return {
                id: row.id,
                isDemo: Boolean(row.is_test),
                school: (memTeam?.teamName || memTeam?.school) || row.team_name || row.school || exports.teamProfile.school || '',
                school_code: (memTeam?.school_code) ?? row.school_code ?? exports.teamProfile.school_code ?? '',
                province: memTeam?.province || row.province || exports.teamProfile.province || '',
                bkk_zone: memTeam?.bkk_zone ?? row.bkk_zone ?? exports.teamProfile.bkk_zone ?? '',
                district: memTeam?.district ?? row.district ?? exports.teamProfile.district ?? '',
                gender: memTeam?.gender || row.gender || exports.teamProfile.gender || 'boy',
                categories: cats,
                managerName: (memTeam?.managerName) || row.manager_name || row.managerName || exports.teamProfile.managerName || '',
                email: memTeam?.email ?? row.email ?? exports.teamProfile.email ?? '',
                phone: memTeam?.phone || row.phone || exports.teamProfile.phone || '',
                line_id: memTeam?.line_id ?? row.line_id ?? exports.teamProfile.line_id ?? '',
                house_no: memTeam?.house_no ?? row.house_no ?? exports.teamProfile.house_no ?? '',
                road: memTeam?.road ?? row.road ?? exports.teamProfile.road ?? '',
                subdistrict: memTeam?.subdistrict ?? row.subdistrict ?? exports.teamProfile.subdistrict ?? '',
                contact_district: memTeam?.contact_district ?? row.contact_district ?? exports.teamProfile.contact_district ?? '',
                contact_subdistrict: memTeam?.contact_subdistrict ?? row.contact_subdistrict ?? row.subdistrict ?? (exports.teamProfile.contact_subdistrict || exports.teamProfile.subdistrict || ''),
                contact_province: memTeam?.contact_province ?? row.contact_province ?? row.province ?? exports.teamProfile.contact_province ?? exports.teamProfile.province ?? '',
                docTeamCert: row.doc_team_cert || memTeam?.docTeamCert || memTeam?.doc_team_cert || exports.teamProfile.docTeamCert || '',
                doc_team_cert: row.doc_team_cert || memTeam?.docTeamCert || memTeam?.doc_team_cert || exports.teamProfile.docTeamCert || '',
                docRoster: row.doc_roster || memTeam?.docRoster || memTeam?.doc_roster || exports.teamProfile.docRoster || '',
                doc_roster: row.doc_roster || memTeam?.docRoster || memTeam?.doc_roster || exports.teamProfile.docRoster || '',
                submitted_categories: row.submitted_categories ?? memTeam?.submitted_categories ?? memTeam?.submittedCategories ?? exports.teamProfile.submitted_categories ?? '',
                cancelled_categories: row.cancelled_categories ?? memTeam?.cancelled_categories ?? memTeam?.cancelledCategories ?? exports.teamProfile.cancelled_categories ?? '',
                status: ['APPROVED', 'REJECTED'].includes(row.status) ? row.status : 'PENDING',
                reject_reason: row.reject_reason || memTeam?.rejectReason || memTeam?.reject_reason || exports.teamProfile.reject_reason || '',
                createdAt: row.created_at || memTeam?.createdAt || memTeam?.created_at || '',
                userTeams: userTeamsList
            };
        }
    }
    catch (err) {
        console.error('Database query error in getDbTeamProfile, fallback to memory:', err);
    }
    if (loggedTeamUser || loggedTeamId) {
        const memTeam = exports.teamsDatabase.find(t => t.id === loggedTeamId || t.username === loggedTeamUser || t.email === loggedTeamUser || t.phone === loggedTeamUser || t.teamName === loggedTeamUser);
        if (memTeam) {
            const cats = String(memTeam.categories ?? '').trim() === '' && memTeam.categories !== undefined
                ? []
                : (0, helpers_1.parseCategories)({ registeredCategories: memTeam.registeredCategories, categories: memTeam.categories, category: memTeam.category });
            return {
                id: memTeam.id,
                isDemo: Boolean(memTeam.isTest || memTeam.is_test),
                school: memTeam.teamName || memTeam.school || exports.teamProfile.school || '',
                school_code: memTeam.school_code ?? exports.teamProfile.school_code ?? '',
                province: memTeam.province || exports.teamProfile.province || '',
                bkk_zone: memTeam.bkk_zone ?? exports.teamProfile.bkk_zone ?? '',
                district: memTeam.district ?? exports.teamProfile.district ?? '',
                gender: memTeam.gender || exports.teamProfile.gender || 'boy',
                categories: cats,
                managerName: memTeam.managerName || exports.teamProfile.managerName || '',
                email: memTeam.email ?? exports.teamProfile.email ?? '',
                phone: memTeam.phone || exports.teamProfile.phone || '',
                line_id: memTeam.line_id ?? exports.teamProfile.line_id ?? '',
                house_no: memTeam.house_no ?? exports.teamProfile.house_no ?? '',
                road: memTeam.road ?? exports.teamProfile.road ?? '',
                subdistrict: memTeam.subdistrict ?? exports.teamProfile.subdistrict ?? '',
                contact_district: memTeam.contact_district ?? exports.teamProfile.contact_district ?? '',
                contact_subdistrict: memTeam.contact_subdistrict ?? memTeam.subdistrict ?? (exports.teamProfile.contact_subdistrict || exports.teamProfile.subdistrict || ''),
                contact_province: memTeam.contact_province ?? memTeam.province ?? exports.teamProfile.contact_province ?? exports.teamProfile.province ?? '',
                docTeamCert: memTeam.docTeamCert || memTeam.doc_team_cert || exports.teamProfile.docTeamCert || '',
                docRoster: memTeam.docRoster || memTeam.doc_roster || exports.teamProfile.docRoster || '',
                submitted_categories: memTeam.submitted_categories ?? memTeam.submittedCategories ?? exports.teamProfile.submitted_categories ?? '',
                cancelled_categories: memTeam.cancelled_categories ?? memTeam.cancelledCategories ?? exports.teamProfile.cancelled_categories ?? '',
                status: ['APPROVED', 'REJECTED'].includes(memTeam.status) ? memTeam.status : 'PENDING',
                reject_reason: memTeam.rejectReason || memTeam.reject_reason || exports.teamProfile.reject_reason || '',
                createdAt: memTeam.createdAt || memTeam.created_at || ''
            };
        }
    }
    return exports.teamProfile;
}
async function getDbRegisteredTeams(includeTestData = false) {
    const dbTeams = [];
    try {
        const res = await db_1.pool.query(`SELECT * FROM football_registered_team ${includeTestData ? '' : 'WHERE COALESCE(is_test, FALSE) = FALSE'} ORDER BY created_at DESC`);
        if (res.rows && res.rows.length > 0) {
            dbTeams.push(...res.rows.map(r => ({
                id: r.id,
                teamName: r.team_name,
                school_code: r.school_code || '',
                province: r.province,
                bkk_zone: r.bkk_zone || '',
                district: r.district || '',
                managerName: r.manager_name,
                phone: r.phone,
                status: ['APPROVED', 'REJECTED'].includes(r.status) ? r.status : 'PENDING',
                rejectReason: r.reject_reason || '',
                gender: r.gender || 'boy',
                categories: r.categories ?? '',
                username: r.username,
                password: r.password,
                email: r.email || '',
                line_id: r.line_id || '',
                house_no: r.house_no || '',
                road: r.road || '',
                subdistrict: r.subdistrict || '',
                contact_district: r.contact_district || '',
                contact_subdistrict: r.contact_subdistrict ?? r.subdistrict ?? '',
                contact_province: r.contact_province || '',
                docTeamCert: r.doc_team_cert || '',
                docRoster: r.doc_roster || '',
                submitted_categories: r.submitted_categories || '',
                cancelled_categories: r.cancelled_categories || '',
                createdAt: r.created_at,
                is_deleted: Boolean(r.is_deleted),
                isTest: Boolean(r.is_test),
                deleted_at: r.deleted_at || null
            })));
        }
    }
    catch (err) {
        console.error('Database query error in getDbRegisteredTeams, fallback to memory:', err);
    }
    const merged = [...dbTeams];
    for (const memT of exports.teamsDatabase) {
        if (!includeTestData && (memT.isTest || memT.is_test))
            continue;
        const isDel = Boolean(memT.is_deleted || memT.isDeleted);
        const normalizedMem = {
            ...memT,
            status: ['APPROVED', 'REJECTED'].includes(memT.status) ? memT.status : 'PENDING',
            is_deleted: isDel
        };
        const dbIndex = merged.findIndex(dbT => String(dbT.id).trim() === String(memT.id).trim());
        if (dbIndex >= 0) {
            continue;
        }
        else {
            merged.push(normalizedMem);
        }
    }
    merged.sort((a, b) => {
        const timeA = a.createdAt || a.created_at ? new Date(a.createdAt || a.created_at).getTime() : 0;
        const timeB = b.createdAt || b.created_at ? new Date(b.createdAt || b.created_at).getTime() : 0;
        if (timeA !== timeB)
            return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''), 'th');
    });
    return merged;
}
async function getLoggedTeamId(req, allowQueryTeamOverride = true) {
    if (!req)
        return 'FTM-001';
    const cookies = (0, helpers_1.parseCookies)(req);
    const queryTeamId = (req.query?.teamId || '').trim();
    if (allowQueryTeamOverride && queryTeamId)
        return queryTeamId;
    const loggedTeamId = cookies.team_id || '';
    if (loggedTeamId && loggedTeamId !== 'default') {
        return loggedTeamId;
    }
    const loggedTeamUser = cookies.team_user ? decodeURIComponent(cookies.team_user) : '';
    if (loggedTeamUser) {
        try {
            const res = await db_1.pool.query('SELECT t.id FROM football_registered_team t LEFT JOIN (SELECT team_id, COUNT(*) as p_count FROM football_player GROUP BY team_id) p ON t.id = p.team_id WHERE t.phone = $1 OR t.username = $1 OR t.team_name = $1 ORDER BY COALESCE(p.p_count, 0) DESC, t.id ASC LIMIT 1', [loggedTeamUser]);
            if (res && res.rows && res.rows.length > 0) {
                return res.rows[0].id;
            }
        }
        catch (e) {
            console.error('Database query error in getLoggedTeamId, fallback to memory:', e);
        }
        const mem = exports.teamsDatabase.find(t => t.username === loggedTeamUser || t.phone === loggedTeamUser || t.teamName === loggedTeamUser);
        if (mem)
            return mem.id;
    }
    return loggedTeamId && loggedTeamId !== 'default' ? loggedTeamId : '';
}
