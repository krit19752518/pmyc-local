import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const php = process.env.PHASE2_PHP_BINARY || path.join(root, '.runtime/phase2-php/php');

function renderDashboard(modelOverrides: Record<string, unknown>): string {
  const script = `
    spl_autoload_register(function($class) {
      $prefix = 'PMYC\\\\Phase2\\\\';
      if (str_starts_with($class, $prefix)) {
        $name = substr($class, strlen($prefix));
        if (preg_match('/^[A-Za-z0-9_]+$/D', $name) && is_file('phase2/src/' . $name . '.php')) {
          require_once 'phase2/src/' . $name . '.php';
        }
      }
    });
    $actor = ['id' => 'sat-1', 'role' => 'SAT_OFFICER', 'name' => 'เจ้าหน้าที่ทดสอบ', 'province' => 'เชียงใหม่'];
    $m = PMYC\\Phase2\\DashboardReadModel::empty($actor);
    $m['filters'] = [
      'season_id' => 's1', 'event_id' => 'e1', 'division_code' => 'U14_BOY',
      'stage' => '1', 'province' => 'เชียงใหม่', 'district' => 'แม่ริม',
      'competition_id' => 'c1', 'match_id' => '', 'data_mode' => 'demo',
    ];
    $m['scope_count'] = 1;
    $m['has_roster'] = true;
    $m['team_count'] = 8;
    $overrides = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
    $m = array_replace($m, $overrides);
    [$status, $html] = PMYC\\Phase2\\DashboardPages::page($m, ['actor' => $actor, 'page' => 'dashboard', 'path' => '/phase2demo/workspace/dashboard']);
    echo json_encode(['status' => $status, 'html' => $html], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
  `;
  const result = spawnSync(php, ['-r', script], {
    cwd: root,
    input: JSON.stringify(modelOverrides),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
  });
  if (result.status !== 0) {
    throw new Error('PHP render failed: ' + (result.stderr || result.stdout || result.error?.message));
  }
  const parsed = JSON.parse(result.stdout);
  expect(parsed.status).toBe(200);
  return parsed.html;
}

describe('issue117 dashboard workflow status badge, steps, and activity log', () => {
  it('shows district status badge and live step details for pending draw confirmation', () => {
    const html = renderDashboard({
      draw_version: 3,
      draw_status: 'PENDING_CONFIRMATION',
      match_count: 4,
      scheduled_count: 0,
      published_count: 0,
      confirmed_count: 0,
    });
    expect(html).toContain('<span class="badge pending">รอยืนยันผลจับสลาก</span>');
    expect(html).toContain('มีผลจับสลากเวอร์ชัน 3');
    expect(html).toContain('มีผลจับสลากรอยืนยันและล็อก');
    expect(html).toContain('รอจัดวัน เวลา และสนาม 4 คู่');
    expect(html).toContain('ยืนยันแล้ว 0 จาก 4 คู่');
  });

  it('shows confirmed/locked badge and partial schedule publication details', () => {
    const lockedHtml = renderDashboard({
      draw_version: 1,
      draw_status: 'CONFIRMED_LOCKED',
      match_count: 7,
      scheduled_count: 0,
      published_count: 0,
      confirmed_count: 0,
    });
    expect(lockedHtml).toContain('<span class="badge locked">ยืนยันและล็อกแล้ว</span>');
    expect(lockedHtml).toContain('ยืนยันทั้งชุดเรียบร้อยแล้ว');

    const partialPubHtml = renderDashboard({
      draw_version: 1,
      draw_status: 'CONFIRMED_LOCKED',
      match_count: 7,
      scheduled_count: 4,
      published_count: 2,
      confirmed_count: 0,
    });
    expect(partialPubHtml).toContain('<span class="badge published">เผยแพร่ตารางบางส่วน</span>');
    expect(partialPubHtml).toContain('เผยแพร่ 2 คู่ · จัดตารางแล้ว 4 คู่');

    const completedHtml = renderDashboard({
      draw_version: 1,
      draw_status: 'CONFIRMED_LOCKED',
      match_count: 4,
      scheduled_count: 4,
      published_count: 4,
      confirmed_count: 4,
    });
    expect(completedHtml).toContain('<span class="badge published">แข่งขันเสร็จสมบูรณ์</span>');
    expect(completedHtml).toContain('เผยแพร่ครบ 4 จาก 4 คู่');
    expect(completedHtml).toContain('ยืนยันแล้ว 4 จาก 4 คู่');
  });

  it('renders descriptive Thai action labels, actor names, and contextual details in activity log', () => {
    const html = renderDashboard({
      activity: [
        {
          action: 'MATCH_SCHEDULE_PUBLISHED',
          created_at: '2026-11-17T09:56:00+00:00',
          actor_id: 'sat:10',
          actor_name: 'เจ้าหน้าที่ กกท. เชียงใหม่',
          draw_version: 1,
          match_number: 1,
          match_scheduled_start: '2026-11-08T09:00:00+00:00',
          match_venue_name: 'สนามกีฬาแม่ริม',
          reason: 'เผยแพร่กำหนดการแข่งขันครั้งแรก',
        },
        {
          action: 'MATCH_SCHEDULE',
          created_at: '2026-11-17T09:50:00+00:00',
          actor_id: 'sat:10',
          actor_name: 'เจ้าหน้าที่ กกท. เชียงใหม่',
          match_number: 2,
          match_scheduled_start: '2026-11-08T07:00:00+00:00',
          match_venue_name: 'สนามเทศบาลแม่ริม',
          reason: 'กำหนดครั้งแรก',
        },
        {
          action: 'DRAW_CONFIRMED_LOCKED',
          created_at: '2026-11-17T09:30:00+00:00',
          actor_id: 'admin:1',
          actor_name: 'ผู้ดูแลระบบ <script>',
          draw_version: 1,
        },
        {
          action: 'DRAW_CEREMONY',
          created_at: '2026-11-17T09:00:00+00:00',
          actor_id: 'admin:1',
          actor_role: 'SUPER_ADMIN',
          draw_version: 1,
        },
      ],
    });
    expect(html).toContain('เผยแพร่ตารางแข่งขัน');
    expect(html).toContain('บันทึกกำหนดการแข่งขัน');
    expect(html).toContain('ยืนยันและล็อกผลจับสลาก');
    expect(html).toContain('สุ่มจับสลาก (พิธีจับสลาก)');
    expect(html).not.toContain('อัปเดตข้อมูลการแข่งขัน');
    expect(html).toContain('เจ้าหน้าที่ กกท. เชียงใหม่');
    expect(html).toContain('คู่ M01');
    expect(html).toContain('สนามกีฬาแม่ริม');
    expect(html).toContain('เวอร์ชัน 1');
    expect(html).toContain('ผู้ดูแลระบบ &lt;script&gt;');
    expect(html).not.toContain('ผู้ดูแลระบบ <script>');
  });
});
