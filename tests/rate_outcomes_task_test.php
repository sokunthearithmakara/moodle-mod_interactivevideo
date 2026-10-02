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

namespace mod_interactivevideo;

use mod_interactivevideo\local\outcome_mapping;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
require_once($CFG->libdir . '/gradelib.php');

/**
 * A mapping change re-rates everyone with progress, out of band.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\task\rate_outcomes
 * @covers     \mod_interactivevideo\local\outcome_mapping::rate_all
 * @covers     \mod_interactivevideo\local\outcome_mapping::queue_backfill_if_changed
 * @covers     \mod_interactivevideo\local\outcome_source
 */
final class rate_outcomes_task_test extends \advanced_testcase {
    /** @var string */
    private const TASK = '\mod_interactivevideo\task\rate_outcomes';

    /** @var \stdClass */
    private $course;

    /** @var \stdClass */
    private $instance;

    /** @var \stdClass The outcome grade item record. */
    private $outcomeitem;

    /** @var int */
    private $outcomeid;

    /**
     * A course, an activity with an outcome, and outcomes enabled.
     */
    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest();
        $this->setAdminUser();
        set_config('enableoutcomes', 1);

        $generator = $this->getDataGenerator();
        $this->course = $generator->create_course();
        $this->instance = $generator->get_plugin_generator('mod_interactivevideo')
            ->create_instance(['course' => $this->course->id]);

