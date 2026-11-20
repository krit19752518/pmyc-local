import { AdminUser } from '../src/adminAuth';
import { AdminPortal, createAdminSessionToken } from '../src/services/adminSession.service';

export function adminSessionCookie(
  username: string,
  roleCode: AdminUser['roleCode'],
  province?: string
): string[] {
  const portal: AdminPortal = roleCode === 'SAT_OFFICER' ? 'sat' : 'central';
  const user: AdminUser = {
    id: `TEST-${roleCode}`,
    username,
    fullname: username,
    roleCode,
    roleName: roleCode,
    permissions: [],
    province
  };
  const token = encodeURIComponent(createAdminSessionToken(user, portal));

  if (portal === 'sat') {
    return [`sat_admin_session=${token}`, `sat_admin_user=${encodeURIComponent(username)}`];
  }
  return [
    `admin_session_token=${token}`,
    `admin_user=${encodeURIComponent(username)}`,
    'admin_session=true'
  ];
}

export const superAdminCookie = () => adminSessionCookie('admin', 'SUPER_ADMIN');
export const verifierCookie = () => adminSessionCookie('verifier01', 'DOCUMENT_VERIFIER');
export const satOfficerCookie = (username = 'somsak.sat@sports.go.th', province = 'ชลบุรี') =>
  adminSessionCookie(username, 'SAT_OFFICER', province);
