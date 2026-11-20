import { Request } from 'express';
import { pool } from '../db';
import { parseCategories, parseCookies } from '../utils/helpers';

export const teamsDatabase: Array<any> = [];

export const teamProfile: any = {
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

export async function getDbTeamProfile(req?: Request) {
  const cookies = req ? parseCookies(req) : {};
  const rawId = (req?.query?.id || '') as string;
  const queryTeamId = (req?.query?.teamId || (rawId.startsWith('FTM-') ? rawId : '')) as string;
  const loggedTeamId = queryTeamId || cookies.team_id || '';
  const loggedTeamUser = cookies.team_user ? decodeURIComponent(cookies.team_user as string) : '';

  try {
    let res: any = null;
    if (loggedTeamId && loggedTeamId !== 'default') {
      res = await pool.query('SELECT * FROM football_registered_team WHERE id::text = $1', [String(loggedTeamId)]);
    } else if (loggedTeamUser) {
      res = await pool.query(
        'SELECT t.* FROM football_registered_team t LEFT JOIN (SELECT team_id, COUNT(*) as p_count FROM football_player GROUP BY team_id) p ON t.id = p.team_id WHERE t.phone = $1 OR t.username = $1 OR t.email = $1 OR t.team_name = $1 ORDER BY COALESCE(p.p_count, 0) DESC, t.id ASC LIMIT 1',
        [loggedTeamUser]
      );
    }

    if (res && res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      const cats = row.categories === '' ? [] : parseCategories({ categories: row.categories, category: row.category });
      let userTeamsList: any[] = [];
      if (loggedTeamUser) {
        try {
          const userTeamsRes = await pool.query(
            'SELECT id, team_name FROM football_registered_team WHERE phone = $1 OR username = $1 OR email = $1 OR team_name = $1 ORDER BY id ASC',
            [loggedTeamUser]
          );
          if (userTeamsRes && userTeamsRes.rows.length > 1) {
            userTeamsList = userTeamsRes.rows.map(r => ({
              id: r.id,
              school: r.team_name || r.id,
              isCurrent: String(r.id) === String(row.id)
            }));
          }
        } catch (e) {}
      }
      const memTeam = teamsDatabase.find(t => String(t.id).trim() === String(row.id).trim());
      return {
        id: row.id,
        isDemo: Boolean(row.is_test),
        school: (memTeam?.teamName || memTeam?.school) || row.team_name || row.school || teamProfile.school || '',
        school_code: (memTeam?.school_code) ?? row.school_code ?? teamProfile.school_code ?? '',
        province: memTeam?.province || row.province || teamProfile.province || '',
        bkk_zone: memTeam?.bkk_zone ?? row.bkk_zone ?? teamProfile.bkk_zone ?? '',
        district: memTeam?.district ?? row.district ?? teamProfile.district ?? '',
        gender: memTeam?.gender || row.gender || teamProfile.gender || 'boy',
        categories: cats,
        managerName: (memTeam?.managerName) || row.manager_name || row.managerName || teamProfile.managerName || '',
        email: memTeam?.email ?? row.email ?? teamProfile.email ?? '',
        phone: memTeam?.phone || row.phone || teamProfile.phone || '',
        line_id: memTeam?.line_id ?? row.line_id ?? teamProfile.line_id ?? '',
        house_no: memTeam?.house_no ?? row.house_no ?? teamProfile.house_no ?? '',
        road: memTeam?.road ?? row.road ?? teamProfile.road ?? '',
        subdistrict: memTeam?.subdistrict ?? row.subdistrict ?? teamProfile.subdistrict ?? '',
        contact_district: memTeam?.contact_district ?? row.contact_district ?? teamProfile.contact_district ?? '',
        contact_subdistrict: memTeam?.contact_subdistrict ?? row.contact_subdistrict ?? row.subdistrict ?? (teamProfile.contact_subdistrict || teamProfile.subdistrict || ''),
        contact_province: memTeam?.contact_province ?? row.contact_province ?? row.province ?? teamProfile.contact_province ?? teamProfile.province ?? '',
        docTeamCert: row.doc_team_cert || memTeam?.docTeamCert || memTeam?.doc_team_cert || teamProfile.docTeamCert || '',
        doc_team_cert: row.doc_team_cert || memTeam?.docTeamCert || memTeam?.doc_team_cert || teamProfile.docTeamCert || '',
        docRoster: row.doc_roster || memTeam?.docRoster || memTeam?.doc_roster || teamProfile.docRoster || '',
        doc_roster: row.doc_roster || memTeam?.docRoster || memTeam?.doc_roster || teamProfile.docRoster || '',
        submitted_categories: row.submitted_categories ?? memTeam?.submitted_categories ?? memTeam?.submittedCategories ?? teamProfile.submitted_categories ?? '',
        cancelled_categories: row.cancelled_categories ?? memTeam?.cancelled_categories ?? memTeam?.cancelledCategories ?? teamProfile.cancelled_categories ?? '',
        status: ['APPROVED', 'REJECTED'].includes(row.status) ? row.status : 'PENDING',
        reject_reason: row.reject_reason || memTeam?.rejectReason || memTeam?.reject_reason || teamProfile.reject_reason || '',
        createdAt: row.created_at || memTeam?.createdAt || memTeam?.created_at || '',
        userTeams: userTeamsList
      };
    }
  } catch (err) {
    console.error('Database query error in getDbTeamProfile, fallback to memory:', err);
  }

  if (loggedTeamUser || loggedTeamId) {
    const memTeam = teamsDatabase.find(t => t.id === loggedTeamId || t.username === loggedTeamUser || t.email === loggedTeamUser || t.phone === loggedTeamUser || t.teamName === loggedTeamUser);
    if (memTeam) {
      const cats = String(memTeam.categories ?? '').trim() === '' && memTeam.categories !== undefined
                ? []
                : parseCategories({ registeredCategories: memTeam.registeredCategories, categories: memTeam.categories, category: memTeam.category });
      return {
        id: memTeam.id,
        isDemo: Boolean(memTeam.isTest || memTeam.is_test),
        school: memTeam.teamName || memTeam.school || teamProfile.school || '',
        school_code: memTeam.school_code ?? teamProfile.school_code ?? '',
        province: memTeam.province || teamProfile.province || '',
        bkk_zone: memTeam.bkk_zone ?? teamProfile.bkk_zone ?? '',
        district: memTeam.district ?? teamProfile.district ?? '',
        gender: memTeam.gender || teamProfile.gender || 'boy',
        categories: cats,
        managerName: memTeam.managerName || teamProfile.managerName || '',
        email: memTeam.email ?? teamProfile.email ?? '',
        phone: memTeam.phone || teamProfile.phone || '',
        line_id: memTeam.line_id ?? teamProfile.line_id ?? '',
        house_no: memTeam.house_no ?? teamProfile.house_no ?? '',
        road: memTeam.road ?? teamProfile.road ?? '',
        subdistrict: memTeam.subdistrict ?? teamProfile.subdistrict ?? '',
        contact_district: memTeam.contact_district ?? teamProfile.contact_district ?? '',
        contact_subdistrict: memTeam.contact_subdistrict ?? memTeam.subdistrict ?? (teamProfile.contact_subdistrict || teamProfile.subdistrict || ''),
        contact_province: memTeam.contact_province ?? memTeam.province ?? teamProfile.contact_province ?? teamProfile.province ?? '',
        docTeamCert: memTeam.docTeamCert || memTeam.doc_team_cert || teamProfile.docTeamCert || '',
        docRoster: memTeam.docRoster || memTeam.doc_roster || teamProfile.docRoster || '',
        submitted_categories: memTeam.submitted_categories ?? memTeam.submittedCategories ?? teamProfile.submitted_categories ?? '',
        cancelled_categories: memTeam.cancelled_categories ?? memTeam.cancelledCategories ?? teamProfile.cancelled_categories ?? '',
        status: ['APPROVED', 'REJECTED'].includes(memTeam.status) ? memTeam.status : 'PENDING',
        reject_reason: memTeam.rejectReason || memTeam.reject_reason || teamProfile.reject_reason || '',
        createdAt: memTeam.createdAt || memTeam.created_at || ''
      };
    }
  }

  return teamProfile;
}

export async function getDbRegisteredTeams(includeTestData = false) {
  const dbTeams: any[] = [];
  try {
    const res = await pool.query(
      `SELECT * FROM football_registered_team ${includeTestData ? '' : 'WHERE COALESCE(is_test, FALSE) = FALSE'} ORDER BY created_at DESC`
    );
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
  } catch (err) {
    console.error('Database query error in getDbRegisteredTeams, fallback to memory:', err);
  }

  const merged = [...dbTeams];
  for (const memT of teamsDatabase) {
    if (!includeTestData && (memT.isTest || memT.is_test)) continue;
    const isDel = Boolean(memT.is_deleted || memT.isDeleted);
    const normalizedMem = {
      ...memT,
      status: ['APPROVED', 'REJECTED'].includes(memT.status) ? memT.status : 'PENDING',
      is_deleted: isDel
    };
    const dbIndex = merged.findIndex(dbT => String(dbT.id).trim() === String(memT.id).trim());
    if (dbIndex >= 0) {
      continue;
    } else {
      merged.push(normalizedMem);
    }
  }

  merged.sort((a, b) => {
    const timeA = a.createdAt || a.created_at ? new Date(a.createdAt || a.created_at).getTime() : 0;
    const timeB = b.createdAt || b.created_at ? new Date(b.createdAt || b.created_at).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''), 'th');
  });

  return merged;
}

