<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class PublicTeamPages
{
    public static function matches(string $path):bool{return (bool)preg_match('#^/phase2demo/teams/[a-f0-9-]{36}$#Di',$path);}
    public static function render(string $path,string $method,array $query,array $context,?\PDO $database=null):array
    {
        if($method!=='GET')return [405,'หน้านี้แสดงข้อมูลอย่างเดียว'];
        $teamId=$query['team_id'] ?? null;if(!is_string($teamId)||$teamId===''||strlen($teamId)>300)return [400,'ทีมไม่ถูกต้อง'];
        if(!$database&&!EventRepository::configured())return [503,'ยังไม่ได้เชื่อมข้อมูล'];$db=$database??EventRepository::connect();$id=basename($path);$scope=(new CompetitionRepository($db))->get($id);if(!$scope||!in_array((int)$scope['stage'],[1,2],true))return [404,'ไม่พบทีมที่เผยแพร่'];
        $draw=(new DrawRepository($db))->publicCurrent($id);if(!$draw||!in_array($draw['draw_is_published'] ?? false,[true,1,'1','t'],true)||$scope['event_status']==='ARCHIVED'||$scope['status']==='ARCHIVED')return [404,'ไม่พบทีมที่เผยแพร่'];
        $s=$db->prepare('SELECT teams FROM p2_roster_revision WHERE id=? AND competition_id=?');$s->execute([$draw['roster_revision_id'],$id]);$teams=json_decode($s->fetchColumn(),true,512,JSON_THROW_ON_ERROR);$team=null;foreach($teams as $t)if($t['source_team_id']===$teamId)$team=$t;if(!$team)return [404,'ไม่พบทีมที่เผยแพร่'];
        $body=Ui::context($scope).'<div class="card"><div class="card-h"><h3>'.Ui::team($team['name']).'</h3><span class="badge b-green">รายชื่อแข่งขันที่เผยแพร่</span></div><div class="card-b">'.Ui::metrics(['นักกีฬา'=>count($team['players']),'เจ้าหน้าที่'=>count($team['officials']),'รุ่นอายุ'=>EventDraft::DIVISIONS[$scope['division_code']]]).'</div></div><div class="card"><div class="card-h"><h3>รายชื่อนักกีฬา</h3></div><div class="table-wrap"><table><thead><tr><th>เบอร์เสื้อ</th><th>นักกีฬา</th><th>ตำแหน่ง</th></tr></thead><tbody>';
        foreach($team['players'] as $p)$body.='<tr><td>'.Ui::e($p['jersey_no'] ?? '—').'</td><td>'.Ui::e($p['name']).'</td><td>'.Ui::e($p['position'] ?? '—').'</td></tr>';
        $body.='</tbody></table></div></div><div class="card"><div class="card-h"><h3>เจ้าหน้าที่ทีม</h3></div><div class="table-wrap"><table><thead><tr><th>ชื่อ</th><th>หน้าที่</th></tr></thead><tbody>';
        foreach($team['officials'] as $p)$body.='<tr><td>'.Ui::e($p['name']).'</td><td>'.Ui::e($p['role'] ?? '').'</td></tr>';
        return Application::page('รายละเอียดทีมสาธารณะ',$body.'</tbody></table></div></div><a class="btn btn-light" href="/phase2demo?mode='.($scope['is_test']?'demo':'real').'&view=teams">กลับรายชื่อทีม</a>',$path,$context);
    }
}
