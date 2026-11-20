<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class ResultRepository
{
    public function __construct(private \PDO $db){}
    public function ready():bool{return $this->db->query("SELECT to_regclass('p2_result_revision') IS NOT NULL")->fetchColumn()===true;}
    public function result(string $match,bool $draft=false):?array
    {
        $sql=$draft?'SELECT * FROM p2_result_revision WHERE match_id=? ORDER BY version DESC LIMIT 1':'SELECT r.* FROM p2_match m JOIN p2_result_revision r ON r.id=m.confirmed_result_id AND r.match_id=m.id WHERE m.id=?';
        $s=$this->db->prepare($sql);$s->execute([$match]);$r=$s->fetch();if(!$r)return null;$r['result']=json_decode($r['result'],true,512,JSON_THROW_ON_ERROR);return $r;
    }
    public function lineup(string $match,string $team):?array
    {
        $s=$this->db->prepare('SELECT * FROM p2_lineup_revision WHERE match_id=? AND team_id=? ORDER BY version DESC LIMIT 1');$s->execute([$match,$team]);$r=$s->fetch();if(!$r)return null;$r['players']=json_decode($r['players'],true,512,JSON_THROW_ON_ERROR);return $r;
    }
    public function history(string $match):array
    {
        $s=$this->db->prepare('SELECT * FROM p2_result_revision WHERE match_id=? ORDER BY version DESC');$s->execute([$match]);$rows=$s->fetchAll();foreach($rows as &$r)$r['result']=json_decode($r['result'],true,512,JSON_THROW_ON_ERROR);unset($r);return $rows;
    }
    public function lineupHistory(string $match,string $team):array
    {
        $s=$this->db->prepare('SELECT version,state,players,actor_id,reason,created_at FROM p2_lineup_revision WHERE match_id=? AND team_id=? ORDER BY version DESC');$s->execute([$match,$team]);$rows=$s->fetchAll();foreach($rows as &$r)$r['players']=json_decode($r['players'],true,512,JSON_THROW_ON_ERROR);unset($r);return $rows;
    }
    public function qualifiers(string $competition):array
    {
        $draws=new DrawRepository($this->db);$draw=$draws->current($competition);if(!$draw)return [];
        $public=$draws->publicCurrent($competition);$active=in_array($draws->ceremonyStatus($draw['event_id'] ?? (new CompetitionRepository($this->db))->get($competition)['event_id'],$draw['id']),['ACTIVE','CONFIRMED_LOCKED'],true);
        if(!$draw['published_at']&&(!$public||$public['id']!==$draw['id'])&&!($draw['automatic_qualifiers']&&$active))return [];
        if($draw['automatic_qualifiers'])return [['rank'=>1,'source_team_id'=>$draw['automatic_qualifiers'][0]['source_team_id'],'origin_kind'=>'DRAW','origin_id'=>$draw['id']]];
        $s=$this->db->prepare('SELECT c.stage,q.id,q.teams FROM p2_competition c JOIN p2_qualification_revision q ON q.id=c.qualification_revision_id AND q.competition_id=c.id AND q.draw_id=c.draw_version_id WHERE c.id=?');$s->execute([$competition]);$q=$s->fetch();if(!$q)return [];
        $teams=json_decode($q['teams'],true,512,JSON_THROW_ON_ERROR);if((int)$q['stage']===2)$teams=array_values(array_filter($teams,fn($t)=>$t['rank']===1));
        return array_map(fn($t)=>$t+['origin_kind'=>'QUALIFICATION','origin_id'=>$q['id']],$teams);
    }
    public function resolved(array $match):array
    {
        $resolve=function(array $side)use($match):?string{
            if($side['type']==='team')return $side['source_team_id'];
            $s=$this->db->prepare("SELECT r.result->>'winner' FROM p2_match m JOIN p2_result_revision r ON r.id=m.confirmed_result_id AND r.match_id=m.id AND r.state='CONFIRMED' WHERE m.draw_id=? AND m.number=?");$s->execute([$match['draw_id'],$side['match']]);return $s->fetchColumn()?:null;
        };
        return ['a'=>$resolve(json_decode($match['side_a'],true,512,JSON_THROW_ON_ERROR)),'b'=>$resolve(json_decode($match['side_b'],true,512,JSON_THROW_ON_ERROR))];
    }
    public function requireLineups(array $match,array $rules):void
    {
        $stage=(new CompetitionRepository($this->db))->get($match['competition_id'])['stage'] ?? null;
        if(in_array((int)$stage,[1,2],true))return; // Post-match, optional per team in Stage 1–2.
        if(!$rules['config']['lineup_required'])return;
        foreach($this->resolved($match) as $team){if(!$team)throw new \DomainException('คู่แข่งขันยังไม่ครบ');$l=$this->lineup($match['id'],$team);if(!$l || $l['state']!=='CONFIRMED'||$l['rule_version_id']!==$rules['id'])throw new \DomainException('ต้องยืนยันรายชื่อผู้เล่นของทั้งสองทีมก่อนเริ่ม');}
    }
    public function execute(string $id,array $actor,array $input):array
    {
        $op=$input['operation'] ?? null;$request=$input['request_id'] ?? null;$version=$input['version'] ?? null;$reason=is_string($input['reason'] ?? null)?trim($input['reason']):'';
        if(!in_array($op,['lineup_draft','result_draft','result_confirm','final_confirm','reopen'],true)||!EventRepository::validUuid($request)||!preg_match('/^[0-9]{1,8}$/D',is_scalar($version)?(string)$version:'')||!preg_match('/^.{1,300}$/usD',$reason))throw new \InvalidArgumentException('กรุณาตรวจคำขอ เวอร์ชัน และเหตุผล');
        $payload=array_intersect_key($input,array_flip(['team_id','starters','bench','draft_id','type','goals_a','goals_b','extra_a','extra_b','penalties_a','penalties_b']));
        $hash=hash('sha256',json_encode([$id,$actor['id'],$actor['role'],$op,(int)$version,$reason,$payload],JSON_THROW_ON_ERROR));$this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");$this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-match-request:'.$request]);
            $matches=new MatchRepository($this->db);$match=$matches->get($id);if(!$match)throw new \OutOfBoundsException('ไม่พบแมตช์');
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$match['competition_id']]);
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$match['competition_id']]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($match['competition_id'],$actor,'result');$match=$matches->get($id);
            if(!in_array((int)$scope['stage'],[1,2],true))throw new \DomainException('รอระบบผลการแข่งขันของ Stage นี้');
            $s=$this->db->prepare('SELECT request_hash FROM p2_match_change WHERE request_id=?');$s->execute([$request]);$old=$s->fetch();if($old){if(!hash_equals($old['request_hash'],$hash))throw new \DomainException('คำขอถูกใช้กับข้อมูลอื่นแล้ว');$this->db->commit();return $match;}
            if($match['version']!==(int)$version||$match['draw_id']!==$scope['draw_version_id'])throw new \DomainException('แมตช์หรือผลจับสลากเปลี่ยนแล้ว กรุณาโหลดใหม่');
            $draw=(new DrawRepository($this->db))->current($scope['id']);if(!$draw['published_at']&&!$matches->schedulePublication($match))throw new \DomainException('ต้องเผยแพร่คู่แข่งขันก่อน');
            $rules=(new RuleRepository($this->db))->current($scope['event_id']);if(!$rules)throw new \DomainException('รอ Super Admin ระบุกติกาและผู้ยืนยันผลของรายการ');
            $confirm=str_ends_with($op,'confirm');
            if($confirm && $rules['config']['confirmation']==='SUPER_ADMIN' && $actor['role']!=='SUPER_ADMIN')throw new \UnexpectedValueException('รายการนี้ให้ Super Admin ยืนยันเท่านั้น');
            $teams=$this->resolved($match);if(!$teams['a']||!$teams['b'])throw new \DomainException('รอผู้ชนะรอบก่อนหน้า');
            $next=(int)$version+1;$revision=EventRepository::uuid();$newResult=null;
            if($op==='reopen'){
                if($actor['role']!=='SUPER_ADMIN')throw new \UnexpectedValueException('เฉพาะผู้ดูแลระบบสูงสุดที่เปิดแก้ไขผลยืนยันแล้ว');
                if(!$match['confirmed_result_id'])throw new \DomainException('ยังไม่มีผลยืนยันให้เปิดแก้ไข');
                $this->assertNoStartedDescendant($match);
                $official=$this->result($id);$data=$official['result'];unset($data['lineup_revisions']);
                $this->db->prepare("INSERT INTO p2_result_revision(id,match_id,version,state,rule_version_id,result,actor_id,reason) VALUES (?,?,?,'DRAFT',?,CAST(? AS jsonb),?,?)")->execute([$revision,$id,$next,$rules['id'],json_encode($data,JSON_THROW_ON_ERROR),$actor['id'],$reason]);
                $this->db->prepare("UPDATE p2_match SET confirmed_result_id=NULL,state='IN_PROGRESS' WHERE id=?")->execute([$id]);
                $this->db->prepare('UPDATE p2_competition SET qualification_revision_id=NULL WHERE id=? AND qualification_revision_id IN (SELECT id FROM p2_qualification_revision WHERE result_id=?)')->execute([$scope['id'],$official['id']]);
            }elseif(str_starts_with($op,'lineup')){
                if($match['started_at']===null||$match['state']==='CANCELLED')throw new \DomainException('บันทึกรายชื่อหลังเริ่มการแข่งขันเท่านั้น');
                if($match['confirmed_result_id']!==null)throw new \DomainException('ยืนยันข้อมูลหลังการแข่งขันแล้ว ต้องเปิดแก้ไขก่อน');
                $team=$input['team_id'] ?? null;if(!is_string($team)||!in_array($team,$teams,true))throw new \InvalidArgumentException('ทีมต้องอยู่ในแมตช์นี้');
                $latest=$this->lineup($id,$team);
                if($confirm){if(!$latest||$latest['state']!=='DRAFT'||($input['draft_id'] ?? null)!==$latest['id']||$latest['rule_version_id']!==$rules['id'])throw new \DomainException('ร่างรายชื่อเปลี่ยนหรือกติกาเปลี่ยนแล้ว');$players=$latest['players'];}
                else $players=$this->validateLineup($draw,$team,$input,$rules['config']);
                $this->db->prepare('INSERT INTO p2_lineup_revision(id,match_id,team_id,version,state,roster_revision_id,rule_version_id,players,actor_id,reason) VALUES (?,?,?,?,?,?,?,CAST(? AS jsonb),?,?)')->execute([$revision,$id,$team,$next,$confirm?'CONFIRMED':'DRAFT',$draw['roster_revision_id'],$rules['id'],json_encode($players,JSON_THROW_ON_ERROR),$actor['id'],$reason]);
            }else{
                if($match['started_at']===null||!in_array($match['state'],['IN_PROGRESS','COMPLETED'],true))throw new \DomainException('ต้องเริ่มแมตช์ก่อนบันทึกผล');
                if($match['confirmed_result_id']!==null)throw new \DomainException('ยืนยันข้อมูลหลังการแข่งขันแล้ว ต้องเปิดแก้ไขพร้อมหมายเหตุก่อน');
                $this->assertNoStartedDescendant($match);
                if($confirm){$draft=$this->result($id,true);if(!$draft||$draft['state']!=='DRAFT'||($input['draft_id'] ?? null)!==$draft['id']||$draft['rule_version_id']!==$rules['id'])throw new \DomainException('ร่างผลเปลี่ยนแล้ว กรุณาตรวจใหม่');$newResult=$draft['result'];}
                else $newResult=ResultRules::validate($input,$rules['config'],$teams);
                if($confirm)$newResult['lineup_revisions']=$this->confirmLineups($draw,$teams,$match,$rules,$actor,$reason,$next);
                $this->db->prepare('INSERT INTO p2_result_revision(id,match_id,version,state,rule_version_id,result,actor_id,reason) VALUES (?,?,?,?,?,CAST(? AS jsonb),?,?)')->execute([$revision,$id,$next,$confirm?'CONFIRMED':'DRAFT',$rules['id'],json_encode($newResult,JSON_THROW_ON_ERROR),$actor['id'],$reason]);
                if($confirm){$this->db->prepare("UPDATE p2_match SET confirmed_result_id=?,state='COMPLETED' WHERE id=?")->execute([$revision,$id]);$last=max(array_column($draw['fixtures'],'number'));if($match['number']===$last){$qualification=EventRepository::uuid();$qualified=[['rank'=>1,'source_team_id'=>$newResult['winner']],['rank'=>2,'source_team_id'=>$newResult['loser']]];$this->db->prepare('INSERT INTO p2_qualification_revision(id,competition_id,draw_id,result_id,teams) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$qualification,$scope['id'],$draw['id'],$revision,json_encode($qualified,JSON_THROW_ON_ERROR)]);$this->db->prepare('UPDATE p2_competition SET qualification_revision_id=? WHERE id=?')->execute([$qualification,$scope['id']]);}}
            }
            $this->db->prepare('UPDATE p2_match SET version=version+1 WHERE id=?')->execute([$id]);$result=$matches->get($id);
            $snapshot=['revision_id'=>$revision,'match_id'=>$id,'state'=>$result['state'],'operation'=>$op];
            $this->db->prepare('INSERT INTO p2_match_change(id,match_id,version,operation,reason,actor_id,snapshot,request_id,request_hash) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?)')->execute([EventRepository::uuid(),$id,$next,$op,$reason,$actor['id'],json_encode($snapshot,JSON_THROW_ON_ERROR),$request,$hash]);
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],strtoupper($op),$request,json_encode($snapshot+['reason'=>$reason],JSON_THROW_ON_ERROR)]);
            $this->db->commit();return $result;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    private function validateLineup(array $draw,string $team,array $input,array $rules):array
    {
        $starters=$input['starters'] ?? [];$bench=$input['bench'] ?? [];
        if(!is_array($starters)||!is_array($bench)||count($starters)+count($bench)>198||array_filter([...$starters,...$bench],fn($s)=>!is_string($s)))throw new \InvalidArgumentException('รายชื่อไม่ถูกต้อง');
        $ids=[...$starters,...$bench];if(!$ids)return [];
        if(count($ids)!==count(array_unique($ids)))throw new \InvalidArgumentException('นักกีฬาต้องไม่ซ้ำ');
        if(count($starters)!==11||($rules['bench_max']!==null&&count($bench)>$rules['bench_max']))throw new \InvalidArgumentException('เมื่อกรอกรายชื่อต้องมีตัวจริง 11 คน และตัวสำรองไม่เกินกติกาของรายการ');
        $s=$this->db->prepare('SELECT teams FROM p2_roster_revision WHERE id=?');$s->execute([$draw['roster_revision_id']]);$rosters=json_decode($s->fetchColumn(),true,512,JSON_THROW_ON_ERROR);$registered=[];
        foreach($rosters as $t)if($t['source_team_id']===$team)$registered=array_column($t['players'],null,'id');
        $players=[];foreach($ids as $id){if(!isset($registered[$id]))throw new \InvalidArgumentException('นักกีฬาไม่อยู่ในรายชื่อทีมที่ล็อก');$players[]=['id'=>$id,'name'=>$registered[$id]['name'],'jersey_no'=>$registered[$id]['jersey_no'] ?? null,'role'=>in_array($id,$starters,true)?'STARTER':'SUBSTITUTE'];}return $players;
    }
    private function confirmLineups(array $draw,array $teams,array $match,array $rules,array $actor,string $reason,int $version):array
    {
        $revisions=[];
        foreach($teams as $side=>$team){
            $latest=$this->lineup($match['id'],$team);
            if(!$latest||!$latest['players']){$revisions[$side]=null;continue;}
            if($latest['rule_version_id']!==$rules['id'])throw new \DomainException('กติกาของร่างรายชื่อเปลี่ยนแล้ว กรุณาตรวจรายชื่อใหม่');
            $input=['starters'=>[],'bench'=>[]];
            foreach($latest['players'] as $player)$input[$player['role']==='STARTER'?'starters':'bench'][]=$player['id'];
            $players=$this->validateLineup($draw,$team,$input,$rules['config']);
            $revision=EventRepository::uuid();
            $this->db->prepare("INSERT INTO p2_lineup_revision(id,match_id,team_id,version,state,roster_revision_id,rule_version_id,players,actor_id,reason) VALUES (?,?,?,?,'CONFIRMED',?,?,CAST(? AS jsonb),?,?)")->execute([$revision,$match['id'],$team,$version,$draw['roster_revision_id'],$rules['id'],json_encode($players,JSON_THROW_ON_ERROR),$actor['id'],$reason]);
            $revisions[$side]=$revision;
        }
        return $revisions;
    }
    private function assertNoStartedDescendant(array $match):void
    {
        if(class_exists(AdvancementRepository::class) && (new AdvancementRepository($this->db))->ready()){
            $s=$this->db->prepare('SELECT EXISTS(SELECT 1 FROM p2_advancement_source a JOIN p2_competition c ON c.id=a.target_competition_id AND c.roster_revision_id=a.roster_revision_id JOIN p2_roster_revision r ON r.id=a.roster_revision_id WHERE a.source_competition_id=? AND r.locked)');$s->execute([$match['competition_id']]);
            if($s->fetchColumn())throw new \DomainException('รายชื่อรอบถัดไปล็อกจากผลนี้แล้ว ไม่สามารถเปลี่ยนผลต้นทาง');
        }
        $s=$this->db->prepare('SELECT number,side_a,side_b,started_at FROM p2_match WHERE draw_id=?');$s->execute([$match['draw_id']]);$fixtures=array_column($s->fetchAll(),null,'number');
        $depends=function(int $number)use(&$depends,$fixtures,$match):bool{foreach(['side_a','side_b'] as $key){$side=json_decode($fixtures[$number][$key],true);if($side['type']==='winner'&&($side['match']===$match['number']||$depends($side['match'])))return true;}return false;};
        foreach($fixtures as $number=>$f)if($number!==$match['number']&&$f['started_at']!==null&&$depends((int)$number))throw new \DomainException('รอบถัดไปเริ่มแล้ว ไม่สามารถเปลี่ยนผลที่ส่งทีมเข้ารอบ');
    }
}
