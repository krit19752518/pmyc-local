<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** v16 schedule list and selected publication workflow. */
final class SchedulePages
{
    public const PATH='/phase2demo/workspace/pending-schedule';
    private const FILTERS=['all','waiting','scheduled','postponed','cancelled','ready','published','changed'];

    public static function render(string $method,array $query,array $input,array $context,?\PDO $db=null):array
    {
        $actor=$context['actor'] ?? null;
        if(!in_array($actor['role'] ?? '',['SUPER_ADMIN','SAT_OFFICER','DOCUMENT_VERIFIER'],true))return [403,'ไม่มีสิทธิ์เข้าถึงระบบจัดการแข่งขัน'];
        if(!in_array($method,['GET','POST'],true))return [405,'ไม่รองรับคำขอนี้'];
        if($method==='POST'&&(!is_string($input['_csrf'] ?? null)||empty($context['csrf'])||!hash_equals($context['csrf'],$input['_csrf'])))return [403,'ไม่สามารถยืนยันคำขอได้'];
        $filters=[];
        try{
            $filters=DashboardReadModel::query($query,$actor);
            if(!$db&&!EventRepository::configured())return self::notice($context,$filters,'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน',503);
            $db??=EventRepository::connect();
            $model=(new DashboardReadModel($db))->load($actor,$query);
            if($method==='GET')$model['filter_input']=$filters['competition_id']!==''?$model['filters']:$filters;
            $filters=DashboardPages::filterValues($model,'schedule');$filters['match_id']='';
            $status=$query['schedule_state'] ?? 'all';
            if(!is_string($status)||!in_array($status,self::FILTERS,true))throw new \InvalidArgumentException('ตัวกรองสถานะตารางไม่ถูกต้อง');
            $complete=$filters['season_id']!==''&&$filters['event_id']!==''&&$filters['division_code']!==''&&$filters['province']!==''
                &&($filters['stage']==='2'||($filters['stage']==='1'&&$filters['district']!==''));
            $competitions=new CompetitionRepository($db);
            if($filters['competition_id']!=='')$scope=$competitions->requireAccess($filters['competition_id'],$actor);
            elseif($complete){$scope=$competitions->findDrawScope($filters);if($scope)$scope=$competitions->requireAccess($scope['id'],$actor);}
            else return self::page($context,$filters,DashboardPages::filters($model,$actor,'schedule').'<div class="notice warning" role="status"><p>เลือกจังหวัดและอำเภอ/เขต หรือระบุรายการแข่งขัน เพื่อดูตาราง</p></div>');
            if(!$scope)return self::page($context,$filters,DashboardPages::filters($model,$actor,'schedule').'<div class="empty card"><h2>ยังไม่มีการแข่งขันในขอบเขตนี้</h2><p>ตรวจสอบรุ่นอายุ ระดับ และพื้นที่ที่เลือก</p></div>');
            self::bind($filters,$scope);
            if(!in_array((int)$scope['stage'],[1,2],true))throw new \InvalidArgumentException('ตารางนี้รองรับ Stage 1–2');
            if($method==='POST'){
                if(!CompetitionPolicy::can($actor,$scope,$competitions->assignment($scope['id'],$actor),'schedule'))throw new \UnexpectedValueException('บัญชีนี้ไม่มีสิทธิ์จัดตารางในการแข่งขันนี้');
                $matches=new MatchRepository($db);
                if(($input['operation'] ?? '')==='publish_selected')$matches->publishBatch($scope['id'],$actor,$input,false);
                elseif(($input['operation'] ?? '')==='republish_one')$matches->publishBatch($scope['id'],$actor,$input,true);
                else throw new \InvalidArgumentException('ไม่รู้จักการดำเนินการตารางแข่งขัน');
                return [303,'',self::url($filters,$status)];
            }
            $event=(new EventRepository($db))->get($scope['event_id']);if(!$event)throw new \OutOfBoundsException('ไม่พบรายการแข่งขัน');
            $draws=new DrawRepository($db);$draw=$draws->current($scope['id']);
            return self::page($context,$filters,self::content($db,$actor,$scope,$filters,$model,$draw,$draws,$status,$context['csrf'] ?? ''));
        }catch(\InvalidArgumentException $e){return self::notice($context,$filters,$e->getMessage(),400);}
        catch(\UnexpectedValueException $e){return self::notice($context,$filters,$e->getMessage(),403);}
        catch(\OutOfBoundsException $e){return self::notice($context,$filters,$e->getMessage(),404);}
        catch(\DomainException $e){return self::notice($context,$filters,$e->getMessage(),409);}
        catch(\PDOException|\RuntimeException $e){error_log('Workspace schedule failed: '.get_class($e));return self::notice($context,$filters,'ไม่สามารถอ่านหรือบันทึกตารางได้ กรุณาลองใหม่',503);}
    }