        $scale = $generator->create_scale(['scale' => 'Low,Mid,High', 'courseid' => $this->course->id]);
        $outcome = $generator->create_grade_outcome([
            'courseid' => $this->course->id,
            'shortname' => 'o1',
            'fullname' => 'Outcome 1',
            'scaleid' => $scale->id,
        ]);
        $this->outcomeid = (int) $outcome->id;
        $this->outcomeitem = $generator->create_grade_item([
            'courseid' => $this->course->id,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'iteminstance' => $this->instance->id,
            'itemnumber' => 1000,
            'itemname' => $outcome->fullname,
            'outcomeid' => $outcome->id,
        ]);
    }

    /**
     * Insert a completion record directly, as if the learner attempted before any mapping existed.
     *
     * @param \stdClass $user
     * @param array $details Interaction id => xp earned out of 10.
     * @return int The record id.
     */
    private function seed_progress(\stdClass $user, array $details): int {
        global $DB;
        $encoded = [];
        foreach ($details as $itemid => $xp) {
            $encoded[] = json_encode(['id' => $itemid, 'xp' => $xp, 'percent' => $xp / 10]);
        }
        return $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $this->instance->id,
            'userid' => $user->id,
            'timecreated' => time(),
            'timecompleted' => 0,
            'completeditems' => json_encode(array_map('strval', array_keys($details))),
            'completionpercentage' => 100,
            'completiondetails' => json_encode($encoded),
            'xp' => array_sum($details),
        ]);
    }

    /**
     * A user's rating on the outcome item.
     *
     * @param \stdClass $user
     * @return int|null
     */
    private function rating(\stdClass $user): ?int {
        global $DB;
        $final = $DB->get_field('grade_grades', 'finalgrade', ['itemid' => $this->outcomeitem->id, 'userid' => $user->id]);
        return ($final === false || $final === null) ? null : (int) $final;
    }

    /**
     * The mapping stored on an interaction, as an advanced JSON string.
     *
     * @param array $entry
     * @return string
     */
    private function advanced(array $entry): string {
        return json_encode(['autolaunch' => 1, 'outcomes' => [$this->outcomeid => $entry]]);
    }

    /**
     * Only a real change queues a pass, and repeated changes share one.
     */
    public function test_queue_backfill_if_changed(): void {
        global $DB;
        $score = ['mode' => 'score', 'thresholds' => [0, 51, 86]];
        $mapping = [$this->outcomeid => $score];

        // New interaction without a mapping: nothing to do.
        $this->assertFalse(outcome_mapping::queue_backfill_if_changed('interactivevideo', $this->instance->id, null, []));
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => self::TASK]));

        // New interaction with a mapping.
        $this->assertTrue(outcome_mapping::queue_backfill_if_changed('interactivevideo', $this->instance->id, null, $mapping));
        $this->assertSame(1, $DB->count_records('task_adhoc', ['classname' => self::TASK]));

        // Same mapping saved again: no change, and the pass already queued is reused anyway.
        $stored = $this->advanced($score);
        $this->assertFalse(
            outcome_mapping::queue_backfill_if_changed('interactivevideo', $this->instance->id, $stored, $mapping, 10, 10)
        );
        outcome_mapping::queue_backfill('interactivevideo', $this->instance->id);
        $this->assertSame(1, $DB->count_records('task_adhoc', ['classname' => self::TASK]));

        // A weight change on a mapped interaction counts.
        $this->assertTrue(
            outcome_mapping::queue_backfill_if_changed('interactivevideo', $this->instance->id, $stored, $mapping, 10, 20)
        );
        // Removing the mapping counts too.
        $this->assertTrue(outcome_mapping::queue_backfill_if_changed('interactivevideo', $this->instance->id, $stored, []));

        // Outcomes disabled: never queue.
        set_config('enableoutcomes', 0);
        $DB->delete_records('task_adhoc', ['classname' => self::TASK]);
        outcome_mapping::queue_backfill('interactivevideo', $this->instance->id);
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => self::TASK]));
    }

    /**
     * The pass rates every learner with progress from the current mapping.
     */
    public function test_rate_all_rates_existing_progress(): void {
        $generator = $this->getDataGenerator();
        $ivgenerator = $generator->get_plugin_generator('mod_interactivevideo');
        $high = $generator->create_and_enrol($this->course, 'student');
        $low = $generator->create_and_enrol($this->course, 'student');
        $none = $generator->create_and_enrol($this->course, 'student');

        $item = $ivgenerator->create_item($this->instance, [
            'xp' => 10,
            'completiontracking' => 'complete',
            'advanced' => $this->advanced(['mode' => 'score', 'thresholds' => [0, 51, 86]]),
        ]);
        $this->seed_progress($high, [$item->id => 9]);
        $this->seed_progress($low, [$item->id => 3]);

        outcome_mapping::queue_backfill('interactivevideo', $this->instance->id);
        $this->runAdhocTasks(self::TASK);

        $this->assertSame(3, $this->rating($high));
        $this->assertSame(1, $this->rating($low));
        $this->assertNull($this->rating($none));

        // Thresholds tightened: the same progress now rates lower.
        global $DB;
        $DB->set_field('interactivevideo_items', 'advanced', $this->advanced([
            'mode' => 'score', 'thresholds' => [0, 95, 99],
        ]), ['id' => $item->id]);
        outcome_mapping::queue_backfill('interactivevideo', $this->instance->id);
        $this->runAdhocTasks(self::TASK);

        $this->assertSame(1, $this->rating($high));
        $this->assertSame(1, $this->rating($low));
    }

    /**
     * Interactions the learner cannot reach do not count, exactly as for the activity grade.
     */
    public function test_rate_all_ignores_unreachable_items(): void {
        $generator = $this->getDataGenerator();
        $ivgenerator = $generator->get_plugin_generator('mod_interactivevideo');
        $student = $generator->create_and_enrol($this->course, 'student');

        $score = ['mode' => 'score', 'thresholds' => [0, 51, 86]];
        $reachable = $ivgenerator->create_item($this->instance, [
            'xp' => 10, 'completiontracking' => 'complete', 'advanced' => $this->advanced($score),
        ]);
        // The instance is trimmed to 60 seconds; this one sits beyond it.
        $beyond = $ivgenerator->create_item($this->instance, [
            'xp' => 10, 'completiontracking' => 'complete', 'timestamp' => 120, 'advanced' => $this->advanced($score),
        ]);
        $this->seed_progress($student, [$reachable->id => 3, $beyond->id => 10]);

        outcome_mapping::rate_all('interactivevideo', $this->instance->id);
        $this->assertSame(1, $this->rating($student));
    }

    /**
     * A pass over an activity that no longer exists, or has nothing mapped, does nothing.
     */
    public function test_rate_all_is_harmless_without_work(): void {
        global $DB;
        $student = $this->getDataGenerator()->create_and_enrol($this->course, 'student');
        $item = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')
            ->create_item($this->instance, ['xp' => 10, 'completiontracking' => 'complete']);
        $this->seed_progress($student, [$item->id => 9]);

        outcome_mapping::rate_all('interactivevideo', $this->instance->id);
        $this->assertSame(0, $DB->count_records('grade_grades', ['itemid' => $this->outcomeitem->id]));

        outcome_mapping::rate_all('interactivevideo', $this->instance->id + 1000);
        outcome_mapping::rate_all('nosuchmodule', $this->instance->id);
        $this->assertSame(0, $DB->count_records('grade_grades', ['itemid' => $this->outcomeitem->id]));

        // The task itself tolerates missing custom data.
        $task = new \mod_interactivevideo\task\rate_outcomes();
        $task->set_custom_data([]);
        $task->execute();
        $this->assertFalse($task->retry_until_success());
    }
}
