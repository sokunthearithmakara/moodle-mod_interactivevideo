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

/**
 * Rates every learner's outcomes on an activity after an interaction's mapping changed.
 *
 * Also used by mod_flexbook, which passes its own module name in the custom data.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class rate_outcomes extends \core\task\adhoc_task {
    /**
     * Run the queued rating pass.
     */
    public function execute(): void {
        $data = $this->get_custom_data();
        $modname = (string) ($data->modname ?? '');
        $instanceid = (int) ($data->instanceid ?? 0);
        if ($modname === '' || $instanceid <= 0) {
            return;
        }

        \mod_interactivevideo\local\outcome_mapping::rate_all($modname, $instanceid);
    }

    /**
     * Retry policy.
     *
     * The next mapping change queues a fresh pass, and a learner saving progress rates
     * themselves anyway, so a failed pass is not retried.
     *
     * @return bool
     */
    public function retry_until_success(): bool {
        return false;
    }
}
