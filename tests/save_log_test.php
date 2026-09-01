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
 * Tests that interaction logs are written only for the caller and only to known columns.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::save_log
 * @covers     \interactivevideo_util::resolve_target_userid
 */
final class save_log_test extends \advanced_testcase {
    /**
     * Build a course with an activity and one interaction.
     *
     * @return array [course, instance, cm, context, item]
     */
    private function setup_activity(): array {
        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        $item = $gen->create_item($instance, ['xp' => 10]);

        return [$course, $instance, $cm, $context, $item];
    }

    /**
     * A learner writing their own log stores exactly the known columns.
     */
    public function test_own_log_round_trips(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , , $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $completionid = $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $instance->id, 'userid' => $student->id, 'timecreated' => time(),
            'timecompleted' => 0, 'completeditems' => '[]', 'completiondetails' => '[]',
            'completionpercentage' => 0, 'xp' => 0,
        ]);

        // The shape ivquiz sends.
        $log = \interactivevideo_util::save_log(
            $student->id,
            $item->id,
            $instance->id,
            json_encode(['text1' => 'my answer', 'char1' => 'quiz', 'completionid' => $completionid]),
            \context_module::instance(
                get_coursemodule_from_instance('interactivevideo', $instance->id)->id
            )->id,
            0
        );

        $stored = $DB->get_record('interactivevideo_log', ['id' => $log->id]);
        $this->assertEquals('my answer', $stored->text1);
        $this->assertEquals('quiz', $stored->char1);
        $this->assertEquals($completionid, $stored->completionid);
        $this->assertEquals($student->id, $stored->userid);
        $this->assertEquals($instance->id, $stored->cmid);
        $this->assertEquals($item->id, $stored->annotationid);
    }

    /**
     * Columns the caller does not own cannot be set from the payload.
     */
    public function test_server_controlled_columns_are_not_client_writable(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , , $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $peer = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);
        $contextid = \context_module::instance(
            get_coursemodule_from_instance('interactivevideo', $instance->id)->id
        )->id;

        $log = \interactivevideo_util::save_log(
            $student->id,
            $item->id,
            $instance->id,
            json_encode([
                'text1' => 'ok',
                'userid' => $peer->id,
                'cmid' => 999999,
                'annotationid' => 888888,
                'timecreated' => 1,
                'notacolumn' => 'x',
            ]),
            $contextid,
            0
        );

        $stored = $DB->get_record('interactivevideo_log', ['id' => $log->id]);
        $this->assertEquals($student->id, $stored->userid, 'userid must come from the caller');
        $this->assertEquals($instance->id, $stored->cmid);
        $this->assertEquals($item->id, $stored->annotationid);
        $this->assertGreaterThan(1, $stored->timecreated);
        $this->assertObjectNotHasProperty('notacolumn', $stored);
    }

    /**
     * A row id in the payload cannot redirect the write at an existing row.
     *
     * Moodle's DML already drops a supplied id on insert and forces it on update, so this
     * locks in behaviour rather than covering a gap; the column allow list is defence in
     * depth against a future column becoming client-writable by default.
     */
    public function test_row_id_is_not_client_writable(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , , $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $contextid = \context_module::instance(
            get_coursemodule_from_instance('interactivevideo', $instance->id)->id
        )->id;

        $victimlog = $DB->insert_record('interactivevideo_log', (object) [
            'userid' => $victim->id, 'cmid' => $instance->id, 'annotationid' => $item->id,
            'completionid' => 0, 'char1' => 'quiz', 'text1' => 'victim answer',
            'timecreated' => time(), 'timemodified' => time(),
        ]);

        $this->setUser($student);
        \interactivevideo_util::save_log(
            $student->id,
            $item->id,
            $instance->id,
            json_encode(['id' => $victimlog, 'text1' => 'overwritten']),
            $contextid,
            1
        );

        $this->assertEquals(
            'victim answer',
            $DB->get_field('interactivevideo_log', 'text1', ['id' => $victimlog]),
            'A supplied row id must not redirect the write'
        );
    }

    /**
     * A completion record belonging to somebody else cannot be referenced.
     */
    public function test_foreign_completionid_rejected(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $instance, , , $item] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $victim = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $victimcompletion = $DB->insert_record('interactivevideo_completion', (object) [
            'cmid' => $instance->id, 'userid' => $victim->id, 'timecreated' => time(),
            'timecompleted' => 0, 'completeditems' => '[]', 'completiondetails' => '[]',
            'completionpercentage' => 0, 'xp' => 0,
        ]);
        $contextid = \context_module::instance(
            get_coursemodule_from_instance('interactivevideo', $instance->id)->id
        )->id;

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::save_log(
            $student->id,
            $item->id,
            $instance->id,
            json_encode(['text1' => 'x', 'completionid' => $victimcompletion]),
            $contextid,
            0
        );
    }

    /**
     * A learner may not write a log for a peer.
     */
    public function test_peer_userid_rejected(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $peer = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::resolve_target_userid($context, $peer->id);
    }

    /**
     * A teacher acting deliberately may write another learner's log.
     */
    public function test_editreport_holder_may_target_another_user(): void {
        $this->resetAfterTest();
        [$course, , , $context] = $this->setup_activity();
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($teacher);

        $this->assertEquals($student->id, \interactivevideo_util::resolve_target_userid($context, $student->id));
    }

    /**
     * A log cannot claim to belong to a different activity.
     */
    public function test_foreign_instance_rejected(): void {
        $this->resetAfterTest();
        [, , , $context] = $this->setup_activity();
        [, $otherinstance] = $this->setup_activity();

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::validate_module_instance($context, $otherinstance->id);
    }
}
