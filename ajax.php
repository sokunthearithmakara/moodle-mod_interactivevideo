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
 * AJAX script for interactivevideo module
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);
require_once('../../config.php');
require_once('locallib.php');

$action = required_param('action', PARAM_TEXT);
$token = optional_param('token', '', PARAM_TEXT);
$cmid = optional_param('cmid', 0, PARAM_INT);
$contextid = required_param('contextid', PARAM_INT);
$context = context::instance_by_id($contextid);

require_sesskey();
require_login();

switch ($action) {
    case 'get_all_contenttypes':
        echo json_encode(interactivevideo_util::get_all_activitytypes());
        break;
    case 'format_text':
        $text = required_param('text', PARAM_RAW);
        echo interactivevideo_util::format_content($text, 1, $contextid);
        break;
    case 'get_from_url':
        $url = required_param('url', PARAM_URL);
        // Send get request to the URL.
        $response = file_get_contents($url);
        if (!$response) {
            require_once($CFG->libdir . '/filelib.php');
            $curl = new curl(['ignoresecurity' => true]);
            $curl->setHeader('Content-Type: application/json');
            $response = $curl->get($url);
        }
        echo $response;
        break;
    case 'update_videotime':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $start = required_param('start', PARAM_FLOAT);
        $end = required_param('end', PARAM_FLOAT);
        $DB->set_field('interactivevideo', 'starttime', $start, ['id' => $id]);
        $DB->set_field('interactivevideo', 'endtime', $end, ['id' => $id]);
        $courseid = required_param('courseid', PARAM_INT);
        $cmid = required_param('cmid', PARAM_INT);
        // Purge the course module cache after update action.
        \course_modinfo::purge_course_module_cache($courseid, $cmid);
        echo json_encode(['id' => $id, 'start' => $start, 'end' => $end]);
        break;
    case 'get_items':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $annotations = interactivevideo_util::get_items($id, $contextid);
        $annotations = array_values($annotations);
        echo json_encode($annotations);
        break;
    case 'get_item':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $item = interactivevideo_util::get_item($id, $contextid);
        echo json_encode($item);
        break;
    case 'copy_item':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $timestamp = required_param('timestamp', PARAM_FLOAT);
        $item = interactivevideo_util::copy_item($id, $contextid, $timestamp);
        echo json_encode($item);
        break;
    case 'get_content':
        require_capability('mod/interactivevideo:view', $context);
        $content = required_param('content', PARAM_RAW);
        $id = required_param('id', PARAM_INT);
        $format = FORMAT_HTML;
        // Process the content from editor for displaying.
        require_once($CFG->libdir . '/filelib.php');
        $content = file_rewrite_pluginfile_urls($content, 'pluginfile.php', $contextid, 'mod_interactivevideo', 'content', $id);
        $content = interactivevideo_util::format_content($content, $format, $contextid);
        echo $content;
        break;
    case 'delete_item':
        require_capability('mod/interactivevideo:edit', $context);
        $id = required_param('id', PARAM_INT);
        $DB->delete_records('interactivevideo_items', ['id' => $id]);
        $logs = $DB->get_records('interactivevideo_log', ['annotationid' => $id]);
        $fs = get_file_storage();
        // Delete files.
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'content', $id);
        // Delete logs files & logs.
        if ($logs) {
            foreach ($logs as $log) {
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'attachments', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text1', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text2', $log->id);
                $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text3', $log->id);
            }
            $DB->delete_records('interactivevideo_log', ['annotationid' => $id]);
        }
        $cache = cache::make('mod_interactivevideo', 'iv_items_by_cmid');
        $cache->delete($cmid);
        echo $id;
        break;
    case 'get_progress':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $userid = required_param('uid', PARAM_INT);
        $previewmode = required_param('previewmode', PARAM_BOOL);
        $progress = interactivevideo_util::get_progress($id, $userid, $previewmode);
        echo json_encode($progress);
        break;
    case 'save_progress':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $userid = required_param('uid', PARAM_INT);
        $c = required_param('c', PARAM_INT);
        $percentage = required_param('percentage', PARAM_FLOAT);
        $completeditems = required_param('completeditems', PARAM_TEXT);
        $g = required_param('g', PARAM_FLOAT);
        $ginstance = required_param('gradeiteminstance', PARAM_INT);
        $xp = required_param('xp', PARAM_INT);
        $completiondetails = required_param('completiondetails', PARAM_RAW);
        $details = required_param('details', PARAM_RAW);
        $markdone = required_param('markdone', PARAM_BOOL);
        $type = required_param('annotationtype', PARAM_TEXT);
        $updatestate = required_param('updatestate', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        $progress = interactivevideo_util::save_progress(
            $id,
            $userid,
            $completeditems,
            $completiondetails,
            $markdone,
            $type,
            $details,
            $c,
            $percentage,
            $g,
            $ginstance,
            $xp,
            $updatestate == 1,
            $courseid
        );
        echo json_encode($progress);
        break;
    case 'get_report_data_by_group':
        require_capability('mod/interactivevideo:viewreport', $context);
        $groupid = required_param('groupid', PARAM_INT);
        $cmid = required_param('cmid', PARAM_INT);
        $ctxid = required_param('ctxid', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        echo json_encode(array_values(interactivevideo_util::get_report_data_by_group($cmid, $groupid, $ctxid, $courseid)));
        break;
    case 'get_log':
        require_capability('mod/interactivevideo:view', $context);
        $userid = required_param('userid', PARAM_INT);
        $cmid = required_param('cm', PARAM_INT);
        $annotationid = required_param('annotationid', PARAM_INT);
        $log = interactivevideo_util::get_log($userid, $cmid, $annotationid, $contextid);
        echo json_encode($log);
        break;
    case 'get_logs_by_userids':
        require_capability('mod/interactivevideo:view', $context);
        $userids = required_param('userids', PARAM_TEXT);
        $userids = explode(',', $userids);
        $annotationid = required_param('annotationid', PARAM_INT);
        $type = optional_param('type', '', PARAM_TEXT);
        $cmid = optional_param('cmid', 0, PARAM_INT);
        $log = interactivevideo_util::get_logs_by_userids($userids, $annotationid, $contextid, $type, $cmid);
        echo json_encode($log);
        break;
    case 'delete_progress_by_id':
        require_capability('mod/interactivevideo:editreport', $context);
        $recordid = required_param('recordid', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        $cmid = required_param('cmid', PARAM_INT);
        echo interactivevideo_util::delete_progress_by_id($contextid, $recordid, $courseid, $cmid);
        break;
    case 'delete_progress_by_ids':
        require_capability('mod/interactivevideo:editreport', $context);
        $ids = required_param('completionids', PARAM_TEXT);
        $ids = explode(',', $ids);
        $courseid = required_param('courseid', PARAM_INT);
        $cmid = required_param('cmid', PARAM_INT);
        echo interactivevideo_util::delete_progress_by_ids($contextid, $ids, $courseid, $cmid);
        break;
    case 'get_taught_courses':
        require_capability('mod/interactivevideo:edit', $context);
        $userid = required_param('userid', PARAM_INT);
        $courses = interactivevideo_util::get_taught_courses($userid);
        echo json_encode($courses);
        break;
    case 'get_cm_by_courseid':
        require_capability('mod/interactivevideo:edit', $context);
        $courseid = required_param('courseid', PARAM_INT);
        $cms = interactivevideo_util::get_cm_by_courseid($courseid);
        echo json_encode($cms);
        break;
    case 'import_annotations':
        require_capability('mod/interactivevideo:edit', $context);
        $fromcourse = required_param('fromcourse', PARAM_INT);
        $tocourse = required_param('tocourse', PARAM_INT);
        $fromcm = required_param('fromcm', PARAM_INT);
        $tocm = required_param('tocm', PARAM_INT);
        $module = required_param('module', PARAM_INT);
        $annotations = required_param('annotations', PARAM_RAW);
        $annotations = json_decode($annotations, true);
        $annotations = interactivevideo_util::import_annotations(
            $fromcourse,
            $tocourse,
            $module,
            $fromcm,
            $tocm,
            $annotations,
            $contextid
        );
        echo json_encode($annotations);
        break;
    case 'quick_edit_field':
        require_capability('mod/interactivevideo:edit', $context);
        $id = required_param('id', PARAM_INT);
        $field = required_param('field', PARAM_TEXT);
        $value = required_param('value', PARAM_TEXT);
        $draftitemid = optional_param('draftitemid', 0, PARAM_INT);
        $item = interactivevideo_util::quick_edit_field($id, $field, $value, $contextid, $draftitemid);
        echo json_encode($item);
        break;
    case 'get_cm_completion':
        require_capability('mod/interactivevideo:view', $context);
        $cmid = required_param('cmid', PARAM_INT);
        $userid = required_param('userid', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        $completion = interactivevideo_util::get_cm_completion($cmid, $userid, $courseid, $contextid);
        echo json_encode($completion);
        break;
    case 'update_watchedpoint':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('completionid', PARAM_INT);
        $watchedpoint = required_param('watchedpoint', PARAM_INT);
        $DB->set_field('interactivevideo_completion', 'lastviewed', $watchedpoint, ['id' => $id]);
        echo json_encode(['id' => $id, 'watchedpoint' => $watchedpoint]);
        break;
    case 'update_ivitems_cache':
        require_capability('mod/interactivevideo:edit', $context);
        $cmid = required_param('cmid', PARAM_INT);
        $cache = cache::make('mod_interactivevideo', 'iv_items_by_cmid');
        $cache->delete($cmid);
        break;
    case 'delete_completion_data':
        require_capability('mod/interactivevideo:editreport', $context);
        $id = required_param('id', PARAM_INT);
        $itemid = required_param('itemid', PARAM_INT);
        $userid = required_param('userid', PARAM_INT);
        $completion = $DB->get_record('interactivevideo_completion', ['id' => $id]);
        if ($completion) {
            $completeditems = json_decode($completion->completeditems);
            $key = array_search($itemid, $completeditems);
            if ($key !== false) {
                unset($completeditems[$key]);
                $completion->completeditems = json_encode(array_values($completeditems));
            }
            $completiondetails = json_decode($completion->completiondetails);
            // Update the item with id = $itemid to mark its detail as "deleted".
            $completiondetails = array_map(function ($item) use ($itemid) {
                $decoded = json_decode($item);
                if ($decoded->id == $itemid) {
                    $new = [
                        'id' => $decoded->id,
                        'deleted' => true,
                    ];
                    return json_encode($new);
                }
                return json_encode($decoded);
            }, $completiondetails);
            $completion->completiondetails = json_encode(array_values($completiondetails));
            $DB->update_record('interactivevideo_completion', $completion);

            // Delete associated logs.
            $logs = $DB->get_records('interactivevideo_log', ['userid' => $userid, 'annotationid' => $itemid]);
            $fs = get_file_storage();
            if ($logs) {
                foreach ($logs as $log) {
                    $fs->delete_area_files($contextid, 'mod_interactivevideo', 'attachments', $log->id);
                    $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text1', $log->id);
                    $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text2', $log->id);
                    $fs->delete_area_files($contextid, 'mod_interactivevideo', 'text3', $log->id);
                }
                $DB->delete_records('interactivevideo_log', ['userid' => $userid, 'annotationid' => $itemid]);
            }
            echo json_encode(['id' => $id, 'itemid' => $itemid]);

        } else {
            echo json_encode(['error' => 'Completion record not found']);
        }
        break;
}
