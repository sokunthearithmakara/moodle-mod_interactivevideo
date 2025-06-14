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

namespace ivplugin_skipsegment\external;

use external_function_parameters;
use external_single_structure;
use external_api;
use external_value;

defined('MOODLE_INTERNAL') || die;

require_once($CFG->libdir . '/externallib.php');
/**
 * Class add_skip
 *
 * @package    ivplugin_skipsegment
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class add_skip extends external_api {

    /**
     * Describes the parameters for ivplugin_skipsegment_add_skip
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'skipdata' => new external_value(PARAM_TEXT, 'The data of the skip segment'),
            'contextid' => new external_value(PARAM_INT, 'The context id of the skip segment'),
        ]);
    }

    /**
     * Implementation of web service ivplugin_skipsegment_add_skip
     * @param string $skipdata The data of the skip segment
     * @param int $contextid The context id of the skip segment
     * @return array
     */
    public static function execute($skipdata, $contextid) {
        global $DB;
        // Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'skipdata' => $skipdata,
            'contextid' => $contextid,
        ]);

        require_login();
        $context = \context::instance_by_id($contextid);
        self::validate_context($context);
        require_capability('mod/interactivevideo:edit', $context);

        $data = json_decode($skipdata, true);
        $courseid = $data['courseid'];
        $defaults = $DB->get_record(
            'interactivevideo_defaults',
            ['courseid' => $courseid, 'type' => 'skipsegment'],
            'advanced',
            IGNORE_MISSING
        );
        if ($defaults) {
            $data['advanced'] = $defaults->advanced;
        }
        $data['timecreated'] = time();
        $data['timemodified'] = time();
        $data['id'] = $DB->insert_record('interactivevideo_items', (object)$data);
        return [
            'data' => json_encode($data),
        ];
    }

    /**
     * Describe the return structure for ivplugin_contentbank_getitem
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'data' => new external_value(PARAM_TEXT, 'The data of the skip segment'),
        ]);
    }
}
