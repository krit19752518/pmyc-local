<?php
declare(strict_types=1);
namespace PMYC\Phase2;

require_once __DIR__.'/DashboardReadModel.php';
require_once __DIR__.'/WorkspaceView.php';
require_once __DIR__.'/TeamSetupPages.php';

final class DashboardPages
{
    public static function matches(string $path):bool
    {
        return $path==='/phase2demo/workspace/dashboard'||(bool)preg_match('#^/phase2demo/workspace/pending-(setup|bracket|detail)$#D',$path);
    }
    public static function render(string $path,string $method,array $query,array $context,?DashboardReadModel $model=null):array
    {
        $actor=$context['actor'] ?? null;
        if(!$actor)return [403,'กรุณาเข้าสู่ระบบ'];
        if(!in_array($actor['role'] ?? '',['SUPER_ADMIN','DOCUMENT_VERIFIER','SAT_OFFICER'],true))return [403,'ไม่มีสิทธิ์เข้าถึงระบบจัดการแข่งขัน'];
        if($method!=='GET')return [405,'หน้านี้รองรับการเปิดดูเท่านั้น'];
        $key=$path==='/phase2demo/workspace/dashboard'?'dashboard':substr(basename($path),8);
        try{
            $f=DashboardReadModel::query($query,$actor);
            $dashboardInput=null;$originalQuery=$query;$validateOriginal=false;
            if($key==='dashboard'){
                $active=($query['dashboard_filters'] ?? '')==='1';
                $dashboardInput=[];
                foreach(['season_id','division_code','stage','province','district'] as $name){
                    $dashboardInput[$name]=$active?$f[$name]:'';
                    if(!$active)unset($query[$name]);
                }
                if(!$active){
                    foreach(['season_id','division_code','stage','province','district','competition_id','match_id'] as $name)if(($originalQuery[$name] ?? '')!=='')$validateOriginal=true;
                    unset($query['competition_id'],$query['match_id']);
                }
                if(($actor['role'] ?? '')==='SAT_OFFICER')$dashboardInput['province']=$f['province'];
            }
            if($key!=='dashboard'&&$key!=='setup'){
                // Blank destinations never dispatch to existing mutation forms.
                if($f['competition_id']!==''||$f['event_id']!==''){
                    if(!$model&&!EventRepository::configured())throw new \RuntimeException('Context unavailable');
                    $model ??= new DashboardReadModel(EventRepository::connect());
                    $f=$model->authorizeContext($actor,$query);
                }
                return WorkspaceView::page($key,WorkspaceView::heading(WorkspaceView::MENUS[$key]).'<section class="workspace-blank" aria-label="เนื้อหาเมนู'.WorkspaceView::e(WorkspaceView::MENUS[$key]).'"></section>',$context,$f);
            }
            if(!$model&&!EventRepository::configured()){
                $data=DashboardReadModel::empty($actor,$query);$data['available']=false;
                if($key==='setup'){$data['setup_input']=$f;return TeamSetupPages::page($data,$context);}
                $data['dashboard_input']=$dashboardInput;
                return self::page($data,$context,'ยังไม่ได้เชื่อมข้อมูลการแข่งขัน');
            }
            $model ??= new DashboardReadModel(EventRepository::connect());
            if($key==='setup'){$data=$model->load($actor,$query);$data['setup_input']=$f;return TeamSetupPages::page($data,$context);}
            if($key==='dashboard'&&$validateOriginal)$model->load($actor,$originalQuery);
            $data=$model->load($actor,$query);$data['dashboard_input']=$dashboardInput;
            return self::page($data,$context);
        }catch(\OutOfBoundsException $e){
            return self::error($key,$context,$e->getMessage(),404);
        }catch(\InvalidArgumentException $e){
            return self::error($key,$context,$e->getMessage(),400);
        }catch(\UnexpectedValueException $e){
            return self::error($key,$context,$e->getMessage(),403);
        }catch(\PDOException|\RuntimeException $e){
            error_log('Workspace dashboard read failed: '.get_class($e));
            return self::error($key,$context,'ไม่สามารถอ่านข้อมูลการแข่งขันได้ กรุณาลองใหม่',503);
        }
    }
    private static function error(string $key,array $context,string $message,int $status):array
    {
        return WorkspaceView::page($key,WorkspaceView::heading(WorkspaceView::MENUS[$key]).'<div class="notice warning" role="alert"><p>'.WorkspaceView::e($message).'</p></div>',$context,[],$status);
    }
    public static function page(array $m,array $context,string $notice=''):array
    {
        $f=$m['filters'];$e=fn($v)=>WorkspaceView::e($v);$icon=fn($v)=>WorkspaceView::icon($v);$available=$m['available'] ?? true;
        if(isset($m['dashboard_input']))foreach($m['dashboard_input'] as $name=>$value)$f[$name]=$value;
        $href=fn($key,$extra=[])=>$e(WorkspaceView::url($key,$f,$extra));
        $html=WorkspaceView::heading('แดชบอร์ดการแข่งขัน','ภาพรวมและงานที่ต้องดำเนินการในพื้นที่ของคุณ','<div class="dashboard-actions"><a class="btn primary" href="'.$href('schedule').'">'.$icon('calendar').'ตารางการแข่งขัน</a><button class="btn" type="button" data-dashboard-clear>ล้างข้อมูล</button></div>');
        if($notice!=='')$html.='<div class="notice warning" role="status"><p>'.$e($notice).'</p></div>';
        $html.=self::filters($m,$context['actor']);
        if(isset($m['dashboard_input'])){
            $input=$m['dashboard_input'];
            $complete=$input['season_id']!==''&&$input['division_code']!==''&&$input['stage']!==''&&$input['province']!==''&&($input['stage']==='2'||$input['district']!=='');
            if(!$complete)return WorkspaceView::page('dashboard',$html.'<div class="notice" role="status">กรุณาเลือกตัวกรองให้ครบเพื่อแสดงสถิติ</div>',$context,$f);
        }
        $count=fn($v)=>$available&&$v!==null?number_format($v):'—';
        $b=$m['dashboard_7blocks'] ?? DashboardReadModel::empty7Blocks();
        $teamsError=!$available||!empty($b['teams_error']);
        $tAll=$teamsError?'—':($b['teams_all']!==null?number_format((int)$b['teams_all']):$count($m['team_count']));
        $tOut=$teamsError?'—':($b['teams_outside']!==null?number_format((int)$b['teams_outside']):'0');
        $tDraw=$teamsError?'—':($b['teams_draw']!==null?number_format((int)$b['teams_draw']):'0');
        $drawCount=(int)($b['draw_count'] ?? 0);
        $drawVersion=$b['draw_version'] ?? $m['draw_version'];
        $drawStatus=$b['draw_status'] ?? ($m['draw_status'] ?? 'NONE');
        $beforeDraw=$drawCount===0;
        $pendingDraw=$drawStatus==='PENDING_CONFIRMATION';
        $drawStatusText=$beforeDraw?'ยังไม่จับสลาก':($pendingDraw?'รอยืนยันผล':'ยืนยันผลแล้ว');
        $outsideCount=(int)($b['teams_outside'] ?? 0);
        $outsideCaption=!$teamsError&&$outsideCount>0?($beforeDraw?'ตรวจรายชื่อก่อนจับสลาก':'ตรวจทีมใหม่เพื่อพิจารณาสุ่มใหม่'):'';
        $drawRefCaption=$beforeDraw?'':'อ้างอิงผล V'.(int)$drawVersion;
        $changedCount=(int)($b['teams_changed'] ?? 0);
        $sAll=(int)($b['schedule_all'] ?? 0);
        $sWait=(int)($b['schedule_unscheduled'] ?? 0);
        $sReady=(int)($b['schedule_ready'] ?? 0);
        $pAwait=(int)($b['post_awaiting'] ?? 0);
        $defaultView=!$teamsError&&$outsideCount>0?'team:outside':'team:all';

        $tile=function(string $view,string $label,string $val,string $unit,string $caption,bool $alert=false,bool $disabled=false)use($e,$defaultView):string{
            $pressed=$defaultView===$view?'true':'false';
            return '<button type="button" class="d-tile'.($alert?' d-alert':'').'" data-dashboard-block="'.$e($view).'" aria-pressed="'.$pressed.'"'.($disabled?' disabled':'').'>'
                .'<span class="d-label">'.$e($label).'</span>'
                .'<span class="d-value">'.$e($val).'<span class="d-unit">'.$e($unit).'</span></span>'
                .'<span class="d-caption">'.$e($caption).'</span></button>';
        };

        $payload=[
            'defaultView'=>$defaultView,
            'before'=>$beforeDraw,
            'pending'=>$pendingDraw,
            'error'=>$teamsError,
            'drawVersion'=>$drawVersion,
            'urls'=>[
                'setup'=>WorkspaceView::url('setup',$f),
                'result'=>WorkspaceView::url('result',$f),
                'schedule'=>WorkspaceView::url('schedule',$f),
                'detail'=>WorkspaceView::url('detail',$f),
            ],
            'lists'=>$b['lists'] ?? [],
        ];
        $payloadJson=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT);

