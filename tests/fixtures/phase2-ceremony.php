<?php
declare(strict_types=1);
use PMYC\Phase2\{AreaDirectory,BracketPages,CeremonyPages,CompetitionRepository,DrawPages,DrawRepository,EventRepository,MatchRepository,SchedulePages};

return (function(PDO $db, string $event, array $context): array {
    $actor = $context['actor'];
    $competitions = new CompetitionRepository($db);
    $draws = new DrawRepository($db);
    $division = $competitions->divisions($event)[0]['id'];
    $districts = array_values(array_diff(AreaDirectory::districts()['เชียงใหม่'], ['แม่ริม']));
    $filters = ['event_id'=>$event,'season_id'=>(new EventRepository($db))->get($event)['season_id'],'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','data_mode'=>'demo'];
    $render = fn(string $method,array $query,array $input=[],?array $ctx=null)=>CeremonyPages::render($method,$query,$input,$ctx ?? $context,$db);
    $review = fn(string $method,array $query,array $input=[],?array $ctx=null)=>CeremonyPages::render($method,$query,$input,$ctx ?? $context,$db,'result');
    $history = fn(string $method,array $query,?array $ctx=null)=>CeremonyPages::render($method,$query,[],$ctx ?? $context,$db,'history');
    $bracket = fn(string $method,array $query,?array $ctx=null)=>BracketPages::render($method,$query,$ctx ?? $context,$db);
    $schedule = fn(string $method,array $query,array $input=[],?array $ctx=null)=>SchedulePages::render($method,$query,$input,$ctx ?? $context,$db);
    $formInput = function(array $page): array {
        preg_match_all('/<input type="hidden" name="([^"]+)" value="([^"]*)">/', $page[1], $matches);
        return array_combine($matches[1], array_map(fn($value)=>html_entity_decode($value,ENT_QUOTES,'UTF-8'),$matches[2]));
    };
    $out = [];
    foreach ([0,1,3,8] as $count) {
        $index = array_search($count,[0,1,2,3,4,5,6,7,8,10],true);
        $district = $districts[$index];
        $query = $filters + ['district'=>$district];
        $out['missing'] = $render('GET',$query);
        if ($count === 0) {
            $out['prepare_zero'] = $render('POST', $query, ['_csrf'=>$context['csrf'],'request_id'=>EventRepository::uuid(),'operation'=>'prepare_ceremony']);
        }
        if ($count === 8) {
            $counts = fn()=>array_map('intval', $db->query('SELECT (SELECT count(*) FROM p2_competition),(SELECT count(*) FROM p2_roster_revision),(SELECT count(*) FROM p2_draw_version),(SELECT count(*) FROM p2_match)')->fetch(PDO::FETCH_NUM));
            $before = $counts();
            $prep = $render('GET', $query);
            $out['preparation']['page'] = $prep;
            $out['preparation']['get_readonly'] = $before === $counts();
            $prepare = $formInput($prep);
            $out['preparation']['csrf'] = $render('POST', $query, array_replace($prepare, ['_csrf'=>'invalid']));
            foreach (['DOCUMENT_VERIFIER','SAT_OFFICER'] as $role) {
                $ctx = array_replace($context, ['actor'=>['id'=>'prepare-'.$role,'role'=>$role,'province'=>'เชียงใหม่']]);
                $out['preparation']['forbidden'][$role] = $render('POST', $query, $prepare, $ctx);
            }
            $out['preparation']['stage2'] = $render('POST', array_replace($query,['stage'=>'2']), $prepare);
            $out['preparation']['bad_request'] = $render('POST', $query, array_replace($prepare,['request_id'=>'invalid']));
            $db->exec("UPDATE football_player SET doc_status='PENDING' WHERE team_id LIKE 'size-8-%'");
            $out['preparation']['no_eligible'] = $render('POST', $query, $prepare);
            $db->exec("UPDATE football_player SET doc_status='APPROVED' WHERE team_id LIKE 'size-8-%'");
            $oldStatus = $db->query('SELECT status FROM p2_event WHERE id='.$db->quote($event))->fetchColumn();
            $db->prepare("UPDATE p2_event SET status='CLOSED' WHERE id=?")->execute([$event]);
            $out['preparation']['closed'] = $render('POST', $query, $prepare);
            $db->prepare('UPDATE p2_event SET status=? WHERE id=?')->execute([$oldStatus,$event]);
            $out['preparation']['guards_readonly'] = $before === $counts();
            $out['preparation']['post'] = $render('POST', $query, $prepare);
            $id = $competitions->findDrawScope($query)['id'];
            $out['preparation']['retry'] = $render('POST', $query, $prepare);
            $out['preparation']['new_request'] = $render('POST', $query, array_replace($prepare,['request_id'=>EventRepository::uuid()]));
            $after = $counts();
            $out['preparation']['only_competition_created'] = $after === [$before[0]+1,$before[1],$before[2],$before[3]];
        } else {
            $id = $competitions->create($event,['division_id'=>$division,'stage'=>1,'province'=>'เชียงใหม่','district'=>$district],$actor,EventRepository::uuid())['id'];
        }
        $page = $render('GET',$query);
        $out['cases'][$count]['form'] = $page;
        $out['cases'][$count]['empty_review'] = $review('GET',$query);
        if ($count === 0) $out['empty_history'] = $history('GET',$query);
        if ($count === 0) continue;
        $input = $formInput($page);
        if ($count === 3) {
            $out['wrong_mode'] = $render('POST',array_replace($query,['data_mode'=>'real']),$input);
            $out['csrf'] = $render('POST',$query,array_replace($input,['_csrf'=>'wrong']));
            $sat = array_replace($context,['actor'=>['id'=>'fixture-sat','name'=>'SAT fixture','role'=>'SAT_OFFICER','province'=>'กรุงเทพมหานคร']]);
            $out['wrong_province'] = $render('POST',$query,$input,$sat);
            $sat['actor']['province'] = 'เชียงใหม่';
            $out['unassigned'] = $render('POST',$query,$input,$sat);
            $db->exec("UPDATE football_player SET doc_status='PENDING' WHERE team_id='size-3-1'");
            $out['stale'] = $render('POST',$query,$input);
            $out['stale_draw_absent'] = $draws->current($id)===null;
            $db->exec("UPDATE football_player SET doc_status='APPROVED' WHERE team_id='size-3-1'");
        }
        $result = $render('POST',$query,$input);
        $draw = $draws->current($id);
        $out['cases'][$count]['post'] = $result;
        $out['cases'][$count]['retry'] = $render('POST',$query,$input);
        $out['cases'][$count]['refresh'] = $render('GET',$query);
        $out['cases'][$count]['reveal'] = $render('GET',$query+['reveal'=>$draw['id']]);
        $out['cases'][$count]['fixture_count'] = count($draw['fixtures']);
        $out['cases'][$count]['history_count'] = count($draws->history($id));
        $out['cases'][$count]['status'] = $draws->ceremonyStatus($event,$draw['id']);
        if ($count === 8) {
            $syntheticDraw = $draw;
            $syntheticDraw['slots'][0]['name'] = 'โรงเรียนตัวอย่างชื่อทีมฟุตบอลเยาวชนยาวมากสำหรับทดสอบหลายบรรทัด <script>alert(1)</script>';
            $presentation = new ReflectionMethod(CeremonyPages::class, 'ceremonyResult');
            $out['long_team_presentation'] = $presentation->invoke(null, $query, $syntheticDraw, true);
        }

        $out['cases'][$count]['review'] = $review('GET',$query);
        if ($count === 1) $out['single_history'] = $history('GET',$query);
        $confirm = $formInput($out['cases'][$count]['review']);
        if ($count !== 3) {
            $out['cases'][$count]['confirm'] = $review('POST',$query,$confirm);
            $out['cases'][$count]['locked_replay'] = $render('GET',$query+['reveal'=>$draw['id']]);
            $out['cases'][$count]['replay_history_count'] = count($draws->history($id));
            continue;
        }
        $out['reveal'] = $render('GET',$query+['reveal'=>$draw['id']]);
        $out['pending_history'] = $history('GET',$query);
        $out['pending_bracket'] = $bracket('GET',$query);
        $out['different_request'] = $render('POST',$query,array_replace($input,['request_id'=>EventRepository::uuid()]));
        try {
            $draws->execute($id,$actor,['operation'=>'publish','version'=>1,'request_id'=>EventRepository::uuid()]);
            $out['legacy_publish_blocked'] = false;
        } catch (DomainException $error) { $out['legacy_publish_blocked'] = true; }
        $match = $db->prepare('SELECT id FROM p2_match WHERE draw_id=? ORDER BY number LIMIT 1');
        $match->execute([$draw['id']]);
        try {
            (new MatchRepository($db))->execute($match->fetchColumn(),$actor,['operation'=>'start','version'=>0,'reason'=>'Fixture','request_id'=>EventRepository::uuid()]);
            $out['pending_schedule_blocked'] = false;
        } catch (DomainException $error) { $out['pending_schedule_blocked'] = str_contains($error->getMessage(),'ต้องยืนยันและล็อก'); }
        $redraw = $formInput($render('GET',$query+['redraw'=>'1']));
        $out['redraw_missing_reason'] = $render('POST',$query,$redraw);
        $out['redraw'] = $render('POST',$query,$redraw+['reason'=>'Fixture redraw']);
        $out['redraw_versions'] = array_column($draws->history($id),'version');
        $latest = $draws->current($id);
        $out['stale_confirm'] = $review('POST',$query,$confirm);
        $confirm = $formInput($review('GET',$query));
        $other = $context;
        $other['actor']['id'] = 'other-admin';
        $out['other_review'] = $review('GET',$query,[],$other);
        $out['other_confirm'] = $review('POST',$query,$confirm,$other);
        $out['foreign_confirm'] = $review('POST',$query,$confirm,array_replace($context,['actor'=>['id'=>'outside','role'=>'SAT_OFFICER','province'=>'กรุงเทพมหานคร']]));
        $out['confirm'] = $review('POST',$query,$confirm);
        $out['confirm_retry'] = $review('POST',$query,$confirm);
        $out['confirm_again'] = $review('POST',$query,array_replace($confirm,['request_id'=>EventRepository::uuid()]));
        $out['locked_review'] = $review('GET',$query);
        $out['locked_bracket'] = $bracket('GET',$query);
        $satBracket = array_replace($context,['actor'=>['id'=>'bracket-sat','name'=>'SAT bracket fixture','role'=>'SAT_OFFICER','province'=>'เชียงใหม่']]);
        $db->prepare("INSERT INTO p2_competition_assignment(competition_id,actor_id,actor_role,permissions,active,version,last_request_id,last_request_hash,updated_by) VALUES (?,?,'SAT_OFFICER','[\"view\"]',true,1,?,'bracket','fixture-admin')")
            ->execute([$id,$satBracket['actor']['id'],EventRepository::uuid()]);
        $out['assigned_bracket'] = $bracket('GET',$query,$satBracket);
        $foreignBracket = array_replace($satBracket,['actor'=>array_replace($satBracket['actor'],['province'=>'กรุงเทพมหานคร'])]);
        $out['foreign_bracket'] = $bracket('GET',$query,$foreignBracket);
        $out['locked_history'] = $history('GET',$query);
        $out['history_post'] = $history('POST',$query);
        $out['history_wrong_mode'] = $history('GET',array_replace($query,['data_mode'=>'real']));
        $out['history_foreign'] = $history('GET',['competition_id'=>$id],array_replace($context,[
            'actor'=>['id'=>'outside','role'=>'SAT_OFFICER','province'=>'กรุงเทพมหานคร'],
        ]));
        $out['history_unassigned'] = $history('GET',$query,$sat);
        $db->exec("UPDATE football_registered_team SET team_name='Renamed after drawing' WHERE id='size-3-1'");
        $out['history_unchanged'] = $history('GET',$query) === $out['locked_history'];
        $state = $draws->ceremonyState($event,$latest['id']);
        $out['confirmed_state'] = $state;
        $audit = $db->prepare("SELECT count(*) FROM p2_audit_log WHERE action='DRAW_CONFIRMED_LOCKED' AND new_state->>'draw_id'=?");
        $audit->execute([$latest['id']]);
        $out['confirm_count'] = (int)$audit->fetchColumn();
        $out['same_draw'] = $latest === $draws->current($id);
        $match->execute([$latest['id']]);
        $matches = new MatchRepository($db);
        $venue = $matches->createVenue(['name'=>'Fixture venue','province'=>'เชียงใหม่','district'=>$district,'request_id'=>EventRepository::uuid()],$actor);
        $scheduled = $matches->execute($match->fetchColumn(),$actor,[
            'operation'=>'schedule','version'=>0,'reason'=>'Fixture','request_id'=>EventRepository::uuid(),
            'venue_id'=>$venue,'start'=>'2026-12-02T09:00','end'=>'2026-12-02T10:00',
        ]);
        $out['schedule_save'] = require __DIR__.'/issue96-schedule-postgres.php';
        $scheduled = $matches->get($scheduled['id']);
        $out['scheduled_after_confirm'] = $scheduled['state'] === 'SCHEDULED';
        $out['scheduled_bracket'] = $bracket('GET',$query);
        $scheduleQuery=$filters+['district'=>$district,'competition_id'=>$id];
        $out['schedule_page'] = $schedule('GET',$scheduleQuery);
        $out['schedule_csrf'] = $schedule('POST',$scheduleQuery,['_csrf'=>'wrong']);
        $out['before_publication_empty'] = $matches->list($id,true)===[];
        $matchId=$db->query("SELECT id FROM p2_match WHERE draw_id=".$db->quote($latest['id'])." ORDER BY number LIMIT 1")->fetchColumn();
        $publish=['operation'=>'publish_selected','match_ids'=>[$matchId],'versions'=>[$matchId=>(string)$scheduled['version']],'request_ids'=>[$matchId=>EventRepository::uuid()]];
        $out['first_publication']=$schedule('POST',$scheduleQuery+['schedule_state'=>'ready'],array_replace($publish,['_csrf'=>$context['csrf']]));
        $firstSnapshot=$matches->publicMatch($matchId);
        $out['first_public_snapshot']=$firstSnapshot['scheduled_start']??null;
        $out['public_match_count_after_selection']=count($matches->list($id,true));
        $out['public_schedule_page']=DrawPages::publicContent(true,'fixtures',$db);
        $out['publication_retry']=$schedule('POST',$scheduleQuery+['schedule_state'=>'ready'],array_replace($publish,['_csrf'=>$context['csrf']]));
        $currentMatch=$matches->get($matchId);
        $changed=$matches->execute($matchId,$actor,['operation'=>'schedule','version'=>$currentMatch['version'],'reason'=>'Fixture reschedule','request_id'=>EventRepository::uuid(),'venue_id'=>$venue,'start'=>'2026-12-02T09:30','end'=>'2026-12-02T10:30']);
        $out['schedule_after_edit']=$schedule('GET',$scheduleQuery+['schedule_state'=>'changed']);
        $out['public_snapshot_unchanged']=$matches->publicMatch($matchId)['scheduled_start']===$out['first_public_snapshot'];
        $republish=['operation'=>'republish_one','match_ids'=>[$matchId],'versions'=>[$matchId=>(string)$changed['version']],'request_ids'=>[$matchId=>EventRepository::uuid()]];
        $out['republish']=$schedule('POST',$scheduleQuery+['schedule_state'=>'changed'],array_replace($republish,['_csrf'=>$context['csrf']]));
        $out['public_snapshot_after_republish']=$matches->publicMatch($matchId)['scheduled_start']??null;
        $out['public_match_count_after_republish']=count($matches->list($id,true));
        $first = $db->prepare('SELECT id,side_a FROM p2_match WHERE draw_id=? ORDER BY number LIMIT 1');
        $first->execute([$latest['id']]);$firstMatch=$first->fetch();$firstSide=json_decode($firstMatch['side_a'],true,512,JSON_THROW_ON_ERROR);
        $winnerId=$firstSide['source_team_id'];$ruleId=EventRepository::uuid();$resultId=EventRepository::uuid();
        $db->prepare('INSERT INTO p2_rule_version(id,event_id,version,config,actor_id,reason,request_id,request_hash) VALUES (?,?,1,CAST(? AS jsonb),?,?,?,?)')
            ->execute([$ruleId,$event,'{}',$actor['id'],'Bracket result fixture',EventRepository::uuid(),'bracket-rule']);
        $db->prepare("INSERT INTO p2_result_revision(id,match_id,version,state,rule_version_id,result,actor_id,reason) VALUES (?,?,1,'CONFIRMED',?,CAST(? AS jsonb),?,'Bracket result fixture')")
            ->execute([$resultId,$firstMatch['id'],$ruleId,json_encode(['winner'=>$winnerId],JSON_THROW_ON_ERROR),$actor['id']]);
        $db->prepare("UPDATE p2_match SET confirmed_result_id=?,state='COMPLETED' WHERE id=?")->execute([$resultId,$firstMatch['id']]);
        $out['resolved_bracket'] = $bracket('GET',$query);
        $out['resolved_winner'] = $draws->current($id)['slots'][array_search($winnerId,array_column($draws->current($id)['slots'],'source_team_id'),true)]['name'];
        $out['private_after_confirm'] = $out['before_publication_empty'];
        $out['locked_redraw'] = $render('POST',$query,array_replace($redraw,['reason'=>'Fixture redraw','version'=>2,'request_id'=>EventRepository::uuid()]));
    }
    $stage2 = $competitions->create($event,['division_id'=>$division,'stage'=>2,'province'=>'เชียงใหม่'],$actor,EventRepository::uuid())['id'];
    $query = ['competition_id'=>$stage2,'data_mode'=>'demo'];
    $out['stage2_waiting'] = $render('GET',$query);
    $revision = EventRepository::uuid();
    // Supply the locked snapshot that the existing advancement workflow normally creates.
    $db->prepare('INSERT INTO p2_roster_revision(id,competition_id,version,teams,fingerprint,locked,request_id,request_hash,actor_id) SELECT ?,?,1,r.teams,r.fingerprint,true,?,?,? FROM p2_competition c JOIN p2_roster_revision r ON r.id=c.roster_revision_id WHERE c.id=?')
        ->execute([$revision,$stage2,EventRepository::uuid(),'fixture',$actor['id'],$id]);
    $db->prepare('UPDATE p2_competition SET roster_revision_id=? WHERE id=?')->execute([$revision,$stage2]);
    $sat = array_replace($context,['actor'=>['id'=>'fixture-sat-stage2','name'=>'SAT fixture','role'=>'SAT_OFFICER','province'=>'เชียงใหม่']]);
    $db->prepare("INSERT INTO p2_competition_assignment(competition_id,actor_id,actor_role,permissions,active,version,last_request_id,last_request_hash,updated_by) VALUES (?,?,'SAT_OFFICER','[\"view\",\"draw\"]',true,1,?,'fixture',?)")
        ->execute([$stage2,$sat['actor']['id'],EventRepository::uuid(),$actor['id']]);
    $page = $render('GET',$query,[],$sat);
    $out['stage2_post'] = $render('POST',$query,$formInput($page),$sat);
    $draw = $draws->current($stage2);
    $out['stage2_roster_used'] = $draw && $draw['roster_revision_id']===$revision && $draw['actor_id']===$sat['actor']['id'];
    $out['stage2_confirm'] = $review('POST',$query,$formInput($review('GET',$query,[],$sat)),$sat);
    return $out;
})($db,$out['selection']['event_id'],$context);
