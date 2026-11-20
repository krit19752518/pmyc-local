<?php
declare(strict_types=1);

use PMYC\Phase2\Application;
use PMYC\Phase2\Bridge;

require dirname(__DIR__).'/src/Bridge.php';
require dirname(__DIR__).'/src/EventDraft.php';
require dirname(__DIR__).'/src/EventRepository.php';
require dirname(__DIR__).'/src/AreaDirectory.php';
require dirname(__DIR__).'/src/CompetitionDraft.php';
require dirname(__DIR__).'/src/CompetitionPolicy.php';
require dirname(__DIR__).'/src/CompetitionRepository.php';
require dirname(__DIR__).'/src/RegistrationAdapter.php';
require dirname(__DIR__).'/src/RosterRepository.php';
require dirname(__DIR__).'/src/RosterPages.php';
require dirname(__DIR__).'/src/DrawEngine.php';
require dirname(__DIR__).'/src/DrawRepository.php';
require dirname(__DIR__).'/src/DrawPages.php';
require dirname(__DIR__).'/src/SchedulePages.php';
require dirname(__DIR__).'/src/MatchRules.php';
require dirname(__DIR__).'/src/MatchRepository.php';
require dirname(__DIR__).'/src/MatchPages.php';
require dirname(__DIR__).'/src/EventRules.php';
require dirname(__DIR__).'/src/RuleRepository.php';
require dirname(__DIR__).'/src/RulePages.php';
require dirname(__DIR__).'/src/ResultRules.php';
require dirname(__DIR__).'/src/ResultRepository.php';
require dirname(__DIR__).'/src/ResultPages.php';
require dirname(__DIR__).'/src/AdvancementRepository.php';
require dirname(__DIR__).'/src/AdvancementPages.php';
require dirname(__DIR__).'/src/CompetitionPages.php';
require dirname(__DIR__).'/src/Application.php';

$body = file_get_contents('php://input') ?: '';
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
try {
    $context = Bridge::verify($headers, $body, $method, $uri, getenv('PMYC_PHASE2_BRIDGE_SECRET') ?: '');
} catch (Throwable) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'ไม่สามารถยืนยันการเข้าถึงระบบได้';
    exit;
}
$path = parse_url($uri, PHP_URL_PATH) ?: '/';
$assets = ['/phase2demo/assets/app.css' => ['app.css', 'text/css'], '/phase2demo/assets/draw-setup.js'=>['draw-setup.js','application/javascript'], '/phase2demo/assets/app.js' => ['app.js', 'application/javascript']];
$assets['/phase2demo/assets/workspace.css']=['workspace.css','text/css'];
$assets['/phase2demo/assets/workspace.js']=['workspace.js','application/javascript'];
$assets['/phase2demo/assets/fonts/NotoSansThai-Variable-5a1c559b.ttf']=['fonts/NotoSansThai-Variable-5a1c559b.ttf','font/ttf'];
$assets['/phase2demo/assets/fonts/Prompt-Regular-2a736dbb.ttf']=['fonts/Prompt-Regular-2a736dbb.ttf','font/ttf'];
$assets['/phase2demo/assets/fonts/Prompt-Medium-adf72c9f.ttf']=['fonts/Prompt-Medium-adf72c9f.ttf','font/ttf'];
$assets['/phase2demo/assets/fonts/Prompt-SemiBold-011a0507.ttf']=['fonts/Prompt-SemiBold-011a0507.ttf','font/ttf'];
$assets['/phase2demo/assets/fonts/Prompt-Bold-6cdd89b4.ttf']=['fonts/Prompt-Bold-6cdd89b4.ttf','font/ttf'];
if (isset($assets[$path]) && $method === 'GET') {
    header('Content-Type: '.$assets[$path][1].($assets[$path][1]==='font/ttf'?'':'; charset=utf-8'));
    if($assets[$path][1]==='font/ttf')header('Cache-Control: public, max-age=31536000, immutable');
    readfile(__DIR__.'/assets/'.$assets[$path][0]);
    exit;
}
$query = [];
parse_str(parse_url($uri, PHP_URL_QUERY) ?: '', $query);
$input = $body === '' ? [] : json_decode($body, true);
if (!is_array($input)) {
    http_response_code(400);
    echo 'ข้อมูลคำขอไม่ถูกต้อง';
    exit;
}
try {
    $result = Application::render($path, $method, $query, $input, $context);
    [$status, $html] = $result;
    http_response_code($status);
    if (isset($result[2])) header('Location: '.$result[2]);
    header('Content-Type: '.(($result[3] ?? null)==='application/json'?'application/json':'text/html').'; charset=utf-8');
    echo $html;
} catch (PDOException $error) {
    error_log('Phase 2 database request failed: '.get_class($error));
    http_response_code(503);
    echo 'ไม่สามารถเชื่อมต่อข้อมูลรายการแข่งขันได้ กรุณาลองใหม่';
} catch (Throwable $error) {
    error_log('Phase 2 rendering failed: '.get_class($error));
    http_response_code(500);
    echo 'ไม่สามารถแสดงข้อมูลได้ กรุณาลองใหม่';
}
