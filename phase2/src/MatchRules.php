<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class MatchRules
{
    public static function schedule(array $input): array
    {
        $venue=$input['venue_id'] ?? null;
        if(!EventRepository::validUuid($venue))throw new \InvalidArgumentException('กรุณาเลือกสนาม');
        if(is_string($input['start_date_th'] ?? null)&&trim($input['start_date_th'])!==''){
            $start=self::thaiLocalTime($input['start_date_th'],$input['start_time'] ?? null);
        }else{
            $start=self::localTime($input['start'] ?? null);
        }
        $rawEnd=$input['end'] ?? null;
        $end=(is_string($rawEnd)&&trim($rawEnd)!=='')?self::localTime($rawEnd):$start->modify('+90 minutes');
        if($end<=$start)throw new \InvalidArgumentException('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
        return ['venue_id'=>$venue,'start'=>$start->format('Y-m-d\TH:i:sP'),'end'=>$end->format('Y-m-d\TH:i:sP')];
    }
    private const THAI_MONTHS=['มกราคม'=>1,'กุมภาพันธ์'=>2,'มีนาคม'=>3,'เมษายน'=>4,'พฤษภาคม'=>5,'มิถุนายน'=>6,'กรกฎาคม'=>7,'สิงหาคม'=>8,'กันยายน'=>9,'ตุลาคม'=>10,'พฤศจิกายน'=>11,'ธันวาคม'=>12];
    private static function thaiLocalTime(mixed $dateTh,mixed $time): \DateTimeImmutable
    {
        if(!is_string($dateTh)||trim($dateTh)==='')throw new \InvalidArgumentException('กรุณาระบุวันเริ่มแข่งขัน');
        $raw=preg_replace('/\s+/u',' ',trim($dateTh));$parts=str_contains($raw,'/')?explode('/',$raw):explode(' ',$raw);
        if(count($parts)!==3||!preg_match('/^\d{1,2}$/',$parts[0])||!preg_match('/^\d{4}$/',$parts[2]))
            throw new \InvalidArgumentException('รูปแบบวันที่ไม่ถูกต้อง (วัน/เดือน/พ.ศ.)');
        $day=(int)$parts[0];$beYear=(int)$parts[2];$adYear=$beYear-543;
        $month=preg_match('/^\d{1,2}$/',$parts[1])?(int)$parts[1]:(self::THAI_MONTHS[$parts[1]] ?? 0);
        if($adYear<1970||$month<1||$month>12||!checkdate($month,$day,$adYear))throw new \InvalidArgumentException('วันที่ไม่ถูกต้อง');
        $t=is_string($time)&&trim($time)!==''?trim($time):'09:00';
        if(!preg_match('/^(\d{2}):(\d{2})$/',$t))throw new \InvalidArgumentException('รูปแบบเวลาไม่ถูกต้อง');
        $iso=sprintf('%04d-%02d-%02dT%s',$adYear,$month,$day,$t);
        return self::localTime($iso);
    }
    private static function localTime(mixed $input): \DateTimeImmutable
    {
        if(!is_string($input))throw new \InvalidArgumentException('กรุณาระบุวันเวลา');
        $time=\DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$input,new \DateTimeZone('Asia/Bangkok'));
        if(!$time || $time->format('Y-m-d\TH:i')!==$input)throw new \InvalidArgumentException('รูปแบบวันเวลาไม่ถูกต้อง');
        return $time;
    }
    /** Conservative possible teams protect schedules before feeder winners are known. */
    public static function possible(array $fixture,array $fixtures): array
    {
        $seen=[];$teams=[];
        $visit=function(array $side)use(&$visit,&$seen,&$teams,$fixtures):void{
            if(($side['type'] ?? '')==='team'){$teams[]=$side['source_team_id'];return;}
            $number=$side['match'] ?? 0;
            if(($side['type'] ?? '')!=='winner' || !isset($fixtures[$number]) || isset($seen[$number]))throw new \DomainException('โครงสร้างคู่แข่งขันไม่ถูกต้อง');
            $seen[$number]=true;$visit($fixtures[$number]['side_a']);$visit($fixtures[$number]['side_b']);unset($seen[$number]);
        };
        $visit($fixture['side_a']);$visit($fixture['side_b']);return array_values(array_unique($teams));
    }
    public static function overlap(string $a,string $b,string $c,string $d): bool {return new \DateTimeImmutable($a)<new \DateTimeImmutable($d) && new \DateTimeImmutable($c)<new \DateTimeImmutable($b);}
}
