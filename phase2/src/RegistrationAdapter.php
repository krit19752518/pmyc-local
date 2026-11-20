<?php
declare(strict_types=1);
namespace PMYC\Phase2;
require_once __DIR__.'/WomenRegistrationAdapter.php';

/** Persisted registration only. Never falls back to process memory. */
final class RegistrationAdapter
{
    public function __construct(private \PDO $db) {}
    public static function categories(?string $value): array { return array_filter(array_map(fn($v)=>strtoupper(trim($v)),explode(',',$value ?? ''))); }
    /** Setup discovery is not approval: pending teams may establish an area's presence. */
    public static function areaIndex(array $rows,bool $demo,array $codes):array
    {
        $canonical=AreaDirectory::districts();$index=array_fill_keys($codes,[]);
        foreach($rows as $row){
            if(($row['is_test'] ?? null)!==$demo||!empty($row['is_deleted']))continue;
            $province=trim($row['province'] ?? '');$district=trim($row['district'] ?? '') ?: trim($row['contact_district'] ?? '');
            if(!isset($canonical[$province]))continue;if(!in_array($district,$canonical[$province],true))$district=null;
            foreach($codes as $code){[$category,$gender]=explode('_',$code);if(strtolower(trim($row['gender'] ?? ''))!==strtolower($gender)||!in_array($category,self::categories($row['categories'] ?? null),true)||in_array($category,self::categories($row['cancelled_categories'] ?? null),true))continue;$index[$code][$province] ??=[];if($district!==null)$index[$code][$province][$district]=true;}
        }
        foreach($index as &$provinces){ksort($provinces);foreach($provinces as &$districts){$districts=array_keys($districts);sort($districts);}unset($districts);}unset($provinces);
        return $index;
    }
    public function existingAreas(bool $demo,array $codes,?string $seasonId=null):array
    {
        $s=$this->db->prepare('SELECT province,district,contact_district,gender,categories,cancelled_categories,is_deleted,is_test FROM football_registered_team WHERE is_test=CAST(? AS boolean) AND NOT COALESCE(is_deleted,false)');$s->execute([$demo?'true':'false']);
        $index=self::areaIndex($s->fetchAll(),$demo,$codes);if(in_array('U18_GIRL',$codes,true)&&(new WomenRegistrationAdapter($this->db))->ready())$index['U18_GIRL']=(new WomenRegistrationAdapter($this->db))->areas($demo,$seasonId);return $index;
    }
    public static function snapshot(array $team,array $players,array $officials,array $scope): ?array
    {
        [$category,$gender]=explode('_',$scope['division_code']);
        if ($team['is_deleted'] || $team['is_test']!==$scope['is_test'] || $team['status']!=='APPROVED'
            || strtolower($team['gender'] ?? '')!==strtolower($gender) || $team['province']!==$scope['province']
            || (trim($team['district'] ?? '') ?: trim($team['contact_district'] ?? ''))!==$scope['district']
            || !in_array($category,self::categories($team['categories']),true)
            || !in_array($category,self::categories($team['submitted_categories']),true)
            || in_array($category,self::categories($team['cancelled_categories']),true)) return null;
        $players=array_values(array_filter($players,fn($p)=>in_array($category,self::categories($p['category']),true)));
        // Owner rule: APPROVED team, submitted/non-cancelled category and at least 18
        // approved players in that category. Remaining players may still be pending.
        if(count(array_filter($players,fn($p)=>($p['doc_status'] ?? '')==='APPROVED'))<18)return null;
        $officials=array_values(array_filter($officials,fn($p)=>in_array($category,self::categories($p['categories']),true)));
        return ['source_team_id'=>$team['id'],'name'=>$team['team_name'],
            'players'=>array_map(fn($p)=>array_intersect_key($p,array_flip(['id','name','jersey_no','position'])),$players),
            'officials'=>array_map(fn($p)=>array_intersect_key($p,array_flip(['id','name','role'])),$officials)];
    }
    /** Summary uses identical eligibility/order without reading player names or official records. */
    public function candidates(array $scope,bool $lock=false,bool $summary=false): array
    {
        if(($scope['division_code'] ?? '')==='U18_GIRL')return (new WomenRegistrationAdapter($this->db))->candidates($scope,$lock,$summary);
        if ((int)$scope['stage']!==1) throw new \DomainException('Stage นี้ต้องรับทีมจากผลผ่านเข้ารอบ ไม่สามารถนำเข้าจากใบสมัครโดยตรง');
        $columns=$summary?[]:$this->db->query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='football_official' AND column_name IN ('position','role')")->fetchAll(\PDO::FETCH_COLUMN);
        $officialPosition=in_array('position',$columns,true)?'position':(in_array('role',$columns,true)?'role':null);
        if (!$summary && $officialPosition===null) throw new \PDOException('Unsupported persisted official position schema');
        // Filter before the cutoff: an older ineligible application must not consume a place.
        $stmt=$this->db->prepare("SELECT id,team_name,province,district,contact_district,gender,categories,submitted_categories,cancelled_categories,status,is_deleted,is_test,created_at FROM football_registered_team WHERE is_test=CAST(? AS boolean) AND province=? AND COALESCE(NULLIF(BTRIM(district),''),BTRIM(contact_district))=? AND status='APPROVED' AND NOT COALESCE(is_deleted,false) ORDER BY created_at ASC NULLS LAST,id ASC".($lock?' FOR SHARE':''));
        $stmt->execute([$scope['is_test']?'true':'false',$scope['province'],$scope['district']]);$teams=$stmt->fetchAll();$result=[];
        foreach ($teams as $team) {
            $p=$this->db->prepare('SELECT '.($summary?'category,doc_status':'id,name,jersey_no,position,category,doc_status').' FROM football_player WHERE team_id=? ORDER BY id'.($lock?' FOR SHARE':''));$p->execute([$team['id']]);
            // Both observed Phase 1 schemas are supported; identifier comes only from this fixed allowlist.
            $officials=[];
            if(!$summary){$o=$this->db->prepare('SELECT id,name,'.$officialPosition.' AS role,categories FROM football_official WHERE team_id=? ORDER BY id'.($lock?' FOR SHARE':''));$o->execute([$team['id']]);$officials=$o->fetchAll();}
            $snapshot=self::snapshot($team,$p->fetchAll(),$officials,$scope);
            if ($snapshot!==null) {
                $result[]=$summary?['source_team_id'=>$snapshot['source_team_id'],'name'=>$snapshot['name'],'district'=>$scope['district'],'registered_at'=>$team['created_at'],'player_count'=>count($snapshot['players'])]:$snapshot;
                if(count($result)===8)break;
            }
        }
        return $result;
    }
}
