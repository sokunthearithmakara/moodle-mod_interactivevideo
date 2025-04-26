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
use core_contentbank\contentbank;

/**
 * Class bulk_upload_form
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class bulk_upload_form extends \core_form\dynamic_form {
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
        $data = new \stdClass();
        $data->id = $this->optional_param('id', 0, PARAM_INT);
        $data->contextid = $this->optional_param('contextid', null, PARAM_INT);
        $data->courseid = $this->optional_param('courseid', null, PARAM_INT);
        $data->annotations = $this->optional_param('annotations', null, PARAM_INT);
        $data->annotationid = $this->optional_param('annotationid', null, PARAM_INT);
        $data->prevent = $this->optional_param('prevent', null, PARAM_TEXT);
        $this->set_data($data);
    }

    /**
     * Process dynamic submission
     *
     * @return \stdClass
     */
    public function process_dynamic_submission() {
        global $USER, $DB;
        $fromform = $this->get_data();
        $prevent = explode(',', $fromform->prevent);
        $usercontextid = \context_user::instance($USER->id)->id;
        $coursecontext = \context_course::instance($fromform->courseid);
        // Get the uploaded file and extract the content.
        $fs = get_file_storage();
        $files = $fs->get_area_files(
            $usercontextid,
            'user',
            'draft',
            $fromform->annotations,
            'id',
            false
        );

        $file = reset($files);
        if ($file) {
            // Unpack the file.
            $packer = get_file_packer('application/zip');
            $file->extract_to_storage(
                $packer,
                $fromform->contextid,
                'mod_interactivevideo',
                'unpacked',
                $fromform->id,
                '/'
            );
        }

        // Get the annotations.json file.
        $annotationfile = $fs->get_file(
            $fromform->contextid,
            'mod_interactivevideo',
            'unpacked',
            $fromform->id,
            '/',
            'annotations.json'
        );

        $cleaned = str_replace('&lt;', '<', $annotationfile->get_content());
        $cleaned = str_replace('&gt;', '>', $cleaned);
        $annotations = json_decode($cleaned);
        $newannotations = [];
        // Add each annotation to the database.
        foreach ($annotations as $annotation) {
            if (in_array($annotation->type, $prevent)) {
                // Skip this annotation.
                continue;
            }
            $newannotation = $annotation;
            $newannotation->id = null;
            $newannotation->contextid = $fromform->contextid;
            $newannotation->timecreated = time();
            $newannotation->timemodified = time();
            $newannotation->cmid = $fromform->id;
            $newannotation->annotationid = $fromform->annotationid;
            $newannotation->courseid = $fromform->courseid;
            $newannotation->id = $DB->insert_record('interactivevideo_items', $newannotation, true, true);

            // Now move the file to the correct location.
            $files = $annotation->files;
            if (empty($files)) {
                $newannotations[] = $newannotation;
                unset($newannotation->files);
                continue;
            }
            // Get the files for this annotation.
            foreach ($files as $file) {
                $uploadedfile = $fs->get_file(
                    $fromform->contextid,
                    'mod_interactivevideo',
                    'unpacked',
                    $fromform->id,
                    '/',
                    $file->formattedfilename
                );

                if ($uploadedfile) {
                    // Move the file to the correct location.
                    $fs->create_file_from_storedfile(
                        [
                            'contextid' => $fromform->contextid,
                            'component' => 'mod_interactivevideo',
                            'filearea' => 'content',
                            'itemid' => $newannotation->id,
                            'filepath' => '/',
                            'filename' => $file->filename,
                        ],
                        $uploadedfile
                    );
                } else {
                    $newannotation->nofile = true;
                }
            }

            // Handle contentbank items.
            if ($annotation->type == 'contentbank') {
                $contentbank = new contentbank();
                $contentbankfile = $fs->get_file(
                    $fromform->contextid,
                    'mod_interactivevideo',
                    'unpacked',
                    $fromform->id,
                    '/',
                    $file->formattedfilename
                );
                // Rename the file.

                if ($contentbankfile) {
                    $contentbankfile->rename($contentbankfile->get_filepath(), $file->filename);
                    $content = $contentbank->create_content_from_file($coursecontext, $USER->id, $contentbankfile);
                    if ($content) {
                        $newannotation->contentid = $content->get_id();
                        $DB->update_record('interactivevideo_items', $newannotation);
                    } else {
                        // Handle error.
                        throw new \moodle_exception('errorcreatingcontent', 'mod_interactivevideo');
                    }
                }
            }
            unset($newannotation->files);
            $newannotations[] = $newannotation;
        }
        $fs->delete_area_files($fromform->contextid, 'mod_interactivevideo', 'unpacked', $fromform->id);
        $fromform->new = $newannotations;
        $fromform->annotations = $annotations;

        return $fromform;
    }

    /**
     * Defines form elements
     */
    public function definition() {
        $mform = &$this->_form;

        $mform->addElement('hidden', 'contextid', null);
        $mform->setType('contextid', PARAM_INT);

        $mform->addElement('hidden', 'id', null);
        $mform->setType('id', PARAM_INT);

        $mform->addElement('hidden', 'courseid', null);
        $mform->setType('courseid', PARAM_INT);

        $mform->addElement('hidden', 'annotationid', null);
        $mform->setType('annotationid', PARAM_INT);

        $mform->addElement('hidden', 'prevent', null);
        $mform->setType('prevent', PARAM_TEXT);

        $mform->addElement('filemanager', 'annotations', '', '', $this->get_options());
        $mform->addRule('annotations', null, 'required');

        $this->set_display_vertical();
    }

    /**
     * Get filemanager options
     *
     * @return array
     */
    protected function get_options() {
        global $PAGE;
        $filemanageroptions = [
            'maxbytes'       => $PAGE->course->maxbytes,
            'subdirs'        => 0,
            'maxfiles'       => 1,
            'accepted_types' => ['.ivz'],
        ];
        return $filemanageroptions;
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
        return new \moodle_url('/mod/interactivevideo/interactions.php', [
            'id' => $this->optional_param('id', null, PARAM_INT),
        ]);
    }
}
