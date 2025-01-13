<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Upgrade steps for Interactivevideo
 *
 * Documentation: {@link https://moodledev.io/docs/guides/upgrade}
 *
 * @package    mod_interactivevideo
 * @category   upgrade
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Execute the plugin upgrade steps from the given old version.
 *
 * @param int $oldversion
 * @return bool
 */
function xmldb_interactivevideo_upgrade($oldversion) {
    global $DB;
    $dbman = $DB->get_manager();
    if ($oldversion < 2024092204) {

        // Changing type of field start on table interactivevideo to number.
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('start', XMLDB_TYPE_NUMBER, '10, 2', null, null, null, null, 'displayasstartscreen');

        // Launch change of type for field start.
        $dbman->change_field_type($table, $field);

        $field = new xmldb_field('end', XMLDB_TYPE_NUMBER, '10, 2', null, null, null, null, 'start');

        // Launch change of type for field end.
        $dbman->change_field_type($table, $field);

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092204, 'interactivevideo');
    }

    if ($oldversion < 2024092214) {

        // Define field extendedcompletion to be added to interactivevideo.
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('extendedcompletion', XMLDB_TYPE_TEXT, null, null, null, null, null, 'posterimage');

        // Conditionally launch add field extendedcompletion.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092214, 'interactivevideo');
    }

    if ($oldversion < 2024092222) {

        // Rename field start on table interactivevideo to starttime.
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('start', XMLDB_TYPE_NUMBER, '10, 2', null, null, null, null, 'displayasstartscreen');

        // Launch rename field start.
        $dbman->rename_field($table, $field, 'starttime');

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092222, 'interactivevideo');
    }

    if ($oldversion < 2024092223) {

        // Rename field end on table interactivevideo to endtime.
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('end', XMLDB_TYPE_NUMBER, '10, 2', null, null, null, null, 'starttime');

        // Launch rename field end.
        $dbman->rename_field($table, $field, 'endtime');

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2024092223, 'interactivevideo');
    }

    if ($oldversion < 2025010100) {

        // Define field intg1 to be added to interactivevideo_items.
        $table = new xmldb_table('interactivevideo_items');
        $field = new xmldb_field('intg1', XMLDB_TYPE_INTEGER, '20', null, null, null, '0', 'advanced');

        // Conditionally launch add field intg1.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('intg2', XMLDB_TYPE_INTEGER, '20', null, null, null, '0', 'intg1');

        // Conditionally launch add field intg2.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('intg3', XMLDB_TYPE_INTEGER, '20', null, null, null, '0', 'intg2');

        // Conditionally launch add field intg3.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025010100, 'interactivevideo');
    }

    if ($oldversion < 2025010101) {

        // Define field lastviewed to be added to interactivevideo_completion.
        $table = new xmldb_table('interactivevideo_completion');
        $field = new xmldb_field('lastviewed', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0', 'completiondetails');

        // Conditionally launch add field lastviewed.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025010101, 'interactivevideo');
    }
    return true;
}
