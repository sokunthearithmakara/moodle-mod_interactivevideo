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
        require_capability('mod/interactivevideo:view', $context);
        echo json_encode(interactivevideo_util::get_all_activitytypes(optional_param('fromview', 0, PARAM_INT)));
        break;
    case 'format_text':
        $text = required_param('text', PARAM_RAW);
        echo interactivevideo_util::format_content($text, 1, $contextid);
        break;
    case 'get_from_url':
        require_capability('mod/interactivevideo:view', $context);
        $url = required_param('url', PARAM_URL);
        // Only the metadata endpoints of the supported video providers may be fetched.
        echo \mod_interactivevideo\local\remote_fetcher::fetch(
            $url,
            \mod_interactivevideo\local\remote_fetcher::get_provider_hosts()
        );
        break;
    case 'update_videotime':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        interactivevideo_util::validate_module_instance($context, $id);
        $start = required_param('start', PARAM_FLOAT);
        $end = required_param('end', PARAM_FLOAT);

        $current = $DB->get_record('interactivevideo', ['id' => $id], 'id, starttime, endtime', MUST_EXIST);

        // The player re-posts this on almost every view, so a refused write is a silent no-op
        // rather than an error. Without edit rights the window may only be widened.
        $maywrite = has_capability('mod/interactivevideo:edit', $context)
            || interactivevideo_util::videotime_change_is_widening(
                $current->starttime,
                $current->endtime,
                $start,
                $end
            );

        if ($maywrite) {
            $DB->set_field('interactivevideo', 'starttime', $start, ['id' => $id]);
            $DB->set_field('interactivevideo', 'endtime', $end, ['id' => $id]);
            $courseid = required_param('courseid', PARAM_INT);
            $cmid = required_param('cmid', PARAM_INT);
            // Purge the course module cache after update action.
            \course_modinfo::purge_course_module_cache($courseid, $cmid);
        } else {
            $start = $current->starttime;
            $end = $current->endtime;
        }

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
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'public', $id);
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'itext1', $id);
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'itext2', $id);
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'itext3', $id);
        $fs->delete_area_files($contextid, 'mod_interactivevideo', 'asset', $id);
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
        $userid = interactivevideo_util::resolve_target_userid($context, required_param('uid', PARAM_INT));
        interactivevideo_util::validate_module_instance($context, $id);
        $previewmode = required_param('previewmode', PARAM_BOOL);
        $progress = interactivevideo_util::get_progress($id, $userid, $previewmode);
        echo json_encode($progress);
        break;
    case 'save_progress':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $userid = interactivevideo_util::resolve_target_userid($context, required_param('uid', PARAM_INT));
        // Bind the instance to the context the capability was checked against; the course
        // id and grade item are then resolved server-side inside save_progress().
        interactivevideo_util::validate_module_instance($context, $id);
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
        $userid = interactivevideo_util::resolve_target_userid(
            $context,
            required_param('userid', PARAM_INT),
            'mod/interactivevideo:viewreport'
        );
        $cmid = required_param('cm', PARAM_INT);
        $annotationid = required_param('annotationid', PARAM_INT);
        $log = interactivevideo_util::get_log($userid, $cmid, $annotationid, $contextid);
        echo json_encode($log);
        break;
    case 'save_log':
        require_capability('mod/interactivevideo:view', $context);
        $userid = interactivevideo_util::resolve_target_userid($context, required_param('userid', PARAM_INT));
        $annotationid = required_param('annotationid', PARAM_INT);
        // The cmid in this payload is the instance id, so it binds like any other.
        $cmid = required_param('cmid', PARAM_INT);
        interactivevideo_util::validate_module_instance($context, $cmid);
        $data = required_param('data', PARAM_RAW);
        $replaceexisting = optional_param('replaceexisting', 0, PARAM_INT);
        $log = interactivevideo_util::save_log($userid, $annotationid, $cmid, $data, $contextid, $replaceexisting);
        echo json_encode($log);
        break;
    case 'get_logs_by_userids':
        require_capability('mod/interactivevideo:view', $context);
        $userids = required_param('userids', PARAM_SEQUENCE);
        // Keys matter here: array_filter preserves them and the comparison below is strict.
        $userids = array_values(array_filter(array_map('intval', explode(',', $userids))));
        interactivevideo_util::require_log_read_access($context, $userids);
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
    case 'delete_own_progress_by_id':
        require_capability('mod/interactivevideo:view', $context);
        $recordid = required_param('recordid', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        $cmid = required_param('cmid', PARAM_INT);
        // The activity must actually offer self-service resets, not just hide the button.
        interactivevideo_util::require_own_progress_deletion_allowed($context);
        // Ownership is enforced against the stored record, not the supplied user id.
        interactivevideo_util::get_owned_completion_record($recordid, $context, $USER->id);
        echo interactivevideo_util::delete_progress_by_id($contextid, $recordid, $courseid, $cmid);
        break;
    case 'delete_progress_by_ids':
        require_capability('mod/interactivevideo:editreport', $context);
        $ids = required_param('completionids', PARAM_SEQUENCE);
        $ids = array_filter(array_map('intval', explode(',', $ids)));
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
        // The cmid here is a real course module id, so bind it to the checked context
        // directly rather than via validate_module_instance(), which compares instances.
        if ($context->contextlevel != CONTEXT_MODULE || (int) $context->instanceid !== $cmid) {
            throw new \moodle_exception('invalidcoursemodule', 'error');
        }
        $userid = required_param('userid', PARAM_INT);
        // Completion lookup falls back to the current user when handed 0; preserve that.
        if ($userid) {
            $userid = interactivevideo_util::resolve_target_userid(
                $context,
                $userid,
                'mod/interactivevideo:viewreport'
            );
        }
        $courseid = required_param('courseid', PARAM_INT);
        $completion = interactivevideo_util::get_cm_completion($cmid, $userid, $courseid, $contextid);
        echo json_encode($completion);
        break;
    case 'update_watchedpoint':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('completionid', PARAM_INT);
        // The watch point belongs to whoever owns the completion row, not to whoever asks.
        interactivevideo_util::get_owned_completion_record($id, $context, $USER->id);
        $watchedpoint = required_param('watchedpoint', PARAM_INT);
        $DB->set_field('interactivevideo_completion', 'lastviewed', $watchedpoint, ['id' => $id]);
        echo json_encode(['id' => $id, 'watchedpoint' => $watchedpoint]);
        break;
    case 'update_timeended':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('completionid', PARAM_INT);
        $updatestate = required_param('updatestate', PARAM_INT);
        // The owner, activity and course all come from the stored record, not the request.
        [$completionrecord, $cm] = interactivevideo_util::get_owned_completion_record($id, $context, $USER->id);
        $courseid = $cm->course;
        $userid = $completionrecord->userid;
        $DB->set_field('interactivevideo_completion', 'timeended', time(), ['id' => $id]);
        $overallcomplete = false;
        if ($updatestate) {
            if ($cm->completion > 1) {
                require_once($CFG->libdir . '/completionlib.php');
                $course = new stdClass();
                $course->id = $courseid;
                $completion = new completion_info($course);
                $completion->update_state($cm);
                $overallcomplete = $completion->internal_get_state($cm, $userid, null);
            }
        }
        echo json_encode(['id' => $id, 'timeended' => time(), 'overallcomplete' => $overallcomplete]);
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
        echo interactivevideo_util::delete_completion_data($id, $itemid, $userid, $contextid);
        break;
    case 'delete_own_completion_data':
        require_capability('mod/interactivevideo:view', $context);
        $id = required_param('id', PARAM_INT);
        $itemid = required_param('itemid', PARAM_INT);
        // Ownership is enforced against the stored record, not the supplied user id.
        interactivevideo_util::get_owned_completion_record($id, $context, $USER->id);
        echo interactivevideo_util::delete_completion_data($id, $itemid, $USER->id, $contextid);
        break;
    case 'override_completion_xp':
        require_capability('mod/interactivevideo:editreport', $context);
        $id = required_param('id', PARAM_INT);
        $itemid = required_param('itemid', PARAM_INT);
        $userid = required_param('userid', PARAM_INT);
        $xp = required_param('xp', PARAM_FLOAT);
        $courseid = required_param('courseid', PARAM_INT);
        $reportview = optional_param('reportview', '', PARAM_RAW);
        echo interactivevideo_util::override_completion_xp($id, $itemid, $userid, $contextid, $xp, $courseid, $reportview);
        break;
    case 'download_annotations':
        require_capability('mod/interactivevideo:edit', $context);
        $annotations = required_param('annotations', PARAM_TEXT);
        $cmid = required_param('cmid', PARAM_INT);
        $courseid = required_param('courseid', PARAM_INT);
        $link = interactivevideo_util::download_annotations($annotations, $cmid, $courseid, $contextid);
        echo $link;
        break;
    case 'set_defaults':
        require_capability('mod/interactivevideo:edit', $context);
        $defaults = required_param('defaults', PARAM_TEXT);
        $defaults = json_decode($defaults, true);
        $saved = interactivevideo_util::save_defaults($defaults, $contextid);
        echo json_encode($saved);
        break;
    case 'delete_default':
        require_capability('mod/interactivevideo:manage', $context);
        $courseid = required_param('courseid', PARAM_INT);
        $type = required_param('type', PARAM_TEXT);
        interactivevideo_util::delete_default($courseid, $type);
        echo json_encode(['status' => 'success', 'type' => $type]);
        break;
    case 'get_vdocipher':
        require_capability('mod/interactivevideo:view', $context);
        $key = get_config('mod_interactivevideo', 'auth_vdocipher');
        // Constrain the id to the documented format so it cannot alter the request path.
        $videoid = required_param('videoid', PARAM_ALPHANUMEXT);
        $info = required_param('info', PARAM_ALPHA);
        require_once($CFG->libdir . '/filelib.php');
        // The VdoCipher host is fixed, so the security helper must stay enabled.
        $curl = new curl();
        $curl->setHeader('Accept: application/json');
        $curl->setHeader('Authorization: Apisecret ' . $key);
        $curl->setHeader('Content-Type: application/json');

        if ($info == 'otp') {
            $url = "https://www.vdocipher.com/api/videos/$videoid/otp";

            $payload = json_encode([
                "ttl" => // 30 years in seconds.
                30 * 365 * 24 * 60 * 60,
            ]);
            $response = $curl->post($url, $payload);
        } else {
            $url = "https://www.vdocipher.com/api/videos/$videoid";
            $response = $curl->get($url);
        }

        echo $response;
        break;
}
