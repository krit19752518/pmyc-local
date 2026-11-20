import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const php = process.env.PHASE2_PHP_BINARY || path.join(root, '.runtime/phase2-php/php');

function invokeCeremonyMethod(method: 'ceremonyResult' | 'form', argsPhp: string): string {
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
    $ref = new ReflectionMethod(PMYC\\Phase2\\CeremonyPages::class, '${method}');
    $res = ${argsPhp};
    echo is_array($res) ? $res[1] : $res;
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
  return result.stdout;
}

describe('issue121 ceremony redraw UI, history list, and reason gate', () => {
  it('hides balls, keeps latest bracket, and lists ordered draw history when already drawn', () => {
    const html = invokeCeremonyMethod(
      'ceremonyResult',
      `$ref->invoke(
        null,
        ['event_id' => 'e1', 'division_code' => 'U16_BOY', 'stage' => '1', 'province' => 'เชียงใหม่', 'district' => 'หางดง', 'data_mode' => 'demo'],
        [
          'id' => 'd2',
          'version' => 2,
          'slots' => [
            ['slot' => 'A1', 'source_team_id' => 't1', 'name' => 'หางดง 1'],
            ['slot' => 'A2', 'source_team_id' => 't2', 'name' => 'หางดง 2'],
          ],
          'fixtures' => [
            ['round' => 1, 'number' => 1, 'side_a' => ['type' => 'team', 'slot' => 'A1', 'source_team_id' => 't1'], 'side_b' => ['type' => 'team', 'slot' => 'A2', 'source_team_id' => 't2']],
          ],
          'automatic_qualifiers' => [],
        ],
        false,
        [
          ['version' => 2, 'created_at' => '2026-11-19T02:00:00+00:00', 'reason' => 'ขอจับใหม่เนื่องจากพิมพ์ชื่อทีมผิด', 'actor_name' => 'กกท. เชียงใหม่'],
          ['version' => 1, 'created_at' => '2026-11-18T02:00:00+00:00', 'reason' => '', 'actor_name' => 'ผู้ดูแลระบบ'],
        ],
        true
      )`
    );
    expect(html).not.toContain('data-ceremony-ball=');
    expect(html).toContain('มีการจับสลากไปแล้ว 2 ครั้ง');
    expect(html).toContain('ประวัติการจับสลาก');
    const firstIdx = html.indexOf('ครั้งที่ 1');
    const secondIdx = html.indexOf('ครั้งที่ 2');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(html).toContain('จับสลากครั้งแรก');
    expect(html).toContain('ขอจับใหม่เนื่องจากพิมพ์ชื่อทีมผิด');
    expect(html).toContain('กกท. เชียงใหม่');
    expect(html).toContain('จับฉลากอีกครั้ง');
    expect(html).toContain('&amp;redraw=1');
    expect(html).toContain('ถ้ามีการจับสลากอีกรอบจะต้องใส่เหตุผลด้วย');
    expect(html).toContain('ก้างปลาการแข่งขัน');
  });

  it('shows balls, clears bracket, and requires reason on redraw form', () => {
    const html = invokeCeremonyMethod(
      'form',
      `$ref->invoke(
        null,
        ['actor' => ['id' => 'admin:1', 'role' => 'SUPER_ADMIN', 'name' => 'ผู้ดูแลระบบ'], 'csrf' => 'csrf1'],
        ['event_id' => 'e1', 'division_code' => 'U16_BOY', 'stage' => '1', 'province' => 'เชียงใหม่', 'district' => 'หางดง', 'data_mode' => 'demo'],
        [['source_team_id' => 't1', 'name' => 'หางดง 1'], ['source_team_id' => 't2', 'name' => 'หางดง 2']],
        'hash123',
        ['id' => 'd1', 'version' => 1]
      )`
    );
    expect(html).toContain('data-ceremony-ball=');
    expect(html).not.toContain('ก้างปลาการแข่งขัน');
    expect(html).toContain('เริ่มพิธีจับสลาก');
    expect(html).toContain('<button class="btn gold" type="submit" disabled>');
    expect(html).toContain('<textarea name="reason" required');

    const js = fs.readFileSync(path.join(root, 'phase2/public/assets/workspace.js'), 'utf8');
    expect(js).toContain("textarea[name=\"reason\"]");
    expect(js).toContain('syncReasonGate');

    const css = fs.readFileSync(path.join(root, 'phase2/public/assets/workspace.css'), 'utf8');
    expect(css).toContain('.workspace-v17 .ceremony .ceremony-lead{font-size:18px');
    expect(css).toContain('.workspace-v17 .ceremony .ceremony-note{font-size:15px');

    expect(css).toContain('.workspace-v17 .ceremony-match{background:#f3f7fc;border:1.5px solid #8ea8c6;border-left:4px solid var(--navy)');
    expect(css).toContain('.workspace-v17 .ceremony-bracket-slot [data-ceremony-target]{font-size:16px;font-weight:700;color:#061b37');
  });
});
