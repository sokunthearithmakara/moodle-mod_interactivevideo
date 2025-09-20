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
 * TODO describe file restore_itneractivevideo_course_settings
 *
 * @package    mod_interactivevideo
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class restore_interactivevideo_course_settings extends restore_activity_structure_step {
    /**
     * Structure step to restore one interactivevideo activity
     *
     * @return array
     */
    protected function define_structure() {
        global $DB;
        $paths = [];
        $restoreid = $this->get_restoreid();
        // Get the type from the controller.
        $type = $DB->get_field('backup_controllers', 'type', ['backupid' => $restoreid]);
        if ($type !== 'course') {
            // If the type is not course, we don't need to restore the settings.
            return $this->prepare_activity_structure($paths);
        }

        // Restore course settings.
        $paths[] = new restore_path_element('interactivevideosetting', '/activity/interactivevideosetting');

        $paths[] = new restore_path_element('defaultinfos', '/activity/interactivevideosetting/defaultinfos/defaultinfo');
        // Return the paths wrapped into standard activity structure.
        return $this->prepare_activity_structure($paths);
    }

    /**
     * Process a interactivevideo restore
     *
     * @param array $data
     * @return void
     */
    protected function process_interactivevideosetting($data) {

        if (empty($data)) {
            return;
        }

        // If the courseid is the same as the current course, we don't need to restore it.
        if ($data['courseid'] == $this->get_courseid()) {
            return;
        }

        if ($this->get_mappingid('interactivevideosetting', $data['courseid'])) {
            // If the courseid is already mapped, we don't need to restore it.
            return;
        }

        // If the current course already has the settings, we don't need to restore it.
        global $DB;
        if ($DB->record_exists('interactivevideo_settings', ['courseid' => $this->get_courseid()])) {
            return;
        }

        $data = (object)$data;
        $oldid = $data->courseid;
        $data->courseid = $this->get_courseid();
        $data->timecreated = time();
        $data->timemodified = time();
        $DB->insert_record('interactivevideo_settings', $data);
        $this->set_mapping('interactivevideosetting', $oldid, $data->courseid);
    }

    /**
     * Process default infos
     *
     * @param array $data
     * @return void
     */
    protected function process_defaultinfos($data) {

        if (empty($data)) {
            return;
        }

        // If the courseid is the same as the current course, we don't need to restore it.
        if ($data['courseid'] == $this->get_courseid()) {
            return;
        }

        global $DB;
        // If the current course already has the defaults for this type, we don't need to restore it.
        if ($DB->record_exists('interactivevideo_defaults', [
            'courseid' => $this->get_courseid(),
            'type' => $data['type'],
        ])) {
            return;
        }

        $data = (object)$data;
        $data->courseid = $this->get_courseid();
        $data->timecreated = time();
        $data->timemodified = time();
        $DB->insert_record('interactivevideo_defaults', $data);
    }
}
