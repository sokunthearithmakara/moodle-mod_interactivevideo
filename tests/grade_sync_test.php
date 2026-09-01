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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
require_once($CFG->libdir . '/gradelib.php');

use mod_interactivevideo\local\grade_sync;

/**
 * Tests how grades respond to grade-setting and interaction changes.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\grade_sync
 * @covers     \interactivevideo_get_user_grades
 */
final class grade_sync_test extends \advanced_testcase {
    /**
     * Read a learner's gradebook grade.
     *
     * @param stdClass $instance The instance.
     * @param int $userid The user.
     * @return float|null
     */
    private function grade(\stdClass $instance, int $userid) {
        $g = grade_get_grades($instance->course, 'mod', 'interactivevideo', $instance->id, $userid);
        $grade = $g->items[0]->grades[$userid]->grade ?? null;

        return $grade === null ? null : (float) $grade;
    }

    /**
     * Record a learner completing an interaction for a given amount of XP.
     *
     * @param stdClass $instance The instance.
     * @param int $userid The learner.
     * @param stdClass $item The interaction.
     * @param float $xp Earned XP.
     */
    private function earn(\stdClass $instance, int $userid, \stdClass $item, float $xp): void {
        $this->setUser($userid);
        \interactivevideo_util::get_progress($instance->id, $userid);
        \interactivevideo_util::save_progress(
            $instance->id,
            $userid,
            json_encode([(string) $item->id]),
            json_encode(['id' => $item->id, 'hasDetails' => false, 'xp' => $xp]),
            true,
            'richtext',
            '',
            1,
            100,
            0,
            $instance->id,
            0,
            false,
            $instance->course
        );
    }

    /**
     * Change the activity's grade maximum the way saving mod_form does.
     *
     * @param stdClass $instance The instance.
     * @param float $newmax The new maximum.
     */
    private function set_grademax(\stdClass $instance, float $newmax): void {
        global $DB;

        $oldmax = (float) $DB->get_field('interactivevideo', 'grade', ['id' => $instance->id]);
        $DB->set_field('interactivevideo', 'grade', $newmax, ['id' => $instance->id]);
        $instance->grade = $newmax;
        interactivevideo_grade_item_update($instance);

        if ($oldmax <= 0 && $newmax > 0) {
            grade_sync::run($instance->id, grade_sync::MODE_BACKFILL);
        } else if ($oldmax > 0 && $newmax > 0) {
            grade_sync::run($instance->id, grade_sync::MODE_RESCALE, $oldmax, $newmax);
        }
    }

    /**
     * Scenario A: changing the maximum rescales, keeping each learner's percentage.
     */
    public function test_changing_grademax_rescales(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 100]);
        $item = $gen->create_item($instance, ['xp' => 25, 'completiontracking' => 'completepass']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        // Half the available XP: 50 out of a maximum of 100.
        $this->earn($instance, $student->id, $item, 12.5);
        $this->assertEqualsWithDelta(50.0, $this->grade($instance, $student->id), 0.01);

        $this->setAdminUser();
        $this->set_grademax($instance, 50);

        $this->assertEqualsWithDelta(25.0, $this->grade($instance, $student->id), 0.01);
    }

    /**
     * Scenario B: adding an interaction leaves grades alone until the learner returns.
     */
    public function test_adding_interaction_leaves_grade_until_retake(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 100]);
        $itema = $gen->create_item($instance, ['xp' => 25, 'completiontracking' => 'completepass']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $this->earn($instance, $student->id, $itema, 12.5);
        $this->assertEqualsWithDelta(50.0, $this->grade($instance, $student->id), 0.01);

        // Teacher adds a further 5 XP of interactions; the total becomes 30.
        $gen->create_item($instance, ['xp' => 5, 'completiontracking' => 'completepass']);
        $this->assertEqualsWithDelta(
            50.0,
            $this->grade($instance, $student->id),
            0.01,
            'Adding an interaction must not move an existing grade'
        );

        // The learner returns: now the grade reflects the new total.
        $this->earn($instance, $student->id, $itema, 12.5);
        $this->assertEqualsWithDelta(41.67, $this->grade($instance, $student->id), 0.01);
    }

    /**
     * Switching grading on backfills learners who already earned XP.
     */
    public function test_enabling_grading_backfills(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 0]);
        $item = $gen->create_item($instance, ['xp' => 25, 'completiontracking' => 'completepass']);
        $one = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $two = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $this->earn($instance, $one->id, $item, 12.5);
        $this->earn($instance, $two->id, $item, 25);
        $this->assertNull($this->grade($instance, $one->id), 'No grade item exists yet');

        $this->setAdminUser();
        $this->set_grademax($instance, 100);

        $this->assertEqualsWithDelta(50.0, $this->grade($instance, $one->id), 0.01);
        $this->assertEqualsWithDelta(100.0, $this->grade($instance, $two->id), 0.01);
    }

    /**
     * A manually overridden grade is left exactly as the teacher set it.
     *
     * This mirrors core: rescale_grades_keep_percentage() scales raw grades but treats an
     * override as the teacher's explicit final value and does not touch it. A recomputation
     * from XP would instead have discarded the override entirely.
     */
    public function test_rescale_leaves_overridden_grade_untouched(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 100]);
        $item = $gen->create_item($instance, ['xp' => 25, 'completiontracking' => 'completepass']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $this->earn($instance, $student->id, $item, 12.5);

        // Teacher overrides the grade to 90 in the gradebook.
        $gradeitem = \grade_item::fetch([
            'iteminstance' => $instance->id,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'courseid' => $course->id,
        ]);
        $gradeitem->update_final_grade($student->id, 90, 'gradebook');
        $this->assertEqualsWithDelta(90.0, $this->grade($instance, $student->id), 0.01);

        $this->setAdminUser();
        $this->set_grademax($instance, 50);

        // The override stands at its absolute value; XP-derived recomputation would give 25.
        $this->assertEqualsWithDelta(90.0, $this->grade($instance, $student->id), 0.01);
        grade_regrade_final_grades($course->id);
        $this->assertEqualsWithDelta(90.0, $this->grade($instance, $student->id), 0.01);
    }

    /**
     * Fractional earned XP survives the round trip through the database.
     */
    public function test_fractional_xp_persists(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 100]);
        $item = $gen->create_item($instance, ['xp' => 10, 'completiontracking' => 'completepass']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $this->earn($instance, $student->id, $item, 4.5);

        $stored = $DB->get_record('interactivevideo_completion', [
            'cmid' => $instance->id,
            'userid' => $student->id,
        ]);

        $this->assertEqualsWithDelta(4.5, (float) $stored->xp, 0.001, 'The xp column must keep the fraction');
        $this->assertEqualsWithDelta(45.0, $this->grade($instance, $student->id), 0.01);
    }

    /**
     * A queued sync carries what the task needs and dedupes.
     */
    public function test_queue_creates_one_task(): void {
        global $DB;
        $this->resetAfterTest();

        grade_sync::queue(42, grade_sync::MODE_RESCALE, 100, 50);
        grade_sync::queue(42, grade_sync::MODE_RESCALE, 100, 50);

        $tasks = $DB->get_records('task_adhoc', ['classname' => '\mod_interactivevideo\task\sync_grades']);
        $this->assertCount(1, $tasks, 'Repeated identical queues must collapse to one task');

        $data = json_decode(reset($tasks)->customdata);
        $this->assertEquals(42, $data->instanceid);
        $this->assertEquals(grade_sync::MODE_RESCALE, $data->mode);
        $this->assertEquals(100, $data->oldmax);
        $this->assertEquals(50, $data->newmax);
    }
}
