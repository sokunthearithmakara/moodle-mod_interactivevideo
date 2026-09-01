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
require_once($CFG->libdir . '/gradelib.php');

/**
 * Tests that the grade denominator counts only interactions a learner can reach.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::get_reachable_gradable_items
 */
final class reachable_items_test extends \advanced_testcase {
    /**
     * An interaction hidden inside a skipsegment must not inflate the denominator.
     */
    public function test_skipsegment_and_trim_are_ignored_by_grade_denominator(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        // Video trimmed to 0..60.
        $instance = $gen->create_instance(['course' => $course->id, 'grade' => 100, 'starttime' => 0, 'endtime' => 60]);

        // Reachable, worth 10.
        $reachable = $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => 5, 'completiontracking' => 'manual',
        ]);
        // A skip segment covering 20..40 (skipsegment stores its end in `title`).
        $gen->create_item($instance, [
            'xp' => 0, 'timestamp' => 20, 'title' => '40',
            'type' => 'skipsegment', 'hascompletion' => 0,
        ]);
        // Buried inside the skipped range: a learner can never reach it.
        $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => 30, 'completiontracking' => 'manual',
        ]);
        // Beyond the trimmed end time: also unreachable.
        $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => 95, 'completiontracking' => 'manual',
        ]);

        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = \interactivevideo_util::save_progress(
            $instance->id,
            $student->id,
            json_encode([(string) $reachable->id]),
            json_encode(['id' => $reachable->id, 'hasDetails' => false, 'xp' => 10]),
            true,
            'richtext',
            '',
            1,
            100,
            100,
            $instance->id,
            10,
            false,
            $course->id
        );

        $grades = grade_get_grades($course->id, 'mod', 'interactivevideo', $instance->id, $student->id);
        $grade = $grades->items[0]->grades[$student->id]->grade ?? null;

        $this->assertEqualsWithDelta(10.0, (float) $record->xp, 0.01);
        $this->assertEqualsWithDelta(
            100.0,
            (float) $grade,
            0.01,
            'Completing every reachable interaction must give full marks'
        );
    }
}
