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
 * Outcome rating adapter for interactive video activities.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class outcome_source extends outcome_source_base {
    /**
     * The module name.
     *
     * @return string
     */
    public function get_modname(): string {
        return 'interactivevideo';
    }

    /**
     * The reachable gradable interactions, as the learner's own grade counts them.
     *
     * @return \stdClass[]
     */
    public function get_gradable_items(): array {
        global $CFG;
        require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

        $cm = $this->get_cm();
        if (!$cm) {
            return [];
        }
        $contextid = \context_module::instance($cm->id)->id;
        return array_values(\interactivevideo_util::get_reachable_gradable_items($this->instanceid, $contextid));
    }

    /**
     * Every learner's completion record. The cmid column holds the instance id here.
     *
     * @return \moodle_recordset
     */
    public function get_completion_recordset(): \moodle_recordset {
        global $DB;
        return $DB->get_recordset(
            'interactivevideo_completion',
            ['cmid' => $this->instanceid],
            '',
            'id, userid, completeditems, completiondetails'
        );
    }

    /**
     * Drops the cached interactions.
     */
    public function invalidate_items_cache(): void {
        \cache::make('mod_interactivevideo', 'iv_items_by_cmid')->delete($this->instanceid);
    }
}
