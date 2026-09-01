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

namespace ivplugin_contentbank;

/**
 * A content bank item must be authorised against the context it actually lives in.
 *
 * The service checks the caller's supplied contextid, but content bank resolves an item by id
 * regardless of context, so without a second check a teacher in one course could render
 * another course's content.
 *
 * @package    ivplugin_contentbank
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \ivplugin_contentbank\external\getitem
 *
 * The class under test pulls in the legacy lib/externallib.php, which Moodle refuses to
 * load in a shared PHPUnit process, so each test runs isolated.
 *
 * @runTestsInSeparateProcesses
 */
final class getitem_access_test extends \advanced_testcase {
    /**
     * Create a content bank item in a course.
     *
     * @param stdClass $course The course.
     * @return array [contextid, contentid]
     */
    private function make_item(\stdClass $course): array {
        $context = \context_course::instance($course->id);
        $generator = $this->getDataGenerator()->get_plugin_generator('core_contentbank');
        $contents = $generator->generate_contentbank_data(
            'contenttype_h5p',
            1,
            (int) get_admin()->id,
            $context,
            true
        );
        $content = reset($contents);

        return [$context->id, $content->get_id()];
    }

    /**
     * A teacher may render an item that lives in their own course.
     */
    public function test_item_in_own_course_is_allowed(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        [$contextid, $contentid] = $this->make_item($course);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $result = \ivplugin_contentbank\external\getitem::execute($contentid, $contextid);

        $this->assertArrayHasKey('item', $result);
    }

    /**
     * A teacher may not render an item belonging to a course they have no access to.
     */
    public function test_item_from_another_course_is_refused(): void {
        $this->resetAfterTest();
        $mycourse = $this->getDataGenerator()->create_course();
        $othercourse = $this->getDataGenerator()->create_course();
        [, $foreigncontentid] = $this->make_item($othercourse);
        $mycontextid = \context_course::instance($mycourse->id)->id;

        $teacher = $this->getDataGenerator()->create_and_enrol($mycourse, 'editingteacher');
        $this->setUser($teacher);

        // Own course's context passes the first check; the item's real context must not.
        $this->expectException(\required_capability_exception::class);
        \ivplugin_contentbank\external\getitem::execute($foreigncontentid, $mycontextid);
    }

    /**
     * A teacher in both courses may still reach the item.
     */
    public function test_item_is_allowed_when_teacher_has_access_in_both(): void {
        $this->resetAfterTest();
        $mycourse = $this->getDataGenerator()->create_course();
        $othercourse = $this->getDataGenerator()->create_course();
        [, $foreigncontentid] = $this->make_item($othercourse);
        $mycontextid = \context_course::instance($mycourse->id)->id;

        $teacher = $this->getDataGenerator()->create_and_enrol($mycourse, 'editingteacher');
        $this->getDataGenerator()->enrol_user($teacher->id, $othercourse->id, 'editingteacher');
        $this->setUser($teacher);

        $result = \ivplugin_contentbank\external\getitem::execute($foreigncontentid, $mycontextid);

        $this->assertArrayHasKey('item', $result);
    }

    /**
     * An unknown item id is refused rather than silently rendering nothing.
     */
    public function test_unknown_item_is_refused(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $contextid = \context_course::instance($course->id)->id;
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->expectException(\dml_missing_record_exception::class);
        \ivplugin_contentbank\external\getitem::execute(-1, $contextid);
    }
}
