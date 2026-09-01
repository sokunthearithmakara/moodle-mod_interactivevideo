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

/**
 * The playback window may be captured by any viewer but never narrowed by a learner.
 *
 * start and end decide which interactions count towards completion and grade, so narrowing
 * them is a completion and grade bypass that affects every learner on the activity.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::videotime_change_is_widening
 */
final class videotime_test extends \advanced_testcase {
    /**
     * The widening rule, which is what decides whether a learner's write is accepted.
     *
     * @return array[]
     */
    public static function widening_provider(): array {
        return [
            'first capture of an empty end' => [0, 0, 0, 600, true],
            'repeat post of identical values' => [0, 600, 0, 600, true],
            'start reset when it exceeded the real duration' => [500, 600, 0, 600, true],
            'end extended for a longer video' => [0, 600, 0, 900, true],
            'end narrowed to almost nothing' => [0, 600, 0, 1, false],
            'start moved forward' => [0, 600, 500, 600, false],
            'both narrowed' => [0, 600, 100, 200, false],
        ];
    }

    /**
     * Only a widening change is acceptable from a learner.
     *
     * @dataProvider widening_provider
     * @param float $currentstart Stored start.
     * @param float $currentend Stored end.
     * @param float $newstart Proposed start.
     * @param float $newend Proposed end.
     * @param bool $expected Whether the change should be allowed.
     */
    public function test_widening_rule($currentstart, $currentend, $newstart, $newend, $expected): void {
        $this->assertSame(
            $expected,
            \interactivevideo_util::videotime_change_is_widening($currentstart, $currentend, $newstart, $newend)
        );
    }

    /**
     * Narrowing the window must not change which interactions count.
     *
     * This is the consequence that matters: the column is only the mechanism.
     */
    public function test_narrowing_would_drop_gradable_items(): void {
        global $DB;

        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'starttime' => 0, 'endtime' => 600]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $contextid = \context_module::instance($cm->id)->id;

        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 5]);
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 300]);
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 590]);

        $before = count(\interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid));
        $this->assertEquals(3, $before);

        // The rule refuses the narrowing, so the stored window is untouched.
        $this->assertFalse(\interactivevideo_util::videotime_change_is_widening(0, 600, 0, 1));

        $after = count(\interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid));
        $this->assertEquals($before, $after, 'A refused narrowing must leave the gradable set intact');

        // Demonstrate what the refusal prevents: applied, it drops every gradable interaction,
        // leaving an empty denominator and nothing for the learner to complete.
        $DB->set_field('interactivevideo', 'endtime', 1, ['id' => $instance->id]);
        \cache::make('mod_interactivevideo', 'iv_items_by_cmid')->delete($instance->id);
        $this->assertEquals(
            0,
            count(\interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid)),
            'Sanity check: narrowing really would have dropped every interaction'
        );
    }

    /**
     * An instance outside the checked context is rejected before any write.
     */
    public function test_instance_must_belong_to_context(): void {
        $this->resetAfterTest();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $courseone = $this->getDataGenerator()->create_course();
        $coursetwo = $this->getDataGenerator()->create_course();
        $one = $gen->create_instance(['course' => $courseone->id]);
        $two = $gen->create_instance(['course' => $coursetwo->id]);
        $cmone = get_coursemodule_from_instance('interactivevideo', $one->id, 0, false, MUST_EXIST);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::validate_module_instance(\context_module::instance($cmone->id), $two->id);
    }

    /**
     * A learner cannot touch a peer's completion row via the watch point or time ended.
     */
    public function test_peer_completion_row_is_protected(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);

        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victimrow = $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $instance->id, 'userid' => $victim->id, 'timecreated' => time(),
            'timecompleted' => 0, 'completeditems' => '[]', 'completiondetails' => '[]',
            'completionpercentage' => 0, 'xp' => 0, 'lastviewed' => 0,
        ]);

        $this->setUser($student);
        $this->expectException(\moodle_exception::class);
        try {
            \interactivevideo_util::get_owned_completion_record($victimrow, $context, $student->id);
        } finally {
            $this->assertEquals(0, $DB->get_field('interactivevideo_completion', 'lastviewed', ['id' => $victimrow]));
        }
    }

    /**
     * A learner's own completion row resolves, so their own watch point still saves.
     */
    public function test_own_completion_row_resolves(): void {
        global $DB;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $own = $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $instance->id, 'userid' => $student->id, 'timecreated' => time(),
            'timecompleted' => 0, 'completeditems' => '[]', 'completiondetails' => '[]',
            'completionpercentage' => 0, 'xp' => 0, 'lastviewed' => 0,
        ]);

        $this->setUser($student);
        [$record, $resolvedcm] = \interactivevideo_util::get_owned_completion_record($own, $context, $student->id);

        $this->assertEquals($student->id, $record->userid);
        $this->assertEquals($cm->id, $resolvedcm->id);
    }
}
