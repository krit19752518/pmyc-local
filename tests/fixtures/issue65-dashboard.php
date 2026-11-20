<?php
declare(strict_types=1);
// Synthetic fixtures only. Never connect to an operational database.
$root=dirname(__DIR__,2);
spl_autoload_register(function($class)use($root){
    $prefix='PMYC\\Phase2\\';
    if(str_starts_with($class,$prefix)){
        $name=substr($class,strlen($prefix));
        if(preg_match('/^[A-Za-z0-9_]+$/D',$name)&&is_file($root.'/phase2/src/'.$name.'.php'))require_once $root.'/phase2/src/'.$name.'.php';
    }
});
use PMYC\Phase2\DashboardReadModel;
use PMYC\Phase2\DashboardPages;
use PMYC\Phase2\CompetitionRepository;
use PMYC\Phase2\Application;

function uid(int $n):string{return sprintf('00000000-0000-4000-8000-%012d',$n);}
function scope(int $n,array $extra=[]):array
{
    return array_replace(['id'=>uid($n),'event_id'=>uid(5000),'season_id'=>uid(6000),'season'=>'2569/70',
        'event_name'=>'รายการทดสอบ','division_id'=>uid(7000),'division_code'=>'U14_BOY','stage'=>1,'province'=>'เชียงใหม่',
        'district'=>'แม่ริม','is_test'=>true,'roster_revision_id'=>uid(8000+$n),'draw_version_id'=>uid(9000+$n),'status'=>'OPEN','event_status'=>'OPEN'],$extra);
}
class FixturePDO extends PDO
{
    public array $queries=[],$commands=[];public bool $transaction=false,$fail=false,$unsafeNames=false;public int $rollbacks=0;
    public function __construct(public array $scopes){}
    public function prepare(string $query,array $options=[]):PDOStatement|false
    {
        if(!preg_match('/^\s*SELECT\b/i',$query))throw new RuntimeException('Unexpected non-read query');
        if($this->fail)throw new PDOException('PRIVATE_DATABASE_DETAIL');
        return new FixtureStatement($this,$query);
    }
    public function beginTransaction():bool{$this->transaction=true;return true;}
    public function inTransaction():bool{return $this->transaction;}
    public function rollBack():bool{$this->transaction=false;$this->rollbacks++;return true;}
    public function exec(string $statement):int|false
    {
        if(!str_starts_with($statement,'SET '))throw new RuntimeException('Unexpected write');
        $this->commands[]=$statement;return 0;
    }
    public function fixtures(string $sql,array $values):array
    {
        if(substr_count($sql,'?')!==count($values))throw new RuntimeException('Wrong parameter count');
        $this->queries[]=['sql'=>$sql,'values'=>$values];
        if(str_contains($sql,'FROM football_registered_team WHERE is_test=')){
            return array_map(function($scope){[$category,$gender]=explode('_',$scope['division_code']);return ['province'=>$scope['province'],'district'=>$scope['district'],'contact_district'=>$scope['district'],'gender'=>$gender,'categories'=>$category,'cancelled_categories'=>'','is_deleted'=>false,'is_test'=>$scope['is_test']];},array_values(array_filter($this->scopes,fn($scope)=>$scope['is_test']===true)));
        }
        if(str_contains($sql,'FROM p2_event e JOIN p2_season')){
            $events=[];
            foreach($this->scopes as $scope){
                $id=$scope['event_id'];
                $events[$id] ??= array_intersect_key($scope,array_flip(['event_id','event_name','season_id','season','is_test']))+['codes'=>[],'competition_count'=>0,'workspace_competition_count'=>0];
                $events[$id]['codes'][]=$scope['division_code'];$events[$id]['competition_count']++;
                if(in_array((int)$scope['stage'],[1,2],true))$events[$id]['workspace_competition_count']++;
            }
            foreach($events as &$event){$event['division_codes']=json_encode(array_values(array_unique($event['codes'])));unset($event['codes']);}
            return array_values($events);
        }
        if(str_contains($sql,'JOIN p2_event e')){
            $rows=$this->scopes;
            if(str_contains($sql,'JOIN p2_competition_assignment')){
                if(!in_array($values[0],['sat-1','doc-1'],true))$rows=[];
                if(($values[1] ?? '')==='SAT_OFFICER')$rows=array_values(array_filter($rows,fn($s)=>$s['province']===$values[2]));
            }
            if(str_contains($sql,'c.event_id=?'))$rows=array_values(array_filter($rows,fn($s)=>$s['event_id']===end($values)));
            return str_contains($sql,'LIMIT 200')?array_slice($rows,0,200):$rows;
        }
        $allowed=array_values(array_filter($this->scopes,fn($s)=>in_array($s['id'],$values,true)));
        if(str_contains($sql,'jsonb_array_elements')){
            $rows=[];
            foreach($allowed as $s)if($s['roster_revision_id']){
                $n=(int)substr($s['id'],-12);
                foreach(['A','B'] as $side)$rows[]=['competition_id'=>$s['id'],'source_team_id'=>'TEAM-'.$n.$side,
                    'team_name'=>$this->unsafeNames?'<img src=x onerror=alert(1)>':'ทีมทดสอบ '.$n.$side];
            }
            return $rows;
        }
        if(str_contains($sql,'GREATEST(ch.changed_at')){
            $rows=[];
            foreach($allowed as $s){
                if(!$s['draw_version_id'])continue;
                $n=(int)substr($s['id'],-12);$confirmed=$n%2===0;
                $rows[]=['id'=>uid(20000+$n),'competition_id'=>$s['id'],'draw_id'=>$s['draw_version_id'],'number'=>1,'round'=>1,
                    'side_a'=>json_encode(['type'=>'team','source_team_id'=>'TEAM-'.$n.'A']),
                    'side_b'=>json_encode(['type'=>'team','source_team_id'=>'TEAM-'.$n.'B']),
                    'scheduled_start'=>'2026-11-10T10:00:00+07:00','scheduled_end'=>'2026-11-10T11:00:00+07:00',
                    'state'=>$confirmed?'COMPLETED':'SCHEDULED','venue_name'=>'สนามทดสอบ','result_state'=>$confirmed?'CONFIRMED':null,
                    'confirmed_winner'=>$confirmed?'TEAM-'.$n.'A':null,'changed_at'=>'2026-11-10T09:00:00+07:00'];
            }
            return $rows;
        }
        if(str_contains($sql,'FROM p2_audit_log')){
            return array_map(fn($s)=>['action'=>'DRAW_START','created_at'=>'2026-11-10T08:00:00+07:00','competition_id'=>$s['id'],'match_id'=>null],array_slice($allowed,0,4));
        }
        if(str_starts_with($sql,'SELECT m.id')){
            foreach($this->scopes as $s)if($s['id']===$values[1]&&uid(20000+(int)substr($s['id'],-12))===$values[0])return [['id'=>$values[0]]];
            return [];
        }
        throw new RuntimeException('Unrecognized fixture SELECT');
    }
}
class FixtureStatement extends PDOStatement
{
    private array $rows=[];
    public function __construct(private FixturePDO $db,private string $sql){}
    public function execute(?array $params=null):bool{$this->rows=$this->db->fixtures($this->sql,$params ?? []);return true;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->rows;}
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return array_shift($this->rows) ?? false;}
}
$case=$argv[1] ?? 'large';$actor=['id'=>'admin-1','name'=>'เจ้าหน้าที่ทดสอบ','role'=>'SUPER_ADMIN','province'=>null];
$ctx=['actor'=>$actor,'expiresAt'=>1794300000000,'ambiguous'=>false];
$rows=[scope(1),scope(2,['province'=>'กรุงเทพมหานคร','district'=>'ปทุมวัน']),scope(3,['division_code'=>'U18_GIRL']),
    scope(4,['stage'=>2,'district'=>null]),scope(5,['is_test'=>false,'event_id'=>uid(5001)]),
    scope(6,['season_id'=>uid(6001),'season'=>'2570/71','event_id'=>uid(5002)])];
