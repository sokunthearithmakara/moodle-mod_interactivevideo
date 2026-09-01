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
require_once($CFG->libdir . '/completionlib.php');

/**
 * The grade denominator and the completion denominator must agree.
 *
 * custom_completion decides completion from its own relevance filter; the grade path uses
 * get_reachable_gradable_items(). If the two ever disagree, a learner can be complete but
 * short of full marks, or the reverse.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::get_reachable_gradable_items
 * @covers     \mod_interactivevideo\completion\custom_completion
 */
final class completion_grade_agreement_test extends \advanced_testcase {
    /**
     * Build an activity whose items exercise every exclusion rule.
     *
     * @return array [course, instance, cm, student, reachable item ids]
     */
    private function build_activity(): array {
        $course = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance([
            'course' => $course->id,
            'grade' => 100,
            'starttime' => 2,
            'endtime' => 60,
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
            'completionpercentage' => 100,
        ]);

        $reachable = [];
        // Inside the window, outside any skip segment.
        $reachable[] = $gen->create_item($instance, ['xp' => 10, 'timestamp' => 5])->id;
        $reachable[] = $gen->create_item($instance, ['xp' => 10, 'timestamp' => 50])->id;
        // Not tied to the timeline at all: always reachable.
        $reachable[] = $gen->create_item($instance, ['xp' => 10, 'timestamp' => -1])->id;

        // A skip segment covering 20..40; its end timestamp lives in the title column.
        $gen->create_item($instance, [
            'xp' => 0, 'timestamp' => 20, 'title' => '40',
            'type' => 'skipsegment', 'hascompletion' => 0,
        ]);
        // Buried inside the skipped range.
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 30]);
        // Beyond the trimmed end.
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 95]);
        // Before the trimmed start.
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 1]);

        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        return [$course, $instance, $cm, $student, $reachable];
    }

    /**
     * The helper selects exactly the interactions a learner can reach.
     */
    public function test_helper_excludes_unreachable_items(): void {
        $this->resetAfterTest();
        [, $instance, $cm, , $reachable] = $this->build_activity();
        $contextid = \context_module::instance($cm->id)->id;

        $got = \interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid);
        $gotids = array_map('intval', array_keys($got));

        sort($gotids);
        sort($reachable);
        $this->assertEquals($reachable, $gotids, 'Only reachable gradable interactions should be returned');
    }

    /**
     * An interaction whose content type is disabled site-wide does not count.
     *
     * The player drops it in filterAnnotations(), so counting it would leave the learner
     * measured against something they are never shown.
     */
    public function test_disabled_content_type_is_excluded(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'starttime' => 0, 'endtime' => 60]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $contextid = \context_module::instance($cm->id)->id;

        $kept = $gen->create_item($instance, ['xp' => 10, 'timestamp' => 5, 'type' => 'richtext'])->id;
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 6, 'type' => 'chapter']);

        // Disable the chapter type site-wide.
        $enabled = array_filter(explode(',', (string) get_config('mod_interactivevideo', 'enablecontenttypes')));
        $enabled = array_diff($enabled, ['ivplugin_chapter']);
        set_config('enablecontenttypes', implode(',', $enabled), 'mod_interactivevideo');

        $got = array_map('intval', array_keys(
            \interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid)
        ));

        $this->assertEquals([$kept], $got, 'A disabled content type must not count towards the total');
    }

    /**
     * A skip segment that starts before the trim point still hides what follows it.
     *
     * The player keeps a skip segment that merely overlaps the window; requiring it to sit
     * wholly inside would let items it hides be counted.
     */
    public function test_skipsegment_overlapping_window_still_hides_items(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        // Window starts at 10; the skip segment spans 5..20, so it straddles the start.
        $instance = $gen->create_instance(['course' => $course->id, 'starttime' => 10, 'endtime' => 60]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $contextid = \context_module::instance($cm->id)->id;

        $gen->create_item($instance, [
            'xp' => 0, 'timestamp' => 5, 'title' => '20',
            'type' => 'skipsegment', 'hascompletion' => 0,
        ]);
        // Inside the skipped range and inside the window: unreachable.
        $gen->create_item($instance, ['xp' => 10, 'timestamp' => 15]);
        // After the skipped range: reachable.
        $reachable = $gen->create_item($instance, ['xp' => 10, 'timestamp' => 30])->id;

        $got = array_map('intval', array_keys(
            \interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid)
        ));

        $this->assertEquals([$reachable], $got, 'A straddling skip segment must still hide its contents');
    }

    /**
     * An analytics interaction with completion enabled counts as gradable.
     *
     * local_ivanalytics awards XP for watching a required percentage or number of seconds,
     * so it is a genuinely graded interaction rather than a passive marker. It declares
     * hastimestamp => false, so such items are stored at timestamp -1 and must survive both
     * the trim window and any skip segment.
     */
    public function test_analytics_item_with_completion_is_gradable(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        // Trimmed window and a skip segment, neither of which may affect a -1 item.
        $instance = $gen->create_instance(['course' => $course->id, 'starttime' => 10, 'endtime' => 60]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $contextid = \context_module::instance($cm->id)->id;

        if (!in_array('analytics', \interactivevideo_util::get_enabled_type_names(), true)) {
            $this->markTestSkipped('local_ivanalytics is not installed or enabled on this site');
        }

        $gen->create_item($instance, [
            'xp' => 0, 'timestamp' => 20, 'title' => '40',
            'type' => 'skipsegment', 'hascompletion' => 0,
        ]);
        $normal = $gen->create_item($instance, ['xp' => 10, 'timestamp' => 15, 'type' => 'richtext'])->id;
        // Stored the way editannotation.js stores a hastimestamp => false type.
        $analyticsgradable = $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => -1, 'type' => 'analytics', 'hascompletion' => 1,
        ])->id;
        // The videotrack type is the other untimed type that can carry completion.
        $videotrackgradable = $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => -1, 'type' => 'videotrack', 'hascompletion' => 1,
        ])->id;
        // At -1, gradability is decided by the item's own hascompletion column, not its type.
        $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => -1, 'type' => 'analytics', 'hascompletion' => 0,
        ]);
        $gen->create_item($instance, [
            'xp' => 10, 'timestamp' => -1, 'type' => 'transcript', 'hascompletion' => 0,
        ]);

        $got = array_map('intval', array_keys(
            \interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid)
        ));
        sort($got);
        $expected = [$normal, $analyticsgradable, $videotrackgradable];
        sort($expected);

        $this->assertEquals(
            $expected,
            $got,
            'Untimed interactions count exactly when their own hascompletion column is set'
        );
    }

    /**
     * Completing every reachable interaction gives both full marks and completion.
     */
    public function test_completion_and_grade_agree(): void {
        $this->resetAfterTest();
        [$course, $instance, $cm, $student, $reachable] = $this->build_activity();
        $this->setUser($student);

        // Complete every reachable interaction.
        \interactivevideo_util::get_progress($instance->id, $student->id);
        foreach ($reachable as $i => $itemid) {
            \interactivevideo_util::save_progress(
                $instance->id,
                $student->id,
                json_encode(array_map('strval', array_slice($reachable, 0, $i + 1))),
                json_encode(['id' => $itemid, 'hasDetails' => false, 'xp' => 10]),
                true,
                'richtext',
                '',
                1,
                100,
                0,
                $instance->id,
                0,
                false,
                $course->id
            );
        }

        // The grade path says full marks.
        $grades = grade_get_grades($course->id, 'mod', 'interactivevideo', $instance->id, $student->id);
        $grade = (float) ($grades->items[0]->grades[$student->id]->grade ?? -1);
        $this->assertEqualsWithDelta(100.0, $grade, 0.01, 'Every reachable interaction done should be full marks');

        // The completion path agrees.
        $cminfo = \cm_info::create($cm, $student->id);
        $completion = new \mod_interactivevideo\completion\custom_completion($cminfo, $student->id);
        $this->assertEquals(
            COMPLETION_COMPLETE,
            $completion->get_state('completionpercentage'),
            'Completion must agree with the grade denominator'
        );
    }
}
