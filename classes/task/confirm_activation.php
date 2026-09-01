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

/**
 * Re-confirm a content type activation with the license server.
 *
 * Activation is checked on the player, the editor and every course page that lists activities, so
 * it can never contact the license server inline. Instead those paths grant a grace window and
 * queue this task, which does the round trip out of band.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class confirm_activation extends \core\task\adhoc_task {
    /**
     * Run the confirmation.
     */
    public function execute() {
        $data = (array) $this->get_custom_data();
        $component = clean_param($data['component'] ?? '', PARAM_COMPONENT);
        if ($component === '') {
            return;
        }

        $result = contenttype_activation::reregister($component);

        if (!empty($result['success'])) {
            // The reregister() call repopulated the cache and the stored confirmation, and cleared grace.
            mtrace("mod_interactivevideo: confirmed activation for {$component}");
            return;
        }

        $errorcode = (string) ($result['errorcode'] ?? '');

        if (!in_array($errorcode, contenttype_activation::refusal_error_codes(), true)) {
            // Inconclusive: server unreachable, rate limited, or our request was rejected as
            // malformed. None of those mean the license is gone, so leave the component alone
            // and let a later run settle it rather than breaking a paying site.
            mtrace("mod_interactivevideo: activation for {$component} inconclusive ({$errorcode}), leaving as is");
            return;
        }

        // The server positively refused. Drop the local activation so the type stops being usable.
        contenttype_activation::revoke_locally($component);
        mtrace("mod_interactivevideo: activation refused for {$component} ({$errorcode}), revoked locally");
    }
}
