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

namespace ivplugin_richtext;

/**
 * Helper class for richtext plugin.
 *
 * @package    ivplugin_richtext
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class helper {
    /**
     * Adds the richtext elements to a moodleform.
     *
     * @param \MoodleQuickForm $mform The form to add elements to.
     * @param \mod_interactivevideo\form\base_form|\mod_flexbook\form\base_form $forminstance The form instance.
     */
    public static function add_richtext_elements(&$mform, $forminstance) {
        $mform->addElement('text', 'title', '<i class="bi bi-quote iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        $mform->addElement(
            'editor',
            'content',
            '<i class="bi bi-file-earmark-richtext iv-mr-2"></i>' . get_string('content', 'ivplugin_richtext'),
            null,
            $forminstance->editor_options()
        );
        $mform->setType('content', PARAM_RAW);
        $mform->addRule('content', get_string('required'), 'required', null, 'client');
    }

    /**
     * Prepares the editor data for the form.
     *
     * @param object $data The data object.
     * @param string $component The component name.
     * @param object $forminstance The form instance.
     * @return object The prepared data.
     */
    public static function prepare_editor_data($data, $component, $forminstance) {
        if (!empty($data->contentform)) {
            $draftideditor = file_get_submitted_draft_itemid('content');
            $data->content = [];
            $data->content["text"] = file_prepare_draft_area(
                $draftideditor,
                $data->contextid,
                $component,
                'content',
                $data->id,
                $forminstance->editor_options(),
                $data->contentform ?? ''
            );
            $data->content["format"] = FORMAT_HTML;
            $data->content["itemid"] = $data->id;
        }
        return $data;
    }

    /**
     * Saves the editor data to the database.
     *
     * @param object $fromform The form data.
     * @param string $component The component name.
     * @param string $tablename The database table name.
     * @param object $forminstance The form instance.
     * @return object The saved data.
     */
    public static function save_editor_data($fromform, $component, $tablename, $forminstance) {
        global $DB;
        $draftitemid = $fromform->content["itemid"];
        if ($fromform->id > 0) {
            $fromform->timemodified = time();
            $fromform->content = $fromform->content["text"];
            $DB->update_record($tablename, $fromform);
        } else {
            $fromform->timecreated = time();
            $fromform->timemodified = $fromform->timecreated;
            $fromform->content = $fromform->content["text"];
            $fromform->id = $DB->insert_record($tablename, $fromform);
        }

        if ($draftitemid) {
            $fromform->content = file_save_draft_area_files(
                $draftitemid,
                $fromform->contextid,
                $component,
                'content',
                $fromform->id,
                $forminstance->editor_options(),
                $fromform->content
            );
            $DB->update_record($tablename, $fromform);
        }
        return $fromform;
    }
}
