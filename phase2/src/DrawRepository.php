<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class DrawRepository
{
    public function __construct(private \PDO $db) {}
    public function ready(): bool { return $this->db->query("SELECT to_regclass('p2_draw_version') IS NOT NULL")->fetchColumn()===true; }
    public function savedSetup(string $id):?array
    {
        $q=$this->db->prepare("SELECT a.request_id,a.actor_id,a.new_state FROM p2_audit_log a JOIN p2_competition c ON c.event_id=a.event_id WHERE c.id=? AND a.action='DRAW_SETUP_SAVED' AND a.new_state->>'competition_id'=c.id::text ORDER BY a.id DESC LIMIT 1");$q->execute([$id]);$row=$q->fetch();
        if(!$row)return null;$state=json_decode($row['new_state'],true,512,JSON_THROW_ON_ERROR);return ['request_id'=>$row['request_id'],'preview'=>$state['preview']];
    }
    public function lastSavedCompetition(array $actor,?string $event=null):?string
    {
        $sql="SELECT new_state->>'competition_id' FROM p2_audit_log WHERE action='DRAW_SETUP_SAVED' AND actor_id=? AND new_state->>'actor_role'=?";$args=[$actor['id'],$actor['role']];
        if($event!==null){$sql.=' AND event_id=?';$args[]=$event;}
        $q=$this->db->prepare($sql.' ORDER BY id DESC LIMIT 1');$q->execute($args);return $q->fetchColumn() ?: null;
    }
    /** Durable Save acknowledgement, independent from merely finding a Competition. */
    public function saveSetup(string $id,array $actor,string $request,array $preview):array
    {
        if(($actor['role'] ?? '')!=='SUPER_ADMIN')throw new \UnexpectedValueException('เฉพาะ Super Admin เท่านั้นที่บันทึกการตั้งค่า');
        if(!EventRepository::validUuid($request))throw new \InvalidArgumentException('รหัสคำขอไม่ถูกต้อง');
        $this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-draw-setup:'.$request]);
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$id]);
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$id]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($id,$actor,'draw');
            $q=$this->db->prepare("SELECT actor_id,new_state FROM p2_audit_log WHERE event_id=? AND action='DRAW_SETUP_SAVED' AND request_id=?");$q->execute([$scope['event_id'],$request]);$old=$q->fetch();
            if($old){$state=json_decode($old['new_state'],true,512,JSON_THROW_ON_ERROR);if($old['actor_id']!==$actor['id']||$state['competition_id']!==$id)throw new \DomainException('คำขอนี้ถูกใช้กับการตั้งค่าอื่นแล้ว');$this->db->commit();return ['request_id'=>$request,'preview'=>$state['preview']];}
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],'DRAW_SETUP_SAVED',$request,json_encode(['competition_id'=>$id,'actor_role'=>$actor['role'],'preview'=>$preview],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
            $this->db->commit();return ['request_id'=>$request,'preview'=>$preview];
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    public function history(string $id): array
    {
        $query = $this->db->prepare("SELECT d.*, p.published_at, d.id=c.draw_version_id AS is_current,
                operator.actor_name, state.status, state.confirmed_at, state.confirmed_by
            FROM p2_draw_version d
            JOIN p2_competition c ON c.id=d.competition_id
            LEFT JOIN p2_draw_publication p ON p.draw_id=d.id
            LEFT JOIN LATERAL (
                SELECT new_state->>'actor_name' AS actor_name
                FROM p2_audit_log
                WHERE event_id=c.event_id AND new_state->>'draw_id'=d.id::text
                    AND action IN ('DRAW_CEREMONY','DRAW_CEREMONY_REDRAW')
                ORDER BY id DESC LIMIT 1
            ) operator ON true
            LEFT JOIN LATERAL (
                SELECT new_state->>'status' AS status,
                    CASE WHEN action='DRAW_CONFIRMED_LOCKED' THEN created_at END AS confirmed_at,
                    CASE WHEN action='DRAW_CONFIRMED_LOCKED' THEN COALESCE(NULLIF(new_state->>'actor_name',''),actor_id) END AS confirmed_by
                FROM p2_audit_log
                WHERE event_id=c.event_id AND new_state->>'draw_id'=d.id::text
                    AND action IN ('DRAW_CEREMONY','DRAW_CEREMONY_REDRAW','DRAW_CONFIRMED_LOCKED')
                ORDER BY id DESC LIMIT 1
            ) state ON true
            WHERE d.competition_id=? ORDER BY d.version DESC");
        $query->execute([$id]);
        return array_map(self::decode(...), $query->fetchAll());
    }
    public function current(string $id): ?array
    {
        $s=$this->db->prepare('SELECT d.*,p.published_at FROM p2_competition c JOIN p2_draw_version d ON d.id=c.draw_version_id LEFT JOIN p2_draw_publication p ON p.draw_id=d.id WHERE c.id=?');$s->execute([$id]);$row=$s->fetch();return $row?self::decode($row):null;
    }
    public function started(string $draw): bool
    {
        $s=$this->db->prepare('SELECT EXISTS(SELECT 1 FROM p2_match WHERE draw_id=? AND started_at IS NOT NULL)');$s->execute([$draw]);return $s->fetchColumn()===true;
    }
    public function ceremonyStatus(string $event, string $draw): ?string
    {
        return $this->ceremonyState($event, $draw)['status'] ?? null;
    }

    public function ceremonyState(string $event, string $draw): ?array
    {
        $query = $this->db->prepare("SELECT actor_id, created_at, new_state->>'status' AS status, new_state->>'actor_role' AS actor_role, new_state->>'actor_name' AS actor_name FROM p2_audit_log WHERE event_id=? AND action IN ('DRAW_CEREMONY','DRAW_CEREMONY_REDRAW','DRAW_CONFIRMED_LOCKED') AND new_state->>'draw_id'=? ORDER BY id DESC LIMIT 1");
        $query->execute([$event, $draw]);
        return $query->fetch() ?: null;
    }

    public static function isCeremonyOperator(array $draw, ?array $state, array $actor): bool
    {
        return $draw['actor_id'] === $actor['id']
            && (!isset($state['actor_role']) || $state['actor_role'] === $actor['role']);
    }

    public function everPublished(string $competition): bool
    {
        $query = $this->db->prepare('SELECT EXISTS(SELECT 1 FROM p2_draw_version d JOIN p2_draw_publication p ON p.draw_id=d.id WHERE d.competition_id=?)');
        $query->execute([$competition]);
        return $query->fetchColumn() === true;
    }

    /** Owner rule: drafts, lineups and published schedules do not lock a redraw. */
    public function hasConfirmedResult(string $competition): bool
    {
        $q = $this->db->prepare("SELECT EXISTS(SELECT 1 FROM p2_match m JOIN p2_result_revision r ON r.match_id=m.id AND r.state='CONFIRMED' WHERE m.competition_id=?)");
        $q->execute([$competition]);
        return $q->fetchColumn() === true;
    }

    public function execute(string $id,array $actor,array $input): array
    {
        $request=$input['request_id'] ?? null;$operation=$input['operation'] ?? null;$expected=$input['version'] ?? null;
        $reason=is_string($input['reason'] ?? null)?trim($input['reason']):'';
        $eligibility=is_string($input['eligibility_hash'] ?? null)?$input['eligibility_hash']:'';
        $ceremony = in_array($operation,['ceremony','ceremony_redraw'],true);
        $first = in_array($operation,['start','create','ceremony'],true);
        $checksEligibility = $operation==='start' || $ceremony;
        $redraw = in_array($operation,['redraw','ceremony_redraw'],true);
        $confirm = $operation === 'confirm';
        $expectedDraw = $input['draw_id'] ?? null;
        if (!EventRepository::validUuid($request) || !in_array($operation,['start','create','redraw','publish','ceremony','ceremony_redraw','confirm'],true) || !preg_match('/^[0-9]{1,8}$/D',is_scalar($expected)?(string)$expected:'')
            || ($checksEligibility&&!preg_match('/^[a-f0-9]{64}$/D',$eligibility))
            || ($confirm&&!EventRepository::validUuid($expectedDraw))
            || ($redraw && !preg_match('/^.{1,300}$/usD',$reason))) throw new \InvalidArgumentException('กรุณาตรวจคำขอ เวอร์ชัน และเหตุผลสุ่มใหม่');
        if ($operation==='redraw' && ($actor['role'] ?? null)!=='SUPER_ADMIN') throw new \UnexpectedValueException('เฉพาะ Super Admin เท่านั้นที่สุ่มใหม่ได้');
        $hash=hash('sha256',json_encode([$id,$actor['id'],$actor['role'],$operation,(int)$expected,$redraw?$reason:''],JSON_THROW_ON_ERROR));
        $setupRequest=is_string($input['setup_request_id'] ?? null)?$input['setup_request_id']:'';
        if($operation==='start')$hash=hash('sha256',$hash.$eligibility.$setupRequest);
        if($ceremony)$hash=hash('sha256',$hash.$eligibility);
        if($confirm)$hash=hash('sha256',$hash.$expectedDraw);
        $this->db->beginTransaction();
        try {
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-draw:'.$request]);
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$id]);
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$id]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($id,$actor,'draw');
            $s=$this->db->prepare('SELECT * FROM p2_draw_request WHERE request_id=?');$s->execute([$request]);$retry=$s->fetch();
            if($retry){if(!hash_equals($retry['request_hash'],$hash))throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');$this->db->commit();return ['id'=>$retry['draw_id']];}
            if($operation==='start'){
                $saved=$this->savedSetup($id);
                if(!$saved||!EventRepository::validUuid($setupRequest)||$saved['request_id']!==$setupRequest||!hash_equals($saved['preview']['eligibility_hash'],$eligibility))throw new \DomainException('กรุณาบันทึกการตั้งค่าชุดนี้ให้สำเร็จก่อนเริ่มพิธีจับสลาก');
            }
            if(!in_array((int)$scope['stage'],[1,2],true))throw new \DomainException('รองรับการจับสลาก Stage 1–2 ในขั้นนี้');
            if(!in_array($scope['template_version_id'],DrawEngine::TEMPLATES,true))throw new \DomainException('เทมเพลทนี้ไม่ใช่แพ้คัดออก กรุณารอระบบจัดโปรแกรมที่ตรงรูปแบบ');
            $previous=$this->current($id);
            if(($previous['version'] ?? 0)!==(int)$expected || ($confirm && ($previous['id'] ?? null)!==$expectedDraw))throw new \DomainException('เวอร์ชันเปลี่ยนแล้ว กรุณาโหลดผลล่าสุดมาตรวจสอบ');
            if(($first && $previous) || (!$first && !$previous))throw new \DomainException('การดำเนินการไม่ตรงกับสถานะการจับสลาก');
            $previousState = $previous ? $this->ceremonyState($scope['event_id'],$previous['id']) : null;
            $previousStatus = $previousState['status'] ?? null;
            if ($confirm) {
                if (!self::isCeremonyOperator($previous,$previousState,$actor)) throw new \UnexpectedValueException('เฉพาะผู้ดำเนินพิธีเดิมเท่านั้นที่ยืนยันผลได้');
                if ($previousStatus === 'CONFIRMED_LOCKED') {
                    $this->db->prepare('INSERT INTO p2_draw_request(request_id,request_hash,draw_id) VALUES (?,?,?)')->execute([$request,$hash,$expectedDraw]);
                    $this->db->commit();
                    return ['id'=>$expectedDraw];
                }
                if ($previousStatus !== 'PENDING_CONFIRMATION' || $this->started($expectedDraw) || $this->everPublished($id)) {
                    throw new \DomainException('ผลจับสลากชุดนี้ไม่อยู่ในสถานะที่ยืนยันได้');
                }
                $state = [
                    'competition_id'=>$id, 'draw_id'=>$expectedDraw, 'version'=>(int)$expected,
                    'status'=>'CONFIRMED_LOCKED', 'actor_role'=>$actor['role'], 'actor_name'=>$actor['name'] ?? null,
                ];
                $this->db->prepare('INSERT INTO p2_draw_request(request_id,request_hash,draw_id) VALUES (?,?,?)')->execute([$request,$hash,$expectedDraw]);
                $this->db->prepare("INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,'DRAW_CONFIRMED_LOCKED',?,CAST(? AS jsonb))")
                    ->execute([$scope['event_id'],$actor['id'],$request,json_encode($state,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
                $this->db->commit();
                return ['id'=>$expectedDraw];
            }
            if($previousStatus!==null && in_array($operation,['publish','redraw'],true))throw new \DomainException('ผลพิธีจับสลากต้องยืนยันในขั้นตอนตรวจสอบผล');
            if($operation==='ceremony_redraw'){
                if($this->hasConfirmedResult($id))throw new \DomainException('ยืนยันผลการแข่งขันแล้วอย่างน้อย 1 คู่ จึงล็อกผลจับสลากและไม่สามารถจับสลากใหม่ได้');
            }elseif(($ceremony || $redraw) && $this->everPublished($id)){
                throw new \DomainException('รายการนี้เคยเผยแพร่คู่แข่งขันแล้ว ไม่สามารถสุ่มใหม่ได้');
            }
            $roster=(new RosterRepository($this->db))->current($id);
            if(in_array($operation,['start','ceremony','ceremony_redraw'],true)&&(int)$scope['stage']===1){
                // Source reads, immutable snapshot, random result and fixtures commit together.
                $this->db->exec('LOCK TABLE football_registered_team,football_player,football_official IN SHARE MODE');
                $teams=(new RegistrationAdapter($this->db))->candidates($scope,true);
                if(!$teams)throw new \DomainException('ยังไม่มีทีมที่อนุมัติทีมและนักกีฬาครบในรุ่นและพื้นที่นี้');
                $json=json_encode($teams,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$fingerprint=hash('sha256',$json);
                if(!hash_equals($eligibility,$fingerprint))throw new \DomainException($ceremony?'รายชื่อทีมเปลี่ยนแล้ว กรุณากลับไปตรวจรายชื่อล่าสุดก่อนเริ่มพิธี':'รายชื่อหรือข้อมูลทีมเปลี่ยนแล้ว กรุณาเลือกตัวกรองใหม่และบันทึกอีกครั้งก่อนเริ่มพิธี');
                $revision=EventRepository::uuid();
                $this->db->prepare('INSERT INTO p2_roster_revision(id,competition_id,version,teams,fingerprint,locked,request_id,request_hash,actor_id) VALUES (?,?,?,CAST(? AS jsonb),?,true,?,?,?)')->execute([$revision,$id,($roster['version'] ?? 0)+1,$json,$fingerprint,$request,$hash,$actor['id']]);
                $this->db->prepare('UPDATE p2_competition SET roster_revision_id=? WHERE id=?')->execute([$revision,$id]);
                $roster=(new RosterRepository($this->db))->current($id);
            }
            if(!$roster || !$roster['locked'])throw new \DomainException('ต้องนำทีมผ่านเข้ารอบให้ครบก่อนจับสลาก');
            if($checksEligibility&&!hash_equals($eligibility,$roster['fingerprint']))throw new \DomainException('รายชื่อเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด');
            if((int)$scope['stage']===1 && count($roster['teams'])>8)throw new \DomainException('Stage 1 รองรับสูงสุด 8 ทีม');
            if($operation==='publish') {
                $draw=$previous['id'];
                if($previous['published_at']===null)$this->db->prepare('INSERT INTO p2_draw_publication(draw_id,actor_id) VALUES (?,?)')->execute([$draw,$actor['id']]);
                else throw new \DomainException('เวอร์ชันนี้เผยแพร่แล้ว');
            } else {
                if($previous && $this->started($previous['id']))throw new \DomainException('มีคู่แข่งขันเริ่มแล้ว ไม่สามารถสุ่มใหม่ได้');
                $result=DrawEngine::generate($roster['teams']);$draw=EventRepository::uuid();
                $this->db->prepare('INSERT INTO p2_draw_version(id,competition_id,roster_revision_id,version,algorithm_version,slots,fixtures,automatic_qualifiers,actor_id,reason) VALUES (?,?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb),CAST(? AS jsonb),?,?)')->execute([$draw,$id,$roster['id'],(int)$expected+1,DrawEngine::ALGORITHM,json_encode($result['slots'],JSON_THROW_ON_ERROR),json_encode($result['fixtures'],JSON_THROW_ON_ERROR),json_encode($result['automatic_qualifiers'],JSON_THROW_ON_ERROR),$actor['id'],$redraw?$reason:'จับสลากครั้งแรก']);
                foreach($result['fixtures'] as $fixture)$this->db->prepare('INSERT INTO p2_match(id,competition_id,draw_id,number,round,side_a,side_b) VALUES (?,?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb))')->execute([EventRepository::uuid(),$id,$draw,$fixture['number'],$fixture['round'],json_encode($fixture['side_a'],JSON_THROW_ON_ERROR),json_encode($fixture['side_b'],JSON_THROW_ON_ERROR)]);
                $this->db->prepare('UPDATE p2_competition SET draw_version_id=? WHERE id=?')->execute([$draw,$id]);
            }
            $this->db->prepare('INSERT INTO p2_draw_request(request_id,request_hash,draw_id) VALUES (?,?,?)')->execute([$request,$hash,$draw]);
            $state=['competition_id'=>$id,'draw_id'=>$draw,'roster_revision_id'=>$roster['id'],'eligibility_fingerprint'=>$roster['fingerprint'],'version'=>$operation==='publish'?(int)$expected:(int)$expected+1,'reason'=>$redraw?$reason:null,'algorithm_version'=>DrawEngine::ALGORITHM];
            if($ceremony){
                $state['status']='PENDING_CONFIRMATION';
                $state['actor_role']=$actor['role'];
                $state['actor_name']=$actor['name'] ?? null;
            }
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],'DRAW_'.strtoupper($operation),$request,json_encode($state,JSON_THROW_ON_ERROR)]);
            $this->db->commit();return ['id'=>$draw];
        } catch(\Throwable $error){if($this->db->inTransaction())$this->db->rollBack();throw $error;}
    }
    public function published(bool $demo): array
    {
        $s=$this->db->prepare("SELECT d.*,p.published_at AS draw_published_at,COALESCE(p.published_at,schedule_publication.published_at) AS published_at,(p.draw_id IS NOT NULL) AS draw_is_published,e.name AS event_name,c.stage,c.province,c.district,ed.code AS division_code FROM p2_competition c JOIN p2_event e ON e.id=c.event_id JOIN p2_event_division ed ON ed.id=c.division_id JOIN p2_draw_version d ON d.id=c.draw_version_id LEFT JOIN p2_draw_publication p ON p.draw_id=d.id LEFT JOIN LATERAL (SELECT min(mc.created_at) AS published_at FROM p2_match_change mc JOIN p2_match m ON m.id=mc.match_id WHERE m.draw_id=d.id AND mc.operation IN ('schedule_publish','schedule_republish')) schedule_publication ON true WHERE c.stage IN (1,2) AND e.is_test=CAST(? AS boolean) AND e.status<>'ARCHIVED' AND c.status<>'ARCHIVED' AND (p.draw_id IS NOT NULL OR schedule_publication.published_at IS NOT NULL) ORDER BY COALESCE(p.published_at,schedule_publication.published_at) DESC LIMIT 100");$s->execute([$demo?'true':'false']);return array_map(self::decode(...),$s->fetchAll());
    }
    private static function decode(array $row): array { foreach(['slots','fixtures','automatic_qualifiers'] as $key)$row[$key]=json_decode($row[$key],true,512,JSON_THROW_ON_ERROR);return $row; }
}
