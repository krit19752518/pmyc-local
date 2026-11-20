import { pool } from '../db';
import { teamsDatabase } from './team.model';

export const playersDatabase: Array<any> = [];

// PostgreSQL DATE is a calendar date. UTC serialization can move it to the previous day in Thailand.
function birthDateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return typeof value === 'string' ? value : '';
}

function mapPlayerRow(r: any): any {
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
export async function getPersistedDbPlayers(teamId: string): Promise<any[]> {
  const res = await pool.query(
    'SELECT * FROM football_player WHERE team_id = $1 ORDER BY jersey_no ASC, id ASC',
    [teamId]
  );
  return (res?.rows || []).map(mapPlayerRow);
}

export async function getDbPlayers(teamId?: string, includeTestData = false): Promise<any[]> {
  try {
    let res: any = null;
    if (teamId && teamId !== 'ALL') {
      res = await pool.query(
        'SELECT * FROM football_player WHERE team_id = $1 ORDER BY jersey_no ASC, id ASC',
        [teamId]
      );
    } else {
      res = await pool.query(
        `SELECT p.* FROM football_player p ${includeTestData ? '' : 'LEFT JOIN football_registered_team t ON t.id = p.team_id WHERE COALESCE(t.is_test, FALSE) = FALSE'} ORDER BY p.jersey_no ASC, p.id ASC`
      );
    }
    const dbPlayers = (res && res.rows) ? res.rows.filter((r:any)=>r.category!=='U18F').map(mapPlayerRow) : [];

    const testTeamIds = new Set(teamsDatabase.filter((team: any) => team.isTest || team.is_test).map((team: any) => String(team.id)));
    const memPlayers = (teamId && teamId !== 'ALL')
      ? playersDatabase.filter((p: any) => (p.teamId || p.team_id || '') === teamId)
      : playersDatabase.filter((p: any) => includeTestData || (!p.isTest && !testTeamIds.has(String(p.teamId || p.team_id || ''))));

    const merged = [...dbPlayers];
    for (const memP of memPlayers) {
      if (!merged.some(dbP => String(dbP.id).trim() === String(memP.id).trim())) {
        merged.push(memP);
      }
    }
    return merged;
  } catch (err) {
    console.error('Database query error in getDbPlayers, fallback to memory:', err);
  }
  if (teamId && teamId !== 'ALL') {
    return playersDatabase.filter((p: any) => (p.teamId || p.team_id || '') === teamId);
  }
  const testTeamIds = new Set(teamsDatabase.filter((team: any) => team.isTest || team.is_test).map((team: any) => String(team.id)));
  return playersDatabase.filter((p: any) => includeTestData || (!p.isTest && !testTeamIds.has(String(p.teamId || p.team_id || ''))));
}

export async function getDbPlayerById(id: string): Promise<any> {
  try {
    const res = await pool.query('SELECT * FROM football_player WHERE id = $1', [id]);
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
  } catch (err) {
    console.error('Database query error in getDbPlayerById, fallback to memory:', err);
  }
  return playersDatabase.find((p: any) => p.id === id);
}
