<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class AdvancementRepository
{
    public function __construct(private \PDO $db){}
    public function ready():bool{return $this->db->query("SELECT to_regclass('p2_advancement_source') IS NOT NULL")->fetchColumn()===true;}
    public function sources(array $scope):array
    {
        if((int)$scope['stage']!==2)throw new \DomainException('รองรับนำทีมผ่านเข้ารอบจังหวัด Stage 2 ในขั้นนี้');
        $s=$this->db->prepare("SELECT id,district FROM p2_competition WHERE event_id=? AND division_id=? AND province=? AND stage=1 AND status<>'ARCHIVED' ORDER BY id");$s->execute([$scope['event_id'],$scope['division_id'],$scope['province']]);return $s->fetchAll();
    }
    public function preview(array $scope):array
    {
        $sources=$this->sources($scope);$results=new ResultRepository($this->db);$draws=new DrawRepository($this->db);$teams=[];$origins=[];$pending=[];
        foreach($sources as $source){
            $qualified=$results->qualifiers($source['id']);$draw=$draws->current($source['id']);
            if(!$qualified||!$draw){$pending[]=$source['district'];continue;}
            $s=$this->db->prepare('SELECT teams FROM p2_roster_revision WHERE id=?');$s->execute([$draw['roster_revision_id']]);$roster=array_column(json_decode($s->fetchColumn(),true,512,JSON_THROW_ON_ERROR),null,'source_team_id');
            foreach($qualified as $q){$id=$q['source_team_id'];if(isset($teams[$id]))throw new \DomainException('ทีมเดียวผ่านจากหลายอำเภอ กรุณาตรวจสอบข้อมูลต้นทาง');if(!isset($roster[$id]))throw new \DomainException('ไม่พบทีมผ่านเข้ารอบในรายชื่อที่ล็อก');$teams[$id]=$roster[$id]+['origin_rank'=>(int)$q['rank'],'origin_district'=>$source['district']];$origins[]=['source_competition_id'=>$source['id'],'source_draw_id'=>$draw['id'],'qualification_revision_id'=>$q['origin_kind']==='QUALIFICATION'?$q['origin_id']:null,'source_team_id'=>$id,'rank'=>$q['rank']];}
        }
        ksort($teams);usort($origins,fn($a,$b)=>strcmp($a['source_competition_id'].$a['source_team_id'],$b['source_competition_id'].$b['source_team_id']));
        return ['teams'=>array_values($teams),'origins'=>$origins,'pending'=>$pending,'source_ids'=>array_column($sources,'id')];
    }
    public function lineage(string $revision):array
    {
        $s=$this->db->prepare('SELECT a.*,c.district,d.version AS draw_version FROM p2_advancement_source a JOIN p2_competition c ON c.id=a.source_competition_id JOIN p2_draw_version d ON d.id=a.source_draw_id WHERE a.roster_revision_id=? ORDER BY c.district,a.rank');$s->execute([$revision]);return $s->fetchAll();
    }
    public function execute(string $id,array $actor,array $input):array
    {
        $op=$input['operation'] ?? null;$request=$input['request_id'] ?? null;$version=$input['version'] ?? null;
        if(!in_array($op,['import','lock'],true)||!EventRepository::validUuid($request)||!preg_match('/^[0-9]{1,8}$/D',is_scalar($version)?(string)$version:''))throw new \InvalidArgumentException('กรุณาตรวจคำขอและเวอร์ชัน');
        $hash=hash('sha256',json_encode([$id,$actor['id'],$actor['role'],$op,(int)$version],JSON_THROW_ON_ERROR));$this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");$this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-advance:'.$request]);
            $comps=new CompetitionRepository($this->db);$scope=$comps->get($id);if(!$scope)throw new \OutOfBoundsException('ไม่พบการแข่งขัน');
            $sourceIds=array_column($this->sources($scope),'id');$lockIds=[...$sourceIds,$id];sort($lockIds);
            foreach($lockIds as $lock)$this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$lock]);
            $this->db->prepare('SELECT id FROM p2_event WHERE id=? FOR SHARE')->execute([$scope['event_id']]);
            $scope=$comps->requireAccess($id,$actor,'import');
            if(array_column($this->sources($scope),'id')!==$sourceIds)throw new \DomainException('ขอบเขตอำเภอเปลี่ยนแล้ว กรุณาโหลดใหม่');
            $s=$this->db->prepare('SELECT * FROM p2_advancement_request WHERE request_id=?');$s->execute([$request]);$old=$s->fetch();if($old){if(!hash_equals($old['request_hash'],$hash))throw new \DomainException('คำขอถูกใช้กับข้อมูลอื่นแล้ว');$this->db->commit();return ['id'=>$old['roster_revision_id']];}
            $previous=(new RosterRepository($this->db))->current($id);if(($previous['version'] ?? 0)!==(int)$version)throw new \DomainException('รายชื่อรอบจังหวัดเปลี่ยนแล้ว');
            if($previous && $previous['locked'])throw new \DomainException('รายชื่อรอบจังหวัดล็อกแล้ว');
            $preview=$this->preview($scope);
            if(!$sourceIds||$preview['pending'])throw new \DomainException('ยังมีอำเภอที่ไม่ยืนยันผลผ่านเข้ารอบครบ');
            if(count($preview['teams'])<1||count($preview['teams'])>128)throw new \DomainException('จำนวนทีมผ่านเข้ารอบไม่อยู่ในขอบเขตที่รองรับ');
            $fingerprint=hash('sha256',json_encode([$preview['teams'],$preview['origins']],JSON_THROW_ON_ERROR));
            if($op==='lock' && (!$previous||!hash_equals($previous['fingerprint'],$fingerprint)))throw new \DomainException('ผลต้นทางเปลี่ยนแล้ว กรุณานำเข้าฉบับใหม่ก่อนล็อก');
            $revision=EventRepository::uuid();$this->db->prepare('INSERT INTO p2_roster_revision(id,competition_id,version,teams,fingerprint,locked,request_id,request_hash,actor_id) VALUES (?,?,?,CAST(? AS jsonb),?,CAST(? AS boolean),?,?,?)')->execute([$revision,$id,(int)$version+1,json_encode($preview['teams'],JSON_THROW_ON_ERROR),$fingerprint,$op==='lock'?'true':'false',$request,$hash,$actor['id']]);
            foreach($preview['origins'] as $origin)$this->db->prepare('INSERT INTO p2_advancement_source(roster_revision_id,target_competition_id,source_competition_id,event_id,division_id,source_draw_id,qualification_revision_id,source_team_id,rank) VALUES (?,?,?,?,?,?,?,?,?)')->execute([$revision,$id,$origin['source_competition_id'],$scope['event_id'],$scope['division_id'],$origin['source_draw_id'],$origin['qualification_revision_id'],$origin['source_team_id'],$origin['rank']]);
            $this->db->prepare('UPDATE p2_competition SET roster_revision_id=? WHERE id=?')->execute([$revision,$id]);$this->db->prepare('INSERT INTO p2_advancement_request(request_id,request_hash,roster_revision_id) VALUES (?,?,?)')->execute([$request,$hash,$revision]);
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],$op==='lock'?'ADVANCEMENT_LOCKED':'ADVANCEMENT_IMPORTED',$request,json_encode(['competition_id'=>$id,'roster_revision_id'=>$revision,'source_count'=>count($sourceIds),'team_count'=>count($preview['teams']),'fingerprint'=>$fingerprint],JSON_THROW_ON_ERROR)]);
            $this->db->commit();return ['id'=>$revision];
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
}
