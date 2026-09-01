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
 * Warns an administrator about enabled content types that cannot be used.
 *
 * Enforcement is silent by design: an unactivated paid content type is dropped from the player,
 * locked in the editor and refused by every write path. Without this the only symptom is that
 * interactions stop appearing, with nothing saying why.
 *
 * Shared with mod_flexbook, which has content types of its own but the same licensing.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class activation_notice {
    /** @var string The interactive video module. */
    public const MODULE_INTERACTIVEVIDEO = 'mod_interactivevideo';

    /** @var string The flexbook module. */
    public const MODULE_FLEXBOOK = 'mod_flexbook';

    /**
     * Enabled content types that this site may not use.
     *
     * Scoped to the types the site has enabled, which are the ones an administrator expects to
     * work and whose interactions have just stopped rendering. A type that is installed but
     * disabled is not reported: nobody is trying to use it.
     *
     * Built from the module's own enabled list rather than installed_contenttypes::get_all().
     * That enumerates external content types with get_plugins_with_function('ivplugin'), which
     * returns nothing while an upgrade is running — during db/upgrade.php it sees only the five
     * bundled types, none of which are paid, so the warning could never fire from the very place
     * it is most wanted. The enabled list is a configuration string naming components directly,
     * so it works everywhere and touches neither the network nor the plugin function cache.
     *
     * @param string $module One of the MODULE_* constants.
     * @return array Component name => human readable title, sorted by title.
     */
    public static function unusable(string $module): array {
        $unusable = [];

        foreach (self::enabled_types($module) as $properties) {
            $component = $properties['component'] ?? ($properties['stringcomponent'] ?? '');
            if ($component === '' || contenttype_activation::is_usable($component)) {
                continue;
            }

            $unusable[$component] = (string) ($properties['title'] ?? $component);
        }

        asort($unusable, SORT_NATURAL | SORT_FLAG_CASE);

        return $unusable;
    }

    /**
     * The content types the module has enabled, with activation not yet applied.
     *
     * Each module keeps its own enabled list, and flexbook additionally only accepts types that
     * opt in, so asking the module is what keeps the warning accurate for it.
     *
     * @param string $module One of the MODULE_* constants.
     * @return array
     */
    private static function enabled_types(string $module): array {
        global $CFG;

        if ($module === self::MODULE_FLEXBOOK) {
            if (!class_exists('\mod_flexbook\util')) {
                return [];
            }
            return \mod_flexbook\util::get_all_activitytypes_unfiltered();
        }

        require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

        return \interactivevideo_util::get_all_activitytypes_unfiltered();
    }

    /**
     * A plain prose warning naming the unusable content types, or null when there is nothing wrong.
     *
     * Deliberately free of markup. The CLI renderer runs clean_text() over notifications and drops
     * the title and icon entirely, so this has to read correctly as a bare sentence during
     * php admin/cli/upgrade.php as well as in the browser.
     *
     * @param string $module One of the MODULE_* constants.
     * @return string|null
     */
    public static function message(string $module): ?string {
        $unusable = self::unusable($module);
        if (!$unusable) {
            return null;
        }

        return get_string('activationnoticemessage', 'mod_interactivevideo', implode(', ', $unusable))
            . ' ' . get_string('activationnoticeaction', 'mod_interactivevideo');
    }
}
