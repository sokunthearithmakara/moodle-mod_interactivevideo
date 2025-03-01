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

use moodle_url;
use core_grades\component_gradeitems;

/**
 * Class settings_form
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class settings_form extends \core_form\dynamic_form {
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
        require_capability('mod/interactivevideo:manage', $this->get_context_for_dynamic_submission());
    }

    /**
     * Sets data for dynamic submission
     */
    public function set_data_for_dynamic_submission(): void {
        global $DB;
        $courseid = $this->optional_param('courseid', null, PARAM_INT);
        $contextid = $this->optional_param('contextid', null, PARAM_INT);
        $userid = $this->optional_param('userid', null, PARAM_INT);
        $action = $this->optional_param('action', null, PARAM_ALPHA);
        $cache = \cache::make('mod_interactivevideo', 'interactivevideo_settings');
        $data = $cache->get($courseid);
        if ($action == 'reset') {
            $data = new \stdClass();
            $data->courseid = $courseid;
            $data->id = 0;
            $data->userid = $userid;
            $data->contextid = $contextid;
            $this->set_data($data);
            return;
        }
        if (!$data) {
            $data = $DB->get_record('interactivevideo_settings', ['courseid' => $courseid]);
            if ($data) {
                $cache->set($courseid, $data);
            }
        }
        if (!$data) {
            $data = new \stdClass();
            $data->courseid = $courseid;
            $data->id = 0;
            $data->userid = $userid;
            $data->contextid = $contextid;
            $this->set_data($data);
            return;
        }
        $data->contextid = $contextid;
        $data->userid = $this->optional_param('userid', null, PARAM_INT);
        $draftitemid = file_get_submitted_draft_itemid('endscreentext');
        $data->endscreentext = [
            'text' => file_prepare_draft_area(
                $draftitemid,
                $contextid,
                'mod_interactivevideo',
                'endscreentext',
                0,
                ['subdirs' => 0],
                $data->endscreentext
            ),
        ];

        $defaultvalues = (array) $data;
        $draftitemid = file_get_submitted_draft_itemid('posterimagefile') ?? 0;
        file_prepare_draft_area(
            $draftitemid,
            $this->optional_param('contextid', null, PARAM_INT),
            'mod_interactivevideo',
            'posterimage',
            0,
            [
                'subdirs' => 0,
                'maxfiles' => 1,
                'maxbytes' => 500 * 1024,
                'accepted_types' => ['web_image'],
            ]
        );
        $defaultvalues['posterimagefile'] = $draftitemid;

        // Handle display options.
        $displayoptions = [
            'showdescriptiononheader',
            'darkmode',
            'usefixedratio',
            'disablechapternavigation',
            'preventskipping',
            'useoriginalvideocontrols',
            'hidemainvideocontrols',
            'preventseeking',
            'disableinteractionclick',
            'disableinteractionclickuntilcompleted',
            'hideinteractions',
            'theme',
            'distractionfreemode',
            'usecustomposterimage',
            'displayinline',
            'launchinpopup',
            'cardsize',
            'cardonly',
            'showposterimageright',
            'usecustomdescription',
            'customdescription',
            'showprogressbar',
            'showcompletionrequirements',
            'showposterimage',
            'showname',
            'pauseonblur',
            'autoplay',
            'columnlayout',
            'squareposterimage',
            'passwordprotected',
            'source',
            'showdescription',
            'completionview',
            'grade',
            'gradepass',
            'gradecat',
            'completionusegrade',
        ];

        if (empty($defaultvalues['displayoptions'])) {
            $defaultvalues['displayoptions'] = json_encode(array_fill_keys($displayoptions, 0));
        }

        $defaultdisplayoptions = json_decode($defaultvalues['displayoptions'], true);
        foreach ($displayoptions as $option) {
            $defaultvalues[$option] = !empty($defaultdisplayoptions[$option]) ? $defaultdisplayoptions[$option] : 0;
            if ($option == 'theme' && empty($defaultvalues[$option])) {
                $defaultvalues[$option] = '';
            }
            if ($option == 'customdescription' && empty($defaultvalues[$option])) {
                $defaultvalues[$option] = '';
            }
        }

        $defaultvalues['showdescription'] = $defaultdisplayoptions['showdescription'];

        $this->set_data($defaultvalues);
    }

    /**
     * Process dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $DB;
        $fromform = $this->get_data();
        // Poster image.
        // Save poster image file from draft area.
        $draftitemid = $fromform->posterimagefile;
        if ($draftitemid) {
            file_save_draft_area_files(
                $draftitemid,
                $fromform->contextid,
                'mod_interactivevideo',
                'posterimage',
                0
            );
        }
        $displayoptions = interactivevideo_display_options($fromform);
        $displayoptions['showdescription'] = $fromform->showdescription;
        $displayoptions['source'] = $fromform->source;
        $displayoptions['completionview'] = $fromform->completionview;
        $displayoptions['grade'] = $fromform->grade;
        $displayoptions['gradepass'] = $fromform->gradepass;
        $displayoptions['gradecat'] = $fromform->gradecat;
        $displayoptions['completionusegrade'] = $fromform->completionusegrade;
        $fromform->displayoptions = json_encode($displayoptions);
        $data = new \stdClass();
        $data->courseid = $fromform->courseid;
        $data->usermodified = $fromform->userid;
        $data->timemodified = time();
        $data->endscreenarray = $fromform->endscreentext;
        $draftitemid = $data->endscreenarray['itemid'];
        $data->endscreentext = file_save_draft_area_files(
            $draftitemid,
            $fromform->contextid,
            'mod_interactivevideo',
            'endscreentext',
            0,
            ['subdirs' => 0],
            $data->endscreenarray['text']
        );
        $data->displayasstartscreen = $fromform->displayasstartscreen;
        $data->completionpercentage = $fromform->completionpercentage;
        $data->displayoptions = $fromform->displayoptions;
        $data->id = $fromform->id;
        $data->extendedcompletion = $fromform->extendedcompletion;

        if ($fromform->id > 0) {
            $DB->update_record('interactivevideo_settings', $data);
        } else {
            $data->timecreated = time();
            $data->id = $DB->insert_record('interactivevideo_settings', $data);
        }

        // Cache the settings.
        $cache = \cache::make('mod_interactivevideo', 'interactivevideo_settings');
        $cache->set($fromform->courseid, $data);

        return $data;
    }

    /**
     * Defines form elements
     */
    public function definition() {
        global $CFG, $COURSE;
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
        require_once($CFG->libdir . '/gradelib.php');

        $mform = &$this->_form;
        $attributes = $mform->getAttributes();
        $attributes['class'] = $attributes['class'] . ' container';
        $mform->setAttributes($attributes);

        $mform->addElement('hidden', 'courseid', $this->optional_param('courseid', null, PARAM_INT));
        $mform->setType('courseid', PARAM_INT);

        $mform->addElement('hidden', 'id', $this->optional_param('id', null, PARAM_INT));
        $mform->setType('id', PARAM_INT);

        $mform->addElement('hidden', 'contextid', $this->optional_param('contextid', null, PARAM_INT));
        $mform->setType('contextid', PARAM_INT);

        $mform->addELement('hidden', 'userid', $this->optional_param('userid', null, PARAM_INT));
        $mform->setType('userid', PARAM_INT);

        $mform->addElement('header', 'general', get_string('general', 'form'));

        $videotypes = get_config('mod_interactivevideo', 'videosources');
        $videotypes = explode(',', $videotypes);
        $allowupload = in_array('html5video', $videotypes);
        // Allow link if $videotypes length is greater than 0 after removing html5video.
        $allowlink = count(array_diff($videotypes, ['html5video'])) > 0;

        // Add source selection field.
        $source = [];
        if ($allowupload) {
            $source['file'] = get_string('file', 'mod_interactivevideo');
        }
        if ($allowlink) {
            $source['url'] = get_string('url', 'mod_interactivevideo');
        }
        if (count($source) > 1) {
            $mform->addElement('select', 'source', get_string('source', 'mod_interactivevideo'), $source);
        } else {
            $mform->addElement('hidden', 'source', key($source));
        }
        $mform->setType('source', PARAM_TEXT);

        $mform->addElement(
            'advcheckbox',
            'passwordprotected',
            '',
            get_string('passwordprotected', 'mod_interactivevideo'),
            ['group' => 1],
            [0, 1]
        );
        // If the 'show description' feature is enabled, this checkbox appears below the intro.
        // We want to hide that when using the singleactivity course format because it is confusing.
        $mform->addElement('advcheckbox', 'showdescription', get_string('showdescription'));
        $mform->addElement(
            'advcheckbox',
            'showdescriptiononheader',
            '',
            get_string('displaydescriptiononactivityheader', 'mod_interactivevideo'),
            ['group' => 1],
            [0, 1]
        );

        $mform->addElement(
            'advcheckbox',
            'displayasstartscreen',
            '',
            get_string('displayasstartscreen', 'mod_interactivevideo'),
            ['group' => 1],
            [0, 1]
        );
        // End screen text.
        $mform->addElement(
            'editor',
            'endscreentext',
            get_string('endscreentext', 'mod_interactivevideo'),
            null,
            ['maxfiles' => EDITOR_UNLIMITED_FILES, 'noclean' => true]
        );
        $mform->setType('endscreentext', PARAM_RAW);

        $mform->addElement('header', 'videodisplayoptions', get_string('appearanceandbehaviorsettings', 'mod_interactivevideo'));

        interactivevideo_appearanceandbehavior_form($mform, null);

        $mform->addElement('header', 'activitycompletionheader', get_string('completionandgrade', 'mod_interactivevideo'));
        $mform->addElement('float', 'grade', get_string('gradenoun'), [
            'size' => 5,
            'regex' => '/^[0-9]{1,3}$/', // 1-3 digits.
        ]);
        $mform->setType('grade', PARAM_INT);
        $mform->setDefault('grade', 100);
        $mform->addElement('float', 'gradepass', get_string('gradepass', 'grades'), [
            'size' => 5,
            'regex' => '/^[0-9]{1,3}$/', // 1-3 digits.
        ]);
        $gradecatfieldname = component_gradeitems::get_field_name_for_itemnumber('mod_interactivevideo', 0, 'gradecat');
        $mform->addElement(
            'select',
            $gradecatfieldname,
            get_string('gradecategoryonmodform', 'grades'),
            grade_get_categories_menu($COURSE->id)
        );

        $mform->addElement(
            'advcheckbox',
            'completionview',
            get_string('completion', 'completion'),
            get_string('completionview_desc', 'completion'),
            ['group' => 1],
            [0, 1]
        );

        $mform->addElement(
            'advcheckbox',
            'completionusegrade',
            '',
            get_string('completionusegrade', 'completion'),
            ['group' => 1],
            [0, 1]
        );

        $mform->addElement('float', 'completionpercentage', get_string('minimumcompletionpercentage', 'mod_interactivevideo'), [
            'size' => 5,
            'regex' => '/^[0-9]{1,3}$/', // 1-3 digits.
        ]);
        $mform->setType('completionpercentage', PARAM_INT);

        // No group needed.
        // When two elements we need a group.
        $buttonarray = [
            $mform->createElement('submit', 'savechanges', get_string('savechanges')),
            $mform->createElement('cancel', '', get_string('resettositedefaults', 'mod_interactivevideo')),
        ];
        $buttonarname = 'buttonar';
        $mform->addGroup($buttonarray, $buttonarname, '', [' '], false);
        $mform->closeHeaderBefore('buttonar');
    }

    /**
     * Validation
     *
     * @param array $data
     * @param array $files
     * @return array
     */
    public function validation($data, $files) {
        global $USER;
        $errors = [];
        if ($data['usecustomposterimage']) {
            $draftitemid = $data['posterimagefile'];
            $usercontext = \context_user::instance($USER->id);
            $fs = get_file_storage();
            $files = $fs->get_area_files(
                $usercontext->id,
                'user',
                'draft',
                $draftitemid,
                'filename',
                false
            );
            if (empty($files)) {
                $errors['usecustomposterimage'] = get_string('uploadanimagebelow', 'mod_interactivevideo');
            }
        }
        return $errors;
    }

    /**
     * Get page url for dynamic submission
     *
     * @return \moodle_url
     */
    protected function get_page_url_for_dynamic_submission(): \moodle_url {
        return new \moodle_url('/mod/interactivevideo/manage.php', [
            'courseid' => $this->optional_param('courseid', null, PARAM_INT),
            "tab" => 'settings',
        ]);
    }
}