$db=new FixturePDO($rows);$model=new DashboardReadModel($db);$query=[];$out=[];
switch($case){

    case 'source-root':
    case 'source-root-slash':
    case 'source-root-anonymous':
    case 'source-root-post':
    case 'source-root-role':
    case 'source-root-mode':
    case 'source-root-foreign':
    case 'source-root-public':
        $q=['event_id'=>uid(5000),'data_mode'=>'demo','season_id'=>uid(6000),'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','district'=>'แม่ริม'];
        if($case==='source-root-anonymous')$ctx['actor']=null;
        if($case==='source-root-role')$ctx['actor']['role']='TEAM';
        if($case==='source-root-mode')$q['mode']='invalid';
        if($case==='source-root-foreign'){$ctx['actor']=['id'=>'sat-1','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];$q['province']='กรุงเทพมหานคร';$q['district']='ปทุมวัน';}
        if($case==='source-root-public')$q=['view'=>'fixtures','mode'=>'demo'];
        $out['response']=Application::render($case==='source-root-slash'?'/phase2demo/':'/phase2demo',$case==='source-root-post'?'POST':'GET',$q,[],$ctx);break;
    case 'source-setup-clear':
    case 'source-setup-complete':
    case 'source-setup-sat-clear':
    case 'source-bracket-clear':
    case 'source-bracket-partial':
    case 'source-schedule-clear':
    case 'source-schedule-partial':
        $q=['event_id'=>uid(5000),'data_mode'=>'demo'];
        if($case==='source-setup-sat-clear')$ctx['actor']=['id'=>'sat-1','name'=>'SAT fixture','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];
        if(str_ends_with($case,'partial'))$q+=['division_code'=>'U14_BOY','province'=>'เชียงใหม่'];
        if($case==='source-setup-complete')$q+=['season_id'=>uid(6000),'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','district'=>'แม่ริม'];
        if(str_contains($case,'bracket'))$out['response']=PMYC\Phase2\BracketPages::render('GET',$q,$ctx,$db);
        elseif(str_contains($case,'schedule'))$out['response']=PMYC\Phase2\SchedulePages::render('GET',$q,[],$ctx,$db);
        else $out['response']=DashboardPages::render('/phase2demo/workspace/pending-setup','GET',$q,$ctx,$model);
        break;
    case 'dashboard-sat-clear':
        $actor=['id'=>'sat-1','name'=>'เจ้าหน้าที่ทดสอบ','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];$ctx['actor']=$actor;
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',[],$ctx,$model);break;
    case 'dashboard-clear':
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>uid(5000),'data_mode'=>'demo','division_code'=>'U18_GIRL'],$ctx,$model);break;
    case 'dashboard-partial':
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['dashboard_filters'=>'1','event_id'=>uid(5000),'data_mode'=>'demo','season_id'=>uid(6000),'division_code'=>'U14_BOY'],$ctx,$model);break;
    case 'dashboard-complete':
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['dashboard_filters'=>'1','event_id'=>uid(5000),'data_mode'=>'demo','season_id'=>uid(6000),'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','district'=>'แม่ริม'],$ctx,$model);break;
    case 'large':
        $db=new FixturePDO(array_map(fn($n)=>scope($n),range(1,250)));$model=new DashboardReadModel($db);
        $out['data']=$model->load($actor,[]);break;
    case 'legacy-limit':
        $db=new FixturePDO(array_map(fn($n)=>scope($n),range(1,250)));
        $out['count']=count((new CompetitionRepository($db))->listVisible($actor));break;
    case 'girl':$out['data']=$model->load($actor,['division_code'=>'U18_GIRL']);break;
    case 'stage2':$out['data']=$model->load($actor,['stage'=>'2','district'=>'ignored-at-stage2']);break;
    case 'season':$out['data']=$model->load($actor,['season_id'=>uid(6001)]);break;
    case 'real':$out['data']=$model->load($actor,['data_mode'=>'real']);break;
    case 'no-roster':
        $db=new FixturePDO([scope(1,['roster_revision_id'=>null,'draw_version_id'=>null])]);$model=new DashboardReadModel($db);$out['data']=$model->load($actor,[]);break;
    case 'sat':
        $actor=['id'=>'sat-1','name'=>'เจ้าหน้าที่ทดสอบ','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];$ctx['actor']=$actor;
        $out['data']=$model->load($actor,[]);break;
    case 'foreign-province':
        $ctx['actor']=['id'=>'sat-1','name'=>'เจ้าหน้าที่ทดสอบ','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['province'=>'กรุงเทพมหานคร'],$ctx,$model);break;
    case 'foreign-context':
        $ctx['actor']=['id'=>'sat-1','name'=>'เจ้าหน้าที่ทดสอบ','role'=>'SAT_OFFICER','province'=>'เชียงใหม่'];
        $out['response']=DashboardPages::render('/phase2demo/workspace/pending-detail','GET',['competition_id'=>uid(2),'match_id'=>uid(20002)],$ctx,$model);break;
    case 'context':
        $out['response']=DashboardPages::render('/phase2demo/workspace/pending-detail','GET',['competition_id'=>uid(1),'match_id'=>uid(20001)],$ctx,$model);break;
    case 'conflicting-event':
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['event_id'=>uid(5000),'season_id'=>uid(6001)],$ctx,$model);break;
    case 'bad-filter':
        $out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',['province'=>['unexpected']],$ctx,$model);break;
    case 'blank':
        foreach(['bracket','detail'] as $key)$out['responses'][$key]=Application::render('/phase2demo/workspace/pending-'.$key,'GET',[],[],$ctx);
        $out['responses']['schedule']=Application::render('/phase2demo/workspace/pending-schedule','GET',[],[],$ctx);
        break;
    case 'post':
        $out['response']=Application::render('/phase2demo/workspace/pending-schedule','POST',[],[],$ctx);break;
    case 'anonymous':
        $ctx['actor']=null;$out['response']=Application::render('/phase2demo/workspace/dashboard','GET',[],[],$ctx);break;
    case 'legacy':
        $out['response']=Application::render('/phase2demo/workspace/schedule','GET',[],[],$ctx);break;
    case 'error':
        $db->fail=true;$out['response']=DashboardPages::render('/phase2demo/workspace/dashboard','GET',[],$ctx,$model);break;
    case 'render':
        $db->unsafeNames=true;$ctx['actor']['name']='<script>alert(1)</script>';
        $out['response']=DashboardPages::page($model->load($actor,[]),$ctx);break;
    default:throw new RuntimeException('Unknown synthetic case');
}
if(isset($out['data']))$out['html']=DashboardPages::page($out['data'],$ctx)[1];
$out['queries']=$db->queries;$out['commands']=$db->commands;$out['rollbacks']=$db->rollbacks;
echo json_encode($out,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
