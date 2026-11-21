import { getCategoryStatus, getTeamStatusInfo, getPlayerDocStatusInfo, isPlayerCorrectionRequired } from '../src/utils/statusHelper';

describe('Status Helper Unit Tests', () => {
  describe('getTeamStatusInfo()', () => {
    it('UT-TEAM-STATUS-01: Should return "รอตรวจสอบทีม" for PENDING status', () => {
      const res = getTeamStatusInfo('PENDING');
      expect(res.text).toBe('รอตรวจสอบทีม');
      expect(res.badgeHtml).toContain('รอตรวจสอบทีม');
    });

    it('UT-TEAM-STATUS-02: Should return "อนุมัติทีม" for APPROVED status', () => {
      const res = getTeamStatusInfo('APPROVED');
      expect(res.text).toBe('อนุมัติทีม');
      expect(res.badgeHtml).toContain('อนุมัติทีม');
    });

    it('UT-TEAM-STATUS-03: Should return "ไม่อนุมัติ" for REJECTED status', () => {
      const res = getTeamStatusInfo('REJECTED');
      expect(res.text).toBe('ไม่อนุมัติ');
      expect(res.badgeHtml).toContain('ไม่อนุมัติ');
      expect(res.colorClass).toBe('bg-danger text-white');
    });

    it('UT-TEAM-STATUS-04: Unknown legacy statuses remain in the pending team state', () => {
      for (const status of ['NOT_SUBMITTED']) {
        const res = getTeamStatusInfo(status);
        expect(res.text).toBe('รอตรวจสอบทีม');
        expect(res.badgeHtml).toContain('รอตรวจสอบทีม');
      }
    });
  });

  describe('getCategoryStatus()', () => {
    it('UT-CAT-STATUS-01: Should return "ไม่ได้ลงทะเบียน" when team did not register category', () => {
      const team = { status: 'PENDING', categories: 'U14,U16' };
      const res = getCategoryStatus(team, 'U18', []);
      expect(res.text).toBe('ไม่ได้ลงทะเบียน');
      expect(res.badgeHtml).toContain('ไม่ได้ลงทะเบียน');
    });

    it('UT-CAT-STATUS-02: Should return "รอเพิ่มนักกีฬา" when category registered but 0 players added', () => {
      const team = { status: 'PENDING', categories: 'U14,U16' };
      const res = getCategoryStatus(team, 'U14', []);
      expect(res.text).toBe('รอเพิ่มนักกีฬา');
      expect(res.badgeHtml).toContain('รอเพิ่มนักกีฬา');
    });

    it('UT-CAT-STATUS-03: Should return "รอเพิ่มนักกีฬา" when players exist but category roster is not submitted', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: '' };
      const players = [{ id: 'P1', category: 'U14', docStatus: 'PENDING' }];
      const res = getCategoryStatus(team, 'U14', players);
      expect(res.text).toBe('รอเพิ่มนักกีฬา');
      expect(res.badgeHtml).toContain('รอเพิ่มนักกีฬา');
    });

    it('UT-CAT-STATUS-03B: Should return "รอเพิ่มนักกีฬา" even when team status is APPROVED if category roster is not submitted', () => {
      const team = { status: 'APPROVED', categories: 'U14,U18', submitted_categories: 'U14' };
      const players = [{ id: 'P1', category: 'U18', docStatus: 'PENDING' }];
      const res = getCategoryStatus(team, 'U18', players);
      expect(res.text).toBe('รอเพิ่มนักกีฬา');
      expect(res.badgeHtml).toContain('รอเพิ่มนักกีฬา');
    });

    it('UT-CAT-STATUS-CANCELLED: canceled category takes precedence over roster readiness', () => {
      const team = { status: 'PENDING', categories: 'U16,U18', cancelled_categories: 'U18', submitted_categories: '' };
      const res = getCategoryStatus(team, 'U18', []);

      expect(res.text).toBe('ยกเลิกการสมัคร');
      expect(res.badgeHtml).toContain('bg-danger-subtle');
      expect(res.badgeHtml).toContain('ยกเลิกการสมัคร');
    });

    it('UT-CAT-STATUS-04: Should return "รอตรวจสอบ" when roster submitted and players pending', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: 'U14' };
      const players = [{ id: 'P1', category: 'U14', docStatus: 'PENDING' }];
      const res = getCategoryStatus(team, 'U14', players);
      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.badgeHtml).toContain('รอตรวจสอบ');
    });

    it('UT-CAT-STATUS-05: Should return "อนุมัติ" when all players in category are approved', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: 'U14' };
      const players = [
        { id: 'P1', category: 'U14', docStatus: 'APPROVED' },
        { id: 'P2', category: 'U14', docStatus: 'APPROVED' }
      ];
      const res = getCategoryStatus(team, 'U14', players);
      expect(res.text).toBe('อนุมัติ');
      expect(res.badgeHtml).toContain('อนุมัติ');
    });

    it('UT-CAT-STATUS-06: Should ask to correct athlete data when at least one player needs changes', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: 'U14' };
      const players = [
        { id: 'P1', category: 'U14', docStatus: 'APPROVED' },
        { id: 'P2', category: 'U14', docStatus: 'REJECTED' }
      ];
      const res = getCategoryStatus(team, 'U14', players);
      expect(res.text).toBe('ปรับแก้ข้อมูลนักกีฬา');
      expect(res.badgeHtml).toContain('ปรับแก้ข้อมูลนักกีฬา');
    });

    it('UT-CAT-STATUS-CORRECTED: A corrected player with the original remark waits for staff review', () => {
      const team = { status: 'APPROVED', categories: 'U14', submitted_categories: 'U14' };
      const players = [{ id: 'P1', category: 'U14', docStatus: 'CORRECTED', remarks: 'แก้เอกสารตามที่แจ้ง' }];
      const res = getCategoryStatus(team, 'U14', players);

      expect(isPlayerCorrectionRequired(players[0])).toBe(false);
      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.counts).toEqual({ players: 1, approved: 0, needsFix: 0 });
    });

    it('UT-CAT-STATUS-PENDING-REMARK: Explicit PENDING status waits for review even when an old remark remains', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'PENDING', remarks: 'หมายเหตุเดิม' };
      const res = getCategoryStatus(team, 'U14', [player]);

      expect(isPlayerCorrectionRequired(player)).toBe(false);
      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.counts).toEqual({ players: 1, approved: 0, needsFix: 0 });
    });

    it('UT-CAT-COUNTS-01: Counts roster and document statuses even before category submission', () => {
      const team = { status: 'PENDING', categories: 'U14,U18', submitted_categories: 'U14' };
      const players = [
        { id: 'P1', category: 'U14', docStatus: 'APPROVED' },
        { id: 'P2', category: 'U14', docStatus: 'APPROVED', remarks: 'ตรวจซ้ำ' },
        { id: 'P3', category: 'U14', docStatus: 'ACTION_REQUIRED' },
        { id: 'P4', category: 'U14', docStatus: 'PENDING' },
        { id: 'P5', category: 'U14,U18', docStatus: 'REJECTED' },
        { id: 'P6', category: 'U18', docStatus: 'APPROVED' }
      ];

      expect(getCategoryStatus(team, 'U14', players).counts).toEqual({ players: 5, approved: 2, needsFix: 2 });
      expect(getCategoryStatus(team, 'U18', players).counts).toEqual({ players: 2, approved: 1, needsFix: 1 });
    });

    it('UT-CAT-STATUS-APPROVED-REMARK: Explicitly approved players are approved even when an old remark remains', () => {
      const team = { status: 'PENDING', categories: 'U14', submitted_categories: 'U14' };
      const players = [{ id: 'P1', category: 'U14', docStatus: 'APPROVED', remarks: 'หมายเหตุเดิม' }];
      const res = getCategoryStatus(team, 'U14', players);

      expect(isPlayerCorrectionRequired(players[0])).toBe(false);
      expect(res.text).toBe('อนุมัติ');
      expect(res.counts).toEqual({ players: 1, approved: 1, needsFix: 0 });
    });
  });

  describe('getPlayerDocStatusInfo()', () => {
    it('UT-PLAYER-STATUS-01: Should return "รอตรวจสอบ" when team has not submitted category', () => {
      const team = { status: 'PENDING', submitted_categories: '' };
      const player = { id: 'P1', category: 'U14', docStatus: 'PENDING' };
      const res = getPlayerDocStatusInfo(player, team);
      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.badgeHtml).toContain('รอตรวจสอบ');
    });

    it('UT-PLAYER-STATUS-02: Should return "รอตรวจสอบ" when category submitted and player docStatus pending', () => {
      const team = { status: 'PENDING', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'PENDING' };
      const res = getPlayerDocStatusInfo(player, team);
      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.badgeHtml).toContain('รอตรวจสอบ');
    });

    it('UT-PLAYER-STATUS-03: Should return "อนุมัติ" when player docStatus is APPROVED', () => {
      const team = { status: 'PENDING', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'APPROVED' };
      const res = getPlayerDocStatusInfo(player, team);
      expect(res.text).toBe('อนุมัติ');
      expect(res.badgeHtml).toContain('อนุมัติ');
    });

    it('UT-PLAYER-STATUS-04: Should ask to correct athlete data when player docStatus is rejected', () => {
      const team = { status: 'PENDING', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'REJECTED' };
      const res = getPlayerDocStatusInfo(player, team);
      expect(res.text).toBe('ปรับแก้ข้อมูลนักกีฬา');
      expect(res.badgeHtml).toContain('ปรับแก้ข้อมูลนักกีฬา');
    });

    it('UT-PLAYER-STATUS-05: Explicit APPROVED status takes precedence over an existing remark', () => {
      const team = { status: 'APPROVED', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'APPROVED', remarks: 'กรุณาแก้ไขเอกสาร' };
      const res = getPlayerDocStatusInfo(player, team);
      expect(res.text).toBe('อนุมัติ');
      expect(res.badgeHtml).toContain('อนุมัติ');
    });

    it('UT-PLAYER-STATUS-06: CORRECTED is displayed as successfully edited even while retaining the original remark', () => {
      const team = { status: 'APPROVED', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'CORRECTED', remarks: 'แก้เอกสารตามที่แจ้ง' };
      const res = getPlayerDocStatusInfo(player, team);

      expect(res.text).toBe('แก้ไขข้อมูลเรียบร้อย');
      expect(res.badgeHtml).toContain('แก้ไขข้อมูลเรียบร้อย');
    });

    it('UT-PLAYER-STATUS-PENDING-REMARK: Explicit PENDING status is displayed as waiting despite an old remark', () => {
      const team = { status: 'APPROVED', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus: 'PENDING', remarks: 'หมายเหตุเดิม' };
      const res = getPlayerDocStatusInfo(player, team);

      expect(res.text).toBe('รอตรวจสอบ');
      expect(res.badgeHtml).toContain('รอตรวจสอบ');
    });

    it.each([
      ['PENDING', 'รอตรวจสอบ'],
      ['APPROVED', 'อนุมัติ'],
      ['ACTION_REQUIRED', 'ปรับแก้ข้อมูลนักกีฬา'],
      ['CORRECTED', 'แก้ไขข้อมูลเรียบร้อย']
    ])('UT-PLAYER-STATUS-REMARK-MATRIX: %s remains the displayed status when a remark exists', (docStatus, expectedText) => {
      const team = { status: 'PENDING', submitted_categories: 'U14' };
      const player = { id: 'P1', category: 'U14', docStatus, remarks: 'หมายเหตุเดิม' };
      const res = getPlayerDocStatusInfo(player, team);

      expect(res.text).toBe(expectedText);
    });
  });
});
