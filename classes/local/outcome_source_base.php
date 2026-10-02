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
 * What {@see outcome_mapping} needs to know about a module to rate a whole activity.
 *
 * Each module that stores interactions and completion records the interactive video way
 * provides a subclass named \mod_<name>\local\outcome_source.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
abstract class outcome_source_base {
    /** @var int The activity instance id. */
    protected $instanceid;

    /** @var \stdClass|null|false The course module, false until first looked up. */
    protected $cm = false;

    /**
     * Constructor.
     *
     * @param int $instanceid The activity instance id.
     */
    public function __construct(int $instanceid) {
        $this->instanceid = $instanceid;
    }

    /**
     * The activity instance id.
     *
     * @return int
     */
    public function get_instanceid(): int {
        return $this->instanceid;
    }

    /**
     * The module name, e.g. 'interactivevideo'.
     *
     * @return string
     */
    abstract public function get_modname(): string;

    /**
     * The course module record, null when the activity no longer exists.
     *
     * @return \stdClass|null
     */
    public function get_cm(): ?\stdClass {
        if ($this->cm === false) {
            $cm = get_coursemodule_from_instance($this->get_modname(), $this->instanceid, 0, false, IGNORE_MISSING);
            $this->cm = $cm ? $cm : null;
        }
        return $this->cm;
    }

    /**
     * The course id, 0 when the activity no longer exists.
     *
     * @return int
     */
    public function get_courseid(): int {
        $cm = $this->get_cm();
        return $cm ? (int) $cm->course : 0;
    }

    /**
     * The interactions a learner can be graded on, with at least id, xp, hascompletion, advanced.
     *
     * @return \stdClass[]
     */
    abstract public function get_gradable_items(): array;

    /**
     * Every learner's completion record, with at least userid, completeditems, completiondetails.
     *
     * @return \moodle_recordset
     */
    abstract public function get_completion_recordset(): \moodle_recordset;

    /**
     * Drops any cached copy of the interactions so a rating pass sees the latest mapping.
     */
    abstract public function invalidate_items_cache(): void;
}
