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

namespace ivplugin_chapter;

/**
 * Class form
 *
 * @package    ivplugin_chapter
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class fbform extends \mod_flexbook\form\base_form {
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
                'mod_flexbook',
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
     * Process advanced settings
     *
     * @param \stdClass $data
     * @return string
     */
    public function process_advanced_settings($data) {
        $adv = parent::process_advanced_settings($data);
        $adv = json_decode($adv);
        $adv->lock = $data->lock;
        return json_encode($adv);
    }

    /**
     * Form definition
     *
     * @return void
     */
    public function definition() {
        $mform = &$this->_form;
        $this->standard_elements(false);

        $mform->addElement('text', 'title', '<i class="bi bi-quote iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        // Show as cover.
        $mform->addElement(
            'advcheckbox',
            'intg1',
            '',
            get_string('showascover', 'ivplugin_chapter'),
            ['group' => 1],
            [0, 1]
        );
        $mform->setDefault('intg1', 0);

        // Content.
        $mform->addElement(
            'editor',
            'content',
            '<i class="bi bi-file-earmark-richtext iv-mr-2"></i>' . get_string('description', 'ivplugin_chapter'),
            ['rows' => 6],
            $this->editor_options()
        );
        $mform->setType('content', PARAM_RAW);
        $mform->hideIf('content', 'intg1', 'notchecked');

        $group = [];
        $group[] = $mform->createElement(
            'select',
            'lock',
            '',
            [
                '' => get_string('unlock', 'ivplugin_chapter'),
                'untilprevious' => get_string('untilprevious', 'ivplugin_chapter'),
                'untilallprevious' => get_string('untilallprevious', 'ivplugin_chapter'),
                'untilcomplete' => get_string('untilcomplete', 'ivplugin_chapter'),
            ]
        );
        $group[] = $mform->createElement(
            'static',
            'lockdesc',
            '',
            '<span class="text-muted small w-100 d-block">'
                . get_string('lockdesc', 'ivplugin_chapter') . '</span>'
        );
        $mform->addGroup($group, 'lockgroup', get_string('lockchapter', 'ivplugin_chapter'), null, false);

        $this->jump_section_fields();

        $this->close_form();
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
            $DB->update_record('flexbook_items', $fromform);
        } else {
            $fromform->timecreated = time();
            $fromform->timemodified = $fromform->timecreated;
            $fromform->content = $fromform->content["text"];
            $fromform->id = $DB->insert_record('flexbook_items', $fromform);
        }

        $draftitemid = file_get_submitted_draft_itemid('content');
        $fromform->content = file_save_draft_area_files(
            $draftitemid,
            $fromform->contextid,
            'mod_flexbook',
            'content',
            $fromform->id,
            $this->editor_options(),
            $fromform->content
        );
        $DB->update_record('flexbook_items', $fromform);

        $fromform = $this->data_post_processing($fromform);

        return $fromform;
    }
}
