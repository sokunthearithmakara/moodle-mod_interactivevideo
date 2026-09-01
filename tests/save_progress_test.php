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
 * Tests that progress and grades are determined server-side rather than by the client.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::save_progress
 * @covers     \interactivevideo_util::get_progress
 * @covers     \interactivevideo_util::resolve_target_userid
 * @covers     \interactivevideo_util::validate_module_instance
 */
final class save_progress_test extends \advanced_testcase {
    /**
     * Build a course with an interactivevideo instance and its interactions.
     *
     * @param array $items One field-override array per interaction to create.
     * @param array $instanceoverrides Field overrides for the instance.
     * @return array [course, instance, cm, context, items]
     */
    private function setup_activity(array $items = [['xp' => 10]], array $instanceoverrides = []): array {
        $course = $this->getDataGenerator()->create_course();
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $generator->create_instance(['course' => $course->id] + $instanceoverrides);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);

        $created = [];
        foreach ($items as $item) {
            $created[] = $generator->create_item($instance, $item);
        }

        return [$course, $instance, $cm, $context, $created];
    }

    /**
     * Invoke save_progress the way ajax.php does, with the client-supplied values it passes.
     *
     * @param stdClass $instance The interactivevideo instance.
     * @param int $userid Target user.
     * @param array $completeditems Interaction ids the client claims are complete.
     * @param array $detail The completiondetails payload for the interaction just completed.
     * @param array $claims Client-supplied grade/xp/percentage/completed/gradeiteminstance.
     * @return stdClass The saved record.
     */
    private function save(
        \stdClass $instance,
        int $userid,
        array $completeditems,
        array $detail,
        array $claims = []
    ): \stdClass {
        $claims += [
            'completed' => 1,
            'percentage' => 100,
            'grade' => 100,
            'gradeiteminstance' => $instance->id,
            'xp' => 9999,
            'courseid' => $instance->course,
        ];

        return \interactivevideo_util::save_progress(
            $instance->id,
            $userid,
            json_encode(array_map('strval', $completeditems)),
            json_encode($detail),
            true,
            'richtext',
            '',
            $claims['completed'],
            $claims['percentage'],
            $claims['grade'],
            $claims['gradeiteminstance'],
            $claims['xp'],
            false,
            $claims['courseid']
        );
    }

    /**
     * Read the gradebook grade for a user on an instance.
     *
     * @param stdClass $instance The interactivevideo instance.
     * @param int $userid The user.
     * @return float|null
     */
    private function gradebook_grade(\stdClass $instance, int $userid): ?float {
        $grades = grade_get_grades($instance->course, 'mod', 'interactivevideo', $instance->id, $userid);
        $grade = $grades->items[0]->grades[$userid]->grade ?? null;

        return $grade === null ? null : (float) $grade;
    }

    /**
     * A student claiming full marks gets the grade their completed interactions are worth.
     */
    public function test_grade_is_recomputed_not_taken_from_request(): void {
        $this->resetAfterTest();
        // Two interactions worth 10 each; completing one is worth half the grade.
        [$course, $instance, , , $items] = $this->setup_activity([['xp' => 10], ['xp' => 10]]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = $this->save(
            $instance,
            $student->id,
            [$items[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 10],
            ['grade' => 100, 'xp' => 9999]
        );

        $this->assertEquals(10, $record->xp, 'XP must come from the completed interactions, not the request');
        $this->assertEqualsWithDelta(50.0, $this->gradebook_grade($instance, $student->id), 0.01);
    }

    /**
     * A scored interaction cannot award more than its configured maximum.
     */
    public function test_item_xp_clamped_to_configured_maximum(): void {
        $this->resetAfterTest();
        [$course, $instance, , , $items] = $this->setup_activity([
            ['xp' => 10, 'completiontracking' => 'completepass'],
        ]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = $this->save(
            $instance,
            $student->id,
            [$items[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 999]
        );

        $this->assertEquals(10, $record->xp);
    }

    /**
     * A manual interaction is worth exactly its configured XP, whatever the client claims.
     */
    public function test_binary_item_xp_is_server_determined(): void {
        $this->resetAfterTest();
        [$course, $instance, , , $items] = $this->setup_activity([
            ['xp' => 10, 'completiontracking' => 'manual'],
        ]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        // Understated rather than inflated: the value must be set by the server, not merely capped.
        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = $this->save(
            $instance,
            $student->id,
            [$items[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 2]
        );

        $this->assertEquals(10, $record->xp);
    }

    /**
     * A legitimate partial score on a scored interaction is preserved.
     */
    public function test_scored_item_accepts_partial_credit(): void {
        $this->resetAfterTest();
        [$course, $instance, , , $items] = $this->setup_activity([
            ['xp' => 10, 'completiontracking' => 'completepass'],
        ]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = $this->save(
            $instance,
            $student->id,
            [$items[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 4.5]
        );

        $this->assertEqualsWithDelta(4.5, $record->xp, 0.001);
        $this->assertEqualsWithDelta(45.0, $this->gradebook_grade($instance, $student->id), 0.01);
    }

    /**
     * Interaction ids belonging to another activity are discarded.
     */
    public function test_completeditems_filtered_to_instance(): void {
        $this->resetAfterTest();
        [$course, $instance, , , $items] = $this->setup_activity([['xp' => 10]]);
        [, $otherinstance, , , $otheritems] = $this->setup_activity([['xp' => 10]]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $record = $this->save(
            $instance,
            $student->id,
            [$items[0]->id, $otheritems[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 10]
        );

        $stored = json_decode($record->completeditems);
        $this->assertEquals([(string) $items[0]->id], $stored);
        $this->assertNotContains((string) $otheritems[0]->id, $stored);
    }

    /**
     * The grade lands on this activity's grade item, not one named by the client.
     */
    public function test_gradebook_entry_targets_correct_activity(): void {
        $this->resetAfterTest();
        [$course, $instance, , , $items] = $this->setup_activity([['xp' => 10]]);
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $victim = $generator->create_instance(['course' => $course->id]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::get_progress($instance->id, $student->id);
        $this->save(
            $instance,
            $student->id,
            [$items[0]->id],
            ['id' => $items[0]->id, 'hasDetails' => false, 'xp' => 10],
            ['gradeiteminstance' => $victim->id]
        );

        $this->assertNotNull($this->gradebook_grade($instance, $student->id));
        $this->assertNull(
            $this->gradebook_grade($victim, $student->id),
            'A client-named grade item must not receive the grade'
        );
    }

    /**
     * A student may not act on another user.
     */
    public function test_other_user_rejected_without_capability(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $peer = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::resolve_target_userid($context, $peer->id);
    }

    /**
     * A student acting on themselves resolves to their own id.
     */
    public function test_own_user_is_resolved(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assertEquals($student->id, \interactivevideo_util::resolve_target_userid($context, $student->id));
    }

    /**
     * A teacher holding editreport may act on another user.
     */
    public function test_other_user_allowed_with_editreport(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($teacher);

        $this->assertEquals($student->id, \interactivevideo_util::resolve_target_userid($context, $student->id));
    }

    /**
     * Reading another user's progress must not create a completion row for them.
     */
    public function test_get_progress_does_not_create_row_for_other_user(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($teacher);

        $record = \interactivevideo_util::get_progress($instance->id, $student->id);

        $this->assertEquals(0, $record->id, 'A stub is expected rather than a persisted row');
        $this->assertFalse($DB->record_exists('interactivevideo_completion', [
            'cmid' => $instance->id,
            'userid' => $student->id,
        ]));
    }

    /**
     * Reading one's own progress does create the row.
     */
    public function test_get_progress_creates_row_for_self(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $record = \interactivevideo_util::get_progress($instance->id, $student->id);

        $this->assertGreaterThan(0, $record->id);
        $this->assertTrue($DB->record_exists('interactivevideo_completion', [
            'cmid' => $instance->id,
            'userid' => $student->id,
        ]));
    }

    /**
     * An instance outside the checked context is rejected.
     */
    public function test_instance_must_belong_to_context(): void {
        $this->resetAfterTest();
        [, , , $context] = $this->setup_activity();
        [, $otherinstance] = $this->setup_activity();

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::validate_module_instance($context, $otherinstance->id);
    }

    /**
     * The matching instance is accepted and yields its course module.
     */
    public function test_matching_instance_is_accepted(): void {
        $this->resetAfterTest();
        [, $instance, $cm, $context] = $this->setup_activity();

        $resolved = \interactivevideo_util::validate_module_instance($context, $instance->id);

        $this->assertEquals($cm->id, $resolved->id);
        $this->assertEquals($instance->course, $resolved->course);
    }

    /**
     * A course context is not a valid target for an instance-scoped write.
     */
    public function test_non_module_context_is_rejected(): void {
        $this->resetAfterTest();
        [$course, $instance] = $this->setup_activity();

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::validate_module_instance(\context_course::instance($course->id), $instance->id);
    }
}
