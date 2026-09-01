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

namespace mod_interactivevideo\local;

/**
 * Brings the gradebook back into step after an activity's grade setting changes.
 *
 * Two situations need handling, and they are deliberately different:
 *
 * - Grading is switched on. No grade item existed, so nobody has a grade even though
 *   learners may already have earned XP. Their grades are computed from the stored
 *   completion records.
 * - The grade maximum changes. Existing grades are rescaled to keep each learner's
 *   percentage, rather than recomputed from XP. Recomputing would fold in any interaction
 *   added since the grade was awarded, which must not affect a learner until they next
 *   attempt the activity. Note that core leaves a manually overridden grade at its absolute
 *   value rather than scaling it, on the basis that an override is the teacher's explicit
 *   final grade; a recomputation would have discarded such an override altogether.
 *
 * A change to the interactions themselves is deliberately not handled here at all: those
 * take effect when the learner next saves progress.
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class grade_sync {
    /** @var string Compute grades from completion records for everyone with progress. */
    public const MODE_BACKFILL = 'backfill';

    /** @var string Rescale existing grades to a new maximum, keeping percentages. */
    public const MODE_RESCALE = 'rescale';

    /**
     * Queue a grade sync to run out of band.
     *
     * Grading changes can touch every learner with a completion record, which is too much
     * work to do while an editing form is being saved.
     *
     * @param int $instanceid The interactivevideo instance id.
     * @param string $mode One of the MODE_* constants.
     * @param float $oldmax Previous grade maximum, for a rescale.
     * @param float $newmax New grade maximum, for a rescale.
     */
    public static function queue(int $instanceid, string $mode, float $oldmax = 0, float $newmax = 0): void {
        $task = new \mod_interactivevideo\task\sync_grades();
        $task->set_custom_data([
            'instanceid' => $instanceid,
            'mode' => $mode,
            'oldmax' => $oldmax,
            'newmax' => $newmax,
        ]);
        $task->set_component('mod_interactivevideo');

        \core\task\manager::queue_adhoc_task($task, true);
    }

    /**
     * Perform a queued grade sync.
     *
     * @param int $instanceid The interactivevideo instance id.
     * @param string $mode One of the MODE_* constants.
     * @param float $oldmax Previous grade maximum.
     * @param float $newmax New grade maximum.
     */
    public static function run(int $instanceid, string $mode, float $oldmax = 0, float $newmax = 0): void {
        global $CFG, $DB;
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
        require_once($CFG->libdir . '/gradelib.php');

        $instance = $DB->get_record('interactivevideo', ['id' => $instanceid]);
        if (!$instance) {
            return;
        }

        if ($mode === self::MODE_BACKFILL) {
            interactivevideo_update_grades($instance);
            return;
        }

        if ($mode === self::MODE_RESCALE) {
            $gradeitem = \grade_item::fetch([
                'iteminstance' => $instanceid,
                'itemtype' => 'mod',
                'itemmodule' => 'interactivevideo',
                'courseid' => $instance->course,
            ]);
            if (!$gradeitem) {
                return;
            }
            // The item already carries the new maximum by this point; core rescales each
            // grade_grades row from the old bounds to the new ones, overrides included.
            $gradeitem->rescale_grades_keep_percentage(0, $oldmax, 0, $newmax, 'mod/interactivevideo');
        }
    }
}
