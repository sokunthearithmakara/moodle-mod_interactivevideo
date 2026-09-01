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

namespace mod_interactivevideo\local;

/**
 * Helpers for installed Interactive Video content type plugins.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class installed_contenttypes {
    /**
     * Return metadata for all installed content type plugins.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function get_all(): array {
        $enabledraw = get_config('mod_interactivevideo', 'enablecontenttypes');
        $enabledlist = $enabledraw !== false && $enabledraw !== '' ? explode(',', $enabledraw) : [];
        $hasenabledconfig = $enabledraw !== false && $enabledraw !== '';

        $types = [];

        foreach (array_keys(\core_component::get_plugin_list('ivplugin')) as $subplugin) {
            $types[] = self::build_row('ivplugin_' . $subplugin, false, $enabledlist, $hasenabledconfig);
        }

        $customs = get_plugins_with_function('ivplugin');
        foreach ($customs as $custom) {
            foreach ($custom as $function) {
                $component = str_replace('_ivplugin', '', $function);
                $types[] = self::build_row($component, true, $enabledlist, $hasenabledconfig);
            }
        }

        usort($types, static function (array $a, array $b): int {
            return strcasecmp($a['title'], $b['title']);
        });

        return $types;
    }

    /**
     * Comma-separated list of all installed components (default when setting is empty).
     *
     * @return string
     */
    public static function get_default_enabled(): string {
        $components = array_column(self::get_all(), 'component');
        return implode(',', $components);
    }

    /**
     * Build a single installed plugin row.
     *
     * @param string $component
     * @param bool $external
     * @param string[] $enabledlist
     * @param bool $hasenabledconfig
     * @return array<string, mixed>
     */
    private static function build_row(
        string $component,
        bool $external,
        array $enabledlist,
        bool $hasenabledconfig
    ): array {
        $versionconfig = get_config($component);
        $version = !empty($versionconfig->version) ? (string) $versionconfig->version : '';

        $title = get_string('pluginname', $component);
        $icon = 'bi bi-cursor';
        $description = '';
        $props = null;

        $class = $component . '\\main';
        if (class_exists($class)) {
            try {
                $instance = new $class();
                if (method_exists($instance, 'get_property')) {
                    $props = $instance->get_property();
                    if (!empty($props['title'])) {
                        $title = $props['title'];
                    }
                    if (!empty($props['icon'])) {
                        $icon = $props['icon'];
                    }
                    if (!empty($props['description'])) {
                        $description = $props['description'];
                    }
                }
            } catch (\Throwable $e) {
                debugging(
                    'Failed to load content type properties for ' . $component . ': ' . $e->getMessage(),
                    DEBUG_DEVELOPER,
                );
            }
        }

        $enabled = !$hasenabledconfig || in_array($component, $enabledlist, true);
        $activation = self::resolve_activation_fields($component);

        return [
            'component' => $component,
            'title' => $title,
            'icon' => $icon,
            'description' => $description,
            'version' => $version,
            'external' => $external,
            'enabled' => $enabled,
            'paid' => $activation['paid'],
            'activated' => $activation['activated'],
        ];
    }

    /**
     * Resolve paid flag and activation status for an installed plugin row.
     *
     * @param string $component Plugin component.
     * @return array Paid and activated flags for the installed row.
     */
    private static function resolve_activation_fields(string $component): array {
        // Deliberately the local paid lookup, not plugins_catalog::is_paid_component(): that one
        // goes through ensure_catalog(), which fetches the remote catalog on a cold cache with a
        // 10s connect / 15s total timeout. This list is rendered on the settings page and on the
        // admin notifications page, neither of which may wait on the network.
        if (!contenttype_activation::is_paid($component)) {
            return ['paid' => false, 'activated' => false];
        }

        $status = contenttype_activation::ensure_activation($component, false);

        return [
            'paid' => true,
            // Strict: whether the license server's answer is currently held. This is what the
            // badge reports.
            'activated' => !empty($status['active']),
        ];
    }
}
