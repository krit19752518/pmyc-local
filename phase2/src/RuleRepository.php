<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class RuleRepository
{
    public function __construct(private \PDO $db){}
    public function ready():bool{return $this->db->query("SELECT to_regclass('p2_rule_version') IS NOT NULL")->fetchColumn()===true;}
    public function current(string $event):?array
    {
        $s=$this->db->prepare('SELECT r.* FROM p2_event e JOIN p2_rule_version r ON r.id=e.rule_version_id AND r.event_id=e.id WHERE e.id=?');$s->execute([$event]);$r=$s->fetch();if(!$r)return null;$r['config']=json_decode($r['config'],true,512,JSON_THROW_ON_ERROR);return $r;
    }
    public function history(string $event):array
    {
        $s=$this->db->prepare('SELECT version,config,actor_id,reason,created_at FROM p2_rule_version WHERE event_id=? ORDER BY version DESC');$s->execute([$event]);$rows=$s->fetchAll();foreach($rows as &$r)$r['config']=json_decode($r['config'],true,512,JSON_THROW_ON_ERROR);unset($r);return $rows;
    }
    public function approve(string $event,array $actor,array $input):array
    {
        if(($actor['role'] ?? '')!=='SUPER_ADMIN')throw new \UnexpectedValueException('เฉพาะผู้ดูแลระบบสูงสุด');
        $config=EventRules::validate($input);$request=$input['request_id'] ?? null;$version=$input['version'] ?? null;$reason=is_string($input['reason'] ?? null)?trim($input['reason']):'';
        if(!EventRepository::validUuid($request)||!preg_match('/^[0-9]{1,8}$/D',is_scalar($version)?(string)$version:'')||!preg_match('/^.{1,300}$/usD',$reason))throw new \InvalidArgumentException('กรุณาระบุเหตุผลและเวอร์ชันคำขอ');
        $hash=hash('sha256',json_encode([$event,$actor['id'],$config,(int)$version,$reason],JSON_THROW_ON_ERROR));$this->db->beginTransaction();
        try{
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-rule:'.$request]);
            $s=$this->db->prepare('SELECT * FROM p2_event WHERE id=? FOR UPDATE');$s->execute([$event]);$e=$s->fetch();if(!$e)throw new \OutOfBoundsException('ไม่พบรายการ');
            $s=$this->db->prepare('SELECT * FROM p2_rule_version WHERE request_id=?');$s->execute([$request]);$old=$s->fetch();if($old){if(!hash_equals($old['request_hash'],$hash))throw new \DomainException('คำขอนี้ถูกใช้แล้ว');$old['config']=json_decode($old['config'],true,512,JSON_THROW_ON_ERROR);$this->db->commit();return $old;}
            $previous=$this->current($event);if(($previous['version'] ?? 0)!==(int)$version)throw new \DomainException('เวอร์ชันกติกาเปลี่ยนแล้ว');
            if(in_array($e['status'],['CLOSED','ARCHIVED'],true))throw new \DomainException('รายการปิดแล้ว');
            $s=$this->db->prepare('SELECT EXISTS(SELECT 1 FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id WHERE c.event_id=? AND m.started_at IS NOT NULL)');$s->execute([$event]);if($s->fetchColumn())throw new \DomainException('มีแมตช์เริ่มแล้ว ไม่สามารถเปลี่ยนกติกาของรายการนี้');
            $id=EventRepository::uuid();$this->db->prepare('INSERT INTO p2_rule_version(id,event_id,version,config,actor_id,reason,request_id,request_hash) VALUES (?,?,?,CAST(? AS jsonb),?,?,?,?)')->execute([$id,$event,(int)$version+1,json_encode($config,JSON_THROW_ON_ERROR),$actor['id'],$reason,$request,$hash]);
            $this->db->prepare('UPDATE p2_event SET rule_version_id=? WHERE id=?')->execute([$id,$event]);
            $this->db->prepare("INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,'RULES_APPROVED',?,CAST(? AS jsonb))")->execute([$event,$actor['id'],$request,json_encode(['rule_version_id'=>$id,'config'=>$config,'reason'=>$reason],JSON_THROW_ON_ERROR)]);
            $result=$this->current($event);$this->db->commit();return $result;
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
}
