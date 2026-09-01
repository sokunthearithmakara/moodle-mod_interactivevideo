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

/**
 * An inline activity drops its link only on the pages that draw the card.
 *
 * set_no_view_link() nulls cm_info::$url. Applying it anywhere else is fatal the moment
 * navigation, the course index or a block casts that URL to a string — and it must not be
 * applied to the mobile app, which fetches course contents over web services and renders the
 * activity link itself.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_page_lists_activities
 * @covers     \interactivevideo_cm_info_dynamic
 */
final class cm_url_probe_test extends \advanced_testcase {
    /**
     * Build a course with one inline-display activity and return its module URL.
     *
     * @param string $bodyclass A body class to apply before modinfo resolves, or '' for none.
     * @return moodle_url|null
     */
    private function url_with_body_class(string $bodyclass) {
        global $PAGE;

        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance(['course' => $course->id, 'displayinline' => 1]);
        $cmid = get_coursemodule_from_instance(
            'interactivevideo',
            $instance->id,
            0,
            false,
            MUST_EXIST
        )->id;

        if ($bodyclass !== '') {
            $PAGE->add_body_class($bodyclass);
        }
        // Dynamic data is cached per request, so resolve it under these body classes.
        get_fast_modinfo(0, 0, true);

        return get_fast_modinfo($course)->get_cm($cmid)->url;
    }

    /**
     * With no listing body class the URL must survive, or link builders fatal.
     *
     * This is also the mobile app's case: a web service request carries neither body class,
     * because body classes derive from the page type and it has no course-view page type.
     */
    public function test_url_survives_without_a_listing_body_class(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $url = $this->url_with_body_class('');

        $this->assertNotNull($url, 'URL must remain available off the listing pages');
        $this->assertIsString((string) $url);
    }

    /**
     * On course view the card supplies its own link, so the URL is dropped.
     */
    public function test_url_is_dropped_on_course_view(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $this->assertNull($this->url_with_body_class('path-course-view'));
    }

    /**
     * The site home lists activities the same way, and was the original bug.
     */
    public function test_url_is_dropped_on_site_home(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $this->assertNull($this->url_with_body_class('path-site'));
    }
}
