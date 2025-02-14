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

/**
 * Class reset_form
 * Form for resetting interactive video settings.
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class reset_form extends \core_form\dynamic_form {
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
        require_capability('mod/interactivevideo:edit', $this->get_context_for_dynamic_submission());
    }

    /**
     * Sets data for dynamic submission
     */
    public function set_data_for_dynamic_submission(): void {
        $course = $this->optional_param('courseid', null, PARAM_INT);
        $cmids = $this->optional_param('cmids', null, PARAM_RAW);
        $contextid = $this->optional_param('contextid', null, PARAM_INT);

        $data = [
            'courseid' => $course,
            'cmids' => $cmids,
            'contextid' => $contextid,
        ];
        $this->set_data($data);
    }

    /**
     * Process dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $DB, $OUTPUT;
        $fromform = $this->get_data();
        $courseid = $fromform->courseid;
        $cmids = explode(',', $fromform->cmids);
        $modinfo = get_fast_modinfo($courseid);
        $appearance = [
            'theme',
            'displayinline',
            'launchinpopup',
            'cardsize',
            'cardonly',
            'columnlayout',
            'showprogressbar',
            'showcompletionrequirements',
            'showposterimage',
            'showname',
            'showposterimageright',
            'usecustomdescription',
            'customdescription',
            'distractionfreemode',
            'darkmode',
            'usefixedratio',
            'disablechapternavigation',
            'useoriginalvideocontrols',
            'hidemainvideocontrols',
            'hideinteractions',
        ];

        $behavior = [
            'autoplay',
            'pauseonblur',
            'preventskipping',
            'preventseeking',
            'disableinteractionclick',
            'disableinteractionclickuntilcompleted',
        ];

        $cache = \cache::make('mod_interactivevideo', 'interactivevideo_settings');
        $defaultsettings = $cache->get($courseid);
        if (empty($defaultsettings) || !get_config('mod_interactivevideo', 'enablecoursesettings')) {
            $defaultsettings = new \stdClass();
            // Put the defaults from site settings.
            $displayoptions = new \stdClass();
            $appearancesettings = get_config('mod_interactivevideo', 'defaultappearance');
            $appearancesettings = explode(',', $appearancesettings);
            foreach ($appearancesettings as $setting) {
                $displayoptions->$setting = 1;
            }
            $displayoptions->cardsize = get_config('mod_interactivevideo', 'cardsize');
            $displayoptions->theme = get_config('mod_interactivevideo', 'defaulttheme');
            $behaviorsettings = get_config('mod_interactivevideo', 'defaultbehavior');
            $behaviorsettings = explode(',', $behaviorsettings);
            foreach ($behaviorsettings as $setting) {
                $displayoptions->$setting = 1;
            }
            $defaultsettings->displayoptions = json_encode($displayoptions);
        }

        if ($fromform->action == 'reset') {
            $resetpasswordprotected = $fromform->resetpasswordprotected;
            $resetintro = $fromform->resetintro;
            $showdescription = $fromform->showdescription;
            $showdescriptiononheader = $fromform->showdescriptiononheader;
            $displayasstartscreen = $fromform->displayasstartscreen;
            $defaultdisplayoptions = json_decode($defaultsettings->displayoptions, true);

            $updated = [];
            foreach ($cmids as $cmid) {
                $changed = false;
                $cmdata = new \stdClass();
                $cm = $modinfo->get_cm($cmid);
                $customdata = $cm->customdata;
                $cmdata->posterimage = $customdata['posterimage'];
                $displayoptions = json_decode($customdata['displayoptions'], true);
                $cmdata->olddisplayoptions = $displayoptions;
                $cmdata->id = $cm->instance;
                if ($fromform->resetappearance) {
                    $changed = true;
                    foreach ($appearance as $setting) {
                        $displayoptions[$setting] = $defaultdisplayoptions[$setting];
                    }

                    if ($displayoptions['usecustomposterimage']) {
                        // Get the poster image file url if use custom poster image to display as result.
                        $fs = get_file_storage();
                        $file = $fs->get_area_files(
                            $fromform->contextid,
                            'mod_interactivevideo',
                            'posterimage',
                            0,
                            'filesize DESC',
                        );
                        $file = reset($file);
                        if ($file) {
                            $posterimage = moodle_url::make_pluginfile_url(
                                $file->get_contextid(),
                                $file->get_component(),
                                $file->get_filearea(),
                                $file->get_itemid(),
                                $file->get_filepath(),
                                $file->get_filename()
                            );
                            $cmdata->posterimage = $posterimage->out();
                        }
                    }
                    if (empty($cmdata->posterimage)) {
                        $cmdata->posterimage = $OUTPUT->get_generated_image_for_id($fromform->cmid);
                    }
                }
                if ($fromform->resetbehavior) {
                    $changed = true;
                    foreach ($behavior as $setting) {
                        $displayoptions[$setting] = $defaultdisplayoptions[$setting];
                    }
                }

                if ($resetpasswordprotected == 1) {
                    $changed = true;
                    $displayoptions['passwordprotected'] = 1;
                } else if ($resetpasswordprotected == 2) {
                    $changed = true;
                    $displayoptions['passwordprotected'] = 0;
                }
                if ($resetintro) {
                    $changed = true;
                    $cmdata->intro = '';
                }
                if ($showdescriptiononheader == 1) {
                    $changed = true;
                    $displayoptions['showdescriptiononheader'] = 1;
                } else if ($showdescriptiononheader == 2) {
                    $changed = true;
                    $displayoptions['showdescriptiononheader'] = 0;
                }
                if ($displayasstartscreen == 1) {
                    $changed = true;
                    $cmdata->displayasstartscreen = 1;
                } else if ($displayasstartscreen == 2) {
                    $changed = true;
                    $cmdata->displayasstartscreen = 0;
                }
                $resetcache = false;
                if ($changed) {
                    $cmdata->displayoptions = json_encode(interactivevideo_display_options((object)$displayoptions));
                    $DB->update_record('interactivevideo', $cmdata);
                    $resetcache = true;
                }
                if ($showdescription != 0) {
                    $showdescription = $showdescription == 1 ? 1 : 0;
                    $DB->set_field('course_modules', 'showdescription', $showdescription, ['id' => $cmid]);
                    $resetcache = true;
                }
                if ($resetcache) {
                    // Reset the cache.
                    \course_modinfo::purge_course_module_cache($courseid, $cmid);
                }
                $updated[] = $cmdata;
            }
            return $updated;
        } else {
            $updated = [];
            $draftitemid = $fromform->posterimagefile;
            foreach ($cmids as $cmid) {
                $data = new \stdClass();
                $cm = $modinfo->get_cm($cmid);
                $contextid = $cm->context->id;
                $customdata = $cm->customdata;
                $data->posterimage = $customdata['posterimage'];
                $displayoptions = json_decode($customdata['displayoptions'], true);
                if ($fromform->action == 'appearance') {
                    foreach ($appearance as $setting) {
                        if (isset($fromform->$setting)) {
                            $displayoptions[$setting] = $fromform->$setting;
                        }
                    }
                    // Get the poster image file url if use custom poster image.
                    if ($displayoptions['usecustomposterimage']) {
                        $fs = get_file_storage();
                        $file = $fs->get_area_files(
                            $fromform->contextid,
                            'mod_interactivevideo',
                            'posterimage',
                            0,
                            'filesize DESC',
                        );
                        $file = reset($file);
                        if ($file) {
                            $posterimage = moodle_url::make_pluginfile_url(
                                $file->get_contextid(),
                                $file->get_component(),
                                $file->get_filearea(),
                                $file->get_itemid(),
                                $file->get_filepath(),
                                $file->get_filename()
                            );
                            $data->posterimage = $posterimage->out();
                        }
                    }
                    if (empty($data->posterimage)) {
                        $data->posterimage = $OUTPUT->get_generated_image_for_id($fromform->cmid);
                    }
                } else if ($fromform->action == 'behavior') {
                    foreach ($behavior as $setting) {
                        if (isset($fromform->$setting)) {
                            $displayoptions[$setting] = $fromform->$setting;
                        }
                    }
                }
                $displayoptions = json_encode(interactivevideo_display_options((object)$displayoptions));
                $data->id = $cmid;
                $data->displayoptions = $displayoptions;
                $DB->set_field('interactivevideo', 'displayoptions', $displayoptions, ['id' => $cm->instance]);
                // Reset the cache.
                \course_modinfo::purge_course_module_cache($courseid, $cmid);
                $updated[] = $data;
            }
            return $updated;
        }
    }

    /**
     * Defines form elements
     */
    public function definition() {
        global $CFG;
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');

        $courseid = $this->optional_param('courseid', null, PARAM_INT);
        $mform = &$this->_form;
        $attributes = $mform->getAttributes();
        $attributes['class'] = $attributes['class'] . ' container-fluid';
        $mform->setAttributes($attributes);

        $mform->addElement('hidden', 'contextid', $this->optional_param('contextid', null, PARAM_INT));
        $mform->setType('contextid', PARAM_INT);
        $mform->addElement('hidden', 'cmids', $this->optional_param('cmid', null, PARAM_RAW));
        $mform->setType('cmid', PARAM_RAW);
        $mform->addElement('hidden', 'courseid', $this->optional_param('courseid', null, PARAM_INT));
        $mform->setType('courseid', PARAM_INT);

        $action = $this->optional_param('action', 'reset', PARAM_TEXT);
        $mform->addElement('hidden', 'action', $action);
        $mform->setType('action', PARAM_TEXT);
        if ($action == 'reset') {
            $mform->addElement(
                'select',
                'resetpasswordprotected',
                get_string('passwordprotected', 'mod_interactivevideo'),
                [
                    0 => get_string('keepcurrent', 'mod_interactivevideo'),
                    1 => get_string('yes'),
                    2 => get_string('no'),
                ]
            );

            $mform->addElement(
                'html',
                '<hr/>'
            );

            $mform->addElement(
                'advcheckbox',
                'resetintro',
                get_string('moduleintro'),
                get_string('resetintro', 'mod_interactivevideo')
            );

            $mform->addElement(
                'select',
                'showdescription',
                get_string('showdescription'),
                [
                    0 => get_string('keepcurrent', 'mod_interactivevideo'),
                    1 => get_string('yes'),
                    2 => get_string('no'),
                ]
            );

            $mform->addElement(
                'select',
                'showdescriptiononheader',
                get_string('displaydescriptiononactivityheader', 'mod_interactivevideo'),
                [
                    0 => get_string('keepcurrent', 'mod_interactivevideo'),
                    1 => get_string('yes'),
                    2 => get_string('no'),
                ]
            );

            $mform->addElement(
                'select',
                'displayasstartscreen',
                get_string('displayasstartscreen', 'mod_interactivevideo'),
                [
                    0 => get_string('keepcurrent', 'mod_interactivevideo'),
                    1 => get_string('yes'),
                    2 => get_string('no'),
                ]
            );

            $mform->addElement(
                'html',
                '<hr/>'
            );

            $mform->addElement(
                'advcheckbox',
                'resetappearance',
                get_string('appearancesettings', 'mod_interactivevideo'),
                get_string('resetappearancesettings', 'mod_interactivevideo'),
                ['group' => 1],
                [0, 1]
            );

            $mform->addElement(
                'html',
                '<hr/>'
            );

            $mform->addElement(
                'advcheckbox',
                'resetbehavior',
                get_string('behaviorsettings', 'mod_interactivevideo'),
                get_string('resetbehaviorsettings', 'mod_interactivevideo'),
                ['group' => 1],
                [0, 1]
            );
        } else if ($action == 'appearance') {
            \interactivevideo_appearanceandbehavior_form($mform, null, ['appearance']);
            $mform->hideIf('usecustomposterimage', 'action', 'eq', 'appearance');
            $mform->hideIf('posterimagefile', 'action', 'eq', 'appearance');
        } else if ($action == 'behavior') {
            \interactivevideo_appearanceandbehavior_form($mform, null, ['behavior']);
        }

        $cache = \cache::make('mod_interactivevideo', 'interactivevideo_settings');
        $settings = $cache->get($courseid);
        if ($settings && get_config('mod_interactivevideo', 'enablecoursesettings')) {
            $displayoptions = json_decode($settings->displayoptions, true);
            $mform->setDefaults($displayoptions);
        }
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
