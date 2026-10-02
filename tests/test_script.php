<?php
define('CLI_SCRIPT', true);
require('../../../config.php');

$before = $DB->perf_get_reads();
$rs = $DB->get_recordset('user');
foreach ($rs as $r) {
    break; // just read one
}
$rs->close();
$after = $DB->perf_get_reads();

echo "Recordset reads: " . ($after - $before) . "\n";

$before = $DB->perf_get_reads();
$DB->get_records('user', [], '', '*', 0, 1);
$after = $DB->perf_get_reads();

echo "Records reads: " . ($after - $before) . "\n";
