<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Read-only current tournament bracket in the v16 workspace. */
final class BracketPages
{
    public const PATH = '/phase2demo/workspace/pending-bracket';

    public static function render(string $method, array $query, array $context, ?\PDO $db = null): array
    {
        $actor = $context['actor'] ?? null;
        if (!in_array($actor['role'] ?? '', ['SUPER_ADMIN', 'SAT_OFFICER', 'DOCUMENT_VERIFIER'], true)) {
            return [403, 'ไม่มีสิทธิ์เข้าถึงระบบจัดการแข่งขัน'];
        }
        if ($method !== 'GET') return [405, 'หน้านี้รองรับการเปิดดูเท่านั้น'];

        $filters = [];
        try {
            $filters = DashboardReadModel::query($query, $actor);
            if (!$db && !EventRepository::configured()) return self::notice($context, $filters, 'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน', 503);
            $db ??= EventRepository::connect();
            $model = (new DashboardReadModel($db))->load($actor, $query);
            $model['filter_input']=$filters['competition_id']!==''?$model['filters']:$filters;
            $filters = DashboardPages::filterValues($model,'bracket');
            $filters['match_id'] = '';
            $complete = $filters['season_id'] !== '' && $filters['event_id'] !== '' && $filters['division_code'] !== '' && $filters['province'] !== ''
                && ($filters['stage'] === '2' || ($filters['stage'] === '1' && $filters['district'] !== ''));
            $competitionRepo = new CompetitionRepository($db);

            if ($filters['competition_id'] !== '') {
                $scope = $competitionRepo->requireAccess($filters['competition_id'], $actor);
            } elseif ($complete) {
                $scope = $competitionRepo->findDrawScope($filters);
                if ($scope) $scope = $competitionRepo->requireAccess($scope['id'], $actor);
            } else {
                return self::page($context, $filters, DashboardPages::filters($model, $actor, 'bracket')
                    .'<div class="notice warning" role="status"><p>เลือกจังหวัดและอำเภอ/เขต หรือระบุรายการแข่งขัน เพื่อแสดงสายการแข่งขัน</p></div>');
            }

            if (!$scope) {
                return self::page($context, $filters, DashboardPages::filters($model, $actor, 'bracket')
                    .'<div class="empty card"><h2>ยังไม่มีการแข่งขันในขอบเขตนี้</h2><p>ตรวจสอบรุ่นอายุ ระดับ และพื้นที่ที่เลือก</p></div>');
            }
            if (!in_array((int)$scope['stage'], [1, 2], true)) throw new \InvalidArgumentException('สายการแข่งขันรองรับ Stage 1–2');
            self::bind($filters, $scope);
            $event = (new EventRepository($db))->get($scope['event_id']);
            if (!$event) throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
            $eventMode = $event['is_test'] ? 'demo' : 'real';
            if (($filters['event_id'] !== '' && $filters['event_id'] !== $event['id'])
                || ($filters['season_id'] !== '' && $filters['season_id'] !== $event['season_id'])
                || ($filters['data_mode'] !== '' && $filters['data_mode'] !== $eventMode)) {
                throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับรายการที่เลือก');
            }
            $filters['event_id'] = $event['id'];$filters['season_id'] = $event['season_id'];$filters['data_mode'] = $eventMode;

            $draws = new DrawRepository($db);
            if (!$draws->ready()) return self::notice($context, $filters, 'ระบบจับสลากยังไม่พร้อมใช้งาน', 503);
            $draw = $draws->current($scope['id']);
            if (!$draw) {
                $setup = (new RosterRepository($db))->current($scope['id']);
                $message = !$setup || !$setup['locked']
                    ? 'ยังไม่มีผลจับสลาก กรุณาตรวจสอบและล็อกรายชื่อทีมก่อนเริ่มพิธีจับสลาก'
                    : 'ยังไม่มีผลจับสลากในขอบเขตนี้';
                return self::page($context, $filters, DashboardPages::filters($model, $actor, 'bracket')
                    .'<div class="empty card"><h2>'.$message.'</h2><p>เมื่อมีผลจับสลากแล้ว ระบบจะแสดงสายและสถานะของแต่ละคู่ที่นี่</p><a class="btn primary" href="'.WorkspaceView::e(WorkspaceView::url('ceremony', $filters)).'">ไปที่พิธีจับฉลาก</a></div>');
            }

            return self::page($context, $filters, DashboardPages::filters($model, $actor, 'bracket')
                .self::content($db, $scope, $filters, $draw, $draws));
        } catch (\InvalidArgumentException $error) {
            return self::notice($context, $filters, $error->getMessage(), 400);
        } catch (\UnexpectedValueException $error) {
            return self::notice($context, $filters, $error->getMessage(), 403);
        } catch (\OutOfBoundsException $error) {
            return self::notice($context, $filters, $error->getMessage(), 404);
        } catch (\PDOException|\RuntimeException $error) {
            error_log('Workspace bracket read failed: '.get_class($error));
            return self::notice($context, $filters, 'ไม่สามารถอ่านสายการแข่งขันได้ กรุณาลองใหม่', 503);
        }
    }

