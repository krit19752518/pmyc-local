import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const phpFile = path.join(__dirname, '../phase2/src/TeamSetupPages.php');
const phpBinary =
  process.env.PHASE2_PHP_BINARY ||
  (fs.existsSync('/opt/alt/php84/usr/bin/php') ? '/opt/alt/php84/usr/bin/php' : 'php');

test('TeamSetupPages::pairCount calculates intdiv(N, 2) for 0..8 teams', () => {
  const code = `
    require ${JSON.stringify(phpFile)};
    $out = [];
    for ($n = 0; $n <= 8; $n++) {
      $out[] = \\PMYC\\Phase2\\TeamSetupPages::pairCount($n);
    }
    echo json_encode($out);
  `;
  const raw = execFileSync(phpBinary, ['-r', code], { encoding: 'utf8' });
  const result = JSON.parse(raw) as number[];
  expect(result).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
});

test('TeamSetupPages uses self::pairCount instead of N - 1', () => {
  const src = fs.readFileSync(phpFile, 'utf8');
  expect(src).toContain('self::pairCount(count($teams))');
  expect(src).not.toContain('max(0,count($teams)-1)');
});
