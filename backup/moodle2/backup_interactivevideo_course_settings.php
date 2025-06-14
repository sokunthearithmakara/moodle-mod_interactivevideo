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
 * TODO describe file backup_interactivevideo_course_settings
 *
 * @package    mod_interactivevideo
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class backup_interactivevideo_course_settings extends backup_activity_structure_step {
    /**
     * Backup structure
     */
    protected function define_structure() {
        global $DB;
        // Define each element separated.
        $interactivevideosetting = new backup_nested_element('interactivevideosetting', ["id"], [
            'courseid',
            'endscreentext',
            'displayasstartscreen',
            'completionpercentage',
            'displayoptions',
            'extendedcompletion',
            'completion',
            'defaults',
        ]);

        // Nest the defaults from the interactivevideo_defaults table.
        $defaultinfos = new backup_nested_element('defaultinfos');
        // Get the columns from the interactivevideo_items table.
        $columns = $DB->get_columns('interactivevideo_defaults');
        // Convert the columns to an array of column names.
        $columns = array_keys($columns);
        // Remove the id column.
        $columns = array_diff($columns, ['id']);

        $default = new backup_nested_element('defaultinfo', ['id'], $columns);

        $interactivevideosetting->add_child($defaultinfos);
        $defaultinfos->add_child($default);

        // Define sources.
        $interactivevideosetting->set_source_table('interactivevideo_settings', ['courseid' => backup::VAR_COURSEID]);

        // Set the source for the defaults.
        $default->set_source_table('interactivevideo_defaults', ['courseid' => backup::VAR_COURSEID]);

        return $this->prepare_activity_structure($interactivevideosetting);
    }
}
