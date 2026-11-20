import { pool } from '../db';
import { teamsDatabase } from './team.model';

export const officialsDatabase: Array<any> = [];

export const OFFICIAL_POSITION_PRIORITY = [
  'ผู้จัดการทีม',
  'ผู้ฝึกสอน',
  'ผู้ช่วยผู้ฝึกสอน',
  'เจ้าหน้าที่ประจำทีม',
  'แพทย์ประจำทีม',
  'นักกายภาพบำบัด'
] as const;

export function getOfficialForCategoryAndPosition(officials: any[], category: string, position: string): any | null {
  const normalizedCategory = String(category || '').trim().toUpperCase();
  const normalizedPosition = String(position || '').trim();
  return officials.find((official: any) => {
    const officialCategories = String(official.categories || official.category || 'U14')
      .toUpperCase()
      .split(',')
      .map((item: string) => item.trim());
    return String(official.position || '').trim() === normalizedPosition && officialCategories.includes(normalizedCategory);
  }) || null;
}

export function getTopOfficialForCategory(officials: any[], category: string): any | null {
  const normalizedCategory = category.trim().toUpperCase();
  const categoryOfficials = officials.filter((official: any) =>
    String(official.categories || official.category || 'U14')
      .toUpperCase()
      .split(',')
      .map((item: string) => item.trim())
      .includes(normalizedCategory)
  );

  return categoryOfficials.reduce((top: any | null, official: any) => {
    if (!top) return official;
    const officialPosition = String(official.position || '').trim();
    const topPosition = String(top.position || '').trim();
    const officialRank = OFFICIAL_POSITION_PRIORITY.indexOf(officialPosition as typeof OFFICIAL_POSITION_PRIORITY[number]);
    const topRank = OFFICIAL_POSITION_PRIORITY.indexOf(topPosition as typeof OFFICIAL_POSITION_PRIORITY[number]);
    if (officialRank >= 0 && (topRank < 0 || officialRank < topRank)) return official;
    return top;
  }, null);
}

export async function getDbOfficials(teamId?: string, includeTestData = false): Promise<any[]> {
  let dbOfficials: any[] = [];
  try {
    let res: any = null;
    if (teamId && teamId !== 'ALL') {
      res = await pool.query(
        'SELECT * FROM football_official WHERE team_id = $1 ORDER BY id ASC',
        [teamId]
      );
    } else {
      res = await pool.query(
        `SELECT o.* FROM football_official o ${includeTestData ? '' : 'LEFT JOIN football_registered_team t ON t.id = o.team_id WHERE COALESCE(t.is_test, FALSE) = FALSE'} ORDER BY o.id ASC`
      );
    }
    if (res && res.rows && res.rows.length > 0) {
      dbOfficials = res.rows.map((r: any) => ({
        id: r.id,
        teamId: r.team_id || '',
        name: r.name,
        position: r.position,
        idCard: r.id_card || '',
        docIdCard: r.doc_id_card || '',
        doc_id_card: r.doc_id_card || '',
        phone: r.phone || '',
        email: r.email || '',
        photoUrl: r.photo_url || r.photoUrl || '',
        photo_url: r.photo_url || r.photoUrl || '',
        categories: r.categories || 'U14',
        hasLicense: r.has_license || 'NO',
        licenseType: r.license_type || '',
        licenseSerial: r.license_serial || '',
        docStatus: r.doc_status || 'APPROVED'
      }));
    }
  } catch (err) {
    console.error('Database query error in getDbOfficials, fallback to memory:', err);
  }

  const testTeamIds = new Set(teamsDatabase.filter((team: any) => team.isTest || team.is_test).map((team: any) => String(team.id)));
  const memOfficials = teamId && teamId !== 'ALL'
    ? officialsDatabase.filter((o: any) => o.teamId === teamId)
    : officialsDatabase.filter((o: any) => includeTestData || (!o.isTest && !testTeamIds.has(String(o.teamId || o.team_id || ''))));

  const merged = [...dbOfficials];
  for (const m of memOfficials) {
    if (!merged.some(d => String(d.id).trim() === String(m.id).trim())) {
      merged.push(m);
    }
  }
  return merged.filter((o:any)=>o.categories!=='U18F');
}
