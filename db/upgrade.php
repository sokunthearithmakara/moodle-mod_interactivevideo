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

    if ($oldversion < 2025011309) {
        // Define table interactivevideo_settings to be created.
        $table = new xmldb_table('interactivevideo_settings');

        // Adding fields to table interactivevideo_settings.
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '20', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('usermodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('endscreentext', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('displayasstartscreen', XMLDB_TYPE_INTEGER, '1', null, null, null, null);
        $table->add_field('completionpercentage', XMLDB_TYPE_INTEGER, '3', null, null, null, null);
        $table->add_field('displayoptions', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('extendedcompletion', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('completion', XMLDB_TYPE_INTEGER, '1', null, null, null, null);

        // Adding keys to table interactivevideo_settings.
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('usermodified', XMLDB_KEY_FOREIGN, ['usermodified'], 'user', ['id']);

        // Adding indexes to table interactivevideo_settings.
        $table->add_index('courseid', XMLDB_INDEX_UNIQUE, ['courseid']);

        // Conditionally launch create table for interactivevideo_settings.
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025011309, 'interactivevideo');
    }

    if ($oldversion < 2025033001) {
        // Define key usermodified (foreign) to be dropped form interactivevideo_settings.
        $table = new xmldb_table('interactivevideo_settings');
        $key = new xmldb_key('usermodified', XMLDB_KEY_FOREIGN, ['usermodified'], 'user', ['id']);

        // Launch drop key usermodified.
        $dbman->drop_key($table, $key);

        $field = new xmldb_field('usermodified');

        // Conditionally launch drop field usermodified.
        if ($dbman->field_exists($table, $field)) {
            $dbman->drop_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025033001, 'interactivevideo');
    }

    if ($oldversion < 2025041202) {
        // Define field timeended to be added to interactivevideo_completion.
        $table = new xmldb_table('interactivevideo_completion');
        $field = new xmldb_field('timeended', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'timecompleted');

        // Conditionally launch add field timeended.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025041202, 'interactivevideo');
    }

    if ($oldversion < 2025052803) {
        // Define field intg4 to be added to interactivevideo_log.
        $table = new xmldb_table('interactivevideo_log');
        $field = new xmldb_field('intg4', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'intg3');

        // Conditionally launch add field intg4.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('intg5', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'intg4');

        // Conditionally launch add field intg5.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('intg6', XMLDB_TYPE_INTEGER, '20', null, null, null, null, 'intg5');

        // Conditionally launch add field intg5.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('char4', XMLDB_TYPE_CHAR, '255', null, null, null, null, 'char3');

        // Conditionally launch add field char4.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('char5', XMLDB_TYPE_CHAR, '255', null, null, null, null, 'char4');

        // Conditionally launch add field char4.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        $field = new xmldb_field('char6', XMLDB_TYPE_CHAR, '255', null, null, null, null, 'char5');

        // Conditionally launch add field char4.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Define field defaults to be added to interactivevideo_settings.
        $table = new xmldb_table('interactivevideo_settings');
        $field = new xmldb_field('defaults', XMLDB_TYPE_TEXT, null, null, null, null, null, 'completion');

        // Conditionally launch add field defaults.
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025052803, 'interactivevideo');
    }

    if ($oldversion < 2025052805) {
        // Define table interactivevideo_defaults to be created.
        $table = new xmldb_table('interactivevideo_defaults');

        // Adding fields to table interactivevideo_defaults.
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '20', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timestamp', XMLDB_TYPE_NUMBER, '20, 2', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('content', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('xp', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('displayoptions', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, 'popup');
        $table->add_field('type', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, 'richtext');
        $table->add_field('hascompletion', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('completiontracking', XMLDB_TYPE_CHAR, '255', null, XMLDB_NOTNULL, null, 'manual');
        $table->add_field('advanced', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('intg1', XMLDB_TYPE_INTEGER, '20', null, null, null, '0');
        $table->add_field('intg2', XMLDB_TYPE_INTEGER, '20', null, null, null, '0');
        $table->add_field('intg3', XMLDB_TYPE_INTEGER, '20', null, null, null, '0');
        $table->add_field('char1', XMLDB_TYPE_CHAR, '255', null, null, null, 'null');
        $table->add_field('char2', XMLDB_TYPE_CHAR, '255', null, null, null, 'null');
        $table->add_field('char3', XMLDB_TYPE_CHAR, '255', null, null, null, 'null');
        $table->add_field('text1', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('text2', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('text3', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('requiremintime', XMLDB_TYPE_INTEGER, '20', null, null, null, null);

        // Adding keys to table interactivevideo_defaults.
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('courseid', XMLDB_KEY_FOREIGN, ['courseid'], 'course', ['id']);

        // Conditionally launch create table for interactivevideo_defaults.
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025052805, 'interactivevideo');
    }

    if ($oldversion < 2025091802) {
        // Changing precision of field videourl on table interactivevideo to (1333).
        $table = new xmldb_table('interactivevideo');
        $field = new xmldb_field('videourl', XMLDB_TYPE_CHAR, '1333', null, null, null, null, 'source');

        // Launch change of precision for field videourl.
        $dbman->change_field_precision($table, $field);

        // Interactivevideo savepoint reached.
        upgrade_mod_savepoint(true, 2025091802, 'interactivevideo');
    }

    return true;
}
