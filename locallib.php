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

/** License proxy register.php URL (set per deployment). */
define('IV_LICENSE_PROXY', 'https://license.tmakara.com/register.php');

/** Shared HMAC secret for BMC registration requests. */
define('IV_REGISTRATION_PUBLICKEY', '8f9044c52040e89277e7658077690308');

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
     * Interactions for an activity, without touching the page or formatting anything.
     *
     * get_items() sets $PAGE->context so that format_string() can run over each title. That is
     * wrong for callers reached while a course page is rendering: with two interactive videos in
     * a course, the second call switches the page context from one module to another and Moodle
     * reports "unsupported modification of PAGE->context". The reachability rule needs only ids,
     * types, timestamps and xp, so it reads the same cache directly.
     *
     * @param int $interactivevideo The instance id.
     * @return array Raw item records keyed by id.
     */
    private static function get_raw_items($interactivevideo) {
        global $DB;

        $cache = cache::make('mod_interactivevideo', 'iv_items_by_cmid');
        $items = $cache->get($interactivevideo);
        if (!$items) {
            $items = $DB->get_records('interactivevideo_items', ['annotationid' => $interactivevideo]);
            $cache->set($interactivevideo, $items);
        }

        return (array) $items;
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
     * @return mixed
     */
    public static function copy_item($id, $contextid, $timestamp) {
        global $DB, $CFG;
        $record = $DB->get_record('interactivevideo_items', ['id' => $id], '*', MUST_EXIST);
        // Copying creates a new interaction, so it is subject to the same activation rule as
        // authoring one from scratch.
        self::require_usable_type($record->type);
        if ($timestamp == $record->timestamp) {
            $record->timestamp = $record->timestamp + 0.01; // Make sure the timestamp isn't the same.
        } else {
            $record->timestamp = $timestamp; // Put the new item at the current timestamp.
        }
        $record->title = $record->title . ' (' . get_string('copynoun', 'mod_interactivevideo') . ')';
        $record->id = $DB->insert_record('interactivevideo_items', $record);
        // Handle related files in item fileareas.
        require_once($CFG->libdir . '/filelib.php');
        $fs = get_file_storage();
        $contentfiles = $fs->get_area_files($contextid, 'mod_interactivevideo', 'content', $id, 'id ASC', false);
        $text1files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext1', $id, 'id ASC', false);
        $text2files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext2', $id, 'id ASC', false);
        $text3files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext3', $id, 'id ASC', false);

        // Merge the files.
        $files = array_merge($contentfiles, $text1files, $text2files, $text3files);
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
        return format_text($content, $format, [
            'noclean' => true,
            'overflowdiv' => false,
            'context' => $context,
            'trusttext' => true,
        ]);
    }

    /**
     * The configured list of enabled content types, as stored.
     *
     * Overridable because mod_flexbook extends this class and keeps its own enabled list. Any
     * inherited method that memoises per configuration must go through this, and must key on
     * static::class as well: a static inside a method is shared by every class that inherits it,
     * so without both the subclass would read this class's answer.
     *
     * @return string Raw comma separated component list.
     */
    protected static function enabled_types_config() {
        return (string) get_config('mod_interactivevideo', 'enablecontenttypes');
    }

    /**
     * The short type names of the content types currently enabled site-wide.
     *
     * Matched the same way the player does in viewannotation.js::filterAnnotations(): an
     * exact comparison against each content type's own reported name. The stored config is
     * a list of component names, so a substring test against it over-matches whenever one
     * short name happens to appear inside an unrelated component name.
     *
     * Activation is deliberately NOT enforced here. This list feeds
     * get_reachable_gradable_items(), and therefore grading, completion and the activity card.
     * Dropping a deactivated type from it would silently rebase every affected learner's grade:
     * somebody who had completed 3 of 5 interactions would become 3 of 3. Deactivation hides
     * interactions from learners; it must not move anybody's existing grade.
     *
     * @return array Short type names, e.g. ['richtext', 'chapter'].
     */
    public static function get_enabled_type_names() {
        // Memoised against the configured list itself, so enabling or disabling a content
        // type takes effect immediately rather than being masked until the next request.
        static $cache = [];

        $key = static::class . '|' . static::enabled_types_config();
        if (!array_key_exists($key, $cache)) {
            $cache[$key] = array_column(static::get_all_activitytypes_unfiltered(), 'name');
        }

        return $cache[$key];
    }

    /**
     * Map an interaction type name to the component that provides it.
     *
     * Built from the unenforced list so a deactivated type still resolves; callers need the
     * component precisely in order to ask whether it is usable.
     *
     * @param string $type Interaction type name, e.g. 'form'.
     * @return string Component name, or '' when the type is unknown.
     */
    public static function get_component_for_type($type) {
        // Keyed on the configured list, not a bare static: a plain static survives between tests
        // in one process and masks a changed configuration.
        static $maps = [];

        $key = static::class . '|' . static::enabled_types_config();
        if (!array_key_exists($key, $maps)) {
            $map = [];
            foreach (static::get_all_activitytypes_unfiltered() as $properties) {
                $component = $properties['component'] ?? ($properties['stringcomponent'] ?? '');
                if ($component !== '') {
                    $map[$properties['name']] = $component;
                }
            }
            $maps[$key] = $map;
        }

        return $maps[$key][$type] ?? '';
    }

    /**
     * Activity types with the unusable ones removed rather than merely flagged.
     *
     * get_all_activitytypes() keeps a deactivated type in the authoring list, flagged 'inactive',
     * so a teacher can still see their content. That is wrong for the class allow lists, which
     * decide what may actually be instantiated and rendered — there a deactivated type must be
     * absent, or the licence could be bypassed by driving the content type directly.
     *
     * @return array
     */
    public static function get_usable_activitytypes() {
        return array_values(array_filter(static::get_all_activitytypes(), function ($properties) {
            return empty($properties['inactive']);
        }));
    }

    /**
     * Whether an interaction type may be created or edited on this site.
     *
     * Non-throwing form of {@see self::require_usable_type()}, for bulk paths that should skip
     * an unusable interaction rather than abort everything around it.
     *
     * @param string $type Interaction type name.
     * @return bool
     */
    public static function type_is_usable($type) {
        $component = static::get_component_for_type($type);

        return $component !== ''
            && \mod_interactivevideo\local\contenttype_activation::is_usable($component);
    }

    /**
     * Assert that an interaction type may be created or edited on this site.
     *
     * Hiding a type from the chooser is presentation; this is the enforcement. Called from every
     * path that writes an interactivevideo_items row.
     *
     * @param string $type Interaction type name.
     * @throws moodle_exception When the type belongs to a content type that is not activated.
     */
    public static function require_usable_type($type) {
        $component = static::get_component_for_type($type);
        if ($component === '') {
            // Unknown type: not something this site can author, whatever the reason.
            throw new \moodle_exception('contenttypeunknown', 'mod_interactivevideo');
        }

        if (!\mod_interactivevideo\local\contenttype_activation::is_usable($component)) {
            throw new \moodle_exception('contenttypenotusable', 'mod_interactivevideo');
        }
    }

    /**
     * The gradable interactions a learner can actually reach in an activity.
     *
     * Three things put an interaction out of reach, and all must be excluded from any XP
     * total or the learner is measured against work the player never shows them:
     *
     * - Its content type has been disabled site-wide.
     * - It sits outside the activity's trimmed start/end window.
     * - It sits inside a skipped segment, which the player jumps over.
     *
     * This is the single definition of reachability, mirroring what the player does in
     * viewannotation.js::filterAnnotations() and getRelevantAnnotations(). Note the window
     * rule differs for skip segments: one is relevant when it *overlaps* the window, since
     * a segment starting before the trim point still hides what follows it.
     *
     * @param int $interactivevideo The instance id.
     * @param int $contextid Unused since the item read stopped going through get_items(); kept so
     *      the signature stays stable for existing callers.
     * @param stdClass|null $instance The instance record, fetched if not supplied.
     * @return array Reachable gradable items, keyed by item id.
     */
    public static function get_reachable_gradable_items($interactivevideo, $contextid, $instance = null) {
        global $DB;

        if ($instance === null) {
            $instance = $DB->get_record(
                'interactivevideo',
                ['id' => $interactivevideo],
                'id, starttime, endtime',
                MUST_EXIST
            );
        }
        $start = (float) $instance->starttime;
        $end = (float) $instance->endtime;
        $enabled = self::get_enabled_type_names();

        // Unfiltered: the skip segments themselves are needed to work out what they hide.
        $items = self::get_raw_items($interactivevideo);

        $inwindow = array_filter($items, function ($item) use ($start, $end, $enabled) {
            // An empty list means the enabled types could not be resolved. Excluding
            // everything would silently zero every learner's denominator, so fail open.
            if (!empty($enabled) && !in_array($item->type, $enabled, true)) {
                return false;
            }
            if ($item->type === 'skipsegment') {
                // A skip segment counts when it overlaps the window, not only when it is
                // wholly inside it. Its end timestamp lives in the title column.
                return !((float) $item->timestamp > $end || (float) $item->title < $start);
            }
            // A negative timestamp means "not tied to a point on the timeline".
            if ((float) $item->timestamp < 0) {
                return true;
            }
            return (float) $item->timestamp >= $start && (float) $item->timestamp <= $end;
        });

        $skipsegments = array_filter($inwindow, function ($item) {
            return $item->type === 'skipsegment';
        });

        return array_filter($inwindow, function ($item) use ($skipsegments) {
            if ($item->type === 'skipsegment' || $item->hascompletion != 1) {
                return false;
            }
            foreach ($skipsegments as $ss) {
                if (
                    (float) $item->timestamp > (float) $ss->timestamp
                    && (float) $item->timestamp < (float) $ss->title
                    && (float) $item->timestamp >= 0
                ) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Resolve the user a self-service request may act on.
     *
     * The client sends the user id it believes it is acting for. Acting on anybody other
     * than the current user is a report-level operation, so it requires a report capability
     * rather than the view capability that guards the endpoints themselves. Writes ask for
     * editreport; reads pass viewreport, which is what the report page itself enforces.
     *
     * @param context $context The module context the request was authorised against.
     * @param int $requesteduserid The user id supplied by the client.
     * @param string $capability The capability that permits acting on another user.
     * @return int The user id the caller is permitted to act on.
     * @throws moodle_exception If the caller may not act on the requested user.
     */
    public static function resolve_target_userid(
        $context,
        $requesteduserid,
        $capability = 'mod/interactivevideo:editreport'
    ) {
        global $USER;

        if ((int) $requesteduserid === (int) $USER->id) {
            return (int) $USER->id;
        }

        if (has_capability($capability, $context)) {
            return (int) $requesteduserid;
        }

        throw new \moodle_exception('nopermission', 'error');
    }

    /**
     * Assert the caller may read interaction logs for the requested set of users.
     *
     * Reading only your own logs is the ordinary learner path. Any other set is a report
     * operation. Note this guards the request, not interactivevideo_util::get_logs_by_userids()
     * itself, which is called directly by other plugins that authorise their own callers.
     *
     * @param context $context The module context the request was authorised against.
     * @param array $userids Normalised list of requested user ids.
     * @throws required_capability_exception If the caller may not read other users' logs.
     */
    public static function require_log_read_access($context, array $userids) {
        global $USER;

        if ($userids !== [(int) $USER->id]) {
            require_capability('mod/interactivevideo:viewreport', $context);
        }
    }

    /**
     * Confirm an instance id belongs to the context the request was authorised against.
     *
     * Without this the instance id, course id and context id are independent request
     * parameters, so a caller with view access to one activity can direct a write at
     * another one anywhere on the site.
     *
     * @param context $context The context the capability check was made against.
     * @param int $instanceid The interactivevideo instance id supplied by the client.
     * @return stdClass The course module, so callers can take an authoritative course id.
     * @throws moodle_exception If the context is not a module context or does not match.
     */
    public static function validate_module_instance($context, $instanceid) {
        if ($context->contextlevel != CONTEXT_MODULE) {
            throw new \moodle_exception('invalidcontext', 'error');
        }

        $cm = get_coursemodule_from_id('interactivevideo', $context->instanceid, 0, false, MUST_EXIST);
        if ((int) $cm->instance !== (int) $instanceid) {
            throw new \moodle_exception('invalidcoursemodule', 'error');
        }

        return $cm;
    }

    /**
     * Whether a proposed start/end pair may be written by a caller without edit rights.
     *
     * The player reports the video's real duration on first view and persists it, and the
     * first viewer may be anyone, so this cannot be gated on a capability. But start and end
     * define the window that decides which interactions count towards completion and grade,
     * so a learner must never be able to narrow it: posting end=1 would otherwise complete
     * the activity trivially and change what it is worth for everybody.
     *
     * Widening is always safe, which covers both legitimate cases: capturing the duration
     * into an empty end, and resetting a start that sits beyond the video's real length.
     *
     * @param float $currentstart The stored start time.
     * @param float $currentend The stored end time.
     * @param float $newstart The proposed start time.
     * @param float $newend The proposed end time.
     * @return bool True when the write only widens or leaves the window unchanged.
     */
    public static function videotime_change_is_widening($currentstart, $currentend, $newstart, $newend) {
        return (float) $newstart <= (float) $currentstart && (float) $newend >= (float) $currentend;
    }

    /**
     * Assert that a learner is permitted to reset their own progress on this activity.
     *
     * The reset control is offered only when the activity enables allowdeleteprogress and
     * the viewer is not a guest, but that is a client-side decision; the server has to
     * apply the same policy or the button being hidden means nothing.
     *
     * @param context $context The module context.
     * @throws moodle_exception If self-service deletion is not permitted here.
     */
    public static function require_own_progress_deletion_allowed($context) {
        global $DB;

        if (is_guest($context) || !isloggedin()) {
            throw new \moodle_exception('nopermission', 'error');
        }

        if ($context->contextlevel != CONTEXT_MODULE) {
            throw new \moodle_exception('invalidcontext', 'error');
        }
        $cm = get_coursemodule_from_id('interactivevideo', $context->instanceid, 0, false, MUST_EXIST);

        $displayoptions = $DB->get_field('interactivevideo', 'displayoptions', ['id' => $cm->instance], MUST_EXIST);
        $options = json_decode((string) $displayoptions, true);

        if (empty($options['allowdeleteprogress'])) {
            throw new \moodle_exception('nopermission', 'error');
        }
    }

    /**
     * Load a completion record, confirming it belongs where the caller says it does.
     *
     * Deletions key on a client-supplied record id, so the record has to be fetched and
     * checked before anything is removed: it must belong to the activity the capability
     * was checked against, and for a self-service call it must belong to the caller.
     *
     * @param int $recordid The interactivevideo_completion id supplied by the client.
     * @param context $context The context the capability check was made against.
     * @param int|null $requireuserid When set, the record must belong to this user.
     * @return array [stdClass $record, stdClass $cm]
     * @throws moodle_exception If the record is missing, out of context, or not owned.
     */
    public static function get_owned_completion_record($recordid, $context, $requireuserid = null) {
        global $DB;

        $record = $DB->get_record('interactivevideo_completion', ['id' => $recordid], '*', MUST_EXIST);

        // The completion table stores the module instance id in its cmid column.
        $cm = self::validate_module_instance($context, $record->cmid);

        if ($requireuserid !== null && (int) $record->userid !== (int) $requireuserid) {
            throw new \moodle_exception('nopermission', 'error');
        }

        return [$record, $cm];
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
        global $DB, $USER;
        if ($userid == 1 || $preview || isguestuser()) {
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
            // Only ever materialise a row for the current user. Reading somebody else's
            // progress must not create state on their behalf.
            if ((int) $userid === (int) $USER->id) {
                $record->id = $DB->insert_record('interactivevideo_completion', $record);
            } else {
                $record->id = 0;
                $record->xp = 0;
            }
        }
        return $record;
    }


    /**
     * Constrain a client-supplied completion detail to what the interaction can award.
     *
     * Interactions tracked as manual or view are not scored, so completing one is worth
     * exactly its configured XP and no client value is accepted. Scored interactions do
     * report a score from the browser, which is clamped to the configured maximum.
     *
     * @param stdClass $detail Decoded completion detail from the request.
     * @param array $itemmax Configured XP keyed by interaction id.
     * @param array $itemtracking Completion tracking mode keyed by interaction id.
     * @return stdClass The constrained detail.
     */
    private static function constrain_completion_detail($detail, array $itemmax, array $itemtracking) {
        $itemid = (string) $detail->id;
        $max = $itemmax[$itemid];
        $originalxp = isset($detail->xp) ? (float) $detail->xp : 0.0;

        if (in_array($itemtracking[$itemid], ['manual', 'view'], true)) {
            $detail->xp = $max;
        } else {
            $detail->xp = min(max($originalxp, 0.0), $max);
        }
        $detail->percent = $max > 0 ? ($detail->xp / $max) : 0;

        // The report view embeds the XP as display text, so keep it in step.
        if ((float) $detail->xp !== $originalxp && isset($detail->reportView)) {
            $detail->reportView = \mod_interactivevideo\report_helper::patch_report_view_xp(
                $detail->reportView,
                $detail->xp
            );
        }

        return $detail;
    }

    /**
     * Save the progress of an interactive video for a user.
     *
     * The gradebook grade, earned XP, completion percentage and completion flag are all
     * recomputed here from the activity's stored interactions. The corresponding request
     * values are accepted for backwards compatibility with existing callers but ignored.
     *
     * @param int $interactivevideo The ID of the interactive video.
     * @param int $userid The ID of the user.
     * @param string $completeditems JSON encoded list of completed interaction ids.
     * @param string $completiondetails JSON encoded string of completion details.
     * @param bool $markdone Whether to mark the item as done.
     * @param string $type The type of the interactive video.
     * @param string $details Additional details (optional).
     * @param int $completed Ignored; recomputed from the completion threshold.
     * @param float $percentage Ignored; recomputed from the completed interactions.
     * @param float $grade Ignored; recomputed from the stored XP.
     * @param int $gradeiteminstance Ignored; resolved from the activity's own grade item.
     * @param int $xp Ignored; recomputed from the stored completion details.
     * @param bool $updatestate Whether to update the completion state (optional, default is true).
     * @param int $courseid Ignored; resolved from the course module.
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
        if ($userid == 1 || isguestuser()) {
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
        // Resolve the activity from the instance so the course id and grade item are taken
        // from the server's view of it rather than from the request.
        $cm = get_coursemodule_from_instance('interactivevideo', $interactivevideo, 0, false, MUST_EXIST);
        $courseid = $cm->course;
        $contextid = \context_module::instance($cm->id)->id;

        $record = $DB->get_record('interactivevideo_completion', ['cmid' => $interactivevideo, 'userid' => $userid]);
        if (!$record) {
            // Normally created by get_progress(); create it here rather than fatal on false.
            $record = self::get_progress($interactivevideo, $userid);
            if (empty($record->id)) {
                throw new \moodle_exception('nopermission', 'error');
            }
        }

        // What this activity's interactions are actually worth, according to the server.
        // The client's grade, XP, percentage and completion flag are all recomputed from
        // this rather than trusted. Only interactions the learner can actually reach count:
        // anything outside the trim window or buried in a skipped segment is excluded, or
        // the learner would be graded against work the player never shows them.
        $instancerecord = $DB->get_record(
            'interactivevideo',
            ['id' => $interactivevideo],
            'id, starttime, endtime, completionpercentage',
            MUST_EXIST
        );
        $items = self::get_reachable_gradable_items($interactivevideo, $contextid, $instancerecord);
        $itemmax = [];
        $itemtracking = [];
        $totalmax = 0;
        foreach ($items as $item) {
            $itemmax[(string) $item->id] = (float) $item->xp;
            $itemtracking[(string) $item->id] = $item->completiontracking;
            $totalmax += (float) $item->xp;
        }

        $completion = json_decode($completiondetails);
        if (!$completion || !isset($completion->id) || !isset($itemmax[(string) $completion->id])) {
            throw new \moodle_exception('invalidcoursemodule', 'error');
        }
        $completion = self::constrain_completion_detail($completion, $itemmax, $itemtracking);
        $completiondetails = json_encode($completion);

        $cdetails = json_decode($record->completiondetails);
        if (!is_array($cdetails)) {
            $cdetails = [];
        }
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

        // Only interactions that belong to this activity and are gradable may count.
        $completeditemsarr = json_decode($completeditems);
        if (!is_array($completeditemsarr)) {
            $completeditemsarr = [];
        }
        $completeditemsarr = array_values(array_intersect(
            array_map('strval', $completeditemsarr),
            array_keys($itemmax)
        ));
        $record->completeditems = json_encode($completeditemsarr);

        // Re-sum the earned XP from the stored, constrained details.
        $decodeddetails = array_map(fn($entry) => json_decode($entry), $cdetails);
        $earned = \mod_interactivevideo\report_helper::sum_earned_xp($decodeddetails, $completeditemsarr);
        $record->xp = $earned;

        $gradablecount = count($itemmax);
        $record->completionpercentage = $gradablecount > 0
            ? round(count($completeditemsarr) / $gradablecount * 100)
            : 0;

        // Mirror the client's completion rule: the configured threshold when one is set,
        // otherwise every gradable interaction.
        $threshold = (int) $instancerecord->completionpercentage;
        $iscomplete = $threshold > 0
            ? ($record->completionpercentage >= $threshold)
            : ($gradablecount > 0 && count($completeditemsarr) === $gradablecount);
        $record->timecompleted = $iscomplete ? time() : 0;

        $DB->update_record('interactivevideo_completion', $record);

        // Add/delete details to interactivevideo_log table.
        if ($completion->hasDetails) { // We don't want to query the database if there is no details.
            if (!$markdone) {
                $DB->delete_records_select('interactivevideo_log', "annotationid = :annotationid AND userid = :userid", [
                    'annotationid' => $completion->id,
                    'userid' => $userid,
                ]);
            } else {
                // Check if the log already exists.
                $existing = $DB->get_record('interactivevideo_log', [
                    'annotationid' => $completion->id,
                    'userid' => $userid,
                    'completionid' => $record->id,
                ]);
                if (!$existing) {
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
                } else {
                    $existing->text1 = $details;
                    $existing->timemodified = time();
                    $existing->completionid = $record->id;  // Store the completion id.
                    $DB->update_record('interactivevideo_log', $existing);
                }
            }
        }

        // Update grade. The gradebook value is derived from the stored XP, never from the
        // request, and always targets this activity's own grade item.
        require_once($CFG->libdir . '/gradelib.php');
        $activitygradeitem = \grade_item::fetch([
            'iteminstance' => $interactivevideo,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'courseid' => $courseid,
        ]);
        if ($activitygradeitem) {
            $computedgrade = \mod_interactivevideo\report_helper::calculate_grade(
                $earned,
                $totalmax,
                (float) $activitygradeitem->grademax
            );
            $gradeitem = new stdClass();
            $gradeitem->userid = $userid;
            $gradeitem->rawgrade = ($computedgrade === null || $computedgrade <= 0) ? null : $computedgrade;
            grade_update('mod/interactivevideo', $courseid, 'mod', 'interactivevideo', $interactivevideo, 0, $gradeitem);

            $record->grade = $computedgrade;
            $record->gradeiteminstance = $interactivevideo;
            $record->gradeitem = $gradeitem;
        }

        // Update completion state.
        if ($updatestate) {
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
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);

        if (!$courseid) {
            $cm = get_coursemodule_from_instance('interactivevideo', $interactivevideo);
            $courseid = $cm->course;
        }
        $coursecontext = \context_course::instance($courseid);

        // Prepare user fields using the modern Moodle API.
        $identityfields = get_config('mod_interactivevideo', 'reportfields');
        $extrafields = !empty($identityfields) ? explode(',', $identityfields) : [];
        $extrafields = array_map('strtolower', $extrafields);

        // Fetch custom field metadata once to avoid N+1 queries.
        $customfieldmetadata = [];
        if (!empty($extrafields)) {
            $customfieldshortnames = [];
            foreach ($extrafields as $field) {
                if (strpos($field, 'profile_field_') === 0) {
                    $customfieldshortnames[] = str_replace('profile_field_', '', $field);
                }
            }
            if (!empty($customfieldshortnames)) {
                [$insql, $inparams] = $DB->get_in_or_equal($customfieldshortnames, SQL_PARAMS_NAMED);
                $customfieldmetadata = $DB->get_records_select(
                    'user_info_field',
                    "shortname $insql",
                    $inparams,
                    '',
                    'shortname, datatype as type, id'
                );
                $customfieldmetadata = array_change_key_case($customfieldmetadata, CASE_LOWER);
            }
        }

        // Pre-instantiate field objects and prepare mapping to avoid overhead inside the student loop.
        $fieldobjects = [];
        $customfieldmap = [];
        foreach ($extrafields as $field) {
            if (strpos($field, 'profile_field_') === 0) {
                $shortname = str_replace('profile_field_', '', $field);
                $metadata = $customfieldmetadata[$shortname] ?? null;
                if ($metadata) {
                    if (!isset($fieldobjects[$metadata->id])) {
                        require_once($CFG->dirroot . '/user/profile/field/' . $metadata->type . '/field.class.php');
                        $classname = 'profile_field_' . $metadata->type;
                        $fieldobjects[$metadata->id] = new $classname($metadata->id);
                    }
                    $customfieldmap[$field] = [
                        'shortname' => $shortname,
                        'type' => $metadata->type,
                        'id' => $metadata->id,
                        'lowercased' => strtolower($field),
                    ];
                }
            }
        }

        // We use for_userpic() as a base and add identity fields.
        $userfields = \core_user\fields::for_userpic()->with_identity($context)->including(...$extrafields);
        $fieldsql = $userfields->get_sql('u', true, '', '', false);

        // Graded roles.
        $roles = get_config('core', 'gradebookroles');
        if (empty($roles)) {
            return [];
        }
        [$inparams, $inparamsvalues] = $DB->get_in_or_equal(explode(',', $roles), SQL_PARAMS_NAMED);

        if ($group == 0) {
            // Get all enrolled users (student only).
            $sql = "SELECT {$fieldsql->selects}, ac.timecompleted, ac.timecreated,
                           ac.completionpercentage, ac.completeditems, ac.xp, ac.completiondetails, ac.id as completionid
                    FROM {user} u
                    {$fieldsql->joins}
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = :cmid
                    WHERE u.id IN (SELECT userid FROM {role_assignments} WHERE contextid = :coursecontextid AND roleid $inparams)
                    ORDER BY u.lastname, u.firstname";
            $params = array_merge(
                $fieldsql->params,
                ['cmid' => $interactivevideo, 'coursecontextid' => $coursecontext->id],
                $inparamsvalues
            );
        } else {
            // Get users in group (student only).
            $sql = "SELECT {$fieldsql->selects}, ac.timecompleted, ac.timecreated,
                           ac.completionpercentage, ac.completeditems, ac.xp, ac.completiondetails, ac.id as completionid
                    FROM {user} u
                    {$fieldsql->joins}
                    LEFT JOIN {interactivevideo_completion} ac ON ac.userid = u.id AND ac.cmid = :cmid
                    WHERE u.id IN (SELECT userid FROM {groups_members} WHERE groupid = :groupid)
                    AND u.id IN (SELECT userid FROM {role_assignments} WHERE contextid = :coursecontextid AND roleid $inparams)
                    ORDER BY u.lastname, u.firstname";
            $params = array_merge(
                $fieldsql->params,
                ['cmid' => $interactivevideo, 'groupid' => $group, 'coursecontextid' => $coursecontext->id],
                $inparamsvalues
            );
        }

        $records = [];
        $rs = $DB->get_recordset_sql($sql, $params);
        foreach ($rs as $record) {
            // Render the photo of the user.
            $userpic = new \user_picture($record);
            $userpic->link = false;
            $userpic->includefullname = true;
            $record->pictureonly = $OUTPUT->render($userpic);
            $userpic->courseid = $courseid;
            $userpic->link = true;
            $userpic->popup = true;
            $record->picture = $OUTPUT->render($userpic);
            $record->fullname = fullname($record);

            // Handle custom fields efficiently using the pre-calculated map.
            $record->customfields = [];
            foreach ($customfieldmap as $info) {
                $field = $info['lowercased'];
                if (isset($record->{$field})) {
                    $fieldobj = $fieldobjects[$info['id']];
                    $fieldobj->data = $record->{$field};
                    $formatted = $fieldobj->display_data();

                    $record->customfields[] = [
                        'shortname' => $info['shortname'],
                        'type' => $info['type'],
                        'value' => $record->{$field}, // Raw value.
                        'formatted' => $formatted,
                    ];
                } else {
                    $record->{$field} = '';
                }
            }

            $records[$record->id] = $record;
        }
        $rs->close();

        return $records;
    }

    /**
     * Get all activity types.
     *
     * Paid content types that are not activated on this site are enforced here, because this is
     * the single list the editor chooser, the player payload, the report and the class allow
     * lists are all built from. Enforcement is deliberately shaped by the caller:
     *
     * - The player ($fromview) drops them entirely, so learners never see the interactions.
     * - The editor keeps them, flagged 'inactive', so a teacher's authored content does not
     *   silently vanish. They are marked 'hideonchooser' so no new ones can be added.
     *
     * @param bool $fromview from view.php
     * @return array
     */
    public static function get_all_activitytypes($fromview = false) {
        return self::build_activitytypes($fromview, true);
    }

    /**
     * The same list with activation NOT enforced.
     *
     * Kept separate rather than as an argument to get_all_activitytypes(), because mod_flexbook
     * overrides that method and adding a parameter breaks its signature.
     *
     * Only the grade and completion path uses this, so that deactivating a content type cannot
     * silently rebase everybody's existing grade. See get_enabled_type_names().
     *
     * @param bool $fromview from view.php
     * @return array
     */
    public static function get_all_activitytypes_unfiltered($fromview = false) {
        return self::build_activitytypes($fromview, false);
    }

    /**
     * Build the activity type list.
     *
     * @param bool $fromview from view.php
     * @param bool $enforceactivation Whether unactivated paid content types are enforced.
     * @return array
     */
    private static function build_activitytypes($fromview, $enforceactivation) {
        $subplugins = get_config('mod_interactivevideo', 'enablecontenttypes');
        $subplugins = explode(',', $subplugins);
        // If fromview, make sure to include ivplugin_chapter.
        if ($fromview && !in_array('ivplugin_chapter', $subplugins)) {
            $subplugins[] = 'ivplugin_chapter';
        }
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
                if (!isset($properties['preloadstrings'])) {
                    $properties['preloadstrings'] = true;
                }

                if ($enforceactivation && !\mod_interactivevideo\local\contenttype_activation::is_usable($subplugin['name'])) {
                    if ($fromview) {
                        // Learners must not be shown interactions of a type the site may not use.
                        continue;
                    }
                    // Authoring side: keep it visible so existing content is still accounted for,
                    // but locked. addcontenttype.mustache already skips hideonchooser entries.
                    $properties['inactive'] = true;
                    $properties['hideonchooser'] = true;
                }

                if ($fromview) { // Remove unneeded properties.
                    unset($properties['form']);
                    unset($properties['description']);
                    unset($properties['stringcomponent']);
                    unset($properties['initonreport']);
                    unset($properties['author']);
                    unset($properties['tutorial']);
                    unset($properties['pro']);
                }
                $contentoptions[] = $properties;
            }
        }

        // Make sure contentTypes do not have the same name key.
        $contentoptions = array_values(array_column($contentoptions, null, 'name'));
        return $contentoptions;
    }

    /**
     * Get activity types that have a specific property.
     *
     * @param string $propertyname The property to filter activity types by.
     * @param string $propertyvalue The value of the property.
     * @return array The filtered activity types.
     */
    public static function get_activitytypes_by_property($propertyname, $propertyvalue = true) {
        $alltypes = self::get_all_activitytypes();
        $activitytypes = [];
        foreach ($alltypes as $type) {
            if (isset($type[$propertyname]) && $type[$propertyname] == $propertyvalue) {
                $activitytypes[] = $type;
            }
        }
        return $activitytypes;
    }

    /**
     * Quick edit field.
     *
     * @param int $id
     * @param string $field
     * @param string $value
     * @param int $contextid
     * @param int $draftitemid
     * @return stdClass
     */
    public static function quick_edit_field($id, $field, $value, $contextid, $draftitemid = 0) {
        global $DB, $PAGE, $CFG;
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        // Editing an interaction of a deactivated content type is blocked the same way creating
        // one is; the editor shows these rows read only.
        $type = $DB->get_field('interactivevideo_items', 'type', ['id' => $id], MUST_EXIST);
        self::require_usable_type($type);
        if ($field == 'content') { // Inline annnotation contenttype.
            require_once($CFG->libdir . '/filelib.php');
            // Delete the old files before saving the new files.
            $fs = get_file_storage();
            $fs->delete_area_files($context->id, 'mod_interactivevideo', 'content', $id);
            if (!$draftitemid) {
                $draftitemid = file_get_submitted_draft_itemid('content');
            }
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
     * @param int $userid
     * @param int $annotationid
     * @param int $cmid
     * @param string $data
     * @param int $contextid
     * @param int $replace
     * @return mixed $record
     */
    public static function save_log($userid, $annotationid, $cmid, $data, $contextid, $replace) {
        global $DB;

        // Build the row from an allow list taken from the table itself rather than trusting
        // the decoded payload, which would otherwise set every column it is handed.
        $submitted = json_decode($data);
        $writable = array_diff(
            array_keys($DB->get_columns('interactivevideo_log')),
            ['id', 'userid', 'cmid', 'annotationid', 'timecreated', 'timemodified']
        );

        $record = new stdClass();
        foreach ($writable as $field) {
            if (isset($submitted->$field)) {
                $record->$field = $submitted->$field;
            }
        }

        // A completion record named by the client must belong to the same learner, or a log
        // could be attached to somebody else's progress.
        if (!empty($record->completionid)) {
            $owner = $DB->get_field('interactivevideo_completion', 'userid', ['id' => $record->completionid]);
            if ($owner === false || (int) $owner !== (int) $userid) {
                throw new \moodle_exception('nopermission', 'error');
            }
        }

        $record->userid = $userid;
        $record->annotationid = $annotationid;
        $record->cmid = $cmid;
        $record->timecreated = time();
        $record->timemodified = time();
        if ($replace) {
            $existingrecord = $DB->get_record('interactivevideo_log', ['userid' => $userid, 'annotationid' => $annotationid]);
            if ($existingrecord) {
                $record->id = $existingrecord->id;
                $record->timemodified = time();
                $DB->update_record('interactivevideo_log', $record);
            } else {
                $record->id = $DB->insert_record('interactivevideo_log', $record);
            }
        } else {
            $record->id = $DB->insert_record('interactivevideo_log', $record);
        }
        $record->formattedtimecreated = userdate($record->timecreated, get_string('strftimedatetime'));
        $record->formattedtimemodified = userdate($record->timemodified, get_string('strftimedatetime'));

        return $record;
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
     * Remap @@ANNOID# placeholders using an old-id => new-id map.
     *
     * @param string|null $text The text to remap.
     * @param array $annotationidmap Old annotation item id => new annotation item id.
     * @return string|null
     */
    public static function remap_annotation_placeholders($text, array $annotationidmap) {
        if ($text === null || $text === '') {
            return $text;
        }

        $search = '/@@ANNOID#([0-9]+)/';
        $text = preg_replace_callback($search, function ($matches) use ($annotationidmap) {
            $oldid = (int) $matches[1];
            if (isset($annotationidmap[$oldid])) {
                return '@@ANNOID#' . $annotationidmap[$oldid];
            }
            return $matches[0];
        }, $text);

        return $text;
    }

    /**
     * Remap @@ANNOID# placeholders in all text fields on an interaction item.
     *
     * @param stdClass $item The interaction item record.
     * @param array $annotationidmap Old annotation item id => new annotation item id.
     * @return stdClass
     */
    public static function remap_item_placeholders($item, array $annotationidmap) {
        foreach (['content', 'advanced', 'text1', 'text2', 'text3', 'char1', 'char2', 'char3'] as $field) {
            if (!empty($item->$field)) {
                $item->$field = self::remap_annotation_placeholders($item->$field, $annotationidmap);
            }
        }
        return $item;
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
        $userids = array_filter(array_map('intval', (array) $userids));
        if (empty($userids)) {
            return [];
        }
        [$insql, $params] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED, 'userid');
        $where = ["userid $insql"];
        if ($annotationid != 0) {
            $where[] = "annotationid = :annotationid";
            $params['annotationid'] = $annotationid;
        }
        if ($type) {
            $where[] = "char1 = :char1 AND cmid = :cmid";
            $params['char1'] = $type;
            $params['cmid'] = $cmid;
        }
        $sql = "SELECT * FROM {interactivevideo_log} WHERE " . implode(' AND ', $where) . " ORDER BY timecreated DESC";
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
        $idmap = [];
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
            $idmap[(int) $annotation->oldid] = (int) $annotation->id;
            $prop = json_decode($annotation->prop);
            $class = $prop->class ?? '';
            // Same constraint as the fragment callback: the class name comes from the
            // imported payload, so only a class a content type declares may be built.
            $allowed = array_column(self::get_usable_activitytypes(), 'class');
            if (in_array($class, $allowed, true) && class_exists($class)) {
                $contenttype = new $class($annotation);
                $annotation = $contenttype->copy($fromcourse, $tocourse, $fromcm, $tocm, $annotation, $oldcontextid);
            }
            $annotation->formattedtitle = format_string($annotation->title);
            $copied[] = $annotation;
        }

        if (count($idmap) > 1) {
            foreach ($idmap as $newid) {
                $item = $DB->get_record('interactivevideo_items', ['id' => $newid], '*', MUST_EXIST);
                $item = self::remap_item_placeholders($item, $idmap);
                $DB->update_record('interactivevideo_items', $item);
            }
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
        global $OUTPUT, $CFG, $PAGE, $USER, $DB;
        if (!$userid || $userid == 0) {
            $userid = $USER->id;
        }
        $context = \context::instance_by_id($contextid);
        $PAGE->set_context($context);
        // Get completion information.
        $completion = '';
        $cminfo = get_fast_modinfo($courseid);
        $cm = $cminfo->get_cm($cmid);

        if (!$cm) {
            return [];
        }

        if ($cm->completion == COMPLETION_TRACKING_NONE) {
            return [
                'overallcompletion' => 0,
                'completion' => '',
            ];
        }

        $completiondetails = \core_completion\cm_completion_details::get_instance($cm, $userid);
        $response = [
            'overallcompletion' => $completiondetails->get_overall_completion() == COMPLETION_COMPLETE ? 1 : 0,
        ];

        // If moodle version is 4.4 or below, use a different completion information.
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
     * @param int $courseid Ignored; resolved from the record's course module.
     * @param int $cmid Ignored; resolved from the record's course module.
     * @return string The result of the deletion.
     */
    public static function delete_progress_by_id($contextid, $recordid, $courseid, $cmid) {
        global $DB, $CFG;

        // Confirm the record belongs to this activity before anything is removed. Ownership
        // for self-service deletes is asserted by the caller, which knows whose request it is.
        [$record, $cm] = self::get_owned_completion_record(
            $recordid,
            \context::instance_by_id($contextid)
        );
        $courseid = $cm->course;

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

        // The record's own owner is authoritative; logs only add users if any exist.
        $userids = array_column($logs, 'userid');
        $userids[] = $record->userid;
        $userids = array_values(array_unique($userids));

        // Update completion state.
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

        $recordids = array_values(array_filter(array_map('intval', (array) $recordids)));
        if (empty($recordids)) {
            return 'deleted';
        }

        // Validate every record before removing any of them, so a batch containing one
        // record the caller may not touch cannot destroy the rest on its way to failing.
        $context = \context::instance_by_id($contextid);
        $owners = [];
        $cm = null;
        foreach ($recordids as $recordid) {
            [$record, $cm] = self::get_owned_completion_record($recordid, $context);
            $owners[] = $record->userid;
        }
        $courseid = $cm->course;

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
        require_once($CFG->libdir . '/completionlib.php');
        if ($cm->completion == COMPLETION_TRACKING_AUTOMATIC) {
            $course = new stdClass();
            $course->id = $courseid;
            $completion = new completion_info($course);
            $userids = array_merge(array_column($logs, 'userid'), $owners);
            $userids = array_values(array_unique($userids));
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

    /**
     * Download annotations as zip file.
     *
     * @param string $annotations The annotations to download.
     * @param int $cmid The course module ID.
     * @param int $courseid The course ID.
     * @param int $contextid The context ID.
     * @return string The URL to download the annotations.
     */
    public static function download_annotations($annotations, $cmid, $courseid, $contextid) {
        global $USER, $CFG;
        $fs = get_file_storage();
        // First create a json file with the annotations in draft area.
        $usercontext = \context_user::instance($USER->id);
        $coursecontextid = context_course::instance($courseid)->id;
        $annotations = json_decode($annotations);
        $annotations = array_map(function ($annotation) use ($contextid, $fs, $coursecontextid) {
            $annotation = (object) $annotation;
            $annotation->files = [];
            $files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'content', $annotation->id, false, false);
            foreach ($files as $file) {
                if ($file->get_filename() == '.') {
                    continue;
                }
                $annotation->files[] = [
                    'filename' => $file->get_filename(),
                    'formattedfilename' => '$$' . $file->get_itemid() . '$$' . $file->get_filename(),
                    'itemid' => $file->get_itemid(),
                    'file' => $file,
                    'area' => 'content',
                ];
            }

            $text1files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext1', $annotation->id, 'id ASC', false);
            foreach ($text1files as $file) {
                if ($file->get_filename() == '.') {
                    continue;
                }
                $annotation->files[] = [
                    'filename' => $file->get_filename(),
                    'formattedfilename' => '$$' . $file->get_itemid() . '$$' . $file->get_filename(),
                    'itemid' => $file->get_itemid(),
                    'file' => $file,
                    'area' => 'itext1',
                ];
            }

            $text2files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext2', $annotation->id, 'id ASC', false);
            foreach ($text2files as $file) {
                if ($file->get_filename() == '.') {
                    continue;
                }
                $annotation->files[] = [
                    'filename' => $file->get_filename(),
                    'formattedfilename' => '$$' . $file->get_itemid() . '$$' . $file->get_filename(),
                    'itemid' => $file->get_itemid(),
                    'file' => $file,
                    'area' => 'itext2',
                ];
            }

            $text3files = $fs->get_area_files($contextid, 'mod_interactivevideo', 'itext3', $annotation->id, 'id ASC', false);
            foreach ($text3files as $file) {
                if ($file->get_filename() == '.') {
                    continue;
                }
                $annotation->files[] = [
                    'filename' => $file->get_filename(),
                    'formattedfilename' => '$$' . $file->get_itemid() . '$$' . $file->get_filename(),
                    'itemid' => $file->get_itemid(),
                    'file' => $file,
                    'area' => 'itext3',
                ];
            }

            // Handle contentbank items.
            if ($annotation->type == 'contentbank') {
                $contentid = $annotation->contentid;
                // File is in contentbank.
                $contentbankfiles = $fs->get_area_files($coursecontextid, 'contentbank', 'public', $contentid);
                foreach ($contentbankfiles as $file) {
                    if ($file->get_filename() == '.') {
                        continue;
                    }
                    $annotation->files[] = [
                        'filename' => $file->get_filename(),
                        'formattedfilename' => '$$' . $file->get_itemid() . '$$' . $file->get_filename(),
                        'itemid' => $file->get_itemid(),
                        'file' => $file,
                    ];
                }
            }
            return $annotation;
        }, $annotations);

        // Prep files for packaging.
        $files = array_map(function ($annotation) {
            $array = $annotation->files;
            $array = array_map(function ($file) {
                return $file['file'];
            }, $array);
            return $array;
        }, $annotations);

        $files = array_merge(...$files);

        // Get an unused draft item id.
        $draftitemid = file_get_unused_draft_itemid();
        $fileinfo = [
            'contextid' => $usercontext->id,
            'component' => 'user',
            'filearea'  => 'draft',
            'itemid'    => $draftitemid,
            'filepath'  => '/',
            'filename'  => 'annotations.json',
        ];

        $fs->delete_area_files($usercontext->id, 'user', 'draft', $draftitemid);
        $fs->create_file_from_string($fileinfo, json_encode($annotations));
        $jsonfile = $fs->get_file($usercontext->id, 'user', 'draft', $draftitemid, '/', 'annotations.json');

        $zipper = new zip_packer();
        $tempzip = tempnam($CFG->tempdir, $cmid) . '.ivz';

        $archieved = [];
        foreach ($files as $file) {
            $name = $file->get_filename();
            $name = '$$' . $file->get_itemid() . '$$' . $name;
            $name = clean_param($name, PARAM_FILE);
            $archieved[$name] = $file;
        }
        // Also add the json file to the zip.
        $archieved['annotations.json'] = $jsonfile;
        $zipper->archive_to_pathname($archieved, $tempzip);

        $draftitemid = file_get_unused_draft_itemid();
        $fileinfo = [
            'contextid' => $usercontext->id,
            'component' => 'user',
            'filearea'  => 'draft',
            'itemid'    => $draftitemid,
            'filepath'  => '/',
            'filename'  => $cmid . '.ivz',
        ];

        // Save the zip file in the user's draft area.
        $fs->delete_area_files($usercontext->id, 'user', 'draft', $draftitemid);
        $fs->create_file_from_pathname($fileinfo, $tempzip);

        // Generate a download link to the stored draft file.
        $url = moodle_url::make_draftfile_url($draftitemid, '/', $cmid . '.ivz');

        return $url->out(false);
    }

    /**
     * Save defaults for interactive video.
     *
     * @param array $defaults The defaults to save.
     * @return stdClass The record of the saved defaults.
     */
    public static function save_defaults($defaults) {
        global $DB;
        $saved = [];
        // Validate the defaults array.
        if (!is_array($defaults) || empty($defaults)) {
            throw new \moodle_exception('invaliddefaults', 'mod_interactivevideo');
        }
        foreach ($defaults as $default) {
            $default = (object) $default;
            $default->timecreated = time();
            $default->timemodified = time();
            // Check if the default already exists using type and courseid.
            $existingrecord = $DB->get_record(
                'interactivevideo_defaults',
                [
                    'type' => $default->type,
                    'courseid' => $default->courseid,
                ],
                'id',
                IGNORE_MISSING
            );
            if ($existingrecord) {
                // Update the existing record.
                $default->id = $existingrecord->id;
                $DB->update_record('interactivevideo_defaults', $default);
            } else {
                // Insert a new record.
                $default->id = $DB->insert_record('interactivevideo_defaults', $default);
            }

            $saved[] = $default;
        }
        // Return the last saved default.
        return $saved;
    }

    /**
     * Get all saved interaction-type defaults for a course.
     *
     * @param int $courseid The course ID.
     * @return array The default records ordered by type.
     */
    public static function get_course_defaults($courseid) {
        global $DB;
        return array_values($DB->get_records('interactivevideo_defaults', ['courseid' => $courseid], 'type ASC'));
    }

    /**
     * Delete a saved interaction-type default for a course.
     *
     * @param int $courseid The course ID.
     * @param string $type The interaction type.
     * @return void
     */
    public static function delete_default($courseid, $type) {
        global $DB;
        $DB->delete_records('interactivevideo_defaults', ['courseid' => $courseid, 'type' => $type]);
    }

    /**
     * Delete completion data for a given itemid and userid.
     *
     * @param int $id The completion id.
     * @param int $itemid The item id.
     * @param int $userid The user id.
     * @param int $contextid The context id.
     * @return string
     */
    public static function delete_completion_data($id, $itemid, $userid, $contextid) {
        global $DB;

        // Confirm the record belongs to this activity before rewriting it. Ownership for
        // self-service calls is asserted by the caller, which knows whose request it is.
        [$completion] = self::get_owned_completion_record(
            $id,
            \context::instance_by_id($contextid)
        );
        // The logs removed below are keyed on the record's owner, not on a request value.
        $userid = $completion->userid;

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
            return json_encode(['id' => $id, 'itemid' => $itemid]);
        } else {
            return json_encode(['error' => 'Completion record not found']);
        }
    }

    /**
     * Override the earned XP of a single completed interaction for a user.
     *
     * Recalculates the row total XP and the gradebook grade, and keeps the
     * per-item percent and reportView in sync so the learner view reflects the
     * overridden value on revisit.
     *
     * @param int $id The completion record id.
     * @param int $itemid The interaction item id.
     * @param int $userid The user id.
     * @param int $contextid The module context id.
     * @param float $newxp The overridden earned XP (0..item max).
     * @param int $courseid The course id.
     * @param string|null $reportview Client-built reportView (optional).
     * @return string JSON-encoded result.
     */
    public static function override_completion_xp($id, $itemid, $userid, $contextid, $newxp, $courseid = 0, $reportview = null) {
        global $DB, $CFG;

        $context = context::instance_by_id($contextid);
        require_capability('mod/interactivevideo:editreport', $context);

        $record = $DB->get_record('interactivevideo_completion', ['id' => $id]);
        if (!$record) {
            return json_encode(['error' => 'Completion record not found']);
        }
        $userid = $record->userid;
        $cmid = $record->cmid;

        // Gradable items for this activity (cmid here is the module instance id). Only
        // reachable ones count, matching how the learner's own grade is calculated.
        $items = self::get_reachable_gradable_items($cmid, $contextid);
        $itemmaxmap = [];
        $totalmax = 0;
        foreach ($items as $item) {
            $itemmaxmap[(string)$item->id] = (float)$item->xp;
            $totalmax += (float)$item->xp;
        }

        if (!isset($itemmaxmap[(string)$itemid])) {
            return json_encode(['error' => 'Interaction not found or not gradable']);
        }
        $itemmax = $itemmaxmap[(string)$itemid];

        // Validate bounds: 0..item max.
        $newxp = (float)$newxp;
        if ($newxp < 0 || ($itemmax > 0 && $newxp > $itemmax) || ($itemmax <= 0 && $newxp != 0)) {
            return json_encode(['error' => 'invalidxpvalue']);
        }

        $completeditems = json_decode($record->completeditems);
        if (!is_array($completeditems)) {
            $completeditems = [];
        }
        if (!in_array((string)$itemid, array_map('strval', $completeditems), true)) {
            return json_encode(['error' => 'Interaction not completed']);
        }

        $rawdetails = json_decode($record->completiondetails);
        if (!is_array($rawdetails)) {
            $rawdetails = [];
        }

        $found = false;
        $updateditemdetail = null;
        $rawdetails = array_map(function ($entry) use ($itemid, $itemmax, $newxp, $reportview, &$found, &$updateditemdetail) {
            $decoded = json_decode($entry);
            if ($decoded && isset($decoded->id) && $decoded->id == $itemid && empty($decoded->deleted)) {
                $decoded->xp = $newxp;
                $decoded->percent = $itemmax > 0 ? ($newxp / $itemmax) : 0;
                $decoded->xpOverridden = true;
                if (isset($decoded->reportView)) {
                    if ($reportview !== null && $reportview !== '') {
                        $clean = clean_param($reportview, PARAM_RAW);
                        if ($clean !== '' && strlen($clean) <= 4096) {
                            $decoded->reportView = $clean;
                        } else {
                            $decoded->reportView = \mod_interactivevideo\report_helper::patch_report_view_xp(
                                $decoded->reportView,
                                $newxp
                            );
                        }
                    } else {
                        $decoded->reportView = \mod_interactivevideo\report_helper::patch_report_view_xp(
                            $decoded->reportView,
                            $newxp
                        );
                    }
                }
                $found = true;
                $updateditemdetail = $decoded;
            }
            return json_encode($decoded);
        }, $rawdetails);

        if (!$found) {
            return json_encode(['error' => 'Interaction completion not found']);
        }

        $record->completiondetails = json_encode(array_values($rawdetails));

        // Re-sum earned XP from the updated, non-deleted, completed details.
        $decodeddetails = array_map(fn($entry) => json_decode($entry), $rawdetails);
        $earned = \mod_interactivevideo\report_helper::sum_earned_xp($decodeddetails, $completeditems);
        $record->xp = $earned;

        $DB->update_record('interactivevideo_completion', $record);

        // Recalculate and update the gradebook grade.
        require_once($CFG->libdir . '/gradelib.php');
        if (!$courseid) {
            $cm = get_coursemodule_from_instance('interactivevideo', $cmid);
            $courseid = $cm->course;
        }
        $grade = null;
        $gradeitem = \grade_item::fetch([
            'iteminstance' => $cmid,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'courseid' => $courseid,
        ]);
        if ($gradeitem) {
            $grade = \mod_interactivevideo\report_helper::calculate_grade($earned, $totalmax, (float)$gradeitem->grademax);
            $gradeobj = new stdClass();
            $gradeobj->userid = $userid;
            $gradeobj->rawgrade = ($grade === null || $grade <= 0) ? null : $grade;
            grade_update('mod/interactivevideo', $courseid, 'mod', 'interactivevideo', $cmid, 0, $gradeobj);
        }

        return json_encode([
            'id' => $id,
            'itemid' => $itemid,
            'xp' => $earned,
            'itemxp' => $newxp,
            'completiondetails' => $record->completiondetails,
            'itemdetail' => $updateditemdetail,
            'grade' => $grade,
        ]);
    }
}
