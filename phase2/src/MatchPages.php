<?php
declare(strict_types=1);
namespace PMYC\Phase2;

require_once __DIR__.'/MatchDetailView.php';
require_once __DIR__.'/VenuePages.php';

final class MatchPages
{
    public const STATES=['UNSCHEDULED'=>'รอจัดตาราง','SCHEDULED'=>'จัดตารางแล้ว','POSTPONED'=>'เลื่อนการแข่งขัน','CANCELLED'=>'ยกเลิก','IN_PROGRESS'=>'กำลังแข่งขัน','COMPLETED'=>'จบการแข่งขัน'];
    public const OPERATIONS=['schedule'=>'จัดวันเวลาและสนาม','postpone'=>'เลื่อนการแข่งขัน','cancel'=>'ยกเลิกการแข่งขัน','start'=>'เริ่มการแข่งขัน','lineup_draft'=>'บันทึกร่างรายชื่อ','lineup_confirm'=>'ยืนยันรายชื่อ','result_draft'=>'บันทึกร่างผล','result_confirm'=>'ยืนยันผล'];
    public static function matches(string $path):bool{return $path==='/platform/venues'||(bool)preg_match('#^/phase2demo/(?:competitions/[a-f0-9-]{36}/matches(?:/[a-f0-9-]{36}(?:/lineups|/results)?)?|matches/[a-f0-9-]{36})$#Di',$path);}
    public static function render(string $path,string $method,array $input,array $context,array $query=[],?\PDO $db=null):array
    {
        $public=(bool)preg_match('#^/phase2demo/matches/([a-f0-9-]{36})$#Di',$path,$pm);
        $actor=$context['actor'];
        if(!$public && !$actor)return [403,'กรุณาเข้าสู่ระบบ'];
        if($public && $method!=='GET')return [405,'ไม่รองรับคำขอนี้'];
        if(!in_array($method,['GET','POST'],true))return [405,'ไม่รองรับคำขอนี้'];
        if($path==='/platform/venues' && ($actor['role'] ?? '')!=='SUPER_ADMIN')return [403,'ไม่มีสิทธิ์เข้าถึงหลังบ้านกลาง'];
        if($method==='POST' && (!is_string($input['_csrf'] ?? null)||empty($context['csrf'])||!hash_equals($context['csrf'],$input['_csrf'])))return [403,'ไม่สามารถยืนยันคำขอได้'];
        if(!$db&&!EventRepository::configured())return [503,'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน'];
        $db??=EventRepository::connect();$repo=new MatchRepository($db);$comps=new CompetitionRepository($db);
        if(!$repo->ready())return [503,'ยังไม่ได้ติดตั้งระบบตารางแข่งขัน'];
        try{
            if(preg_match('#^/phase2demo/competitions/([a-f0-9-]{36})/matches/([a-f0-9-]{36})/(lineups|results)$#Di',$path,$sub))return ResultPages::render($db,$sub[1],$sub[2],$sub[3],$path,$method,$input,$context,$query);
            if($path==='/platform/venues')return VenuePages::render($method,$input,$context,$query,$db);
            if($public){
                $match=$repo->publicMatch($pm[1]);if(!$match)return [404,'ไม่พบแมตช์ที่เผยแพร่'];$scope=$comps->get($match['competition_id']);
                $draw=(new DrawRepository($db))->current($scope['id']);
                if(!$draw || $draw['id']!==$match['draw_id'] || $scope['event_status']==='ARCHIVED'||$scope['status']==='ARCHIVED')return [404,'ไม่พบแมตช์ที่เผยแพร่'];
            }else{
                preg_match('#^/phase2demo/competitions/([a-f0-9-]{36})/matches(?:/([a-f0-9-]{36}))?$#Di',$path,$m);
                $scope=$comps->requireAccess($m[1],$actor);$draw=(new DrawRepository($db))->current($scope['id']);
                if(empty($m[2])){
                    if($method!=='GET')return [405,'ไม่รองรับคำขอนี้'];
                    return Application::page('ตารางการแข่งขัน',self::context($scope).($draw?self::table($repo,$draw,false):'<div class="notice">ยังไม่มีผลจับสลาก</div>'),$path,$context);
                }
                $match=$repo->get($m[2]);if(!$match || $match['competition_id']!==$scope['id'])return [404,'ไม่พบแมตช์'];
                $workspace=in_array((int)$scope['stage'],[1,2],true);
                if($workspace){
                    $event=(new EventRepository($db))->get($scope['event_id']);if(!$event)return [404,'ไม่พบรายการแข่งขัน'];
                    try{$filters=MatchDetailView::filters($scope,$event,$match,$query,$actor);$tab=MatchDetailView::tab($query);}
                    catch(\InvalidArgumentException $e){
                        $filters=MatchDetailView::filters($scope,$event,$match,[],$actor);
                        $body=WorkspaceView::heading('ตรวจข้อมูลการแข่งขัน').'<div class="notice" role="alert">'.self::e($e->getMessage()).'</div><a class="btn" href="'.self::e(MatchDetailView::url($path,$filters)).'">โหลดข้อมูลคู่แข่งขันที่ถูกต้อง</a>';
                        return WorkspaceView::page('detail',$body,$context,$filters,422);
                    }
                    if($method==='POST'){
                        try{$saved=$repo->execute($match['id'],$actor,$input);}
                        catch(\InvalidArgumentException|\DomainException $e){
                            $status=$e instanceof \InvalidArgumentException?422:409;
                            $match=$repo->get($match['id']) ?? $match;
                            return self::workspaceDetail($db,$repo,$comps,$scope,$match,$draw,$context,$filters,$path,($input['operation'] ?? '')==='schedule'?'schedule':$tab,
                                ['error'=>$e->getMessage(),'input'=>$input,'status'=>$status]);
                        }
                        $url=MatchDetailView::url($path,$filters,$tab);
                        if(($input['operation'] ?? '')==='schedule')$url.='&saved=schedule&saved_version='.(int)$saved['version'];
                        return [303,'',$url];
                    }
                    $feedback=($query['saved'] ?? null)==='schedule'&&($query['saved_version'] ?? null)===(string)$match['version']?['saved'=>true]:[];
                    return self::workspaceDetail($db,$repo,$comps,$scope,$match,$draw,$context,$filters,$path,$tab,$feedback);
                }
                if($method==='POST'){$repo->execute($match['id'],$actor,$input);return [303,'',$path];}
            }
            $detailBase='/phase2demo/competitions/'.$scope['id'].'/matches/'.$match['id'];
            $body=self::context($scope).(!$public?self::tabs($detailBase,'overview'):'').self::overview($repo,$match,$draw).'<div class="card"><div class="card-h"><h3>'.($public?'ข้อมูลการแข่งขัน':'จัดตารางและดำเนินการแข่งขัน').'</h3></div><div class="card-b">';
            $current=$draw && $match['draw_id']===$draw['id'];
            if(!$public && $current && CompetitionPolicy::can($actor,$scope,$comps->assignment($scope['id'],$actor),'schedule') && !$match['started_at'] && $match['state']!=='CANCELLED'){
                $drawStatus=(new DrawRepository($db))->ceremonyStatus($scope['event_id'],$draw['id']);
                if($drawStatus!==null&&$drawStatus!=='CONFIRMED_LOCKED')$body.='<div class="notice">ต้องยืนยันและล็อกผลจับสลากก่อนจัดตาราง</div>';
                elseif($drawStatus===null&&!$draw['published_at'])$body.='<div class="notice">ต้องเผยแพร่ผลจับสลากก่อนจัดตาราง</div>';
                else{
                    $body.='<form method="post" action="'.self::e($path).'">'.self::hidden($context,$match['version'],'schedule').'<div class="form-grid"><label class="field">สนาม<select required name="venue_id"><option value="">เลือกสนาม</option>';
                    foreach($repo->venues($scope['province']) as $venue)$body.='<option value="'.$venue['id'].'" '.($match['venue_id']===$venue['id']?'selected':'').'>'.self::e($venue['name']).' · '.self::e($venue['district']).'</option>';
                    $body.='</select></label><label class="field">เริ่ม (เวลาไทย)<input required type="datetime-local" name="start" value="'.self::local($match['scheduled_start']).'"></label><label class="field">สิ้นสุด (เวลาไทย)<input required type="datetime-local" name="end" value="'.self::local($match['scheduled_end']).'"></label><label class="field">เหตุผล<input required name="reason" maxlength="300"></label></div><p>ระบุเวลาครอบคลุมการแข่งขัน ระบบตรวจสนามและทีมที่อาจเข้ารอบไม่ให้ซ้อนกัน ข้อมูลจริงและ Demo แยกกัน</p><button class="btn btn-primary" type="submit">บันทึกตารางแข่งขัน</button></form>';
                    foreach(['postpone'=>'เลื่อนการแข่งขัน','cancel'=>'ยกเลิกการแข่งขัน','start'=>'เริ่มการแข่งขัน'] as $op=>$label){if(in_array($op,['start','postpone'],true)&&$match['state']!=='SCHEDULED')continue;$body.='<form method="post" action="'.self::e($path).'" class="draw-action">'.self::hidden($context,$match['version'],$op).'<label class="field">เหตุผล · '.$label.'<input required name="reason" maxlength="300"></label><button class="btn btn-light" type="submit">'.$label.'</button></form>';}
                }
            }
            $body.='</div></div>';
            if(class_exists(ResultPages::class))$body.=ResultPages::publicResult($db,$match['id']);
            if(!$public && $current)$body.='<div class="action-row"><a class="btn btn-primary" href="'.self::e($path).'/lineups">รายชื่อผู้เล่น</a><a class="btn btn-primary" href="'.self::e($path).'/results">บันทึกและยืนยันผล</a></div>';
            if(!$public){$body.='<details class="card"><summary>ประวัติการเปลี่ยนแมตช์</summary><ul>';foreach($repo->history($match['id']) as $h){$snapshot=json_decode($h['snapshot'],true);$body.='<li>v'.$h['version'].' · '.self::e(self::OPERATIONS[$h['operation']] ?? 'ปรับข้อมูลแมตช์').' · '.self::e($h['reason']).' · '.self::e($h['actor_id']).' · '.self::e($h['created_at']).'<br>'.self::time($snapshot['scheduled_start'] ?? null).' – '.self::time($snapshot['scheduled_end'] ?? null).' · '.self::e($snapshot['venue_name'] ?? 'รอจัดสนาม').'</li>';}$body.='</ul></details><a class="btn btn-light" href="/phase2demo/competitions/'.$scope['id'].'/matches">กลับตารางแข่งขัน</a>';}
            else $body.='<a class="btn btn-light" href="/phase2demo?mode='.($scope['is_test']?'demo':'real').'">กลับตารางการแข่งขัน</a>';
            return Application::page('รายละเอียดแมตช์',$body,$path,$context);
        }catch(\UnexpectedValueException){return [403,'ไม่มีสิทธิ์จัดการแมตช์นี้'];}catch(\OutOfBoundsException){return [404,'ไม่พบแมตช์'];}
        catch(\InvalidArgumentException $e){return Application::page('ตรวจข้อมูลแมตช์','<div class="notice">'.self::e($e->getMessage()).'</div><a href="'.self::e($path).'">กลับไปตรวจข้อมูล</a>',$path,$context,422);}
        catch(\DomainException $e){return Application::page('ข้อมูลแมตช์ขัดแย้ง','<div class="notice">'.self::e($e->getMessage()).'</div><a href="'.self::e($path).'">โหลดข้อมูลใหม่</a>',$path,$context,409);}
    }

