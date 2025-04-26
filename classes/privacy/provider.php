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

namespace mod_interactivevideo\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\helper;
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use stdClass;

/**
 * Privacy API implementation for the Interactive Video activity.
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider {

    /**
     * Returns metadata about this plugin's privacy data.
     *
     * @param collection $collection The collection to add metadata to.
     * @return collection The updated collection of metadata.
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table("interactivevideo_completion", [
            "userid" => "privacy:metadata:userid",
            "timecreated" => "privacy:metadata:timecreated",
            "timecompleted" => "privacy:metadata:timecompleted",
            "timeended" => "privacy:metadata:timeended",
            "xp" => "privacy:metadata:xp",
            "completeditems" => "privacy:metadata:completeditems",
            "completionpercentage" => "privacy:metadata:completionpercentage",
            "completiondetails" => "privacy:metadata:completiondetails",
        ], "privacy:metadata:interactivevideo_completion");

        $collection->add_database_table("interactivevideo_log", [
            "userid" => "privacy:metadata:userid",
            "timecreated" => "privacy:metadata:timecreated",
            "timemodified" => "privacy:metadata:timemodified",
            "completionid" => "privacy:metadata:completionid",
            "attachments" => "privacy:metadata:attachments",
            "intg1" => "privacy:metadata:intg1",
            "intg2" => "privacy:metadata:intg2",
            "intg3" => "privacy:metadata:intg3",
            "char1" => "privacy:metadata:char1",
            "char2" => "privacy:metadata:char2",
            "char3" => "privacy:metadata:char3",
            "text1" => "privacy:metadata:text1",
            "text2" => "privacy:metadata:text2",
            "text3" => "privacy:metadata:text3",
        ], "privacy:metadata:interactivevideo_log");

        return $collection;
    }

    /**
     * Get the list of contexts that contain user information for the specified user.
     *
     * @param int $userid The user ID.
     * @return contextlist The list of contexts containing user information.
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();

        $params = [
            'userid' => $userid,
            'modname' => 'interactivevideo',
            'contextlevel' => CONTEXT_MODULE,
        ];

        // Completion data.
        $sql = "SELECT ctx.id
                FROM {context} ctx
                JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
                JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_completion} ivc ON ivc.cmid = iv.id
                WHERE ivc.userid = :userid";

        $contextlist->add_from_sql($sql, $params);

        // Log data.
        $sql = "SELECT ctx.id
                FROM {context} ctx
                JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
                JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_log} ivc ON ivc.cmid = iv.id
                WHERE ivc.userid = :userid";
        $contextlist->add_from_sql($sql, $params);

        return $contextlist;
    }

    /**
     * Get the list of users in the specified context.
     *
     * @param userlist $userlist The user list to add users to.
     */
    public static function get_users_in_context(userlist $userlist) {
        $context = $userlist->get_context();
        if (!is_a($context, \context_module::class)) {
            return;
        }

        $params = [
            'instanceid'    => $context->instanceid,
            'modulename'    => 'interactivevideo',
        ];

        $sql = "SELECT d.userid
                FROM {course_modules} cm
                JOIN {modules} m ON m.id = cm.module AND m.name = :modulename
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_completion} d ON d.cmid = iv.id
                WHERE cm.id = :instanceid";
        $userlist->add_from_sql("userid", $sql, $params);

        $sql = "SELECT d.userid
                FROM {course_modules} cm
                JOIN {modules} m ON m.id = cm.module AND m.name = :modulename
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_log} d ON d.cmid = iv.id
                WHERE cm.id = :instanceid";
        $userlist->add_from_sql("userid", $sql, $params);
    }

    /**
     * Export all user data for the specified contextlist.
     *
     * @param approved_contextlist $contextlist The approved contextlist.
     */
    public static function export_user_data(approved_contextlist $contextlist) {
        global $DB;

        // Remove contexts different from CONTEXT_MODULE.
        $contexts = array_reduce($contextlist->get_contexts(), function ($carry, $context) {
            if ($context->contextlevel == CONTEXT_MODULE) {
                $carry[] = $context->id;
            }
            return $carry;
        }, []);

        if (empty($contexts)) {
            return;
        }

        $user = $contextlist->get_user();
        $userid = $user->id;

        // Get Interactive Video data.
        foreach ($contexts as $contextid) {
            $context = \context::instance_by_id($contextid);
            $data = helper::get_context_data($context, $user);
            writer::with_context($context)->export_data([], $data);
            helper::export_context_files($context, $user);
        }

        list($insql, $inparams) = $DB->get_in_or_equal($contexts, SQL_PARAMS_NAMED);

        // Export completion data.
        $sql = "SELECT c.id AS contextid, ivc.*
                FROM {context} c
                JOIN {course_modules} cm ON cm.id = c.instanceid
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_completion} ivc ON ivc.cmid = iv.id
                WHERE ivc.userid = :userid AND
                    c.id $insql";
        $params = array_merge($inparams, ['userid' => $userid]);

        $alldata = [];
        $completiondata = $DB->get_recordset_sql($sql, $params);
        foreach ($completiondata as $data) {
            $alldata[$data->contextid][] = (object)[
                'contextid' => $data->contextid,
                'component' => 'mod_interactivevideo',
                'itemid' => $data->id,
                'data' => [
                    'userid' => $data->userid,
                    'timecreated' => transform::datetime($data->timecreated),
                    'timecompleted' => transform::datetime($data->timecompleted),
                    'timeended' => transform::datetime($data->timeended),
                    'xp' => $data->xp,
                    'completeditems' => $data->completeditems,
                    'completionpercentage' => $data->completionpercentage,
                    'completiondetails' => $data->completiondetails,
                ],
            ];
        }
        $completiondata->close();

        array_walk($alldata, function ($comdata, $contextid) {
            $context = \context::instance_by_id($contextid);
            writer::with_context($context)->export_data(['completion'], (object)[
                'completion' => $comdata,
            ]);
        });

        // Export log data.
        $sql = "SELECT c.id AS contextid, ivl.*
                FROM {context} c
                JOIN {course_modules} cm ON cm.id = c.instanceid
                JOIN {interactivevideo} iv ON iv.id = cm.instance
                JOIN {interactivevideo_log} ivl ON ivl.cmid = iv.id
                WHERE ivl.userid = :userid AND
                    c.id $insql";
        $params = array_merge($inparams, ['userid' => $userid]);

        $alldata = [];
        $logdata = $DB->get_recordset_sql($sql, $params);
        foreach ($logdata as $data) {
            $alldata[$data->contextid][] = (object)[
                'contextid' => $data->contextid,
                'component' => 'mod_interactivevideo',
                'itemid' => $data->id,
                'data' => [
                    'userid' => $data->userid,
                    'timecreated' => transform::datetime($data->timecreated),
                    'timemodified' => transform::datetime($data->timemodified),
                    'completionid' => $data->completionid,
                    'attachments' => $data->attachments,
                    'intg1' => $data->intg1,
                    'intg2' => $data->intg2,
                    'intg3' => $data->intg3,
                    'char1' => $data->char1,
                    'char2' => $data->char2,
                    'char3' => $data->char3,
                    'text1' => $data->text1,
                    'text2' => $data->text2,
                    'text3' => $data->text3,
                ],
            ];
        }
        $logdata->close();

        array_walk($alldata, function ($logdata, $contextid) {
            $context = \context::instance_by_id($contextid);
            writer::with_context($context)->export_data([
                'log',
            ], (object)[
                'log' => $logdata,
            ]);
        });
    }

    /**
     * Delete all user data for the specified context.
     *
     * @param \context $context The context to delete data for.
     */
    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;

        $params = [
            'contextid' => $context->id,
        ];

        $sql = "SELECT ivc.id
                FROM {interactivevideo_completion} ivc
                JOIN {interactivevideo} iv ON iv.id = ivc.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE c.id = :contextid";
        $completionids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($completionids)) {
            $DB->delete_records_list('interactivevideo_completion', 'id', $completionids);
        }

        $sql = "SELECT ivl.id
                FROM {interactivevideo_log} ivl
                JOIN {interactivevideo} iv ON iv.id = ivl.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE c.id = :contextid";
        $logids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($logids)) {
            $DB->delete_records_list('interactivevideo_log', 'id', $logids);
        }
    }

    /**
     * Delete data for users in the approved user list.
     *
     * @param approved_userlist $userlist The approved user list.
     */
    public static function delete_data_for_users(approved_userlist $userlist) {
        global $DB;

        $context = $userlist->get_context();
        if (!is_a($context, \context_module::class)) {
            return;
        }

        $userids = $userlist->get_userids();
        list($insql, $inparams) = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);

        $sql = "SELECT ivc.id
                FROM {interactivevideo_completion} ivc
                JOIN {interactivevideo} iv ON iv.id = ivc.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE ivc.userid $insql AND c.id = :contextid";
        $params = array_merge($inparams, ['contextid' => $context->id]);
        $completionids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($completionids)) {
            $DB->delete_records_list('interactivevideo_completion', 'id', $completionids);
        }

        $sql = "SELECT ivl.id
                FROM {interactivevideo_log} ivl
                JOIN {interactivevideo} iv ON iv.id = ivl.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE ivl.userid $insql AND c.id = :contextid";
        $logids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($logids)) {
            $DB->delete_records_list('interactivevideo_log', 'id', $logids);
        }
    }

    /**
     * Delete all user data for the specified contextlist.
     *
     * @param approved_contextlist $contextlist The approved contextlist.
     */
    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;

        // Remove contexts different from COURSE_MODULE.
        $contextids = array_reduce($contextlist->get_contexts(), function ($carry, $context) {
            if ($context->contextlevel == CONTEXT_MODULE) {
                $carry[] = $context->id;
            }
            return $carry;
        }, []);

        if (empty($contextids)) {
            return;
        }
        $userid = $contextlist->get_user()->id;
        // Prepare SQL to gather all completed IDs.
        list($insql, $inparams) = $DB->get_in_or_equal($contextids, SQL_PARAMS_NAMED);
        // Delete completion data.
        $sql = "SELECT ivc.id
                FROM {interactivevideo_completion} ivc
                JOIN {interactivevideo} iv ON iv.id = ivc.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE ivc.userid = :userid AND c.id $insql";
        $params = array_merge($inparams, ['userid' => $userid]);
        $completionids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($completionids)) {
            $DB->delete_records_list('interactivevideo_completion', 'id', $completionids);
        }

        // Delete log data.
        $sql = "SELECT ivl.id
                FROM {interactivevideo_log} ivl
                JOIN {interactivevideo} iv ON iv.id = ivl.cmid
                JOIN {course_modules} cm ON cm.instance = iv.id
                JOIN {context} c ON c.instanceid = cm.id
                WHERE ivl.userid = :userid AND c.id $insql";
        $params = array_merge($inparams, ['userid' => $userid]);
        $logids = $DB->get_fieldset_sql($sql, $params);
        if (!empty($logids)) {
            $DB->delete_records_list('interactivevideo_log', 'id', $logids);
        }
    }
}