        $html.='<div class="d-dashboard" data-dashboard-payload="'.$e($payloadJson ?: '{}').'">';
        $html.='<section class="d-section" aria-labelledby="dashboard-teams-heading"><h2 id="dashboard-teams-heading">ทีมในขอบเขตที่เลือก</h2><div class="d-grid">'
            .$tile('team:all','จำนวนทีมทั้งหมด',$tAll,'ทีม','ทีมและรุ่นที่เลือกอนุมัติปัจจุบัน',false,$teamsError)
            .$tile('team:outside','ทีมที่ยังไม่อยู่ในผลจับสลาก',$tOut,'ทีม',$outsideCaption,!$teamsError&&$outsideCount>0,$teamsError)
            .$tile('team:draw','ทีมที่จับสลากแล้ว',$tDraw,'ทีม',$drawRefCaption,false,$teamsError)
            .'</div><p class="d-small" id="dashboard-draw-reference" role="status">จับสลากแล้ว '.$drawCount.' ครั้ง · '.$e($drawStatusText).'</p>';
        if($teamsError){
            $html.='<div class="d-note d-error" id="dashboard-team-warning" role="status">โหลดข้อมูลการอนุมัติทีมไม่สำเร็จ</div>';
        }elseif($changedCount>0){
            $html.='<div class="d-note" id="dashboard-team-warning" role="status"><span>ทีมในผลจับสลากที่สิทธิ์เปลี่ยน '.$changedCount.' ทีม</span><button type="button" class="btn" data-dashboard-block="team:changed">ตรวจรายชื่อ</button></div>';
        }
        $html.='</section>';