    private static function content(\PDO $db, array $scope, array $filters, array $draw, DrawRepository $draws): string
    {
        $e = WorkspaceView::e(...);
        $matches = (new MatchRepository($db))->list($scope['id']);
        $matchByNumber = array_column($matches, null, 'number');
        $names = array_column($draw['slots'], 'name', 'source_team_id');
        $resultsByNumber = [];
        if ((new ResultRepository($db))->ready()) {
            $stmt = $db->prepare('SELECT m.number,r.state,r.result FROM p2_match m LEFT JOIN p2_result_revision r ON r.id=m.confirmed_result_id AND r.match_id=m.id WHERE m.draw_id=?');
            $stmt->execute([$draw['id']]);
            foreach ($stmt->fetchAll() as $row) $resultsByNumber[(int)$row['number']] = [
                'state'=>$row['state'], 'result'=>$row['result'] ? json_decode($row['result'],true,512,JSON_THROW_ON_ERROR) : null,
            ];
        }
        $state = $draws->ceremonyState($scope['event_id'], $draw['id']);
        $locked = ($state['status'] ?? null) === 'CONFIRMED_LOCKED';
        $status = match ($state['status'] ?? null) {
            'PENDING_CONFIRMATION' => 'รอยืนยันผลจับสลาก',
            'CONFIRMED_LOCKED' => 'ยืนยันและล็อกผลจับสลากแล้ว',
            default => $draw['published_at'] ? 'เผยแพร่ผลจับสลากแล้ว' : 'มีผลจับสลากที่บันทึกไว้',
        };
        $roundCounts = [];
        foreach ($draw['fixtures'] as $fixture) $roundCounts[(int)$fixture['round']] = ($roundCounts[(int)$fixture['round']] ?? 0) + 1;
        $lastRound = $draw['fixtures'] ? max(array_column($draw['fixtures'], 'round')) : 0;
        $structure = DrawEngine::structure(count($draw['slots']));

        $html = '';
        $html .= '<section class="card"><div class="card-head"><div><h2>สายการแข่งขันระดับ'.((int)$scope['stage']===1?'อำเภอ':'จังหวัด').'</h2>'
            .'<p>'.$e($scope['event_name']).' · '. $e(EventDraft::DIVISIONS[$scope['division_code']] ?? $scope['division_code']).' · '
            .$e(implode(' · ',array_filter([$scope['district'],$scope['province']]))).' · เวอร์ชัน '.$e($draw['version']).'</p></div>'
            .'<span class="badge '.($locked?'locked':'pending').'">'.$e($status).'</span></div>';
        if (!$locked) $html .= '<div class="card-body"><div class="notice warning" role="status" style="justify-content:space-between;align-items:center;flex-wrap:wrap"><div><strong>ผลจับสลากรอยืนยันและล็อกก่อนจัดตารางแข่งขัน</strong><p>ตำแหน่งทีมยังเปลี่ยนแปลงได้จนกว่าจะยืนยันและล็อกผลจับสลาก</p></div><a class="btn compact" href="'. $e(WorkspaceView::url('result',$filters)).'">ตรวจผลการจับสลาก →</a></div></div>';
        if ($draw['fixtures']) {
            $html .= '<div class="bracket-scroll" tabindex="0" aria-label="สายการแข่งขัน"><div class="bracket">';
            $rounds = array_values(array_unique(array_map(fn($fixture)=>(int)$fixture['round'],$draw['fixtures'])));
            foreach ($rounds as $round) {
                $html .= '<section class="round"><h3 class="round-title">'. $e(self::roundName($round,$lastRound,$roundCounts,$structure)).'</h3><div class="round-matches">';
                // Group consecutive fixtures under a single round column.
                foreach ($draw['fixtures'] as $candidate) {
                    if ((int)$candidate['round'] !== $round) continue;
                    $match = $matchByNumber[(int)$candidate['number']] ?? null;
                    $official = $resultsByNumber[(int)$candidate['number']] ?? null;
                    $winner = $official && $official['state']==='CONFIRMED' ? ($official['result']['winner'] ?? null) : null;
                    $sideA = self::side($candidate['side_a'],$resultsByNumber,$names);
                    $sideB = self::side($candidate['side_b'],$resultsByNumber,$names);
                    $matchId = $match['id'] ?? '';
                    $detail = $matchId !== '' ? '/phase2demo/competitions/'.$e($scope['id']).'/matches/'.$e($matchId) : $schedule;
                    $stateLabel = $match ? (MatchPages::STATES[$match['state']] ?? 'ยังไม่กำหนดวัน') : 'ยังไม่มีข้อมูลคู่แข่งขัน';
                    $date = $match && $match['scheduled_start'] ? self::date($match['scheduled_start']) : 'ยังไม่กำหนดวัน';
                    $html .= '<a class="bracket-match" href="'.$e($detail).'" aria-label="คู่ที่ '.$e($candidate['number']).' รายละเอียดการแข่งขัน">'
                        .'<div class="pair-id">M'.str_pad((string)$candidate['number'],2,'0',STR_PAD_LEFT).' · '.$e($stateLabel).'</div>'
                        .'<div class="bracket-team'.($winner && self::teamId($candidate['side_a'],$resultsByNumber)===$winner?' winner':'').'">'.$e($sideA).'</div>'
                        .'<div class="bracket-team'.($winner && self::teamId($candidate['side_b'],$resultsByNumber)===$winner?' winner':'').'">'.$e($sideB).'</div><small>'.$e($date).'</small>'
                        .($match && $match['venue_name']?'<small>'.$e($match['venue_name']).'</small>':'').'</a>';
                }
                $html .= '</div></section>';
            }
            $html .= '</div></div><div class="table-footer"><span>เลือกคู่แข่งขันเพื่อเปิดรายละเอียด · เลื่อนแนวนอนเพื่อดูทุกรอบ</span><span>ทีมจะผ่านเข้ารอบเมื่อยืนยันผลการแข่งขัน</span></div>';
        } else {
            $html .= '<div class="card-body"><div class="notice">มีทีมเดียวในสายและผ่านเข้ารอบอัตโนมัติ โดยไม่มีการสร้างคู่แข่งขันหรือผลคะแนน</div></div>';
        }
        if ($structure['direct_entry_slots']) {
            $html .= '<div class="card-body"><h3>ทีมที่รอแข่งขันในรอบหลัก</h3><div class="choice-row">';
            foreach ($draw['slots'] as $slot) if (in_array($slot['slot'],$structure['direct_entry_slots'],true))
                $html .= '<span class="badge">'.$e($slot['slot']).' · '.$e($slot['name']).' · รอแข่งขันรอบหลัก</span>';
            $html .= '</div></div>';
        }
        foreach ($draw['automatic_qualifiers'] as $qualifier) {
            $html .= '<div class="card-body"><div class="notice success">'.$e($names[$qualifier['source_team_id']] ?? 'ทีมที่ผ่านอัตโนมัติ').' · ผ่านเข้ารอบอัตโนมัติ (ไม่มีแมตช์หรือสกอร์บาย)</div></div>';
        }
        return $html.'</section>';
    }

