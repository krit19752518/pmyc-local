<?php
declare(strict_types=1);
// Included only by the disposable PostgreSQL fixture, never by the application.
use PMYC\Phase2\{EventRepository,EventDraft,DashboardReadModel,DashboardPages,RegistrationAdapter,AreaDirectory,DrawEngine};
return (function(PDO $db):array {
    $admin=['id'=>'selection-admin','name'=>'Selection fixture','role'=>'SUPER_ADMIN','province'=>null];
    $context=['actor'=>$admin,'csrf'=>'fixture','expiresAt'=>time()*1000+60000,'ambiguous'=>false];
    $draft=EventDraft::validate(['name'=>'Selection fixture event','season'=>'selection-season','template'=>'pmyc-four-stage-v1','data_mode'=>'demo','start_date'=>'2026-12-01','end_date'=>'2026-12-31','divisions'=>['U14_BOY','U16_BOY','U18_GIRL']])['draft'];
    $event=(new EventRepository($db))->create($draft,$admin['id'],EventRepository::uuid())['id'];
    $model=new DashboardReadModel($db);$adapter=new RegistrationAdapter($db);
    $insert=$db->prepare('INSERT INTO football_registered_team(id,team_name,province,district,contact_district,gender,categories,submitted_categories,cancelled_categories,status,is_deleted,is_test,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,CAST(? AS boolean),CAST(? AS boolean),?)');
    $player=$db->prepare('INSERT INTO football_player(id,team_id,name,jersey_no,position,category,doc_status) VALUES (?,?,?,? ,?,?,?)');
    $add=function(string $id,string $district,array $changes=[])use($insert,$player):void{
        $t=array_replace(['name'=>'Synthetic '.$id,'province'=>'เชียงใหม่','district'=>$district,'contact'=>$district,'gender'=>'BOY','categories'=>'U14','submitted'=>'U14','cancelled'=>'','status'=>'APPROVED','deleted'=>'false','demo'=>'true','created'=>'2020-01-01 00:00:00','player'=>'APPROVED','player_category'=>'U14'],$changes);
        $insert->execute([$id,$t['name'],$t['province'],$t['district'],$t['contact'],$t['gender'],$t['categories'],$t['submitted'],$t['cancelled'],$t['status'],$t['deleted'],$t['demo'],$t['created']]);
        if($t['player']!==null)$player->execute(['p-'.$id,$id,'Synthetic player','1','GK',$t['player_category'],$t['player']]);
    };
    // Earlier invalid applications must not consume any of the first eight places.
    foreach(['pending-team'=>['status'=>'PENDING'],'pending-player'=>['player'=>'PENDING'],'no-player'=>['player'=>null],
        'cancelled'=>['cancelled'=>'U14'],'unsubmitted'=>['submitted'=>''],'deleted'=>['deleted'=>'true'],
        'wrong-gender'=>['gender'=>'GIRL'],'null-gender'=>['gender'=>null],'wrong-age'=>['categories'=>'U16','submitted'=>'U16','player_category'=>'U16']] as $id=>$changes)
        $add('invalid-'.$id,'แม่ริม',$changes+['created'=>'2000-01-01 00:00:00']);
    // Insert in reverse order; same timestamps for 01/02 must break ties by source ID.
    foreach(range(10,1) as $n){
        $id=sprintf('rank-%02d',$n);
        $add($id,'แม่ริม',['created'=>sprintf('2020-01-%02d 09:00:00',max(2,$n)),'name'=>$n===1?'<img src=x onerror=alert(1)>':'Synthetic '.$id]);
    }
    $add('null-time','แม่ริม',['created'=>null]);
    $add('real-team','แม่ริม',['demo'=>'false','created'=>'1990-01-01 00:00:00']);
    $add('real-only-province','เมืองภูเก็ต',['province'=>'ภูเก็ต','demo'=>'false']);
    $add('deleted-province','เมืองพังงา',['province'=>'พังงา','deleted'=>'true']);
    $add('cancelled-province','เมืองลำพูน',['province'=>'ลำพูน','cancelled'=>'U14']);
    $add('girl-only-province','เมืองลำปาง',['province'=>'ลำปาง','gender'=>'GIRL']);
    // A pending athlete in another age category must not disqualify the selected U14 team.
    $player->execute(['other-age','rank-01','Synthetic other age','2','DF','U16','PENDING']);
    $query=['event_id'=>$event,'season_id'=>(new EventRepository($db))->get($event)['season_id'],'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','district'=>'แม่ริม'];
    $scope=['stage'=>1,'division_code'=>'U14_BOY','province'=>'เชียงใหม่','district'=>'แม่ริม','is_test'=>true];
    $result=['event_id'=>$event,'dashboard'=>$model->load($admin,$query),'summary'=>$adapter->candidates($scope,false,true),
        'full_ids'=>array_column($adapter->candidates($scope),'source_team_id'),
        'setup'=>DashboardPages::render('/phase2demo/workspace/pending-setup','GET',$query,$context,$model)];
    $noSelection=$query;unset($noSelection['province'],$noSelection['district']);
    $result['no_selection']=$model->load($admin,$noSelection);
    $realDraft=array_replace($draft,['is_test'=>false,'name'=>'Real selection fixture']);
    $realEvent=(new EventRepository($db))->create($realDraft,$admin['id'],EventRepository::uuid())['id'];
    $result['real_options']=$model->load($admin,array_replace($noSelection,['event_id'=>$realEvent]));
    foreach(['dashboard','pending-setup'] as $page){
        $result['non_demo_province'][$page]=DashboardPages::render('/phase2demo/workspace/'.$page,'GET',array_replace($query,['province'=>'ภูเก็ต','district'=>'เมืองภูเก็ต']),$context,$model);
        $emptyDistrict=array_values(array_diff(AreaDirectory::districts()['เชียงใหม่'],['แม่ริม']))[0];
        $result['non_demo_district'][$page]=DashboardPages::render('/phase2demo/workspace/'.$page,'GET',array_replace($query,['district'=>$emptyDistrict]),$context,$model);
    }
    $emptyContext=array_replace($context,['actor'=>array_replace($admin,['role'=>'SAT_OFFICER','province'=>'ภูเก็ต'])]);
    $result['sat_no_demo']=$model->load($emptyContext['actor'],array_replace($noSelection,['province'=>'ภูเก็ต']));
    $result['sat_no_demo_page']=DashboardPages::render('/phase2demo/workspace/pending-setup','GET',array_replace($noSelection,['province'=>'ภูเก็ต']),$emptyContext,$model);
    $result['empty_division']=$model->load($admin,array_replace($noSelection,['division_code'=>'U18_GIRL']));
    $add('u16-bangkok','ดินแดง',['province'=>'กรุงเทพมหานคร','gender'=>'BOY','categories'=>'U16','submitted'=>'U16','player_category'=>'U16']);
    $result['u16_areas']=$model->load($admin,array_replace($noSelection,['division_code'=>'U16_BOY']));
    $result['u16_bangkok_page']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',array_replace($noSelection,['dashboard_filters'=>'1','division_code'=>'U16_BOY','province'=>'กรุงเทพมหานคร']),$context,$model);
    foreach(['DOCUMENT_VERIFIER','SAT_OFFICER'] as $role){
        $actor=array_replace($admin,['id'=>'unassigned-'.$role,'role'=>$role,'province'=>$role==='SAT_OFFICER'?'เชียงใหม่':null]);
        $ctx=array_replace($context,['actor'=>$actor]);
        $result['roles'][$role]=$model->load($actor,$query);
        $result['role_setup'][$role]=DashboardPages::render('/phase2demo/workspace/pending-setup','GET',$query,$ctx,$model);
    }
    $sat=array_replace($context,['actor'=>array_replace($admin,['role'=>'SAT_OFFICER','province'=>'เชียงใหม่'])]);
    foreach(['dashboard','pending-setup'] as $page){
        $path='/phase2demo/workspace/'.$page;
        $result['foreign_province'][$page]=DashboardPages::render($path,'GET',array_replace($query,['province'=>'กรุงเทพมหานคร','district'=>'ปทุมวัน']),$sat,$model);
        $result['wrong_district'][$page]=DashboardPages::render($path,'GET',array_replace($query,['district'=>'ปทุมวัน']),$context,$model);
    }
    $districts=array_values(array_diff(AreaDirectory::districts()['เชียงใหม่'],['แม่ริม']));
    foreach([0,1,2,3,4,5,6,7,8,10] as $i=>$count){
        $district=$districts[$i];
        if($count===0)$add('size-0-pending',$district,['status'=>'PENDING']);
        foreach(range(1,max(1,$count)) as $n)if($count)$add('size-'.$count.'-'.$n,$district);
        $q=array_replace($query,['district'=>$district]);
        $data=$model->load($admin,$q);
        $result['sizes'][$count]=['count'=>$data['team_count'],'ids'=>array_column($data['eligible_teams'],'source_team_id'),
            'page'=>DashboardPages::render('/phase2demo/workspace/pending-setup','GET',$q,$context,$model)];
        if($data['eligible_teams']){
            $generated=DrawEngine::generate($data['eligible_teams']);
            $result['sizes'][$count]['fixtures']=count($generated['fixtures']);
            $result['sizes'][$count]['qualifiers']=count($generated['automatic_qualifiers']);
        }
    }
    $result['stage2']=$model->load($admin,array_replace($query,['stage'=>'2']));
    $result['real_ids']=array_column($adapter->candidates(array_replace($scope,['is_test'=>false]),false,true),'source_team_id');
    // Registration source data changes refresh the preview before any draw is committed.
    $db->exec("UPDATE football_player SET doc_status='APPROVED' WHERE team_id='invalid-pending-player'");
    $result['after_approval_ids']=array_column($model->load($admin,$query)['eligible_teams'],'source_team_id');
    $add('new-demo-province','เมืองขอนแก่น',['province'=>'ขอนแก่น','status'=>'PENDING']);
    $result['after_new_demo_province']=$model->load($admin,$noSelection);
    $result['no_implicit_competitions']=(int)$db->query("SELECT count(*) FROM p2_competition WHERE event_id=".$db->quote($event))->fetchColumn()===0;
    return $result;
})($db);