    private static function content(\PDO $db,array $actor,array $scope,array $filters,array $model,?array $draw,DrawRepository $draws,string $filter,string $csrf):string
    {
        $e=WorkspaceView::e(...);$html='';
        $html.=DashboardPages::filters($model,$actor,'schedule');
        $status=$draw?$draws->ceremonyStatus($scope['event_id'],$draw['id']):null;
        $locked=in_array($status,['CONFIRMED_LOCKED','ACTIVE'],true)||($status===null&&$draw&&$draw['published_at']);
        if(!$draw){$html.='<div class="notice warning" role="status"><p>ยังไม่มีผลจับสลาก จึงยังไม่มีคู่แข่งขันสำหรับจัดตาราง</p><a href="'. $e(WorkspaceView::url('ceremony',$filters)).'">ไปที่พิธีจับสลาก</a></div>';return $html;}
        if(!$locked)$html.='<div class="notice warning" role="status"><p>เปิดทีมในพิธีจับสลากให้ครบ แล้วจึงกำหนดวัน เวลา และสนามได้</p><a href="'. $e(WorkspaceView::url('result',$filters)).'">ไปเปิดผลการจับสลาก</a></div>';
        $repo=new MatchRepository($db);$rows=$repo->list($scope['id']);$names=array_column($draw['slots'],'name','source_team_id');$can=CompetitionPolicy::can($actor,$scope,(new CompetitionRepository($db))->assignment($scope['id'],$actor),'schedule');
        $decorated=[];$publishedList=[];
        foreach($rows as $match){$sideA=json_decode($match['side_a'],true,512,JSON_THROW_ON_ERROR);$sideB=json_decode($match['side_b'],true,512,JSON_THROW_ON_ERROR);$resolved=$repo->resolved($match);
            $publication=$repo->schedulePublication($match);$same=$publication&&$publication['snapshot']?self::sameSchedule($match,$publication['snapshot']):false;
            [$key,$label,$detail]=self::state($match,$publication,$same);
            [$schedulingKey,$schedulingLabel]=self::scheduling($match);
            $teamA=$resolved['a']?($names[$resolved['a']] ?? 'ทีมที่ผ่านเข้ารอบ'):self::sideLabel($sideA,$names);
            $teamB=$resolved['b']?($names[$resolved['b']] ?? 'ทีมที่ผ่านเข้ารอบ'):self::sideLabel($sideB,$names);
            $match['schedule_key']=$key;$match['schedule_label']=$label;$match['schedule_detail']=$detail;$match['home']=$teamA;$match['away']=$teamB;
            $match['scheduling_key']=$schedulingKey;$match['scheduling_label']=$schedulingLabel;
            $match['publication']=$publication;
            if($publication){
                $snap=$publication['snapshot'] ?? null;
                $pubStart=$snap['scheduled_start'] ?? $match['scheduled_start'];
                $pubEnd=$snap['scheduled_end'] ?? $match['scheduled_end'];
                $pubVenue=$snap['venue_name'] ?? $match['venue_name'] ?? 'ยังไม่กำหนดสนาม';
                $publishedList[]=['number'=>$match['number'],'home'=>$teamA,'away'=>$teamB,'start'=>$pubStart,'end'=>$pubEnd,'venue'=>$pubVenue];
            }
            if($filter!=='all'&&$filter!==(in_array($filter,['waiting','scheduled','postponed','cancelled'],true)?$schedulingKey:$key))continue;
            $decorated[]=$match;
        }
        $base='/phase2demo/competitions/'.$scope['id'].'/matches/';
        $scopeSubtitle=implode(' · ',array_filter([$scope['event_name'],EventDraft::DIVISIONS[$scope['division_code']] ?? $scope['division_code'],$scope['district'],$scope['province']]));
        $filterForm='<form id="schedule-status-form" class="schedule-inline-form" method="get" action="'.self::PATH.'">';
        foreach($filters as $key=>$value)if($value!=='')$filterForm.='<input type="hidden" name="'.$e($key).'" value="'.$e($value).'">';
        $filterForm.='<select class="inline-filter" id="schedule-state" name="schedule_state" aria-label="กรองสถานะตาราง"><option value="all"'.($filter==='all'?' selected':'').'>ทุกสถานะตาราง</option>';
        foreach(['สถานะตารางการแข่งขัน'=>['waiting'=>'รอจัดตาราง','scheduled'=>'จัดตารางแล้ว','postponed'=>'เลื่อนการแข่งขัน','cancelled'=>'ยกเลิกการแข่งขัน'],'การเผยแพร่'=>['ready'=>'ยังไม่เผยแพร่','published'=>'เผยแพร่แล้ว','changed'=>'เปลี่ยนแปลงการแข่งขัน']] as $group=>$options){
            $filterForm.='<optgroup label="'.$e($group).'">';
            foreach($options as $key=>$label)$filterForm.='<option value="'.$e($key).'"'.($filter===$key?' selected':'').'>'.$e($label).'</option>';
            $filterForm.='</optgroup>';
        }
        $filterForm.='</select><noscript><button class="btn compact" type="submit">กรอง</button></noscript></form>';
        $html.='<section class="card"><div class="card-head"><div><h2>รายการแข่งขัน <span class="muted small">'.count($rows).' คู่</span></h2><p>'.$e($scopeSubtitle).'</p></div>'.$filterForm.'</div>';
        if($can&&$locked){
            $html.='<form id="schedule-publish-form" method="post" action="'.$e(self::url($filters,$filter)).'"><input type="hidden" name="_csrf" value="'.$e($csrf).'"><input type="hidden" name="operation" value="publish_selected"></form>'
                .'<div class="selection-bar"><div><input type="checkbox" id="select-all" data-schedule-select-all aria-label="เลือกทั้งหมดที่พร้อมเผยแพร่"> <label for="select-all">เลือกคู่ที่พร้อมเผยแพร่</label> <span class="muted" id="selected-count">· เลือก 0 คู่</span></div>'
                .'<button class="btn primary" type="submit" form="schedule-publish-form" data-schedule-publish disabled>'.WorkspaceView::icon('eye').'เผยแพร่ที่เลือก</button></div>';
        }
        $html.='<div class="table-wrap"><table class="schedule-table"><thead><tr><th style="width:45px"></th><th>คู่ / รอบ</th><th>ทีมแข่งขัน</th><th>กำหนดการแข่งขัน</th><th>สถานะตาราง</th><th></th></tr></thead><tbody>';
        $maxRound=0;
        foreach($rows as $rm)$maxRound=max($maxRound,(int)$rm['round']);
        $roundLabel=static function(int $r,int $max):string{
            if($max>=3){
                if($r===$max)return 'รอบชิงชนะเลิศ';
                if($r===$max-1)return 'รอบรองชนะเลิศ';
                if($r===$max-2)return 'รอบก่อนรองชนะเลิศ';
            }
            return 'รอบที่ '.$r;
        };
        $teamHtml=static function(string $name,bool $alt=false)use($e):string{
            $pending=str_starts_with($name,'รอ')||str_starts_with($name,'ผู้ชนะ');
            if($pending)return '<span class="muted">'.$e($name).'</span>';
            $clean=trim((string)preg_replace('/^[A-Z]\d+\s*·\s*/u','',$name));
            $text=$clean !== '' ? $clean : $name;
            $initial=preg_match('/^./u',$text,$m)?$m[0]:substr($text,0,1);
            return '<span class="mini-crest'.($alt?' alt':'').'" aria-hidden="true">'.$e($initial).'</span><strong>'.$e($text).'</strong>';
        };
        foreach($decorated as $match){$detail=MatchDetailView::url($base.$match['id'],$filters);
            $isReady=$can&&$locked&&$match['schedule_key']==='ready';
            $whenPlain=$match['scheduled_start']?self::thaiDate($match['scheduled_start']).' · '.self::clockOnly($match['scheduled_start']).' · '.($match['venue_name'] ?? 'ยังไม่กำหนดสนาม'):'ยังไม่กำหนดวัน เวลา และสนาม';
            $checkbox=$isReady
                ?'<input form="schedule-publish-form" type="hidden" name="versions['.$e($match['id']).']" value="'.$e((string)$match['version']).'"><input form="schedule-publish-form" type="hidden" name="request_ids['.$e($match['id']).']" value="'.$e(EventRepository::uuid()).'"><input form="schedule-publish-form" type="checkbox" name="match_ids[]" value="'.$e($match['id']).'" data-schedule-select data-match-label="'.$e('M'.$match['number'].' · '.$match['home'].' พบ '.$match['away']).'" data-match-when="'.$e($whenPlain).'" aria-label="เลือกคู่ M'.$e($match['number']).'">'
                :'<input type="checkbox" disabled aria-label="เลือกคู่ M'.$e($match['number']).'">';
            $whenCell=$match['scheduled_start']
                ?$e(self::thaiDate($match['scheduled_start'])).'<small>'.$e(self::clockOnly($match['scheduled_start'])).' · '.$e($match['venue_name'] ?? 'ยังไม่กำหนดสนาม').'</small>'
                :'<span class="muted">ยังไม่กำหนด</span>';
            $statusBadgeClass=in_array($match['scheduling_key'],['cancelled','postponed'],true)?($match['scheduling_key']==='cancelled'?'cancelled':'changed'):self::badge($match['schedule_key']);
            $statusLabel=in_array($match['scheduling_key'],['cancelled','postponed'],true)
                ?$match['scheduling_label']
                :match($match['schedule_key']){
                    'ready'=>'พร้อมเผยแพร่',
                    'published'=>'จัดตารางและเผยแพร่แล้ว',
                    'changed'=>'เปลี่ยนแปลงการแข่งขัน',
                    default=>'รอจัดตาราง',
                };
            $statusDetail=in_array($match['scheduling_key'],['cancelled','postponed'],true)?'':($match['schedule_key']==='ready'?'':$match['schedule_detail']);
            $html.='<tr><td>'.$checkbox.'</td><td><strong>M'.str_pad((string)$match['number'],2,'0',STR_PAD_LEFT).'</strong><small>'.$e($roundLabel((int)$match['round'],$maxRound)).'</small></td>'
                .'<td><div class="match-teams">'.$teamHtml($match['home'],false).'<span class="versus">VS</span>'.$teamHtml($match['away'],true).'</div></td><td>'.$whenCell.'</td>'
                .'<td><span class="badge '.$statusBadgeClass.'">'.$e($statusLabel).'</span>'.($statusDetail!==''?'<small class="publication-note">'.$e($statusDetail).'</small>':'').'</td>'
                .'<td class="align-right"><a class="btn text compact" href="'.$e($detail).'">รายละเอียด '.WorkspaceView::icon('arrow').'</a></td></tr>';
        }
        if(!$decorated)$html.='<tr><td colspan="6" class="empty">ไม่พบคู่แข่งขันในสถานะที่เลือก</td></tr>';
        $html.='</tbody></table></div><div class="table-footer"><span>แสดง '.count($decorated).' จาก '.count($rows).' คู่</span><span>การบันทึกกำหนดการแข่งขันยังไม่เผยแพร่สู่สาธารณะ</span></div></section>';
        $html.='<dialog id="schedule-public-preview" aria-labelledby="schedule-preview-title">'
            .'<div class="dialog-head"><h2 id="schedule-preview-title">ตารางที่เผยแพร่ · ตัวอย่าง</h2><button type="button" class="close" data-schedule-preview-close aria-label="ปิดหน้าต่าง">×</button></div>'
            .'<div class="dialog-body"><p class="muted small">'.$e($scopeSubtitle).' · แสดงเฉพาะกำหนดที่เผยแพร่แล้ว</p>';
        if($publishedList){
            foreach($publishedList as $pub){
                $pubTime=$pub['start']?self::thaiDate($pub['start']).' · '.self::clockOnly($pub['start']).' · '.$pub['venue']:'ยังไม่กำหนดเวลา';
                $html.='<div class="public-match"><b>M'.str_pad((string)$pub['number'],2,'0',STR_PAD_LEFT).' · '.$e($pub['home']).' พบ '.$e($pub['away']).'</b><small>'.$e($pubTime).'</small></div>';
            }
        }else{
            $html.='<div class="empty"><h3>ยังไม่มีตารางที่เผยแพร่</h3></div>';
        }
        $html.='</div><div class="dialog-actions"><button type="button" class="btn primary" data-schedule-preview-close>ปิด</button></div></dialog>';
        $html.='<dialog id="schedule-batch-confirm" aria-labelledby="schedule-batch-title">'
            .'<div class="dialog-head"><h2 id="schedule-batch-title">เผยแพร่ตารางการแข่งขันที่เลือก</h2><button type="button" class="close" data-schedule-batch-cancel aria-label="ปิดหน้าต่าง">×</button></div>'
            .'<div class="dialog-body"><p>'.$e($scopeSubtitle).' · <span id="schedule-batch-count">0</span> คู่แข่งขัน</p><ul id="schedule-batch-list"></ul><p>เผยแพร่เฉพาะคู่ที่เลือกและพร้อมเผยแพร่ในขอบเขตนี้</p></div>'
            .'<div class="dialog-actions"><button type="button" class="btn" data-schedule-batch-cancel>ยกเลิก</button><button type="button" class="btn primary" id="schedule-batch-submit">เผยแพร่</button></div></dialog>';
        return $html;
    }

