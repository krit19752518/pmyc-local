export interface TeamStatusInfo {
  status: string; // PENDING | APPROVED
  categories?: string;
  submitted_categories?: string;
  submittedCategories?: string;
  cancelled_categories?: string;
  cancelledCategories?: string;
}


export interface PlayerStatusInfo {
  id: string;
  category?: string;
  categories?: string;
  docStatus?: string; // PENDING | APPROVED | REJECTED | ACTION_REQUIRED
  remarks?: string;
}


export interface CategoryPlayerCounts {
  players: number;
  approved: number;
  needsFix: number;
}

/** Owner-confirmed minimum for approving an entered age category. */
export const MIN_APPROVED_CATEGORY_PLAYERS = 18;


interface ApprovalRankTeam extends TeamStatusInfo {
  id: string;
  status: string;
  province?: string;
  district?: string;
  contact_district?: string;
  createdAt?: string | Date;
  created_at?: string | Date;
  teamPlayers?: Array<{ id: string; category?: string; categories?: string; docStatus?: string }>;
}


interface ApprovalEvent {
  event_type: string;
  entity_type: string;
  entity_id: string;
  team_id?: string;
  new_state: Record<string, unknown> | string;
  created_at: string | Date;
}


/** Rank approved teams when their category reaches 18 approved players. */
export function getCompletedApprovalRanks(
  teams: ApprovalRankTeam[],
  category: string,
  events: ApprovalEvent[]
): Map<string, number> {
  const latestTeamEvent = new Map<string, { status: unknown; timestamp: number }>();
  const latestPlayerEvent = new Map<string, { status: unknown; timestamp: number }>();

  for (const event of events) {
    const timestamp = new Date(event.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const state = (typeof event.new_state === 'string' ? JSON.parse(event.new_state) : event.new_state) as Record<string, unknown>;
    if (event.event_type === 'TEAM_STATUS_CHANGED' && event.entity_type === 'TEAM') {
      const teamId = String(event.team_id || event.entity_id);
      latestTeamEvent.set(teamId, { status: state.status, timestamp });
    } else if (event.event_type === 'PLAYER_DOCUMENT_STATUS_CHANGED' && event.entity_type === 'PLAYER') {
      const playerId = String(event.entity_id);
      latestPlayerEvent.set(playerId, { status: state.docStatus, timestamp });
    }
  }

  const completionTimesByArea = new Map<string, Map<string, number>>();
  for (const team of teams) {
    if (team.status !== 'APPROVED') continue;
    const players = (team.teamPlayers || []).filter(player =>
      String(player.category || player.categories || 'U14').toUpperCase().split(',').map(value => value.trim()).includes(category)
    );
    if (getCategoryStatus(team, category, players).text !== 'อนุมัติ') continue;
    const teamEvent = latestTeamEvent.get(String(team.id));
    const playerEvents = players.filter(player => player.docStatus === 'APPROVED')
      .map(player => latestPlayerEvent.get(String(player.id)))
      .filter((event): event is {status: unknown; timestamp: number} => event?.status === 'APPROVED')
      .sort((a, b) => a.timestamp - b.timestamp);
    let approvalCompletion = Number.NaN;
    if (teamEvent?.status === 'APPROVED' && playerEvents.length >= MIN_APPROVED_CATEGORY_PLAYERS) {
      approvalCompletion = Math.max(teamEvent.timestamp, playerEvents[MIN_APPROVED_CATEGORY_PLAYERS - 1].timestamp);
    }
    const registrationTime = new Date(team.createdAt || team.created_at || 0).getTime();
    const areaKey = JSON.stringify([
      String(team.province || '').trim(),
      String(team.district || team.contact_district || '').trim()
    ]);
    const completionTimes = completionTimesByArea.get(areaKey) || new Map<string, number>();
    completionTimes.set(String(team.id), Number.isFinite(approvalCompletion)
      ? approvalCompletion
      : (Number.isFinite(registrationTime) ? registrationTime : 0));
    completionTimesByArea.set(areaKey, completionTimes);
  }

  const ranks = new Map<string, number>();
  for (const completionTimes of completionTimesByArea.values()) {
    [...completionTimes.entries()]
      .sort(([teamIdA, timeA], [teamIdB, timeB]) => timeA - timeB || teamIdA.localeCompare(teamIdB))
      .forEach(([teamId], index) => ranks.set(teamId, index + 1));
  }
  return ranks;
}


export function isPlayerCorrectionRequired(player: PlayerStatusInfo): boolean {
  const explicitStatus = (player.docStatus || '').toUpperCase();
  if (['PENDING', 'APPROVED', 'CORRECTED'].includes(explicitStatus)) return false;
  if (explicitStatus === 'REJECTED' || explicitStatus === 'ACTION_REQUIRED') return true;
  return Boolean(player.remarks);
}
/**
 * Helper to compute category status text and HTML badge
 */
function getCategoryStatus(team: TeamStatusInfo, categoryCode: string, teamPlayers: PlayerStatusInfo[] = []) {
    const code = categoryCode.trim().toUpperCase();
    const regCats = (team.categories || '').split(',').map(c => c.trim().toUpperCase());
    const emptyCounts = { players: 0, approved: 0, needsFix: 0 };
    // 1. "ไม่ได้ลงทะเบียน" - Team did not register this age category
    if (!regCats.includes(code)) {
        return {
            text: 'ไม่ได้ลงทะเบียน',
            badgeHtml: '<span class="text-muted small">ไม่ได้ลงทะเบียน</span>',
            counts: emptyCounts
        };
    }
    // Filter players that belong to this category
    const playersInCat = teamPlayers.filter(p => {
        const pCatStr = (p.category || p.categories || '').toUpperCase();
        return pCatStr.split(',').map(c => c.trim()).includes(code);
    });
    const subCatsStr = team.submitted_categories || team.submittedCategories || '';
    const subCats = subCatsStr.split(',').map(c => c.trim().toUpperCase());
    const isCategorySubmitted = subCats.includes(code);
    const needsFixPlayers = playersInCat.filter(p => isPlayerCorrectionRequired(p));
    const counts = {
        players: playersInCat.length,
        approved: playersInCat.filter(p => p.docStatus === 'APPROVED').length,
        needsFix: needsFixPlayers.length
    };
    const cancelledCatsStr = team.cancelled_categories || team.cancelledCategories || '';
    const cancelledCats = cancelledCatsStr.split(',').map(c => c.trim().toUpperCase());
    if (cancelledCats.includes(code)) {
        return {
            text: 'ยกเลิกการสมัคร',
            badgeHtml: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-x-circle me-1"></i>ยกเลิกการสมัคร</span>',
            counts
        };
    }
    // 2. "รอเพิ่มนักกีฬา" - Team has not added players or category roster has not been submitted by team yet
    if (playersInCat.length === 0 || !isCategorySubmitted) {
        return {
            text: 'รอเพิ่มนักกีฬา',
            badgeHtml: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1"><i class="bi bi-person-plus me-1"></i>รอเพิ่มนักกีฬา</span>',
            counts
        };
    }
    // Check player approval statuses within this category
    const hasRejected = needsFixPlayers.length > 0;
    const categoryApproved = counts.approved >= MIN_APPROVED_CATEGORY_PLAYERS;
    if (categoryApproved) {
        return {
            text: 'อนุมัติ',
            badgeHtml: '<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>อนุมัติ</span>',
            counts
        };
    }
    // At least one player needs correction after review.
    if (hasRejected) {
        return {
            text: 'ปรับแก้ข้อมูลนักกีฬา',
            badgeHtml: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-exclamation-circle-fill me-1"></i>ปรับแก้ข้อมูลนักกีฬา</span>',
            counts
        };
    }
    // 4. "รอตรวจสอบ" - Roster submitted, waiting for SAT verification
    return {
        text: 'รอตรวจสอบ',
        badgeHtml: '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1"><i class="bi bi-hourglass-split me-1"></i>รอตรวจสอบ</span>',
        counts
    };
}


/**
 * Helper to compute team status text and badge
 */
export function getTeamStatusInfo(status: string): { text: string; badgeHtml: string; colorClass: string } {
  if (status === 'APPROVED') {
    return {
      text: 'อนุมัติทีม',
      badgeHtml: '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-circle me-1"></i> อนุมัติทีม</span>',
      colorClass: 'bg-success text-white'
    };
  }
  if (status === 'REJECTED') {
    return {
      text: 'ไม่อนุมัติ',
      badgeHtml: '<span class="badge bg-danger px-3 py-2"><i class="bi bi-x-circle me-1"></i> ไม่อนุมัติ</span>',
      colorClass: 'bg-danger text-white'
    };
  }
  return {
    text: 'รอตรวจสอบทีม',
    badgeHtml: '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบทีม</span>',
    colorClass: 'bg-warning text-dark'
  };
}


/**
 * Helper to compute player document status text and badge for team/players.php
 */
export function getPlayerDocStatusInfo(
  player: PlayerStatusInfo,
  team: TeamStatusInfo
): { text: string; badgeHtml: string } {
  const pCat = (player.category || player.categories || 'U14').split(',')[0].trim().toUpperCase();
  const subCatsStr = team.submitted_categories || team.submittedCategories || '';
  const subCats = subCatsStr.split(',').map(c => c.trim().toUpperCase());
  const isCategorySubmitted = subCats.includes(pCat);

  // Athlete correction signals take precedence over an approval flag.
  if (isPlayerCorrectionRequired(player)) {
    return {
      text: 'ปรับแก้ข้อมูลนักกีฬา',
      badgeHtml: '<span class="badge bg-danger"><i class="bi bi-exclamation-circle me-1"></i> ปรับแก้ข้อมูลนักกีฬา</span>'
    };
  }

  if (player.docStatus === 'CORRECTED') {
    return {
      text: 'แก้ไขข้อมูลเรียบร้อย',
      badgeHtml: '<span class="badge bg-info text-dark"><i class="bi bi-pencil-square me-1"></i> แก้ไขข้อมูลเรียบร้อย</span>'
    };
  }

  // Approved player without outstanding remarks.
  if (player.docStatus === 'APPROVED') {
    return {
      text: 'อนุมัติ',
      badgeHtml: '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i> อนุมัติ</span>'
    };
  }

  // Default -> "รอตรวจสอบ"
  return {
    text: 'รอตรวจสอบ',
    badgeHtml: '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบ</span>'
  };
}
export { getCategoryStatus as getCategoryStatus };
