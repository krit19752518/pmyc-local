import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const wvFile = path.join(__dirname, '../phase2/src/WorkspaceView.php');
const phpBinary =
  process.env.PHASE2_PHP_BINARY ||
  (fs.existsSync('/opt/alt/php84/usr/bin/php') ? '/opt/alt/php84/usr/bin/php' : 'php');

test('WorkspaceView preserves dashboard_filters=1 and passes scope filters to setup, bracket, and schedule while keeping clear blank', () => {
  const code = `
    require ${JSON.stringify(path.join(__dirname, '../phase2/src/DashboardReadModel.php'))};
    require ${JSON.stringify(wvFile)};
    $f = [
      'event_id' => '00000000-0000-4000-8000-000000005000',
      'data_mode' => 'demo',
      'season_id' => '00000000-0000-4000-8000-000000006000',
      'division_code' => 'U18_BOY',
      'stage' => '1',
      'province' => 'เชียงใหม่',
      'district' => 'หางดง',
    ];
    $ctx = ['actor' => ['role' => 'SUPER_ADMIN', 'name' => 'Admin']];
    [$status, $html] = \\PMYC\\Phase2\\WorkspaceView::page('dashboard', '<p>ok</p>', $ctx, $f);
    $clear = \\PMYC\\Phase2\\WorkspaceView::setupEntryUrl($f);
    echo json_encode(['status' => $status, 'html' => $html, 'clear' => $clear], JSON_UNESCAPED_UNICODE);
  `;
  const raw = execFileSync(phpBinary, ['-r', code], { encoding: 'utf8' });
  const res = JSON.parse(raw) as { status: number; html: string; clear: string };
  expect(res.status).toBe(200);
  expect(res.html).toContain('/phase2demo/workspace/dashboard?event_id=00000000-0000-4000-8000-000000005000&amp;data_mode=demo&amp;season_id=00000000-0000-4000-8000-000000006000&amp;division_code=U18_BOY&amp;stage=1&amp;province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&amp;district=%E0%B8%AB%E0%B8%B2%E0%B8%87%E0%B8%94%E0%B8%87&amp;dashboard_filters=1');
  expect(res.html).toContain('/phase2demo/workspace/pending-setup?event_id=00000000-0000-4000-8000-000000005000&amp;data_mode=demo&amp;season_id=00000000-0000-4000-8000-000000006000&amp;division_code=U18_BOY&amp;stage=1&amp;province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&amp;district=%E0%B8%AB%E0%B8%B2%E0%B8%87%E0%B8%94%E0%B8%87');
  expect(res.html).toContain('/phase2demo/workspace/pending-bracket?event_id=00000000-0000-4000-8000-000000005000&amp;data_mode=demo&amp;season_id=00000000-0000-4000-8000-000000006000&amp;division_code=U18_BOY&amp;stage=1&amp;province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&amp;district=%E0%B8%AB%E0%B8%B2%E0%B8%87%E0%B8%94%E0%B8%87');
  expect(res.html).toContain('/phase2demo/workspace/pending-schedule?event_id=00000000-0000-4000-8000-000000005000&amp;data_mode=demo&amp;season_id=00000000-0000-4000-8000-000000006000&amp;division_code=U18_BOY&amp;stage=1&amp;province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88&amp;district=%E0%B8%AB%E0%B8%B2%E0%B8%87%E0%B8%94%E0%B8%87');
  expect(res.clear).toBe('/phase2demo/workspace/pending-setup?event_id=00000000-0000-4000-8000-000000005000&data_mode=demo');
});
