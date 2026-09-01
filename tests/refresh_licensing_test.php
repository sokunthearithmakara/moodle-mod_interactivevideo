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

/**
 * The nightly licensing task keeps the paid registry honest.
 *
 * The registry is shared: mod_flexbook has content types of its own, and several paid plugins
 * that register the same purchase email setting are not content types at all. Pruning it against
 * one module's content type listing would silently stop enforcing those.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\task\refresh_licensing
 */
final class refresh_licensing_test extends \advanced_testcase {
    /**
     * Seed the paid registry.
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
     * Run only the prune step, without the network refresh the full task performs.
     */
    private function run_prune(): void {
        $task = new \mod_interactivevideo\task\refresh_licensing();
        $method = new \ReflectionMethod($task, 'prune_paid_components');
        $method->setAccessible(true);
        $method->invoke($task);
    }

    /**
     * A component whose plugin is gone from disk is dropped.
     */
    public function test_uninstalled_component_is_pruned(): void {
        $this->resetAfterTest();

        $this->set_registry(['mod_interactivevideo', 'local_ivgonefromdisk']);
        // The task traces what it dropped; assert on it rather than letting it leak as output.
        $this->expectOutputRegex('/pruned uninstalled paid components \(local_ivgonefromdisk\)/');
        $this->run_prune();

        $kept = contenttype_activation::get_paid_components();
        $this->assertContains('mod_interactivevideo', $kept);
        $this->assertNotContains('local_ivgonefromdisk', $kept);
    }

    /**
     * Paid plugins that are not interactive video content types survive the prune.
     *
     * This is the regression: pruning against interactive video's content type listing dropped
     * every flexbook content type and every non-content-type paid plugin on the first run.
     */
    public function test_non_contenttype_components_survive(): void {
        $this->resetAfterTest();

        // Installed components that are definitely not interactive video content types.
        // mod_flexbook is deliberately included but filtered below: it is absent from a plugin
        // CI checkout, and the point is that whatever IS installed survives.
        $survivors = ['mod_flexbook', 'tool_task', 'core', 'mod_interactivevideo'];
        $installed = array_values(array_filter($survivors, function ($component) {
            return \core_component::get_component_directory($component) !== null;
        }));
        $this->assertNotEmpty($installed, 'Fixture needs at least one installed non-content-type');

        $this->set_registry($installed);
        $this->run_prune();

        foreach ($installed as $component) {
            $this->assertContains(
                $component,
                contenttype_activation::get_paid_components(),
                "{$component} is installed and must not be pruned"
            );
        }
    }

    /**
     * An unchanged registry is left alone rather than rewritten every night.
     */
    public function test_unchanged_registry_is_not_rewritten(): void {
        $this->resetAfterTest();

        // Only components that are certainly present: mod_flexbook is a separate plugin and is
        // absent from a plugin CI checkout, where pruning it would rewrite the registry.
        $this->set_registry(['mod_interactivevideo']);
        $before = get_config('mod_interactivevideo', contenttype_activation::CONFIG_PAIDCOMPONENTS);

        $this->run_prune();

        $this->assertSame(
            $before,
            get_config('mod_interactivevideo', contenttype_activation::CONFIG_PAIDCOMPONENTS)
        );
    }

    /**
     * An empty registry is handled without touching configuration.
     */
    public function test_empty_registry_is_a_no_op(): void {
        $this->resetAfterTest();

        $this->set_registry([]);
        $this->run_prune();

        $this->assertSame([], contenttype_activation::get_paid_components());
    }
}
