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

namespace mod_interactivevideo\form;

/**
 * Class base_form
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class base_form extends \core_form\dynamic_form {
    /**
     * Returns form context
     *
     * If context depends on the form data, it is available in $this->_ajaxformdata or
     * by calling $this->optional_param()
     *
     * @return \context
     */
    protected function get_context_for_dynamic_submission(): \context {
        $contextid = $this->optional_param('contextid', null, PARAM_INT);
        return \context::instance_by_id($contextid, MUST_EXIST);
    }

    /**
     * Checks access for dynamic submission
     */
    protected function check_access_for_dynamic_submission(): void {
        require_capability('mod/interactivevideo:addinstance', $this->get_context_for_dynamic_submission());
    }

    /**
     * Sets data for dynamic submission
     */
    public function set_data_for_dynamic_submission(): void {
        $data = new \stdClass();
        $this->set_data($data);
    }

    /**
     * Sets default data for the form
     * Other forms can use this method to set default data
     *
     * @return \stdClass
     */
    public function set_data_default() {
        $data = new \stdClass();
        $data->id = $this->optional_param('id', 0, PARAM_INT);
        $data->contextid = $this->optional_param('contextid', null, PARAM_INT);
        $data->timestamp = $this->optional_param('timestamp', 1, PARAM_FLOAT);
        $data->timestampassist = $this->optional_param('timestampassist', '00:00:00', PARAM_TEXT);
        $data->courseid = $this->optional_param('courseid', null, PARAM_INT);
        $data->cmid = $this->optional_param('cmid', null, PARAM_INT);
        $data->annotationid = $this->optional_param('annotationid', null, PARAM_INT);
        $data->title = $this->optional_param('title', get_string('defaulttitle', 'mod_interactivevideo'), PARAM_TEXT);
        $data->contentform = $this->optional_param('content', '', PARAM_RAW);
        $data->iframeurl = $this->optional_param('iframeurl', '', PARAM_TEXT);
        $data->displayoptions = $this->optional_param('displayoptions', 'popup', PARAM_TEXT);
        $data->type = $this->optional_param('type', 'richtext', PARAM_TEXT);
        $data->contentid = $this->optional_param('contentid', null, PARAM_INT);
        $data->completiontracking = $this->optional_param('completiontracking', null, PARAM_TEXT);
        $data->xp = $this->optional_param('xp', null, PARAM_INT);
        $data->start = $this->optional_param('start', '00:00:00', PARAM_TEXT);
        $data->end = $this->optional_param('end', '00:00:00', PARAM_TEXT);
        $data->hascompletion = $this->optional_param('hascompletion', 0, PARAM_INT);
        $data->intg1 = $this->optional_param('intg1', null, PARAM_RAW);
        $data->intg2 = $this->optional_param('intg2', null, PARAM_RAW);
        $data->intg3 = $this->optional_param('intg3', null, PARAM_RAW);
        $data->char1 = $this->optional_param('char1', null, PARAM_RAW);
        $data->char2 = $this->optional_param('char2', null, PARAM_RAW);
        $data->char3 = $this->optional_param('char3', null, PARAM_RAW);
        $data->text1 = $this->optional_param('text1', '', PARAM_RAW);
        $data->text2 = $this->optional_param('text2', '', PARAM_RAW);
        $data->text3 = $this->optional_param('text3', '', PARAM_RAW);
        $data->requiremintime = $this->optional_param('requiremintime', 0, PARAM_INT);
        if ($data->completiontracking == 'view') {
            $data->requiremintimeview = $this->optional_param('requiremintime', 0, PARAM_INT);
            $data->requiremintime = 0;
        }
        $advancedsettings = json_decode($this->optional_param('advanced', null, PARAM_RAW));
        $data->visiblebeforecompleted = $advancedsettings->visiblebeforecompleted;
        $data->visibleaftercompleted = $advancedsettings->visibleaftercompleted;
        $data->clickablebeforecompleted = $advancedsettings->clickablebeforecompleted;
        $data->clickableaftercompleted = $advancedsettings->clickableaftercompleted;
        $data->replaybehavior = $advancedsettings->replaybehavior;
        if (isset($advancedsettings->advdismissible)) {
            $data->advdismissible = $advancedsettings->advdismissible;
        }
        if (isset($advancedsettings->advskippable)) {
            $data->advskippable = $advancedsettings->advskippable;
        }
        return $data;
    }

    /**
     * Form definition
     */
    public function definition() {
        $mform = $this->_form;
    }

    /**
     * Pre processing data before saving to database
     *
     * @param \stdClass $data
     * @return \stdClass
     */
    public function pre_processing_data($data) {
        if (!isset($data->completiontracking) || $data->completiontracking == 'none') {
            $data->xp = 0;
            $data->hascompletion = 0;
        } else {
            $data->hascompletion = 1;
        }
        if ($data->completiontracking == 'view') {
            $data->requiremintime = $data->requiremintimeview;
        }
        return $data;
    }

    /**
     * Process dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $DB;
        // We're going to submit the data to database. If id is not 0, we're updating an existing record.
        $fromform = $this->get_data();
        $fromform = $this->pre_processing_data($fromform);
        $fromform->advanced = $this->process_advanced_settings($fromform);
        if ($fromform->id > 0) {
            $fromform->timemodified = time();
            $DB->update_record('interactivevideo_items', $fromform);
        } else {
            $fromform->timecreated = time();
            $fromform->timemodified = $fromform->timecreated;
            $fromform->id = $DB->insert_record('interactivevideo_items', $fromform);
        }

        return $fromform;
    }

    /**
     * Process advanced settings
     *
     * @param \stdClass $data
     * @return string
     */
    public function process_advanced_settings($data) {
        $advancedsettings = new \stdClass();
        $advancedsettings->visiblebeforecompleted = $data->visiblebeforecompleted;
        $advancedsettings->visibleaftercompleted = $data->visibleaftercompleted;
        $advancedsettings->clickablebeforecompleted = $data->clickablebeforecompleted;
        $advancedsettings->clickableaftercompleted = $data->clickableaftercompleted;
        $advancedsettings->replaybehavior = $data->replaybehavior;
        $advancedsettings->advdismissible = $data->advdismissible;
        $advancedsettings->advskippable = $data->advskippable;
        return json_encode($advancedsettings);
    }

    /**
     * Used to set the form elements for the standard fields
     * that are common to all interactions
     */
    public function standard_elements() {
        $mform = &$this->_form;
        $attributes = $mform->getAttributes();
        $attributes['data-name'] = 'interaction-form';
        $mform->setAttributes($attributes);
        $mform->addElement('hidden', 'contextid', null);
        $mform->setType('contextid', PARAM_INT);

        $mform->addElement('hidden', 'type', null);
        $mform->setType('type', PARAM_TEXT);

        $mform->addElement('hidden', 'id', null);
        $mform->setType('id', PARAM_INT);

        $mform->addElement('hidden', 'courseid', null);
        $mform->setType('courseid', PARAM_INT);

        $mform->addElement('hidden', 'cmid', null);
        $mform->setType('cmid', PARAM_INT);

        $mform->addElement('hidden', 'annotationid', null);
        $mform->setType('annotationid', PARAM_INT);

        $mform->addElement('hidden', 'hascompletion', null);
        $mform->setType('hascompletion', PARAM_INT);

        $mform->addElement('hidden', 'start', null);
        $mform->setType('start', PARAM_TEXT);
        $mform->setDefault('start', $this->optional_param('start', '00:00:00.00', PARAM_TEXT));

        $mform->addElement('hidden', 'end', null);
        $mform->setType('end', PARAM_TEXT);
        $mform->setDefault('end', $this->optional_param('end', '00:00:00.00', PARAM_TEXT));

        $mform->addElement('hidden', 'timestamp', null);
        $mform->setType('timestamp', PARAM_FLOAT);
        $mform->setDefault('timestamp', 0);

        $mform->addElement('header', 'general', get_string('general', 'form'));

        $mform->addElement(
            'hidden',
            'timestampassist',
            '<i class="bi bi-stopwatch mr-2"></i>' . get_string('timestamp', 'mod_interactivevideo') . ' ['
                . $this->optional_param('start', '00:00:00.00', PARAM_TEXT) . ' - '
                . $this->optional_param(
                    'end',
                    '00:00:00.00',
                    PARAM_TEXT
                ) . ']',
            ['placeholder' => '00:00:00.00']
        );
        $mform->setType('timestampassist', PARAM_TEXT);
        $mform->setDefault(
            'timestampassist',
            $this->optional_param('timestampassist', '00:00:00.00', PARAM_TEXT)
        );
    }

    /**
     * Standard ompletion tracking field
     *
     * @param string $default
     * @param array $options
     * @return void
     */
    public function completion_tracking_field($default, $options = []) {
        $mform = &$this->_form;
        if (empty($options)) {
            $options = [
                'none' => get_string('completionnone', 'mod_interactivevideo'),
                'manual' => get_string('completionmanual', 'mod_interactivevideo'),
                'view' => get_string('completiononview', 'mod_interactivevideo'),
            ];
        }
        $this->render_dropdown(
            'completiontracking',
            '<i class="bi bi-check2-square mr-2"></i>' . get_string('completiontracking', 'mod_interactivevideo'),
            $options
        );
        $mform->setType('completiontracking', PARAM_TEXT);
        $mform->setDefault('completiontracking', $default);
        $mform->addElement(
            'text',
            'requiremintime',
            '<i class="bi bi-clock mr-2"></i>' . get_string('requiremintime', 'mod_interactivevideo')
        );
        $mform->setType('requiremintime', PARAM_INT);
        $mform->setDefault('requiremintime', 0);
        $mform->addRule('requiremintime', null, 'numeric', null, 'client');
        $mform->hideIf('requiremintime', 'completiontracking', 'neq', 'manual');
        $mform->addHelpButton('requiremintime', 'requiremintime', 'mod_interactivevideo');

        $mform->addElement(
            'text',
            'requiremintimeview',
            '<i class="bi bi-clock mr-2"></i>' . get_string('requiremintime', 'mod_interactivevideo')
        );
        $mform->setType('requiremintimeview', PARAM_INT);
        $mform->setDefault('requiremintimeview', 0);
        $mform->addRule('requiremintimeview', null, 'numeric', null, 'client');
        $mform->hideIf('requiremintimeview', 'completiontracking', 'neq', 'view');
        $mform->addHelpButton('requiremintimeview', 'requiremintime', 'mod_interactivevideo');
    }

    /**
     * Display options field
     *
     * @param string $default
     * @return void
     */
    public function display_options_field($default = 'popup') {
        $mform = &$this->_form;
        // Display options.
        $this->render_dropdown(
            'displayoptions',
            '<i class="bi bi-aspect-ratio mr-2"></i>' . get_string('displayoptions', 'mod_interactivevideo'),
            [
                'inline' => get_string('displayoptionsinline', 'mod_interactivevideo'),
                'popup' => get_string('displayoptionspopup', 'mod_interactivevideo'),
                'bottom' => get_string('displayoptionsbottom', 'mod_interactivevideo'),
                'side' => get_string('displayoptionsside', 'mod_interactivevideo'),
            ]
        );
        $mform->setType('displayoptions', PARAM_TEXT);
        $mform->setDefault('displayoptions', $default);
    }

    /**
     * XP field
     *
     * @param int $xp default value
     * @return void
     */
    public function xp_form_field($xp = 0) {
        $mform = &$this->_form;
        $mform->addElement('text', 'xp', '<i class="bi bi-star mr-2"></i>' . get_string('xp', 'mod_interactivevideo'));
        $mform->setType('xp', PARAM_INT);
        $mform->addRule('xp', null, 'numeric', null, 'client');
        $mform->setDefault('xp', $xp);
    }

    /**
     * Advanced form fields
     *
     * @param array $options
     * @return void
     */
    public function advanced_form_fields($options = []) {
        // Normalize options.
        $options += [
            'hascompletion' => false, // Whether the interaction has completion tracking.
            'visibility' => true, // Whether to show visibility options.
            'click' => true, // Whether to show clickability options.
            'rerun' => true, // Whether to show replay behavior options.
        ];

        $mform = &$this->_form;

        $mform->addElement('header', 'advanced', get_string('advanced', 'mod_interactivevideo'));
        // Collapse the advanced fields by default.
        $mform->setExpanded('advanced', false);
        if ($options['visibility']) {
            $elementarray = [];

            $elementarray[] = $mform->createElement(
                'advcheckbox',
                'visiblebeforecompleted',
                '',
                $options['hascompletion'] ?
                    get_string('beforecompletion', 'mod_interactivevideo') : get_string('yes', 'mod_interactivevideo'),
                ["group" => 1],
                [0, 1]
            );

            if ($options['hascompletion']) {
                $elementarray[] = $mform->createElement(
                    'advcheckbox',
                    'visibleaftercompleted',
                    '',
                    get_string('aftercompletion', 'mod_interactivevideo'),
                    ["group" => 1],
                    [0, 1]
                );
            }
            $elementarray[] = $mform->createElement(
                'static',
                'visibilityonvideonav',
                '',
                '<span class="text-muted small w-100 d-block">'
                    . get_string('visibilityonvideonav_desc', 'mod_interactivevideo') . '</span>'
            );

            $mform->addGroup($elementarray, '', get_string('visibilityonvideonav', 'mod_interactivevideo'));

            $mform->setDefault('visiblebeforecompleted', 1);
            $mform->setDefault('visibleaftercompleted', 1);
        }

        if ($options['click']) {
            $elementarray = [];

            $elementarray[] = $mform->createElement(
                'advcheckbox',
                'clickablebeforecompleted',
                '',
                $options['hascompletion'] ?
                    get_string('beforecompletion', 'mod_interactivevideo') : get_string('yes', 'mod_interactivevideo'),
                ["group" => 1],
                [0, 1]
            );

            if ($options['hascompletion']) {
                $elementarray[] = $mform->createElement(
                    'advcheckbox',
                    'clickableaftercompleted',
                    '',
                    get_string('aftercompletion', 'mod_interactivevideo'),
                    ["group" => 1],
                    [0, 1]
                );
            }
            $elementarray[] = $mform->createElement(
                'static',
                'clickability',
                '',
                '<span class="text-muted small w-100 d-block">'
                    . get_string('clickability_desc', 'mod_interactivevideo') . '</span>'
            );
            $mform->addGroup($elementarray, '', get_string('clickability', 'mod_interactivevideo'));
            $mform->setDefault('clickablebeforecompleted', 1);
            $mform->setDefault('clickableaftercompleted', 1);
        }

        if ($options['rerun'] && $options['hascompletion']) {
            $elementarray = [];

            $elementarray[] = $mform->createElement(
                'advcheckbox',
                'replaybehavior',
                '',
                get_string('replayaftercompletion', 'mod_interactivevideo'),
                ["group" => 1],
                [0, 1]
            );
            $elementarray[] = $mform->createElement(
                'static',
                'rerun',
                '',
                '<span class="text-muted small w-100 d-block">' . get_string('rerun_desc', 'mod_interactivevideo') . '</span>'
            );
            $mform->addGroup($elementarray, '', get_string('replaybehavior', 'mod_interactivevideo'));
            $mform->setDefault('replaybehavior', 0);
        } else if ($options['rerun'] && !$options['hascompletion']) {
            $mform->addElement('hidden', 'replaybehavior', 1);
        }

        if ($options['hascompletion']) {
            $elementarray = [];
            $elementarray[] = $mform->createElement(
                'advcheckbox',
                'advdismissible',
                '',
                get_string('dismissible', 'mod_interactivevideo'),
                ["group" => 1],
                [0, 1]
            );

            $elementarray[] = $mform->createElement(
                'advcheckbox',
                'advskippable',
                '',
                get_string('skippable', 'mod_interactivevideo'),
                ["group" => 1],
                [0, 1]
            );
            $elementarray[] = $mform->createElement(
                'static',
                'dismissibleandskippable',
                '',
                '<span class="text-muted small w-100 d-block">'
                 . get_string('dismissibleandskippable', 'mod_interactivevideo') . '</span>'
            );
            $mform->addGroup($elementarray, '', get_string('dismissible', 'mod_interactivevideo'));
            $mform->setDefault('advdismissible', 1);
            $mform->setDefault('advskippable', 1);
        }
    }

    /**
     * Standard close form element
     *
     * @return void
     */
    public function close_form() {
        $mform = &$this->_form;
        $mform->addElement('static', 'buttonar', '');
        $mform->closeHeaderBefore('buttonar');
        $this->set_display_vertical();
    }

    /**
     * Validation
     *
     * @param mixed $data
     * @param mixed $files
     * @return void
     */
    public function validation($data, $files) {
        $errors = [];
        return $errors;
    }

    /**
     * Editor options
     *
     * @return array
     */
    public function editor_options() {
        return [
            'maxfiles' => EDITOR_UNLIMITED_FILES,
            'maxbytes' => 0,
            'trusttext' => false,
            'context' => $this->get_context_for_dynamic_submission(),
        ];
    }

    /**
     * Render select dropdown based on Moodle version.
     *
     * @param string $name
     * @param string $label
     * @param mixed $opts
     * @param array $attributes
     * @return void
     */
    public function render_dropdown($name, $label, $opts, $attributes = []) {
        $mform = &$this->_form;
        // Originally, we wanted to use the new dropdown in 4.4, but it looks ugly, so we'll stick with the old one.
        // Keeping it here now in case we want to switch back.
        $mform->addElement('select', $name, $label, $opts, $attributes);
    }

    /**
     * Returns page URL for dynamic submission
     *
     * @return \moodle_url
     */
    protected function get_page_url_for_dynamic_submission(): \moodle_url {
        return new \moodle_url('/mod/interactivevideo/view.php', [
            'id' => $this->optional_param('id', null, PARAM_INT),
        ]);
    }
}
