<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class CeremonyPages
{
    public const PATH = '/phase2demo/workspace/pending-ceremony';
    public const RESULT_PATH = '/phase2demo/workspace/pending-result';
    public const HISTORY_PATH = '/phase2demo/workspace/pending-history';

    public static function render(string $method, array $query, array $input, array $context, ?\PDO $db = null, string $view = 'ceremony'): array
    {
        $actor = $context['actor'] ?? null;
        if (!in_array($actor['role'] ?? '', ['SUPER_ADMIN', 'SAT_OFFICER', 'DOCUMENT_VERIFIER'], true)) {
            return [403, 'ไม่มีสิทธิ์เข้าถึงระบบจัดการแข่งขัน'];
        }
        $review = $view === 'result';
        $history = $view === 'history';
        if (!in_array($method, $history ? ['GET'] : ['GET', 'POST'], true)) return [405, 'ไม่รองรับคำขอนี้'];
        if ($method === 'POST' && (!is_string($input['_csrf'] ?? null) || empty($context['csrf'])
            || !hash_equals($context['csrf'], $input['_csrf']))) {
            return [403, 'ไม่สามารถยืนยันคำขอได้'];
        }

        $filters = [];
        $notice = fn(array $filters, string $message, int $status = 200, string $action = '') => $history
            ? self::history($context, $filters, [], $message, $status)
            : self::notice($context, $filters, $message, $status, $action, $review);
        try {
            $filters = DashboardReadModel::query($query, $actor);
            $complete = $filters['event_id'] !== '' && $filters['division_code'] !== '' && $filters['province'] !== ''
                && ($filters['stage'] === '2' || ($filters['stage'] === '1' && $filters['district'] !== ''));
            if ($filters['competition_id'] === '' && !$complete) {
                if ($method === 'POST') throw new \InvalidArgumentException('กรุณาระบุการแข่งขันที่จะจับสลาก');
                return $notice($filters, 'เลือกขอบเขตและตรวจรายชื่อทีมที่หน้าตั้งค่าการจับสลาก');
            }
            if (!$db && !EventRepository::configured()) return $notice($filters, 'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน', 503);
            $db ??= EventRepository::connect();
            $competitions = new CompetitionRepository($db);
            $scope = $filters['competition_id'] !== ''
                ? $competitions->requireAccess($filters['competition_id'], $actor)
                : $competitions->findDrawScope($filters);
            $event = (new EventRepository($db))->get($scope['event_id'] ?? $filters['event_id']);
            if (!$event) throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
            self::bind($filters, [
                'event_id' => $event['id'],
                'season_id' => $event['season_id'],
                'data_mode' => $event['is_test'] ? 'demo' : 'real',
            ]);
            $prepare = !$review && !$history && $method === 'POST' && ($input['operation'] ?? '') === 'prepare_ceremony';
            if ($prepare && ($actor['role'] ?? '') !== 'SUPER_ADMIN') throw new \UnexpectedValueException('ไม่มีสิทธิ์เตรียมการแข่งขันย่อย');
            $preparation = null;
            if (!$scope && !$review && !$history && $filters['stage'] === '1' && $actor['role'] === 'SUPER_ADMIN'
                && !in_array($event['status'], ['CLOSED', 'ARCHIVED'], true)) {
                $divisions = array_column($competitions->divisions($event['id']), 'id', 'code');
                if (!isset($divisions[$filters['division_code']])) throw new \InvalidArgumentException('รุ่นแข่งขันไม่อยู่ในรายการที่เลือก');
                $teams = (new RegistrationAdapter($db))->candidates([
                    'stage'=>1, 'division_code'=>$filters['division_code'], 'province'=>$filters['province'],
                    'district'=>$filters['district'], 'is_test'=>$event['is_test'],
                ], false, true);
                $preparation = ['division_id'=>$divisions[$filters['division_code']], 'count'=>count($teams)];
            }
            if ($prepare) {
                if (!$complete || $filters['stage'] !== '1' || !EventRepository::validUuid($input['request_id'] ?? null)) {
                    throw new \InvalidArgumentException('กรุณาตรวจขอบเขตและรหัสคำขอเตรียมการแข่งขัน');
                }
                if (in_array($event['status'], ['CLOSED', 'ARCHIVED'], true)) throw new \DomainException('รายการนี้ปิดแล้ว ไม่สามารถเตรียมการแข่งขันได้');
                if (!$scope) {
                    if (!$preparation || !$preparation['count']) throw new \DomainException('ยังไม่มีทีมที่อนุมัติครบในพื้นที่นี้');
                    $created = $competitions->create($event['id'], [
                        'division_id'=>$preparation['division_id'], 'stage'=>1,
                        'province'=>$filters['province'], 'district'=>$filters['district'],
                    ], $actor, $input['request_id']);
                    $scope = $competitions->get($created['id']);
                }
            }
            if (!$scope) {
                if ($method === 'POST') throw new \DomainException('กรุณาสร้างการแข่งขันย่อยก่อนเริ่มพิธี');
                if ($preparation && $preparation['count']) return self::preparation($context, $filters, $preparation['count']);
                $link = '';
                if ($actor['role'] === 'SUPER_ADMIN') {
                    $link = '<a class="btn" href="/platform/events/'.WorkspaceView::e($event['id']).'/competitions/new">สร้างการแข่งขันย่อย</a>';
                }
                return $notice($filters, 'ยังไม่มีการแข่งขันย่อยในพื้นที่นี้ กรุณาให้ผู้ดูแลสร้างการแข่งขันและมอบหมายสิทธิ์ก่อน', 200, $link);
            }

            $scope = $competitions->requireAccess($scope['id'], $actor);
            if (!in_array((int)$scope['stage'], [1, 2], true)) throw new \InvalidArgumentException('พิธีนี้รองรับ Stage 1–2');
            self::bind($filters, [
                'competition_id' => $scope['id'],
                'division_code' => $scope['division_code'],
                'stage' => (string)$scope['stage'],
                'province' => (string)$scope['province'],
                'district' => (string)$scope['district'],
            ]);
            $filters['match_id'] = '';
            if ($prepare) return [303, '', WorkspaceView::url('ceremony', $filters)];
            $draws = new DrawRepository($db);
            if ($history) return self::history($context, $filters, $draws->history($scope['id']));
            if ($method === 'POST') {
                if (!in_array($input['operation'] ?? '', $review ? ['confirm'] : ['ceremony', 'ceremony_redraw'], true)) {
                    throw new \InvalidArgumentException('คำขอจับสลากไม่ถูกต้อง');
                }
                $result = $draws->execute($scope['id'], $actor, $input);
                if ($review) return [303, '', WorkspaceView::url('result', $filters)];
                return [303, '', WorkspaceView::url('ceremony', $filters).'&reveal='.rawurlencode($result['id'])];
            }

            $draw = $draws->current($scope['id']);
            $state = $draw ? $draws->ceremonyState($event['id'], $draw['id']) : null;
            $status = $state['status'] ?? null;
            $canDraw = CompetitionPolicy::can($actor, $scope, $competitions->assignment($scope['id'], $actor), 'draw');
            $hasConfirmedResult = $draw && $draws->hasConfirmedResult($scope['id']);
            $canRedraw = $draw && $canDraw && !$hasConfirmedResult;
            if ($review) {
                if (!$draw) return $notice($filters, 'ยังไม่มีผลการจับสลากในขอบเขตนี้');
                return self::result($context, $filters, $draw, $state, $canRedraw, false, true);
            }
            $redraw = ($query['redraw'] ?? '') === '1';
            if ($draw && (!$redraw || !$canRedraw)) {
                $drawHistory = $draws->history($scope['id']);
                return self::result($context, $filters, $draw, $state, $canRedraw, ($query['reveal'] ?? '') === $draw['id'], false, $drawHistory);
            }
            if (!$canDraw) return self::notice($context, $filters, 'บัญชีนี้ยังไม่มีสิทธิ์จับสลากในการแข่งขันนี้');
            if (!in_array($scope['template_version_id'], DrawEngine::TEMPLATES, true)) {
                return self::notice($context, $filters, 'เทมเพลทนี้ยังไม่รองรับพิธีจับสลาก');
            }

            $roster = (new RosterRepository($db))->current($scope['id']);
            if ($redraw && !$draw) throw new \DomainException('ยังไม่มีผลจับสลากสำหรับสุ่มใหม่');
            if ((int)$scope['stage'] === 1) {
                $teams = (new RegistrationAdapter($db))->candidates($scope);
                $hash = hash('sha256', json_encode($teams, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            } else {
                $teams = $roster && $roster['locked'] ? $roster['teams'] : [];
                $hash = $roster['fingerprint'] ?? '';
            }
            if (!$teams) {
                if ($filters['stage'] === '2') {
                    return self::notice($context, $filters, 'กรุณาล็อกรายชื่อทีมผ่านเข้ารอบของจังหวัดก่อนเริ่มพิธี', 200,
                        '<a class="btn" href="/phase2demo/competitions/'.WorkspaceView::e($scope['id']).'/advancement">ตรวจทีมผ่านเข้ารอบ</a>');
                }
                return self::notice($context, $filters, 'ยังไม่มีทีมที่อนุมัติครบในพื้นที่นี้');
            }
            return self::form($context, $filters, $teams, $hash, $draw);
        } catch (\InvalidArgumentException $error) {
            return $notice($filters, $error->getMessage(), 400);
        } catch (\UnexpectedValueException $error) {
            return $notice($filters, $error->getMessage(), 403);
        } catch (\OutOfBoundsException $error) {
            return $notice($filters, $error->getMessage(), 404);
        } catch (\DomainException $error) {
            $reload = $review ? '<a class="btn" href="'.WorkspaceView::e(WorkspaceView::url('result', $filters)).'">โหลดผลล่าสุด</a>' : '';
            return $notice($filters, $error->getMessage(), 409, $reload);
        } catch (\RuntimeException $error) {
            error_log('Workspace ceremony failed: '.get_class($error));
            return $notice($filters, 'ไม่สามารถดำเนินการได้ กรุณาเปิดหน้าอีกครั้งเพื่อตรวจสถานะ', 503);
        }
    }

    private static function bind(array &$filters, array $values): void
    {
        foreach ($values as $key => $value) {
            if ($filters[$key] !== '' && $filters[$key] !== $value) {
                throw new \InvalidArgumentException('ขอบเขตไม่ตรงกับการแข่งขันที่เลือก');
            }
            $filters[$key] = $value;
        }
    }

    private static function scopeLabel(array $filters): string
    {
        return implode(' · ', array_filter([
            EventDraft::DIVISIONS[$filters['division_code'] ?? ''] ?? '',
            $filters['district'] ?? '',
            $filters['province'] ?? '',
        ]));
    }

    private static function page(array $context, array $filters, string $body, int $status = 200, bool $review = false, bool $locked = false): array
    {
        $back = $review
            ? '<a class="btn" href="'.WorkspaceView::e(WorkspaceView::url('history', $filters)).'">'.WorkspaceView::icon('history').' ประวัติการจับสลาก</a>'
            : '<a class="btn" href="'.WorkspaceView::e(WorkspaceView::url('setup', $filters)).'">กลับตั้งค่าการจับสลาก</a>';
        $html = WorkspaceView::heading($review ? 'ผลการจับสลาก' : 'พิธีจับสลาก', self::scopeLabel($filters), $back, $review ? 'DRAW RESULT' : 'DRAW CEREMONY');
        $step = $locked ? 4 : ($review ? 3 : 2);
        $html .= '<div class="stepper">';
        foreach ([1=>'เลือกทีมและพื้นที่', 2=>'พิธีจับสลาก', 3=>'ตรวจสอบและล็อกผล', 4=>'จัดตารางการแข่งขัน'] as $number=>$label) {
            $class = $number < $step ? ' done' : ($number === $step ? ' current' : '');
            $html .= '<div class="step'.$class.'"><span>'.($number < $step ? '✓' : $number).'</span>'.$label.'</div>';
        }
        return WorkspaceView::page($review ? 'result' : 'ceremony', $html.'</div>'.$body, $context, $filters, $status);
    }

    private static function notice(array $context, array $filters, string $message, int $status = 200, string $action = '', bool $review = false): array
    {
        return self::page($context, $filters, '<div class="notice warning" role="status"><p>'.WorkspaceView::e($message).'</p>'.$action.'</div>', $status, $review);
    }

    private static function preparation(array $context, array $filters, int $count): array
    {
        $e = WorkspaceView::e(...);
        $html = '<section class="card"><div class="card-head"><h2>เตรียมการแข่งขันสำหรับพิธีจับสลาก</h2></div><div class="card-body">'
            .'<p>ยังไม่มีการแข่งขันย่อยในพื้นที่นี้ · มีทีมที่ผ่านเงื่อนไข '.$count.' ทีม</p>'
            .'<p>ยืนยันเตรียมการแข่งขันก่อน จากนั้นจึงกดเริ่มพิธีเพื่อบันทึกและเปิดผลจับสลาก</p>'
            .'<form method="post" data-ceremony-prepare action="'.$e(WorkspaceView::url('ceremony', $filters)).'">';
        foreach (['_csrf'=>$context['csrf'] ?? '', 'request_id'=>EventRepository::uuid(), 'operation'=>'prepare_ceremony'] as $key=>$value) {
            $html .= '<input type="hidden" name="'.$key.'" value="'.$e($value).'">';
        }
        $html .= '<button class="btn primary" type="submit">เตรียมการแข่งขันและไปพิธีจับสลาก</button></form></div></section>';
        return self::page($context, $filters, $html);
    }

    private static function form(array $context, array $filters, array $teams, string $hash, ?array $draw): array
    {
        $e = WorkspaceView::e(...);
        $count = count($teams);
        $version = $draw['version'] ?? 0;
        $html = '<form method="post" class="grid-two" data-ceremony-form action="'.$e(WorkspaceView::url('ceremony', $filters)).'">';
        foreach (['_csrf' => $context['csrf'] ?? '', 'request_id' => EventRepository::uuid(), 'version' => $version,
            'eligibility_hash' => $hash, 'operation' => $draw ? 'ceremony_redraw' : 'ceremony'] as $key => $value) {
            $html .= '<input type="hidden" name="'.$key.'" value="'.$e($value).'">';
        }
        $html .= '<section class="card"><div class="card-body"><div class="ceremony"><h2>'.($draw ? 'พิธีจับสลากใหม่' : 'พิธีจับสลากการแข่งขัน').'</h2>'
            .'<p class="ceremony-lead">'.$count.' ทีม</p>'.self::balls($teams, $draw !== null)
            .'<p class="ceremony-note" data-ceremony-submit-status role="status">'.($draw ? 'กรุณากรอกเหตุผลในการจับสลากใหม่ก่อนเริ่มพิธีจับสลาก' : 'พร้อมเริ่มพิธีจับสลาก').'</p>'
            .'<button class="btn gold" type="submit"'.($draw ? ' disabled' : '').'>เริ่มพิธีจับสลาก '.WorkspaceView::icon('arrow').'</button></div></div></section>'
            .'<section class="card"><div class="card-head"><h2>ข้อมูลพิธีจับสลาก</h2></div><div class="card-body">';
        if ($draw) $html .= '<label class="field">เหตุผลในการจับสลากใหม่ <textarea name="reason" required maxlength="300" placeholder="ระบุเหตุผลในการจับสลากอีกครั้ง..."></textarea></label>';
        $html .= '<div class="review-row"><span>เวอร์ชันถัดไป</span><b>V'.($version + 1).'</b></div>'
            .'<div class="review-row"><span>ผู้ดำเนินการ</span><b>'.$e($context['actor']['name'] ?? '').'</b></div>'
            .'<div class="notice warning"><p>หลังพิธีต้องตรวจสอบและยืนยันผลทั้งชุดก่อนจัดตาราง</p></div></div></section></form>';
        return self::page($context, $filters, $html);
    }

    private static function result(array $context, array $filters, array $draw, ?array $state, bool $canAct, bool $animate, bool $review = false, array $history = []): array
    {
        $e = WorkspaceView::e(...);
        $status = $state['status'] ?? null;
        $locked = $status === 'CONFIRMED_LOCKED';
        $label = match ($status) {
            'PENDING_CONFIRMATION' => 'รอยืนยันผลจับสลาก',
            'CONFIRMED_LOCKED' => 'ยืนยันและล็อกผลจับสลากแล้ว',
            default => $draw['published_at'] ? 'เผยแพร่ผลจับสลากแล้ว' : 'มีผลจับสลากที่บันทึกไว้',
        };
        $badgeClass = $locked ? 'locked' : ($status === 'PENDING_CONFIRMATION' ? 'pending' : '');
        if (!$review) {
            $html = '<section class="card"><div class="card-head"><h2>ผลการจับสลาก · V'.$e($draw['version']).'</h2>'
                .'<span class="badge'.($badgeClass !== '' ? ' '.$badgeClass : '').'">'.$e($label).'</span></div><div class="card-body"'.($animate ? ' data-ceremony-reveal' : '').'>'
                .self::ceremonyResult($filters, $draw, $animate, $history, $canAct)
                .'<div class="actions"><a class="btn primary" href="'.$e(WorkspaceView::url('result', $filters)).'"'.($animate && $draw['slots'] ? ' data-ceremony-review hidden' : '').'>ตรวจสอบผลการจับสลาก</a></div></div></section>';
            return self::page($context, $filters, $html, 200, false, $locked);
        }

        $when = '—';
        if (!empty($draw['created_at'])) {
            try {
                $dt = (new \DateTimeImmutable((string)$draw['created_at']))->setTimezone(new \DateTimeZone('Asia/Bangkok'));
                $when = $dt->format('d/m/').((int)$dt->format('Y') + 543).' '.$dt->format('H:i').' น.';
            } catch (\Throwable) {
                $when = (string)$draw['created_at'];
            }
        }
        $reason = trim((string)($draw['reason'] ?? '')) ?: 'จับสลากครั้งแรก';
        $html = '<section class="card"><div class="card-head"><div><h2>ผลจับสลากเวอร์ชัน '.$e($draw['version']).'</h2>'
            .'<p>ตรวจสอบคู่แข่งขันและตำแหน่งในสายการแข่งขันก่อนยืนยัน</p></div>'
            .'<span class="badge'.($badgeClass !== '' ? ' '.$badgeClass : '').'">'.$e($label).'</span></div>'
            .self::renderPairList($draw)
            .'<div class="summary-strip"><span>จับสลากเมื่อ <b>'.$e($when).'</b></span>'
            .'<span>เหตุผล <b>'.$e($reason).'</b></span>'
            .'<span>ทีมทั้งหมด <b>'.count($draw['slots']).' ทีม</b></span>'
            .($locked && $state ? '<span>ยืนยันโดย <b>'.$e($state['actor_name'] ?: $state['actor_id']).'</b></span>' : '')
            .'</div><div class="panel-action"><p>'.($locked ? 'ล็อกผลจับสลากแล้ว · ไม่มีการสุ่มใหม่' : 'การยืนยันจะล็อกผลทั้งชุดอย่างถาวร').'</p><div class="actions">';
        if (!$locked && $canAct) {
            $html .= '<a class="btn" href="'.$e(WorkspaceView::url('ceremony', $filters).'&redraw=1').'">สุ่มใหม่</a>'
                .'<button class="btn primary" type="button" data-open-draw-confirm>ยืนยันและล็อกผลทั้งชุด</button>';
        } else {
            $html .= '<a class="btn" href="'.$e(WorkspaceView::url('bracket', $filters)).'">ดูสายการแข่งขัน</a>'
                .'<a class="btn primary" href="'.$e(WorkspaceView::url('schedule', $filters)).'">ไปตารางการแข่งขัน '.WorkspaceView::icon('arrow').'</a>';
        }
        $html .= '</div></div></section>';
        if (!$locked && $canAct) $html .= self::confirmation($context, $filters, $draw);
        if ($status === 'PENDING_CONFIRMATION') {
            $html .= '<div class="notice warning" role="status"><div><strong>ยังไม่สามารถกำหนดวัน เวลา และสนาม</strong><p>ผู้ดำเนินการจับสลากต้องยืนยันและล็อกผลจับสลากทั้งชุดก่อน จึงจะเริ่มจัดตารางแข่งขันได้</p></div></div>';
        }
        return self::page($context, $filters, $html, 200, true, $locked);
    }

    /** Render 2-column pair-list cards matching the v17 mockup for pending-result review. */
    public static function renderPairList(array $draw): string
    {
        $e = WorkspaceView::e(...);
        $names = array_column($draw['slots'], 'name', 'source_team_id');
        $teamCount = count($draw['slots']);
        $structure = $teamCount > 1 ? DrawEngine::structure($teamCount) : ['playoff_pairs' => 0, 'direct_entry_slots' => []];
        $hasPlayoff = ($structure['playoff_pairs'] ?? 0) > 0;
        $round1 = array_values(array_filter($draw['fixtures'], static fn(array $f): bool => (int)$f['round'] === 1));
        $roundLabel = $hasPlayoff ? 'รอบเพลย์ออฟ' : 'รอบหลัก';
        $resolveTeam = static function (?array $side) use ($names): string {
            if (!$side) return 'รอผล';
            if (($side['type'] ?? '') === 'winner') return 'ผู้ชนะคู่ที่ '.(string)($side['match'] ?? '');
            return (string)($names[(string)($side['source_team_id'] ?? '')] ?? '—');
        };
        $abbr = static function (string $name): string {
            $t = trim($name);
            return $t === '' ? '?' : (preg_match('/^.{1,2}/us', $t, $m) ? $m[0] : '?');
        };
        $html = '<div class="pair-list">';
        foreach ($round1 as $fixture) {
            $home = $resolveTeam($fixture['side_a'] ?? null);
            $away = $resolveTeam($fixture['side_b'] ?? null);
            $html .= '<div class="pair"><div class="pair-id">คู่ที่ '.$e((string)$fixture['number']).' · '.$e($roundLabel).'</div>'
                .'<div class="team"><span class="crest">'.$e($abbr($home)).'</span><span>'.$e($home).'</span></div>'
                .'<div class="team"><span class="crest alt">'.$e($abbr($away)).'</span><span>'.$e($away).'</span></div></div>';
        }
        $directSlots = $structure['direct_entry_slots'] ?? [];
        if ($directSlots) {
            $directTeams = array_values(array_filter($draw['slots'], static fn(array $s): bool => in_array($s['slot'] ?? '', $directSlots, true)));
            foreach ($directTeams as $slot) {
                $tName = (string)($slot['name'] ?? '');
                $html .= '<div class="pair"><div class="pair-id">'.$e((string)($slot['slot'] ?? '')).' · รอแข่งขันรอบหลัก</div>'
                    .'<div class="team"><span class="crest">'.$e($abbr($tName)).'</span><span>'.$e($tName).'</span></div></div>';
            }
        }
        foreach ($draw['automatic_qualifiers'] ?? [] as $team) {
            $tName = (string)($names[$team['source_team_id'] ?? ''] ?? '');
            $html .= '<div class="pair"><div class="pair-id">ผ่านเข้ารอบอัตโนมัติ</div>'
                .'<div class="team"><span class="crest">'.$e($abbr($tName)).'</span><span>'.$e($tName).'</span></div></div>';
        }
        return $html.'</div>';
    }

    /** Render structured playoff and main-round tables for pending-result review. */
    public static function renderReviewTables(array $draw): string
    {
        $e = WorkspaceView::e(...);
        $names = array_column($draw['slots'], 'name', 'source_team_id');
        $slots = array_column($draw['slots'], 'slot', 'source_team_id');
        $teamCount = count($draw['slots']);
        $structure = $teamCount > 1 ? DrawEngine::structure($teamCount) : ['playoff_pairs' => 0, 'direct_entry_slots' => []];
        $hasPlayoff = ($structure['playoff_pairs'] ?? 0) > 0;
        $sideLabel = static function (?array $side) use ($e, $names, $slots): string {
            if (!$side) return '<span class="draw-tbd">รอผล</span>';
            if (($side['type'] ?? '') === 'winner') {
                return '<span class="draw-tbd">ผู้ชนะคู่ที่ '.$e((string)($side['match'] ?? '')).'</span>';
            }
            $id = (string)($side['source_team_id'] ?? '');
            $name = $names[$id] ?? '';
            $slot = $slots[$id] ?? (string)($side['slot'] ?? '');
            return ($slot !== '' ? '<span class="draw-slot-chip">'.$e($slot).'</span> ' : '')
                .'<strong class="draw-team-name">'.$e($name).'</strong>';
        };

        $html = '';
        if ($draw['fixtures']) {
            $html .= '<p data-ceremony-status role="status" class="draw-summary-note">'.($hasPlayoff
                ? 'แบ่งตารางรอบเพลย์ออฟและรอบปกติ (รอบหลัก) จากผลการจับสลาก'
                : 'แสดงตารางคู่แข่งขันรอบปกติ (รอบหลัก)').'</p>';
        }

        if ($hasPlayoff) {
            $playoffFixtures = array_values(array_filter($draw['fixtures'], static fn(array $f): bool => (int)$f['round'] === 1));
            $mainFixtures = array_values(array_filter($draw['fixtures'], static fn(array $f): bool => (int)$f['round'] === 2));
            if ($playoffFixtures) {
                $html .= '<section class="draw-result-section draw-result-playoff" aria-label="คู่แข่งขันรอบเพลย์ออฟ">'
                    .'<div class="draw-result-head"><h3>รอบเพลย์ออฟ (รอบคัดเลือก)</h3><span class="draw-badge-playoff">เพลย์ออฟ · '.count($playoffFixtures).' คู่</span></div>'
                    .'<div class="table-wrap"><table class="draw-result-table draw-table-playoff"><thead><tr>'
                    .'<th>คู่ที่</th><th>ทีม A</th><th class="text-center">VS</th><th>ทีม B</th><th>สถานะ</th>'
                    .'</tr></thead><tbody>';
                foreach ($playoffFixtures as $fixture) {
                    $html .= '<tr data-ceremony-pair><td class="draw-match-no">คู่ที่ '.$e((string)$fixture['number']).'</td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_a'] ?? null).'</td>'
                        .'<td class="draw-vs-cell"><span class="draw-vs">VS</span></td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_b'] ?? null).'</td>'
                        .'<td><span class="draw-badge-playoff">เล่นรอบเพลย์ออฟ</span></td></tr>';
                }
                $html .= '</tbody></table></div></section>';
            }
            $directSlots = $structure['direct_entry_slots'] ?? [];
            $directTeams = array_values(array_filter($draw['slots'], static fn(array $s): bool => in_array($s['slot'] ?? '', $directSlots, true)));
            $html .= '<section class="draw-result-section draw-result-main" aria-label="รอบปกติ (รอบหลัก)">'
                .'<div class="draw-result-head"><h3>รอบปกติ (รอบหลัก)</h3><span class="draw-badge-main">รอบหลัก · '.count($directTeams).' ทีมได้บาย</span></div>';
            if ($mainFixtures) {
                $html .= '<div class="table-wrap"><table class="draw-result-table draw-table-main"><thead><tr>'
                    .'<th>คู่ที่</th><th>ทีม A</th><th class="text-center">VS</th><th>ทีม B</th><th>หมายเหตุ</th>'
                    .'</tr></thead><tbody>';
                foreach ($mainFixtures as $fixture) {
                    $html .= '<tr><td class="draw-match-no">คู่ที่ '.$e((string)$fixture['number']).'</td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_a'] ?? null).'</td>'
                        .'<td class="draw-vs-cell"><span class="draw-vs">VS</span></td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_b'] ?? null).'</td>'
                        .'<td><span class="draw-badge-main">รอบหลัก</span></td></tr>';
                }
                $html .= '</tbody></table></div>';
            }
            if ($directTeams) {
                $html .= '<div class="draw-bye-list" role="list" aria-label="ทีมที่ได้บายรอแข่งขันรอบหลัก">';
                foreach ($directTeams as $slot) {
                    $html .= '<div class="draw-bye-item" role="listitem"><span class="draw-slot-chip">'.$e((string)($slot['slot'] ?? '')).'</span> '
                        .'<strong class="draw-team-name">'.$e((string)($slot['name'] ?? '')).'</strong>'
                        .' <span class="draw-badge-main">รอแข่งขันรอบหลัก</span></div>';
                }
                $html .= '</div>';
            }
            $html .= '</section>';
        } else {
            $round1 = array_values(array_filter($draw['fixtures'], static fn(array $f): bool => (int)$f['round'] === 1));
            if ($round1) {
                $html .= '<section class="draw-result-section draw-result-main" aria-label="รอบปกติ (รอบหลัก)">'
                    .'<div class="draw-result-head"><h3>รอบปกติ (รอบหลัก)</h3><span class="draw-badge-main">รอบหลัก · '.count($round1).' คู่</span></div>'
                    .'<div class="table-wrap"><table class="draw-result-table draw-table-main"><thead><tr>'
                    .'<th>คู่ที่</th><th>ทีม A</th><th class="text-center">VS</th><th>ทีม B</th><th>สถานะ</th>'
                    .'</tr></thead><tbody>';
                foreach ($round1 as $fixture) {
                    $html .= '<tr data-ceremony-pair><td class="draw-match-no">คู่ที่ '.$e((string)$fixture['number']).'</td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_a'] ?? null).'</td>'
                        .'<td class="draw-vs-cell"><span class="draw-vs">VS</span></td>'
                        .'<td class="draw-team-cell">'.$sideLabel($fixture['side_b'] ?? null).'</td>'
                        .'<td><span class="draw-badge-main">รอบหลัก</span></td></tr>';
                }
                $html .= '</tbody></table></div></section>';
            }
        }

        foreach ($draw['automatic_qualifiers'] as $team) {
            $html .= '<div class="draw-bye-item"><strong class="draw-team-name">'.$e($names[$team['source_team_id']] ?? '').'</strong> <span class="draw-badge-main">ผ่านเข้ารอบอัตโนมัติ</span></div>';
        }
        return $html;
    }

    /** Presentation only: slot order always comes from the committed server draw. */
    private static function balls(array $teams, bool $shuffle = false): string
    {
        $e = WorkspaceView::e(...);
        if ($shuffle) {
            shuffle($teams);
        } else {
            usort($teams, fn(array $a, array $b): int => strcmp($a['name'], $b['name']));
        }
        $html = '<div class="ceremony-machine" data-ceremony-machine aria-label="ลูกปิงปองชื่อทีม">';
        foreach ($teams as $index => $team) {
            $html .= '<div class="ceremony-ball-lane"><div class="ceremony-team-ball" data-ceremony-ball="'.$e($team['slot'] ?? '').'" style="--ball-delay:-'.($index % 9 * 0.17).'s" title="'.$e($team['name']).'"><span>'.$e($team['name']).'</span></div></div>';
        }
        return $html.'</div>';
    }

    private static function ceremonyResult(array $filters, array $draw, bool $animate, array $history = [], bool $canRedraw = false): string
    {
        $e = WorkspaceView::e(...);
        $total = count($draw['slots']);
        if ($animate) {
            $html = '<div class="ceremony"><h2>พิธีจับสลากการแข่งขัน</h2><p class="ceremony-lead">แสดงจากผลที่บันทึกไว้ · V'.$e($draw['version']).'</p>'.self::balls($draw['slots'])
                .'<p class="ceremony-lead" data-ceremony-status role="status">กำลังเตรียมเปิดทีม</p>'
                .'<p class="ceremony-note">เปิดแล้ว <span data-ceremony-counter>0</span> จาก '.$total.' ทีม</p></div>';
        } else {
            $ordered = $history ?: [$draw];
            usort($ordered, static fn(array $a, array $b): int => (int)($a['version'] ?? 0) <=> (int)($b['version'] ?? 0));
            $drawCount = count($ordered);
            $html = '<div class="ceremony"><h2>พิธีจับสลากการแข่งขัน</h2>'
                .'<p class="ceremony-lead">มีการจับสลากไปแล้ว '.$e((string)$drawCount).' ครั้ง</p>'
                .'<div class="ceremony-history" aria-label="ประวัติการจับสลาก"><strong>ประวัติการจับสลาก</strong><ol class="ceremony-history-list">';
            foreach ($ordered as $idx => $item) {
                $roundNo = (int)($item['version'] ?? ($idx + 1));
                $when = '—';
                if (!empty($item['created_at'])) {
                    try {
                        $when = (new \DateTimeImmutable((string)$item['created_at']))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('d/m/Y H:i').' น.';
                    } catch (\Throwable) {
                        $when = (string)$item['created_at'];
                    }
                }
                $reason = trim((string)($item['reason'] ?? '')) ?: 'จับสลากครั้งแรก';
                $actorName = trim((string)($item['actor_name'] ?? '')) ?: (string)($item['actor_id'] ?? '—');
                $html .= '<li><span class="ceremony-history-step">ครั้งที่ '.$e((string)$roundNo).'</span> · '.$e($when).' · '.$e($reason).' · โดย '.$e($actorName).'</li>';
            }
            $html .= '</ol></div>';
            if ($canRedraw) {
                $html .= '<a class="btn gold" href="'.$e(WorkspaceView::url('ceremony', $filters).'&redraw=1').'">จับฉลากอีกครั้ง '.WorkspaceView::icon('arrow').'</a>';
            }
            $html .= '<p class="ceremony-note">ถ้ามีการจับสลากอีกรอบจะต้องใส่เหตุผลด้วย</p></div>';
        }
        $html .= '<h3>ก้างปลาการแข่งขัน</h3><div class="ceremony-bracket-scroll" tabindex="0" aria-label="ก้างปลาผลจับสลาก"><div class="ceremony-bracket">';
        $names = array_column($draw['slots'], 'name', 'source_team_id');
        $rounds = array_unique(array_column($draw['fixtures'], 'round'));
        foreach ($rounds as $round) {
            $html .= '<section class="ceremony-round"><h4>รอบที่ '.$e((string)$round).'</h4><div class="ceremony-matches">';
            foreach ($draw['fixtures'] as $fixture) {
                if ((int)$fixture['round'] !== (int)$round) continue;
                $html .= '<article class="ceremony-match"><small>คู่ที่ '.$e((string)$fixture['number']).'</small>';
                foreach (['side_a', 'side_b'] as $key) {
                    $side = $fixture[$key];
                    if (($side['type'] ?? '') === 'team') {
                        $html .= self::ceremonySlot($side['slot'], $names[$side['source_team_id']] ?? '', $animate);
                    } else {
                        $html .= '<div class="ceremony-bracket-slot">ผู้ชนะคู่ที่ '.$e((string)($side['match'] ?? '')).'</div>';
                    }
                }
                $html .= '</article>';
            }
            $html .= '</div></section>';
        }
        foreach ($draw['automatic_qualifiers'] as $team) {
            foreach ($draw['slots'] as $slot) {
                if ($slot['source_team_id'] !== $team['source_team_id']) continue;
                $html .= '<section class="ceremony-round"><h4>ผ่านเข้ารอบอัตโนมัติ</h4>'.self::ceremonySlot($slot['slot'], $slot['name'], $animate).'</section>';
            }
        }
        $html .= '</div></div>';
        if ($animate) $html .= '<noscript><a class="btn" href="'.$e(WorkspaceView::url('ceremony', $filters)).'">เปิดผลที่บันทึกไว้</a></noscript>';
        return $html;
    }

    private static function ceremonySlot(string $slot, string $name, bool $animate): string
    {
        $e = WorkspaceView::e(...);
        return '<div class="ceremony-bracket-slot"><small>'.$e($slot).'</small><span data-ceremony-target="'.$e($slot).'"'.($animate ? ' hidden' : '').'>'.$e($name).'</span><span data-ceremony-wait="'.$e($slot).'"'.(!$animate ? ' hidden' : '').'>รอเปิดทีม</span></div>';
    }

    private static function history(array $context, array $filters, array $versions, string $message = '', int $status = 200): array
    {
        $e = WorkspaceView::e(...);
        $back = '<a class="btn" href="'.$e(WorkspaceView::url('result', $filters)).'">ผลจับสลากปัจจุบัน '.WorkspaceView::icon('arrow').'</a>';
        $html = WorkspaceView::heading('ประวัติการจับสลาก', self::scopeLabel($filters), $back, 'DRAW HISTORY');
        if (!$versions) {
            $html .= '<div class="notice warning" role="status"><p>'.$e($message ?: 'ยังไม่มีประวัติการจับสลากในขอบเขตนี้').'</p>';
            if ($status === 200) $html .= '<a class="btn" href="'.$e(WorkspaceView::url('setup', $filters)).'">ไปตั้งค่าการจับสลาก</a>';
            $html .= '</div>';
        }
        foreach ($versions as $draw) {
            $badge = $draw['is_current'] ? match ($draw['status']) {
                'PENDING_CONFIRMATION' => ' pending',
                'CONFIRMED_LOCKED' => ' locked',
                default => '',
            } : '';
            $label = $draw['is_current'] ? match ($draw['status']) {
                'PENDING_CONFIRMATION' => 'รอยืนยันผลจับสลาก',
                'CONFIRMED_LOCKED' => 'ยืนยันและล็อกผลจับสลากแล้ว',
                default => $draw['published_at'] ? 'เผยแพร่ผลจับสลากแล้ว' : 'มีผลจับสลากที่บันทึกไว้',
            } : 'เวอร์ชันก่อนหน้า';
            $date = self::historyTime($draw['created_at']);
            $html .= '<section class="card"><div class="card-head"><div><h2>เวอร์ชัน '.$e($draw['version'])
                .($draw['is_current'] ? ' · เวอร์ชันปัจจุบัน' : '').'</h2><p>'.$e($date).' · '.$e($draw['actor_name'] ?: $draw['actor_id'])
                .'</p></div><span class="badge'.$badge.'">'.$e($label).'</span></div><div class="card-body">'
                .'<div class="review-row"><span>เหตุผล</span><b>'.$e($draw['reason'] ?: '—').'</b></div>'
                .'<div class="review-row"><span>ทีม ณ เวลาจับสลาก</span><b>'.count($draw['slots']).' ทีม</b></div>';
            if ($draw['confirmed_at']) {
                $html .= '<div class="review-row"><span>ยืนยันและล็อกเมื่อ</span><b>'.$e(self::historyTime($draw['confirmed_at']))
                    .' · '.$e($draw['confirmed_by']).'</b></div>';
            }
            $names = array_column($draw['slots'], 'name', 'source_team_id');
            $html .= '<div class="history-pairs">';
            foreach ($draw['fixtures'] as $fixture) {
                if ((int)$fixture['round'] !== 1) continue;
                $html .= '<p><span class="muted">คู่ที่ '.$e($fixture['number']).'</span> '
                    .$e($names[$fixture['side_a']['source_team_id'] ?? ''] ?? '—').' <span class="versus">VS</span> '
                    .$e($names[$fixture['side_b']['source_team_id'] ?? ''] ?? '—').'</p>';
            }
            if ($draw['algorithm_version'] === DrawEngine::ALGORITHM && count($draw['slots']) > 1) {
                $directSlots = DrawEngine::structure(count($draw['slots']))['direct_entry_slots'];
                foreach ($draw['slots'] as $slot) {
                    if (in_array($slot['slot'], $directSlots, true)) $html .= '<p>'.$e($slot['name']).' · รอแข่งขันรอบหลัก</p>';
                }
            }
            foreach ($draw['automatic_qualifiers'] as $team) {
                $html .= '<p>'.$e($names[$team['source_team_id']] ?? '').' · ผ่านเข้ารอบอัตโนมัติ</p>';
            }
            $html .= '</div></div></section>';
        }
        return WorkspaceView::page('history', $html, $context, $filters, $status);
    }

    private static function historyTime(string $value): string
    {
        return (new \DateTimeImmutable($value))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('d/m/Y H:i').' น.';
    }

    private static function confirmation(array $context, array $filters, array $draw): string
    {
        $e = WorkspaceView::e(...);
        $html = '<dialog data-draw-confirm aria-labelledby="draw-confirm-title"><div class="dialog-head"><h2 id="draw-confirm-title">ยืนยันและล็อกผลจับสลากทั้งชุด</h2></div>'
            .'<form class="dialog-body" method="post" action="'.$e(WorkspaceView::url('result', $filters)).'">'
            .'<p>'.$e(self::scopeLabel($filters)).' · เวอร์ชัน '.$e($draw['version']).' · '.count($draw['slots']).' ทีม</p>'
            .'<p>เมื่อยืนยันแล้ว ผลทั้งชุดจะถูกล็อกถาวร</p>';
        foreach (['_csrf'=>$context['csrf'], 'request_id'=>EventRepository::uuid(), 'version'=>$draw['version'], 'draw_id'=>$draw['id'], 'operation'=>'confirm'] as $name=>$value) {
            $html .= '<input type="hidden" name="'.$name.'" value="'.$e($value).'">';
        }
        return $html.'<div class="dialog-actions"><button class="btn" type="button" data-close-draw-confirm autofocus>กลับไปตรวจผล</button>'
            .'<button class="btn primary" type="submit">ยืนยันและล็อกผล</button></div></form></dialog>';
    }
}
