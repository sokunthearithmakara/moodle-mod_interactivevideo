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
 * Test fixture: a scored content type form.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_interactivevideo\fixtures;

/**
 * A scored content type form, as the bundled types build one.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class outcome_form_scored_fixture extends \mod_interactivevideo\form\base_form {
    /**
     * Form definition.
     */
    public function definition() {
        $this->standard_elements();
        $this->completion_tracking_field('complete', [
            'none' => 'None',
            'complete' => 'Complete',
            'completepass' => 'Complete with pass',
        ]);
        $this->xp_form_field();
        $this->advanced_form_fields(['hascompletion' => true]);
        $this->close_form();
    }

    /**
     * Expose the form for assertions.
     *
     * @return \MoodleQuickForm
     */
    public function mform(): \MoodleQuickForm {
        return $this->_form;
    }
}
