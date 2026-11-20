<?php
declare(strict_types=1);
// Called only by the existing disposable PostgreSQL fixture, never operational Dev.
return (function(PDO $db,string $id,array $context,string $venue):array{
 $repo=new PMYC\Phase2\MatchRepository($db);$actor=$context['actor'];$match=$repo->get($id);
 $scope=(new PMYC\Phase2\CompetitionRepository($db))->get($match['competition_id']);
 $event=(new PMYC\Phase2\EventRepository($db))->get($scope['event_id']);
 $query=PMYC\Phase2\MatchDetailView::filters($scope,$event,$match,[],$actor);
 $path='/phase2demo/competitions/'.$scope['id'].'/matches/'.$id;
 $post=fn($data,$ctx=null,$q=null)=>PMYC\Phase2\MatchPages::render($path,'POST',$data,$ctx??$context,$q??$query,$db);
 $get=fn($q)=>PMYC\Phase2\MatchPages::render($path,'GET',[],$context,$q,$db);
 $snapshot=function()use($db,$id){$s=$db->prepare('SELECT row_to_json(m)::text FROM p2_match m WHERE id=?');$s->execute([$id]);return [$s->fetchColumn(),(int)$db->query('SELECT count(*) FROM p2_match_change')->fetchColumn(),(int)$db->query('SELECT count(*) FROM p2_audit_log')->fetchColumn()];};
 $input=fn()=>['_csrf'=>$context['csrf'],'operation'=>'schedule','version'=>(string)$repo->get($id)['version'],'request_id'=>PMYC\Phase2\EventRepository::uuid(),'venue_id'=>$venue,'start'=>'2026-12-02T09:00','end'=>'2026-12-02T10:00','reason'=>'Fixture <script>typed</script>'];
 $view=static function(array $response):array{
  $html=$response[1];preg_match('/name="start" value="([^"]*)"/',$html,$start);preg_match('/name="end" value="([^"]*)"/',$html,$end);
  preg_match('/name="reason" maxlength="300" value="([^"]*)"/',$html,$reason);
  return ['status'=>$response[0],'location'=>$response[2]??null,'new_shell'=>str_contains($html,'workspace-v17'),'legacy_css'=>str_contains($html,'/assets/app.css'),'alert'=>str_contains($html,'role="alert"'),'disabled'=>str_contains($html,'min-width:0" disabled'),
   'reason'=>$reason[1]??null,'start'=>$start[1]??null,'end'=>$end[1]??null,'success'=>str_contains($html,'บันทึกตารางแข่งขันเรียบร้อยแล้ว'),'escaped'=>str_contains($html,'&lt;script&gt;typed&lt;/script&gt;'),'unsafe'=>str_contains($html,'<script>typed'),
   'stale_version_preserved'=>str_contains($html,'name="version" value="0"'),'reload'=>str_contains($html,'โหลดข้อมูลล่าสุด'),'has_form'=>str_contains($html,'<form')];
 };
 $out=['errors'=>[]];
 $foreignProvince='กรุงเทพมหานคร';$foreignDistrict=PMYC\Phase2\AreaDirectory::districts()[$foreignProvince][0];
 $foreign=$repo->createVenue(['name'=>'Foreign fixture '.substr($id,0,8),'province'=>$foreignProvince,'district'=>$foreignDistrict,'request_id'=>PMYC\Phase2\EventRepository::uuid()],$actor);
 foreach(['end'=>['end'=>'2026-12-02T09:00'],'start'=>['start'=>''],'format'=>['start'=>'bad-time'],'reason'=>['reason'=>''],'venue'=>['venue_id'=>''],'foreign'=>['venue_id'=>$foreign],'outside'=>['start'=>'2027-01-02T09:00','end'=>'2027-01-02T10:00'],'stale'=>['version'=>'0'],'stale_invalid'=>['version'=>'0','reason'=>'']] as $name=>$change){
  $before=$snapshot();$response=$post(array_replace($input(),$change));$out['errors'][$name]=$view($response)+['unchanged'=>$before===$snapshot(),'transaction_closed'=>!$db->inTransaction()];
 }
 // Exercise conflict rendering without weakening started/cancelled guards.
 foreach(['started','cancelled'] as $name){
  $db->prepare('UPDATE p2_match SET state=?,started_at=? WHERE id=?')->execute([$name==='started'?'IN_PROGRESS':'CANCELLED',$name==='started'?'2026-12-02T09:00:00+07:00':null,$id]);
  $before=$snapshot();$out['errors'][$name]=$view($post($input()))+['unchanged'=>$before===$snapshot(),'transaction_closed'=>!$db->inTransaction()];
  $db->prepare('UPDATE p2_match SET state=?,started_at=? WHERE id=?')->execute([$match['state'],$match['started_at'],$id]);
 }
 // Inject an overlapping fixture into another match, then restore only those fixture fields.
 $s=$db->prepare('SELECT id,state,venue_id,scheduled_start,scheduled_end FROM p2_match WHERE draw_id=? AND id<>? ORDER BY number LIMIT 1');$s->execute([$match['draw_id'],$id]);$other=$s->fetch(PDO::FETCH_ASSOC);
 if(!$other)throw new RuntimeException('Missing overlap fixture match');
 $db->prepare("UPDATE p2_match SET state='SCHEDULED',venue_id=?,scheduled_start=?,scheduled_end=? WHERE id=?")->execute([$venue,'2026-12-02T09:00:00+07:00','2026-12-02T10:00:00+07:00',$other['id']]);
 $before=$snapshot();$out['errors']['overlap']=$view($post($input()))+['unchanged'=>$before===$snapshot(),'transaction_closed'=>!$db->inTransaction()];
 $db->prepare('UPDATE p2_match SET state=?,venue_id=?,scheduled_start=?,scheduled_end=? WHERE id=?')->execute([$other['state'],$other['venue_id'],$other['scheduled_start'],$other['scheduled_end'],$other['id']]);
 $s=$db->prepare("SELECT id,new_state FROM p2_audit_log WHERE action='DRAW_CONFIRMED_LOCKED' AND new_state->>'draw_id'=? ORDER BY id DESC LIMIT 1");$s->execute([$match['draw_id']]);$locked=$s->fetch(PDO::FETCH_ASSOC);
 if(!$locked)throw new RuntimeException('Missing draw lock fixture');
 $data=json_decode($locked['new_state'],true);$data['status']='PENDING_CONFIRMATION';$db->prepare('UPDATE p2_audit_log SET new_state=CAST(? AS jsonb) WHERE id=?')->execute([json_encode($data),$locked['id']]);
 $before=$snapshot();$out['errors']['unlocked']=$view($post($input()))+['unchanged'=>$before===$snapshot(),'transaction_closed'=>!$db->inTransaction()];
 $db->prepare('UPDATE p2_audit_log SET new_state=CAST(? AS jsonb) WHERE id=?')->execute([$locked['new_state'],$locked['id']]);
 $bad=$query;$bad['event_id']=PMYC\Phase2\EventRepository::uuid();$before=$snapshot();$out['errors']['context']=$view($post($input(),null,$bad))+['unchanged'=>$before===$snapshot(),'transaction_closed'=>!$db->inTransaction()];
 $bad=$context;$bad['actor']['role']='DOCUMENT_VERIFIER';$before=$snapshot();$out['forbidden']=$post($input(),$bad)[0];$out['csrf']=$post(array_replace($input(),['_csrf'=>'bad']))[0];$out['guard_unchanged']=$before===$snapshot();
 $before=$snapshot();$valid=$input();$saved=$post($valid);$after=$snapshot();$out['saved']=$view($saved);
 $out['change_delta']=$after[1]-$before[1];$out['audit_delta']=$after[2]-$before[2];
 $out['stored']=$repo->get($id);$out['retry']=$view($post($valid));$out['retry_unchanged']=$after===$snapshot();
 $out['request_conflict']=$view($post(array_replace($valid,['reason'=>'Changed request payload'])));$out['conflict_unchanged']=$after===$snapshot();
 parse_str(parse_url($saved[2],PHP_URL_QUERY),$follow);$out['follow']=$view($get($follow));$out['follow_context']=$follow;
 $out['refresh']=$view($get($query));$out['stale_success']=$view($get($query+['saved'=>'schedule','saved_version'=>(string)((int)$out['stored']['version']-1)]));
 return $out;
})($db,$scheduled['id'],$context,$venue);
