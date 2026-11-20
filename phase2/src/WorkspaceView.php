<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** v16 presentation only; legacy pages keep Application's original layout. */
final class WorkspaceView
{
    public const MENUS=['dashboard'=>'แดชบอร์ดการแข่งขัน','setup'=>'ตั้งค่าการจับสลาก','ceremony'=>'พิธีจับสลาก',
        'result'=>'ผลการจับสลาก','history'=>'ประวัติการจับสลาก','bracket'=>'สายการแข่งขัน','schedule'=>'ตารางการแข่งขัน','detail'=>'รายละเอียดการแข่งขัน','venues'=>'จัดการสนามแข่งขัน'];
    public static function e(mixed $v):string{return htmlspecialchars(is_scalar($v)?(string)$v:'',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
    public static function url(string $key,array $filters=[],array $extra=[]):string
    {
        $path=$key==='venues'?'/platform/venues':($key==='dashboard'?'/phase2demo/workspace/dashboard':'/phase2demo/workspace/pending-'.$key);
        $allowed=DashboardReadModel::FILTERS;
        if($key==='dashboard')$allowed[]='dashboard_filters';
        $values=array_intersect_key(array_merge($filters,$extra),array_flip($allowed));
        $values=array_filter($values,fn($v)=>is_string($v)&&$v!=='');
        return $path.($values?'?'.http_build_query($values):'');
    }
    private static function hasScopeFilters(array $f):bool
    {
        foreach(['season_id','division_code','stage','province','district'] as $name)if(($f[$name] ?? '')!=='')return true;
        return ($f['dashboard_filters'] ?? '')==='1';
    }
    public static function setupEntryUrl(array $f):string
    {
        return self::filterEntryUrl('setup',$f);
    }
    public static function filterEntryUrl(string $key,array $f):string
    {
        if(!in_array($key,['setup','bracket','schedule'],true))throw new \InvalidArgumentException('Invalid filter destination');
        return self::url($key,[],array_intersect_key($f,array_flip(['event_id','data_mode'])));
    }
    public static function clearFilters(string $key,array $f):string
    {
        return '<a class="btn" href="'.self::e(self::filterEntryUrl($key,$f)).'">ล้างข้อมูล</a>';
    }
    public static function icon(string $name):string
    {
        $paths=['dashboard'=>'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
            'trophy'=>'M8 3h8v5a4 4 0 0 1-8 0V3z M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 12v6 M8 21h8 M9 18h6',
            'calendar'=>'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2',
            'users'=>'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
            'eye'=>'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
            'check'=>'M5 12l4 4L19 6','arrow'=>'M5 12h14 M14 7l5 5-5 5','back'=>'M19 12H5 M12 19l-7-7 7-7','menu'=>'M3 6h18 M3 12h18 M3 18h18',
            'history'=>'M3 12a9 9 0 1 0 3-6 M3 3v6h6 M12 7v5l3 2','file'=>'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8',
            'bracket'=>'M4 3v6h6v6H4v6 M20 3v6h-6v6h6v6 M10 12h4','draw'=>'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h3'];
        return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'.($paths[$name] ?? $paths['file']).'"/></svg>';
    }
    private static function link(string $key,array $f,string $label,string $icon,string $active):string
    {
        $selected=$key===$active||($active==='detail'&&$key==='schedule');
        $href=$key==='dashboard'&&self::hasScopeFilters($f)?self::url($key,$f,['dashboard_filters'=>'1']):self::url($key,$f);
        return '<a class="nav-link'.($selected?' active':'').'" href="'.self::e($href).'"'.($selected?' aria-current="page"':'').'>'.self::icon($icon).self::e($label).'</a>';
    }
    public static function page(string $active,string $content,array $context,array $f=[],int $status=200):array
    {
        $actor=$context['actor'] ?? [];$title=self::MENUS[$active] ?? 'ระบบจัดการแข่งขัน';
        $roles=['SUPER_ADMIN'=>'ผู้ดูแลระบบสูงสุด','DOCUMENT_VERIFIER'=>'เจ้าหน้าที่ตรวจเอกสาร','SAT_OFFICER'=>'เจ้าหน้าที่ กกท. จังหวัด'];
        $province=($actor['role'] ?? '')==='SAT_OFFICER'?(string)($actor['province'] ?? ''):(string)($f['province'] ?? '');
        $region=$province!==''?'จังหวัด'.$province:(($actor['role'] ?? '')==='SAT_OFFICER'?'ยังไม่ได้กำหนดจังหวัด':'ส่วนกลาง');
        $nav=self::link('dashboard',$f,self::MENUS['dashboard'],'dashboard',$active);
        $nav.='<details class="tournament-menu" open><summary class="nav-parent">'.self::icon('trophy').'จัดการแข่งขัน</summary><div class="nav-sub">';
        foreach(['setup'=>'draw','ceremony'=>'trophy','result'=>'file','history'=>'history','bracket'=>'bracket'] as $key=>$icon)$nav.=self::link($key,$f,self::MENUS[$key],$icon,$active);
        $nav.='</div></details>'.self::link('schedule',$f,self::MENUS['schedule'],'calendar',$active);
        if(($actor['role'] ?? '')==='SUPER_ADMIN')$nav.=self::link('venues',$f,self::MENUS['venues'],'bracket',$active);
        $account='<div class="account-links">';
        if(($actor['role'] ?? '')==='SUPER_ADMIN')$account.='<a href="/platform">กลับหลังบ้านกลาง</a>';
        $account.='<a href="/phase2demo/login">เลือกบัญชี</a><a href="/phase2demo/logout">ออกจากระบบ</a></div>';
        $body='<a class="skip" href="#main">ข้ามไปเนื้อหา</a><div class="workspace-v17" data-workspace-v16><header class="site-header"><div class="topbar"><div class="masthead-inner"><a class="brand" href="'.self::e(self::url('dashboard',$f,self::hasScopeFilters($f)?['dashboard_filters'=>'1']:[])).'"><img class="brand-logo" src="/assets/img/pmyc_top_logo.png" alt="Prime Minister’s Youth Cup Football" width="164" height="90"><div class="brand-copy"><b>Prime Minister&#39;s Youth CUP</b><small>FOOTBALL</small></div></a><p class="header-organizer">จัดการแข่งขันโดย สมาคมกีฬาฟุตบอลแห่งประเทศไทย และการกีฬาแห่งประเทศไทย</p></div></div><div class="utility-bar"><nav class="utility-inner" aria-label="เมนูส่วนหัว"><div class="utility-links"><button class="mobile-toggle" type="button" aria-label="เปิดหรือปิดเมนู" aria-controls="workspace-navigation" aria-expanded="false">'.self::icon('menu').'</button><a href="/">หน้าแรกเว็บไซต์ '.self::icon('arrow').'</a><span class="utility-system">ระบบบริหารการแข่งขัน</span></div><div class="role-navigation"><span class="role-tab active">'.self::e($roles[$actor['role'] ?? ''] ?? '').'</span></div></nav></div></header><div class="layout"><aside class="sidebar" id="workspace-navigation" aria-label="เมนูหลัก"><div class="sidebar-heading"><div class="sidebar-role"><span class="role-badge">'.self::e($roles[$actor['role'] ?? ''] ?? '').'</span><strong>'.self::e($region).'</strong></div><button class="sidebar-close" type="button" aria-label="ปิดเมนู">×</button></div><nav>'.$nav.'</nav><div class="side-bottom"><strong>การกีฬาแห่งประเทศไทย</strong><span>'.self::e($region).'</span>'.$account.'</div></aside><button class="workspace-backdrop" type="button" aria-label="ปิดเมนู" hidden></button><div class="workspace"><main id="main" class="content" tabindex="-1"><div class="workspace-context"><div class="breadcrumb"><a href="'.self::e(self::url('dashboard',$f,self::hasScopeFilters($f)?['dashboard_filters'=>'1']:[])).'">หน้าหลัก</a><span>/</span>'.($active==='detail'?'<a href="'.self::e(self::url('schedule',array_diff_key($f,['match_id'=>1]))).'">ตารางการแข่งขัน</a><span>/</span><span>รายละเอียดการแข่งขัน</span>':'<span>'.self::e($title).'</span>').'</div><div class="user"><div>'.self::e($actor['name'] ?? '').'<small>'.self::e($roles[$actor['role'] ?? ''] ?? '').'</small></div></div></div>'.(!empty($f['data_mode'])?'<span class="demo-pill">'.($f['data_mode']==='demo'?'ข้อมูล Demo':'ข้อมูลจริง').'</span>':'').$content.'<footer class="footer"><span>PMYC Football · งานจัดการแข่งขัน กกท.</span><span>'.self::e($region).'</span></footer></main></div></div></div>';
        return [$status,'<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.self::e($title).' · PMYC</title><link rel="stylesheet" href="/phase2demo/assets/workspace.css?v=issue96-venues-1">'.($active==='venues'?'<script src="/assets/data/thai-administrative-divisions.js" defer></script>':'').'<script src="/phase2demo/assets/app.js?v=53" defer></script><script src="/phase2demo/assets/workspace.js?v=ceremony-teams-2" defer></script></head><body data-authenticated="'.(!empty($actor)?'1':'0').'" data-role="'.self::e($actor['role'] ?? '').'" data-expires="'.self::e((string)($context['expiresAt'] ?? '')).'" data-ambiguous="'.(!empty($context['ambiguous'])?'1':'0').'">'.$body.'</body></html>'];
    }
    public static function heading(string $title,string $description='',string $actions='',string $kicker='COMPETITION OVERVIEW'):string
    {
        return '<div class="page-heading"><div><div class="heading-kicker">'.self::e($kicker).'</div><h1>'.self::e($title).'</h1>'.($description!==''?'<p>'.self::e($description).'</p>':'').'</div><div class="actions">'.$actions.'</div></div>';
    }
}