    private static function workspaceDetail(\PDO $db,MatchRepository $repo,CompetitionRepository $comps,array $scope,array $match,?array $draw,array $context,array $filters,string $path,string $tab,array $feedback=[]):array
    {
        if(!$draw)return [404,'ไม่พบผลจับสลากของคู่แข่งขัน'];
        $actor=$context['actor'];$current=$match['draw_id']===$draw['id'];
        if(!$current)foreach((new DrawRepository($db))->history($scope['id']) as $past)if($past['id']===$match['draw_id']){$draw=$past;break;}
        $notice='';$status=$feedback['status'] ?? 200;
        if(isset($feedback['error'])){
            $notice='<div class="notice" role="alert"><strong>ยังไม่ได้บันทึกการเปลี่ยนแปลง</strong><p>'.self::e($feedback['error']).'</p>';
            if($status===409)$notice.='<p>ข้อมูลขัดแย้ง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขและบันทึกอีกครั้ง</p><a class="btn" href="'.self::e(MatchDetailView::url($path,$filters)).'">โหลดข้อมูลล่าสุด</a>';
            else $notice.='<p>กรุณาตรวจข้อมูลที่กรอกแล้วบันทึกอีกครั้ง</p>';
            $notice.='</div>';
        }elseif(!empty($feedback['saved']))$notice='<div class="notice" role="status">บันทึกตารางแข่งขันเรียบร้อยแล้ว</div>';
        $value=static function(string $key,string $fallback)use($feedback):string{
            if(!isset($feedback['input']))return $fallback;
            $v=$feedback['input'][$key] ?? '';return is_string($v)&&strlen($v)<=2000?$v:'';
        };
        $selectedVenue=$value('venue_id',(string)($match['venue_id'] ?? ''));
        $formVersion=$match['version'];$submittedVersion=$feedback['input']['version'] ?? null;
        // A 422 can occur before execute checks the version; never silently rebase stale input.
        if(is_scalar($submittedVersion)&&preg_match('/^[0-9]{1,8}$/D',(string)$submittedVersion))$formVersion=(int)$submittedVersion;
        $body='';$sides=$repo->resolved($match);
        if($tab==='schedule'){
            $publication=$repo->schedulePublication($match);
            [$scheduleKey,$scheduleLabel,$scheduleDetail]=SchedulePages::describe($match,$publication);
            $badgeClass=match($scheduleKey){'ready'=>'pending','published'=>'locked','changed'=>'changed','cancelled'=>'cancelled',default=>''};
            $badgeText=match($scheduleKey){'ready'=>'พร้อมเผยแพร่','published'=>'จัดตารางและเผยแพร่แล้ว','changed'=>'เปลี่ยนแปลงการแข่งขัน','cancelled'=>'ยกเลิกการแข่งขัน',default=>'รอจัดตาราง'};

            $body='<section class="card"><div class="card-head"><div><h2>กำหนดการแข่งขัน</h2><p>บันทึกวัน เวลา และสนามของคู่นี้</p></div><span class="badge '.$badgeClass.'">'.self::e($badgeText).'</span></div>';
            $canForm=false;
            if(!$sides['a']||!$sides['b']){
                $body.='<div class="card-b"><div class="notice warning">รอทีมผ่านเข้ารอบ จึงยังไม่เปิดให้บันทึกกำหนดการแข่งขัน</div></div>';
            }elseif(!$current){
                $body.='<div class="card-b"><div class="notice warning">คู่แข่งขันนี้อยู่ในผลจับสลากฉบับก่อนหน้า เปิดดูได้เท่านั้น</div></div>';
            }elseif($match['started_at']||$match['state']==='CANCELLED'){
                $body.='<div class="card-b"><div class="notice warning">ไม่เปิดให้แก้ไขกำหนดการแข่งขันในสถานะนี้</div></div>';
            }elseif(CompetitionPolicy::can($actor,$scope,$comps->assignment($scope['id'],$actor),'schedule')){
                $drawStatus=(new DrawRepository($db))->ceremonyStatus($scope['event_id'],$draw['id']);
                if($drawStatus!==null&&$drawStatus!=='CONFIRMED_LOCKED')$body.='<div class="card-b"><div class="notice warning">ต้องยืนยันและล็อกผลจับสลากก่อนจัดตาราง</div></div>';
                elseif($drawStatus===null&&!$draw['published_at'])$body.='<div class="card-b"><div class="notice warning">ต้องเผยแพร่ผลจับสลากก่อนจัดตาราง</div></div>';
                else{
                    $canForm=true;
                    $isFirstSchedule=$match['scheduled_start']===null;
                    $defaultIso=$match['scheduled_start'] ?? (new \DateTimeImmutable('now',new \DateTimeZone('Asia/Bangkok')))->format('c');
                    [$defDateTh,$defTime]=self::thaiDateAndTime($defaultIso);
                    $startDateTh=$value('start_date_th',$defDateTh);
                    $body.='<form method="post" action="'.self::e(MatchDetailView::url($path,$filters)).'">'.self::hidden($context,$formVersion,'schedule').'<div class="card-b"><fieldset class="match-schedule-fieldset"'.($status===409?' disabled':'').'><div class="form-grid"><label class="field">สนามแข่งขัน<select required name="venue_id"><option value="">เลือกสนาม</option>';
                    foreach($repo->venues($scope['province']) as $venue)$body.='<option value="'.$venue['id'].'" '.($selectedVenue===$venue['id']?'selected':'').'>'.self::e($venue['name']).' · '.self::e($venue['district']).'</option>';
                    $body.='</select></label><div class="field"><label for="match-start-date-th">เวลาเริ่มแข่งขัน (เวลาไทย)</label><div class="thai-date-wrap"><input id="match-start-date-th" class="thai-date-input" required readonly type="text" name="start_date_th" placeholder="เลือกวันที่จากปฏิทิน" value="'.self::e($startDateTh).'" data-thai-date-input></div></div>';
                    if(!$isFirstSchedule)$body.='<label class="field">เหตุผลในการแก้ไขตาราง (จำเป็น)<input required name="reason" maxlength="300" value="'.self::e($value('reason','')).'"></label>';
                    $body.='</div></fieldset>';
                    if($publication){
                        $snap=$publication['snapshot'] ?? null;
                        $pubTime=self::time($snap['scheduled_start'] ?? $match['scheduled_start']).' · '.self::e($snap['venue_name'] ?? $match['venue_name'] ?? 'ยังไม่กำหนดสนาม');
                        $body.='<div class="notice success"><strong>ข้อมูลที่เผยแพร่ล่าสุด</strong><p>'.$pubTime.($scheduleKey==='changed'?' — กำหนดใหม่ยังไม่เผยแพร่':'').'</p></div>';
                    }else{
                        $body.='<div class="notice"><strong>บันทึกแล้วต้องเผยแพร่แยกต่างหาก</strong><p>หลังบันทึกครบ คู่แข่งขันจะพร้อมเผยแพร่ ให้กลับไปเลือกเผยแพร่จากตารางการแข่งขัน</p></div>';
                    }
                    $body.='</div><div class="panel-action"><p>'.($scheduleKey==='changed'?'ตรวจทานกำหนดใหม่ก่อนเผยแพร่อีกครั้ง':'ข้อมูลจะบันทึกเป็นร่างก่อนเผยแพร่').'</p><div class="actions"><button class="btn primary" type="submit">บันทึกกำหนดการแข่งขัน</button></div></div></form>';
                }
            }else{
                $body.='<div class="card-b"><div class="notice">บัญชีนี้เปิดดูได้อย่างเดียว</div></div>';
            }
            $body.='</section>';
            if($canForm&&$status!==409&&$match['scheduled_start']!==null){
                $opForms='';
                foreach(['postpone'=>'เลื่อนการแข่งขัน','cancel'=>'ยกเลิกการแข่งขัน','start'=>'เริ่มการแข่งขัน'] as $op=>$label){
                    if(in_array($op,['start','postpone'],true)&&$match['state']!=='SCHEDULED')continue;
                    if($op==='cancel'&&!in_array($match['state'],['SCHEDULED','POSTPONED'],true))continue;
                    $opForms.='<form method="post" action="'.self::e(MatchDetailView::url($path,$filters)).'" class="draw-action">'.self::hidden($context,$match['version'],$op).'<label class="field">เหตุผล · '.$label.'<input required name="reason" maxlength="300"></label><button class="btn btn-light" type="submit">'.$label.'</button></form>';
                }
                if($opForms!=='')$body.='<section class="card"><div class="card-head"><div><h2>ปรับสถานะการแข่งขัน</h2><p>เลื่อน ยกเลิก หรือเริ่มการแข่งขันคู่นี้</p></div></div><div class="card-b">'.$opForms.'</div></section>';
            }
            $body.='<section class="card"><div class="card-head"><div><h2>งานหลังการแข่งขัน</h2><p>บันทึกจากเอกสารกระดาษ แล้วตรวจสอบและยืนยันทั้งชุด</p></div></div><div class="card-b"><div class="actions"><a class="btn" href="'.self::e(MatchDetailView::url($path.'/results',$filters)).'">'.WorkspaceView::icon('file').'บันทึกรายชื่อและผลการแข่งขัน '.WorkspaceView::icon('arrow').'</a></div></div></section>';
        }elseif($tab==='post'){
            $official=$repo->officialResult($match['id']);
            $stepLineupMark=$official?'✓':'–';
            $stepResultMark=$official?'✓':'2';
            $body='<nav class="post-steps" aria-label="ขั้นตอนบันทึกข้อมูลหลังแข่งขัน">'
                .'<a class="post-step" href="'.self::e(MatchDetailView::url($path.'/lineups',$filters)).'"><span>'.$stepLineupMark.'</span>รายชื่อผู้เล่น (ไม่บังคับ)</a>'
                .'<a class="post-step active" href="'.self::e(MatchDetailView::url($path.'/results',$filters)).'"><span>'.$stepResultMark.'</span>ผลการแข่งขัน</a>'
                .'<a class="post-step" href="'.self::e(MatchDetailView::url($path.'/results',$filters)).'"><span>3</span>ตรวจสอบและยืนยัน</a>'
                .'</nav>'
                .'<section class="card"><div class="card-head"><div><h2>ข้อมูลหลังการแข่งขัน</h2><p>บันทึกจากเอกสารกระดาษ แล้วตรวจสอบและยืนยันทั้งชุด</p></div></div><div class="card-b">'.ResultPages::publicResult($db,$match['id']);
            if($current)$body.='<div class="action-row"><a class="btn" href="'.self::e(MatchDetailView::url($path.'/lineups',$filters)).'">รายชื่อผู้เล่น</a><a class="btn primary" href="'.self::e(MatchDetailView::url($path.'/results',$filters)).'">บันทึกและยืนยันผล</a></div>';
            $body.='</div></section>';
        }else{
            $body='<section class="card"><div class="card-head"><h2>ประวัติของคู่แข่งขันนี้</h2></div><div class="timeline">';
            $history=$repo->history($match['id']);
            foreach($history as $h){
                $snapshot=json_decode($h['snapshot'],true);
                $schedStr=self::time($snapshot['scheduled_start'] ?? null).' · '.self::e($snapshot['venue_name'] ?? 'รอจัดสนาม');
                $body.='<div class="event"><span class="event-dot"></span><div><b>v'.$h['version'].' · '.self::e(self::OPERATIONS[$h['operation']] ?? 'ปรับข้อมูลแมตช์').'</b>'
                    .'<p>'.self::e(self::time($h['created_at'] ?? null)).' · '.self::e($h['actor_id']).'</p>'
                    .'<p>'.self::e($h['reason']).' · '.$schedStr.'</p></div></div>';
            }
            if(!$history)$body.='<p class="small muted" style="padding:16px 22px">ยังไม่มีการดำเนินการ</p>';
            $body.='</div></section>';
        }
        return MatchDetailView::page($notice.$body,$scope,$match,$draw,$repo->resolved($match),$repo->officialResult($match['id']),$context,$filters,$path,$tab,$status);
    }

