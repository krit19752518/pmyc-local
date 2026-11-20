<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Shared presentation primitives derived from the supplied v4 HTML. */
final class Ui
{
    public const SCREENS=[
        'dashboard'=>'แดชบอร์ดการแข่งขัน','setup'=>'ตั้งค่าการแข่งขัน','participants'=>'จัดการทีมเข้าร่วม',
        'draw-setup'=>'ตั้งค่าการจับสลาก','ceremony'=>'พิธีจับสลาก','draw-result'=>'ผลการจับสลาก','draw-history'=>'ประวัติการจับสลาก',
        'schedule'=>'ตารางการแข่งขัน','match'=>'รายละเอียดการแข่งขัน','lineups'=>'บันทึกรายชื่อผู้เล่น','results'=>'บันทึกผลการแข่งขัน',
        'stage1'=>'ก้างปลา Stage 1 ระดับอำเภอ','stage2'=>'ก้างปลา Stage 2 ระดับจังหวัด','audit'=>'ประวัติการทำรายการ','permissions'=>'บทบาทและสิทธิ์การใช้งาน',
    ];
    public static function e(mixed $v):string{return htmlspecialchars(is_scalar($v)?(string)$v:'',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
    public static function scope(string $path,array $context):?array
    {
        if(empty($context['actor'])||!EventRepository::configured())return null;
        if(isset($context['ui_scope']))return $context['ui_scope'];
        if(!preg_match('#^/(?:phase2demo|platform)/competitions/([a-f0-9-]{36})#Di',$path,$m))return null;
        try{return (new CompetitionRepository(EventRepository::connect()))->requireAccess($m[1],$context['actor']);}catch(\UnexpectedValueException|\OutOfBoundsException){return null;}
    }
    public static function context(array $s):string
    {
        $items=['ฤดูกาล'=>$s['season'] ?? '—','รุ่นอายุ'=>EventDraft::DIVISIONS[$s['division_code'] ?? ''] ?? (!empty($s['divisions'])?EventDraft::divisionLabels($s['divisions']):'ทุกรุ่นอายุ'),'Stage'=>isset($s['stage'])?'Stage '.$s['stage'].' · '.((($s['division_code'] ?? '')==='U18_GIRL'&&(int)$s['stage']===1)?'หญิง · ระดับจังหวัด':([1=>'ระดับอำเภอ',2=>'ระดับจังหวัด'][$s['stage']] ?? 'รอยืนยันกติกา')):'ทุก Stage','พื้นที่'=>implode(' · ',array_filter([$s['province'] ?? '',$s['district'] ?? '',$s['zone'] ?? ''])) ?: 'ทุกพื้นที่ที่มีสิทธิ์'];
        $html='<section class="context-panel" aria-label="บริบทของรายการแข่งขัน"><div class="context-head"><div><b>บริบทของรายการแข่งขัน</b><small class="block">'.self::e($s['event_name'] ?? $s['name'] ?? '').'</small></div><span class="badge '.(!empty($s['is_test'])?'b-amber':'b-green').'">'.(!empty($s['is_test'])?'ข้อมูล Demo':'ข้อมูลจริง').'</span></div><div class="context-grid">';
        foreach($items as $label=>$value)$html.='<div class="context-item"><label>'.$label.'</label><strong>'.self::e($value).'</strong></div>';
        return $html.'</div></section>';
    }
    public static function destination(string $screen,array $scope):string
    {
        $base='/phase2demo/competitions/'.$scope['id'];
        return match($screen){'dashboard'=>'/phase2demo/workspace/dashboard?event_id='.$scope['event_id'],'setup'=>'/phase2demo/workspace/setup?event_id='.$scope['event_id'],'participants'=>$base.'/roster','draw-setup'=>$base.'/draw/setup','ceremony'=>$base.'/draw','draw-result'=>$base.'/draw/result','draw-history'=>$base.'/draw/history','stage1','stage2'=>$base.'/bracket','schedule'=>$base.'/matches','permissions'=>'/platform/competitions/'.$scope['id'].'/permissions','audit'=>$base.'/audit',default=>'/phase2demo/workspace/'.$screen.'?competition_id='.$scope['id']};
    }
    public static function navigation(string $path,array $context,?array $scope):string
    {
        $actor=$context['actor'] ?? null;$super=($actor['role'] ?? '')==='SUPER_ADMIN';
        $link=fn($url,$label,$active=false)=>'<a class="nav-btn'.($active?' active':'').'" href="'.self::e($url).'"'.($active?' aria-current="page"':'').'><span class="ico" aria-hidden="true">•</span>'.$label.'</a>';
        if(!$actor)return '<div class="nav-group">การแข่งขัน</div>'.$link('/phase2demo','ตารางการแข่งขัน',true);
        $nav='';$platform=str_starts_with($path,'/platform');
        if($platform){$nav.='<div class="nav-group">หลังบ้านกลาง</div>';foreach(['/platform'=>'รายการแข่งขันทั้งหมด','/platform/templates'=>'เทมเพลทการแข่งขัน','/platform/events/new'=>'สร้างรายการแข่งขัน','/platform/venues'=>'จัดการสนามกลาง'] as $url=>$label)$nav.=$link($url,$label,$path===$url);$nav.='<div class="nav-group">พื้นที่จัดการแข่งขัน</div>'.$link('/phase2demo/workspace/dashboard'.(isset($context['ui_event_id'])?'?event_id='.$context['ui_event_id']:''),'เข้าสู่ระบบจัดการแข่งขัน');}
        else{
            foreach(self::SCREENS as $key=>$label){
                if(in_array($key,['setup','participants','audit','permissions'],true))continue;
                if($key==='dashboard')$nav.='<div class="nav-group">ภาพรวม</div>';
                if($key==='draw-setup')$nav.='<div class="nav-group">Stage 1–2</div>';
                if($key==='audit')$nav.='<div class="nav-group">ระบบ</div>';
                $target=$scope?self::destination($key,$scope):'/phase2demo/workspace/'.$key.(isset($context['ui_event_id'])?'?event_id='.$context['ui_event_id']:'');
                if(in_array($key,['setup','permissions'],true)&&!$super){$nav.='<span class="nav-btn unavailable" aria-disabled="true"><span class="ico">•</span>'.$label.'</span>';continue;}
                if($scope&&in_array($key,['stage1','stage2'],true)&&(int)$scope['stage']!==(int)substr($key,-1))$target='/phase2demo/workspace/'.$key.'?event_id='.$scope['event_id'];
                $active=$path===parse_url($target,PHP_URL_PATH)||($key==='ceremony'&&str_ends_with($path,'/draw/ceremony'));
                $nav.=$link($target,$label,$active);
            }
            $paused=['แมวมอง / ออลสตาร์'=>['แดชบอร์ดแมวมอง','ค้นหานักกีฬา','รายละเอียดนักกีฬา','นักกีฬาที่สนใจ','สร้างทีมออลสตาร์','เอกสารโอนย้าย','เจ้าหน้าที่ทีมออลสตาร์','ตรวจสอบทีมออลสตาร์'],'Stage 3–4'=>['ภาพรวมโซน','สุ่มตำแหน่งทีม','สร้างโปรแกรมการแข่งขัน','ตรวจสอบโปรแกรมการแข่งขัน','วันแข่งขัน Stage 3','ตารางคะแนน Stage 3','รอบแบ่งกลุ่ม Stage 4','รอบรองฯ / รอบชิงฯ']];
            foreach($paused as $group=>$labels){$nav.='<details class="paused-nav"><summary class="nav-group">'.$group.' <small>รอยืนยันกติกา</small></summary>';foreach($labels as $label)$nav.='<span class="nav-btn unavailable" aria-disabled="true"><span class="ico">•</span>'.$label.'</span>';$nav.='</details>';}
            $mode=$scope&&!empty($scope['is_test'])?'demo':'real';$nav.='<div class="nav-group">เว็บไซต์สาธารณะ</div>'.$link('/phase2demo?mode='.$mode,'หน้าหลักเว็บไซต์สาธารณะ');
            foreach(['fixtures'=>'โปรแกรมการแข่งขันสาธารณะ','results'=>'ผลการแข่งขันสาธารณะ','bracket'=>'ก้างปลาสาธารณะ'] as $view=>$label)$nav.=$link('/phase2demo?mode='.$mode.'&view='.$view,$label);
            $nav.='<span class="nav-btn unavailable" aria-disabled="true">ตารางคะแนนสาธารณะ · รอยืนยันกติกา</span>'.$link('/phase2demo?mode='.$mode.'&view=fixtures','รายละเอียดการแข่งขันสาธารณะ').$link('/phase2demo?mode='.$mode.'&view=teams','รายละเอียดทีมสาธารณะ');
            $nav.='<div class="nav-group">ระบบ</div>';foreach(['audit','permissions'] as $key){$target=$scope?self::destination($key,$scope):'/phase2demo/workspace/'.$key.(isset($context['ui_event_id'])?'?event_id='.$context['ui_event_id']:'');if($key==='permissions'&&!$super){$nav.='<span class="nav-btn unavailable" aria-disabled="true">บทบาทและสิทธิ์การใช้งาน</span>';continue;}$nav.=$link($target,self::SCREENS[$key],$path===$target);} 
            if($super)$nav.='<div class="nav-group">หลังบ้านกลาง</div>'.$link('/platform','กลับหลังบ้านกลาง');
        }
        return $nav.'<div class="nav-group">บัญชีผู้ใช้งาน</div>'.$link('/phase2demo/login','เลือกบัญชี / เข้าสู่ระบบ').$link('/phase2demo/logout','ออกจากระบบ');
    }
    public static function metrics(array $items):string
    {
        $html='<div class="grid grid-'.min(4,count($items)).' metrics">';foreach($items as $label=>$value)$html.='<div class="card metric"><small>'.self::e($label).'</small><strong>'.self::e($value).'</strong></div>';return $html.'</div>';
    }
    public static function team(string $name):string{return '<span class="teamcell"><span class="team-logo" aria-hidden="true">⚽</span><span>'.self::e($name).'</span></span>';}
}
