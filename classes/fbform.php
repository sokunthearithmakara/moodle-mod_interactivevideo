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

namespace mod_interactivevideo;

/**
 * Class fbform
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class fbform extends \mod_flexbook\form\base_form {
    /**
     * Sets data for dynamic submission
     * @return void
     */
    public function set_data_for_dynamic_submission(): void {
        $data = $this->set_data_default();
        // Load the file in the draft area. mod_interactive, content.
        $draftitemid = file_get_submitted_draft_itemid('content');
        $data->content = file_prepare_draft_area(
            $draftitemid,
            $data->contextid,
            'mod_flexbook',
            'content',
            $data->id,
            null,
            $this->optional_param('content', '', PARAM_RAW)
        );
        $data->draftitemid = $draftitemid;
        $this->set_data($data);
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
            $DB->update_record('flexbook_items', $fromform);
        } else {
            $fromform->timecreated = time();
            $fromform->timemodified = $fromform->timecreated;
            $fromform->id = $DB->insert_record('flexbook_items', $fromform);
        }

        // Delete existing files.
        if ($fromform->draftitemid) {
            $fs = get_file_storage();
            $fs->delete_area_files($fromform->contextid, 'mod_flexbook', 'content', $fromform->id);

            $draftitemid = $fromform->draftitemid ?? 0;
            $fromform->content = file_save_draft_area_files(
                $draftitemid,
                $fromform->contextid,
                'mod_flexbook',
                'content',
                $fromform->id,
                ['subdirs' => true],
                $fromform->content
            );

            $DB->update_record('flexbook_items', $fromform);
        }

        $fromform = $this->data_post_processing($fromform);

        return $fromform;
    }

    /**
     * Form definition
     *
     * @return void
     */
    public function definition() {
        global $OUTPUT;
        $mform = &$this->_form;
        $this->standard_elements();

        $mform->addElement('hidden', 'draftitemid', 0);
        $mform->setType('draftitemid', PARAM_INT);

        $mform->addElement('text', 'title', '<i class="bi bi-play-btn iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        $addform = $OUTPUT->render_from_template('mod_interactivevideo/flexbook/add-form', [
            'url' => $this->optional_param('content', '', PARAM_TEXT),
        ]);
        $mform->addElement('html', $addform);

        // Checkbox to hide control.
        $mform->addElement('advcheckbox', 'intg1', '', get_string('hidecontrol', 'mod_interactivevideo'), ['group' => 1], [0, 1]);
        $mform->setDefault('intg1', 0);

        // Custom start and end time.
        $mform->addGroup([
            $mform->createElement('text', 'char2', get_string('starttime', 'mod_interactivevideo'), [
                'placeholder' => '0',
                'size' => 10,
                'title' => get_string('rightclicktosetcurrenttime', 'mod_interactivevideo'),
            ]),
            $mform->createElement('text', 'char3', get_string('endtime', 'mod_interactivevideo'), [
                'placeholder' => '0',
                'size' => 10,
                'title' => get_string('rightclicktosetcurrenttime', 'mod_interactivevideo'),
            ]),
            $mform->createElement('static', 'times_group_desc', '', '<div class="small text-muted">'
                . get_string('customsegment_help', 'mod_interactivevideo') . '</div>'),
        ], 'times_group', get_string('customsegment', 'mod_interactivevideo'), ' ', false);

        $mform->setType('char2', PARAM_INT);
        $mform->setType('char3', PARAM_INT);
        $mform->setDefault('char2', 0);
        $mform->setDefault('char3', 0);

        $mform->addElement('hidden', 'char1', 'html5video');

        $mform->addElement('hidden', 'content');
        $mform->setType('content', PARAM_TEXT);

        // Completion tracking.
        $this->completion_tracking_field('none', [
            'none' => get_string('completionnone', 'mod_interactivevideo'),
            'manual' => get_string('completionmanual', 'mod_interactivevideo'),
            'view' => get_string('completiononview', 'mod_interactivevideo'),
            'complete' => get_string('watchtillend', 'mod_interactivevideo'),
        ]);
        $this->xp_form_field();
        $mform->hideIf('xp', 'completiontracking', 'eq', 'none');

        $this->advanced_form_fields([
            'hascompletion' => true,
        ]);

        $this->jump_section_fields(true);

        $this->close_form();
    }

    /**
     * Validation
     *
     * @param array $data
     * @param array $files
     * @return array
     */
    public function validation($data, $files) {
        $errors = [];
        return $errors;
    }
}