    public static function table(MatchRepository $repo,array $draw,bool $public=true,bool $resultsOnly=false):string
    {
        $names=array_column($draw['slots'],'name','source_team_id');$html='<div class="table-wrap"><table class="match-table"><thead><tr><th>แมตช์</th><th>วันที่</th><th>เวลา</th><th>สนาม</th><th>ทีมเหย้า</th><th>ทีมเยือน</th><th>สถานะ</th><th>ผล</th><th></th></tr></thead><tbody>';$count=0;
        foreach($repo->list($draw['competition_id'],$public) as $m){
            if($resultsOnly&&!$m['confirmed_result_id'])continue;$count++;
            $a=json_decode($m['side_a'],true);$b=json_decode($m['side_b'],true);$resolved=$repo->resolved($m);$label=fn($side,$team)=>$team!==null?Ui::team($names[$team] ?? ''):($side['type']==='team'?Ui::team($names[$side['source_team_id']] ?? ''):'ผู้ชนะ M'.$side['match']);
            $official=$repo->officialResult($m['id']);$score=$official?$official['result']['total_a'].' – '.$official['result']['total_b']:'—';$url=$public?'/phase2demo/matches/'.$m['id']:'/phase2demo/competitions/'.$m['competition_id'].'/matches/'.$m['id'];
            $start=$m['scheduled_start']?(new \DateTimeImmutable($m['scheduled_start']))->setTimezone(new \DateTimeZone('Asia/Bangkok')):null;$end=$m['scheduled_end']?(new \DateTimeImmutable($m['scheduled_end']))->setTimezone(new \DateTimeZone('Asia/Bangkok')):null;
            $badge=match($m['state']){'COMPLETED'=>'b-green','IN_PROGRESS'=>'b-blue','CANCELLED'=>'b-red',default=>'b-amber'};
            $html.='<tr><td>M'.$m['number'].'</td><td>'.($start?$start->format('d/m/Y'):'รอจัดวัน').'</td><td>'.($start?$start->format('H:i').' – '.$end->format('H:i'):'รอจัดเวลา').'</td><td>'.self::e($m['venue_name'] ?? 'รอจัดสนาม').'</td><td>'.$label($a,$resolved['a']).'</td><td>'.$label($b,$resolved['b']).'</td><td><span class="badge '.$badge.'">'.self::e(self::STATES[$m['state']]).'</span></td><td>'.self::e($score).'</td><td><a class="btn btn-light" href="'.$url.'">เปิด</a></td></tr>';
        }
        if(!$count)$html.='<tr><td colspan="9" class="empty">'.($resultsOnly?'ยังไม่มีผลการแข่งขันที่ยืนยัน':'ยังไม่มีคู่แข่งขันในผลจับสลากนี้').'</td></tr>';
        return $html.'</tbody></table></div>';
    }
    public static function overview(MatchRepository $repo,array $match,array $draw):string
    {
        $names=array_column($draw['slots'] ?? [],'name','source_team_id');$sides=$repo->resolved($match);$official=$repo->officialResult($match['id']);$score=$official?$official['result']['total_a'].' : '.$official['result']['total_b']:'— : —';
        $badge=match($match['state']){'COMPLETED'=>'b-green','IN_PROGRESS'=>'b-blue','CANCELLED'=>'b-red',default=>'b-amber'};
        $html='<div class="card match-overview"><div class="card-h"><h3>M'.$match['number'].' · รอบที่ '.$match['round'].'</h3><span class="badge '.$badge.'">'.self::e(self::STATES[$match['state']]).'</span></div><div class="card-b"><div class="scorebox"><div class="score-team"><strong>'.self::e($names[$sides['a'] ?? ''] ?? 'รอผู้ชนะรอบก่อนหน้า').'</strong><small>ทีมเหย้า</small></div><div class="score">'.$score.'</div><div class="score-team"><strong>'.self::e($names[$sides['b'] ?? ''] ?? 'รอผู้ชนะรอบก่อนหน้า').'</strong><small>ทีมเยือน</small></div></div><div class="audit">';
        foreach(['เริ่มแข่งขัน'=>self::time($match['scheduled_start']),'สิ้นสุด'=>self::time($match['scheduled_end']),'สนาม'=>$match['venue_name'] ?? 'รอจัดสนาม','สถานะ'=>self::STATES[$match['state']]] as $label=>$value)$html.='<div class="audit-item"><small>'.$label.'</small><strong>'.self::e($value).'</strong></div>';
        return $html.'</div></div></div>';
    }
    public static function tabs(string $base,string $active):string
    {
        $html='<nav class="tabs" aria-label="รายละเอียดแมตช์">';foreach(['overview'=>'ภาพรวม','lineups'=>'รายชื่อผู้เล่น','results'=>'ผลการแข่งขัน'] as $key=>$label)$html.='<a class="tab '.($key===$active?'active':'').'" href="'.$base.($key==='overview'?'':'/'.$key).'">'.$label.'</a>';return $html.'</nav>';
    }
    private static function hidden(array $context,int $version=0,string $operation=''):string{return '<input type="hidden" name="_csrf" value="'.self::e($context['csrf']).'"><input type="hidden" name="request_id" value="'.EventRepository::uuid().'"><input type="hidden" name="version" value="'.$version.'"><input type="hidden" name="operation" value="'.$operation.'">';}
    private static function context(array $s):string{return Ui::context($s);}
    private static function local(?string $s):string{return $s?(new \DateTimeImmutable($s))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('Y-m-d\TH:i'):'';}
    private static function time(?string $s):string
    {
        if(!$s)return 'ยังไม่กำหนด';
        $dt=(new \DateTimeImmutable($s))->setTimezone(new \DateTimeZone('Asia/Bangkok'));
        $month=self::THAI_MONTH_NAMES[(int)$dt->format('n')] ?? $dt->format('m');
        return $dt->format('j').' '.$month.' '.((int)$dt->format('Y')+543);
    }
    private const THAI_MONTH_NAMES=[1=>'มกราคม',2=>'กุมภาพันธ์',3=>'มีนาคม',4=>'เมษายน',5=>'พฤษภาคม',6=>'มิถุนายน',7=>'กรกฎาคม',8=>'สิงหาคม',9=>'กันยายน',10=>'ตุลาคม',11=>'พฤศจิกายน',12=>'ธันวาคม'];
    private static function adDate(?string $iso,string $dateTh=''):string
    {
        $clean=preg_replace('/\s+/u',' ',trim($dateTh));
        $parts=str_contains($clean,'/')?explode('/',$clean):explode(' ',$clean);
        if(count($parts)===3&&preg_match('/^\d{1,2}$/',$parts[0])&&preg_match('/^\d{4}$/',$parts[2])){
            $m=preg_match('/^\d{1,2}$/',$parts[1])?(int)$parts[1]:(array_search($parts[1],self::THAI_MONTH_NAMES,true)?:0);
            $y=(int)$parts[2]-543;
            if($y>=1970&&$m>=1&&$m<=12&&checkdate($m,(int)$parts[0],$y))return sprintf('%04d-%02d-%02d',$y,$m,(int)$parts[0]);
        }
        if(!$iso)return '';
        return (new \DateTimeImmutable($iso))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('Y-m-d');
    }
    private static function thaiDateAndTime(?string $s):array
    {
        if(!$s)return ['',''];
        $dt=(new \DateTimeImmutable($s))->setTimezone(new \DateTimeZone('Asia/Bangkok'));
        $month=self::THAI_MONTH_NAMES[(int)$dt->format('n')] ?? $dt->format('m');
        return [$dt->format('j').' '.$month.' '.((int)$dt->format('Y')+543),$dt->format('H:i')];
    }
    private static function e(?string $s):string{return htmlspecialchars($s ?? '',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
}
