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
class form extends \mod_interactivevideo\form\base_form {
    /**
     * Sets data for dynamic submission
     * @return void
     */
    public function set_data_for_dynamic_submission(): void {
        $data = $this->set_data_default();
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
        $this->standard_elements();

        $mform->addElement('text', 'title', '<i class="bi bi-quote iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');
        $mform->addElement('advcheckbox', 'char1', get_string('showtitle', 'ivplugin_chapter'));
        $mform->setDefault('char1', 1);
        $mform->addHelpButton('char1', 'showtitle', 'ivplugin_chapter');

        $this->advanced_form_fields([
            'hascompletion' => false,
        ]);

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

        $this->close_form();
    }
}
