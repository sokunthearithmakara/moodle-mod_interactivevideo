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
 * Class form
 *
 * @package    ivplugin_richtext
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class form extends \mod_interactivevideo\form\base_form {
    /**
     * Sets data for dynamic submission
     * @return void
     */
    public function set_data_for_dynamic_submission(): void {
        $data = $this->set_data_default();

        if (!empty($data->contentform)) {
            $draftideditor = file_get_submitted_draft_itemid('content');
            $data->content = [];
            $data->content["text"] = file_prepare_draft_area(
                $draftideditor,
                $data->contextid,
                'mod_interactivevideo',
                'content',
                $data->id,
                $this->editor_options(),
                $data->contentform ?? ''
            );
            $data->content["format"] = FORMAT_HTML;
            $data->content["itemid"] = $data->id;
        }

        $this->set_data($data);
    }

    /**
     * Pre-processes the form data
     *
     * @param mixed $data
     * @return mixed
     */
    public function pre_processing_data($data) {
        $data = parent::pre_processing_data($data);
        if ($data->completiontracking == 'none') {
            $data->xp = 0;
            $data->hascompletion = 0;
        } else {
            $data->hascompletion = 1;
        }

        return $data;
    }

    /**
     * Process dynamic submission
     *
     * @return void
     */
    public function process_dynamic_submission() {
        global $DB;
        // We're going to submit the data to database. If id is not 0, we're updating an existing record.
        $fromform = $this->get_data();
        $fromform = $this->pre_processing_data($fromform);
        $fromform->advanced = $this->process_advanced_settings($fromform);
        if ($fromform->id > 0) {
            $fromform->timemodified = time();
            $fromform->content = $fromform->content["text"];
            $DB->update_record('interactivevideo_items', $fromform);
        } else {
            $fromform->timecreated = time();
            $fromform->timemodified = $fromform->timecreated;
            $fromform->content = $fromform->content["text"];
            $fromform->id = $DB->insert_record('interactivevideo_items', $fromform);
        }

        $draftitemid = file_get_submitted_draft_itemid('content');
        $fromform->content = file_save_draft_area_files(
            $draftitemid,
            $fromform->contextid,
            'mod_interactivevideo',
            'content',
            $fromform->id,
            $this->editor_options(),
            $fromform->content
        );
        $DB->update_record('interactivevideo_items', $fromform);

        return $fromform;
    }

    /**
     * Form definition
     *
     * @return void
     */
    public function definition() {
        $mform = &$this->_form;

        $this->standard_elements();

        $mform->addElement('text', 'title', '<i class="bi bi-quote mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        $mform->addElement(
            'editor',
            'content',
            '<i class="bi bi-file-earmark-richtext mr-2"></i>' . get_string('content', 'ivplugin_richtext'),
            null,
            $this->editor_options()
        );
        $mform->setType('content', PARAM_RAW);
        $mform->addRule('content', get_string('required'), 'required', null, 'client');

        $this->completion_tracking_field('none', [
            'none' => get_string('completionnone', 'mod_interactivevideo'),
            'manual' => get_string('completionmanual', 'mod_interactivevideo'),
            'view' => get_string('completiononview', 'mod_interactivevideo'),
        ]);
        $this->xp_form_field();
        $mform->hideIf('xp', 'completiontracking', 'eq', 'none');
        $this->display_options_field();
        $this->advanced_form_fields([
            'hascompletion' => true,
        ]);
        $this->close_form();
    }
}
