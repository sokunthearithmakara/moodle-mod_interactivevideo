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

namespace ivplugin_skipsegment;

/**
 * Class form
 *
 * @package    ivplugin_skipsegment
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
        $decimal = $data->title - (int)$data->title;
        $data->titleassist = gmdate("H:i:s", (int)$data->title) .
            ($decimal ? '.' . str_pad((string)round($decimal * 100), 2, '0', STR_PAD_LEFT) : '');
        $this->set_data($data);
    }

    /**
     * Form definition
     *
     * @return void
     */
    public function definition() {
        $mform = &$this->_form;

        $this->standard_elements();

        $mform->addElement('hidden', 'title');
        $mform->setType('title', PARAM_FLOAT);
        $mform->addElement(
            'text',
            'titleassist',
            '<i class="bi bi-stopwatch mr-2"></i>' . get_string('endtime', 'ivplugin_skipsegment'),
            ['placeholder' => '00:00:00.00']
        );
        $mform->setType('titleassist', PARAM_TEXT);
        $mform->addRule('titleassist', get_string('required'), 'required', null, 'client');
        $mform->addRule(
            'titleassist',
            get_string('invalidtimestamp', 'mod_interactivevideo'),
            'regex',
            '/^([0-9]{2}):([0-5][0-9]):([0-5][0-9])(\.\d{2})?$/',
            'client'
        );
        $this->advanced_form_fields([
            'hascompletion' => false,
        ]);
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
        $errors = parent::validation($data, $files);

        // Title must be greater than timestamp.
        if ($data['title'] <= $data['timestamp']) {
            $errors['titleassist'] = get_string('untiltimemustbegreaterthantimestamp', 'ivplugin_skipsegment');
        }

        return $errors;
    }
}
