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
 * Tests that reads of another learner's interaction data require a report capability.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::resolve_target_userid
 * @covers     \interactivevideo_util::get_logs_by_userids
 */
final class read_access_test extends \advanced_testcase {
    /** @var string Capability that permits reading another learner's data. */
    private const READCAP = 'mod/interactivevideo:viewreport';

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
     * Create a log row owned by a user, with one attachment.
     *
     * @param stdClass $instance The instance.
     * @param context $context The module context.
     * @param stdClass $item The interaction.
     * @param int $userid The owner.
     * @return int The log id.
     */
    private function seed_log(\stdClass $instance, \context $context, \stdClass $item, int $userid): int {
        global $DB;

        $logid = $DB->insert_record('interactivevideo_log', (object) [
            'userid' => $userid,
            'cmid' => $instance->id,
            'annotationid' => $item->id,
            'completionid' => 0,
            'char1' => 'richtext',
            'text1' => 'private answer',
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
        ], 'private');

        return $logid;
    }

    /**
     * The access decision interactivevideo_pluginfile() makes before serving.
     *
     * The function itself ends in send_file_not_found()/send_stored_file(), both of which
     * terminate output, so the extracted decision is exercised rather than the serving.
     *
     * @param int $logid The log id used as the file itemid.
     * @param context $context The module context.
     * @return bool Whether the file would be served.
     */
    private function pluginfile_would_serve(int $logid, \context $context): bool {
        global $CFG;
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');

        return interactivevideo_can_access_log_file($logid, $context);
    }

    /**
     * A learner may resolve their own id.
     */
    public function test_own_userid_resolves(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assertEquals(
            $student->id,
            \interactivevideo_util::resolve_target_userid($context, $student->id, self::READCAP)
        );
    }

    /**
     * A learner may not resolve a peer's id for a read.
     */
    public function test_peer_userid_rejected_for_student(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $peer = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::resolve_target_userid($context, $peer->id, self::READCAP);
    }

    /**
     * A viewreport holder may read another learner.
     */
    public function test_peer_userid_allowed_with_viewreport(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($teacher);

        $this->assertTrue(has_capability(self::READCAP, $context));
        $this->assertEquals(
            $student->id,
            \interactivevideo_util::resolve_target_userid($context, $student->id, self::READCAP)
        );
    }

    /**
     * The read capability is genuinely narrower than plain view.
     */
    public function test_student_holds_view_but_not_viewreport(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assertTrue(has_capability('mod/interactivevideo:view', $context));
        $this->assertFalse(has_capability(self::READCAP, $context));
    }

    /**
     * A learner's own attachment is served.
     */
    public function test_pluginfile_allows_own_attachment(): void {
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $logid = $this->seed_log($instance, $context, $item, $student->id);
        $this->setUser($student);

        $this->assertTrue($this->pluginfile_would_serve($logid, $context));
    }

    /**
     * A peer's attachment is refused.
     */
    public function test_pluginfile_denies_peer_attachment(): void {
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $logid = $this->seed_log($instance, $context, $item, $victim->id);
        $this->setUser($student);

        $this->assertFalse($this->pluginfile_would_serve($logid, $context));
    }

    /**
     * A teacher reviewing submissions can still download them.
     */
    public function test_pluginfile_allows_viewreport_holder(): void {
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $logid = $this->seed_log($instance, $context, $item, $student->id);
        $this->setUser($teacher);

        $this->assertTrue($this->pluginfile_would_serve($logid, $context));
    }

    /**
     * Only the per-user log areas are ownership checked.
     *
     * itext1-3 in particular must stay unguarded: ivquiz maps its authored text1 field to
     * itext1, so guarding it would hide question content from learners.
     */
    public function test_only_per_user_areas_are_guarded(): void {
        global $CFG;
        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');

        foreach (['attachments', 'text1', 'text2', 'text3'] as $area) {
            $this->assertTrue(
                interactivevideo_is_user_owned_filearea($area),
                "Per-user area {$area} must be guarded"
            );
        }

        foreach (['content', 'itext1', 'itext2', 'itext3', 'asset', 'public', 'posterimage', 'video'] as $area) {
            $this->assertFalse(
                interactivevideo_is_user_owned_filearea($area),
                "Authored area {$area} must stay unguarded"
            );
        }
    }

    /**
     * A missing log row is refused rather than falling through.
     */
    public function test_pluginfile_denies_unknown_log(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assertFalse($this->pluginfile_would_serve(-1, $context));
    }

    /**
     * A learner may read their own logs without a report capability.
     */
    public function test_log_read_allows_own_list(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        \interactivevideo_util::require_log_read_access($context, [(int) $student->id]);
        $this->assertTrue(true, 'No exception is the expected outcome');
    }

    /**
     * A learner may not read a list containing anyone else.
     */
    public function test_log_read_rejects_peer_in_list(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $peer = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        \interactivevideo_util::require_log_read_access($context, [(int) $student->id, (int) $peer->id]);
    }

    /**
     * The report path reading a cohort is permitted.
     */
    public function test_log_read_allows_cohort_with_viewreport(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $one = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $two = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($teacher);

        \interactivevideo_util::require_log_read_access($context, [(int) $one->id, (int) $two->id]);
        $this->assertTrue(true, 'No exception is the expected outcome');
    }

    /**
     * The utility function stays usable by direct PHP callers reading many users.
     *
     * local_ivanalytics calls this across a cohort under its own authorisation, so the
     * capability check belongs on the AJAX action rather than in here.
     */
    public function test_get_logs_by_userids_is_not_capability_guarded(): void {
        $this->resetAfterTest();
        [$course, $instance, , $context, $item] = $this->setup_activity();
        $one = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $two = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->seed_log($instance, $context, $item, $one->id);
        $this->seed_log($instance, $context, $item, $two->id);

        // Acting as a student, the function itself must still return both rows.
        $this->setUser($one);
        $logs = \interactivevideo_util::get_logs_by_userids(
            [$one->id, $two->id],
            $item->id,
            $context->id,
            '',
            0
        );

        $this->assertCount(2, $logs);
    }
}
