<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Read-only workspace projection. No workflow, schema, or publication writes. */
final class DashboardReadModel
{
    public const FILTERS=['season_id','event_id','competition_id','match_id','division_code','stage','province','district','data_mode'];
    public function __construct(private \PDO $db) {}

    public static function query(array $query,array $actor):array
    {
        $out=[];
        foreach(self::FILTERS as $key){
            $value=$query[$key] ?? '';
            if(!is_string($value)||strlen($value)>200)throw new \InvalidArgumentException('ตัวกรองไม่ถูกต้อง');
            $out[$key]=trim($value);
        }
        foreach(['season_id','event_id','competition_id','match_id'] as $key)if($out[$key]!==''&&!EventRepository::validUuid($out[$key]))throw new \InvalidArgumentException('รายการแข่งขันไม่ถูกต้อง');
        if($out['match_id']!==''&&$out['competition_id']==='')throw new \InvalidArgumentException('กรุณาระบุการแข่งขันของคู่แข่งขัน');
        if($out['division_code']!==''&&!isset(EventDraft::DIVISIONS[$out['division_code']]))throw new \InvalidArgumentException('รุ่นแข่งขันไม่ถูกต้อง');
        if($out['stage']!==''&&!in_array($out['stage'],['1','2'],true))throw new \InvalidArgumentException('ระดับการแข่งขันไม่ถูกต้อง');
        if($out['data_mode']!==''&&!in_array($out['data_mode'],['real','demo'],true))throw new \InvalidArgumentException('ประเภทข้อมูลไม่ถูกต้อง');
        if(($actor['role'] ?? '')==='SAT_OFFICER'){
            $province=(string)($actor['province'] ?? '');
            if($out['province']!==''&&$out['province']!==$province)throw new \UnexpectedValueException('ไม่มีสิทธิ์ดูข้อมูลจังหวัดนี้');
            $out['province']=$province;
        }
        if($out['stage']==='2')$out['district']='';
        $areas=AreaDirectory::districts();
        if(($actor['role'] ?? '')==='SAT_OFFICER'&&!isset($areas[$out['province']]))throw new \UnexpectedValueException('บัญชียังไม่ได้กำหนดจังหวัดที่ถูกต้อง');
        if($out['province']!==''&&!isset($areas[$out['province']]))throw new \InvalidArgumentException('จังหวัดไม่ถูกต้อง');
        if($out['district']!==''&&(!isset($areas[$out['province']])||!in_array($out['district'],$areas[$out['province']],true)))throw new \InvalidArgumentException('อำเภอ/เขตไม่อยู่ในจังหวัดที่เลือก');
        return $out;
    }

    public static function empty(array $actor,array $query=[]):array
    {
        return ['filters'=>self::query($query,$actor),'options'=>['seasons'=>[],'events'=>[],'provinces'=>[],'districts'=>[]],
            'scope_count'=>0,'team_count'=>null,'match_count'=>0,'confirmed_count'=>0,'scheduled_count'=>0,'published_count'=>0,
            'draw_version'=>null,'draw_status'=>null,'matches'=>[],'activity'=>[],
            'has_roster'=>false,'scope_names'=>[],'event'=>null,'setup_state'=>null,'eligible_teams'=>null,'teams_source'=>null,'no_demo_area'=>false];
    }

