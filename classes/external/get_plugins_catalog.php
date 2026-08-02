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

namespace mod_interactivevideo\external;

use external_api;
use external_function_parameters;
use external_single_structure;
use external_value;
use mod_interactivevideo\local\plugins_catalog;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');

/**
 * Web service to fetch the content types catalog.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_plugins_catalog extends external_api {
    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'target' => new external_value(
                PARAM_PLUGIN,
                'Target module for catalog filtering (mod_interactivevideo or mod_flexbook)',
                VALUE_DEFAULT,
                plugins_catalog::TARGET_INTERACTIVEVIDEO,
            ),
            'refresh' => new external_value(
                PARAM_BOOL,
                'When true, refetch the remote catalog and update the cache',
                VALUE_DEFAULT,
                false,
            ),
        ]);
    }

    /**
     * Fetch catalog JSON.
     *
     * @param string $target Target module name.
     * @param bool $refresh When true, refetch the remote catalog.
     * @return array{catalog: string}
     */
    public static function execute(
        string $target = plugins_catalog::TARGET_INTERACTIVEVIDEO,
        bool $refresh = false,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'target' => $target,
            'refresh' => $refresh,
        ]);

        $context = \context_system::instance();
        self::validate_context($context);
        require_capability('moodle/site:config', $context);

        $allowed = [
            plugins_catalog::TARGET_INTERACTIVEVIDEO,
            plugins_catalog::TARGET_FLEXBOOK,
        ];
        if (!in_array($params['target'], $allowed, true)) {
            throw new \invalid_parameter_exception('Invalid catalog target');
        }

        $installedrows = self::get_installed_rows($params['target']);
        $catalog = plugins_catalog::get_enriched_catalog(
            $params['target'],
            $installedrows,
            !empty($params['refresh']),
        );

        return [
            'catalog' => json_encode($catalog, JSON_UNESCAPED_UNICODE),
        ];
    }

    /**
     * Resolve installed content type rows for a catalog target.
     *
     * @param string $target
     * @return array<int, array<string, mixed>>
     */
    private static function get_installed_rows(string $target): array {
        if ($target === plugins_catalog::TARGET_FLEXBOOK) {
            return \mod_flexbook\local\installed_contenttypes::get_all();
        }

        return \mod_interactivevideo\local\installed_contenttypes::get_all();
    }

    /**
     * Return structure.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'catalog' => new external_value(PARAM_RAW, 'JSON-encoded catalog'),
        ]);
    }
}
