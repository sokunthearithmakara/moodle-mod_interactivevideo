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

namespace ivplugin_contentbank;

use moodle_url;
use core_contentbank\contentbank;

/**
 * Class form
 *
 * @package    ivplugin_contentbank
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
        $conditionaltime = json_decode($data->text1, true);
        $data->gotoonpassing = $conditionaltime['gotoonpassing'];
        $data->forceonpassing = $conditionaltime['forceonpassing'];
        $data->timeonpassing = date('H:i:s', strtotime('TODAY') + $conditionaltime['timeonpassing']);
        $data->gotoonfailed = $conditionaltime['gotoonfailed'];
        $data->forceonfailed = $conditionaltime['forceonfailed'];
        $data->timeonfailed = date('H:i:s', strtotime('TODAY') + $conditionaltime['timeonfailed']);
        $data->showtextonpassing = $conditionaltime['showtextonpassing'];
        $data->textonpassing = $conditionaltime['textonpassing'];
        $data->showtextonfailed = $conditionaltime['showtextonfailed'];
        $data->textonfailed = $conditionaltime['textonfailed'];
        $this->set_data($data);
    }

    /**
     * Form definition
     *
     * @return void
     */
    public function definition() {
        global $COURSE, $OUTPUT, $CFG;

        $bsaffix = $CFG->branch >= 500 ? '-bs' : '';
        $mform = &$this->_form;

        $this->standard_elements();

        $mform->addElement('text', 'title', '<i class="bi bi-quote iv-mr-2"></i>' . get_string('title', 'mod_interactivevideo'));
        $mform->setType('title', PARAM_TEXT);
        $mform->setDefault('title', get_string('defaulttitle', 'mod_interactivevideo'));
        $mform->addRule('title', get_string('required'), 'required', null, 'client');

        $mform->addElement('hidden', 'contentid', null);
        $mform->setType('contentid', PARAM_INT);

        $coursecontext = \context_course::instance($COURSE->id);
        $cb = new contentbank();
        // Prepare the toolbar.
        $toolbar = '<div class="contentbank-toolbar bg-white p-2 d-flex align-items-center justify-content-between iv-rounded-top">
            <span class="iv-font-weight-bold text-truncate mx-2">'
            . get_string('selectoruploadcontent', 'ivplugin_contentbank') . '</span>';

        $contenttypes = [];

        if (has_capability('moodle/contentbank:useeditor', $coursecontext)) {
            $enabledcontenttypes = $cb->get_enabled_content_types();
            foreach ($enabledcontenttypes as $contenttypename) {
                $contenttypeclass = "\\contenttype_$contenttypename\\contenttype";
                $contenttype = new $contenttypeclass($coursecontext);
                if ($contenttype->can_access()) {
                    $contenttypelibraries = $contenttype->get_contenttype_types();
                    if (!empty($contenttypelibraries)) {
                        foreach ($contenttypelibraries as $contenttypelibrary) {
                            $contenttypelibrary->type = $contenttypename;
                            $contenttypes[] = $contenttypelibrary;
                        }
                    }
                }
            }

            if (!empty($contenttypes)) {
                $toolbar .= '<div class="dropdown iv-ml-auto">
                                <button class="btn btn-primary text-uppercase dropdown-toggle" type="button" id="addnewcontent"
                                data' . $bsaffix . '-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i class="bi bi-plus-lg iv-mr-2"></i>' . get_string('add', 'ivplugin_contentbank') . '
                                </button>
                                <div class="dropdown-menu dropdown-menu-right dropdown-menu-end" id="addnewcontentdropdown"
                                aria-labelledby="addnewcontent">';
                foreach ($contenttypes as $type) {
                    $icon = $type->typeicon;
                    $url = new moodle_url('/contentbank/edit.php', [
                        'contextid' => $coursecontext->id,
                        'plugin' => $type->type,
                        'library' => $type->key,
                    ]);
                    if (empty($icon)) {
                        $icon = $OUTPUT->pix_icon(
                            'b/' . $type->type . '_library',
                            '',
                            'core',
                            ['class' => 'contentbank-itemlist-icon']
                        );
                    } else {
                        $icon = '<img class="contentbank-itemlist-icon" src="' . $icon . '"/>';
                    }
                    $toolbar .= '<a class="dropdown-item" target="_blank" href="' . $url
                        . '" data-library="' . $type->typeeditorparams .  '">' . $icon . $type->typename . '</a>';
                }
                $toolbar .= '</div></div>';
            }
        }

        // Upload button.
        if (has_capability('moodle/contentbank:upload', $coursecontext)) {
            $toolbar .= '<div class="btn btn-secondary ' . (empty($contenttypes) ? 'iv-ml-auto' : 'iv-ml-2') .
                '" id="uploadcontentbank" data' . $bsaffix . '-toggle="tooltip" data' . $bsaffix . '-trigger="hover"
                data' . $bsaffix . '-title="' . get_string('upload', 'ivplugin_contentbank')
                 . '"><i class="bi bi-upload"></i></div>';
        }

        // Refresh button.
        $toolbar .= '<div class="btn btn-secondary iv-ml-2"
            id="refreshcontentbank" data' . $bsaffix . '-toggle="tooltip" data-editable="'
            . has_capability('moodle/contentbank:useeditor', $coursecontext) . '" data' . $bsaffix . '-trigger="hover" data'
            . $bsaffix . '-title="'
            . get_string('resync', 'ivplugin_contentbank')
            . '"><i class="bi bi-arrow-repeat"></i></div></div>';

        // Prepare the content list.
        $foldercontents = $cb->search_contents('', $coursecontext->id);
        $contents = [];
        foreach ($foldercontents as $foldercontent) {
            $contenttype = $foldercontent->get_content_type_instance();
            $contents[] = [
                "id" => $foldercontent->get_id(),
                "name" => $foldercontent->get_name(),
                'icon' => $contenttype->get_icon($foldercontent),
                'type' => $contenttype->get_contenttype_name(),
            ];
        }

        // Sort contents by name.
        usort($contents, function ($a, $b) {
            return strcmp($a['name'], $b['name']);
        });

        $html = '<div class="contentbank-container iv-rounded-bottom bg-white">';

        foreach ($contents as $content) {
            $editurl = new moodle_url(
                '/contentbank/edit.php',
                ['contextid' => $coursecontext->id, 'id' => $content['id'], 'plugin' => $content['type']]
            );

            $html .= '<div class="contentbank-item d-flex align-items-center p-1 '
                . ($content['id'] == $this->optional_param('contentid', null, PARAM_INT) ? "selected" : "")
                . ' " data-contentid="' . $content['id']
                . '"><div class="contentbank-item-details d-flex align-items-center">';

            if ($content['icon']) {
                $html .= '<div class="contentbank-item-icon iv-ml-3 iv-mr-3" style="background-image: url('
                    . $content['icon']
                    . ')"/></div>';
            } else {
                $html .= '<div class="contentbank-item-icon iv-ml-3 iv-mr-3"></div>';
            }

            $html .= '<div class="contentbank-item-name w-100">' . $content['name'] . '</div></div>';
            $html .= '<div class="btn btn-sm iv-ml-auto contentbankview" data' . $bsaffix . '-toggle="tooltip"  data' . $bsaffix
                . '-trigger="hover" data' . $bsaffix . '-title="'
                . get_string('preview', 'ivplugin_contentbank')
                . '"><i class="bi bi-eye-fill"></i></div>';

            if (has_capability('moodle/contentbank:useeditor', $coursecontext)) {
                $html .= '<a class="btn btn-sm iv-ml-2" target="_blank" data' . $bsaffix . '-toggle="tooltip" data' . $bsaffix
                    . '-trigger="hover" data' . $bsaffix . '-title="'
                    . get_string('edit', 'ivplugin_contentbank')
                    . '" href="' . $editurl . '"><i class="bi bi-pencil-square"></i></a>';
            }

            $html .= '</div>';
        }

        if (empty($contents)) {
            $html .= '<div class="contentbank-item text-center p-2">'
                . get_string('nocontentfound', 'ivplugin_contentbank')
                . '</div>';
        }
        $html .= '</div>';

        $mform->addElement('html', '<div class="contentbank contentbank iv-rounded border border-secondary">'
            . $toolbar . $html . '</div><div id="contentbank-preview" class="mt-3"></div>');

        $mform->addElement('static', 'contentvalidation', '');

        $this->completion_tracking_field('complete', [
            'none' => get_string('completionnone', 'mod_interactivevideo'),
            'manual' => get_string('completionmanual', 'mod_interactivevideo'),
            'view' => get_string('completiononview', 'mod_interactivevideo'),
            'complete' => get_string('completiononcomplete', 'mod_interactivevideo'),
            'completepass' => get_string('completiononcompletepass', 'mod_interactivevideo'),
            'completefull' => get_string('completiononcompletefull', 'mod_interactivevideo'),
        ]);
        $this->xp_form_field();
        $mform->hideIf('xp', 'completiontracking', 'eq', 'none');
        $mform->addElement(
            'advcheckbox',
            'char1',
            '',
            get_string('awardpartialpoints', 'mod_interactivevideo'),
            ['group' => 1],
            [0, 1]
        );
        $mform->hideIf('char1', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->disabledIf('char1', 'xp', 'eq', 0);

        $this->display_options_field();
        $this->advanced_form_fields([
            'hascompletion' => true,
        ]);

        // Save state.
        $groups = [];
        $groups[] = $mform->createElement(
            'advcheckbox',
            'savecurrentstate',
            '',
            get_string('yes'),
            ['group' => 1],
            [0, 1]
        );
        $groups[] = $mform->createElement(
            'static',
            'savecurrentstatedesc',
            '',
            '<span class="text-muted small w-100 d-block">'
                . get_string('savecurrentstatedesc', 'ivplugin_contentbank') . '</span>'
        );
        $mform->addGroup($groups, '', get_string('savecurrentstate', 'ivplugin_contentbank'), null, false);

        $elements = [];
        $elements[] = $mform->createElement(
            'advcheckbox',
            'gotoonpassing',
            '',
            get_string('gototimestamp', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $elements[] = $mform->createElement(
            'advcheckbox',
            'forceonpassing',
            '',
            get_string('force', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $elements[] = $mform->createElement(
            'static',
            'gotosegment_desc',
            '',
            '<span class="text-muted small w-100 d-block">'
                . get_string('gotosegmentpassing_desc', 'ivplugin_contentbank') . '</span>'
        );
        $mform->addGroup(
            $elements,
            'gotosegmentpassing',
            get_string('onpassinggrade', 'ivplugin_contentbank'),
            '',
            false
        );
        $mform->disabledIf('forceonpassing', 'gotoonpassing', 'eq', 0);

        $elements = [];
        $elements[] = $mform->createElement(
            'text',
            'timeonpassing',
            '<i class="bi bi-clock iv-mr-2"></i>' . get_string('timeonpassing', 'ivplugin_contentbank'),
            [
                'size' => 25,
                'class' => 'timestamp-input',
                'readonly' => 'readonly',
                'placeholder' => '00:00:00',
            ]
        );
        $mform->setType('timeonpassing', PARAM_TEXT);
        $elements[] = $mform->createElement('button', 'timeonpassingbutton', '<i class="bi bi-stopwatch"></i>', [
            'class' => 'pickatime',
            'title' => get_string('pickatime', 'ivplugin_contentbank'),
            'data-field' => 'timeonpassing',
        ]);
        $elements[] = $mform->createElement('button', 'resettimepass', '<i class="bi bi-trash3 text-danger"></i>', [
            'class' => 'resettime',
            'title' => get_string('resettime', 'ivplugin_contentbank'),
            'data-field' => 'timeonpassing',
        ]);
        $mform->addGroup($elements, 'timeonpassinggroup', get_string('timeonpassing', 'ivplugin_contentbank'), '', false);
        // Text to display when passing.
        $mform->addElement(
            'advcheckbox',
            'showtextonpassing',
            '',
            get_string('showtextonpassing', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $mform->addElement(
            'editor',
            'textonpassing',
        );
        $mform->setType('textonpassing', PARAM_RAW);

        $mform->hideIf('gotosegmentpassing', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('timeonpassinggroup', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('showtextonpassing', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('textonpassing', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('timeonpassinggroup', 'gotoonpassing', 'eq', 0);
        $mform->hideIf('textonpassing', 'showtextonpassing', 'eq', 0);

        // Handle failing grade.
        $elements = [];
        $elements[] = $mform->createElement(
            'advcheckbox',
            'gotoonfailed',
            '',
            get_string('gototimestamp', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $elements[] = $mform->createElement(
            'advcheckbox',
            'forceonfailed',
            '',
            get_string('force', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $elements[] = $mform->createElement(
            'static',
            'gotosegment_desc',
            '',
            '<span class="text-muted small w-100 d-block">' . get_string('gotosegment_desc', 'ivplugin_contentbank') . '</span>'
        );
        $mform->addGroup($elements, 'gotosegment', get_string('onfailedgrade', 'ivplugin_contentbank'), '', false);
        $mform->disabledIf('forceonfailed', 'gotoonfailed', 'eq', 0);

        $elements = [];
        $elements[] = $mform->createElement(
            'text',
            'timeonfailed',
            '<i class="bi bi-clock iv-mr-2"></i>' . get_string('timeonfailed', 'ivplugin_contentbank'),
            [
                'size' => 25,
                'class' => 'timestamp-input',
                'readonly' => 'readonly',
                'placeholder' => '00:00:00',
            ]
        );
        $mform->setType('timeonfailed', PARAM_TEXT);
        $elements[] = $mform->createElement('button', 'timeonfailedbutton', '<i class="bi bi-stopwatch"></i>', [
            'class' => 'pickatime',
            'title' => get_string('pickatime', 'ivplugin_contentbank'),
            'data-field' => 'timeonfailed',
        ]);
        $elements[] = $mform->createElement('button', 'resettimefail', '<i class="bi bi-trash3 text-danger"></i>', [
            'class' => 'resettime',
            'title' => get_string('resettime', 'ivplugin_contentbank'),
            'data-field' => 'timeonfailed',
        ]);
        $mform->addGroup($elements, 'timeonfailedgroup', get_string('timeonfailed', 'ivplugin_contentbank'), '', false);

        // Text to display when failed.
        $mform->addElement(
            'advcheckbox',
            'showtextonfailed',
            '',
            get_string('showtextonfailed', 'ivplugin_contentbank'),
            null,
            [0, 1]
        );
        $mform->addElement(
            'editor',
            'textonfailed',
        );
        $mform->setType('textonfailed', PARAM_RAW);

        $mform->hideIf('gotosegment', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('timeonfailedgroup', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('showtextonfailed', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('textonfailed', 'completiontracking', 'in', ['none', 'manual', 'view']);
        $mform->hideIf('timeonfailedgroup', 'gotoonfailed', 'eq', 0);
        $mform->hideIf('textonfailed', 'showtextonfailed', 'eq', 0);

        $this->close_form();
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
        $adv->savecurrentstate = $data->savecurrentstate;
        return json_encode($adv);
    }

    /**
     * Pre-processes the form data
     *
     * @param mixed $data
     * @return mixed
     */
    public function pre_processing_data($data) {
        $data = parent::pre_processing_data($data);
        // If the completion tracking is set to none, manual, or view, then the partial points should be 0.
        if (in_array($data->completiontracking, ['none', 'manual', 'view'])) {
            $data->char1 = 0;
            $data->text1 = '';
        } else {
            $data->text1 = [
                'gotoonpassing' => $data->gotoonpassing,
                'forceonpassing' => $data->gotoonpassing == 1 && $data->forceonpassing == 1 ? 1 : 0,
                'timeonpassing' => $data->gotoonpassing == 1 ? $data->timeonpassing : '00:00:00',
                'showtextonpassing' => $data->showtextonpassing,
                'textonpassing' => $data->textonpassing,
                'gotoonfailed' => $data->gotoonfailed,
                'forceonfailed' => $data->gotoonfailed == 1 && $data->forceonfailed == 1 ? 1 : 0,
                'timeonfailed' => $data->gotoonfailed == 1 ? $data->timeonfailed : '00:00:00',
                'showtextonfailed' => $data->showtextonfailed,
                'textonfailed' => $data->textonfailed,
            ];

            // Convert timestamp to seconds.
            $data->text1['timeonpassing'] = strtotime($data->text1['timeonpassing']) - strtotime('TODAY');
            $data->text1['timeonfailed'] = strtotime($data->text1['timeonfailed']) - strtotime('TODAY');

            $data->text1 = json_encode($data->text1);
        }
        return $data;
    }

    /**
     * Validates form data
     *
     * @param mixed $data
     * @param mixed $files
     * @return void
     */
    public function validation($data, $files) {
        $errors = parent::validation($data, $files);
        if (empty($data['contentid'])) {
            $errors['contentvalidation'] = get_string('required');
        }
        return $errors;
    }

    /**
     * Get the page URL for dynamic submission
     *
     * @return \moodle_url
     */
    protected function get_page_url_for_dynamic_submission(): \moodle_url {
        return new \moodle_url('/contentbank/view.php', [
            'id' => $this->optional_param('id', null, PARAM_INT),
            "contextid" => $this->optional_param("contextid", null, PARAM_INT),
        ]);
    }
}
