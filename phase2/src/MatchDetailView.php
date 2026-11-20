<?php
declare(strict_types=1);
namespace PMYC\Phase2;

/** Staff match presentation. Authorization and mutations stay in the repositories. */
final class MatchDetailView
{
    public static function filters(array $scope,array $event,array $match,array $query,array $actor):array
    {
        $f=DashboardReadModel::query($query,$actor);
        $expected=['event_id'=>$scope['event_id'],'season_id'=>$event['season_id'],'competition_id'=>$scope['id'],
            'match_id'=>$match['id'],'data_mode'=>in_array($scope['is_test'],[true,1,'1','t'],true)?'demo':'real',
            'division_code'=>$scope['division_code'],'stage'=>(string)$scope['stage'],
            'province'=>(string)($scope['province'] ?? ''),'district'=>(string)($scope['district'] ?? '')];
        foreach($expected as $key=>$value){
            if($f[$key]!==''&&$f[$key]!==$value)throw new \InvalidArgumentException('ตัวกรองไม่ตรงกับคู่แข่งขันที่เลือก');
            $f[$key]=$value;
        }
        return $f;
    }
    public static function url(string $base,array $filters,string $tab='schedule'):string
    {
        $q=array_intersect_key($filters,array_flip(DashboardReadModel::FILTERS));
        unset($q['match_id']); // The match identity is already in the path.
        if($tab!=='schedule')$q['tab']=$tab;
        return $base.'?'.http_build_query($q);
    }
    public static function tab(array $query):string
    {
        $tab=$query['tab'] ?? 'schedule';
        if(!is_string($tab)||!in_array($tab,['schedule','post','audit'],true))throw new \InvalidArgumentException('ส่วนของรายละเอียดไม่ถูกต้อง');
        return $tab;
    }
    public static function hero(array $match,array $draw,array $sides,?array $official):string
    {
        $e=WorkspaceView::e(...);$names=array_column($draw['slots'] ?? [],'name','source_team_id');
        $home=$names[$sides['a'] ?? ''] ?? 'รอทีมผ่านเข้ารอบ';$away=$names[$sides['b'] ?? ''] ?? 'รอทีมผ่านเข้ารอบ';
        $result=$official['result'] ?? null;$score=$result?$e($result['total_a']).' : '.$e($result['total_b']):'VS';
        $sub=$result&&($result['type'] ?? '')==='PENALTIES'?'จุดโทษ '.$result['penalties_a'].' : '.$result['penalties_b']:'รอบที่ '.$match['round'];
        return '<div class="score-hero match-detail-hero"><div><span class="crest" aria-hidden="true">H</span><strong>'.$e($home).'</strong><small>ทีมเหย้า</small></div><div><div class="big-score">'.$score.'</div><small>'.$e($sub).'</small></div><div><span class="crest alt" aria-hidden="true">A</span><strong>'.$e($away).'</strong><small>ทีมเยือน</small></div></div>';
    }
    public static function page(string $body,array $scope,array $match,array $draw,array $sides,?array $official,array $context,array $filters,string $base,string $tab='schedule',int $status=200):array
    {
        $e=WorkspaceView::e(...);$back=$filters;$back['match_id']='';
        $actions='<a class="btn" href="'.$e(WorkspaceView::url('schedule',$back)).'">กลับตารางการแข่งขัน</a>'
            .'<a class="btn" href="'.$e(WorkspaceView::url('bracket',$back)).'">'.WorkspaceView::icon('bracket').'ดูสายการแข่งขัน</a>';
        $heading=WorkspaceView::heading('รายละเอียดการแข่งขัน · M'.str_pad((string)$match['number'],2,'0',STR_PAD_LEFT),
            implode(' · ',array_filter([$scope['season'] ?? '',EventDraft::DIVISIONS[$scope['division_code']] ?? $scope['division_code'],
                'Stage '.$scope['stage'],$scope['province'] ?? '',$scope['district'] ?? ''])),$actions,'MATCH DETAIL');
        $tabs='<nav class="tabs match-detail-tabs" aria-label="ส่วนของรายละเอียดการแข่งขัน">';
        foreach(['schedule'=>'กำหนดการแข่งขัน','post'=>'ข้อมูลหลังการแข่งขัน','audit'=>'ประวัติการดำเนินการ'] as $key=>$label)
            $tabs.='<a class="tab '.($key===$tab?'active':'').'"'.($key===$tab?' aria-current="page"':'').' href="'.$e(self::url($base,$filters,$key)).'">'.$label.'</a>';
        $tabs.='</nav>';
        return WorkspaceView::page('detail',$heading.self::hero($match,$draw,$sides,$official).$tabs
            .'<div class="match-detail-content" data-match-detail-v17>'.$body.'</div>',$context,$filters,$status);
    }
}
