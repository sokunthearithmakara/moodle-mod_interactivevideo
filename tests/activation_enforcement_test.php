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

use mod_interactivevideo\local\contenttype_activation;
use mod_interactivevideo\local\registration_client;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

/**
 * Licence enforcement for paid content types.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\contenttype_activation
 */
final class activation_enforcement_test extends \advanced_testcase {
    /** @var string A component name that no installed plugin uses. */
    private const FAKE = 'local_ivtestpaid';

    /**
     * Mark a component as paid, the way registering a purchase email setting does.
     *
     * @param string $component
     */
    private function mark_paid(string $component): void {
        $known = contenttype_activation::get_paid_components();
        $known[] = $component;
        set_config(
            contenttype_activation::CONFIG_PAIDCOMPONENTS,
            implode(',', array_unique($known)),
            'mod_interactivevideo'
        );
    }

    /**
     * Put a component into the state a successful activation leaves behind.
     *
     * @param string $component
     * @param string $email
     */
    private function activate_locally(string $component, string $email = 'buyer@example.com'): void {
        set_config('purchaseemail', $email, $component);
        set_config(
            contenttype_activation::CONFIG_HASHKEY,
            registration_client::build_activation_hashkey($component, $email),
            $component
        );
        set_config(contenttype_activation::CONFIG_CONFIRMED, time(), $component);
    }

    /**
     * A paid, activated type keeps working after the activation cache is purged.
     *
     * This is the regression the whole change exists for: the cache has no TTL and is not seeded
     * on install, so before this an admin purging caches silently disabled paid content.
     */
    public function test_activation_survives_a_cache_purge(): void {
        global $DB;
        $this->resetAfterTest();

        $this->mark_paid(self::FAKE);
        $this->activate_locally(self::FAKE);
        $this->assertTrue(contenttype_activation::is_usable(self::FAKE));

        \cache::make('mod_interactivevideo', 'iv_activation')->purge();

        $this->assertTrue(
            contenttype_activation::is_usable(self::FAKE),
            'A purged cache must not disable a properly activated content type'
        );

        // It must survive on the stored confirmation, NOT by falling into grace. Grace queues a
        // confirmation task, so its absence is what proves which path was taken. Without this
        // the assertion above passes either way and the test is worthless.
        $this->assertEquals(
            0,
            $DB->count_records('task_adhoc', ['classname' => '\mod_interactivevideo\task\confirm_activation']),
            'A stored confirmation must satisfy the check outright, without entering grace'
        );
    }

    /**
     * With no confirmation ever recorded, the type is granted grace and a confirmation queued.
     */
    public function test_unconfirmed_activation_gets_grace_and_queues_confirmation(): void {
        global $DB;
        $this->resetAfterTest();

        $this->mark_paid(self::FAKE);
        $this->activate_locally(self::FAKE);
        // A site restored from backup: the hash is present, but nothing confirmed it here.
        unset_config(contenttype_activation::CONFIG_CONFIRMED, self::FAKE);
        \cache::make('mod_interactivevideo', 'iv_activation')->purge();

        $this->assertTrue(contenttype_activation::is_usable(self::FAKE));
        // Called twice on purpose: a burst of requests must not queue a task each time.
        $this->assertTrue(contenttype_activation::is_usable(self::FAKE));

        $this->assertEquals(
            1,
            $DB->count_records('task_adhoc', ['classname' => '\mod_interactivevideo\task\confirm_activation']),
            'Grace must queue exactly one background confirmation'
        );
    }

    /**
     * Grace does not last forever.
     */
    public function test_expired_grace_is_not_usable(): void {
        $this->resetAfterTest();

        $this->mark_paid(self::FAKE);
        $this->activate_locally(self::FAKE);
        unset_config(contenttype_activation::CONFIG_CONFIRMED, self::FAKE);

        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cache->purge();
        // Older than the grace window, which is measured in days.
        $cache->set(self::FAKE . '__grace', time() - YEARSECS);

        $this->assertFalse(contenttype_activation::is_usable(self::FAKE));
    }

    /**
     * A paid type that was never activated here is not usable.
     */
    public function test_paid_but_never_activated_is_not_usable(): void {
        $this->resetAfterTest();

        $this->mark_paid(self::FAKE);

        $this->assertFalse(contenttype_activation::is_usable(self::FAKE));
    }

    /**
     * A validationhash that does not match the stored purchase email is rejected.
     */
    public function test_mismatched_hash_is_not_usable(): void {
        $this->resetAfterTest();

        $this->mark_paid(self::FAKE);
        $this->activate_locally(self::FAKE);
        // Same shape, different email: the hash no longer matches.
        set_config('purchaseemail', 'someone.else@example.com', self::FAKE);

        $this->assertFalse(contenttype_activation::is_usable(self::FAKE));
    }

