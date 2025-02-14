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

namespace mod_interactivevideo\completion;

use core_completion\activity_custom_completion;

/**
 * Class custom_completion
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class custom_completion extends activity_custom_completion {
    /**
     * Plugins with completion.
     *
     * @var array
     */
    public $subplugins = [];

    /**
     * activity_custom_completion constructor.
     *
     * @param cm_info $cm
     * @param int $userid
     * @param array|null $completionstate The current state of the core completion criteria
     */
    public function __construct(\cm_info $cm, int $userid, ?array $completionstate = null) {
        $allsubplugins = explode(',', get_config('mod_interactivevideo', 'enablecontenttypes'));
        $subpluginclass = [];
        foreach ($allsubplugins as $subplugin) {
            $class = $subplugin . '\\ivcompletion';
            if (class_exists($class)) {
                $subpluginclass[] = $class;
            }
        }
        $this->subplugins = $subpluginclass;
        parent::__construct($cm, $userid, $completionstate);
    }

    /**
     * Fetches the completion state for a given completion rule.
     *
     * @param string $rule The completion rule.
     * @return int The completion state.
     */
    public function get_state(string $rule): int {
        global $DB;

        if (!$this->is_defined($rule)) {
            return COMPLETION_COMPLETE;
        }

        if (!$this->is_available($rule)) {
            throw new moodle_exception("Custom completion rule '$rule' is not used by this activity.");
        }

        if ($rule === 'completionpercentage') {
            $userid = $this->userid;
            $cm = $this->cm;
            $completionpercentage = $cm->customdata['customcompletionrules']['completionpercentage'];
            // We must take into account the start and end times of the video as well.
            // Interactions outside of start and end times OR skipped should not be considered for completion.
            $startendtimes = explode("-", $cm->customdata['startendtime']);
            $start = $startendtimes[0];
            $end = $startendtimes[1];

            $cache = \cache::make('mod_interactivevideo', 'iv_items_by_cmid');
            $items = $cache->get($cm->instance);
            if (empty($items)) {
                $items = $DB->get_records(
                    'interactivevideo_items',
                    ['annotationid' => $cm->instance]
                );
                $cache->set($cm->instance, $items);
            }

            $relevantitems = array_filter($items, function ($item) use ($start, $end) {
                return (($item->timestamp >= $start && $item->timestamp <= $end)
                    || $item->timestamp < 0) && ($item->hascompletion == 1 || $item->type == 'skipsegment');
            });

            $skipsegment = array_filter($relevantitems, function ($item) {
                return $item->type === 'skipsegment';
            });

            $relevantitems = array_filter($relevantitems, function ($item) use ($skipsegment) {
                foreach ($skipsegment as $ss) {
                    if ($item->timestamp > $ss->timestamp && $item->timestamp < $ss->title && $item->timestamp >= 0) {
                        return false;
                    }
                }
                if ($item->type === 'skipsegment') {
                    return false;
                }
                return true;
            });

            $relevantitems = array_map(function ($item) {
                return $item->id;
            }, $relevantitems);

            $usercompletion = $DB->get_field(
                'interactivevideo_completion',
                'completeditems',
                ['userid' => $userid, 'cmid' => $cm->instance]
            );
            if (!$usercompletion) {
                return COMPLETION_INCOMPLETE;
            }
            $usercompletion = json_decode($usercompletion, true);
            $usercompletion = array_intersect($usercompletion, $relevantitems);
            $usercompletion = count($usercompletion);
            if ($usercompletion > 0) {
                $usercompletion = ($usercompletion / count($relevantitems)) * 100;
            } else {
                $usercompletion = 0;
            }
            if ($usercompletion >= $completionpercentage) {
                return COMPLETION_COMPLETE;
            }
            return COMPLETION_INCOMPLETE;
        } else {
            foreach ($this->subplugins as $class) {
                if ($class::get_state($rule, $this->cm, $this->userid)) {
                    return COMPLETION_COMPLETE;
                }
            }
            return COMPLETION_INCOMPLETE;
        }
    }

    /**
     * Fetch the list of custom completion rules that this module defines.
     *
     * @return array
     */
    public static function get_defined_custom_rules(): array {
        $rules = ['completionpercentage'];
        $allsubplugins = explode(',', get_config('mod_interactivevideo', 'enablecontenttypes'));
        foreach ($allsubplugins as $subplugin) {
            $class = $subplugin . '\\ivcompletion';
            if (class_exists($class)) {
                $rules = $class::get_defined_custom_rules($rules);
            }
        }
        return $rules;
    }

    /**
     * Returns an associative array of the descriptions of custom completion rules.
     *
     * @return array
     */
    public function get_custom_rule_descriptions(): array {
        $completionpercentage = $this->cm->customdata['customcompletionrules']['completionpercentage'];
        $description = [
            'completionpercentage' => get_string('completiondetail:percentage', 'interactivevideo', $completionpercentage),
        ];
        $extendedcompletion = $this->cm->customdata['extendedcompletion'];
        $extendedcompletion = json_decode($extendedcompletion, true);
        // Filter out the conditions that are no longer available.
        $allcustomrules = $this->get_defined_custom_rules();
        $nonexistentrules = array_diff(array_keys($extendedcompletion), $allcustomrules);
        foreach ($nonexistentrules as $rule) {
            $description[$rule] = get_string('completiondetail:nonexistent', 'interactivevideo', $rule);
            unset($extendedcompletion[$rule]);
        }
        foreach ($this->subplugins as $class) {
            $description = $class::get_descriptions($description, $extendedcompletion);
        }
        return $description;
    }

    /**
     * Returns an array of all completion rules, in the order they should be displayed to users.
     *
     * @return array
     */
    public function get_sort_order(): array {
        $customrules = $this->get_defined_custom_rules();
        // What if we restore the module from other sites with custom ivplugins and we don't have the plugin anymore?
        $extendedcompletion = $this->cm->customdata['extendedcompletion'];
        $extendedcompletion = json_decode($extendedcompletion, true);
        $customrules = array_merge($customrules, array_keys($extendedcompletion));
        // Add completionview as the first element.
        array_unshift($customrules, 'completionview');
        $customrules[] = 'completionusegrade';
        $customrules[] = 'completionpassgrade';
        return $customrules;
    }
}