export async function getLoggedTeamId(req?: Request, allowQueryTeamOverride = true): Promise<string> {
  if (!req) return 'FTM-001';
  const cookies = parseCookies(req);
  const queryTeamId = (req.query?.teamId as string || '').trim();
  if (allowQueryTeamOverride && queryTeamId) return queryTeamId;

  const loggedTeamId = cookies.team_id || '';
  if (loggedTeamId && loggedTeamId !== 'default') {
    return loggedTeamId;
  }

  const loggedTeamUser = cookies.team_user ? decodeURIComponent(cookies.team_user as string) : '';
  if (loggedTeamUser) {
    try {
      const res = await pool.query(
        'SELECT t.id FROM football_registered_team t LEFT JOIN (SELECT team_id, COUNT(*) as p_count FROM football_player GROUP BY team_id) p ON t.id = p.team_id WHERE t.phone = $1 OR t.username = $1 OR t.team_name = $1 ORDER BY COALESCE(p.p_count, 0) DESC, t.id ASC LIMIT 1',
        [loggedTeamUser]
      );
      if (res && res.rows && res.rows.length > 0) {
        return res.rows[0].id;
      }
    } catch (e) {
      console.error('Database query error in getLoggedTeamId, fallback to memory:', e);
    }
    const mem = teamsDatabase.find(t => t.username === loggedTeamUser || t.phone === loggedTeamUser || t.teamName === loggedTeamUser);
    if (mem) return mem.id;
  }

  return loggedTeamId && loggedTeamId !== 'default' ? loggedTeamId : '';
}
