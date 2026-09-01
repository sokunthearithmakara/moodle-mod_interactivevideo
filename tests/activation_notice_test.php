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

use mod_interactivevideo\local\activation_notice;
use mod_interactivevideo\local\contenttype_activation;
use mod_interactivevideo\local\installed_contenttypes;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

/**
 * The administrator warning about content types awaiting activation.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\activation_notice
 */
final class activation_notice_test extends \advanced_testcase {
    /**
     * Replace the paid registry outright.
     *
     * @param array $components
     */
    private function set_registry(array $components): void {
        set_config(
            contenttype_activation::CONFIG_PAIDCOMPONENTS,
            implode(',', $components),
            'mod_interactivevideo'
        );
    }

    /**
     * Blank the catalog so only the registry decides what is paid.
     *
     * unusable() is the union of the registry and the catalog, so a test asserting an exact empty
     * result has to neutralise both or the bundled plugins.json supplies its own paid components.
     */
    private function isolate_catalog(): void {
        // Must be non-empty: plugins_catalog treats an empty subplugins list as a cache miss
        // and falls back to the bundled file, which supplies its own paid components.
        \cache::make('mod_interactivevideo', 'iv_plugins_catalog')->set('catalog', [
            'subplugins' => [['component' => 'local_ivtestfree', 'type' => 'free']],
        ]);
    }

    /**
     * An installed content type, chosen at runtime rather than naming a specific plugin.
     *
     * @return array [component, title]
     */
    private function pick_content_type(): array {
        foreach (\interactivevideo_util::get_all_activitytypes_unfiltered() as $properties) {
            $component = $properties['component'] ?? ($properties['stringcomponent'] ?? '');
            if ($component !== '' && class_exists($component . '\\main')) {
                return [$component, (string) ($properties['title'] ?? $component)];
            }
        }

        $this->markTestSkipped('No content type is installed on this site');
    }

    /**
     * A site with nothing awaiting activation gets no warning at all.
     */
    public function test_healthy_site_produces_no_message(): void {
        $this->resetAfterTest();

        // No paid components at all, and an empty catalog, so nothing can be unusable.
        $this->set_registry([]);
        $this->isolate_catalog();

        $this->assertSame([], activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO));
        $this->assertNull(activation_notice::message(activation_notice::MODULE_INTERACTIVEVIDEO));
    }

    /**
     * A paid content type that was never activated is named in the warning.
     */
    public function test_unactivated_content_type_is_reported(): void {
        $this->resetAfterTest();

        [$component, $title] = $this->pick_content_type();
        $this->set_registry([$component]);

        $unusable = activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO);

        $this->assertArrayHasKey($component, $unusable);
        $this->assertSame($title, $unusable[$component]);
        $this->assertStringContainsString($title, (string) activation_notice::message(
            activation_notice::MODULE_INTERACTIVEVIDEO
        ));
    }

    /**
     * A content type the administrator disabled is not reported.
     *
     * The warning is scoped to types the site has enabled, which are the ones somebody expects to
     * work. A disabled type is nobody's problem until it is enabled again. This pins that scope.
     */
    public function test_disabled_content_type_is_not_reported(): void {
        $this->resetAfterTest();

        [$component] = $this->pick_content_type();
        $this->set_registry([$component]);

        $this->assertArrayHasKey(
            $component,
            activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO),
            'Precondition: it is reported while enabled'
        );

        // Remove it from the enabled list entirely.
        $enabled = array_filter(
            explode(',', (string) get_config('mod_interactivevideo', 'enablecontenttypes')),
            fn($name) => trim($name) !== $component
        );
        set_config('enablecontenttypes', implode(',', $enabled), 'mod_interactivevideo');

        $this->assertArrayNotHasKey(
            $component,
            activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO),
            'A disabled type must not be reported'
        );
    }

    /**
     * A free content type is never reported.
     */
    public function test_free_content_type_is_not_reported(): void {
        $this->resetAfterTest();

        $this->set_registry([]);
        $this->isolate_catalog();

        $this->assertArrayNotHasKey(
            'ivplugin_richtext',
            activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO)
        );
    }

    /**
     * The paid registry never leaks into the warning.
     *
     * The registry holds paid plugins that are not content types at all (a module and two editor
     * plugins here), and may name a component this site has not installed. Enumerating the
     * enabled list rather than the registry is what keeps those out; this guards against anyone
     * reintroducing registry-driven enumeration.
     */
    public function test_registry_contents_are_not_reported(): void {
        $this->resetAfterTest();

        $this->set_registry(['tool_task', 'mod_flexbook', 'local_ivnotinstalledhere']);
        $this->isolate_catalog();

        $this->assertSame([], activation_notice::unusable(activation_notice::MODULE_INTERACTIVEVIDEO));
    }

    /**
     * The message reads as plain prose, because the CLI renderer strips markup.
     *
     * core_renderer_cli::notification() runs clean_text(), which escapes angle brackets, so any
     * markup or a stray ">" would surface to an administrator as literal entities.
     */
    public function test_message_carries_no_markup(): void {
        $this->resetAfterTest();

        [$component] = $this->pick_content_type();
        $this->set_registry([$component]);

        $message = (string) activation_notice::message(activation_notice::MODULE_INTERACTIVEVIDEO);

        $this->assertSame($message, clean_text($message), 'The message must survive clean_text() unchanged');
        $this->assertSame(strip_tags($message), $message);
    }

    /**
     * The installed list resolves "paid" locally, never through the catalog fetching path.
     *
     * resolve_activation_fields() used to call plugins_catalog::is_paid_component(), which goes
     * through ensure_catalog() and fetches the remote catalog on a cold cache with a 10s connect
     * / 15s total timeout. That list is rendered on the settings page and drives this warning, so
     * the stall was real.
     *
     * Asserted through behaviour rather than by watching the cache: a failed fetch leaves the
     * cache empty too, so "cache still empty" cannot tell a failed fetch from no fetch. The
     * registry is only consulted by the local lookup, so a component marked paid there and free
     * in the catalog pins exactly which of the two is in use.
     */
    public function test_installed_list_resolves_paid_locally(): void {
        $this->resetAfterTest();

        [$component] = $this->pick_content_type();

        // Registry says paid; catalog says free. Only the local union honours the registry.
        $this->set_registry([$component]);
        \cache::make('mod_interactivevideo', 'iv_plugins_catalog')->set('catalog', [
            'subplugins' => [['component' => $component, 'type' => 'free']],
        ]);

        $paid = [];
        foreach (installed_contenttypes::get_all() as $row) {
            $paid[$row['component']] = !empty($row['paid']);
        }

        $this->assertArrayHasKey($component, $paid);
        $this->assertTrue(
            $paid[$component],
            'The installed list must resolve paid through the local registry union, not the catalog'
        );
    }
}
