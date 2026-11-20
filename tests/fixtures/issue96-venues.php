<?php
declare(strict_types=1);
$root=dirname(__DIR__,2);
spl_autoload_register(function($class)use($root){$prefix='PMYC\\Phase2\\';if(str_starts_with($class,$prefix)){$name=substr($class,strlen($prefix));if(preg_match('/^[A-Za-z0-9_]+$/D',$name))require_once $root.'/phase2/src/'.$name.'.php';}});
use PMYC\Phase2\{MatchPages,MatchRepository,WorkspaceView,EventRepository};
class VenuePDO extends PDO {
 public array $venues=[],$audit=[],$queries=[];private bool $transaction=false;private array $before=[];
 public function __construct(){}
 public function beginTransaction():bool{$this->before=[$this->venues,$this->audit];$this->transaction=true;return true;}
 public function commit():bool{$this->transaction=false;return true;}
 public function rollBack():bool{[$this->venues,$this->audit]=$this->before;$this->transaction=false;return true;}
 public function inTransaction():bool{return $this->transaction;}
 public function prepare(string $sql,array $options=[]):PDOStatement|false{return new VenueStatement($this,$sql);}
 public function query(string $query,?int $fetchMode=null,mixed ...$args):PDOStatement|false{$s=$this->prepare($query);$s->execute();return $s;}
 public function rows(string $sql,array $a):array {
  $this->queries[]=$sql;
  if(str_contains($sql,'to_regclass'))return [[true]];
  if(str_contains($sql,'pg_advisory_xact_lock'))return [[true]];
  if(str_starts_with($sql,'INSERT INTO p2_venue')){[$id,$name,$province,$district,$creator,$request,$hash]=$a;$this->venues[]=['id'=>$id,'name'=>$name,'province'=>$province,'district'=>$district,'created_by'=>$creator,'request_id'=>$request,'request_hash'=>$hash];return [];}
  if(str_starts_with($sql,'INSERT INTO p2_platform_audit')){$this->audit[]=$a;return [];}
  if(str_contains($sql,'FROM p2_venue')){
   if(str_contains($sql,'request_id=?'))return array_values(array_filter($this->venues,fn($v)=>$v['request_id']===$a[0]));
   if(str_contains($sql,'lower(btrim(name))'))return array_values(array_filter($this->venues,fn($v)=>$v['province']===$a[0]&&$v['district']===$a[1]&&strtolower(trim($v['name']))===strtolower($a[2])));
   if(str_contains($sql,'WHERE province=?'))return array_values(array_filter($this->venues,fn($v)=>$v['province']===$a[0]));
   return $this->venues;
  }
  throw new RuntimeException('Unexpected SQL: '.$sql);
 }
}
class VenueStatement extends PDOStatement {
 private array $rows=[];
 public function __construct(private VenuePDO $db,private string $sql){}
 public function execute(?array $params=null):bool{$this->rows=$this->db->rows($this->sql,$params??[]);return true;}
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed{return array_shift($this->rows)?:false;}
 public function fetchColumn(int $column=0):mixed{$row=$this->fetch();return $row?array_values($row)[$column]:false;}
 public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array{return $this->rows;}
}
$db=new VenuePDO();$ctx=['actor'=>['id'=>'fixture-admin','role'=>'SUPER_ADMIN','name'=>'Fixture'],'csrf'=>'fixture-csrf'];
$q=['event_id'=>'00000000-0000-4000-8000-000000000002','data_mode'=>'demo','province'=>'เชียงใหม่','district'=>'หางดง'];
$render=fn($method,$input=[],$context=null,$query=null)=>MatchPages::render('/platform/venues',$method,$input,$context??$ctx,$query??$q,$db);
$out=[];$out['empty']=$render('GET');
$input=['name'=>'  สนามทดสอบ <script>bad</script>  ','province'=>'เชียงใหม่','district'=>'หางดง','request_id'=>EventRepository::uuid(),'_csrf'=>$ctx['csrf'],'created_by'=>'forged','id'=>'forged'];
$out['created']=$render('POST',$input);$out['retry']=$render('POST',$input);
$out['venue_count']=count($db->venues);$out['audit_count']=count($db->audit);$out['venue']=$db->venues[0];
$out['listing']=$render('GET',[],null,$q+['saved'=>'1']);
$out['duplicate']=$render('POST',array_replace($input,['request_id'=>EventRepository::uuid()]));
$out['request_conflict']=$render('POST',array_replace($input,['name'=>'Different name']));
foreach(['empty-name'=>['name'=>'  '],'long-name'=>['name'=>str_repeat('ก',151)],'bad-province'=>['province'=>'invalid'],'bad-district'=>['district'=>'invalid'],'array'=>['name'=>[]],'control'=>['name'=>"bad\x00name"],'bad-request'=>['request_id'=>'bad']] as $key=>$changes)$out[$key]=$render('POST',array_replace($input,$changes,['request_id'=>$changes['request_id']??EventRepository::uuid()]));
$out['changed_request_count']=count($db->venues);
$out['csrf']=$render('POST',array_replace($input,['_csrf'=>'wrong']));
foreach(['SAT_OFFICER','DOCUMENT_VERIFIER'] as $role){$context=$ctx;$context['actor']['role']=$role;$out[$role]=$render('GET',[],$context);$out[$role.'-post']=$render('POST',$input,$context);$out[$role.'-nav']=WorkspaceView::page('schedule','',$context,$q);}
$anonymous=$ctx;$anonymous['actor']=null;$out['anonymous']=$render('GET',[],$anonymous);
$out['bad-query']=$render('GET',[],null,['event_id'=>['bad']]);
$out['method']=$render('DELETE');
$repo=new MatchRepository($db);$out['province_venues']=$repo->venues('เชียงใหม่');$out['foreign_venues']=$repo->venues('กรุงเทพมหานคร');
$out['no-context']=$render('POST',array_replace($input,['name'=>'Second venue','request_id'=>EventRepository::uuid()]),null,[]);
$out['admin-nav']=WorkspaceView::page('schedule','',$ctx,$q);
echo json_encode($out,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
