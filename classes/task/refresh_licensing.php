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

namespace mod_interactivevideo\task;

use mod_interactivevideo\local\contenttype_activation;
use mod_interactivevideo\local\plugins_catalog;

/**
 * Keep licensing state fresh out of band.
 *
 * Everything here is work the request path deliberately refuses to do: fetching the plugins
 * catalog, and re-confirming activations with the license server. Doing it on a schedule is what
 * lets the enforcement path stay purely local.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class refresh_licensing extends \core\task\scheduled_task {
    /**
     * @var int Re-confirm an activation once its stored confirmation is older than this. Well
     * inside the window after which a confirmation stops counting, so a site running cron never
     * reaches expiry.
     */
    private const REFRESH_AFTER = 604800;

    /**
     * Task name shown in the admin task list.
     *
     * @return string
     */
    public function get_name() {
        return get_string('task_refreshlicensing', 'mod_interactivevideo');
    }

    /**
     * Run the refresh.
     */
    public function execute() {
        $this->refresh_catalog();
        $this->prune_paid_components();
        $this->queue_stale_confirmations();
    }

    /**
     * Refresh the plugins catalog so the enforcement path always reads a warm cache.
     */
    private function refresh_catalog(): void {
        $catalog = plugins_catalog::refresh_catalog();
        $count = count($catalog['subplugins'] ?? []);
        mtrace("mod_interactivevideo: refreshed plugins catalog ({$count} entries)");
    }

    /**
     * Drop components that are no longer installed from the paid registry.
     *
     * Pruning is by installation, not by declaration: a plugin that stops registering a purchase
     * email setting stays known-paid while it remains installed.
     */
    private function prune_paid_components(): void {
        $known = contenttype_activation::get_paid_components();
        if (!$known) {
            return;
        }

        // Deliberately a component-directory test rather than a content type listing. This
        // registry is shared: mod_flexbook has content types of its own, and several paid
        // plugins that register the same purchase email setting are not content types at all
        // (a module, two editor plugins). Pruning against interactive video's content types
        // alone would drop every one of those on the first nightly run.
        //
        // Conservative on purpose. A plugin uninstalled through the UI usually keeps its
        // directory, so it stays marked paid until the files are removed. Keeping a stale
        // marker only means enforcement stays on for something not installed, which is
        // harmless; dropping a live one would silently stop enforcing a paid plugin.
        $kept = array_values(array_filter($known, function ($component) {
            return \core_component::get_component_directory($component) !== null;
        }));

        if ($kept !== $known) {
            set_config(
                contenttype_activation::CONFIG_PAIDCOMPONENTS,
                implode(',', $kept),
                'mod_interactivevideo'
            );
            $dropped = implode(', ', array_diff($known, $kept));
            mtrace("mod_interactivevideo: pruned uninstalled paid components ({$dropped})");
        }
    }

    /**
     * Queue a re-confirmation for every paid component whose stored confirmation is going stale.
     */
    private function queue_stale_confirmations(): void {
        foreach (contenttype_activation::get_paid_components() as $component) {
            if (!get_config($component, contenttype_activation::CONFIG_HASHKEY)) {
                // Never activated here; nothing to confirm.
                continue;
            }

            $confirmed = (int) get_config($component, contenttype_activation::CONFIG_CONFIRMED);
            if ($confirmed > 0 && (time() - $confirmed) < self::REFRESH_AFTER) {
                continue;
            }

            contenttype_activation::queue_confirmation($component);
            mtrace("mod_interactivevideo: queued activation confirmation for {$component}");
        }
    }
}
