<?php
declare(strict_types=1);
// All SQL is intercepted; no operational database, identities, or files are used.
$root=dirname(__DIR__,2);
spl_autoload_register(function($class)use($root){$prefix='PMYC\\Phase2\\';if(str_starts_with($class,$prefix)){$name=substr($class,strlen($prefix));if(preg_match('/^[A-Za-z0-9_]+$/D',$name))require_once $root.'/phase2/src/'.$name.'.php';}});
function uid(int $n):string{return sprintf('00000000-0000-4000-8000-%012d',$n);}
class DetailPDO extends PDO
{
    public array $queries=[];public string $case;public array $scope,$match,$draw;
    public function __construct(string $case){
        $this->case=$case;
        $this->scope=['id'=>uid(1),'event_id'=>uid(2),'season'=>'2569/70','division_code'=>'U14_BOY','stage'=>1,'province'=>'เชียงใหม่','district'=>'จอมทอง','is_test'=>true,'event_name'=>'รายการจำลอง','event_status'=>'OPEN','status'=>'OPEN','draw_version_id'=>uid(4)];
        $this->match=['id'=>uid(3),'competition_id'=>uid(1),'draw_id'=>uid(4),'number'=>1,'round'=>1,'state'=>'SCHEDULED','version'=>7,
            'side_a'=>json_encode(['type'=>'team','source_team_id'=>'A']),'side_b'=>json_encode(['type'=>'team','source_team_id'=>'B']),
            'venue_id'=>uid(6),'venue_name'=>'สนามจำลอง','scheduled_start'=>'2026-11-20T10:00:00+07:00','scheduled_end'=>'2026-11-20T11:00:00+07:00','started_at'=>null,'confirmed_result_id'=>null];
        $this->draw=['id'=>uid(4),'competition_id'=>uid(1),'event_id'=>uid(2),'roster_revision_id'=>uid(8),'published_at'=>'2026-11-19T01:00:00Z','slots'=>json_encode([['source_team_id'=>'A','name'=>'ทีมเหย้า <script>bad</script>'],['source_team_id'=>'B','name'=>'ทีมเยือน']]),'fixtures'=>'[]','automatic_qualifiers'=>'[]'];
        if($case==='started'){$this->match['started_at']='2026-11-20T10:00:00+07:00';$this->match['state']='IN_PROGRESS';}
        if($case==='unresolved')$this->match['side_b']=json_encode(['type'=>'winner','match'=>9]);
    }
    public function prepare(string $sql,array $options=[]):PDOStatement|false{if(!preg_match('/^SELECT\b/i',$sql))throw new RuntimeException('WRITE FORBIDDEN');return new DetailStatement($this,$sql);}
    public function query(string $query,?int $fetchMode=null,mixed ...$args):PDOStatement|false{$s=$this->prepare($query);$s->execute();return $s;}
    public function rows(string $sql,array $args):array{
        $this->queries[]=$sql;
        if(str_contains($sql,'to_regclass'))return [[true]];
        if(str_contains($sql,'SELECT c.*,e.name'))return [$this->scope];
        if(str_contains($sql,'FROM p2_competition_assignment'))return [['actor_id'=>'staff','actor_role'=>$this->case==='viewer'?'DOCUMENT_VERIFIER':'SAT_OFFICER','active'=>true,'permissions'=>'["view","schedule","result"]']];
        if(str_contains($sql,'SELECT d.*,p.published_at'))return [$this->draw];
        if(str_contains($sql,'SELECT m.*,v.name'))return $this->case==='missing'?[]:[$this->match];
        if(str_contains($sql,'SELECT e.*,s.label'))return [['id'=>uid(2),'season_id'=>uid(5),'season'=>'2569/70']];
        if(str_contains($sql,'SELECT code FROM'))return [['U14_BOY']];
        if(str_contains($sql,'FROM p2_audit_log'))return [['status'=>$this->case==='unlocked'?'PENDING_CONFIRMATION':'CONFIRMED_LOCKED']];
        if(str_contains($sql,'FROM p2_venue'))return [['id'=>uid(6),'name'=>'สนามจำลอง','district'=>'จอมทอง']];
        if(str_contains($sql,'FROM p2_match_change'))return [];
        if(str_contains($sql,'SELECT draw_id FROM p2_draw_publication'))return [];
        if(str_contains($sql,'FROM p2_result_revision')||str_contains($sql,'JOIN p2_result_revision'))return [];
        if(str_contains($sql,'JOIN p2_rule_version'))return [];
        throw new RuntimeException('Unknown fixture query: '.$sql);
    }
}
class DetailStatement extends PDOStatement{
    private array $rows=[];
    public function __construct(private DetailPDO $db,private string $sql){}
    public function execute(?array $params=null):bool{$this->rows=$this->db->rows($this->sql,$params??[]);return true;}
    public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return array_shift($this->rows)?:false;}
    public function fetchColumn(int $column=0):mixed{$row=$this->fetch();return $row?array_values($row)[$column]:false;}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $mode===PDO::FETCH_COLUMN?array_column($this->rows,0):$this->rows;}
}
$case=$argv[1]??'schedule';$db=new DetailPDO($case);
$actor=['id'=>'staff','role'=>'SUPER_ADMIN','name'=>'เจ้าหน้าที่จำลอง'];
if(in_array($case,['sat','foreign','viewer'],true))$actor+=['province'=>$case==='foreign'?'กรุงเทพมหานคร':'เชียงใหม่'];
if(in_array($case,['sat','foreign'],true))$actor['role']='SAT_OFFICER';
if($case==='viewer')$actor['role']='DOCUMENT_VERIFIER';
$context=['actor'=>$case==='anonymous'?null:$actor,'csrf'=>'synthetic-only','expiresAt'=>1796000000000];
$query=['event_id'=>uid(2),'season_id'=>uid(5),'division_code'=>'U14_BOY','stage'=>'1','province'=>'เชียงใหม่','district'=>'จอมทอง','data_mode'=>'demo'];
if(in_array($case,['post','audit'],true))$query['tab']=$case;
if($case==='bad-tab')$query['tab']=['audit'];
if($case==='wrong-event')$query['event_id']=uid(99);
if($case==='wrong-season')$query['season_id']=uid(99);
if($case==='wrong-mode')$query['data_mode']='real';
if($case==='wrong-match'){$query['competition_id']=uid(1);$query['match_id']=uid(99);}
$path='/phase2demo/competitions/'.uid(1).'/matches/'.uid(3);
if($case==='public')$path='/phase2demo/matches/'.uid(3);
if($case==='results')$path.='/results';
if($case==='lineups')$path.='/lineups';
$method=$case==='csrf'?'POST':'GET';$input=[];
if(str_starts_with($case,'save-')){
 $method='POST';$input=['_csrf'=>$context['csrf'],'operation'=>'schedule','version'=>'7','request_id'=>uid(90),'venue_id'=>uid(6),'start'=>'2026-11-21T14:30','end'=>'2026-11-21T15:30','reason'=>'แก้เวลา <script>typed</script>'];
 if($case==='save-end')$input['end']=$input['start'];
 if($case==='save-start')$input['start']='';
 if($case==='save-reason')$input['reason']='';
 if($case==='save-venue')$input['venue_id']='';
 if($case==='save-stale-invalid'){$input['version']='6';$input['reason']='';}
 if($case==='save-context')$query['event_id']=uid(99);
}
if(in_array($case,['saved','stale-saved'],true)){$query['saved']='schedule';$query['saved_version']=$case==='saved'?'7':'6';}
$response=PMYC\Phase2\MatchPages::render($path,$method,$input,$context,$query,$db);
echo json_encode(['response'=>$response,'queries'=>$db->queries],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
