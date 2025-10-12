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

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/interactivevideo/backup/moodle2/restore_interactivevideo_stepslib.php');
require_once($CFG->dirroot . '/mod/interactivevideo/backup/moodle2/restore_interactivevideo_course_settings.php');

/**
 * Testore task that provides all the settings and steps to perform one complete restore of the activity
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class restore_interactivevideo_activity_task extends restore_activity_task {
    /**
     * Define (add) particular settings this activity can have
     */
    protected function define_my_settings() {
        // No particular settings for this activity.
    }

    /**
     * Define (add) particular steps this activity can have
     */
    protected function define_my_steps() {
        global $DB;
        $this->add_step(new restore_interactivevideo_activity_structure_step('interactivevideo_structure', 'interactivevideo.xml'));
        $restoreid = $this->get_restoreid();
        // Get the type from the controller.
        $type = $DB->get_field('backup_controllers', 'type', ['backupid' => $restoreid]);
        if ($type !== 'course') {
            // If the type is not course, we don't need to restore the settings.
            return;
        }
        $this->add_step(new restore_interactivevideo_course_settings(
            'interactivevideosettings_structure',
            'interactivevideo_settings.xml'
        ));
    }

    /**
     * Define the contents in the activity that must be processed by the link decoder
     *
     * @return array
     */
    public static function define_decode_contents() {
        $contents = [];
        $contents[] = new restore_decode_content(
            'interactivevideo',
            ['intro', 'endscreentext'],
            'interactivevideo'
        );
        $contents[] = new restore_decode_content(
            'interactivevideo_items',
            ['content', 'text1', 'text2', 'text3'],
            'annotationitems'
        );
        $contents[] = new restore_decode_content(
            'interactivevideo_log',
            ['text1', 'text2', 'text3'],
            'logdata'
        );
        return $contents;
    }

    /**
     * Define the decoding rules for links belonging to the activity to be executed by the link decoder
     *
     * @return array
     */
    public static function define_decode_rules() {
        $rules = [];

        $rules[] = new restore_decode_rule('INTERACTIVEVIDEOVIEWBYID', '/mod/interactivevideo/view.php?id=$1', 'course_module');
        $rules[] = new restore_decode_rule('INTERACTIVEVIDEOINDEX', '/mod/interactivevideo/index.php?id=$1', 'course');
        $rules[] = new restore_decode_rule('INTERACTIVEVIDEOVIEWCMID', '/mod/interactivevideo/view.php?i=$1', 'interactivevideo');

        return $rules;
    }

    /**
     * Define the restoring rules for logs belonging to the activity to be executed by the link decoder.
     *
     * @return array
     */
    public static function define_restore_log_rules() {
        $rules = [];

        $rules[] = new restore_log_rule('interactivevideo', 'add', 'view.php?id={course_module}', '{interactivevideo}');
        $rules[] = new restore_log_rule('interactivevideo', 'update', 'view.php?id={course_module}', '{interactivevideo}');
        $rules[] = new restore_log_rule('interactivevideo', 'view', 'view.php?id={course_module}', '{interactivevideo}');

        return $rules;
    }

    /**
     * Define the restoring rules for course associated to the activity to be executed by the link decoder.
     *
     * @return array
     */
    public static function define_restore_log_rules_for_course() {
        $rules = [];

        $rules[] = new restore_log_rule('interactivevideo', 'view all', 'index.php?id={course}', null);

        return $rules;
    }
}
