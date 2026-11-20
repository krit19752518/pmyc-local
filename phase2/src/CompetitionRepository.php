<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class CompetitionRepository
{
    private const SELECT = 'SELECT c.*,e.name AS event_name,e.status AS event_status,e.is_test,e.template_version_id,d.code AS division_code,s.id AS season_id,s.label AS season FROM p2_competition c JOIN p2_event e ON e.id=c.event_id JOIN p2_event_division d ON d.id=c.division_id AND d.event_id=c.event_id JOIN p2_season s ON s.id=e.season_id';
    public function __construct(private \PDO $db) {}

    public function ready(): bool { return $this->db->query("SELECT to_regclass('p2_competition') IS NOT NULL")->fetchColumn()===true; }

    public function divisions(string $eventId): array
    {
        return $this->all('SELECT id,code FROM p2_event_division WHERE event_id=? ORDER BY code',[$eventId]);
    }

    public function create(string $eventId, array $input, array $actor, string $requestId): array
    {
        $this->super($actor);
         $divisionCode=EventRepository::validUuid($input['division_id'] ?? null)?($this->one('SELECT code FROM p2_event_division WHERE event_id=? AND id=?',[$eventId,$input['division_id']])['code'] ?? null):null;
        $result=CompetitionDraft::validate($input,AreaDirectory::districts(),$divisionCode);
        if ($result['errors']) throw new \InvalidArgumentException(implode(' · ',$result['errors']));
        if (!EventRepository::validUuid($eventId) || !EventRepository::validUuid($requestId)) throw new \InvalidArgumentException('รหัสคำขอไม่ถูกต้อง');
        $draft=$result['draft'];
        $hash=hash('sha256',json_encode([$eventId,$draft],JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try {
            $this->db->prepare('SELECT pg_advisory_xact_lock(hashtext(?))')->execute(['p2-competition:'.$requestId]);
            $previous=$this->one('SELECT id,request_hash,created_by FROM p2_competition WHERE request_id=?',[$requestId]);
            if ($previous) {
                if ($previous['created_by']!==$actor['id'] || !hash_equals($previous['request_hash'],$hash)) throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');
                $this->db->commit();return ['id'=>$previous['id'],'created'=>false];
            }
            $event=$this->one('SELECT status FROM p2_event WHERE id=? FOR UPDATE',[$eventId]);
            if (!$event) throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
            if (in_array($event['status'],['CLOSED','ARCHIVED'],true)) throw new \DomainException('รายการนี้ปิดแล้ว ไม่สามารถเพิ่มการแข่งขันได้');
            if (!$this->one('SELECT id FROM p2_event_division WHERE event_id=? AND id=?',[$eventId,$draft['division_id']])) throw new \InvalidArgumentException('รุ่นอายุต้องอยู่ในรายการแข่งขันนี้');
            if($draft['stage']===1 && $this->db->query("SELECT to_regclass('p2_advancement_source') IS NOT NULL")->fetchColumn()===true
                && $this->one('SELECT c.id FROM p2_competition c JOIN p2_roster_revision r ON r.id=c.roster_revision_id WHERE c.event_id=? AND c.division_id=? AND c.province=? AND c.stage=2 AND r.locked',[$eventId,$draft['division_id'],$draft['province']]))throw new \DomainException('รอบจังหวัดล็อกรายชื่อแล้ว ไม่สามารถเพิ่มอำเภอต้นทางในรุ่นนี้');
            $area=[$draft['province'],$draft['district'],$draft['zone']];
            if ($this->one('SELECT id FROM p2_competition WHERE event_id=? AND division_id=? AND stage=? AND area_key=jsonb_build_array(CAST(? AS text),CAST(? AS text),CAST(? AS text))::text',[$eventId,$draft['division_id'],$draft['stage'],...$area])) throw new \DomainException('มีการแข่งขันรุ่น Stage และพื้นที่นี้แล้ว');
            $id=EventRepository::uuid();
            $this->db->prepare('INSERT INTO p2_competition(id,event_id,division_id,stage,province,district,zone,area_key,request_id,request_hash,created_by) VALUES (?,?,?,?,?,?,?,jsonb_build_array(CAST(? AS text),CAST(? AS text),CAST(? AS text))::text,?,?,?)')
                ->execute([$id,$eventId,$draft['division_id'],$draft['stage'],...$area,...$area,$requestId,$hash,$actor['id']]);
            $this->audit($eventId,$actor['id'],'COMPETITION_CREATED',$requestId,['competition_id'=>$id,...$draft]);
            $this->db->commit();return ['id'=>$id,'created'=>true];
        } catch (\Throwable $error) { $this->rollback($error); }
    }

    public function listVisible(array $actor, ?string $eventId=null): array
    {
        return $this->visible($actor,$eventId,false);
    }

    /** Dashboard totals must not inherit the legacy list's 200-row cutoff. */
    public function dashboardScopes(array $actor, ?string $eventId=null): array
    {
        return $this->visible($actor,$eventId,true);
    }

    private function visible(array $actor, ?string $eventId, bool $dashboard): array
    {
        $sql=self::SELECT;
        $values=[];$where=[];
        if (($actor['role'] ?? null)!=='SUPER_ADMIN') {
            $sql.=' JOIN p2_competition_assignment a ON a.competition_id=c.id';
            $where[]="a.actor_id=? AND a.actor_role=? AND a.active AND jsonb_exists(a.permissions,'view')";
            $values=[$actor['id'],$actor['role']];
            if ($actor['role']==='SAT_OFFICER') { $where[]='c.province=? AND c.stage IN (1,2)';$values[]=$actor['province'] ?? ''; }
            elseif ($actor['role']!=='DOCUMENT_VERIFIER') return [];
        }
        if ($eventId!==null) { $where[]='c.event_id=?';$values[]=$eventId; }
        return $this->all($sql.($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY e.created_at DESC,c.stage,d.code,c.area_key'.($dashboard?'':' LIMIT 200'),$values);
    }

    public function get(string $id): ?array
    {
        return EventRepository::validUuid($id)?$this->one(self::SELECT.' WHERE c.id=?',[$id]):null;
    }

    public function findDrawScope(array $filters): ?array
    {
        return $this->one(self::SELECT.' WHERE c.event_id=? AND d.code=? AND c.stage=? AND c.province=? AND c.district IS NOT DISTINCT FROM CAST(? AS text)',
            [$filters['event_id'],$filters['division_code'],$filters['stage'],$filters['province'],$filters['district'] ?: null]);
    }

    public function assignment(string $id,array $actor): ?array
    {
        return $this->one('SELECT * FROM p2_competition_assignment WHERE competition_id=? AND actor_id=? AND actor_role=?',[$id,$actor['id'],$actor['role']]);
    }

    public function requireAccess(string $id,array $actor,string $action='view'): array
    {
        $competition=$this->get($id);
        if (!$competition) throw new \OutOfBoundsException('ไม่พบการแข่งขัน');
        if (!CompetitionPolicy::can($actor,$competition,$this->assignment($id,$actor),$action)) throw new \UnexpectedValueException('ไม่มีสิทธิ์เข้าถึงการแข่งขันนี้');
        return $competition;
    }

    /** Only non-sensitive account fields are read; no password/email/documents. */
    public function accounts(): array
    {
        return $this->all("SELECT 'admin:'||id AS account_key,id,fullname,'DOCUMENT_VERIFIER'::text AS role,NULL::text AS province FROM admin_users WHERE role_code<>'SUPER_ADMIN' UNION ALL SELECT 'sat:'||id,id,fullname,'SAT_OFFICER',province FROM sat_officers ORDER BY fullname,account_key",[]);
    }

    public function assignments(string $id): array
    {
        return $this->all('SELECT * FROM p2_competition_assignment WHERE competition_id=? ORDER BY actor_role,actor_id',[$id]);
    }

    public function assign(string $id,array $input,array $actor): array
    {
        $this->super($actor);
        $request=$input['request_id'] ?? null;
        $account=$input['account_key'] ?? null;
        $reason=is_string($input['reason'] ?? null)?trim($input['reason']):'';
        $operation=$input['operation'] ?? 'grant';
        $version=$input['version'] ?? null;
        if (!EventRepository::validUuid($id) || !EventRepository::validUuid($request) || !is_string($account) || !preg_match('/^(admin|sat):([A-Za-z0-9_-]{1,100})$/D',$account,$parts)
            || !preg_match('/^.{1,300}$/usD',$reason) || !in_array($operation,['grant','revoke'],true)
            || !(is_int($version) && $version>=0 || is_string($version) && preg_match('/^[0-9]{1,8}$/D',$version))) throw new \InvalidArgumentException('กรุณาตรวจบัญชี เหตุผล และเวอร์ชันคำขอ');
        $target=['id'=>$parts[2],'role'=>$parts[1]==='sat'?'SAT_OFFICER':'DOCUMENT_VERIFIER'];
        $permissions=$input['permissions'] ?? [];
        if (!is_array($permissions) || array_filter($permissions,fn($v)=>!is_string($v) || !in_array($v,CompetitionPolicy::ACTIONS,true))) throw new \InvalidArgumentException('สิทธิ์ที่เลือกไม่ถูกต้อง');
        $permissions=array_values(array_unique($permissions));sort($permissions);
        if ($operation==='grant' && (!in_array('view',$permissions,true) || ($target['role']==='DOCUMENT_VERIFIER' && $permissions!==['view']))) throw new \InvalidArgumentException('เจ้าหน้าที่ตรวจเอกสารได้รับสิทธิ์ดูข้อมูลเท่านั้น และทุกบัญชีต้องมีสิทธิ์ดูข้อมูล');
        $hash=hash('sha256',json_encode([$id,$account,$permissions,$reason,$operation,(int)$version,$actor['id']],JSON_THROW_ON_ERROR));
        $this->db->beginTransaction();
        try {
            // Future operational mutations must take this same competition lock.
            $competition=$this->one(self::SELECT.' WHERE c.id=? FOR UPDATE OF c',[$id]);
            if (!$competition) throw new \OutOfBoundsException('ไม่พบการแข่งขัน');
            $previous=$this->assignment($id,$target);
            if ($previous && $previous['last_request_id']===$request) {
                if (!hash_equals($previous['last_request_hash'],$hash)) throw new \DomainException('คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');
                $this->db->commit();return $previous;
            }
            if ((int)($previous['version'] ?? 0)!==(int)$version || ($operation==='revoke' && !$previous)) throw new \DomainException('สิทธิ์ถูกเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');
            if ($operation==='grant') {
                $current=null;
                foreach ($this->accounts() as $candidate) if ($candidate['account_key']===$account) $current=$candidate;
                if (!$current) throw new \InvalidArgumentException('ไม่พบบัญชีผู้รับผิดชอบ');
                if ($current['role']==='SAT_OFFICER' && (!in_array((int)$competition['stage'],[1,2],true) || empty($current['province']) || $current['province']!==$competition['province'])) throw new \InvalidArgumentException('บัญชีจังหวัดต้องตรงกับพื้นที่การแข่งขัน');
                if (in_array($competition['event_status'],['CLOSED','ARCHIVED'],true)) throw new \DomainException('รายการนี้ปิดแล้ว');
            } else $permissions=json_decode($previous['permissions'],true,512,JSON_THROW_ON_ERROR);
            $next=(int)($previous['version'] ?? 0)+1;
            $this->db->prepare('INSERT INTO p2_competition_assignment(competition_id,actor_id,actor_role,permissions,active,version,last_request_id,last_request_hash,updated_by) VALUES (?,?,?,CAST(? AS jsonb),CAST(? AS boolean),?,?,?,?) ON CONFLICT(competition_id,actor_id,actor_role) DO UPDATE SET permissions=EXCLUDED.permissions,active=EXCLUDED.active,version=EXCLUDED.version,last_request_id=EXCLUDED.last_request_id,last_request_hash=EXCLUDED.last_request_hash,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP')
                ->execute([$id,$target['id'],$target['role'],json_encode($permissions,JSON_THROW_ON_ERROR),$operation==='grant'?'true':'false',$next,$request,$hash,$actor['id']]);
            $this->audit($competition['event_id'],$actor['id'],'COMPETITION_ASSIGNMENT_CHANGED',$request,['competition_id'=>$id,'target'=>$target,'permissions'=>$permissions,'active'=>$operation==='grant','version'=>$next,'reason'=>$reason]);
            $result=$this->assignment($id,$target);
            $this->db->commit();return $result;
        } catch (\Throwable $error) { $this->rollback($error); }
    }

    private function rollback(\Throwable $error): never
    {
        if ($this->db->inTransaction()) $this->db->rollBack();
        if ($error instanceof \PDOException && (string)$error->getCode()==='23505') throw new \DomainException('คำขอหรือขอบเขตการแข่งขันนี้ถูกใช้แล้ว กรุณาโหลดข้อมูลใหม่',0,$error);
        throw $error;
    }

    private function super(array $actor): void
    {
        if (($actor['role'] ?? null)!=='SUPER_ADMIN') throw new \UnexpectedValueException('เฉพาะผู้ดูแลระบบสูงสุด');
    }

    private function audit(string $event,string $actor,string $action,string $request,array $state): void
    {
        $this->db->prepare('INSERT INTO p2_audit_log(event_id,actor_id,action,request_id,new_state) VALUES (?,?,?,?,CAST(? AS jsonb))')->execute([$event,$actor,$action,$request,json_encode($state,JSON_THROW_ON_ERROR)]);
    }
    private function all(string $sql,array $values): array { $stmt=$this->db->prepare($sql);$stmt->execute($values);return $stmt->fetchAll(); }
    private function one(string $sql,array $values): ?array { return $this->all($sql,$values)[0] ?? null; }
}
