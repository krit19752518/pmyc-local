import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const phpBinary =
  process.env.PHASE2_PHP_BINARY ||
  (fs.existsSync('/opt/alt/php84/usr/bin/php') ? '/opt/alt/php84/usr/bin/php' : 'php');

const root = path.join(__dirname, '..');

test('CeremonyPages::renderPairList renders 2-column pair-list cards for 5 and 4 teams', () => {
  const code = `
    require ${JSON.stringify(path.join(root, 'phase2/src/DashboardReadModel.php'))};
    require ${JSON.stringify(path.join(root, 'phase2/src/WorkspaceView.php'))};
    require ${JSON.stringify(path.join(root, 'phase2/src/DrawEngine.php'))};
    require ${JSON.stringify(path.join(root, 'phase2/src/CeremonyPages.php'))};

    $make = function (int $n): string {
      $teams = [];
      for ($i = 1; $i <= $n; $i++) {
        $teams[] = ['source_team_id' => 'T' . $i, 'name' => 'ทีมที่ ' . $i];
      }
      $draw = \\PMYC\\Phase2\\DrawEngine::generate($teams);
      return \\PMYC\\Phase2\\CeremonyPages::renderPairList($draw);
    };

    echo json_encode(['five' => $make(5), 'four' => $make(4)], JSON_UNESCAPED_UNICODE);
  `;
  const raw = execFileSync(phpBinary, ['-r', code], { encoding: 'utf8' });
  const res = JSON.parse(raw) as { five: string; four: string };

  expect(res.five).toContain('class="pair-list"');
  expect(res.five).toContain('class="pair"');
  expect(res.five).toContain('คู่ที่ 1 · รอบเพลย์ออฟ');
  expect(res.five).toContain('รอแข่งขันรอบหลัก');
  expect(res.four).toContain('class="pair-list"');
  expect(res.four).toContain('คู่ที่ 1 · รอบหลัก');
});

test('CeremonyPages::result matches v17 mockup and hides confirm/redraw buttons once locked', () => {
  const code = `
    spl_autoload_register(function($class) {
      $prefix = 'PMYC\\\\Phase2\\\\';
      if (str_starts_with($class, $prefix)) {
        $name = substr($class, strlen($prefix));
        if (preg_match('/^[A-Za-z0-9_]+$/D', $name) && is_file(${JSON.stringify(path.join(root, 'phase2/src/'))} . $name . '.php')) {
          require_once ${JSON.stringify(path.join(root, 'phase2/src/'))} . $name . '.php';
        }
      }
    });
    $actor = ['id' => 'admin:1', 'role' => 'SUPER_ADMIN', 'name' => 'ผู้ดูแลระบบ'];
    $context = ['actor' => $actor, 'csrf' => 'tok'];
    $filters = ['event_id' => 'e1', 'season_id' => 's1', 'division_code' => 'U14_BOY', 'stage' => '1', 'province' => 'เชียงใหม่', 'district' => 'หางดง', 'data_mode' => 'demo'];
    $teams = [];
    for ($i = 1; $i <= 4; $i++) $teams[] = ['source_team_id' => 'T' . $i, 'name' => 'หางดง ' . $i];
    $draw = \\PMYC\\Phase2\\DrawEngine::generate($teams) + ['id' => 'd3', 'version' => 3, 'created_at' => '2026-11-19T08:00:00+00:00', 'reason' => 'สุ่มใหม่', 'published_at' => null];
    $ref = new ReflectionMethod(\\PMYC\\Phase2\\CeremonyPages::class, 'result');
    $pending = $ref->invoke(null, $context, $filters, $draw, ['status' => 'PENDING_CONFIRMATION'], true, false, true);
    $locked = $ref->invoke(null, $context, $filters, $draw, ['status' => 'CONFIRMED_LOCKED', 'actor_name' => 'ผู้ดูแลระบบ', 'actor_id' => 'admin:1'], true, false, true);
    echo json_encode(['pending' => $pending[1], 'locked' => $locked[1]], JSON_UNESCAPED_UNICODE);
  `;
  const raw = execFileSync(phpBinary, ['-r', code], { encoding: 'utf8' });
  const res = JSON.parse(raw) as { pending: string; locked: string };

  expect(res.pending).toContain('ผลจับสลากเวอร์ชัน 3');
  expect(res.pending).toContain('class="badge pending">รอยืนยันผลจับสลาก</span>');
  expect(res.pending).toContain('class="pair-list"');
  expect(res.pending).toContain('class="summary-strip"');
  expect(res.pending).toContain('class="panel-action"');
  expect(res.pending).toContain('การยืนยันจะล็อกผลทั้งชุดอย่างถาวร');
  expect(res.pending).toContain('data-open-draw-confirm');
  expect(res.pending).toContain('สุ่มใหม่');
  expect(res.pending).toContain('ยังไม่สามารถกำหนดวัน เวลา และสนาม');

  expect(res.locked).toContain('class="badge locked">ยืนยันและล็อกผลจับสลากแล้ว</span>');
  expect(res.locked).toContain('ล็อกผลจับสลากแล้ว · ไม่มีการสุ่มใหม่');
  expect(res.locked).toContain('ดูสายการแข่งขัน');
  expect(res.locked).toContain('ไปตารางการแข่งขัน');
  expect(res.locked).not.toContain('data-open-draw-confirm');
  expect(res.locked).not.toContain('redraw=1');
  expect(res.locked).not.toContain('ยังไม่สามารถกำหนดวัน เวลา และสนาม');
});
