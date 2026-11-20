<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class WorkspacePages
{
    public static function matches(string $path):bool{return (bool)preg_match('#^/phase2demo/workspace/[a-z0-9-]+$#D',$path)||(bool)preg_match('#^/phase2demo/competitions/[a-f0-9-]{36}/audit$#Di',$path);}
    public static function render(string $path,string $method,array $query,array $context):array
    {
        if(empty($context['actor']))return [403,'กรุณาเข้าสู่ระบบ'];if($method!=='GET')return [405,'ไม่รองรับคำขอนี้'];
        if(!EventRepository::configured())return Application::page('เลือกการแข่งขัน','<div class="notice">ยังไม่ได้เชื่อมข้อมูลการแข่งขัน</div>',$path,$context);
        $db=EventRepository::connect();$repo=new CompetitionRepository($db);$actor=$context['actor'];
        try{
            if(preg_match('#/competitions/([a-f0-9-]{36})/audit$#Di',$path,$m)){
                $scope=$repo->requireAccess($m[1],$actor);$s=$db->prepare("SELECT actor_id,action,new_state,created_at FROM p2_audit_log WHERE event_id=? AND (new_state->>'competition_id'=? OR new_state->>'match_id' IN (SELECT id::text FROM p2_match WHERE competition_id=?)) ORDER BY created_at DESC LIMIT 100");$s->execute([$scope['event_id'],$scope['id'],$scope['id']]);$body=Ui::context($scope).'<div class="card"><div class="card-h"><h3>ประวัติการทำรายการ</h3></div><div class="table-wrap"><table><thead><tr><th>เวลา</th><th>การทำรายการ</th><th>ผู้ดำเนินการ</th><th>เหตุผล</th></tr></thead><tbody>';
                $labels=['COMPETITION_CREATED'=>'สร้างการแข่งขัน','DRAW_SETUP_SAVED'=>'บันทึกการตั้งค่าจับสลาก','DRAW_START'=>'เริ่มพิธีจับสลาก','DRAW_CREATE'=>'จับสลาก','DRAW_REDRAW'=>'สุ่มจับสลากใหม่','DRAW_PUBLISH'=>'เผยแพร่คู่แข่งขัน','ROSTER_IMPORTED'=>'นำเข้ารายชื่อ','ROSTER_LOCKED'=>'ล็อกรายชื่อ','ADVANCEMENT_IMPORTED'=>'นำทีมผ่านเข้ารอบ','ADVANCEMENT_LOCKED'=>'ล็อกทีมผ่านเข้ารอบ'];
                foreach($s->fetchAll() as $row){$state=json_decode($row['new_state'],true);$body.='<tr><td>'.Ui::e($row['created_at']).'</td><td>'.Ui::e($labels[$row['action']] ?? 'ปรับปรุงข้อมูลการแข่งขัน').'</td><td>'.Ui::e($row['actor_id']).'</td><td>'.Ui::e($state['reason'] ?? '—').'</td></tr>';}
                return Application::page('ประวัติการทำรายการ',$body.'</tbody></table></div></div>',$path,$context);
            }
            $screen=basename($path);if(!isset(Ui::SCREENS[$screen]))return [404,'ไม่พบเมนู'];$super=$actor['role']==='SUPER_ADMIN';if(in_array($screen,['setup','permissions'],true)&&!$super)return [403,'เฉพาะผู้ดูแลระบบสูงสุด'];
            $event=$query['event_id'] ?? null;if($event!==null&&!EventRepository::validUuid($event))return [400,'รายการแข่งขันไม่ถูกต้อง'];
            $context['ui_event_id']=$event;if($event===null)unset($context['ui_event_id']);
            if($screen==='setup'){
                if($event)return CompetitionPages::setup($db,$event,$path,$context);
                $body='<div class="card"><div class="card-b"><form method="get" action="/phase2demo/workspace/setup"><label class="field">รายการแข่งขัน *<select name="event_id" required><option value="">เลือกรายการจาก platform</option>';
                foreach((new EventRepository($db))->list() as $e)$body.='<option value="'.$e['id'].'">'.Ui::e($e['name'].' · '.$e['season'].' · '.($e['is_test']?'Demo':'ข้อมูลจริง')).'</option>';
                $body.='</select></label><div class="action-row"><button class="btn btn-primary" type="submit">เปิดตั้งค่าการแข่งขัน</button><a class="btn btn-light" href="/platform/events/new">สร้างรายการแข่งขันใหม่</a></div></form></div></div>';
                return Application::page('ตั้งค่าการแข่งขัน',$body,$path,$context);
            }

            $scopes=$repo->listVisible($actor,$event);$scopes=array_values(array_filter($scopes,fn($c)=>in_array((int)$c['stage'],[1,2],true)));
            if(in_array($screen,['stage1','stage2'],true))$scopes=array_values(array_filter($scopes,fn($s)=>(int)$s['stage']===(int)substr($screen,-1)));
            if(isset($query['competition_id'])){$scopes=array_values(array_filter($scopes,fn($c)=>$c['id']===$query['competition_id']));if(!$scopes)return [403,'ไม่มีสิทธิ์เข้าถึงการแข่งขัน'];}
            if(isset($query['competition_id']))$context['ui_scope']=$scopes[0];
            $available=$scopes;foreach(['division_code','stage','province'] as $filter){$value=$query[$filter] ?? '';if(!is_string($value))return [400,'ตัวกรองไม่ถูกต้อง'];if($value!=='')$scopes=array_values(array_filter($scopes,fn($c)=>(string)$c[$filter]===$value));}
            if(isset($query['competition_id'])&&!$scopes)return [422,'ตัวกรองไม่ตรงกับการแข่งขันที่เลือก'];
            if($screen==='participants'){
                if($event&&$super&&!(new EventRepository($db))->get($event))return [404,'ไม่พบรายการ'];
                if(count($scopes)===1){$context['ui_scope']=$scopes[0];return RosterPages::render($db,$scopes[0]['id'],$path,'GET',[],$context);}
                $body=RosterPages::picker($scopes,$event).'<div class="notice">เลือกเขต/อำเภอและรุ่นแข่งขัน เพื่อแสดงทีมที่ผ่านเกณฑ์จากระบบลงทะเบียน</div>';
                if(!$scopes)$body.='<div class="empty">ยังไม่มีการแข่งขันในขอบเขตที่เข้าถึงได้</div>';
                return Application::page('จัดการทีมเข้าร่วม',$body,$path,$context);
            }
            $body='';if($event&&$super){$e=(new EventRepository($db))->get($event);if(!$e)return [404,'ไม่พบรายการ'];if($screen!=='dashboard')$body.=Ui::context($e);}
            if($screen==='dashboard'){
                $body.='<form class="context-panel" method="get"><div class="context-head"><b>ตัวกรองข้อมูลแดชบอร์ด</b><small>แสดงเฉพาะขอบเขตที่มีสิทธิ์</small></div><div class="card-b form-grid">';if($event)$body.='<input type="hidden" name="event_id" value="'.$event.'">';
                foreach(['division_code'=>['รุ่นอายุ',EventDraft::DIVISIONS],'stage'=>['Stage',['1'=>'Stage 1 ระดับอำเภอ','2'=>'Stage 2 ระดับจังหวัด']],'province'=>['พื้นที่',array_combine(array_values(array_unique(array_column($available,'province'))),array_values(array_unique(array_column($available,'province'))))]] as $key=>[$label,$choices]){$body.='<label class="field">'.$label.'<select name="'.$key.'"><option value="">ทั้งหมดที่มีสิทธิ์</option>';foreach($choices as $v=>$text)$body.='<option value="'.Ui::e($v).'" '.(($query[$key] ?? '')===(string)$v?'selected':'').'>'.Ui::e($text).'</option>';$body.='</select></label>';}$body.='<button class="btn btn-primary" type="submit">แสดงข้อมูล</button></div></form>';
                $teamCount=0;$today=0;$pending=0;$seenTeams=[];$counts=array_fill_keys(array_keys(EventDraft::DIVISIONS),0);$stageRows=[1=>[],2=>[]];
                foreach($scopes as $c){
                    $r=(new RosterRepository($db))->current($c['id']);
                    foreach($r['teams'] ?? [] as $t){$key=$c['event_id'].':'.$c['division_id'].':'.$t['source_team_id'];if(!isset($seenTeams[$key])){$seenTeams[$key]=true;$teamCount++;$counts[$c['division_code']]++;}}
                    $matches=(new MatchRepository($db))->list($c['id']);
                    foreach($matches as $m){if($m['scheduled_start']&&(new \DateTimeImmutable($m['scheduled_start']))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('Y-m-d')===(new \DateTimeImmutable('now',new \DateTimeZone('Asia/Bangkok')))->format('Y-m-d'))$today++;if($m['state']==='IN_PROGRESS')$pending++;}
                    $draw=$c['draw_version_id']?(new DrawRepository($db))->current($c['id']):null;$base='/phase2demo/competitions/'.$c['id'];$target=$base;$badge='b-amber';
                    if(in_array($c['event_status'],['CLOSED','ARCHIVED'],true)||in_array($c['status'],['COMPLETED','ARCHIVED'],true)){$status='รายการปิดแล้ว';$badge='b-purple';}
                    elseif(!$r||!$r['locked']){$status=(int)$c['stage']===1?'รอตรวจทีมที่อนุมัติ':'รอนำทีมผ่านจากรอบอำเภอ';$target=$base.'/draw/setup';}
                    elseif(!$draw){$status='พร้อมจับสลาก';$target=$base.'/draw/setup';$badge='b-green';}
                    elseif(!$draw['published_at']){$status='รอเผยแพร่ผลจับสลาก';$target=$base.'/draw/result';}
                    elseif($draw['automatic_qualifiers']||($matches&&!array_filter($matches,fn($m)=>$m['state']!=='COMPLETED'))){$status='ยืนยันผลครบแล้ว';$target=$base.'/bracket';$badge='b-green';}
                    elseif(array_filter($matches,fn($m)=>$m['state']==='IN_PROGRESS')){$status='กำลังแข่งขัน';$target=$base.'/matches';$badge='b-blue';}
                    elseif($matches&&!array_filter($matches,fn($m)=>$m['state']!=='SCHEDULED'&&$m['state']!=='COMPLETED')){$status='โปรแกรมการแข่งขันพร้อม';$target=$base.'/matches';$badge='b-green';}
                    else{$status='รอจัดตารางแข่งขัน';$target=$base.'/matches';}
                    $stageRows[(int)$c['stage']][]=['scope'=>$c,'teams'=>count($r['teams'] ?? []),'status'=>$status,'target'=>$target,'badge'=>$badge];
                }
                $body.='<div class="age-breakdown">';foreach($counts as $code=>$n)$body.='<div class="age-card"><small>'.EventDraft::DIVISIONS[$code].'</small><b>'.$n.' ทีม</b><span>รายชื่อในขอบเขตที่มีสิทธิ์</span></div>';$body.='</div>'.Ui::metrics(['การแข่งขัน'=>count($scopes),'ทีมในรายชื่อแข่งขัน'=>$teamCount,'การแข่งขันวันนี้'=>$today,'การแข่งขันกำลังดำเนินการ'=>$pending]);
                $body.=self::stageCards($stageRows,$query);
                return Application::page(Ui::SCREENS[$screen],$body,$path,$context);
            }
            $body.='<div class="card"><div class="card-h"><h3>เลือกการแข่งขัน · '.Ui::SCREENS[$screen].'</h3>'.($super?'<a class="btn btn-primary" href="/platform">หลังบ้านกลาง</a>':'').'</div><div class="table-wrap"><table><thead><tr><th>รายการ / ฤดูกาล</th><th>รุ่นอายุ</th><th>Stage / พื้นที่</th><th>ประเภทข้อมูล</th><th></th></tr></thead><tbody>';
            foreach($scopes as $c){$target=Ui::destination($screen,$c);if(in_array($screen,['match','lineups','results'],true))$target='/phase2demo/workspace/'.$screen.'?competition_id='.$c['id'];$body.='<tr><td><strong>'.Ui::e($c['event_name']).'</strong><small class="muted block">'.Ui::e($c['season']).'</small></td><td>'.EventDraft::DIVISIONS[$c['division_code']].'</td><td>Stage '.$c['stage'].' · '.Ui::e(implode(' · ',array_filter([$c['province'],$c['district']]))).'</td><td><span class="badge '.($c['is_test']?'b-amber':'b-green').'">'.($c['is_test']?'ข้อมูล Demo':'ข้อมูลจริง').'</span></td><td><a class="btn btn-light" href="'.Ui::e($target).'">เปิด</a></td></tr>';}
            if(!$scopes)$body.='<tr><td colspan="5" class="empty">ยังไม่มีการแข่งขันที่เข้าถึงได้'.($super?' · สร้างการแข่งขันย่อยจากหลังบ้านกลาง':' · รอผู้ดูแลมอบหมายสิทธิ์').'</td></tr>';
            $body.='</tbody></table></div></div>';
            if(isset($query['competition_id'])&&in_array($screen,['match','lineups','results'],true)){
                $scope=$scopes[0];$body=Ui::context($scope).'<div class="card"><div class="card-h"><h3>เลือกแมตช์ · '.Ui::SCREENS[$screen].'</h3></div><div class="card-b match-picker">';$draw=(new DrawRepository($db))->current($scope['id']);$names=array_column($draw['slots'] ?? [],'name','source_team_id');$matches=new MatchRepository($db);
                foreach($matches->list($scope['id']) as $m){$sides=$matches->resolved($m);$url='/phase2demo/competitions/'.$scope['id'].'/matches/'.$m['id'].match($screen){'lineups'=>'/lineups','results'=>'/results',default=>''};$body.='<a class="match-pick" href="'.$url.'"><span class="badge b-blue">M'.$m['number'].'</span> '.Ui::e($names[$sides['a'] ?? ''] ?? 'รอผู้ชนะ').' พบ '.Ui::e($names[$sides['b'] ?? ''] ?? 'รอผู้ชนะ').'<span>เปิด →</span></a>';}
                if(!$draw)$body.='<div class="notice">ยังไม่มีคู่แข่งขัน กรุณาล็อกรายชื่อและจับสลากก่อน</div>';$body.='</div></div>';
            }
            return Application::page(Ui::SCREENS[$screen],$body,$path,$context);
        }catch(\UnexpectedValueException){return [403,'ไม่มีสิทธิ์เข้าถึงการแข่งขัน'];}catch(\OutOfBoundsException){return [404,'ไม่พบการแข่งขัน'];}
    }
    private static function stageCards(array $stages,array $filters=[]):string
    {
        $html='<div class="grid grid-3 stage-status-grid" aria-label="งานตามขั้นตอนการแข่งขัน">';
        foreach([1,'allstar',2] as $stage){
            if($stage==='allstar'){$html.='<section class="card stage-status paused-stage" data-stage-summary="allstar"><div class="card-b"><div class="stage-status-head"><b>ออลสตาร์ · รอยืนยันกติกา</b><span class="badge b-amber">พักการใช้งาน</span></div><p class="muted">การคัดเลือกนักกีฬา โควตา และเอกสารโอนย้ายจะเปิดเมื่อยืนยันกติกาแล้ว</p></div></section>';continue;}
            $rows=$stages[$stage];$label=$stage===1?'ระดับอำเภอ':'ระดับจังหวัด';$html.='<section class="card stage-status" data-stage-summary="'.$stage.'"><div class="card-b"><div class="stage-status-head"><b>Stage '.$stage.' · '.$label.'</b><span class="badge b-blue">'.count($rows).' การแข่งขัน</span></div>';
            if(!$rows)$html.='<p class="muted">ยังไม่มีการแข่งขันในขอบเขตและตัวกรองที่เลือก</p>';
            foreach(array_slice($rows,0,3) as $row){$c=$row['scope'];$html.='<a class="stage-task" href="'.Ui::e($row['target']).'"><span class="badge '.$row['badge'].'">'.Ui::e($row['status']).'</span><strong>'.Ui::e(EventDraft::DIVISIONS[$c['division_code']]).' · '.Ui::e($c['district'] ?: $c['province']).'</strong><small>'.Ui::e($c['event_name']).' · '.$row['teams'].' ทีม</small></a>';}
            if(count($rows)>3){$query=http_build_query(array_intersect_key($filters,array_flip(['event_id','division_code','province'])));$html.='<p class="muted">และอีก '.(count($rows)-3).' การแข่งขัน</p><a class="btn btn-light" href="'.Ui::e('/phase2demo/workspace/stage'.$stage.($query!==''?'?'.$query:'')).'">ดูรายการทั้งหมด →</a>';}
            $html.='</div></section>';
        }
        return $html.'</div>';
    }

}
