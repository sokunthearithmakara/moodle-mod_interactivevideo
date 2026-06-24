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

use core_contentbank\contentbank;

/**
 * Class main
 *
 * @package    ivplugin_contentbank
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class main extends \ivplugin_richtext\main {
    /**
     * Get the property.
     */
    public function get_property() {
        return [
            'name' => 'contentbank',
            'title' => get_string('contentbankcontent', 'ivplugin_contentbank'),
            'icon' => 'bi bi-archive',
            'amdmodule' => 'ivplugin_contentbank/main',
            'class' => 'ivplugin_contentbank\\main',
            'form' => 'ivplugin_contentbank\\form',
            'hascompletion' => true,
            'hastimestamp' => true,
            'hasreport' => true,
            'description' => get_string('contentbankdescription', 'ivplugin_contentbank'),
            'author' => 'tsmakara',
            'tutorial' => get_string('tutorialurl', 'ivplugin_contentbank'),
            'preloadstrings' => false,
            'flexbook' => true,
            'fbdescription' => get_string('contentbankdescription', 'ivplugin_contentbank'),
            'fbamdmodule' => 'ivplugin_contentbank/fbmain',
            'fbform' => 'ivplugin_contentbank\\fbform',
            'component' => 'ivplugin_contentbank',
            'dndextensions' => ['h5p'],
        ];
    }

    /**
     * Flexbook DND / programmatic creation fields merged from flexbook_defaults.
     *
     * @return string[]
     */
    public function get_dnd_default_fields(): array {
        return array_merge(parent::get_dnd_default_fields(), ['char1']);
    }

    /**
     * Whether the course has saved defaults for contentbank interactions.
     *
     * @param int $courseid
     * @return bool
     */
    protected function has_course_defaults(int $courseid): bool {
        global $DB;
        if ($courseid <= 0 || !$DB->get_manager()->table_exists('flexbook_defaults')) {
            return false;
        }
        return $DB->record_exists('flexbook_defaults', [
            'courseid' => $courseid,
            'type' => 'contentbank',
        ]);
    }

    /**
     * Apply completion and advanced defaults after DND merge.
     *
     * @param \stdClass $data
     * @return void
     */
    protected function apply_creation_defaults(\stdClass $data): void {
        $courseid = (int) ($data->courseid ?? 0);
        if (!$this->has_course_defaults($courseid)) {
            $data->completiontracking = 'complete';
            $data->hascompletion = 1;
        } else if (
            !empty($data->completiontracking)
            && $data->completiontracking !== 'none'
            && empty($data->hascompletion)
        ) {
            $data->hascompletion = 1;
        }

        if (empty($data->advanced)) {
            $advanced = $this->flexbook_advanced();
            $advanced['savecurrentstate'] = 0;
            $data->advanced = json_encode($advanced);
            return;
        }

        $advanced = json_decode($data->advanced, true);
        if (!is_array($advanced)) {
            $advanced = $this->flexbook_advanced();
        }
        if (!array_key_exists('savecurrentstate', $advanced)) {
            $advanced['savecurrentstate'] = 0;
        }
        $data->advanced = json_encode($advanced);
    }

    /**
     * Get the content.
     * @param array $arg
     * @return string
     */
    public function get_content($arg) {
        $id = $arg["contentid"];
        $contextid = $arg["contextid"];
        return '<div class="h5p-player-wrapper p-3 w-100 h-100 overflow-visible">'
            . $this->get_contentbank_content($id, $contextid) . '</div>';
    }

    /**
     * Get content from content bank item.
     *
     * @param int $id
     * @param int $contextid
     * @return string
     */
    public static function get_contentbank_content($id, $contextid) {
        global $PAGE;
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        $cb = new contentbank();
        $content = $cb->get_content_from_id($id);
        $type = $content->get_content_type_instance();
        $contenthtml = $type->get_view_content($content);
        // Replace &component with the current component.
        $contenthtml = str_replace('component', 'component=mod_interactivevideo', $contenthtml);
        return $contenthtml;
    }

    /**
     * Get all contents from contentbank.
     *
     * @param int $contextid
     * @return array
     */
    public static function get_contentbank_contents($contextid) {
        global $PAGE;
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        $cb = new contentbank();
        $foldercontents = $cb->search_contents('', $contextid);
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

        return $contents;
    }

    /**
     * Copies interactive video data from one course module to another.
     *
     * @param int $fromcourse The ID of the source course.
     * @param int $tocourse The ID of the destination course.
     * @param int $fromcm The ID of the source course module.
     * @param int $tocm The ID of the destination course module.
     * @param mixed $annotation Additional annotation or metadata for the copy process.
     * @param int $oldcontextid The ID of the old context.
     * @return mixed
     */
    public function copy($fromcourse, $tocourse, $fromcm, $tocm, $annotation, $oldcontextid) {
        global $DB;
        $newcoursecontext = \context_course::instance($tocourse);
        $annotation = parent::copy($fromcourse, $tocourse, $fromcm, $tocm, $annotation, $oldcontextid);
        if ($fromcourse == $tocourse) {
            return $annotation;
        }
        // Copy content bank item to the destination course using contentid from annotation.
        try {
            $record = $DB->get_record('contentbank_content', ['id' => $annotation->contentid], '*', MUST_EXIST);
            $cb = new contentbank();
            $content = $cb->get_content_from_id($record->id);
            $contenttype = $content->get_content_type_instance();
            $context = \context::instance_by_id($record->contextid, MUST_EXIST);
            // Check capability.
            if ($contenttype->can_copy($content)) {
                // This content can be copied.
                $crecord = $content->get_content();
                unset($crecord->id);
                $crecord->contextid = $newcoursecontext->id; // Change the context to the destination course.

                if ($content = $contenttype->create_content($crecord)) {
                    $handler = \core_contentbank\customfield\content_handler::create();
                    $handler->instance_form_before_set_data($record);
                    $record->id = $content->get_id();
                    $handler->instance_form_save($record);

                    $fs = get_file_storage();
                    $files = $fs->get_area_files($context->id, 'contentbank', 'public', $annotation->contentid, 'itemid, filepath,
                        filename', false);
                    if (!empty($files)) {
                        $file = reset($files);
                        $content->import_file($file);
                    }
                    $id = $content->get_id();
                    $annotation->contentid = $id;

                    // Update the annotation with the new contentid.
                    $DB->update_record('interactivevideo_items', $annotation);

                    // Change the context of the content.
                    $content->set_contextid($newcoursecontext->id);
                } else {
                    $warnings[] = [
                        'item' => $annotation->contentid,
                        'warningcode' => 'contentnotcopied',
                        'message' => get_string('contentnotcopied', 'core_contentbank'),
                    ];
                }
            } else {
                // The user has no permission to manage this content.
                $warnings[] = [
                    'item' => $annotation->contentid,
                    'warningcode' => 'nopermissiontomanage',
                    'message' => get_string('nopermissiontocopy', 'core_contentbank'),
                ];
            }
        } catch (\moodle_exception $e) {
            // The content or the context don't exist.
            $warnings[] = [
                'item' => $annotation->contentid,
                'warningcode' => 'exception',
                'message' => $e->getMessage(),
            ];
        }
        return $annotation;
    }

    /**
     * Create a new interaction instance.
     *
     * @param array $data The data for the new instance.
     * @return \stdClass The newly created interaction record.
     */
    public function create_instance($data) {
        global $DB, $USER;
        $draftitemid = isset($data['draftitemid']) ? (int) $data['draftitemid'] : 0;
        unset($data['draftitemid']);

        if ($draftitemid > 0) {
            $fs = get_file_storage();
            $usercontext = \context_user::instance($USER->id);
            $files = $fs->get_area_files($usercontext->id, 'user', 'draft', $draftitemid, 'itemid, filepath, filename', false);
            if (!empty($files)) {
                $file = reset($files);
                $coursecontext = \context_course::instance($data['courseid']);

                // Import file to content bank.
                $cb = new contentbank();
                $content = $cb->create_content_from_file($coursecontext, $USER->id, $file);
                if ($content) {
                    $contentid = $content->get_id();
                    $data['contentid'] = $contentid;
                    $data['content'] = json_encode(['contentid' => $contentid]);
                }
            }
        }

        $data = (object) $data;

        $this->apply_creation_defaults($data);

        // Final check: if contentid is missing or doesn't correspond to a valid contentbank record, throw an error.
        if (empty($data->contentid) || !$DB->record_exists('contentbank_content', ['id' => $data->contentid])) {
            throw new \moodle_exception('invalidcontentid', 'ivplugin_contentbank');
        }

        // Detect if we are in mod_flexbook or mod_interactivevideo.
        $table = 'flexbook_items';
        if (!$DB->get_manager()->table_exists($table)) {
            $table = 'interactivevideo_items';
        }

        $data->id = $DB->insert_record($table, $data);

        if ($table === 'flexbook_items') {
            return \mod_flexbook\util::get_item($data->id, $data->contextid);
        } else {
            return \interactivevideo_util::get_item($data->id, $data->contextid);
        }
    }
}
