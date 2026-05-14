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

namespace ivplugin_iframe;

/**
 * Helper class for iframe plugin.
 *
 * @package    ivplugin_iframe
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class helper {
    /**
     * Adds the iframe elements to a moodleform.
     *
     * @param \MoodleQuickForm $mform The form to add elements to.
     * @param \mod_interactivevideo\form\base_form|\mod_flexbook\form\base_form $forminstance The form instance.
     */
    public static function add_iframe_elements(&$mform, $forminstance) {
        $mform->addElement('text', 'title', '<i class="bi bi-quote iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        $mform->addElement(
            'text',
            'iframeurl',
            '<i class="bi bi-link-45deg iv-mr-2"></i>' . get_string('iframeurl', 'ivplugin_iframe')
        );
        $mform->setType('iframeurl', PARAM_TEXT);

        $mform->addElement('hidden', 'char1');
        $mform->setType('char1', PARAM_TEXT);

        $mform->addElement(
            'textarea',
            'content',
            '<i class="bi bi-code-slash iv-mr-2"></i>' . get_string('embedcode', 'ivplugin_iframe'),
            ['rows' => 5]
        );
        $mform->setType('content', PARAM_RAW);
        $mform->addRule('content', get_string('required'), 'required', null, 'client');

        if ($forminstance->optional_param('content', '', PARAM_RAW) !== '') {
            $iframe = $forminstance->optional_param('content', '', PARAM_RAW);
            $padding = 'style="padding-bottom: ' . $forminstance->optional_param('char1', 0, PARAM_TEXT) . ';"';
        } else {
            $iframe = '';
            $padding = '';
        }

        $mform->addElement('html', '<div class="preview-iframe w-100 my-3 " ' . $padding . '>' . $iframe . '</div>');
    }
}