    public static function describe(array $match,?array $publication):array
    {
        return self::state($match,$publication,$publication&&$publication['snapshot']?self::sameSchedule($match,$publication['snapshot']):false);
    }

    /** Scheduling and publication are independent; result states never become scheduling badges. */
    public static function scheduling(array $match):array
    {
        if($match['state']==='CANCELLED')return ['cancelled','ยกเลิกการแข่งขัน'];
        if($match['state']==='POSTPONED')return ['postponed','เลื่อนการแข่งขัน'];
        if(!$match['scheduled_start']||!$match['scheduled_end']||!$match['venue_id'])return ['waiting','รอจัดตาราง'];
        return ['scheduled','จัดตารางแล้ว'];
    }

    private static function state(array $match,?array $publication,bool $same):array
    {
        if(!$publication){
            if(self::scheduling($match)[0]==='scheduled')return ['ready','ยังไม่เผยแพร่','พร้อมเผยแพร่'];
            return ['waiting','ยังไม่เผยแพร่',''];
        }
        if(!$same)return ['changed','เปลี่ยนแปลงการแข่งขัน','รอเผยแพร่กำหนดใหม่'];
        if(in_array($publication['operation'],['schedule_republish','legacy_draw_publication'],true))return ['changed','เปลี่ยนแปลงการแข่งขัน','เผยแพร่กำหนดใหม่แล้ว'];
        return ['published','เผยแพร่แล้ว',''];
    }

