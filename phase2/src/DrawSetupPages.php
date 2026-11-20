<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Live configuration preview; only Save and Start perform writes. */
final class DrawSetupPages
{
    public const PATH='/phase2demo/workspace/draw-setup';
    public static function render(string $path,string $method,array $query,array $input,array $context,?array $initial=null):array
    {
        $actor=$context['actor'] ?? null;if(!$actor)return [403,'กรุณาเข้าสู่ระบบ'];
        if(!in_array($method,['GET','POST'],true))return [405,'ไม่รองรับคำขอนี้'];
        if($method==='POST'&&(!is_string($input['_csrf'] ?? null)||empty($context['csrf'])||!hash_equals($context['csrf'],$input['_csrf'])))return [403,'ไม่สามารถยืนยันคำขอได้'];
        if(!EventRepository::configured())return [503,'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน'];
        $db=EventRepository::connect();$repo=new CompetitionRepository($db);$events=new EventRepository($db);$super=$actor['role']==='SUPER_ADMIN';
        try{
            $values=$method==='POST'?$input:$query;
            if(isset($values['competition_id'])){
                if(!EventRepository::validUuid($values['competition_id']))throw new \InvalidArgumentException('การแข่งขันไม่ถูกต้อง');
                $initial=$repo->requireAccess($values['competition_id'],$actor);
            }
            $eventId=$values['event_id'] ?? $initial['event_id'] ?? null;
            if($eventId!==null&&!EventRepository::validUuid($eventId))throw new \InvalidArgumentException('รายการแข่งขันไม่ถูกต้อง');
            if($method==='GET'&&!$initial&&!array_intersect_key($query,array_flip(['competition_id','division_id','stage','province','district','preview','metadata']))){
                $last=(new DrawRepository($db))->lastSavedCompetition($actor,$eventId);
                if($last){$initial=$repo->requireAccess($last,$actor);$eventId=$initial['event_id'];}
            }
            $event=$eventId?$events->get($eventId):null;if($eventId&&!$event)return [404,'ไม่พบรายการแข่งขัน'];
            $visible=$repo->listVisible($actor);$allowedEvents=array_unique(array_column($visible,'event_id'));
            if(!$super&&$event&&!in_array($eventId,$allowedEvents,true))return [403,'ไม่มีสิทธิ์เข้าถึงรายการนี้'];
            if($method==='GET'&&($query['metadata'] ?? '')==='1')return self::json(self::metadata($db,$event,$actor,$visible));
            $selection=['event_id'=>$eventId,'division_id'=>$values['division_id'] ?? $initial['division_id'] ?? '', 'stage'=>$values['stage'] ?? $initial['stage'] ?? '1','province'=>$values['province'] ?? $initial['province'] ?? '', 'district'=>$values['district'] ?? $initial['district'] ?? '', 'zone'=>''];
            if($method==='GET'&&($query['preview'] ?? '')==='1')return self::json(self::preview($db,$event,$selection,$actor));
            if($method==='POST'){
                if(!$super)return [403,'เฉพาะ Super Admin เท่านั้นที่บันทึกการตั้งค่าการแข่งขัน'];
                if(($input['operation'] ?? '')!=='save')throw new \InvalidArgumentException('การดำเนินการไม่ถูกต้อง');
                if(!EventRepository::validUuid($input['request_id'] ?? null))throw new \InvalidArgumentException('รหัสคำขอไม่ถูกต้อง');
                self::preview($db,$event,$selection,$actor);
                $scope=self::find($db,$selection);
                if(!$scope){$created=$repo->create($eventId,$selection,$actor,$input['request_id']);$scope=$repo->get($created['id']);}
                $live=self::preview($db,$event,$selection,$actor);
                $saved=(new DrawRepository($db))->saveSetup($scope['id'],$actor,$input['request_id'],$live);
                return self::json(['ok'=>true,'message'=>'บันทึกการตั้งค่าการแข่งขันแล้ว','competition_id'=>$scope['id'],'preview'=>self::restore($live,$saved),'setup_url'=>self::PATH.'?event_id='.$eventId.'&competition_id='.$scope['id']]);
            }
            if($event)$context['ui_event_id']=$eventId;if($initial)$context['ui_scope']=$initial;
            $choices=$super?$events->list():array_values(array_filter($events->list(),fn($e)=>in_array($e['id'],$allowedEvents,true)));
            // Keep a directly opened older Event selectable even beyond the list's page size.
            if($event&&!in_array($eventId,array_column($choices,'id'),true))array_unshift($choices,$event);
            $metadata=self::metadata($db,$event,$actor,$visible);$preview=null;
            if($event&&$selection['division_id']&&$selection['province']&&((string)$selection['stage']==='2'||$selection['district']))$preview=self::preview($db,$event,$selection,$actor);
            if($initial&&$preview&&$preview['competition_id']===$initial['id']){
                $saved=(new DrawRepository($db))->savedSetup($initial['id']);
                if($saved)$preview=self::restore($preview,$saved);
            }
            return Application::page('ตั้งค่าการจับสลาก',self::form($choices,$metadata,$selection,$preview,$context,$super),$path,$context);
        }catch(\InvalidArgumentException $e){return self::json(['ok'=>false,'message'=>$e->getMessage()],422);}
        catch(\UnexpectedValueException $e){return self::json(['ok'=>false,'message'=>'ไม่มีสิทธิ์เข้าถึงการแข่งขันนี้'],403);}
        catch(\OutOfBoundsException $e){return self::json(['ok'=>false,'message'=>'ไม่พบการแข่งขัน'],404);}
        catch(\DomainException $e){return self::json(['ok'=>false,'message'=>$e->getMessage()],409);}
    }
    private static function restore(array $live,array $saved):array
    {
        // A saved review survives navigation; live rights and committed draw history still win.
        $preview=$live['ceremony_url']?$live:array_replace($saved['preview'],array_intersect_key($live,array_flip(['can_save','can_start','start_url','ceremony_url','advancement_url','historical'])));
        if(!$live['ceremony_url']){
            $preview['can_start']=$live['can_start']&&count($preview['teams'])>0;
            if($live['can_save']&&!hash_equals($saved['preview']['eligibility_hash'],$live['eligibility_hash']))$preview['notice']='ข้อมูลต้นทางเปลี่ยนจากชุดที่บันทึกไว้ กรุณาเลือกตัวกรองใหม่และบันทึกอีกครั้งก่อนเริ่มพิธี';
        }
        $preview['setup_request_id']=$saved['request_id'];return $preview;
    }
    private static function find(\PDO $db,array $s):?array
    {
        $q=$db->prepare('SELECT id FROM p2_competition WHERE event_id=? AND division_id=? AND stage=? AND province=? AND district IS NOT DISTINCT FROM CAST(? AS text) AND zone IS NULL');
        $q->execute([$s['event_id'],$s['division_id'],$s['stage'],$s['province'],(string)$s['stage']==='1'?$s['district']:null]);$id=$q->fetchColumn();return $id?(new CompetitionRepository($db))->get($id):null;
    }
    private static function metadata(\PDO $db,?array $event,array $actor,array $visible):array
    {
        if(!$event)return ['ok'=>true,'divisions'=>[],'areas'=>(object)[],'format'=>'','data_mode'=>''];
        $repo=new CompetitionRepository($db);$divisions=$repo->divisions($event['id']);$super=$actor['role']==='SUPER_ADMIN';
        if(!$super)$divisions=array_values(array_filter($divisions,fn($d)=>in_array($d['id'],array_column($visible,'division_id'),true)));
        $registered=$super?(new RegistrationAdapter($db))->existingAreas($event['is_test'],array_column($divisions,'code'),$event['season_id']):[];$areas=[];
        foreach($divisions as $d)$areas[$d['id']]=['1'=>$registered[$d['code']] ?? [],'2'=>[]];
        foreach($repo->listVisible($actor,$event['id']) as $scope){
            if(!isset($areas[$scope['division_id']]))continue;$key=(string)$scope['stage'];if(!in_array($key,['1','2'],true))continue;
            if($key==='1'){
                $areas[$scope['division_id']]['1'][$scope['province']] ??=[];
                if(!in_array($scope['district'],$areas[$scope['division_id']]['1'][$scope['province']],true))$areas[$scope['division_id']]['1'][$scope['province']][]=$scope['district'];
                if($super)$areas[$scope['division_id']]['2'][$scope['province']]=[];
            }else $areas[$scope['division_id']]['2'][$scope['province']]=[];
        }
        foreach($areas as &$stages)foreach($stages as &$provinces)$provinces=(object)$provinces;unset($stages,$provinces);
        return ['ok'=>true,'divisions'=>array_map(fn($d)=>['id'=>$d['id'],'code'=>$d['code'],'label'=>EventDraft::DIVISIONS[$d['code']]],$divisions),'areas'=>(object)$areas,'format'=>in_array($event['template_version_id'],DrawEngine::TEMPLATES,true)?'แพ้คัดออก (Knockout)':'พบกันหมด 1 เลก','data_mode'=>$event['is_test']?'ข้อมูล Demo':'ข้อมูลจริง'];
    }
    public static function preview(\PDO $db,?array $event,array $values,array $actor):array
    {
        if(!$event)throw new \InvalidArgumentException('กรุณาเลือกรายการแข่งขัน / ฤดูกาล');
        $divisionCode=array_column((new CompetitionRepository($db))->divisions($event['id']),'code','id')[(is_string($values['division_id'] ?? null)?$values['division_id']:'')] ?? null;
        $female=$divisionCode==='U18_GIRL';
        $result=CompetitionDraft::validate($values,AreaDirectory::districts(),$divisionCode);
        if($result['errors'])throw new \InvalidArgumentException(implode(' · ',$result['errors']));
        $s=$result['draft'];if(!in_array($s['stage'],[1,2],true))throw new \InvalidArgumentException('เปิดใช้เฉพาะ Stage 1–2');
        $repo=new CompetitionRepository($db);if(!in_array($s['division_id'],array_column($repo->divisions($event['id']),'id'),true))throw new \InvalidArgumentException('รุ่นต้องอยู่ในรายการแข่งขันที่เลือก');
        $s['event_id']=$event['id'];$scope=self::find($db,$s);$assignment=$scope?$repo->assignment($scope['id'],$actor):null;
        if($scope)$repo->requireAccess($scope['id'],$actor);elseif($actor['role']!=='SUPER_ADMIN')throw new \UnexpectedValueException();
        $canDraw=$scope?CompetitionPolicy::can($actor,$scope,$assignment,'draw'):!in_array($event['status'],['CLOSED','ARCHIVED'],true);
        if(!$scope&&!$canDraw)throw new \DomainException('รายการแข่งขันนี้ปิดแล้ว');
        $draw=$scope?(new DrawRepository($db))->current($scope['id']):null;$roster=$scope?(new RosterRepository($db))->current($scope['id']):null;
        if($draw||!$canDraw){$teams=$roster['teams'] ?? [];$fingerprint=$roster['fingerprint'] ?? hash('sha256','[]');}
        elseif($s['stage']===1){
            $meta=self::metadata($db,$event,$actor,$repo->listVisible($actor,$event['id']));$index=(array)$meta['areas'];$provinces=(array)($index[$s['division_id']]['1'] ?? []);
            if(!$scope&&($female?!array_key_exists($s['province'],$provinces):!in_array($s['district'],$provinces[$s['province']] ?? [],true)))throw new \InvalidArgumentException('พื้นที่นี้ยังไม่มีข้อมูลของรุ่นและประเภทที่เลือก');
            $code=array_column($repo->divisions($event['id']),'code','id')[$s['division_id']];
            $teams=(new RegistrationAdapter($db))->candidates([...$s,'division_code'=>$code,'is_test'=>$event['is_test']]);$fingerprint=hash('sha256',json_encode($teams,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        }else{
            $teams=$roster['teams'] ?? [];$fingerprint=$roster['fingerprint'] ?? hash('sha256','[]');
            if(!$scope){$q=$db->prepare("SELECT EXISTS(SELECT 1 FROM p2_competition WHERE event_id=? AND division_id=? AND stage=1 AND province=? AND status<>'ARCHIVED')");$q->execute([$event['id'],$s['division_id'],$s['province']]);if(!$q->fetchColumn())throw new \InvalidArgumentException('ยังไม่มีการแข่งขันอำเภอต้นทางในจังหวัดนี้');}
        }
        $supported=!$female&&in_array($event['template_version_id'],DrawEngine::TEMPLATES,true);$base=$scope?'/phase2demo/competitions/'.$scope['id']:null;
        return ['ok'=>true,'teams'=>array_map(fn($t)=>['name'=>$t['name']],$teams),'structure'=>$supported?DrawEngine::structure(count($teams)):null,'eligibility_hash'=>$fingerprint,'competition_id'=>$scope['id'] ?? null,'historical'=>$draw!==null||!$canDraw,'can_save'=>$actor['role']==='SUPER_ADMIN'&&$canDraw,'can_start'=>$canDraw&&$supported&&count($teams)>0&&($s['stage']===1||!empty($roster['locked'])),'ceremony_url'=>$draw?$base.'/draw':null,'start_url'=>$base?$base.'/draw/setup':null,'advancement_url'=>$s['stage']===2&&$base&&$canDraw?$base.'/advancement':null,'notice'=>!$supported?($female?'รอบแรกหญิงระดับจังหวัด · รอสรุปจำนวนทีมและรูปแบบจับสลากก่อนสร้างคู่จริง':'รูปแบบนี้ยังไม่รองรับการจับสลากแพ้คัดออก'):($draw?'ใช้รายชื่อที่บันทึกไว้กับผลจับสลากเดิม':(!$canDraw?'แสดงรายชื่อที่บันทึกไว้ · ไม่มีสิทธิ์เริ่มจับสลากหรือรายการปิดแล้ว':($s['stage']===2?'Stage 2 ใช้ทีมผ่านเข้ารอบจากการแข่งขันอำเภอ':'ทีมและรุ่นอนุมัติแล้ว · นักกีฬาในรุ่นอนุมัติอย่างน้อย 18 คน · สูงสุด 8 ทีมแรกตามเวลาสมัคร')))];
    }
    private static function form(array $events,array $meta,array $s,?array $preview,array $context,bool $super):string
    {
        $data=Ui::e(json_encode(['metadata'=>$meta,'selection'=>$s,'preview'=>$preview],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $html='<div class="grid grid-2 unified-draw" data-unified-draw data-can-save="'.($super?'1':'0').'" data-initial="'.$data.'"><section class="card"><div class="card-h"><h3>ตั้งค่าการจับสลาก Stage 1–2</h3><span class="badge b-blue" data-draw-mode>'.Ui::e($meta['data_mode']).'</span></div><div class="card-b"><form method="post" action="'.self::PATH.'" data-draw-setup-form><input type="hidden" name="_csrf" value="'.Ui::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="operation" value="save"><div class="draw-config-group"><h4>บริบทการแข่งขัน</h4><div class="form-grid">';
        $html.='<label class="field">ฤดูกาล / รายการแข่งขัน *<select class="select" name="event_id" required><option value="">เลือกฤดูกาลและรายการแข่งขัน</option>';
        foreach($events as $e)$html.='<option value="'.$e['id'].'" '.($s['event_id']===$e['id']?'selected':'').'>'.Ui::e($e['season'].' · '.$e['name'].' · '.($e['is_test']?'Demo':'ข้อมูลจริง')).'</option>';
        $html.='</select></label><label class="field">รุ่นอายุ *<select class="select" name="division_id" required><option value="">เลือกรุ่นอายุ</option></select></label><label class="field">Stage *<select class="select" name="stage" required><option value="1">Stage 1 ระดับอำเภอ</option><option value="2">Stage 2 ระดับจังหวัด</option></select></label></div></div><div class="draw-config-group"><h4>พื้นที่แข่งขัน</h4><div class="grid grid-2"><label class="field">จังหวัด *<select class="select" name="province" required><option value="">เลือกจังหวัด</option></select></label><label class="field">เขต/อำเภอ *<select class="select" name="district" required><option value="">เลือกเขต/อำเภอ</option></select></label></div></div><div class="draw-config-group"><h4>รูปแบบและโครงสร้างการแข่งขัน</h4><label class="field">รูปแบบการแข่งขัน<select class="select" disabled data-draw-format><option>'.Ui::e($meta['format'] ?: 'เลือกฤดูกาลและรายการก่อน').'</option></select></label><div class="draw-summary" aria-live="polite">';
        foreach(['count'=>'ทีม Approved ที่พบ','main_round'=>'รอบหลัก','playoff_pairs'=>'รอบเพลย์ออฟ','direct_count'=>'ผ่านเข้ารอบหลักโดยตรง','direct_slots'=>'ตำแหน่งที่ได้รอเล่นรอบหลัก','method'=>'วิธีสุ่ม'] as $key=>$label)$html.='<div class="draw-summary-item"><small>'.$label.'</small><strong data-draw-summary="'.$key.'">—</strong></div>';
        $html.='</div><div class="direct-slot" data-draw-explanation>เลือกฤดูกาล รุ่น และพื้นที่เพื่อคำนวณโครงสร้างการแข่งขัน</div></div><p class="notice" data-draw-notice role="status">เลือกข้อมูลให้ครบถึงเขต/อำเภอเพื่อโหลดทีมที่ได้รับอนุมัติ</p><div class="draw-action-row"><button class="btn btn-light" type="submit" data-draw-save '.(!$super?'disabled':'').'>บันทึกการตั้งค่า</button><button class="btn btn-primary" type="button" data-draw-start disabled>เริ่มพิธีจับสลาก →</button></div><a class="btn btn-light" data-draw-advancement hidden>นำทีมผ่านจากรอบอำเภอ</a></form><noscript><p class="notice">กรุณาเปิด JavaScript เพื่อเลือกพื้นที่และโหลดรายชื่อทีม</p></noscript></div></section><section class="card"><div class="card-h"><h3 data-draw-teams-title>ทีม Approved</h3><span class="badge b-green" data-draw-teams-count>0 ทีม</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>ทีม</th><th>สถานะลงทะเบียน</th><th>สิทธิ์แข่งขัน</th></tr></thead><tbody data-draw-teams><tr><td colspan="4" class="empty">เลือกพื้นที่เพื่อแสดงทีม</td></tr></tbody></table></div></section></div>';
        return $html.'<dialog class="setup-feedback" data-draw-feedback aria-labelledby="draw-feedback-title"><div class="card-b"><div class="setup-feedback-icon" aria-hidden="true">✓</div><h2 id="draw-feedback-title" data-feedback-title>บันทึกสำเร็จ</h2><p data-feedback-message></p><button class="btn btn-primary" type="button" data-feedback-close>ปิด</button></div></dialog>';
    }
    private static function json(array $value,int $status=200):array{return [$status,json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),null,'application/json'];}
}
