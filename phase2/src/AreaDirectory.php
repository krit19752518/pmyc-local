<?php
declare(strict_types=1);
namespace PMYC\Phase2;

final class AreaDirectory
{
    /** Read the same non-executable JSON dataset used by Phase 1. */
    public static function districts(): array
    {
        static $districts=null;
        if ($districts!==null) return $districts;
        $source=file_get_contents(dirname(__DIR__,2).'/public/assets/data/thai-administrative-divisions.js');
        if (!preg_match('/window\.thaiAdministrativeDivisions\s*=\s*(\{.*\});\s*$/s',$source,$match)) throw new \RuntimeException('Area directory unavailable');
        $data=json_decode($match[1],true,512,JSON_THROW_ON_ERROR);
        if (!is_array($data['districts'] ?? null)) throw new \RuntimeException('Invalid area directory');
        return $districts=$data['districts'];
    }
}