        $html.='<section class="d-section" aria-labelledby="dashboard-schedule-heading"><h2 id="dashboard-schedule-heading">สถานะตารางการแข่งขัน</h2><div class="d-grid">'
            .$tile('schedule:all','จำนวนคู่แข่งขันทั้งหมด',$available?number_format($sAll):'—','คู่','มีทีมครบทั้งสองฝั่ง')
            .$tile('schedule:unscheduled','รอจัดตาราง',$available?number_format($sWait):'—','คู่',$sWait>0?($pendingDraw?'ยืนยันผลจับสลากก่อนจัดตาราง':'กำหนดวัน เวลา และสนาม'):'',$available&&$sWait>0)
            .$tile('schedule:ready','พร้อมเผยแพร่',$available?number_format($sReady):'—','คู่',$sReady>0?'ตรวจและเผยแพร่ตาราง':'',$available&&$sReady>0)
            .'</div></section>';

        $html.='<section class="d-section" aria-labelledby="dashboard-post-heading"><h2 id="dashboard-post-heading">ข้อมูลหลังแข่งขัน</h2><div class="d-grid">'
            .$tile('post:awaiting','รอบันทึกผล',$available?number_format($pAwait):'—','คู่','คู่ที่แข่งผ่านไปแล้วและยังไม่มีผลบันทึก',$available&&$pAwait>0)
            .'</div></section>';