    private static function side(array $side, array $results, array $names): string
    {
        $teamId = self::teamId($side,$results);
        if ($teamId !== null) return $names[$teamId] ?? 'ทีมที่ผ่านเข้ารอบ';
        if (($side['type'] ?? '') === 'team') return ($side['slot'] ?? '').' · '.($names[$side['source_team_id'] ?? ''] ?? 'ทีม');
        return 'ผู้ชนะ M'.($side['match'] ?? '—');
    }

    private static function teamId(array $side, array $results): ?string
    {
        if (($side['type'] ?? '') === 'team') return $side['source_team_id'] ?? null;
        $previous = $results[(int)($side['match'] ?? 0)] ?? null;
        return $previous && $previous['state']==='CONFIRMED' ? ($previous['result']['winner'] ?? null) : null;
    }

    private static function roundName(int $round, int $last, array $counts, array $structure): string
    {
        if ($round === $last) return 'รอบชิงชนะเลิศ';
        if ($round === 1 && $structure['playoff_pairs'] > 0) return 'รอบเพลย์ออฟ';
        return match ($counts[$round] ?? 0) {
            2 => 'รอบรองชนะเลิศ',
            4 => 'รอบก่อนรองชนะเลิศ',
            default => 'รอบที่ '.$round,
        };
    }

    private static function bind(array &$filters, array $scope): void
    {
        foreach (['event_id'=>'event_id','competition_id'=>'id','division_code'=>'division_code','stage'=>'stage','province'=>'province','district'=>'district'] as $filter=>$key) {
            $value = (string)($scope[$key] ?? '');
            if ($filter === 'stage' && (int)($scope[$key] ?? 0) === 2) $value = '2';
            if ($filters[$filter] !== '' && $filters[$filter] !== $value) throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับการแข่งขันที่เลือก');
            $filters[$filter] = $value;
        }
    }

    private static function date(?string $date): string
    {
        if (!$date) return 'ยังไม่กำหนดวัน';
        try { return (new \DateTimeImmutable($date))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('d/m/Y H:i').' น.'; }
        catch (\Exception) { return 'ยังไม่กำหนดวัน'; }
    }

    private static function page(array $context, array $filters, string $body, int $status=200): array
    {
        $actions=WorkspaceView::clearFilters('bracket',$filters);
        if($status===200&&($filters['competition_id'] ?? '')!=='')$actions.='<a class="btn" href="'.WorkspaceView::e(WorkspaceView::url('schedule',$filters)).'">'.WorkspaceView::icon('calendar').'ตารางการแข่งขัน</a>';
        $heading=WorkspaceView::heading('สายการแข่งขัน','ติดตามทีมผ่านเข้ารอบ และเปิดรายละเอียดจากคู่แข่งขัน',$actions,'TOURNAMENT BRACKET');
        return WorkspaceView::page('bracket',$heading.$body,$context,$filters,$status);
    }

    private static function notice(array $context, array $filters, string $message, int $status): array
    {
        return self::page($context,$filters,'<div class="notice warning" role="alert"><p>'.WorkspaceView::e($message).'</p></div>',$status);
    }
}