    /**
     * A free content type is never gated.
     */
    public function test_free_component_is_always_usable(): void {
        $this->resetAfterTest();

        $this->assertTrue(contenttype_activation::is_usable('ivplugin_richtext'));
    }

    /**
     * The purchase email marker alone is enough, without any catalog entry.
     */
    public function test_purchaseemail_marker_alone_makes_a_component_paid(): void {
        $this->resetAfterTest();

        $this->assertFalse(contenttype_activation::is_paid(self::FAKE));

        $this->mark_paid(self::FAKE);

        $this->assertTrue(
            contenttype_activation::is_paid(self::FAKE),
            'A component is paid if it declares a purchase email, whatever the catalog says'
        );
    }

    /**
     * An installed content type, chosen at runtime so the test does not depend on any one plugin.
     *
     * @return array [type name, component]
     */
    private function pick_installed_type(): array {
        foreach (\interactivevideo_util::get_all_activitytypes_unfiltered() as $properties) {
            $component = $properties['component'] ?? ($properties['stringcomponent'] ?? '');
            // Chapter is force-added to the player list, so it cannot be used to test removal.
            if ($component !== '' && $properties['name'] !== 'chapter') {
                return [$properties['name'], $component];
            }
        }

        $this->markTestSkipped('No content type is enabled on this site');
    }

    /**
     * The player never receives a deactivated type; the editor keeps it, flagged.
     */
    public function test_deactivated_type_is_dropped_for_the_player_but_kept_for_the_editor(): void {
        $this->resetAfterTest();

        [$type, $component] = $this->pick_installed_type();
        $this->mark_paid($component);

        $playertypes = array_column(\interactivevideo_util::get_all_activitytypes(true), 'name');
        $this->assertNotContains($type, $playertypes, 'Learners must not be offered a deactivated type');

        $editortypes = \interactivevideo_util::get_all_activitytypes();
        $editorentry = null;
        foreach ($editortypes as $properties) {
            if ($properties['name'] === $type) {
                $editorentry = $properties;
            }
        }

        $this->assertNotNull($editorentry, 'Authored content must stay visible to teachers');
        $this->assertNotEmpty($editorentry['inactive']);
        $this->assertNotEmpty($editorentry['hideonchooser'], 'A locked type must not be offerable in the chooser');
    }

    /**
     * The class allow lists drop a deactivated type entirely, rather than merely flagging it.
     */
    public function test_deactivated_type_is_absent_from_the_usable_list(): void {
        $this->resetAfterTest();

        [$type, $component] = $this->pick_installed_type();
        $this->mark_paid($component);

        $usable = array_column(\interactivevideo_util::get_usable_activitytypes(), 'name');

        $this->assertNotContains($type, $usable);
    }

    /**
     * Creating or editing an interaction of a deactivated type is refused server side.
     */
    public function test_require_usable_type_rejects_a_deactivated_type(): void {
        $this->resetAfterTest();

        [$type, $component] = $this->pick_installed_type();
        $this->mark_paid($component);

        $this->expectException(\moodle_exception::class);
        \interactivevideo_util::require_usable_type($type);
    }

    /**
     * Deactivating a content type must not move anybody's grade.
     *
     * The reachable-items rule feeds grading, completion and the activity card. If a deactivated
     * type were dropped from it, a learner who had completed 3 of 5 interactions would silently
     * become 3 of 3.
     */
    public function test_deactivation_does_not_change_the_grade_denominator(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        [$type, $component] = $this->pick_installed_type();

        $course = $this->getDataGenerator()->create_course();
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');
        $instance = $gen->create_instance([
            'course' => $course->id,
            'starttime' => 0,
            'endtime' => 600,
        ]);
        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);
        $contextid = \context_module::instance($cm->id)->id;
        $gen->create_item($instance, ['type' => $type, 'hascompletion' => 1, 'xp' => 10, 'timestamp' => 5]);

        // Deactivate before measuring. The enabled-name list is memoised against the configured
        // content types, which deactivation does not change, so flipping activation midway
        // through a single request would be masked by the memo and prove nothing.
        $this->mark_paid($component);
        $this->assertFalse(contenttype_activation::is_usable($component), 'Fixture must be deactivated');

        $this->assertContains(
            $type,
            \interactivevideo_util::get_enabled_type_names(),
            'The grade denominator must still recognise a deactivated type'
        );

        $reachable = \interactivevideo_util::get_reachable_gradable_items($instance->id, $contextid);

        $this->assertCount(
            1,
            $reachable,
            'Deactivating a content type must not remove its interactions from the grade denominator'
        );
    }
}
