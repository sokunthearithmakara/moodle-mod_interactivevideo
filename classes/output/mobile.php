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

namespace mod_interactivevideo\output;

defined('MOODLE_INTERNAL') || die();
require_once($CFG->dirroot . '/lib/externallib.php');

use context_module;
use moodle_url;

/**
 * Class mobile
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class mobile {
    /**
     * Returns the interactive video course view for the mobile app.
     *
     * @param mixed $args
     * @return void
     */
    public static function mobile_module_view($args) {
        global $OUTPUT;
        $args = (object)$args;
        $data = [
            'lang' => $args->applang,
            'cmid' => $args->cmid,
            'token' => self::create_token(),
        ];

        return [
            'templates' => [
                [
                    'id' => 'main',
                    'html' => $OUTPUT->render_from_template('mod_interactivevideo/mobile', $data),
                ],
            ],
        ];
    }

    /**
     * Create token
     *
     * @return string
     */
    public static function create_token() {
        global $DB;
        $service = $DB->get_record('external_services', ['shortname' => MOODLE_OFFICIAL_MOBILE_SERVICE], '*', MUST_EXIST);
        $token = external_generate_token_for_current_user($service);
        return $token->token;
    }

    /**
     * Login after validate token
     *
     * @param string $token
     * @param int $cmid
     * @return bool
     */
    public static function login_after_validate_token($token, $cmid) {
        global $DB;
        $modulecontext = context_module::instance($cmid);
        if (
            $user = $DB->get_record_sql("
                SELECT u.*
                FROM {user} u
                JOIN {external_tokens} t ON t.userid = u.id
                JOIN {external_services} s ON s.id = t.externalserviceid
                WHERE
                    t.token = :token
          AND s.shortname = :shortname", [
            'contextid' => $modulecontext->id,
            'shortname' => MOODLE_OFFICIAL_MOBILE_SERVICE,
            'token' => $token,
            ])
        ) {
            // Check if the user is logged in; if not, try login.
            if (!isloggedin()) {
                complete_user_login($user);
            }
            return true;
        } else {
            return false;
        }
    }
}
