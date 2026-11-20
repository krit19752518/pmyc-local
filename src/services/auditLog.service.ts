import { Request } from 'express';
import { getAdminUserByUsername } from '../adminAuth';
import { pool } from '../db';
import { parseCookies } from '../utils/helpers';
import { verifyTeamSessionCookies } from './teamSession.service';

export type AuditState = Record<string, string | string[] | boolean | null>;

export interface AuditLogEntry {
  eventType: string;
  entityType: 'TEAM' | 'PLAYER' | 'OFFICIAL' | 'SUPPORT_REPORT' | 'SUPPORT_MESSAGE' | 'ADMIN_USER' | 'SAT_OFFICER' | 'BRACKET' | 'HTTP_REQUEST';
  entityId: string;
  teamId: string | null;
  oldState?: AuditState;
  newState?: AuditState;
  metadata?: Record<string, string | boolean | null>;
}

const auditFieldAllowlist: Record<'TEAM' | 'PLAYER' | 'OFFICIAL', readonly string[]> = {
  TEAM: ['teamName', 'province', 'district', 'gender', 'categories', 'status', 'isDeleted'],
  PLAYER: ['category', 'jerseyNo', 'position', 'docStatus'],
  OFFICIAL: ['position', 'categories', 'hasLicense', 'licenseType', 'docStatus']
};

const auditFieldLabels: Record<string, string> = {
  teamName: 'ชื่อทีม', province: 'จังหวัด', district: 'อำเภอ', gender: 'ประเภททีม',
  categories: 'รุ่นแข่งขัน', status: 'สถานะทีม', isDeleted: 'สถานะการลบ',
  category: 'รุ่นแข่งขัน', jerseyNo: 'หมายเลขเสื้อ', position: 'ตำแหน่ง',
  docStatus: 'สถานะเอกสาร', hasLicense: 'มีใบอนุญาต', licenseType: 'ประเภทใบอนุญาต',
  managerName: 'ชื่อผู้จัดการทีม', email: 'อีเมล', phone: 'เบอร์โทรศัพท์', lineId: 'LINE ID',
  schoolCode: 'รหัสสถานศึกษา', address: 'ที่อยู่ติดต่อ', name: 'ชื่อ', idCard: 'เลขบัตรประชาชน',
  birthDate: 'วันเกิด', domicile: 'ภูมิลำเนา', height: 'ส่วนสูง', weight: 'น้ำหนัก',
  school: 'สถานศึกษา', grade: 'ชั้นเรียน', guardianName: 'ชื่อผู้ปกครอง',
  guardianRelation: 'ความสัมพันธ์ผู้ปกครอง', fivbId: 'รหัสนักกีฬา', licenseSerial: 'เลขใบอนุญาต',
  attachment: 'ไฟล์แนบ'
};

const auditSensitiveFields: Record<'TEAM' | 'PLAYER' | 'OFFICIAL', readonly string[]> = {
  TEAM: ['managerName', 'email', 'phone', 'lineId', 'schoolCode', 'address', 'attachment'],
  PLAYER: ['name', 'idCard', 'birthDate', 'domicile', 'height', 'weight', 'school', 'grade', 'guardianName', 'guardianRelation', 'phone', 'fivbId', 'attachment'],
  OFFICIAL: ['name', 'idCard', 'phone', 'email', 'licenseSerial', 'attachment']
};

function normalizedAuditValue(value: unknown): string | string[] | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).sort();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return String(value);
  const text = String(value).trim();
  return text.includes(',') ? text.split(',').map(item => item.trim()).filter(Boolean).sort() : text;
}

