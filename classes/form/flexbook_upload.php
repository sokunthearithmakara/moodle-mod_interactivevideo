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
 * Class upload
 *
 * @package    mod_interactivevideo
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class flexbook_upload extends \core_form\dynamic_form {
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
        require_capability('mod/flexbook:addinstance', $this->get_context_for_dynamic_submission());
    }

    /**
     * Sets data for dynamic submission
     */
    public function set_data_for_dynamic_submission(): void {
        $data = new \stdClass();
        $data->id = $this->optional_param('id', 0, PARAM_INT);
        $data->contextid = $this->optional_param('contextid', null, PARAM_INT);
        $data->type = $this->optional_param('type', 'video', PARAM_TEXT);
        $this->set_data($data);
    }

    /**
     * Form definition
     */
    public function definition() {
        global $COURSE;
        $mform = $this->_form;
        $mform->addElement('hidden', 'contextid', null);
        $mform->setType('contextid', PARAM_INT);
        $mform->addElement('hidden', 'id', 0);
        $mform->setType('id', PARAM_INT);

        $filemanageroptions = [
            'subdirs' => 0,
            'maxfiles' => 1,
            'maxbytes' => $COURSE->maxbytes,
            'accepted_types' => ['html_video', 'html_audio'],
        ];

        $mform->addElement(
            'filemanager',
            'videofile',
            '',
            null,
            $filemanageroptions
        );
        $mform->addRule('videofile', get_string('required'), 'required', null, 'client');

        $this->set_display_vertical();
    }

    /**
     * Processes dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $USER;
        $usercontextid = \context_user::instance($USER->id)->id;

        $fromform = $this->get_data();
        $fromform->usercontextid = $usercontextid;
        // Get the draft file.
        if (!empty($fromform->videofile)) {
            $fs = get_file_storage();
            $files = $fs->get_area_files(
                $fromform->usercontextid,
                'user',
                'draft',
                $fromform->videofile,
                'filesize DESC',
                false
            );
            $fromform->files = $files;
            $file = reset($files);
            if ($file) {
                $originalname = $file->get_filename();
                // Make sure the file has unique name.
                $filerecord = [
                    'contextid' => $usercontextid,
                    'component' => 'user',
                    'filearea'  => 'draft',
                    'itemid'    => $fromform->videofile, // Use the new draft item ID.
                    'filepath'  => $file->get_filepath(),
                    'filename'  => time() . '_' . $originalname,
                ];

                // Copy the file to the new draft item ID.
                if (
                    !$fs->file_exists(
                        $filerecord['contextid'],
                        $filerecord['component'],
                        $filerecord['filearea'],
                        $filerecord['itemid'],
                        $filerecord['filepath'],
                        $filerecord['filename']
                    )
                ) {
                    $fs->create_file_from_storedfile($filerecord, $file);
                }

                // Delete the original file to prevent two files from being saved.
                $file->delete();

                $url = \moodle_url::make_draftfile_url(
                    $filerecord['itemid'],
                    $filerecord['filepath'],
                    $filerecord['filename']
                )->out();
                $fromform->url = $url;
                $fromform->filename = substr($originalname, 0, strrpos($originalname, '.'));
            } else {
                $fromform->url = new \moodle_url('');
            }
        }
        return $fromform;
    }

    /**
     * Validates form data
     * @param array $data
     * @param array $files
     * @return array
     */
    public function validation($data, $files) {
        $errors = [];
        return $errors;
    }

    /**
     * Returns page URL for dynamic submission
     * @return \moodle_url
     */
    protected function get_page_url_for_dynamic_submission(): \moodle_url {
        return new \moodle_url('/mod/flexbook/interactions.php', [
            'id' => $this->optional_param('annotationid', null, PARAM_INT),
        ]);
    }
}
