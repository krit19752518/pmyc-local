<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** v16 schedule list and selected publication workflow. */
final class SchedulePages
{
    public const PATH='/phase2demo/workspace/pending-schedule';
    private const FILTERS=['all','waiting','ready','published','changed','cancelled'];

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
        $filterForm='<form class="card schedule-status-filter" method="get" action="'.self::PATH.'">';
        foreach($filters as $key=>$value)if($value!=='')$filterForm.='<input type="hidden" name="'.$e($key).'" value="'.$e($value).'">';
        $filterForm.='<label for="schedule-state">สถานะตาราง</label><select class="inline-filter" id="schedule-state" name="schedule_state">';
        foreach(['all'=>'ทุกสถานะ','waiting'=>'รอจัดตาราง','ready'=>'พร้อมเผยแพร่','published'=>'จัดตารางและเผยแพร่แล้ว','changed'=>'เปลี่ยนแปลงการแข่งขัน','cancelled'=>'ยกเลิกการแข่งขัน'] as $key=>$label)
            $filterForm.='<option value="'.$e($key).'"'.($filter===$key?' selected':'').'>'.$e($label).'</option>';
        $filterForm.='</select><button class="btn compact" type="submit">กรอง</button></form>';$html.=$filterForm;
        $status=$draw?$draws->ceremonyStatus($scope['event_id'],$draw['id']):null;
        $locked=$status==='CONFIRMED_LOCKED'||($status===null&&$draw&&$draw['published_at']);
        if(!$draw){$html.='<div class="notice warning" role="status"><p>ยังไม่มีผลจับสลาก จึงยังไม่มีคู่แข่งขันสำหรับจัดตาราง</p><a href="'. $e(WorkspaceView::url('ceremony',$filters)).'">ไปที่พิธีจับสลาก</a></div>';return $html;}
        if(!$locked)$html.='<div class="notice warning" role="status"><p>ยืนยันและล็อกผลจับสลากทั้งชุดก่อน แล้วจึงกำหนดวัน เวลา และสนามได้</p><a href="'. $e(WorkspaceView::url('result',$filters)).'">ไปยืนยันผลการจับสลาก</a></div>';
        $repo=new MatchRepository($db);$rows=$repo->list($scope['id']);$names=array_column($draw['slots'],'name','source_team_id');$can=CompetitionPolicy::can($actor,$scope,(new CompetitionRepository($db))->assignment($scope['id'],$actor),'schedule');
        $decorated=[];
        foreach($rows as $match){$sideA=json_decode($match['side_a'],true,512,JSON_THROW_ON_ERROR);$sideB=json_decode($match['side_b'],true,512,JSON_THROW_ON_ERROR);$resolved=$repo->resolved($match);
            $publication=$repo->schedulePublication($match);$same=$publication&&$publication['snapshot']?self::sameSchedule($match,$publication['snapshot']):false;
            [$key,$label,$detail]=self::state($match,$publication,$same);
            if($filter!=='all'&&$filter!==$key)continue;
            $teamA=$resolved['a']?($names[$resolved['a']] ?? 'ทีมที่ผ่านเข้ารอบ'):self::sideLabel($sideA,$names);
            $teamB=$resolved['b']?($names[$resolved['b']] ?? 'ทีมที่ผ่านเข้ารอบ'):self::sideLabel($sideB,$names);
            $match['schedule_key']=$key;$match['schedule_label']=$label;$match['schedule_detail']=$detail;$match['home']=$teamA;$match['away']=$teamB;
            $match['publication']=$publication;$decorated[]=$match;
        }
        $base='/phase2demo/competitions/'.$scope['id'].'/matches/';
        $html.='<section class="card"><div class="card-head"><div><h2>รายการแข่งขัน · '.$e(EventDraft::DIVISIONS[$scope['division_code']] ?? $scope['division_code']).'</h2><p>'.$e($scope['event_name']).' · '.$e(implode(' · ',array_filter([$scope['district'],$scope['province']]))).' · '.count($rows).' คู่</p></div></div>';
        $publishable=array_values(array_filter($decorated,fn($m)=>$m['schedule_key']==='ready'));
        if($can&&$locked&&$publishable){$html.='<form id="schedule-publish-form" method="post" action="'.$e(self::url($filters,$filter)).'"><input type="hidden" name="_csrf" value="'.$e($csrf).'"><input type="hidden" name="operation" value="publish_selected"></form><div class="selection-bar"><label><input type="checkbox" data-schedule-select-all> เลือกคู่ที่พร้อมเผยแพร่</label><span>เผยแพร่เฉพาะคู่ที่เลือก</span><button class="btn primary" type="submit" form="schedule-publish-form" data-schedule-publish disabled>เผยแพร่รายการที่เลือก</button></div>';}
        $html.='<div class="table-wrap"><table class="schedule-table"><thead><tr><th></th><th>คู่ / รอบ</th><th>ทีมแข่งขัน</th><th>วัน เวลา และสนาม</th><th>สถานะตาราง</th><th></th></tr></thead><tbody>';
        foreach($decorated as $match){$detail=MatchDetailView::url($base.$match['id'],$filters);$scheduled=$match['scheduled_start']?self::time($match['scheduled_start']).' – '.self::time($match['scheduled_end']).' น.':'ยังไม่กำหนดวัน เวลา และสนาม';
            $html.='<tr><td>'.($can&&$locked&&$match['schedule_key']==='ready'?'<input form="schedule-publish-form" type="hidden" name="versions['.$e($match['id']).']" value="'.$e((string)$match['version']).'"><input form="schedule-publish-form" type="hidden" name="request_ids['.$e($match['id']).']" value="'.$e(EventRepository::uuid()).'"><input form="schedule-publish-form" type="checkbox" name="match_ids[]" value="'.$e($match['id']).'" data-schedule-select aria-label="เลือก M'.$e($match['number']).'">':'').'</td><td><strong>M'.str_pad((string)$match['number'],2,'0',STR_PAD_LEFT).'</strong><small>รอบ '.$e($match['round']).'</small></td>'
                .'<td><div class="schedule-teams"><span>'.$e($match['home']).'</span><small>VS</small><span>'.$e($match['away']).'</span></div></td><td>'.$e($scheduled).'<small>'. $e($match['venue_name'] ?? 'ยังไม่กำหนดสนาม').'</small></td>'
                .'<td><span class="badge '.self::badge($match['schedule_key']).'">'.$e($match['schedule_label']).'</span>'.($match['schedule_detail']!==''?'<small>'.$e($match['schedule_detail']).'</small>':'').'</td><td><a class="btn compact" href="'.$e($detail).'">รายละเอียด</a>';
            if($can&&$locked&&$match['schedule_key']==='changed')$html.='<form method="post" action="'.$e(self::url($filters,$filter)).'" class="schedule-republish"><input type="hidden" name="_csrf" value="'.$e($csrf).'"><input type="hidden" name="operation" value="republish_one"><input type="hidden" name="match_ids[]" value="'.$e($match['id']).'"><input type="hidden" name="versions['.$e($match['id']).']" value="'.$e($match['version']).'"><input type="hidden" name="request_ids['.$e($match['id']).']" value="'.EventRepository::uuid().'"><button class="btn compact green" type="submit">เผยแพร่กำหนดใหม่</button></form>';
            $html.='</td></tr>';
        }
        if(!$decorated)$html.='<tr><td colspan="6" class="empty">ไม่พบคู่แข่งขันในสถานะที่เลือก</td></tr>';
        $html.='</tbody></table></div><div class="table-footer"><span>แสดง '.count($decorated).' จาก '.count($rows).' คู่</span><span>กำหนดการฉบับร่างจะไม่แสดงต่อสาธารณะ</span></div></section>';
        return $html;
    }

    public static function describe(array $match,?array $publication):array
    {
        return self::state($match,$publication,$publication&&$publication['snapshot']?self::sameSchedule($match,$publication['snapshot']):false);
    }

    private static function state(array $match,?array $publication,bool $same):array
    {
        if($match['state']==='CANCELLED')return ['cancelled','ยกเลิกการแข่งขัน',''];
        if(!$match['scheduled_start']||!$match['scheduled_end']||!$match['venue_id'])return ['waiting','รอจัดตาราง',''];
        if(!$publication)return ['ready','พร้อมเผยแพร่',''];
        if(!$same)return ['changed','เปลี่ยนแปลงการแข่งขัน','รอเผยแพร่กำหนดใหม่'];
        if(in_array($publication['operation'],['schedule_republish','legacy_draw_publication'],true))return ['changed','เปลี่ยนแปลงการแข่งขัน','เผยแพร่กำหนดใหม่แล้ว'];
        return ['published','จัดตารางและเผยแพร่แล้ว',''];
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
    private static function bind(array &$filters,array $scope):void
    {
        foreach(['event_id'=>'event_id','competition_id'=>'id','division_code'=>'division_code','stage'=>'stage','province'=>'province','district'=>'district'] as $filter=>$key){
            $value=(string)($scope[$key] ?? '');if($filter==='stage')$value=(string)(int)$scope[$key];
            if($filters[$filter]!==''&&$filters[$filter]!==$value)throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับการแข่งขันที่เลือก');$filters[$filter]=$value;
        }
    }
    private static function page(array $context,array $filters,string $body,int $status=200):array
    {
        $actions=WorkspaceView::clearFilters('schedule',$filters);
        if($status===200&&($filters['competition_id'] ?? '')!=='')$actions.='<a class="btn" href="'.WorkspaceView::e(WorkspaceView::url('bracket',$filters)).'">'.WorkspaceView::icon('bracket').'ดูสายการแข่งขัน</a>';
        return WorkspaceView::page('schedule',WorkspaceView::heading('ตารางการแข่งขัน','จัดตาราง เผยแพร่ และเข้าสู่รายละเอียดคู่แข่งขัน',$actions,'MATCH SCHEDULE').$body,$context,$filters,$status);
    }
    private static function notice(array $context,array $filters,string $message,int $status):array
    {return self::page($context,$filters,'<div class="notice warning" role="alert"><p>'.WorkspaceView::e($message).'</p></div>',$status);}
}
