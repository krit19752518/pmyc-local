<?php
declare(strict_types=1);
spl_autoload_register(function(string $class):void {
    $prefix='PMYC\\Phase2\\';
    if(str_starts_with($class,$prefix))require __DIR__.'/../../phase2/src/'.substr($class,strlen($prefix)).'.php';
});
require __DIR__.'/../../phase2/src/Application.php';
use PMYC\Phase2\{Application,BracketPages,EventRepository,CompetitionRepository,RosterRepository,DrawRepository,DashboardReadModel,DashboardPages,AreaDirectory};
$db=EventRepository::connect();
$repo=new EventRepository($db);
$context=['actor'=>['id'=>'fixture-admin','name'=>'Fixture','role'=>'SUPER_ADMIN','province'=>null,'portal'=>'central'],'csrf'=>'fixture-csrf','expiresAt'=>time()*1000+60000,'ambiguous'=>false];
$input=['name'=>'Fixture <script>','season'=>'fixture-season','template'=>'pmyc-four-stage-v1','data_mode'=>'demo','start_date'=>'2026-12-01','end_date'=>'2026-12-31','divisions'=>['U14_BOY'],'request_id'=>EventRepository::uuid(),'_csrf'=>'fixture-csrf'];
$out=[];
function render(string $path,string $method='GET',array $data=[],?EventRepository $repo=null):array {global $context;return Application::render($path,$method,[],$data,$context,$repo);}
putenv('PHASE2_TEST_DSN');
$out['unconfigured']=render('/platform/events/preview','POST',$input);
$out['unconfigured_new']=render('/platform/events/new');
$out['unconfigured_submit']=render('/platform/events','POST',$input);
$out['missing_schema']=render('/platform/events/preview','POST',$input,$repo);
$db->exec(file_get_contents(__DIR__.'/../../sql/phase2-local-bootstrap.sql'));
$out['ready']=$repo->creationReady();
$out['before_preview']=(int)$db->query('SELECT count(*) FROM p2_event')->fetchColumn();
$out['preview']=render('/platform/events/preview','POST',$input,$repo);
$out['after_preview']=(int)$db->query('SELECT count(*) FROM p2_event')->fetchColumn();
$out['created']=render('/platform/events','POST',$input,$repo);
$out['retry']=render('/platform/events','POST',$input,$repo);
$out['event_count']=(int)$db->query('SELECT count(*) FROM p2_event')->fetchColumn();
$out['csrf']=render('/platform/events','POST',array_replace($input,['_csrf'=>'bad']),$repo);
$out['invalid']=render('/platform/events/preview','POST',array_replace($input,['divisions'=>[]]),$repo);
$context['actor']['role']='SAT_OFFICER';
$out['forbidden']=render('/platform/events','POST',$input,$repo);
$context['actor']['role']='SUPER_ADMIN';
$event=basename($out['created'][2]);
$db->exec("CREATE TABLE football_registered_team(id text PRIMARY KEY,team_name text,province text,district text,contact_district text,gender text,categories text,submitted_categories text,cancelled_categories text,status text,is_deleted boolean,is_test boolean,created_at timestamptz DEFAULT now()); CREATE TABLE football_player(id text PRIMARY KEY,team_id text,name text,jersey_no text,position text,category text,doc_status text); CREATE TABLE football_official(id text PRIMARY KEY,team_id text,name text,position text,categories text)");
$model=new DashboardReadModel($db);
$out['fresh_dashboard']=$model->load($context['actor'],['event_id'=>$event]);
$out['fresh_page']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$event],$context,$model);
$out['fresh_catalog']=$model->load($context['actor'],[]);
foreach(['setup','bracket','detail'] as $key)
    $out['fresh_placeholders'][$key]=DashboardPages::render('/phase2demo/workspace/pending-'.$key,'GET',['event_id'=>$event,'data_mode'=>'demo'],$context,$model);
