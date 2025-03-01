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
 * Class quicksettings_form
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class quicksettings_form extends \core_form\dynamic_form {
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
        $cmid = $this->optional_param('cmid', null, PARAM_INT);
        $contextid = $this->optional_param('contextid', null, PARAM_INT);
        // Get cached mod_info.
        $modinfo = get_fast_modinfo($course);
        $cm = $modinfo->get_cm($cmid);
        $data = [];
        $data['name'] = $cm->name;
        $data['courseid'] = $course;
        $data['displayoptions'] = $cm->customdata['displayoptions'];
        $data['posterimage'] = $cm->customdata['posterimage'];
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
        $data['posterimagefile'] = $draftitemid;

        $data['displayasstartscreen'] = $cm->customdata['displayasstartscreen'];

        $draftitemid = file_get_submitted_draft_itemid('intro');
        $intro = $cm->customdata['intro'];
        $data['introeditor'] = [
            'text' => file_prepare_draft_area(
                $draftitemid,
                $contextid,
                'mod_interactivevideo',
                'intro',
                0,
                ['subdirs' => 0],
                $intro
            ),
        ];

        $draftitemid = file_get_submitted_draft_itemid('endscreentext');
        $data['endscreentext'] = [
            'text' => file_prepare_draft_area(
                $draftitemid,
                $contextid,
                'mod_interactivevideo',
                'endscreentext',
                0,
                ['subdirs' => 0],
                $cm->customdata['endscreentext']
            ),
        ];

        $action = $this->optional_param('action', null, PARAM_ALPHA);
        if ($action == 'reset') {
            $cache = \cache::make('mod_interactivevideo', 'interactivevideo_settings');
            $settings = $cache->get($course);
            if (empty($settings) || !get_config('mod_interactivevideo', 'enablecoursesettings')) {
                $this->set_data($data);
                return;
            }
            $data['displayoptions'] = $settings['displayoptions'];
        }

        $data['showdescription'] = $cm->showdescription;

        $defaultvalues = $data;

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
        $this->set_data($defaultvalues);
    }

    /**
     * Process dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $DB, $OUTPUT;
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
        $data = new \stdClass();
        $data->displayinline = $fromform->displayinline; // Get this value so we can use it later in get_cm_html.
        $displayoptions = interactivevideo_display_options($fromform);
        $fromform->displayoptions = json_encode($displayoptions);
        $data->displayoptions = $fromform->displayoptions;
        $data->id = $fromform->interaction;
        $data->name = $fromform->name;
        $data->posterimage = $fromform->posterimage;
        $data->displayasstartscreen = $fromform->displayasstartscreen;
        $data->cmid = $fromform->cmid;
        // Intro text.
        $data->intro = $fromform->introeditor['text'];
        $draftitemid = $fromform->introeditor['itemid'];
        if ($draftitemid) {
            $data->intro = file_save_draft_area_files(
                $draftitemid,
                $fromform->contextid,
                'mod_interactivevideo',
                'intro',
                0,
                ['subdirs' => 0],
                $data->intro
            );
        }

        // End screen text.
        $data->endscreentext = $fromform->endscreentext['text'];
        $draftitemid = $fromform->endscreentext['itemid'];
        if ($draftitemid) {
            $data->endscreentext = file_save_draft_area_files(
                $draftitemid,
                $fromform->contextid,
                'mod_interactivevideo',
                'endscreentext',
                0,
                ['subdirs' => 0],
                $data->endscreentext
            );
        }

        $DB->update_record('interactivevideo', $data);

        // Handle show description.
        $DB->set_field('course_modules', 'showdescription', $fromform->showdescription, ['id' => $fromform->cmid]);

        // Purge the course module cache after update action.
        \course_modinfo::purge_course_module_cache($fromform->courseid, $fromform->cmid);

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
        if ($fromform->origin == 'coursepage') {
            $data->courseid = $fromform->courseid;
            return $this->get_cm_html($data);
        }
        return $data;
    }

    /**
     * Get course module html
     *
     * @param \stdClass $data
     * @return \stdClass
     */
    public function get_cm_html(\stdClass $data): \stdClass {
        global $CFG, $PAGE;
        require_once($CFG->dirroot . '/course/format/lib.php');
        $courseid = $data->courseid;
        $context = \context_course::instance($courseid);
        $PAGE->set_context($context);
        $format = course_get_format($courseid);
        $courseformat = $format->get_format();
        $renderer = $PAGE->get_renderer('format_' . $courseformat);
        // Rebuid the course cache.
        rebuild_course_cache($courseid, true);

        $modinfo = get_fast_modinfo($courseid);
        $cm = $modinfo->get_cm($data->cmid);

        if (!$data->displayinline) {
            $cm->set_after_link(interactivevideo_afterlink($cm));
        }

        $sectionid = $cm->sectionnum;
        $section = $modinfo->get_section_info($sectionid);
        $cmitemclass = $format->get_output_classname('content\\section\\cmitem');
        $cmitem = new $cmitemclass($format, $section, $cm);
        $return = new \stdClass();
        $return->html = $renderer->render($cmitem);
        return $return;
    }

    /**
     * Defines form elements
     */
    public function definition() {
        global $CFG;
        $mform = &$this->_form;
        $attributes = $mform->getAttributes();
        $attributes['class'] = $attributes['class'] . ' container-fluid';
        $mform->setAttributes($attributes);
        $mform->addElement('hidden', 'origin', $this->optional_param('origin', null, PARAM_ALPHA));
        $mform->setType('origin', PARAM_ALPHA);
        $mform->addElement('hidden', 'contextid', $this->optional_param('contextid', null, PARAM_INT));
        $mform->setType('contextid', PARAM_INT);
        $mform->addElement('hidden', 'interaction', $this->optional_param('interaction', null, PARAM_INT));
        $mform->setType('interaction', PARAM_INT);
        $mform->addElement('hidden', 'cmid', $this->optional_param('cmid', null, PARAM_INT));
        $mform->setType('cmid', PARAM_INT);
        $mform->addElement('hidden', 'courseid', $this->optional_param('courseid', null, PARAM_INT));
        $mform->setType('courseid', PARAM_INT);
        // Adding the standard "name" field.
        $mform->addElement('text', 'name', get_string('interactivevideoname', 'mod_interactivevideo'), [
            'size' => '100',
        ]);

        if (!empty($CFG->formatstringstriptags)) {
            $mform->setType('name', PARAM_TEXT);
        } else {
            $mform->setType('name', PARAM_CLEANHTML);
        }

        $mform->addRule('name', null, 'required', null, 'client');
        $mform->addRule('name', get_string('maximumchars', '', 255), 'maxlength', 255, 'client');
        $mform->addElement('hidden', 'posterimage', '');
        $mform->setType('posterimage', PARAM_RAW);

        $mform->addElement(
            'advcheckbox',
            'passwordprotected',
            '',
            get_string('passwordprotected', 'mod_interactivevideo'),
            ['group' => 1],
            [0, 1]
        );

        $context = $this->get_context_for_dynamic_submission();
        $mform->addElement('editor', 'introeditor', get_string('moduleintro'), ['rows' => 10], [
            'maxfiles' => EDITOR_UNLIMITED_FILES,
            'noclean' => true,
            'context' => $context,
            'subdirs' => true,
        ]);
        $mform->setType('introeditor', PARAM_RAW);

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
        return new \moodle_url('/course/modedit.php', [
            'id' => $this->optional_param('id', null, PARAM_INT),
            "contextid" => $this->optional_param("contextid", null, PARAM_INT),
        ]);
    }
}