        $initialRows=$b['lists'][$defaultView] ?? [];
        $initialTitle=$defaultView==='team:outside'?'ทีมที่ยังไม่อยู่ในผลจับสลาก':'ทีมทั้งหมดที่อนุมัติในขอบเขต';
        $html.='<section class="d-list" id="dashboard-list" aria-labelledby="dashboard-list-title">'
            .'<div class="d-row"><h2 id="dashboard-list-title" aria-live="polite">'.$e($initialTitle).'</h2><span class="d-badge" id="dashboard-list-count">'.($teamsError?'—':count($initialRows).' ทีม').'</span></div>'
            .'<div id="dashboard-list-body">';
        if($teamsError){
            $html.='<p class="d-note d-error">โหลดข้อมูลการอนุมัติไม่สำเร็จ จึงยังระบุยอดทีมปัจจุบันไม่ได้</p>';
        }elseif($initialRows){
            $html.='<div class="d-tablewrap"><table><thead><tr><th>ทีม</th><th>สถานะในผลจับสลาก</th><th>ดำเนินการ</th></tr></thead><tbody>';
            foreach($initialRows as $row){
                $html.='<tr><td>'.$e($row['name'] ?? '').'</td><td>'.(!empty($row['in_draw'])?'อยู่ในผลจับสลาก':'ยังไม่อยู่ในผล').'</td><td><a class="btn text compact" href="'.$href('setup').'">เปิดหน้าทีม/จับสลาก '.$icon('arrow').'</a></td></tr>';
            }
            $html.='</tbody></table></div>';
        }else{
            $html.='<p class="muted">ไม่มีทีมในกลุ่มนี้</p>';
        }
        $html.='</div></section></div>';
        $scope=implode(' · ',array_filter([$f['province'], $f['stage']==='2'?'ระดับจังหวัด':$f['district'],EventDraft::DIVISIONS[$f['division_code']] ?? '']));
        $scopeBadge=self::scopeStatus($m);
        $badgeClass='badge'.($scopeBadge['class']!==''?' '.$scopeBadge['class']:'');
        $html.='<div class="grid-two"><div><section class="card"><div class="card-head"><div><h2>เส้นทางการจัดการแข่งขัน</h2><p>'.$e($scope).'</p></div><span class="'.$e($badgeClass).'">'.$e($scopeBadge['label']).'</span></div>';
        $tasks=self::workflowTasks($m,$count,(int)($m['match_count'] ?? 0));
        foreach($tasks as $i=>[$key,$title,$text])$html.='<a class="task-row" href="'.$href($key).'"><span class="task-number">'.($i+1).'</span><div><strong>'.$e($title).'</strong><p>'.$e($text).'</p></div>'.$icon('arrow').'</a>';
        $html.='</section><section class="card"><div class="card-head"><div><h2>คู่แข่งขันล่าสุด</h2><p>เปิดรายละเอียดเพื่อจัดตารางหรือบันทึกข้อมูลหลังแข่งขัน</p></div><a class="btn text" href="'.$href('schedule').'">ดูทั้งหมด</a></div><div class="table-wrap"><table><thead><tr><th>คู่ / รอบ</th><th>ทีมแข่งขัน</th><th>กำหนดการแข่งขัน</th><th>สถานะตาราง</th><th></th></tr></thead><tbody>';
        foreach($m['matches'] as $match){
            $when=self::date($match['scheduled_start']);$link=$href('detail',['competition_id'=>$match['competition_id'],'match_id'=>$match['id']]);
            $html.='<tr><td><strong>M'.str_pad((string)$match['number'],2,'0',STR_PAD_LEFT).'</strong><small class="muted block">รอบ '.$e($match['round']).'</small></td><td><span class="team">'.$e($match['home']).'</span><small class="muted block">VS</small><span class="team">'.$e($match['away']).'</span></td><td>'.$e($when).'<small class="muted block">'.$e($match['venue'] ?: 'ยังไม่กำหนดสนาม').'</small></td><td><span class="badge" title="ยังไม่มีข้อมูลสถานะตาราง">—</span></td><td><a class="btn text compact" href="'.$link.'">รายละเอียด '.$icon('arrow').'</a></td></tr>';
        }
        if(!$m['matches'])$html.='<tr><td colspan="5" class="empty">'.($available?'ยังไม่มีคู่แข่งขันในขอบเขตนี้':'ยังไม่สามารถอ่านข้อมูลคู่แข่งขันได้').'</td></tr>';
        $total=$m['match_count'];$percent=$available&&$total>0?(int)round($m['confirmed_count']/$total*100):null;
        $progress=$percent===null?'<div class="workspace-progress-empty" aria-hidden="true"></div>':'<progress class="workspace-progress" max="100" value="'.$percent.'" aria-label="ความคืบหน้าการยืนยันผล"></progress>';
        $html.='</tbody></table></div></section></div><div><section class="card"><div class="card-head"><h2>ความคืบหน้าการแข่งขัน</h2>'.$icon('trophy').'</div><div class="card-body"><div class="review-row"><span>ยืนยันผลหลังแข่งขัน</span><b>'.($percent===null?'—':$percent.'%').'</b></div>'.$progress.'<p class="small muted">'.($percent===null?'ยังไม่มีข้อมูลคู่แข่งขันสำหรับคำนวณ':'ยืนยันแล้ว '.$count($m['confirmed_count']).' จาก '.$count($total).' คู่').'</p><div class="progress-action"><a class="btn" href="'.$href('bracket').'">ดูสายการแข่งขัน '.$icon('arrow').'</a></div></div></section><section class="card"><div class="card-head"><h2>การดำเนินการล่าสุด</h2>'.$icon('history').'</div>';
        foreach($m['activity'] as $event){
            $actorLabel=self::actorLabel($event);
            $meta=self::date($event['created_at'] ?? null).($actorLabel!==''?' · '.$actorLabel:'');
            $detail=self::activityDetail($event);
            $html.='<div class="workspace-event"><span class="event-dot"></span><div><strong>'.$e(self::action((string)($event['action'] ?? ''))).'</strong><small class="muted block">'.$e($meta).'</small>'.($detail!==''?'<small class="muted block">'.$e($detail).'</small>':'').'</div></div>';
        }
        if(!$m['activity'])$html.='<div class="card-body muted">'.($available?'ยังไม่มีการดำเนินการในขอบเขตนี้':'ยังไม่สามารถอ่านประวัติได้').'</div>';
        $html.='</section></div></div>';
        return WorkspaceView::page('dashboard',$html,$context,$f);
    }
    public static function filterValues(array $m,string $page):array
    {
        $f=$m['filters'];
        $input=$page==='dashboard'?($m['dashboard_input'] ?? []):($m['filter_input'] ?? ($page==='setup'?($m['setup_input'] ?? []):[]));
        foreach(['season_id','division_code','stage','province','district'] as $name)if(array_key_exists($name,$input))$f[$name]=$input[$name];
        return $f;
    }
    public static function filters(array $m,array $actor,string $page='dashboard'):string
    {
        $f=self::filterValues($m,$page);$o=$m['options'];$e=fn($v)=>WorkspaceView::e($v);
        $resettable=in_array($page,['setup','bracket','schedule'],true);
        if($resettable&&$f['province']==='')$o['districts']=[];
        $select=function(string $name,array $options,string $empty='')use($f,$e):string{
            $s='<select name="'.$name.'" id="workspace-'.$name.'">';
            if($empty!=='')$s.='<option value="">'.$e($empty).'</option>';
            if(!$options&&$empty==='')$s.='<option value="">ไม่มีข้อมูลที่เข้าถึงได้</option>';
            foreach($options as $value=>$label)$s.='<option value="'.$e((string)$value).'"'.($f[$name]===(string)$value?' selected':'').'>'.$e($label).'</option>';
            return $s.'</select>';
        };
        $divisions=empty($m['event'])?EventDraft::DIVISIONS:array_intersect_key(EventDraft::DIVISIONS,array_flip($m['event']['division_codes']));
        $seasons=$m['event']!==null?[$m['filters']['season_id']=>$m['event']['season']]:$o['seasons'];
        $dashboard=$page==='dashboard'&&isset($m['dashboard_input']);$blank=$dashboard||$resettable;
        $html='<form class="card workspace-filters" aria-label="ขอบเขตการแข่งขัน" method="get" action="'.$e(WorkspaceView::url($page)).'">'.($dashboard?'<input type="hidden" name="dashboard_filters" value="1">':'').'<input type="hidden" name="event_id" value="'.$e($f['event_id']).'"><input type="hidden" name="data_mode" value="'.$e($f['data_mode']).'"><div class="filters"><label>ฤดูกาล'.$select('season_id',$seasons,$blank?'เลือกฤดูกาล':'').'</label><label>รุ่นอายุ'.$select('division_code',$divisions,$blank?'เลือกรุ่นอายุ':'').'</label><label>ระดับการแข่งขัน'.$select('stage',['1'=>'Stage 1 · ระดับอำเภอ','2'=>'Stage 2 · ระดับจังหวัด'],$blank?'เลือกระดับการแข่งขัน':'').'</label>';
        $sat=($actor['role'] ?? '')==='SAT_OFFICER';
        if($sat){
            $provinceControl='<div class="province-input"><input type="text" id="workspace-province" name="province" autocomplete="off" value="'.$e($f['province']).'" readonly aria-readonly="true"></div>';
        }else{
            $provinceControl=$select('province',$o['provinces'],'เลือกจังหวัด');
        }
        $html.='<label class="province-label">จังหวัด'.$provinceControl.'<small class="field-hint">'.($sat?'จังหวัดตามบัญชีผู้ใช้งาน · เปลี่ยนไม่ได้':'เลือกจังหวัดเพื่อดูข้อมูล').'</small></label>';
        $district=$f['stage']==='2'?'<select name="district" disabled><option>ไม่ใช้ในระดับจังหวัด</option></select>':(!empty($m['no_demo_area'])&&$f['division_code']!==''?'<select name="district" disabled><option>ยังไม่มีข้อมูล Demo ในจังหวัดและรุ่นที่เลือก</option></select>':$select('district',$o['districts'],'เลือกอำเภอ/เขต'));
        $html.='<label class="district-label">อำเภอ/เขต'.$district.'</label></div><div class="filter-note"><span><span class="dot"></span>'.($sat?'พื้นที่รับผิดชอบ:':'จังหวัดที่กำลังดู:').' <b>'.$e($f['province'] ?: '—').'</b></span><span>แสดงข้อมูลตามขอบเขตที่เลือกโดยอัตโนมัติ</span></div></form>';
        return $html;
    }
    private static function date(?string $date):string
    {
        if(!$date)return 'ยังไม่กำหนด';
        try{return (new \DateTimeImmutable($date))->setTimezone(new \DateTimeZone('Asia/Bangkok'))->format('d/m/Y H:i').' น.';}catch(\Exception){return '—';}
    }
    private static function scopeStatus(array $m):array
    {
        $total=(int)($m['match_count'] ?? 0);
        $confirmed=(int)($m['confirmed_count'] ?? 0);
        $published=(int)($m['published_count'] ?? 0);
        $scheduled=(int)($m['scheduled_count'] ?? 0);
        $drawStatus=$m['draw_status'] ?? null;
        $hasDraw=!empty($m['draw_version'])||$total>0;
        if($total>0&&$confirmed>=$total)return ['label'=>'แข่งขันเสร็จสมบูรณ์','class'=>'published'];
        if($total>0&&$published>0)return ['label'=>$published>=$total?'เผยแพร่ตารางครบแล้ว':'เผยแพร่ตารางบางส่วน','class'=>'published'];
        if($total>0&&$scheduled>0)return ['label'=>'จัดตารางแล้ว · รอเผยแพร่','class'=>'changed'];
        if($drawStatus==='CONFIRMED_LOCKED')return ['label'=>'ยืนยันและล็อกแล้ว','class'=>'locked'];
        if($hasDraw||$drawStatus==='PENDING_CONFIRMATION')return ['label'=>'รอยืนยันผลจับสลาก','class'=>'pending'];
        if(!empty($m['has_roster'])||($m['team_count'] ?? null)!==null)return ['label'=>'ยังไม่จับสลาก','class'=>'ready'];
        return ['label'=>'รอข้อมูลทีม','class'=>''];
    }
    private static function workflowTasks(array $m,callable $count,int $total):array
    {
        $step1=!empty($m['draw_version'])
            ?'มีผลจับสลากเวอร์ชัน '.(int)$m['draw_version']
            :(($m['team_count'] ?? null)!==null
                ?'พร้อมจับสลาก '.(int)$m['team_count'].' ทีม'
                :(!empty($m['has_roster'])?'นำเข้ารายชื่อทีมแล้ว · รอจับสลาก':'ตรวจรายชื่อทีมที่มีสิทธิ์'));
        $drawStatus=$m['draw_status'] ?? null;
        $step2=$drawStatus==='CONFIRMED_LOCKED'
            ?'ยืนยันทั้งชุดเรียบร้อยแล้ว'
            :(($drawStatus==='PENDING_CONFIRMATION'||!empty($m['draw_version']))?'มีผลจับสลากรอยืนยันและล็อก':'ยืนยันก่อนกำหนดตารางแข่งขัน');
        $published=(int)($m['published_count'] ?? 0);
        $scheduled=(int)($m['scheduled_count'] ?? 0);
        if($total>0){
            if($published>=$total)$step3='เผยแพร่ครบ '.$published.' จาก '.$total.' คู่';
            elseif($published>0&&$scheduled>$published)$step3='เผยแพร่ '.$published.' คู่ · จัดตารางแล้ว '.$scheduled.' คู่';
            elseif($published>0)$step3='เผยแพร่ '.$published.' จาก '.$total.' คู่';
            elseif($scheduled>0)$step3='จัดตารางแล้ว '.$scheduled.' จาก '.$total.' คู่ · รอเผยแพร่';
            else $step3='รอจัดวัน เวลา และสนาม '.$total.' คู่';
        }else{
            $step3='เลือกคู่แข่งขันเพื่อกำหนดวัน เวลา สนาม';
        }
        return [
            ['setup','ตรวจสอบทีมและจับสลาก',$step1],
            ['result','ตรวจสอบและล็อกผลจับสลาก',$step2],
            ['schedule','จัดตารางและเผยแพร่',$step3],
            ['schedule','บันทึกข้อมูลหลังแข่งขัน','ยืนยันแล้ว '.$count($m['confirmed_count']).' จาก '.$count($m['match_count']).' คู่'],
        ];
    }
    private static function actorLabel(array $event):string
    {
        $name=trim((string)($event['actor_name'] ?? ''));
        if($name!=='')return $name;
        $roles=['SUPER_ADMIN'=>'ผู้ดูแลระบบสูงสุด','SAT_OFFICER'=>'เจ้าหน้าที่ กกท. จังหวัด','DOCUMENT_VERIFIER'=>'เจ้าหน้าที่ตรวจเอกสาร'];
        $role=(string)($event['actor_role'] ?? '');
        if($role!==''&&isset($roles[$role]))return $roles[$role];
        $actorId=trim((string)($event['actor_id'] ?? ''));
        return $actorId!==''?$actorId:'';
    }
    private static function activityDetail(array $event):string
    {
        $parts=[];
        if(!empty($event['draw_version']))$parts[]='เวอร์ชัน '.(int)$event['draw_version'];
        if(!empty($event['match_number']))$parts[]='คู่ M'.str_pad((string)$event['match_number'],2,'0',STR_PAD_LEFT);
        if(!empty($event['match_scheduled_start']))$parts[]=self::date((string)$event['match_scheduled_start']);
        if(!empty($event['match_venue_name']))$parts[]=(string)$event['match_venue_name'];
        $reason=trim((string)($event['reason'] ?? ''));
        if($reason!=='')$parts[]=$reason;
        if(!$parts&&!empty($event['team_count']))$parts[]=(int)$event['team_count'].' ทีม';
        return implode(' · ',$parts);
    }
    private static function action(string $action):string
    {
        return [
            'COMPETITION_CREATED'=>'สร้างการแข่งขัน',
            'COMPETITION_ASSIGNMENT_CHANGED'=>'ปรับสิทธิ์ผู้รับผิดชอบ',
            'RULES_APPROVED'=>'อนุมัติกติกาการแข่งขัน',
            'ROSTER_IMPORTED'=>'นำเข้ารายชื่อแข่งขัน',
            'ROSTER_LOCKED'=>'ล็อกรายชื่อแข่งขัน',
            'ADVANCEMENT_IMPORTED'=>'นำทีมผ่านเข้ารอบ',
            'ADVANCEMENT_LOCKED'=>'ล็อกทีมผ่านเข้ารอบ',
            'DRAW_SETUP_SAVED'=>'บันทึกการตั้งค่าจับสลาก',
            'DRAW_START'=>'เริ่มการจับสลาก',
            'DRAW_CREATE'=>'สร้างผลจับสลาก',
            'DRAW_REDRAW'=>'จับสลากใหม่',
            'DRAW_PUBLISH'=>'เผยแพร่ผลจับสลาก',
            'DRAW_CEREMONY'=>'สุ่มจับสลาก (พิธีจับสลาก)',
            'DRAW_CEREMONY_REDRAW'=>'สุ่มจับสลากใหม่ (พิธีจับสลาก)',
            'DRAW_CONFIRMED_LOCKED'=>'ยืนยันและล็อกผลจับสลาก',
            'MATCH_SCHEDULE'=>'บันทึกกำหนดการแข่งขัน',
            'MATCH_SCHEDULE_PUBLISHED'=>'เผยแพร่ตารางแข่งขัน',
            'MATCH_SCHEDULE_REPUBLISHED'=>'เผยแพร่กำหนดการแข่งขันใหม่',
            'MATCH_START'=>'เริ่มการแข่งขัน',
            'MATCH_POSTPONE'=>'เลื่อนการแข่งขัน',
            'MATCH_CANCEL'=>'ยกเลิกการแข่งขัน',
            'LINEUP_DRAFT'=>'บันทึกร่างรายชื่อผู้เล่น',
            'LINEUP_CONFIRM'=>'ยืนยันรายชื่อผู้เล่น',
            'RESULT_DRAFT'=>'บันทึกร่างผลการแข่งขัน',
            'RESULT_CONFIRM'=>'ยืนยันผลการแข่งขัน',
        ][$action] ?? 'อัปเดตข้อมูลการแข่งขัน';
    }
}
