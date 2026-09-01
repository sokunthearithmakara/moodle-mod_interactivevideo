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
 * Tests that progress deletion is scoped to the owner and the activity.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::delete_progress_by_id
 * @covers     \interactivevideo_util::delete_progress_by_ids
 * @covers     \interactivevideo_util::delete_completion_data
 * @covers     \interactivevideo_util::get_owned_completion_record
 */
final class delete_progress_test extends \advanced_testcase {
    /**
     * Build a course with an interactivevideo instance and one interaction.
     *
     * @return array [course, instance, cm, context, item]
     */
    private function setup_activity(): array {
        $course = $this->getDataGenerator()->create_course();
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $generator->create_instance(['course' => $course->id]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        $item = $generator->create_item($instance, ['xp' => 10]);

        return [$course, $instance, $cm, $context, $item];
    }

    /**
     * Create a completion row, with one log and one attached file.
     *
     * @param \stdClass $instance The instance.
     * @param \context $context The module context.
     * @param \stdClass $item The interaction.
     * @param int $userid The owner.
     * @return array [int completionid, int logid]
     */
    private function seed_progress(\stdClass $instance, \context $context, \stdClass $item, int $userid): array {
        global $DB;

        $completionid = $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $instance->id,
            'userid' => $userid,
            'timecreated' => time(),
            'timecompleted' => 0,
            'completeditems' => json_encode([(string) $item->id]),
            'completiondetails' => json_encode([json_encode(['id' => $item->id, 'xp' => 10])]),
            'completionpercentage' => 100,
            'xp' => 10,
        ]);

        $logid = $DB->insert_record('interactivevideo_log', (object) [
            'userid' => $userid,
            'cmid' => $instance->id,
            'annotationid' => $item->id,
            'completionid' => $completionid,
            'char1' => 'richtext',
            'text1' => 'answer',
            'timecreated' => time(),
            'timemodified' => time(),
        ]);

        get_file_storage()->create_file_from_string([
            'contextid' => $context->id,
            'component' => 'mod_interactivevideo',
            'filearea' => 'attachments',
            'itemid' => $logid,
            'filepath' => '/',
            'filename' => 'answer.txt',
        ], 'submitted answer');

