<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class RosterRepository
{
    public function __construct(private \PDO $db) {}
    public function ready(): bool { return $this->db->query("SELECT to_regclass('p2_roster_revision') IS NOT NULL")->fetchColumn()===true; }
    public function current(string $competition): ?array
    {
        $s=$this->db->prepare('SELECT r.* FROM p2_competition c JOIN p2_roster_revision r ON r.id=c.roster_revision_id AND r.competition_id=c.id WHERE c.id=?');$s->execute([$competition]);$row=$s->fetch();
        if (!$row) return null;$row['teams']=json_decode($row['teams'],true,512,JSON_THROW_ON_ERROR);return $row;
    }
    public function save(string $id,array $actor,array $input): array
    {
        $request=$input['request_id'] ?? null;$operation=$input['operation'] ?? null;$selected=$input['teams'] ?? [];$expected=$input['version'] ?? null;
        if (!EventRepository::validUuid($request) || !in_array($operation,['import','lock'],true) || !is_array($selected)
            || !preg_match('/^[0-9]{1,8}$/D',is_scalar($expected)?(string)$expected:'')
            || count($selected)<1 || count($selected)>8 || array_filter($selected,fn($v)=>!is_string($v)||!preg_match('/^[A-Za-z0-9_-]{1,50}$/D',$v)) || count(array_unique($selected))!==count($selected)) throw new \InvalidArgumentException('เลือกทีม 1–8 ทีม และตรวจสอบเวอร์ชันคำขอ');
        sort($selected);$hash=hash('sha256',json_encode([$id,$actor['id'],$actor['role'],$operation,$selected,(int)$expected],JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try {
            $this->db->exec("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='3500ms'");
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-roster:'.$request]);
            $this->db->prepare('SELECT id FROM p2_competition WHERE id=? FOR UPDATE')->execute([$id]);
            // Serialize closure with writes, then recheck live permissions under the Competition lock.
            $this->db->prepare('SELECT e.id FROM p2_event e JOIN p2_competition c ON c.event_id=e.id WHERE c.id=? FOR SHARE OF e')->execute([$id]);
            $scope=(new CompetitionRepository($this->db))->requireAccess($id,$actor,'import');
            if(($scope['division_code'] ?? '')==='U18_GIRL')WomenRegistrationAdapter::requireDrawDecision();
            $s=$this->db->prepare('SELECT * FROM p2_roster_revision WHERE request_id=?');$s->execute([$request]);$retry=$s->fetch();
            if ($retry) {
                if (!hash_equals($retry['request_hash'],$hash)) throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');
                $this->db->commit();return $retry;
            }
            $previous=$this->current($id);
            if (($previous['version'] ?? 0)!==(int)$expected) throw new \DomainException('รายชื่อถูกเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');
            if ($previous && $previous['locked']) throw new \DomainException('รายชื่อล็อกแล้ว เก็บไว้เป็นประวัติการแข่งขัน');
            // Existing Phase 1 tables have no common revision or guaranteed child FK.
            // A short SHARE lock also excludes concurrent child inserts (row locks alone do not).
            $this->db->exec('LOCK TABLE football_registered_team,football_player,football_official IN SHARE MODE');
            $candidates=(new RegistrationAdapter($this->db))->candidates($scope,true);
            $teams=array_values(array_filter($candidates,fn($t)=>in_array($t['source_team_id'],$selected,true)));
            if (count($teams)!==count($selected)) throw new \DomainException('มีทีมไม่ผ่านเกณฑ์หรือข้อมูลสมัครเปลี่ยนแล้ว กรุณาตรวจรายชื่อใหม่');
            $json=json_encode($teams,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);$fingerprint=hash('sha256',$json);
            if ($operation==='lock' && (!$previous || !hash_equals($previous['fingerprint'],$fingerprint))) throw new \DomainException('ข้อมูลต้นทางหรือทีมที่เลือกเปลี่ยน กรุณาบันทึกรายชื่อฉบับใหม่ก่อนล็อก');
            $revision=EventRepository::uuid();
            $this->db->prepare('INSERT INTO p2_roster_revision(id,competition_id,version,teams,fingerprint,locked,request_id,request_hash,actor_id) VALUES (?,?,?,CAST(? AS jsonb),?,CAST(? AS boolean),?,?,?)')->execute([$revision,$id,(int)$expected+1,$json,$fingerprint,$operation==='lock'?'true':'false',$request,$hash,$actor['id']]);
            $this->db->prepare('UPDATE p2_competition SET roster_revision_id=? WHERE id=?')->execute([$revision,$id]);
            $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$scope['event_id'],$actor['id'],$operation==='lock'?'ROSTER_LOCKED':'ROSTER_IMPORTED',$request,json_encode(['competition_id'=>$id,'revision_id'=>$revision,'fingerprint'=>$fingerprint,'team_ids'=>$selected],JSON_THROW_ON_ERROR)]);
            $result=$this->current($id);$this->db->commit();return $result;
        } catch (\Throwable $error) { if ($this->db->inTransaction()) $this->db->rollBack();throw $error; }
    }
}
