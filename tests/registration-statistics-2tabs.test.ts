import express from 'express';
import request from 'supertest';
import {
  APPROVAL_DEFINITION_VERSION,
  buildApprovalStatisticsForRange,
  buildRegistrationStatisticsForRange,
  DateRangeError,
  parseBangkokDateRange
} from '../src/services/registrationStatistics.date';
import { createRegistrationStatisticsRouter } from '../src/routes/registrationStatistics.router';
import { StatisticsStore } from '../src/services/registrationStatistics.store';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('Registration & Approval Statistics 2-Tabs (Issue #2)', () => {
  test('AC02: parseBangkokDateRange handles all 6 presets and rejects reversed/future/invalid dates', () => {
    // 2026-11-20T03:00:00Z = 2026-11-20 10:00:00 Asia/Bangkok (Friday)
    const now = new Date('2026-11-20T03:00:00.000Z');

    const all = parseBangkokDateRange({ preset: 'all' }, now);
    expect(all.preset).toBe('all');
    expect(all.startUtc).toBeNull();

    const today = parseBangkokDateRange({ preset: 'today' }, now);
    expect(today.from).toBe('2026-11-20');
    expect(today.to).toBe('2026-11-20');
    expect(today.startUtc?.toISOString()).toBe('2026-11-19T17:00:00.000Z');
    expect(today.endExclusiveUtc?.toISOString()).toBe('2026-11-20T17:00:00.000Z');

    const yesterday = parseBangkokDateRange({ preset: 'yesterday' }, now);
    expect(yesterday.from).toBe('2026-11-19');
    expect(yesterday.to).toBe('2026-11-19');

    // Week starts Monday (2026-11-16)
    const week = parseBangkokDateRange({ preset: 'week' }, now);
    expect(week.from).toBe('2026-11-16');
    expect(week.to).toBe('2026-11-20');

    const month = parseBangkokDateRange({ preset: 'month' }, now);
    expect(month.from).toBe('2026-11-01');
    expect(month.to).toBe('2026-11-20');

    const custom = parseBangkokDateRange({ preset: 'custom', from: '2026-11-10', to: '2026-11-12' }, now);
    expect(custom.startUtc?.toISOString()).toBe('2026-11-09T17:00:00.000Z');
    expect(custom.endExclusiveUtc?.toISOString()).toBe('2026-11-12T17:00:00.000Z');

    expect(() => parseBangkokDateRange({ preset: 'custom', from: '2026-11-15', to: '2026-11-10' }, now)).toThrow(DateRangeError);
    expect(() => parseBangkokDateRange({ preset: 'custom', from: '2026-11-21', to: '2026-11-21' }, now)).toThrow(DateRangeError);
    expect(() => parseBangkokDateRange({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }, now)).toThrow(DateRangeError);
  });

  test('AC03/AC08: registration tab uses age-group created timestamp and excludes cancelled categories individually', () => {
    const teams = [
      {
        id: 'FTM-1',
        province: 'กรุงเทพมหานคร',
        district: 'ปทุมวัน',
        categories: 'U14,U16,U18',
        cancelled_categories: 'U14',
        created_at: '2026-11-01T05:00:00.000Z'
      },
      {
        id: 'FTM-2',
        province: 'ขอนแก่น',
        district: 'เมืองขอนแก่น',
        categories: 'U16',
        cancelled_categories: '',
        created_at: '2026-11-10T05:00:00.000Z'
      }
    ];
    const audits = [
      {
        team_id: 'FTM-1',
        event_type: 'TEAM_CATEGORY_ADDED',
        old_state: { categories: 'U14,U16' },
        new_state: { categories: 'U14,U16,U18' },
        created_at: '2026-11-18T10:00:00.000Z' // 17:00 Bangkok on 2026-11-18
      }
    ];
    const now = new Date('2026-11-20T03:00:00.000Z');
    const range = parseBangkokDateRange({ preset: 'custom', from: '2026-11-18', to: '2026-11-18' }, now);
    const snap = buildRegistrationStatisticsForRange(teams, audits, now.toISOString(), range);

    // Only FTM-1 U18 was added on 2026-11-18; U14 is cancelled; U16 was created 2026-11-01
    expect(snap.ages).toEqual([0, 0, 1]);
    expect(snap.selectedDateField).toBe('age_group_created_at');
    expect(snap.trend).toEqual([{ date: '2026-11-18', total: 1, u14: 0, u16: 0, u18: 1 }]);

    const allSnap = buildRegistrationStatisticsForRange(teams, audits, now.toISOString(), parseBangkokDateRange({ preset: 'all' }, now));
    // All-time: FTM-1 (U16, U18) + FTM-2 (U16) = [0, 2, 1]
    expect(allSnap.ages).toEqual([0, 2, 1]);
  });

  test('AC04/AC09: approval tab uses latest transition timestamp and handles legacy missing timestamps (OQ1-OQ5)', () => {
    const teams = [
      {
        id: 'FTM-10',
        status: 'APPROVED',
        province: 'กรุงเทพมหานคร',
        district: 'ดุสิต',
        categories: 'U14',
        submitted_categories: 'U14',
        cancelled_categories: '',
        created_at: '2026-10-10T05:00:00.000Z'
      },
      {
        id: 'FTM-11',
        status: 'APPROVED',
        province: 'เชียงใหม่',
        district: 'เมืองเชียงใหม่',
        categories: 'U16',
        submitted_categories: 'U16',
        cancelled_categories: '',
        created_at: '2026-10-05T05:00:00.000Z' // legacy team with no TEAM_STATUS_CHANGED audit
      }
    ];
    const players = [
      { id: 'P1', team_id: 'FTM-10', category: 'U14', doc_status: 'APPROVED' },
      { id: 'P2', team_id: 'FTM-11', category: 'U16', doc_status: 'APPROVED' }
    ];
    const audits = [
      { team_id: 'FTM-10', event_type: 'TEAM_STATUS_CHANGED', new_state: { status: 'APPROVED' }, created_at: '2026-11-15T05:00:00.000Z' },
      { team_id: 'FTM-10', entity_id: 'P1', event_type: 'PLAYER_DOCUMENT_STATUS_CHANGED', new_state: { docStatus: 'APPROVED' }, created_at: '2026-11-19T05:00:00.000Z' }
    ] as any;
    const now = new Date('2026-11-20T03:00:00.000Z');

    const allSnap = buildApprovalStatisticsForRange(teams, players, audits, now.toISOString(), parseBangkokDateRange({ preset: 'all' }, now));
    expect(allSnap.ages).toEqual([1, 1, 0]);
    expect(allSnap.legacyMissingTimestampCount).toBe(1);
    expect(allSnap.definitionVersion).toBe(APPROVAL_DEFINITION_VERSION);

    const rangeSnap = buildApprovalStatisticsForRange(
      teams,
      players,
      audits,
      now.toISOString(),
      parseBangkokDateRange({ preset: 'custom', from: '2026-11-19', to: '2026-11-19' }, now)
    );
    // FTM-10 U14 completed approval on 2026-11-19; legacy FTM-11 excluded from date-filtered range
    expect(rangeSnap.ages).toEqual([1, 0, 0]);
    expect(rangeSnap.trend).toEqual([{ date: '2026-11-19', total: 1, u14: 1, u16: 0, u18: 0 }]);
  });

  test('AC10: approval API enforces role guard (403 when unauthorized) and returns aggregate allowlist when authorized', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmyc-stats-2tabs-'));
    const store = new StatisticsStore(tmpDir);
    const now = new Date('2026-11-20T03:00:00.000Z');
    const mockSnap = buildApprovalStatisticsForRange([], [], [], now.toISOString(), parseBangkokDateRange({ preset: 'all' }, now));

    let authorized = false;
    const app = express();
    app.use(createRegistrationStatisticsRouter(store, async () => {
      throw new Error('not_used');
    }, {
      readRegistration: async (r) => buildRegistrationStatisticsForRange([], [], now.toISOString(), r),
      readApproval: async () => mockSnap,
      isApprovalAuthorized: async () => authorized
    }));

    const pageRes = await request(app).get('/registration-statistics.php');
    expect(pageRes.status).toBe(200);
    expect(pageRes.text).toContain('/api/authorized/age-group-approval-statistics');
    expect(pageRes.text).toContain('app.js?v=issue2-2tabs');

    const unauthRes = await request(app).get('/api/authorized/age-group-approval-statistics?preset=all');
    expect(unauthRes.status).toBe(403);
    expect(unauthRes.body.error).toBe('approval_statistics_restricted');

    authorized = true;
    const authRes = await request(app).get('/api/authorized/age-group-approval-statistics?preset=all');
    expect(authRes.status).toBe(200);
    expect(authRes.body.selectedDateField).toBe('age_group_approved_at');
    expect(JSON.stringify(authRes.body)).not.toContain('teamName');

    const badDateRes = await request(app).get('/api/public/registration-statistics?preset=custom&from=2026-11-19&to=2026-11-10');
    expect(badDateRes.status).toBe(400);
    expect(badDateRes.body.error).toBe('invalid_date_range');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