$out['missing_event']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>EventRepository::uuid()],$context,$model);
$out['missing_event_placeholder']=DashboardPages::render('/phase2demo/workspace/pending-setup','GET',['event_id'=>EventRepository::uuid()],$context,$model);
foreach(['data_mode'=>'real','season_id'=>EventRepository::uuid(),'division_code'=>'U18_GIRL'] as $key=>$value)
    $out['fresh_conflicts'][$key]=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$event,$key=>$value],$context,$model);
foreach(['SAT_OFFICER','DOCUMENT_VERIFIER'] as $role){
    $other=$context;$other['actor']['role']=$role;$other['actor']['province']='เชียงใหม่';
    $out['unassigned'][$role]=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$event],$other,$model);
    $out['unassigned_placeholder'][$role]=DashboardPages::render('/phase2demo/workspace/pending-setup','GET',['event_id'=>$event],$other,$model);
    $out['unassigned_catalog'][$role]=$model->load($other['actor'],[]);
}
$out['fresh_no_children']=(int)$db->query('SELECT count(*) FROM p2_competition')->fetchColumn()===0&&(int)$db->query('SELECT count(*) FROM p2_match')->fetchColumn()===0;
// Synthetic Phase 1 tables exist only in the disposable PostgreSQL fixture.
$areas=AreaDirectory::districts();$province=array_key_first($areas);$district=$areas[$province][0];
$team=$db->prepare("INSERT INTO football_registered_team VALUES (?,?,?,?,?,'BOY','U14','U14','','APPROVED',false,CAST(? AS boolean),now())");
foreach(['phase1-demo-a','phase1-demo-b','phase1-real'] as $id){
    $team->execute([$id,'Synthetic '.$id,$province,$district,$district,$id==='phase1-real'?'false':'true']);
    $db->prepare("INSERT INTO football_player VALUES (?,?,?,?,'GK','U14','APPROVED')")->execute(['player-'.$id,$id,'Synthetic player','1']);
}
$original=$db->query('SELECT row_to_json(t)::text FROM football_registered_team t ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
$competitions=new CompetitionRepository($db);
$division=$competitions->divisions($event)[0]['id'];
$competition=$competitions->create($event,['division_id'=>$division,'stage'=>1,'province'=>$province,'district'=>$district],$context['actor'],EventRepository::uuid())['id'];
foreach(['SAT_OFFICER','DOCUMENT_VERIFIER'] as $role){
    $assigned=$context;$assigned['actor']['id']='assigned-'.$role;$assigned['actor']['role']=$role;$assigned['actor']['province']=$province;
    $db->prepare("INSERT INTO p2_competition_assignment(competition_id,actor_id,actor_role,permissions,active,version,last_request_id,last_request_hash,updated_by) VALUES (?,?,?,'[\"view\"]',true,1,?,'synthetic','fixture-admin')")
       ->execute([$competition,$assigned['actor']['id'],$role,EventRepository::uuid()]);
    $out['assigned'][$role]=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$event],$assigned,$model);
    $out['assigned_catalog'][$role]=$model->load($assigned['actor'],[]);
}
$rosters=new RosterRepository($db);
$out['roster']=$rosters->save($competition,$context['actor'],['operation'=>'import','request_id'=>EventRepository::uuid(),'version'=>'0','teams'=>['phase1-demo-a','phase1-demo-b']]);
$rosters->save($competition,$context['actor'],['operation'=>'lock','request_id'=>EventRepository::uuid(),'version'=>'1','teams'=>['phase1-demo-a','phase1-demo-b']]);
$draw=(new DrawRepository($db))->execute($competition,$context['actor'],['operation'=>'create','request_id'=>EventRepository::uuid(),'version'=>'0']);
$out['match_count']=(int)$db->query('SELECT count(*) FROM p2_match')->fetchColumn();
$out['dashboard']=(new DashboardReadModel($db))->load($context['actor'],['event_id'=>$event]);
$db->exec("UPDATE football_player SET doc_status='PENDING' WHERE team_id='phase1-demo-a'");
$db->exec("UPDATE football_registered_team SET is_deleted=true WHERE id IN ('phase1-demo-a','phase1-demo-b')");
$out['frozen_roster']=(new DashboardReadModel($db))->load($context['actor'],['event_id'=>$event,'province'=>$province,'district'=>$district]);
$db->exec("UPDATE football_registered_team SET is_deleted=false WHERE id IN ('phase1-demo-a','phase1-demo-b')");
$db->exec("UPDATE football_player SET doc_status='APPROVED' WHERE team_id='phase1-demo-a'");
$out['phase1_unchanged']=$original===$db->query('SELECT row_to_json(t)::text FROM football_registered_team t ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
// A later event reuses the same Phase 1 teams, without reusing fixtures/results.
$db->prepare("UPDATE p2_event SET status='CLOSED' WHERE id=?")->execute([$event]);
$secondInput=array_replace($input,['name'=>'Second fixture event','request_id'=>EventRepository::uuid()]);
$out['second_created']=render('/platform/events','POST',$secondInput,$repo);
$secondEvent=basename($out['second_created'][2]);
foreach(['SAT_OFFICER','DOCUMENT_VERIFIER'] as $role){
    $assigned=$context;$assigned['actor']['id']='assigned-'.$role;$assigned['actor']['role']=$role;$assigned['actor']['province']=$province;
    $out['assigned_other_event'][$role]=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$secondEvent],$assigned,$model);
}
$secondDivision=$competitions->divisions($secondEvent)[0]['id'];
$secondCompetition=$competitions->create($secondEvent,['division_id'=>$secondDivision,'stage'=>1,'province'=>$province,'district'=>$district],$context['actor'],EventRepository::uuid())['id'];
$secondRoster=$rosters->save($secondCompetition,$context['actor'],['operation'=>'import','request_id'=>EventRepository::uuid(),'version'=>'0','teams'=>['phase1-demo-a','phase1-demo-b']]);
$out['empty_bracket']=BracketPages::render('GET',['competition_id'=>$secondCompetition,'data_mode'=>'demo'],$context,$db);
$out['second_team_ids']=array_column($secondRoster['teams'],'source_team_id');
$out['second_dashboard']=(new DashboardReadModel($db))->load($context['actor'],['event_id'=>$secondEvent]);
$out['first_dashboard_after_second']=(new DashboardReadModel($db))->load($context['actor'],['event_id'=>$event]);
$out['original_draw_unchanged']=$draw['id']===$db->query("SELECT draw_version_id FROM p2_competition WHERE id=".$db->quote($competition))->fetchColumn();
$thirdInput=array_replace($input,['name'=>'Later stages only','divisions'=>['U18_GIRL'],'request_id'=>EventRepository::uuid()]);
$thirdResponse=render('/platform/events','POST',$thirdInput,$repo);$third=basename($thirdResponse[2]);
$thirdDivision=$competitions->divisions($third)[0]['id'];
$competitions->create($third,['division_id'=>$thirdDivision,'stage'=>3,'zone'=>'AB'],$context['actor'],EventRepository::uuid());
$out['stage3_dashboard']=$model->load($context['actor'],['event_id'=>$third]);
$out['stage3_page']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>$third],$context,$model);
// A repeated bootstrap must fail rather than partially reconcile an existing schema.
try{$db->exec(file_get_contents(__DIR__.'/../../sql/phase2-local-bootstrap.sql'));$out['repeat_rejected']=false;}catch(PDOException $e){$db->exec('ROLLBACK');$out['repeat_rejected']=true;}
$out['event_survived']=(int)$db->query('SELECT count(*) FROM p2_event')->fetchColumn();
$out['selection']=require __DIR__.'/phase2-team-selection.php';
$out['ceremony']=require __DIR__.'/phase2-ceremony.php';
$out['legacy_history']=PMYC\Phase2\CeremonyPages::render('GET',['competition_id'=>$competition],[],$context,$db,'history');
$out['venues']=require __DIR__.'/issue96-venue-postgres.php';
echo json_encode($out,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
