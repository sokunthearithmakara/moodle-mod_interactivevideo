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
require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

/**
 * The watch progress bar renders even when an activity has no gradable interactions.
 *
 * An analytics interaction is not gradable, so it is absent from the reachable-gradable set
 * that drives the card's counts. The card must not treat that as "nothing to show".
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_displayinline
 */
final class displayinline_analytics_test extends \advanced_testcase {
    /**
     * Render the inline card for a course whose only interaction is the given one.
     *
     * @param array $itemfields Fields for the single interaction to create.
     * @return string The rendered card HTML.
     */
    private function render_card_with_single_item(array $itemfields): string {
        global $DB, $PAGE;

        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance([
            'course' => $course->id,
            'displayinline' => 1,
            'showprogressbar' => 1,
            'showposterimage' => 1,
            'starttime' => 0,
            'endtime' => 600,
        ]);
        // The local_ivanalytics subplugin seeds its own analytics interaction from the module form when a
        // watch-completion rule is set. Clear it so the fixture holds exactly one interaction.
        $DB->delete_records('interactivevideo_items', ['annotationid' => $instance->id]);
        $gen->create_item($instance, $itemfields);

        $cmid = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST)->id;
        $PAGE->set_url('/course/view.php', ['id' => $course->id]);

        return interactivevideo_displayinline(get_fast_modinfo($course)->get_cm($cmid));
    }

    /**
     * An analytics-only activity still renders its progress bar.
     */
    public function test_analytics_only_activity_renders_progress_bar(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        if (!in_array('analytics', \interactivevideo_util::get_enabled_type_names(), true)) {
            $this->markTestSkipped('local_ivanalytics is not installed or enabled on this site');
        }

        $html = $this->render_card_with_single_item([
            'type' => 'analytics',
            'hascompletion' => 0,
            'timestamp' => -1,
            'xp' => 0,
            'char1' => '80',
        ]);

        $this->assertStringContainsString(
            'hasanalytics',
            $html,
            'The watch progress bar must render even with no gradable interactions'
        );
    }

    /**
     * An activity with neither gradable interactions nor analytics still short-circuits.
     */
    public function test_activity_with_nothing_to_show_is_marked_empty(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $html = $this->render_card_with_single_item([
            'type' => 'richtext',
            'hascompletion' => 0,
            'timestamp' => 5,
            'xp' => 0,
        ]);

        $this->assertStringNotContainsString('hasanalytics', $html);
    }
}
