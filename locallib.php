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
 * Utility functions for interactivevideo module
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class interactivevideo_util {

    /**
     * Get all interactions in one interactive video module.
     *
     * @param int $interactivevideo
     * @param int $contextid
     * @param bool $hascompletion
     * @return array
     */
    public static function get_items($interactivevideo, $contextid, $hascompletion = false) {
        global $DB, $PAGE;
        $PAGE->set_context(context::instance_by_id($contextid));
        $cache = cache::make('mod_interactivevideo', 'iv_items_by_cmid');
        $items = $cache->get($interactivevideo);
        if (!$items) {
            $items = $DB->get_records('interactivevideo_items', ['annotationid' => $interactivevideo]);
            $cache->set($interactivevideo, $items);
        }
        if ($hascompletion) {
            $items = (array) $items;
            $items = array_filter($items, function ($item) {
                return $item->hascompletion == 1;
            });
        }
        foreach ($items as $key => $item) {
            $items[$key]->formattedtitle = format_string($items[$key]->title);
        }
        return $items;
    }

    /**
     * Get one interaction by id.
     *
     * @param int $id
     * @param int $contextid
     * @return stdClass
     */
    public static function get_item($id, $contextid) {
        global $DB, $PAGE;
        $PAGE->set_context(context::instance_by_id($contextid));
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        $record->formattedtitle = format_string($record->title);
        return $record;
    }

    /**
     * Copy an interaction.
     *
     * @param int $id
     * @param int $contextid
     * @param float $timestamp
     * @return stdClass
     */
    public static function copy_item($id, $contextid, $timestamp) {
        global $DB, $CFG;
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        if ($timestamp == $record->timestamp) {
            $record->timestamp = $record->timestamp + 0.01; // Make sure the timestamp isn't the same.
        } else {
            $record->timestamp = $timestamp; // Put the new item at the current timestamp.
        }
        $record->title = $record->title . ' (' . get_string('copynoun', 'mod_interactivevideo') . ')';
        $record->id = $DB->insert_record('interactivevideo_items', $record);
        // Handle related files "content" field.
        require_once($CFG->libdir . '/filelib.php');
        $fs = get_file_storage();
        $files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'content', $id, 'id ASC', false);
        foreach ($files as $file) {
            $filerecord = ['itemid' => $record->id];
            $fs->create_file_from_storedfile($filerecord, $file);
        }
        return self::get_item($record->id, $contextid);
    }

    /**
     * Format content.
     *
     * @param mixed $content
     * @param string $format
     * @param int $contextid
     * @return mixed
     */
    public static function format_content($content, $format, $contextid) {
        global $PAGE;
        $context = context::instance_by_id($contextid);
        $PAGE->set_context($context);
        return format_text($content, $format, ['noclean' => true, 'overflowdiv' => false, 'context' => $context]);
    }

    /**
     * Get progress data per user.
     *
     * @param int $interactivevideo
     * @param int $userid
     * @param bool $preview
     * @return stdClass
     */
    public static function get_progress($interactivevideo, $userid, $preview = false) {
        global $DB;
        if ($userid == 1 || $preview) {
            global $SESSION;
            $progress = isset($SESSION->ivprogress) ? $SESSION->ivprogress : null;
            if (!isset($progress)) {
                $SESSION->ivprogress = [];
            }
            if (isset($progress[$interactivevideo])) {
                return $progress[$interactivevideo];
            } else {
                $SESSION->ivprogress[$interactivevideo] = [
                    'cmid' => $interactivevideo,
                    'completeditems' => '',
                    'xp' => 0,
                    'completionid' => 0,
                    'completionpercentage' => 0,
                    'userid' => $userid,
                    'completiondetails' => '',
                ];
            }
            return $SESSION->ivprogress[$interactivevideo];
        }

        $record = $DB->get_record('interactivevideo_completion', ['cmid' => $interactivevideo, 'userid' => $userid]);
        if (!$record) {
            $record = new stdClass();
            $record->cmid = $interactivevideo;
            $record->userid = $userid;
            $record->timecreated = time();
            $record->timecompleted = 0;
            $record->completeditems = '[]';
            $record->completionpercentage = 0;
            $record->completiondetails = '[]';
            $record->id = $DB->insert_record('interactivevideo_completion', $record);
        }
        return $record;
    }


    /**
     * Save the progress of an interactive video for a user.
     *
     * @param int $interactivevideo The ID of the interactive video.
     * @param int $userid The ID of the user.
     * @param int $completeditems The number of completed items.
     * @param string $completiondetails JSON encoded string of completion details.
     * @param bool $markdone Whether to mark the item as done.
     * @param string $type The type of the interactive video.
     * @param string $details Additional details (optional).
     * @param int $completed Whether the interactive video is completed (optional, default is 0).
     * @param float $percentage The completion percentage (optional, default is 0).
     * @param float $grade The grade achieved (optional, default is 0).
     * @param int $gradeiteminstance The grade item instance (optional, default is 0).
     * @param int $xp The experience points earned (optional, default is 0).
     * @param bool $updatestate Whether to update the completion state (optional, default is true).
     * @param int $courseid The ID of the course (optional, default is 0).
     * @return stdClass The updated progress record.
     */
    public static function save_progress(
        $interactivevideo,
        $userid,
        $completeditems,
        $completiondetails,
        $markdone,
        $type,
        $details = '',
        $completed = 0,
        $percentage = 0,
        $grade = 0,
        $gradeiteminstance = 0,
        $xp = 0,
        $updatestate = true,
        $courseid = 0
    ) {
        global $DB, $CFG, $SESSION;
        // If guess user, save progress in the session; otherwise in the database.
        if ($userid == 1) {
            // First get the progress from the session.
            $progress = [
                'cmid' => $interactivevideo,
                'completeditems' => $completeditems,
                'completed' => $completed,
                'completionpercentage' => $percentage,
                'xp' => $xp,
                'userid' => $userid,
                'completionid' => 0,
            ];
            $currentprogress = $SESSION->ivprogress[$interactivevideo];
            if ($currentprogress) {
                $completion = json_decode($completiondetails);
                $cdetails = $currentprogress['completiondetails'];
                $cdetails = json_decode($cdetails);
                // Remove the detail item with the same id.
                $cdetails = array_filter($cdetails, function ($item) use ($completion) {
                    $item = json_decode($item);
                    return $item->id != $completion->id;
                });
                if ($markdone) {
                    $cdetails[] = $completiondetails;
                }
                $progress['completiondetails'] = json_encode($cdetails);
            }
            $SESSION->ivprogress[$interactivevideo] = $progress;
            return $SESSION->ivprogress[$interactivevideo];
        }
        $record = $DB->get_record('interactivevideo_completion', ['cmid' => $interactivevideo, 'userid' => $userid]);
        $record->completeditems = $completeditems;
        $record->timecompleted = $completed ? time() : 0;
        $record->completionpercentage = round($percentage);
        $record->xp = $xp;
        $completion = json_decode($completiondetails);
        $cdetails = json_decode($record->completiondetails);
        // Remove the detail item with the same id.
        $cdetails = array_filter($cdetails, function ($item) use ($completion) {
            $item = json_decode($item);
            return $item->id != $completion->id;
        });
        if ($markdone) {
            $cdetails[] = $completiondetails;
        }
        $cdetails = array_values($cdetails);
        $record->completiondetails = json_encode($cdetails);
        $DB->update_record('interactivevideo_completion', $record);

        // Add/delete details to interactivevideo_log table.
        if (!$markdone) {
            $DB->delete_records_select('interactivevideo_log', "annotationid = :annotationid AND userid = :userid", [
                'annotationid' => $completion->id,
                'userid' => $userid,
            ]);
        } else {
            if ($completion->hasDetails) {
                $log = new stdClass();
                $log->userid = $userid;
                $log->cmid = $interactivevideo;
                $log->char1 = $type;
                $log->annotationid = $completion->id;
                $log->timecreated = time();
                $log->text1 = $details;
                $log->timemodified = time();
                $log->completionid = $record->id;  // Store the completion id.
                $DB->insert_record('interactivevideo_log', $log);
            }
        }

        // Update grade.
        if ($grade > 0) {
            require_once($CFG->libdir . '/gradelib.php');
            $gradeitem = new stdClass();
            $gradeitem->userid = $userid;
            $gradeitem->rawgrade = $grade;

            grade_update('mod/interactivevideo', $courseid, 'mod', 'interactivevideo', $gradeiteminstance, 0, $gradeitem);

            $record->grade = $grade;
            $record->gradeiteminstance = $gradeiteminstance;
            $record->gradeitem = $gradeitem;
        }

        // Update completion state.
        if ($updatestate) {
            $cm = get_coursemodule_from_instance('interactivevideo', $interactivevideo);
            if ($cm->completion > 1) {
                require_once($CFG->libdir . '/completionlib.php');
                $course = new stdClass();
                $course->id = $courseid;
                $completion = new completion_info($course);
                $completion->update_state($cm);
                $record->overallcomplete = $completion->internal_get_state($cm, $userid, null);
            }
        }

        return $record;
    }

    /**
     * Get completion data by group for report.
     *
     * @param int $interactivevideo
     * @param int $group
     * @param int $contextid
     * @param int $courseid
     * @return array
     */
    public static function get_report_data_by_group($interactivevideo, $group, $contextid, $courseid = 0) {
        global $DB, $OUTPUT, $PAGE, $CFG;
        require_once($CFG->dirroot . '/user/profile/lib.php');
        require_once($CFG->dirroot . '/user/lib.php');
        $context = context::instance_by_id($contextid);
        $PAGE->set_context($context);
        // Get fields for userpicture.
        $fields = \core_user\fields::get_picture_fields();
        $identityfields = get_config('mod_interactivevideo', 'reportfields');
        if (!empty($identityfields)) {
            $fields = array_merge($fields, explode(',', $identityfields));
        }
        $customfields = array_filter($fields, function ($field) {
            return strpos($field, 'profile_field_') !== false;
        });
        $corefields = array_filter($fields, function ($field) {
            return strpos($field, 'profile_field_') === false;
        });
        $dbfields = 'u.' . implode(', u.', $corefields);
        // Graded roles.
        $roles = get_config('core', 'gradebookroles');
        if (empty($roles)) {
            return [];
        }
        list($inparams, $inparamsvalues) = $DB->get_in_or_equal(explode(',', $roles));
        if ($group == 0) {
            // Get all enrolled users (student only).
            $sql = "SELECT " . $dbfields . ", ac.timecompleted, ac.timecreated,
             ac.completionpercentage, ac.completeditems, ac.xp, ac.completiondetails, ac.id as completionid
                    FROM {user} u
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = ?
                    WHERE u.id IN (SELECT userid FROM {role_assignments} WHERE contextid = ? AND roleid $inparams)
                    ORDER BY u.lastname, u.firstname";
            $params = array_merge([$interactivevideo, $contextid], $inparamsvalues);
            $records = $DB->get_records_sql($sql, $params);
        } else {
            // Get users in group (student only).
            $sql = "SELECT " . $dbfields . ", ac.timecompleted, ac.timecreated,
             ac.completionpercentage, ac.completeditems, ac.xp, ac.completiondetails, ac.id as completionid
                    FROM {user} u
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = ?
                    WHERE u.id IN (SELECT userid FROM {groups_members} WHERE groupid = ?)
                    AND u.id IN (SELECT userid FROM {role_assignments} WHERE contextid = ? AND roleid $inparams)
                    ORDER BY u.lastname, u.firstname";
            $params = array_merge([$interactivevideo, $group, $contextid], $inparamsvalues);
            $records = $DB->get_records_sql($sql, $params);
        }

        // Render the photo of the user.
        foreach ($records as $record) {
            $userpic = new user_picture($record);
            $userpic->size = 24;
            $userpic->link = false;
            $userpic->includefullname = true;
            $record->pictureonly = $OUTPUT->render($userpic);
            $userpic->size = 35;
            $userpic->courseid = $courseid;
            $userpic->link = true;
            $userpic->popup = true;
            $record->picture = $OUTPUT->render($userpic);
            $record->fullname = fullname($record);

            // Handle custom fields.
            if (!empty($customfields)) {
                foreach ($customfields as $field) {
                    $record->{$field} = '';
                }
                $profile = user_get_user_details($record, null, ['customfields']);
                $customfieldarray = (array)$profile['customfields'];
                foreach ($customfieldarray as $key => $value) {
                    $field = (object)$value;
                    // We don't want to attach the fields that isn't in the list.
                    if (in_array('profile_field_' . $field->shortname, $customfields)) {
                        $record->{'profile_field_' . $field->shortname} = $field->displayvalue;
                        unset($customfieldarray[$key]['displayvalue']);
                        unset($customfieldarray[$key]['name']);
                    } else {
                        // Remove the field from $customfieldarray.
                        unset($customfieldarray[$key]);
                    }
                }
                $record->customfields = $customfieldarray;
            }
        }
        return $records;
    }

    /**
     * Get all activity types.
     *
     * @return array
     */
    public static function get_all_activitytypes() {
        $subplugins = get_config('mod_interactivevideo', 'enablecontenttypes');
        $subplugins = explode(',', $subplugins);
        $subplugins = array_map(function ($subplugin) {
            return [
                'name' => $subplugin,
                'custom' => strpos($subplugin, 'ivplugin_') === false,
                'class' => $subplugin . '\\main',
            ];
        }, $subplugins);

        $contentoptions = [];

        foreach ($subplugins as $subplugin) {
            $class = $subplugin['class'];

            if (!class_exists($class)) {
                continue;
            }

            $contenttype = new $class();
            if ($contenttype && $contenttype->can_used() && $contenttype->get_property()) {
                $properties = $contenttype->get_property();
                if (
                    !isset($properties['name']) || !isset($properties['class'])
                    || !isset($properties['amdmodule']) || !isset($properties['form'])
                ) {
                    continue;
                }
                if (!isset($properties['hascompletion'])) {
                    $properties['hascompletion'] = false;
                }
                if (!isset($properties['hastimestamp'])) {
                    $properties['hastimestamp'] = true;
                }
                if (!isset($properties['allowmultiple'])) {
                    $properties['allowmultiple'] = true;
                }
                if (!isset($properties['icon'])) {
                    $properties['icon'] = 'bi bi-cursor';
                }
                if (!isset($properties['title'])) {
                    $properties['title'] = get_string('unknowncontenttype', 'mod_interactivevideo');
                }
                if (!isset($properties['description'])) {
                    $properties['description'] = '';
                }
                if (!isset($properties['stringcomponent'])) {
                    $properties['stringcomponent'] = $subplugin['name'];
                }
                if (!isset($properties['initonreport'])) {
                    $properties['initonreport'] = false;
                }
                $contentoptions[] = $properties;
            }
        }

        // Make sure contentTypes do not have the same name key.
        $contentoptions = array_values(array_column($contentoptions, null, 'name'));
        return $contentoptions;
    }

    /**
     * Quick edit field.
     *
     * @param int $id
     * @param string $field
     * @param string $value
     * @param int $contextid
     * @param int $olddraftitemid
     * @return stdClass
     */
    public static function quick_edit_field($id, $field, $value, $contextid, $olddraftitemid = 0) {
        global $DB, $PAGE, $CFG;
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        if ($field == 'content') { // Inline annnotation contenttype.
            require_once($CFG->libdir . '/filelib.php');
            // Delete the old files before saving the new files.
            $fs = get_file_storage();
            $fs->delete_area_files($context->id, 'mod_interactivevideo', 'content', $id);
            $draftitemid = file_get_submitted_draft_itemid('content');
            $postvalue = file_save_draft_area_files(
                $draftitemid,
                $contextid,
                'mod_interactivevideo',
                'content',
                $id,
                [
                    'maxfiles' => -1,
                    'maxbytes' => 0,
                    'trusttext' => true,
                    'noclean' => true, // Don't clean the text, keep it as it is.
                    'context' => $context,
                ],
                $value
            );

            // Remove orphaned files.
            self::file_remove_editor_orphaned_files($draftitemid, $value);
            self::file_remove_editor_orphaned_files($olddraftitemid, $value);
            $value = $postvalue;
        }
        $DB->set_field('interactivevideo_items', $field, $value, ['id' => $id]);
        $record = $DB->get_record('interactivevideo_items', ['id' => $id]);
        $record->formattedtitle = format_string($record->title);
        return $record;
    }

    /**
     * Remove orphaned files.
     *
     * @param int $draftid
     * @param string $text
     * @return void
     */
    public static function file_remove_editor_orphaned_files($draftid, $text) {
        global $CFG, $USER;
        // Find those draft files included in the text, and generate their hashes.
        $context = context_user::instance($USER->id);
        $baseurl = $CFG->wwwroot . '/draftfile.php/' . $context->id . '/user/draft/' . $draftid . '/';
        $pattern = "/" . preg_quote($baseurl, '/') . "(.+?)[\?\"'<>\s:\\\\]/";
        preg_match_all($pattern, $text, $matches);
        $usedfilehashes = [];
        foreach ($matches[1] as $matchedfilename) {
            $matchedfilename = urldecode($matchedfilename);
            $usedfilehashes[] = \file_storage::get_pathname_hash(
                $context->id,
                'user',
                'draft',
                $draftid,
                '/',
                $matchedfilename
            );
        }

        // Now, compare the hashes of all draft files, and remove those which don't match used files.
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'user', 'draft', $draftid, 'id', false);
        foreach ($files as $file) {
            $tmphash = $file->get_pathnamehash();
            if (!in_array($tmphash, $usedfilehashes)) {
                $file->delete();
            }
        }
    }

    /**
     * Save log.
     *
     * @param int $interactionid
     * @param int $courseid
     * @param int $userid
     * @param int $activityid
     * @param string $log
     * @return int
     */
    public static function save_log($interactionid, $courseid, $userid, $activityid, $log) {
        global $DB, $USER;
        $record = new stdClass();
        $record->interactionid = $interactionid;
        $record->courseid = $courseid;
        $record->userid = $userid ?? $USER->id;
        $record->cmid = $activityid;
        $record->text1 = $log;
        $record->timecreated = time();
        $id = $DB->insert_record('interactivevideo_log', $record);
        return $id;
    }

    /**
     * Encodes the given text.
     *
     * This function takes a string of text and applies encoding to it.
     *
     * @param string $text The text to be encoded.
     * @return string The encoded text.
     */
    public static function encode_text($text) {
        $search = '/@@ANNOID#([0-9]+)/';
        $text = preg_replace_callback($search, function ($matches) {
            return $matches[1];
        }, $text);

        $search = '/@@INSTANCEID#([0-9]+)/';
        $text = preg_replace_callback($search, function ($matches) {
            return $matches[1];
        }, $text);

        $search = '/@@CMID#([0-9]+)/';
        $text = preg_replace_callback($search, function ($matches) {
            return $matches[1];
        }, $text);

        $search = '/@@COURSEID#([0-9]+)/';
        $text = preg_replace_callback($search, function ($matches) {
            return $matches[1];
        }, $text);

        return $text;
    }

    /**
     * Processes the given text within a specific context.
     *
     * @param string $text The text to be processed.
     * @param int $contextid The ID of the context in which the text is being processed.
     * @param string $field The field associated with the text.
     * @param int $id The ID related to the text processing.
     *
     * @return string The processed text.
     */
    public static function process_text($text, $contextid, $field, $id) {
        if (!$text) {
            return $text;
        }
        $text = file_rewrite_pluginfile_urls(
            str_replace('\\/', '/', $text),
            'pluginfile.php',
            $contextid,
            'mod_interactivevideo',
            $field,
            $id
        );
        $text = self::encode_text($text);
        return $text;
    }

    /**
     * Get log.
     *
     * @param int $userid
     * @param int $cmid
     * @param int $annotationid
     * @param int $contextid
     * @return stdClass
     */
    public static function get_log($userid, $cmid, $annotationid, $contextid) {
        global $DB, $CFG;
        require_once($CFG->libdir . '/filelib.php');

        $record = $DB->get_record('interactivevideo_log', ['userid' => $userid, 'cmid' => $cmid, 'annotationid' => $annotationid]);
        if ($record) {
            $record->text1 = self::process_text($record->text1, $contextid, 'text1', $record->id);
            $record->text2 = self::process_text($record->text2, $contextid, 'text2', $record->id);
            $record->text3 = self::process_text($record->text3, $contextid, 'text3', $record->id);
        }
        return $record;
    }

    /**
     * Get logs by userids.
     *
     * @param array $userids
     * @param int $annotationid
     * @param int $contextid
     * @param string $type
     * @param int $cmid
     * @return array
     */
    public static function get_logs_by_userids($userids, $annotationid, $contextid, $type, $cmid) {
        global $DB, $CFG;
        require_once($CFG->libdir . '/filelib.php');
        $inparams = $DB->get_in_or_equal($userids)[1];
        $inparams = implode(',', $inparams);
        $where = '';
        if ($annotationid != 0) {
            $where = "annotationid = ? ";
        }
        if ($type) {
            $where .= "char1 = ? AND cmid = ?";
        }
        $sql = "SELECT * FROM {interactivevideo_log} WHERE {$where} AND userid IN ($inparams) ORDER BY
        timecreated DESC";
        $params = [];
        if ($annotationid != 0) {
            $params[] = $annotationid;
        }
        if ($type) {
            $params[] = $type;
            $params[] = $cmid;
        }
        $records = $DB->get_records_sql($sql, $params);
        foreach ($records as $record) {
            $record->formattedtimecreated = userdate($record->timecreated, get_string('strftimedatetime'));
            $record->formattedtimemodified = userdate($record->timemodified, get_string('strftimedatetime'));
            $record->text1 = self::process_text($record->text1, $contextid, 'text1', $record->id);
            $record->text2 = self::process_text($record->text2, $contextid, 'text2', $record->id);
            $record->text3 = self::process_text($record->text3, $contextid, 'text3', $record->id);
        }
        return array_values($records);
    }

    /**
     * Get taught courses
     * @param int $userid
     */
    public static function get_taught_courses($userid) {
        global $DB, $PAGE, $USER;
        if (!$userid) {
            $userid = $USER->id;
        }
        $PAGE->set_context(\context_system::instance());
        // Get all courses where the user is a teacher.
        $sql = "SELECT c.id, c.fullname, c.shortname FROM {course} c
                JOIN {context} ctx ON c.id = ctx.instanceid AND ctx.contextlevel = 50
                JOIN {role_assignments} ra ON ra.contextid = ctx.id
                JOIN {role} r ON ra.roleid = r.id
                WHERE ra.userid = :userid AND r.shortname = 'editingteacher'";
        if (is_siteadmin($userid)) {
            $sql = "SELECT c.id, c.fullname, c.shortname FROM {course} c WHERE c.id > 1 ORDER BY c.fullname ASC";
        }
        $courses = $DB->get_records_sql($sql, ['userid' => $userid]);
        if (!$courses) {
            return [];
        }
        // Format string on fullname.
        $courses = array_map(function ($course) {
            $course->fullname = format_string($course->fullname);
            return $course;
        }, $courses);

        return array_values($courses);
    }

    /**
     * Retrieves the course module by course ID.
     *
     * @param int $courseid The ID of the course.
     * @return array The course modules.
     */
    public static function get_cm_by_courseid($courseid) {
        global $DB, $PAGE;
        $PAGE->set_context(context_system::instance());
        $cms = get_fast_modinfo($courseid);
        $cms = $cms->get_cms();
        // Filter out the interactivevideo modules.
        $cms = array_filter($cms, function ($cm) {
            return $cm->modname == 'interactivevideo';
        });
        if (!$cms) {
            return [];
        }
        $cms = array_map(function ($cm) {
            $newcm = new stdClass();
            $newcm->name = format_string($cm->get_name());
            $newcm->id = $cm->instance;
            return $newcm;
        }, $cms);
        // Sort the array by name.
        usort($cms, function ($a, $b) {
            return strcmp($a->name, $b->name);
        });
        return $cms;
    }

    /**
     * Get annotations by course
     * @param int $courseid
     */
    public static function get_annotations_by_course($courseid) {
        global $DB;
        $sql = "SELECT * FROM {interactivevideo_items} WHERE courseid = :courseid";
        return $DB->get_records_sql($sql, ['courseid' => $courseid]);
    }

    /**
     * Import annotations
     * @param int $fromcourse
     * @param int $tocourse
     * @param int $module
     * @param int $fromcm
     * @param int $tocm
     * @param array $annotations
     * @param int $contextid
     */
    public static function import_annotations($fromcourse, $tocourse, $module, $fromcm, $tocm, $annotations, $contextid) {
        global $DB, $PAGE;
        // Get the old context from cmid field.
        $annotation = (object) $annotations[0];
        $oldcontextid = $annotation->contextid;
        $PAGE->set_context(context::instance_by_id($contextid));
        $copied = [];
        foreach ($annotations as $annotation) {
            $annotation = (object) $annotation;
            $annotation->courseid = $tocourse;
            $annotation->annotationid = $tocm;
            $annotation->cmid = $module;
            $annotation->oldid = $annotation->id;
            $annotation->id = null;
            $annotation->timecreated = time();
            $annotation->timemodified = time();
            $annotation->contextid = $contextid;
            $annotation->id = $DB->insert_record('interactivevideo_items', $annotation);
            $prop = json_decode($annotation->prop);
            $class = $prop->class;
            if (class_exists($class)) {
                $contenttype = new $class($annotation);
                $annotation = $contenttype->copy($fromcourse, $tocourse, $fromcm, $tocm, $annotation, $oldcontextid);
            }
            $annotation->formattedtitle = format_string($annotation->title);
            $copied[] = $annotation;
        }
        return $copied;
    }


    /**
     * Get completion information for a course module.
     *
     * @param int $cmid The course module ID.
     * @param int $userid The user ID.
     * @param int $courseid The course ID.
     * @param int $contextid The context ID.
     * @return array The completion information.
     */
    public static function get_cm_completion($cmid, $userid, $courseid, $contextid) {
        global $OUTPUT, $CFG, $PAGE, $USER;
        if (!$userid || $userid == 0) {
            $userid = $USER->id;
        }
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        // Get completion information.
        $completion = '';
        $cminfo = get_fast_modinfo($courseid);
        $cm = $cminfo->get_cm($cmid);
        $completiondetails = \core_completion\cm_completion_details::get_instance($cm, $userid);
        $response = [
            'overallcompletion' => $completiondetails->get_overall_completion() == COMPLETION_COMPLETE ? 1 : 0,
        ];

        // If moodle version is 4.4 or below, use new completion information.
        if ($CFG->branch < 404) {
            $completion = $OUTPUT->activity_information($cm, $completiondetails, []);
            $response['completion'] = $completion;
        } else {
            $activitycompletion = new \core_course\output\activity_completion($cm, $completiondetails);
            $output = $PAGE->get_renderer('core');
            $activitycompletiondata = (array) $activitycompletion->export_for_template($output);
            if ($activitycompletiondata["hascompletion"]) {
                $completion = $OUTPUT->render_from_template('core_course/activity_info', $activitycompletiondata);
                $response['completion'] = $completion;
            }
        }
        return $response;
    }

    /**
     * Delete progress by ID.
     *
     * @param int $contextid The context ID.
     * @param int $recordid The record ID.
     * @param int $courseid The course ID.
     * @param int $cmid The course module ID.
     * @return string The result of the deletion.
     */
    public static function delete_progress_by_id($contextid, $recordid, $courseid, $cmid) {
        global $DB, $CFG;
        // Delete completion record.
        $DB->delete_records('interactivevideo_completion', ['id' => $recordid]);
        // Delete logs.
        $logs = $DB->get_records('interactivevideo_log', ['completionid' => $recordid], 'id', 'id, userid');
        // Delete associated files.
        if ($logs) {
            $fs = get_file_storage();
            foreach ($logs as $log) {
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'attachments', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text1', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text2', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text3', $log->id);
            }
            $DB->delete_records('interactivevideo_log', ['completionid' => $recordid]);
        }

        $userids = array_column($logs, 'userid');
        $userids = array_unique($userids);
        $userids = array_values($userids);

        // Update completion state.
        $cm = get_coursemodule_from_instance('interactivevideo', $cmid);
        require_once($CFG->libdir . '/completionlib.php');
        if ($cm->completion == COMPLETION_TRACKING_AUTOMATIC) {
            $course = new stdClass();
            $course->id = $courseid;
            $completion = new completion_info($course);
            foreach ($userids as $userid) {
                $completion->update_state($cm, null, $userid);
            }
        }

        return 'deleted';
    }

    /**
     * Delete progress by IDs.
     *
     * @param int $contextid The context ID.
     * @param array $recordids The record IDs.
     * @param int $courseid The course ID.
     * @param int $cmid The course module ID.
     * @return string The result of the deletion.
     */
    public static function delete_progress_by_ids($contextid, $recordids, $courseid, $cmid) {
        global $DB, $CFG;
        // Delete completion record.
        $DB->delete_records_list('interactivevideo_completion', 'id', $recordids);
        // Delete logs.
        $logs = $DB->get_records_list('interactivevideo_log', 'completionid', $recordids, 'id', 'id, userid');
        // Delete associated files.
        if ($logs) {
            $fs = get_file_storage();
            foreach ($logs as $log) {
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'attachments', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text1', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text2', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text3', $log->id);
            }
            $DB->delete_records_list('interactivevideo_log', 'completionid', $recordids);
        }

        // Update completion state.
        $cm = get_coursemodule_from_instance('interactivevideo', $cmid);
        require_once($CFG->libdir . '/completionlib.php');
        if ($cm->completion == COMPLETION_TRACKING_AUTOMATIC) {
            $course = new stdClass();
            $course->id = $courseid;
            $completion = new completion_info($course);
            $userids = array_column($logs, 'userid');
            $userids = array_unique($userids);
            $userids = array_values($userids);
            foreach ($userids as $userid) {
                $completion->update_state($cm, null, $userid);
            }
        }

        return 'deleted';
    }

    /**
     * Save iv items in cache.
     *
     * @param int $cmid
     * @return array The items.
     */
    public static function update_ivitems_cache($cmid) {
        global $DB;
        $items = $DB->get_records('interactivevideo_items', ['annotationid' => $cmid]);
        $cache = cache::make('mod_interactivevideo', 'iv_items_by_cmid');
        $cache->set($cmid, $items);
        return $items;
    }
}
