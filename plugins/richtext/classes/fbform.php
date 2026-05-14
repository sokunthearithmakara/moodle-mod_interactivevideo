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
class fbform extends \mod_flexbook\form\base_form {
    /**
     * Sets data for dynamic submission
     * @return void
     */
    public function set_data_for_dynamic_submission(): void {
        $data = $this->set_data_default();
        $data = \ivplugin_richtext\helper::prepare_editor_data($data, 'mod_flexbook', $this);
        $this->set_data($data);
    }

    /**
     * Process dynamic submission
     *
     * @return void
     */
    public function process_dynamic_submission() {
        // We're going to submit the data to database. If id is not 0, we're updating an existing record.
        $fromform = $this->get_data();
        $fromform = $this->pre_processing_data($fromform);
        $fromform->advanced = $this->process_advanced_settings($fromform);
        $fromform = \ivplugin_richtext\helper::save_editor_data($fromform, 'mod_flexbook', 'flexbook_items', $this);
        $fromform = $this->data_post_processing($fromform);
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

        \ivplugin_richtext\helper::add_richtext_elements($mform, $this);

        $this->completion_tracking_field('none', [
            'none' => get_string('completionnone', 'mod_interactivevideo'),
            'manual' => get_string('completionmanual', 'mod_interactivevideo'),
            'view' => get_string('completiononview', 'mod_interactivevideo'),
        ]);
        $this->xp_form_field();
        $mform->hideIf('xp', 'completiontracking', 'eq', 'none');

        $this->advanced_form_fields([
            'hascompletion' => true,
        ]);

        $this->jump_section_fields(true);

        $this->close_form();
    }
}
