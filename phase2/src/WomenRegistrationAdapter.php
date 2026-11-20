<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class WomenRegistrationAdapter
{
    public function __construct(private \PDO $db) {}
    public function ready():bool {$s=$this->db->prepare("SELECT to_regclass('football_category_enrollment') IS NOT NULL AS women_ready");$s->execute();return $s->fetchColumn()===true;}
    public function areas(bool $demo,?string $seasonId=null):array {
        if(!$this->ready())return [];
        $q=$this->db->prepare("SELECT DISTINCT t.province FROM football_category_enrollment e JOIN football_registered_team t ON t.id=e.team_id JOIN football_registration_category cfg ON cfg.season_key=e.season_key AND cfg.division_code=e.division_code WHERE (CAST(? AS uuid) IS NULL OR cfg.p2_season_id=CAST(? AS uuid)) AND e.division_code='U18_GIRL' AND e.withdrawn_at IS NULL AND t.is_test=CAST(? AS boolean) AND NOT COALESCE(t.is_deleted,false) ORDER BY t.province");$q->execute([$seasonId,$seasonId,$demo?'true':'false']);$out=[];$master=AreaDirectory::districts();foreach($q->fetchAll(\PDO::FETCH_COLUMN) as $p)if(isset($master[$p]))$out[$p]=[];return $out;
    }
    public function candidates(array $scope,bool $lock=false,bool $summary=false):array {
        if((int)$scope['stage']!==1||!empty($scope['district']))throw new \DomainException('ฟุตบอลหญิงรอบแรกใช้จังหวัด ไม่ใช่รอบอำเภอหรือทีมผ่านรอบ');
        if(!$this->ready())return [];
        $season=$scope['season_id'] ?? null;
        if(!$season&&!empty($scope['event_id'])){$s=$this->db->prepare('SELECT season_id FROM p2_event WHERE id=?');$s->execute([$scope['event_id']]);$season=$s->fetchColumn();}
        if(!$season)throw new \DomainException('กรุณาเลือกรายการและฤดูกาลหญิงที่เชื่อมข้อมูลแล้ว');
        $q=$this->db->prepare("SELECT e.id AS enrollment_id,e.team_id,e.registered_at,t.team_name,t.district FROM football_category_enrollment e JOIN football_registration_category cfg ON cfg.season_key=e.season_key AND cfg.division_code=e.division_code JOIN football_registered_team t ON t.id=e.team_id WHERE cfg.p2_season_id=? AND e.division_code='U18_GIRL' AND t.is_test=CAST(? AS boolean) AND t.province=? AND t.status='APPROVED' AND NOT COALESCE(t.is_deleted,false) AND e.submitted_at IS NOT NULL AND e.withdrawn_at IS NULL AND (SELECT count(*) FROM football_category_player p WHERE p.enrollment_id=e.id AND p.active AND p.review_status='APPROVED')>=18 ORDER BY e.registered_at,e.id".($lock?' FOR SHARE OF e,t':''));$q->execute([$season,$scope['is_test']?'true':'false',$scope['province']]);$rows=$q->fetchAll();$out=[];
        foreach($rows as $row){
            if($summary){$out[]=['source_team_id'=>$row['team_id'],'name'=>$row['team_name'],'district'=>$row['district'],'registered_at'=>$row['registered_at'],'enrollment_id'=>$row['enrollment_id']];continue;}
            $p=$this->db->prepare('SELECT p.id,p.name,m.jersey_no,p.position FROM football_category_player m JOIN football_player p ON p.id=m.player_id WHERE m.enrollment_id=? AND m.active ORDER BY m.jersey_no');$p->execute([$row['enrollment_id']]);
            $o=$this->db->prepare('SELECT o.id,o.name,m.role FROM football_category_official m JOIN football_official o ON o.id=m.official_id WHERE m.enrollment_id=? AND m.active ORDER BY o.id');$o->execute([$row['enrollment_id']]);
            $out[]=['source_team_id'=>$row['team_id'],'source_enrollment_id'=>$row['enrollment_id'],'name'=>$row['team_name'],'players'=>$p->fetchAll(),'officials'=>$o->fetchAll()];
        }
        return $out;
    }
    public static function requireDrawDecision():never {throw new \DomainException('รอบแรกหญิงระดับจังหวัดพร้อมรับทีม แต่จำนวนทีม รูปแบบจับสลาก และรอบถัดไปยังรอข้อสรุปจากผู้ดูแล');}
}
