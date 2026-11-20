<?php
declare(strict_types=1);
return (function(PDO $db,array $context):array{
 $request=PMYC\Phase2\EventRepository::uuid();$name='สนาม fixture96 '.substr($request,0,8);
 $input=['_csrf'=>$context['csrf'],'request_id'=>$request,'name'=>$name,'province'=>'เชียงใหม่','district'=>'หางดง'];
 $render=fn($method,$data=[])=>PMYC\Phase2\MatchPages::render('/platform/venues',$method,$data,$context,[],$db);
 $before=(int)$db->query('SELECT count(*) FROM p2_venue')->fetchColumn();
 $created=$render('POST',$input);$retry=$render('POST',$input);
 $stmt=$db->prepare('SELECT * FROM p2_venue WHERE request_id=?');$stmt->execute([$request]);$row=$stmt->fetch(PDO::FETCH_ASSOC);
 $duplicate=$render('POST',array_replace($input,['request_id'=>PMYC\Phase2\EventRepository::uuid()]));
 $audit=$db->prepare("SELECT count(*) FROM p2_platform_audit WHERE request_id=? AND action='VENUE_CREATED'");$audit->execute([$request]);
 $repo=new PMYC\Phase2\MatchRepository($db);
 return ['created'=>$created,'retry'=>$retry,'duplicate_status'=>$duplicate[0],
  'count_delta'=>(int)$db->query('SELECT count(*) FROM p2_venue')->fetchColumn()-$before,'audit_count'=>(int)$audit->fetchColumn(),
  'complete'=>is_array($row)&&count(array_filter(array_intersect_key($row,array_flip(['id','name','province','district','created_by','created_at','request_id','request_hash'])),fn($v)=>$v!==null&&$v!==''))===8,
  'visible'=>in_array($row['id']??'',array_column($repo->venues('เชียงใหม่'),'id'),true),
  'foreign_hidden'=>!in_array($row['id']??'',array_column($repo->venues('กรุงเทพมหานคร'),'id'),true),
  'listing'=>$render('GET')];
})($db,$context);
