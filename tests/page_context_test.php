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
 * Rendering a course page must not move the page context around.
 *
 * get_items() sets $PAGE->context so format_string() can run over the titles. Anything reached
 * while a course page renders must not do that: the second interactive video in a course switches
 * the context from one module to another, and Moodle answers with
 * "Coding problem: unsupported modification of PAGE->context from 70 to 70".
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_util::get_reachable_gradable_items
 */
final class page_context_test extends \advanced_testcase {
    /**
     * The reachability rule leaves the page context alone.
     *
     * Two activities, because a single one would set the context to its own module and Moodle
     * only complains on the switch between two module contexts.
     */
    public function test_reachability_does_not_move_the_page_context(): void {
        global $PAGE;

        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');

        $contexts = [];
        foreach ([0, 1] as $unused) {
            $instance = $gen->create_instance(['course' => $course->id, 'starttime' => 0, 'endtime' => 600]);
            $gen->create_item($instance, ['hascompletion' => 1, 'xp' => 10, 'timestamp' => 5]);
            $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
            $contexts[] = [$instance->id, \context_module::instance($cm->id)->id];
        }

        // A course page has the course context set before any activity renders.
        $PAGE->set_context(\context_course::instance($course->id));
        $before = $PAGE->context->id;

        foreach ($contexts as [$instanceid, $contextid]) {
            \interactivevideo_util::get_reachable_gradable_items($instanceid, $contextid);
        }

        $this->assertDebuggingNotCalled('Resolving reachable items must not touch $PAGE->context');
        $this->assertEquals($before, $PAGE->context->id, 'The page context must be left as the caller set it');
    }
}
