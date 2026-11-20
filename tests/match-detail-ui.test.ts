import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const php = process.env.PHASE2_PHP_BINARY || path.join(root, '.runtime/phase2-php/php');

function runPhp(code: string): any {
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
    ${code}
  `;
  const result = spawnSync(php, ['-r', script], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
  });
  if (result.status !== 0) {
    throw new Error('PHP failed: ' + (result.stderr || result.stdout || result.error?.message));
  }
  return JSON.parse(result.stdout);
}

describe('issue123 match detail UI, Thai B.E. schedule, and hero contrast', () => {
  it('renders 3-level breadcrumb for detail page', () => {
    const res = runPhp(`
      $actor = ['id' => 'admin:1', 'role' => 'SUPER_ADMIN', 'name' => 'ผู้ดูแลระบบ'];
      $filters = ['event_id' => 'e1', 'season_id' => 's1', 'division_code' => 'U14_BOY', 'stage' => '1', 'province' => 'เชียงใหม่', 'district' => 'หางดง', 'data_mode' => 'demo'];
      [$status, $html] = PMYC\\Phase2\\WorkspaceView::page('detail', '<div>body</div>', ['actor' => $actor], $filters, 200);
      echo json_encode(['status' => $status, 'html' => $html], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    `);
    expect(res.status).toBe(200);
    expect(res.html).toContain('หน้าหลัก</a><span>/</span><a href="/phase2demo/workspace/pending-schedule?');
    expect(res.html).toContain('>ตารางการแข่งขัน</a><span>/</span><span>รายละเอียดการแข่งขัน</span>');
  });

  it('converts full Thai month B.E. date without time input to ISO and auto-computes +90m end', () => {
    const res = runPhp(`
      $out = PMYC\\Phase2\\MatchRules::schedule([
        'venue_id' => '00000000-0000-4000-8000-000000000001',
        'start_date_th' => '19 พฤศจิกายน 2569',
      ]);
      echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    `);
    expect(res.start).toBe('2026-11-19T09:00:00+07:00');
    expect(res.end).toBe('2026-11-19T10:30:00+07:00');
  });

  it('updates MatchPages form, cancel guard, post links, and hero contrast CSS', () => {
    const mp = fs.readFileSync(path.join(root, 'phase2/src/MatchPages.php'), 'utf8');
    const v17Section = mp.slice(mp.indexOf("if(\$tab==='schedule')")); expect(v17Section).not.toContain('สิ้นสุด (เวลาไทย)');
    expect(v17Section).not.toContain('name="start_time"');
    expect(v17Section).not.toContain('data-thai-date-trigger');
    expect(mp).toContain('เวลาเริ่มแข่งขัน (เวลาไทย)');
    expect(mp).toContain('name="start_date_th"');
    expect(v17Section).not.toContain('type="date"');
    expect(mp).toContain('data-thai-date-input');
    const js = fs.readFileSync(path.join(root, 'phase2/public/assets/workspace.js'), 'utf8');
    expect(js).toContain('thai-cal-popover');
    expect(js).toContain('วันนี้');
    expect(mp).toContain('if(!$isFirstSchedule)$body.=');
    expect(mp).toContain("if($op==='cancel'&&!in_array($match['state'],['SCHEDULED','POSTPONED'],true))continue;");
    expect(mp).toContain("MatchDetailView::url($path.'/results',$filters)");

    const css = fs.readFileSync(path.join(root, 'phase2/public/assets/workspace.css'), 'utf8');
    expect(css).toContain('.workspace-v17 .match-detail-hero .big-score{color:var(--yellow)');
    expect(css).toContain('.workspace-v17 .match-detail-hero strong{color:#ffffff');
  });
});