        return [$completionid, $logid];
    }

    /**
     * Run the sequence ajax.php's delete_own_progress_by_id case performs.
     *
     * Ownership is asserted at the call site rather than inside delete_progress_by_id(),
     * whose signature must stay stable for subclasses such as mod_flexbook\util.
     *
     * @param int $recordid The completion record id.
     * @param context $context The module context.
     * @param stdClass $instance The instance.
     * @param int $courseid The course id.
     * @return string
     */
    private function delete_own_progress(int $recordid, \context $context, \stdClass $instance, int $courseid): string {
        global $USER;

        \interactivevideo_util::get_owned_completion_record($recordid, $context, $USER->id);

        return \interactivevideo_util::delete_progress_by_id($context->id, $recordid, $courseid, $instance->id);
    }

    /**
     * Run the sequence ajax.php's delete_own_completion_data case performs.
     *
     * @param int $recordid The completion record id.
     * @param int $itemid The interaction id.
     * @param context $context The module context.
     * @return string
     */
    private function delete_own_completion_data(int $recordid, int $itemid, \context $context): string {
        global $USER;

        \interactivevideo_util::get_owned_completion_record($recordid, $context, $USER->id);

        return \interactivevideo_util::delete_completion_data($recordid, $itemid, $USER->id, $context->id);
    }

    /**
     * Whether an attachment file still exists for a log.
     *
     * @param context $context The module context.
     * @param int $logid The log id.
     * @return bool
     */
    private function file_exists(\context $context, int $logid): bool {
        return (bool) get_file_storage()->get_area_files(
            $context->id,
            'mod_interactivevideo',
            'attachments',
            $logid,
            'id',
            false
        );
    }

    /**
     * A learner deleting their own progress removes the row, its logs and its files.
     */
    public function test_own_progress_is_deleted_with_logs_and_files(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$completionid, $logid] = $this->seed_progress($instance, $context, $item, $student->id);
        $this->setUser($student);

        $this->assertTrue($this->file_exists($context, $logid));

        $result = $this->delete_own_progress($completionid, $context, $instance, $course->id);

        $this->assertEquals('deleted', $result);
        $this->assertFalse($DB->record_exists('interactivevideo_completion', ['id' => $completionid]));
        $this->assertFalse($DB->record_exists('interactivevideo_log', ['id' => $logid]));
        $this->assertFalse($this->file_exists($context, $logid));
    }

    /**
     * A learner cannot delete a peer's progress by passing its record id.
     */
    public function test_peers_progress_cannot_be_deleted(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$victimcompletion, $victimlog] = $this->seed_progress($instance, $context, $item, $victim->id);
        $this->setUser($student);

        try {
            $this->delete_own_progress($victimcompletion, $context, $instance, $course->id);
            $this->fail('Deleting another user\'s progress should have been rejected');
        } catch (\moodle_exception $e) {
            // Expected.
            $this->assertNotEmpty($e->getMessage());
        }

        $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $victimcompletion]));
        $this->assertTrue($DB->record_exists('interactivevideo_log', ['id' => $victimlog]));
        $this->assertTrue($this->file_exists($context, $victimlog));
    }

    /**
     * A record belonging to another activity cannot be deleted through this context.
     */
    public function test_record_from_another_activity_cannot_be_deleted(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        [, $otherinstance, , $othercontext, $otheritem] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$othercompletion] = $this->seed_progress($otherinstance, $othercontext, $otheritem, $student->id);
        $this->setUser($student);

        // The caller owns the record, but it lives in a different activity.
        $this->expectException(\moodle_exception::class);
        try {
            $this->delete_own_progress($othercompletion, $context, $otherinstance, $course->id);
        } finally {
            $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $othercompletion]));
        }
    }

    /**
     * A teacher may not reach into another course's records.
     */
    public function test_teacher_delete_is_context_bound(): void {
        global $DB;
        $this->resetAfterTest();
        [, , , $context] = $this->setup_activity();
        [$othercourse, $otherinstance, , $othercontext, $otheritem] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($othercourse, 'editingteacher');
        $victim = $this->getDataGenerator()->create_and_enrol($othercourse, 'student');
        [$victimcompletion] = $this->seed_progress($otherinstance, $othercontext, $otheritem, $victim->id);
        $this->setUser($teacher);

        $this->expectException(\moodle_exception::class);
        try {
            // Context from the first activity, record from the second.
            \interactivevideo_util::delete_progress_by_id(
                $context->id,
                $victimcompletion,
                $othercourse->id,
                $otherinstance->id
            );
        } finally {
            $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $victimcompletion]));
        }
    }

    /**
     * A batch containing one unreachable record must delete nothing at all.
     */
    public function test_batch_delete_is_all_or_nothing(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        [, $otherinstance, , $othercontext, $otheritem] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $one = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $two = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$valid1] = $this->seed_progress($instance, $context, $item, $one->id);
        [$valid2] = $this->seed_progress($instance, $context, $item, $two->id);
        [$foreign] = $this->seed_progress($otherinstance, $othercontext, $otheritem, $one->id);
        $this->setUser($teacher);

        $this->expectException(\moodle_exception::class);
        try {
            \interactivevideo_util::delete_progress_by_ids(
                $context->id,
                [$valid1, $foreign, $valid2],
                $course->id,
                $instance->id
            );
        } finally {
            $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $valid1]));
            $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $valid2]));
            $this->assertTrue($DB->record_exists('interactivevideo_completion', ['id' => $foreign]));
        }
    }

    /**
     * A legitimate batch delete still removes every record in it.
     */
    public function test_batch_delete_removes_valid_records(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $one = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $two = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$first] = $this->seed_progress($instance, $context, $item, $one->id);
        [$second] = $this->seed_progress($instance, $context, $item, $two->id);
        $this->setUser($teacher);

        $result = \interactivevideo_util::delete_progress_by_ids(
            $context->id,
            [$first, $second],
            $course->id,
            $instance->id
        );

        $this->assertEquals('deleted', $result);
        $this->assertFalse($DB->record_exists('interactivevideo_completion', ['id' => $first]));
        $this->assertFalse($DB->record_exists('interactivevideo_completion', ['id' => $second]));
    }

    /**
     * A learner cannot corrupt a peer's completion record through delete_completion_data.
     */
    public function test_peers_completion_data_cannot_be_rewritten(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$victimcompletion] = $this->seed_progress($instance, $context, $item, $victim->id);
        $before = $DB->get_record('interactivevideo_completion', ['id' => $victimcompletion]);
        $this->setUser($student);

        $this->expectException(\moodle_exception::class);
        try {
            $this->delete_own_completion_data($victimcompletion, $item->id, $context);
        } finally {
            $after = $DB->get_record('interactivevideo_completion', ['id' => $victimcompletion]);
            $this->assertEquals($before->completeditems, $after->completeditems);
            $this->assertEquals($before->completiondetails, $after->completiondetails);
        }
    }

    /**
     * Self-service reset is refused when the activity does not offer it.
     */
    public function test_reset_refused_when_option_disabled(): void {
        $this->resetAfterTest();
        // The generator leaves allowdeleteprogress unset, which encodes as 0.
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::require_own_progress_deletion_allowed($context);
    }

    /**
     * Self-service reset is permitted when the activity enables it.
     */
    public function test_reset_allowed_when_option_enabled(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context] = $this->setup_activity();
        $options = json_decode($DB->get_field('interactivevideo', 'displayoptions', ['id' => $instance->id]), true);
        $options['allowdeleteprogress'] = 1;
        $DB->set_field('interactivevideo', 'displayoptions', json_encode($options), ['id' => $instance->id]);

        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::require_own_progress_deletion_allowed($context);
        $this->assertTrue(true, 'No exception is the expected outcome');
    }

    /**
     * A guest may not reset progress even where the option is enabled.
     */
    public function test_reset_refused_for_guest(): void {
        global $DB;
        $this->resetAfterTest();
        [, $instance, , $context] = $this->setup_activity();
        $options = json_decode($DB->get_field('interactivevideo', 'displayoptions', ['id' => $instance->id]), true);
        $options['allowdeleteprogress'] = 1;
        $DB->set_field('interactivevideo', 'displayoptions', json_encode($options), ['id' => $instance->id]);

        $this->setGuestUser();

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::require_own_progress_deletion_allowed($context);
    }

    /**
     * A learner clearing their own interaction data still works.
     */
    public function test_own_completion_data_is_cleared(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        [$completionid, $logid] = $this->seed_progress($instance, $context, $item, $student->id);
        $this->setUser($student);

        $this->delete_own_completion_data($completionid, $item->id, $context);

        $after = $DB->get_record('interactivevideo_completion', ['id' => $completionid]);
        $this->assertNotContains((string) $item->id, json_decode($after->completeditems));
        $this->assertFalse($DB->record_exists('interactivevideo_log', ['id' => $logid]));
    }
}
