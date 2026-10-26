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
     * Filemanager options for uploaded audio files.
     *
     * @return array
     */
    public static function audio_filemanager_options(): array {
        global $COURSE, $PAGE;
        $maxbytes = $COURSE->maxbytes ?? $PAGE->course->maxbytes ?? 0;
        return [
            'maxbytes' => $maxbytes,
            'subdirs' => 0,
            'maxfiles' => 1,
            'accepted_types' => ['html_audio'],
        ];
    }

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

        // Audio file upload.
        $mform->addElement(
            'filemanager',
            'audiofile',
            '<i class="bi bi-file-earmark-music iv-mr-2"></i>' . get_string('audiofile', 'ivplugin_richtext'),
            null,
            self::audio_filemanager_options()
        );

        // Autoplay checkbox.
        $mform->addElement(
            'advcheckbox',
            'intg1',
            '',
            get_string('autoplay', 'ivplugin_richtext'),
            null,
            [0, 1]
        );
        $mform->setType('intg1', PARAM_INT);
        $mform->setDefault('intg1', 0);
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
        global $CFG;
        require_once($CFG->libdir . '/filelib.php');
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

        $data->intg1 = !empty($data->intg1) ? 1 : 0;

        $draftidaudio = file_get_submitted_draft_itemid('audiofile');
        file_prepare_draft_area(
            $draftidaudio,
            $data->contextid,
            $component,
            'itext1',
            $data->id,
            self::audio_filemanager_options()
        );
        $data->audiofile = $draftidaudio;

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
        global $CFG, $DB;
        require_once($CFG->libdir . '/filelib.php');
        $draftitemid = $fromform->content["itemid"] ?? null;
        $fromform->intg1 = !empty($fromform->intg1) ? 1 : 0;

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

        if (!empty($fromform->audiofile)) {
            file_save_draft_area_files(
                $fromform->audiofile,
                $fromform->contextid,
                $component,
                'itext1',
                $fromform->id,
                self::audio_filemanager_options()
            );
        }

        return $fromform;
    }
}