    /** National event metadata enables Phase 1 previews; competition access remains assignment scoped. */
    private function events(array $actor,array $scopes):array
    {
        if(in_array($actor['role'] ?? '',['SUPER_ADMIN','DOCUMENT_VERIFIER','SAT_OFFICER'],true)){
            $events=$this->rows("SELECT e.id AS event_id,e.name AS event_name,e.season_id,s.label AS season,e.is_test,
                COALESCE((SELECT jsonb_agg(d.code ORDER BY d.code) FROM p2_event_division d WHERE d.event_id=e.id),'[]'::jsonb) AS division_codes,
                (SELECT count(*) FROM p2_competition c WHERE c.event_id=e.id) AS competition_count,
                (SELECT count(*) FROM p2_competition c WHERE c.event_id=e.id AND c.stage IN (1,2)) AS workspace_competition_count
                FROM p2_event e JOIN p2_season s ON s.id=e.season_id ORDER BY e.created_at DESC,e.id",[]);
            foreach($events as &$event)$event['division_codes']=json_decode($event['division_codes'],true,512,JSON_THROW_ON_ERROR);
            unset($event);
            return $events;
        }
        return [];
    }

    private static function bindEvent(array $f,array $event):array
    {
        $mode=self::truth($event['is_test'])?'demo':'real';
        if(($f['season_id']!==''&&$f['season_id']!==$event['season_id'])||($f['data_mode']!==''&&$f['data_mode']!==$mode))
            throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับรายการที่เลือก');
        if($f['division_code']!==''&&!in_array($f['division_code'],$event['division_codes'],true))
            throw new \InvalidArgumentException('รุ่นแข่งขันไม่อยู่ในรายการที่เลือก');
        $f['season_id']=$event['season_id'];$f['data_mode']=$mode;
        if($f['division_code']==='')$f['division_code']=$event['division_codes'][0] ?? '';
        return $f;
    }

    /** One authorization read for contextual blank pages; no dashboard aggregates. */
    public function authorizeContext(array $actor,array $query):array
    {
        $f=self::query($query,$actor);
        if($f['event_id']!==''&&$f['competition_id']===''){
            $events=array_column($this->events($actor,[]),null,'event_id');
            if(!isset($events[$f['event_id']]))throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
            return self::bindEvent($f,$events[$f['event_id']]);
        }
        $scopes=(new CompetitionRepository($this->db))->dashboardScopes($actor,$f['event_id'] ?: null);
        $scopes=array_values(array_filter($scopes,function($s)use($f):bool{
            if(!in_array((int)$s['stage'],[1,2],true))return false;
            foreach(['season_id','event_id','division_code','stage','province','district'] as $key){
                if($key==='district'&&(int)$s['stage']===2)continue;
                if($f[$key]!==''&&(string)($s[$key] ?? '')!==$f[$key])return false;
            }
            return ($f['competition_id']===''||$s['id']===$f['competition_id'])
                &&($f['data_mode']===''||self::truth($s['is_test'])===($f['data_mode']==='demo'));
        }));
        if(!$scopes)throw new \UnexpectedValueException('ไม่มีสิทธิ์เข้าถึงขอบเขตนี้');
        if($f['match_id']!==''){
            $s=$this->db->prepare('SELECT m.id FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id AND c.draw_version_id=m.draw_id WHERE m.id=? AND c.id=?');
            $s->execute([$f['match_id'],$f['competition_id']]);
            if(!$s->fetch())throw new \UnexpectedValueException('ไม่มีสิทธิ์เข้าถึงคู่แข่งขันนี้');
        }
        return $f;
    }

    public function load(array $actor,array $query):array
    {
        $f=self::query($query,$actor);
        if($this->db->inTransaction())throw new \LogicException('Dashboard requires its own read-only snapshot');
        $this->db->beginTransaction();
        try{
            $this->db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            $this->db->exec("SET LOCAL statement_timeout='5000ms'");
            $all=(new CompetitionRepository($this->db))->dashboardScopes($actor);
            $all=array_values(array_filter($all,fn($s)=>in_array((int)$s['stage'],[1,2],true)));
            $catalog=$this->events($actor,$all);$byEvent=array_column($catalog,null,'event_id');
            if($f['competition_id']!==''){
                $selected=array_values(array_filter($all,fn($s)=>$s['id']===$f['competition_id']));
                if(!$selected)throw new \UnexpectedValueException('ไม่มีสิทธิ์เข้าถึงการแข่งขันนี้');
                $c=$selected[0];
                foreach(['event_id','season_id','division_code','stage','province','district'] as $key){
                    $value=(string)($c[$key] ?? '');
                    if($key==='district'&&(int)$c['stage']===2)$value='';
                    if($f[$key]!==''&&$f[$key]!==$value)throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับการแข่งขันที่เลือก');
                    $f[$key]=$value;
                }
                $mode=self::truth($c['is_test'])?'demo':'real';
                if($f['data_mode']!==''&&$f['data_mode']!==$mode)throw new \InvalidArgumentException('ประเภทข้อมูลไม่ตรงกับการแข่งขัน');
                $f['data_mode']=$mode;
            }
            if($f['event_id']!==''){
                if(!isset($byEvent[$f['event_id']])){
                    if(($actor['role'] ?? '')==='SUPER_ADMIN')throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
                    throw new \UnexpectedValueException('ไม่มีสิทธิ์เข้าถึงรายการนี้');
                }
                $f=self::bindEvent($f,$byEvent[$f['event_id']]);
            }
            $options=['seasons'=>[],'events'=>[],'provinces'=>[],'districts'=>[]];
            foreach($catalog as $s)$options['seasons'][$s['season_id']]=$s['season'];
            if($f['season_id']==='')$f['season_id']=$catalog[0]['season_id'] ?? '';
            elseif(!isset($options['seasons'][$f['season_id']]))throw new \UnexpectedValueException('ไม่มีสิทธิ์ดูฤดูกาลนี้');
            $season=array_values(array_filter($catalog,fn($s)=>$s['season_id']===$f['season_id']));
            if($f['data_mode']==='')$f['data_mode']=isset($season[0])&&self::truth($season[0]['is_test'])?'demo':'real';
            foreach($season as $s)if(self::truth($s['is_test'])===($f['data_mode']==='demo'))$options['events'][$s['event_id']]=$s['event_name'];
            if($f['event_id']===''&&count($options['events'])===1)$f['event_id']=(string)array_key_first($options['events']);
            $event=$f['event_id']!==''?$byEvent[$f['event_id']]:null;
            if($event)$f=self::bindEvent($f,$event);
            $available=array_values(array_filter($all,fn($s)=>$s['season_id']===$f['season_id']&&self::truth($s['is_test'])===($f['data_mode']==='demo')));
            if($f['event_id']!=='')$available=array_values(array_filter($available,fn($s)=>$s['event_id']===$f['event_id']));
            if($f['division_code']==='')$f['division_code']=$available[0]['division_code'] ?? 'U14_BOY';
            if($f['stage']==='')$f['stage']='1';
            if($f['stage']==='2')$f['district']='';
            $areas=AreaDirectory::districts();
            if($f['data_mode']==='demo'){
                $master=$areas;
                $index=(new RegistrationAdapter($this->db))->existingAreas(true,[$f['division_code']]);
                $areas=$index[$f['division_code']] ?? [];
                // Existing authorized draw history remains accessible if source teams later disappear.
                foreach($available as $scope){
                    if(empty($scope['draw_version_id'])||$scope['division_code']!==$f['division_code']||(string)$scope['stage']!==$f['stage']||!isset($master[$scope['province']]))continue;
                    $areas[$scope['province']] ??=[];
                    if($f['stage']==='1'&&in_array($scope['district'],$master[$scope['province']],true)&&!in_array($scope['district'],$areas[$scope['province']],true))$areas[$scope['province']][]=$scope['district'];
                }
            }
            $provinces=($actor['role'] ?? '')==='SAT_OFFICER'?[$f['province']]:array_keys($areas);
            foreach($provinces as $province)$options['provinces'][$province]=$province;
            $defaultProvince=$available[0]['province'] ?? '';
            if($f['province']===''&&($actor['role'] ?? '')!=='SAT_OFFICER'&&isset($options['provinces'][$defaultProvince]))$f['province']=$defaultProvince;
            if($f['province']!==''&&!isset($options['provinces'][$f['province']]))throw new \InvalidArgumentException('จังหวัดไม่มีข้อมูลในขอบเขตที่เลือก');
            $scopes=array_values(array_filter($available,fn($s)=>$s['division_code']===$f['division_code']
                &&(string)$s['stage']===$f['stage']&&$s['province']===$f['province']));
            foreach($areas[$f['province']] ?? [] as $district)$options['districts'][$district]=$district;
            if($f['district']!==''&&!isset($options['districts'][$f['district']]))throw new \InvalidArgumentException('อำเภอ/เขตไม่มีข้อมูลในขอบเขตที่เลือก');
            if($f['district']!=='')$scopes=array_values(array_filter($scopes,fn($s)=>$s['district']===$f['district']));
            if($f['competition_id']!=='')$scopes=array_values(array_filter($scopes,fn($s)=>$s['id']===$f['competition_id']));
            $out=self::empty($actor);$out['filters']=$f;$out['options']=$options;$out['scope_count']=count($scopes);
            $out['event']=$event;
            if($event&&!$scopes)$out['setup_state']=(int)$event['competition_count']===0?'needs_setup':((int)$event['workspace_competition_count']===0?'outside_workspace':'filtered_empty');
            $out['scope_names']=array_values(array_unique(array_column($scopes,'event_name')));
            $hasDraw=(bool)array_filter($scopes,fn($s)=>!empty($s['draw_version_id']));
            $out['no_demo_area']=$f['data_mode']==='demo'&&($f['province']===''?empty($areas):empty($areas[$f['province']]))&&!$hasDraw;
            if($event&&$f['stage']==='1'&&$f['district']!==''&&!$hasDraw){
                $out['eligible_teams']=(new RegistrationAdapter($this->db))->candidates(['stage'=>1,'division_code'=>$f['division_code'],'province'=>$f['province'],'district'=>$f['district'],'is_test'=>self::truth($event['is_test'])],false,true);
                $out['team_count']=count($out['eligible_teams']);$out['teams_source']='registration';
            }
            if(!$scopes)return $out;
            $ids=array_column($scopes,'id');$in=implode(',',array_fill(0,count($ids),'?'));$byId=array_column($scopes,null,'id');
            // Select only team IDs/names; never load the players/documents in roster JSON.
            $teams=$this->rows("SELECT c.id AS competition_id,t.item->>'source_team_id' AS source_team_id,t.item->>'name' AS team_name,
                d.id AS draw_id,d.version AS draw_version,
                (SELECT a.new_state->>'status' FROM p2_audit_log a
                 WHERE a.event_id=c.event_id AND a.action IN ('DRAW_CEREMONY','DRAW_CEREMONY_REDRAW','DRAW_CONFIRMED_LOCKED')
                 AND a.new_state->>'draw_id'=d.id::text ORDER BY a.id DESC LIMIT 1) AS ceremony_status,
                EXISTS(SELECT 1 FROM p2_draw_publication p WHERE p.draw_id=d.id) AS draw_published
                FROM p2_competition c LEFT JOIN p2_draw_version d ON d.id=c.draw_version_id AND d.competition_id=c.id
                JOIN p2_roster_revision r ON r.id=COALESCE(d.roster_revision_id,c.roster_revision_id) AND r.competition_id=c.id
                CROSS JOIN LATERAL jsonb_array_elements(r.teams) AS t(item) WHERE c.id IN ($in)",$ids);
            $drawsByComp=[];
            foreach($teams as $t){
                if(!empty($t['draw_id'])&&isset($t['draw_version']))$drawsByComp[$t['competition_id']]=$t;
            }
            if($drawsByComp){
                $out['draw_version']=max(array_map(fn($d)=>(int)$d['draw_version'],$drawsByComp));
                $lockedDraws=count(array_filter($drawsByComp,fn($d)=>($d['ceremony_status'] ?? null)==='CONFIRMED_LOCKED'||self::truth($d['draw_published'] ?? false)));
                $out['draw_status']=$lockedDraws===count($drawsByComp)?'CONFIRMED_LOCKED':'PENDING_CONFIRMATION';
            }
            $names=[];$seen=[];
            foreach($teams as $t){
                $s=$byId[$t['competition_id']];$key=$s['event_id'].':'.$s['division_code'].':'.$t['source_team_id'];
                $seen[$key]=true;$names[$t['competition_id'].':'.$t['source_team_id']]=$t['team_name'];
            }
            $out['has_roster']=(bool)array_filter($scopes,fn($s)=>!empty($s['roster_revision_id'])||!empty($s['draw_version_id']));
            if($out['teams_source']!=='registration')$out['team_count']=$out['has_roster']?count($seen):null;
            if($out['eligible_teams']===null&&$out['has_roster']&&($f['stage']==='2'||$f['district']!=='')){
                $out['eligible_teams']=array_map(fn($t)=>['source_team_id'=>$t['source_team_id'],'name'=>$t['team_name'],'district'=>$byId[$t['competition_id']]['district'] ?? ''], $teams);
                $out['teams_source']='roster';
            }
            $matches=$this->rows("SELECT m.id,m.competition_id,m.draw_id,m.number,m.round,m.side_a,m.side_b,m.scheduled_start,m.scheduled_end,m.state,
                v.name AS venue_name,r.state AS result_state,r.result->>'winner' AS confirmed_winner,
                EXISTS(SELECT 1 FROM p2_match_change mc WHERE mc.match_id=m.id AND mc.operation IN ('schedule_publish','schedule_republish')) AS schedule_published,
                GREATEST(ch.changed_at,r.created_at) AS changed_at
                FROM p2_match m JOIN p2_competition c ON c.id=m.competition_id AND c.draw_version_id=m.draw_id
                LEFT JOIN p2_venue v ON v.id=m.venue_id
                LEFT JOIN p2_result_revision r ON r.id=m.confirmed_result_id AND r.match_id=m.id AND r.state='CONFIRMED'
                LEFT JOIN (SELECT match_id,MAX(created_at) AS changed_at FROM p2_match_change
                    WHERE match_id IN (SELECT id FROM p2_match WHERE competition_id IN ($in)) GROUP BY match_id) ch ON ch.match_id=m.id
                WHERE c.id IN ($in)",array_merge($ids,$ids));
            $out['match_count']=count($matches);$winners=[];
            foreach($matches as $match){
                if($match['scheduled_start']!==null&&$match['venue_name']!==null&&$match['state']!=='CANCELLED')$out['scheduled_count']++;
                if(self::truth($match['schedule_published'] ?? false))$out['published_count']++;
                if($match['result_state']==='CONFIRMED'){
                    $out['confirmed_count']++;$winners[$match['draw_id'].':'.$match['number']]=$match['confirmed_winner'];
                }
            }
            usort($matches,fn($a,$b)=>(strtotime($b['changed_at'] ?? '')?:0)<=>(strtotime($a['changed_at'] ?? '')?:0)
                ?:strcmp($a['competition_id'],$b['competition_id'])?:((int)$a['number']<=>(int)$b['number']));
            foreach(array_slice($matches,0,4) as $match){
                $s=$byId[$match['competition_id']];
                $resolve=function($json)use($match,$names,$winners):string{
                    $side=is_array($json)?$json:json_decode($json,true,512,JSON_THROW_ON_ERROR);
                    $id=($side['type'] ?? '')==='team'?($side['source_team_id'] ?? null):($winners[$match['draw_id'].':'.($side['match'] ?? '')] ?? null);
                    return $id?($names[$match['competition_id'].':'.$id] ?? 'ทีมในรายชื่อแข่งขัน'):'รอทีมผ่านเข้ารอบ';
                };
                $out['matches'][]=['id'=>$match['id'],'competition_id'=>$match['competition_id'],'number'=>(int)$match['number'],
                    'round'=>(int)$match['round'],'home'=>$resolve($match['side_a']),'away'=>$resolve($match['side_b']),
                    'scheduled_start'=>$match['scheduled_start'],'venue'=>$match['venue_name'],'area'=>$s['district'] ?: $s['province']];
            }
            $activity=$this->rows("SELECT a.action,a.created_at,a.actor_id,
                a.new_state->>'competition_id' AS competition_id,
                a.new_state->>'match_id' AS match_id,
                a.new_state->>'actor_name' AS actor_name,
                a.new_state->>'actor_role' AS actor_role,
                a.new_state->>'version' AS state_version,
                a.new_state->>'reason' AS reason,
                a.new_state->>'team_count' AS team_count,
                m.number AS match_number,
                m.scheduled_start AS match_scheduled_start,
                v.name AS match_venue_name,
                dv.version AS draw_version
                FROM p2_audit_log a
                LEFT JOIN p2_match m ON m.id::text=a.new_state->>'match_id'
                LEFT JOIN p2_venue v ON v.id=m.venue_id
                LEFT JOIN p2_draw_version dv ON dv.id::text=a.new_state->>'draw_id'
                WHERE a.new_state->>'competition_id' IN ($in)
                OR a.new_state->>'match_id' IN (SELECT id::text FROM p2_match WHERE competition_id IN ($in))
                ORDER BY a.created_at DESC,a.action LIMIT 4",array_merge($ids,$ids));
            $out['activity']=$this->resolveActivityActors($activity);
            return $out;
        }finally{
            if($this->db->inTransaction())$this->db->rollBack();
        }
    }

    private static function truth(mixed $v):bool{return in_array($v,[true,1,'1','t','true'],true);}
    private function rows(string $sql,array $values):array{$s=$this->db->prepare($sql);$s->execute($values);return $s->fetchAll();}

    /** Resolve human-readable actor names from admin_users/sat_officers when actor_name is absent from audit state. */
    private function resolveActivityActors(array $activity):array
    {
        if(!$activity)return [];
        $adminIds=[];$satIds=[];
        foreach($activity as $row){
            if(!empty($row['actor_name'])||empty($row['actor_id']))continue;
            $aid=(string)$row['actor_id'];
            if(str_starts_with($aid,'admin:'))$adminIds[]=substr($aid,6);
            elseif(str_starts_with($aid,'sat:'))$satIds[]=substr($aid,4);
        }
        $names=[];
        try{
            if($adminIds){
                $adminIds=array_values(array_unique(array_filter($adminIds,fn($v)=>ctype_digit((string)$v))));
                if($adminIds){
                    $in=implode(',',array_fill(0,count($adminIds),'?'));
                    foreach($this->rows("SELECT id,fullname FROM admin_users WHERE id IN ($in)",$adminIds) as $r)$names['admin:'.$r['id']]=$r['fullname'];
                }
            }
            if($satIds){
                $satIds=array_values(array_unique(array_filter($satIds,fn($v)=>ctype_digit((string)$v))));
                if($satIds){
                    $in=implode(',',array_fill(0,count($satIds),'?'));
                    foreach($this->rows("SELECT id,fullname FROM sat_officers WHERE id IN ($in)",$satIds) as $r)$names['sat:'.$r['id']]=$r['fullname'];
                }
            }
        }catch(\Throwable){
            // Synthetic or isolated schemas may not include platform account tables.
        }
        foreach($activity as &$row){
            if(empty($row['actor_name'])&&!empty($row['actor_id'])&&isset($names[$row['actor_id']])){
                $row['actor_name']=$names[$row['actor_id']];
            }
        }
        unset($row);
        return $activity;
    }
}