    private static function sameSchedule(array $current,array $published):bool
    {
        return ($current['venue_id'] ?? null)===($published['venue_id'] ?? null)
            &&self::timestamp($current['scheduled_start'] ?? null)===self::timestamp($published['scheduled_start'] ?? null)
            &&self::timestamp($current['scheduled_end'] ?? null)===self::timestamp($published['scheduled_end'] ?? null);
    }
    private static function timestamp(?string $value):?int{return $value?strtotime($value):null;}
    private static function sideLabel(array $side,array $names):string
    {
        if(($side['type'] ?? '')==='team')return ($side['slot'] ?? '').' · '.($names[$side['source_team_id'] ?? ''] ?? 'ทีม');
        return 'ผู้ชนะ M'.($side['match'] ?? '—');
    }
    private static function badge(string $key):string{return match($key){'ready'=>'pending','published'=>'locked','changed'=>'changed','cancelled'=>'cancelled',default=>''};}
    private static function url(array $filters,string $status):string{$url=WorkspaceView::url('schedule',$filters);return $url.(str_contains($url,'?')?'&':'?').'schedule_state='.rawurlencode($status);}
    private static function time(?string $value):string
    {
        if(!$value)return 'ยังไม่กำหนดเวลา';
        try{return (new \DateTimeImmutable($value))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('d/m/Y H:i');}catch(\Exception){return 'ยังไม่กำหนดเวลา';}
    }
    private static function thaiDate(?string $value):string
    {
        if(!$value)return 'ยังไม่กำหนด';
        try{
            $dt=(new \DateTimeImmutable($value))->setTimezone(new \DateTimeZone('Asia/Bangkok'));
            $months=[1=>'ม.ค.',2=>'ก.พ.',3=>'มี.ค.',4=>'เม.ย.',5=>'พ.ค.',6=>'มิ.ย.',7=>'ก.ค.',8=>'ส.ค.',9=>'ก.ย.',10=>'ต.ค.',11=>'พ.ย.',12=>'ธ.ค.'];
            return ((int)$dt->format('j')).' '.$months[(int)$dt->format('n')].' '.(((int)$dt->format('Y'))+543);
        }catch(\Exception){return 'ยังไม่กำหนด';}
    }
    private static function clockOnly(?string $start):string
    {
        if(!$start)return '';
        try{return (new \DateTimeImmutable($start))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('H:i').' น.';}catch(\Exception){return '';}
    }
    private static function bind(array &$filters,array $scope):void
    {
        foreach(['event_id'=>'event_id','competition_id'=>'id','division_code'=>'division_code','stage'=>'stage','province'=>'province','district'=>'district'] as $filter=>$key){
            $value=(string)($scope[$key] ?? '');if($filter==='stage')$value=(string)(int)$scope[$key];
            if($filters[$filter]!==''&&$filters[$filter]!==$value)throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับการแข่งขันที่เลือก');$filters[$filter]=$value;
        }
    }
    private static function page(array $context,array $filters,string $body,int $status=200):array
    {
        $actions='';
        if($status===200&&($filters['competition_id'] ?? '')!==''){
            $actions='<button type="button" class="btn" data-schedule-preview-open>'.WorkspaceView::icon('eye').'ดูตารางที่เผยแพร่</button>';
        }
        return WorkspaceView::page('schedule',WorkspaceView::heading('ตารางการแข่งขัน','จัดตาราง เผยแพร่ และเข้าสู่ข้อมูลหลังแข่งขันจากคู่ที่เลือก',$actions,'MATCH SCHEDULE').$body,$context,$filters,$status);
    }
    private static function notice(array $context,array $filters,string $message,int $status):array
    {return self::page($context,$filters,'<div class="notice warning" role="alert"><p>'.WorkspaceView::e($message).'</p></div>',$status);}
}
