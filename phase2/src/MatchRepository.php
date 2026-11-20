<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class MatchRepository
{
    public function __construct(private \PDO $db) {}
    public function ready(): bool{return $this->db->query("SELECT to_regclass('p2_match_change') IS NOT NULL")->fetchColumn()===true;}
    public function venues(?string $province=null): array{return $this->all('SELECT id,name,province,district FROM p2_venue'.($province!==null?' WHERE province=?':'').' ORDER BY province,district,name',$province!==null?[$province]:[]);}
    public function createVenue(array $input,array $actor): string
    {
        if(($actor['role'] ?? '')!=='SUPER_ADMIN')throw new \UnexpectedValueException('เฉพาะผู้ดูแลระบบสูงสุด');
        $name=is_string($input['name'] ?? null)?trim($input['name']):'';$province=$input['province'] ?? null;$district=$input['district'] ?? null;$request=$input['request_id'] ?? null;
        if(!preg_match('/^[^\x00-\x1f]{1,150}$/uD',$name)||!is_string($province)||!is_string($district)||!in_array($district,AreaDirectory::districts()[$province] ?? [],true)||!EventRepository::validUuid($request))throw new \InvalidArgumentException('กรุณาตรวจชื่อสนาม จังหวัด และอำเภอ');
        $hash=hash('sha256',json_encode([$name,$province,$district,$actor['id']],JSON_THROW_ON_ERROR));$this->db->beginTransaction();
        try{
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-venue:'.$request]);
            $old=$this->one('SELECT id,request_hash FROM p2_venue WHERE request_id=?',[$request]);
            if($old){if(!hash_equals($old['request_hash'],$hash))throw new \DomainException('คำขอถูกใช้แล้ว');$this->db->commit();return $old['id'];}
            if($this->one('SELECT id FROM p2_venue WHERE province=? AND district=? AND lower(btrim(name))=lower(?)',[$province,$district,$name]))throw new \DomainException('มีชื่อสนามนี้ในอำเภอแล้ว');
            $id=EventRepository::uuid();$this->db->prepare('INSERT INTO p2_venue(id,name,province,district,created_by,request_id,request_hash) VALUES (?,?,?,?,?,?,?)')->execute([$id,$name,$province,$district,$actor['id'],$request,$hash]);
            $this->db->prepare("INSERT INTO p2_platform_audit(actor_id,action,request_id,new_state) VALUES (?,'VENUE_CREATED',?,CAST(? AS jsonb))")->execute([$actor['id'],$request,json_encode(['venue_id'=>$id,'name'=>$name,'province'=>$province,'district'=>$district],JSON_THROW_ON_ERROR)]);
            $this->db->commit();return $id;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();if($e instanceof \PDOException && $e->getCode()==='23505')throw new \DomainException('สนามนี้ถูกเพิ่มแล้ว กรุณาโหลดใหม่',0,$e);throw $e;}
    }
    public function get(string $id): ?array
    {
        if(!EventRepository::validUuid($id))return null;
        return $this->one('SELECT m.*,v.name AS venue_name FROM p2_match m LEFT JOIN p2_venue v ON v.id=m.venue_id WHERE m.id=?',[$id]);
    }
    public function list(string $competition,bool $public=false): array
    {
        $rows=$this->all("SELECT m.*,v.name AS venue_name,p.draw_id AS legacy_public_draw_id,
                schedule_publication.snapshot AS publication_snapshot
            FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id AND c.draw_version_id=m.draw_id
            LEFT JOIN p2_venue v ON v.id=m.venue_id
            LEFT JOIN p2_draw_publication p ON p.draw_id=m.draw_id
            LEFT JOIN LATERAL (SELECT snapshot FROM p2_match_change WHERE match_id=m.id
                AND operation IN ('schedule_publish','schedule_republish') ORDER BY version DESC LIMIT 1) schedule_publication ON true
            WHERE c.id=?".($public?' AND (p.draw_id IS NOT NULL OR schedule_publication.snapshot IS NOT NULL)':'').' ORDER BY m.number',[$competition]);
        foreach($rows as &$row){
            if($public&&$row['publication_snapshot']!==null)$row=array_replace($row,json_decode($row['publication_snapshot'],true,512,JSON_THROW_ON_ERROR));
            unset($row['publication_snapshot'],$row['legacy_public_draw_id']);
        }
        unset($row);return $rows;
    }
    public function history(string $id): array{return $this->all('SELECT version,operation,reason,actor_id,created_at,snapshot FROM p2_match_change WHERE match_id=? ORDER BY version DESC',[$id]);}
    public function schedulePublication(array $match):?array
    {
        $row=$this->one("SELECT version,operation,reason,actor_id,created_at,snapshot FROM p2_match_change WHERE match_id=? AND operation IN ('schedule_publish','schedule_republish') ORDER BY version DESC LIMIT 1",[$match['id']]);
        if($row){$row['snapshot']=json_decode($row['snapshot'],true,512,JSON_THROW_ON_ERROR);return $row;}
        $legacy=$this->one('SELECT draw_id FROM p2_draw_publication WHERE draw_id=?',[$match['draw_id']]);
        return $legacy?['version'=>null,'operation'=>'legacy_draw_publication','reason'=>'','actor_id'=>'','created_at'=>null,'snapshot'=>$match]:null;
    }
    public function publicMatch(string $id):?array
    {
        $match=$this->one('SELECT m.*,v.name AS venue_name FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id AND c.draw_version_id=m.draw_id LEFT JOIN p2_venue v ON v.id=m.venue_id WHERE m.id=?',[$id]);
        if(!$match)return null;$publication=$this->schedulePublication($match);
        return $publication&&$publication['snapshot']?array_replace($match,$publication['snapshot']):null;
    }
    public function officialResult(string $id):?array
    {
        if(!class_exists(ResultRepository::class))return null;$repo=new ResultRepository($this->db);return $repo->ready()?$repo->result($id):null;
    }
    public function execute(string $id,array $actor,array $input): array
    {
        $operation=$input['operation'] ?? null;$request=$input['request_id'] ?? null;$version=$input['version'] ?? null;$reason=is_string($input['reason'] ?? null)?trim($input['reason']):'';
        if(!in_array($operation,['schedule','postpone','cancel','start'],true)||!EventRepository::validUuid($request)||!preg_match('/^[0-9]{1,8}$/D',is_scalar($version)?(string)$version:''))throw new \InvalidArgumentException('กรุณาตรวจคำขอและเวอร์ชัน');
        if($operation!=='schedule'&&!preg_match('/^.{1,300}$/usD',$reason))throw new \InvalidArgumentException('กรุณาระบุเหตุผล');
        if($operation==='schedule'&&$reason!==''&&!preg_match('/^.{1,300}$/usD',$reason))throw new \InvalidArgumentException('เหตุผลยาวเกินกำหนด');
        $data=$operation==='schedule'?MatchRules::schedule($input):[];
        $this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-match-request:'.$request]);
            $match=$this->get($id);if(!$match)throw new \OutOfBoundsException('ไม่พบคู่แข่งขัน');
            if($operation==='schedule'&&$reason===''){
                if($match['scheduled_start']!==null)throw new \InvalidArgumentException('กรุณาระบุเหตุผลในการแก้ไขตารางแข่งขัน');
                $reason='กำหนดตารางแข่งขันครั้งแรก';
            }
            $hash=hash('sha256',json_encode([$id,$actor['id'],$actor['role'],$operation,(int)$version,$reason,$data],JSON_THROW_ON_ERROR));
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$match['competition_id']]);
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$match['competition_id']]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($match['competition_id'],$actor,'schedule');
            $match=$this->get($id);
            $old=$this->one('SELECT request_hash FROM p2_match_change WHERE request_id=?',[$request]);
            if($old){if(!hash_equals($old['request_hash'],$hash))throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');$this->db->commit();return $match;}
            if($match['draw_id']!==$scope['draw_version_id'])throw new \DomainException('ผลจับสลากนี้ไม่ใช่ฉบับปัจจุบัน');
            if($match['version']!==(int)$version)throw new \DomainException('แมตช์ถูกเปลี่ยนแล้ว กรุณาโหลดใหม่');
            if($match['started_at']!==null || in_array($match['state'],['IN_PROGRESS','COMPLETED'],true))throw new \DomainException('แมตช์เริ่มแล้ว ไม่สามารถแก้ตาราง ยกเลิก หรือเริ่มซ้ำได้');
            if($match['state']==='CANCELLED')throw new \DomainException('แมตช์ถูกยกเลิกแล้ว');
            $drawStatus=(new DrawRepository($this->db))->ceremonyStatus($scope['event_id'],$match['draw_id']);
            if($drawStatus!==null && $drawStatus!=='CONFIRMED_LOCKED')throw new \DomainException('ต้องยืนยันและล็อกผลจับสลากก่อนจัดตาราง');
            if($drawStatus===null && !$this->one('SELECT draw_id FROM p2_draw_publication WHERE draw_id=?',[$match['draw_id']]))throw new \DomainException('ต้องเผยแพร่คู่แข่งขันก่อนจัดตาราง');
            // Shared across all Competitions in a data mode, preventing cross-event venue/team races.
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-scheduling:'.($scope['is_test']?'demo':'real')]);
            if($operation==='schedule'){
                $resolved=$this->resolved($match);if($resolved['a']===null||$resolved['b']===null)throw new \DomainException('รอทีมผ่านเข้ารอบก่อนจึงจะจัดตารางคู่นี้ได้');
                $venue=$this->one('SELECT * FROM p2_venue WHERE id=? FOR SHARE',[$data['venue_id']]);
                if(!$venue || ($scope['province']!==null && $venue['province']!==$scope['province']))throw new \InvalidArgumentException('สนามต้องตรงจังหวัดการแข่งขัน');
                $event=$this->one('SELECT start_date,end_date FROM p2_event WHERE id=?',[$scope['event_id']]);
                if(substr($data['start'],0,10)<$event['start_date']||substr($data['end'],0,10)>$event['end_date'])throw new \InvalidArgumentException('เวลาต้องอยู่ในช่วงวันที่จัดรายการ');
                $this->assertNoOverlap($match,$scope,$data);
                $this->db->prepare("UPDATE p2_match SET state='SCHEDULED',venue_id=?,scheduled_start=?,scheduled_end=?,version=version+1 WHERE id=?")->execute([$data['venue_id'],$data['start'],$data['end'],$id]);
            }elseif($operation==='start'){
                if($match['state']!=='SCHEDULED')throw new \DomainException('ต้องจัดวันเวลาและสนามก่อนเริ่ม');
                $sides=$this->resolved($match);
                if($sides['a']===null||$sides['b']===null)throw new \DomainException('รอยืนยันผู้ชนะจากรอบก่อนหน้า');
                if(class_exists(RuleRepository::class) && (new RuleRepository($this->db))->ready()){
                    $rules=(new RuleRepository($this->db))->current($scope['event_id']);
                    if(!$rules)throw new \DomainException('รอ Super Admin ระบุกติกาของรายการก่อนเริ่ม');
                    if($rules['config']['knockout_tie']==='PENDING')throw new \DomainException('ต้องยืนยันวิธีตัดสินผลเสมอก่อนเริ่มการแข่งขัน');
                    (new ResultRepository($this->db))->requireLineups($match,$rules);
                }
                $this->db->prepare("UPDATE p2_match SET state='IN_PROGRESS',started_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?")->execute([$id]);
            }else{
                if($operation==='postpone' && $match['state']!=='SCHEDULED')throw new \DomainException('เลื่อนได้เฉพาะแมตช์ที่จัดตารางแล้ว');
                $this->db->prepare('UPDATE p2_match SET state=?,version=version+1 WHERE id=?')->execute([$operation==='postpone'?'POSTPONED':'CANCELLED',$id]);
            }
            $result=$this->get($id);
            $this->db->prepare('INSERT INTO p2_match_change(id,match_id,version,operation,reason,actor_id,snapshot,request_id,request_hash) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?)')->execute([EventRepository::uuid(),$id,$result['version'],$operation,$reason,$actor['id'],json_encode($result,JSON_THROW_ON_ERROR),$request,$hash]);
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],'MATCH_'.strtoupper($operation),$request,json_encode(['match_id'=>$id,'version'=>$result['version'],'state'=>$result['state'],'reason'=>$reason],JSON_THROW_ON_ERROR)]);
            $this->db->commit();return $result;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    /** Publish a selected set atomically; each match retains its own immutable public snapshot. */
    public function publishBatch(string $competition,array $actor,array $input,bool $republish):array
    {
        $ids=$input['match_ids'] ?? null;$versions=$input['versions'] ?? null;$requests=$input['request_ids'] ?? null;
        if(!is_array($ids)||!$ids||count($ids)>128||count($ids)!==count(array_unique($ids))||!is_array($versions)||!is_array($requests))throw new \InvalidArgumentException('กรุณาเลือกคู่แข่งขันที่ต้องการเผยแพร่');
        foreach($ids as $id)if(!EventRepository::validUuid($id)||!preg_match('/^[0-9]{1,8}$/D',is_scalar($versions[$id] ?? null)?(string)$versions[$id]:'')||!EventRepository::validUuid($requests[$id] ?? null))throw new \InvalidArgumentException('ข้อมูลคู่แข่งขันหรือคำขอไม่ถูกต้อง');
        sort($ids,SORT_STRING);$operation=$republish?'schedule_republish':'schedule_publish';$hashes=[];
        foreach($ids as $id)$hashes[$id]=hash('sha256',json_encode([$competition,$id,$actor['id'],$actor['role'],$operation,(int)$versions[$id]],JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='5000ms'");
            $requestIds=array_map(fn($id)=>$requests[$id],$ids);sort($requestIds,SORT_STRING);
            foreach($requestIds as $request)$this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-match-request:'.$request]);
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$competition]);
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$competition]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($competition,$actor,'schedule');
            $in=implode(',',array_fill(0,count($ids),'?'));
            $locked=$this->all("SELECT id FROM p2_match WHERE competition_id=? AND id IN ($in) ORDER BY id FOR UPDATE",array_merge([$competition],$ids));
            if(count($locked)!==count($ids))throw new \OutOfBoundsException('ไม่พบคู่แข่งขันที่เลือกในขอบเขตนี้');
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-scheduling:'.($scope['is_test']?'demo':'real')]);
            $draw=new DrawRepository($this->db);$status=$draw->ceremonyStatus($scope['event_id'],$scope['draw_version_id'] ?? '');
            if($status!==null&&$status!=='CONFIRMED_LOCKED')throw new \DomainException('ต้องยืนยันและล็อกผลจับสลากก่อนเผยแพร่ตาราง');
            if($status===null&&!$this->one('SELECT draw_id FROM p2_draw_publication WHERE draw_id=?',[$scope['draw_version_id'] ?? '']))throw new \DomainException('ต้องยืนยันผลจับสลากก่อนเผยแพร่ตาราง');
            $changed=[];
            foreach($ids as $id){
                $old=$this->one('SELECT request_hash FROM p2_match_change WHERE request_id=?',[$requests[$id]]);
                if($old){if(!hash_equals($old['request_hash'],$hashes[$id]))throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');$changed[]=$id;continue;}
                $match=$this->get($id);if(!$match||$match['competition_id']!==$competition||$match['draw_id']!==$scope['draw_version_id'])throw new \DomainException('คู่แข่งขันไม่ใช่ชุดปัจจุบัน');
                if($match['version']!==(int)$versions[$id])throw new \DomainException('ตารางบางคู่ถูกแก้แล้ว กรุณาโหลดข้อมูลใหม่');
                if($match['started_at']!==null||in_array($match['state'],['IN_PROGRESS','COMPLETED','CANCELLED'],true))throw new \DomainException('เผยแพร่ได้เฉพาะคู่ที่ยังไม่เริ่มหรือยกเลิก');
                if(!$match['scheduled_start']||!$match['scheduled_end']||!$match['venue_id'])throw new \DomainException('คู่ที่เลือกต้องมีวัน เวลา และสนามครบก่อนเผยแพร่');
                $sides=$this->resolved($match);if($sides['a']===null||$sides['b']===null)throw new \DomainException('คู่ที่เลือกยังรอทีมผ่านเข้ารอบ');
                $publication=$this->schedulePublication($match);
                if($republish){
                    if(!$publication||!$publication['snapshot']||$this->sameSchedule($match,$publication['snapshot']))throw new \DomainException('เผยแพร่กำหนดใหม่ได้เมื่อมีการแก้จากฉบับที่เผยแพร่แล้วเท่านั้น');
                }elseif($publication)throw new \DomainException('คู่ที่เลือกเผยแพร่แล้วหรือมีฉบับเผยแพร่อยู่');
                $this->db->prepare('UPDATE p2_match SET version=version+1 WHERE id=?')->execute([$id]);$saved=$this->get($id);
                $reason=$republish?'เผยแพร่กำหนดการแข่งขันที่แก้ไขแล้ว':'เผยแพร่กำหนดการแข่งขันครั้งแรก';
                $this->db->prepare('INSERT INTO p2_match_change(id,match_id,version,operation,reason,actor_id,snapshot,request_id,request_hash) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?)')
                    ->execute([EventRepository::uuid(),$id,$saved['version'],$operation,$reason,$actor['id'],json_encode($saved,JSON_THROW_ON_ERROR),$requests[$id],$hashes[$id]]);
                $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')
                    ->execute([$scope['event_id'],$actor['id'],$operation==='schedule_publish'?'MATCH_SCHEDULE_PUBLISHED':'MATCH_SCHEDULE_REPUBLISHED',$requests[$id],json_encode(['competition_id'=>$competition,'match_id'=>$id,'version'=>$saved['version'],'reason'=>$reason],JSON_THROW_ON_ERROR)]);
                $changed[]=$id;
            }
            $this->db->commit();return $changed;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    public function resolved(array $match): array
    {
        if(class_exists(ResultRepository::class) && (new ResultRepository($this->db))->ready())return (new ResultRepository($this->db))->resolved($match);
        $a=json_decode($match['side_a'],true,512,JSON_THROW_ON_ERROR);$b=json_decode($match['side_b'],true,512,JSON_THROW_ON_ERROR);
        // Confirmed results are wired in the next migration; unresolved feeders cannot start.
        return ['a'=>$a['type']==='team'?$a['source_team_id']:null,'b'=>$b['type']==='team'?$b['source_team_id']:null];
    }
    private function assertNoOverlap(array $match,array $scope,array $data): void
    {
        $others=$this->all("SELECT m.* FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id AND c.draw_version_id=m.draw_id JOIN p2_event e ON e.id=c.event_id WHERE m.id<>? AND e.is_test=CAST(? AS boolean) AND m.state IN ('SCHEDULED','IN_PROGRESS','COMPLETED') AND m.scheduled_start<CAST(? AS timestamptz) AND CAST(? AS timestamptz)<m.scheduled_end",[$match['id'],$scope['is_test']?'true':'false',$data['end'],$data['start']]);
        $teams=$this->possible($match);
        foreach($others as $other)if($other['venue_id']===$data['venue_id']||array_intersect($teams,$this->possible($other)))throw new \DomainException('สนามหรือทีมที่อาจเข้ารอบมีเวลาแข่งขันซ้อนกัน');
    }
    private function possible(array $match): array
    {
        $rows=$this->all('SELECT number,side_a,side_b FROM p2_match WHERE draw_id=?',[$match['draw_id']]);$fixtures=[];
        foreach($rows as $row)$fixtures[$row['number']]=['side_a'=>json_decode($row['side_a'],true),'side_b'=>json_decode($row['side_b'],true)];
        return MatchRules::possible($fixtures[$match['number']],$fixtures);
    }
    private function sameSchedule(array $current,array $snapshot):bool
    {
        return ($current['venue_id'] ?? null)===($snapshot['venue_id'] ?? null)
            &&self::instant($current['scheduled_start'] ?? null)===self::instant($snapshot['scheduled_start'] ?? null)
            &&self::instant($current['scheduled_end'] ?? null)===self::instant($snapshot['scheduled_end'] ?? null);
    }
    private static function instant(?string $value):?int{return $value?strtotime($value):null;}
    private function all(string $sql,array $values):array{$s=$this->db->prepare($sql);$s->execute($values);return $s->fetchAll();}
    private function one(string $sql,array $values):?array{return $this->all($sql,$values)[0] ?? null;}
}