/** Builds privacy-limited old/new snapshots and excludes unchanged or non-allowlisted fields. */
export function getAuditFieldChanges(
  entityType: 'TEAM' | 'PLAYER' | 'OFFICIAL',
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { oldState: AuditState; newState: AuditState; changedFields: string[] } {
  const oldState: AuditState = {};
  const newState: AuditState = {};
  const changedFields: string[] = [];
  for (const field of auditFieldAllowlist[entityType]) {
    const oldValue = normalizedAuditValue(before[field]);
    const newValue = normalizedAuditValue(after[field]);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    oldState[field] = oldValue;
    newState[field] = newValue;
    changedFields.push(auditFieldLabels[field] || field);
  }
  for (const field of auditSensitiveFields[entityType]) {
    if (JSON.stringify(normalizedAuditValue(before[field])) !== JSON.stringify(normalizedAuditValue(after[field]))) {
      changedFields.push(auditFieldLabels[field] || field);
    }
  }
  return { oldState, newState, changedFields };
}

export async function writeAuditLog(req: Request, entry: AuditLogEntry, executor: { query: (sql: string, values?: unknown[]) => Promise<any> } = pool): Promise<void> {
  let adminUser = (req as any).adminUser;
  const supportReporter = (req as any).supportReporter;
  const cookies = parseCookies(req);
  if (!adminUser && cookies.admin_session === 'true' && cookies.admin_user) {
    try {
      adminUser = await getAdminUserByUsername(cookies.admin_user);
      if (adminUser) (req as any).adminUser = adminUser;
    } catch {
      // An unavailable actor lookup must not replace or expose the mutation's own error.
    }
  }
  const signedTeamSession = verifyTeamSessionCookies(cookies);
  const actorOverride = (req as any).auditActor as {
    actorType: 'ADMIN' | 'TEAM'; actorId: string; actorName: string; actorRole: string; actorProvince?: string | null; teamId?: string | null;
  } | undefined;
  const supportRole = String(supportReporter?.role || '');
  const authenticatedAdmin = adminUser?.id || adminUser?.username ? adminUser :
    supportRole && supportRole !== 'TEAM_MANAGER' ? supportReporter : null;
  const actorIdentitySource = actorOverride ? 'SERVER_CREATED_IDENTITY'
    : authenticatedAdmin ? 'ADMIN_SESSION_LOOKUP'
      : signedTeamSession ? 'SIGNED_TEAM_SESSION' : 'NO_VERIFIED_PRINCIPAL';
  const actorType = actorOverride?.actorType || (authenticatedAdmin ? 'ADMIN' : signedTeamSession ? 'TEAM' : 'ANONYMOUS');
  const actorId = actorOverride?.actorId || (authenticatedAdmin
    ? String(authenticatedAdmin.id || authenticatedAdmin.userId || authenticatedAdmin.username || '') || null
    : signedTeamSession ? signedTeamSession.teamUser : null);
  const actorName = actorOverride?.actorName || (authenticatedAdmin
    ? String(authenticatedAdmin.fullname || authenticatedAdmin.name || authenticatedAdmin.username || authenticatedAdmin.id || '') || null
    : signedTeamSession ? signedTeamSession.teamUser : null);
  const actorRole = actorOverride?.actorRole || (authenticatedAdmin
    ? String(authenticatedAdmin.roleCode || authenticatedAdmin.role || 'ADMIN')
    : signedTeamSession ? 'TEAM_MANAGER' : 'ANONYMOUS');
  const actorProvince = actorOverride?.actorProvince || (authenticatedAdmin?.province ? String(authenticatedAdmin.province) : null);
  const teamId = actorOverride?.teamId || signedTeamSession?.teamId || null;
  const requestId = String((req as any).auditRequestId || '');
  const matchedRoute = (req as any).route?.path;
  const routeFromHandler = typeof matchedRoute === 'string'
    ? `${req.baseUrl || ''}${matchedRoute}`
    : Array.isArray(matchedRoute) ? `${req.baseUrl || ''}${matchedRoute.join('|')}` : '';
  const auditRoute = String((req as any).auditRoute || '');
  const metadata = {
    ...(entry.metadata || {}),
    ...(requestId ? {
      requestId,
      actorIdentitySource,
      requestMethod: String(req.method || ''),
      requestRoute: auditRoute && auditRoute !== '<unmatched-route>' ? auditRoute : routeFromHandler
    } : {})
  };

  await executor.query(
    `INSERT INTO football_audit_log (
      event_type, actor_type, actor_id, actor_name, actor_role, actor_province,
      team_id, entity_type, entity_id, old_state, new_state, metadata,
      ip_address, user_agent, request_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15)`,
    [
      entry.eventType,
      actorType,
      actorId,
      actorName,
      actorRole,
      actorProvince,
      entry.teamId || teamId,
      entry.entityType,
      entry.entityId,
      JSON.stringify(entry.oldState || {}),
      JSON.stringify(entry.newState || {}),
      JSON.stringify(metadata),
      req.ip || null,
      req.get('user-agent') || null,
      requestId || null
    ]
  );
  (req as any).auditEventCount = Number((req as any).auditEventCount || 0) + 1;
}
