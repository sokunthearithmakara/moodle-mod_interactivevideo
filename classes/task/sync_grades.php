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
 * Brings the gradebook into step after an activity's grade setting changed.
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class sync_grades extends \core\task\adhoc_task {
    /**
     * Run the queued grade sync.
     */
    public function execute(): void {
        $data = $this->get_custom_data();
        $instanceid = (int) ($data->instanceid ?? 0);
        if ($instanceid <= 0) {
            return;
        }

        \mod_interactivevideo\local\grade_sync::run(
            $instanceid,
            (string) ($data->mode ?? ''),
            (float) ($data->oldmax ?? 0),
            (float) ($data->newmax ?? 0)
        );
    }

    /**
     * Retry policy.
     *
     * A failed sync should not be retried indefinitely: the next settings change queues a
     * fresh task, and a learner saving progress recomputes their own grade anyway.
     *
     * @return bool
     */
    public function retry_until_success(): bool {
        return false;
    }
}
