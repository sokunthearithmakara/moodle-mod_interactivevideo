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
 * Load core_external class names on Moodle versions before 4.2.
 *
 * Moodle 4.2 namespaced the external API classes (MDL-76583). Using the
 * namespaced forms avoids deprecation debugging on 4.2+, while aliases keep
 * the same code working on Moodle 4.0 and 4.1.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class external_compat {
    /** @var bool Whether aliases have already been considered. */
    private static $loaded = false;

    /**
     * Ensure \core_external\* classes can be referenced.
     */
    public static function load(): void {
        if (self::$loaded) {
            return;
        }
        self::$loaded = true;

        if (class_exists(\core_external\external_api::class, true)) {
            return;
        }

        global $CFG;
        require_once($CFG->libdir . '/externallib.php');
        class_alias(\external_api::class, \core_external\external_api::class);
        class_alias(\external_function_parameters::class, \core_external\external_function_parameters::class);
        class_alias(\external_value::class, \core_external\external_value::class);
        class_alias(\external_single_structure::class, \core_external\external_single_structure::class);
        class_alias(\external_multiple_structure::class, \core_external\external_multiple_structure::class);
    }
}
