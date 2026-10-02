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

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/gradelib.php');
require_once($CFG->libdir . '/grade/grade_outcome.php');

/**
 * Rates an activity's grade outcomes from its interactions.
 *
 * An interaction may be linked to any of the outcomes attached to its activity. The link is
 * stored under the "outcomes" key of the interaction's advanced JSON, keyed by outcome id:
 *
 *   {"outcomes": {"12": {"mode": "score", "thresholds": [0, 51, 86]},
 *                 "15": {"mode": "fixed", "level": 2}}}
 *
 * In "score" mode the learner's score on the interaction (0..1) is turned into a scale level
 * by the thresholds, one lower bound in percent per scale level (the first is always 0). In
 * "fixed" mode completing the interaction awards the given level. When several interactions
 * feed the same outcome the learner's level is the XP-weighted mean of the levels earned on
 * the linked interactions they have completed, rounded half up.
 *
 * Outcome grade items cannot take raw grades, so ratings are written straight to the final
 * grade with {@see \grade_item::update_final_grade()}; {@see grade_update()} refuses them.
 *
 * This class is shared by mod_interactivevideo and mod_flexbook. It never reads the item
 * tables itself: callers pass the items, and {@see outcome_source_base} adapts each module
 * for the out-of-band backfill.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class outcome_mapping {
    /** @var string The learner's score is mapped to a level through thresholds. */
    public const MODE_SCORE = 'score';

    /** @var string Completing the interaction awards a fixed level. */
    public const MODE_FIXED = 'fixed';

    /** @var string Key of the mapping inside the interaction's advanced JSON. */
    public const ADVANCED_KEY = 'outcomes';

    /**
     * Whether outcomes are enabled on this site.
     *
     * @return bool
     */
    public static function is_enabled(): bool {
        global $CFG;
        return !empty($CFG->enableoutcomes);
    }

    /**
     * The outcome grade items attached to an activity, keyed by outcome id.
     *
     * Core creates one scale grade item per outcome ticked on the activity form, alongside
     * the activity's own item number 0.
     *
     * @param string $modname Module name, e.g. 'interactivevideo'.
     * @param int $instanceid The activity instance id.
     * @param bool $usecache Whether a result already fetched in this request may be reused.
     * @return \grade_item[]
     */
    public static function get_outcome_grade_items(string $modname, int $instanceid, bool $usecache = true): array {
        $cache = \cache::make_from_params(\cache_store::MODE_REQUEST, 'mod_interactivevideo', 'outcomeitems');
        $key = $modname . '_' . $instanceid;
        if ($usecache) {
            $cached = $cache->get($key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $result = [];
        $items = \grade_item::fetch_all([
            'itemtype' => 'mod',
            'itemmodule' => $modname,
            'iteminstance' => $instanceid,
        ]);
        if ($items) {
            foreach ($items as $item) {
                if (!empty($item->outcomeid)) {
                    $result[(int) $item->outcomeid] = $item;
                }
            }
        }
        $cache->set($key, $result);
        return $result;
    }

    /**
     * The outcomes an interaction of this activity may be linked to.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return array Keyed by outcome id: id, name, shortname, scaleitems (0-indexed), levels,
     *      gradeitem.
     */
    public static function get_activity_outcomes(string $modname, int $instanceid): array {
        $result = [];
        foreach (self::get_outcome_grade_items($modname, $instanceid) as $outcomeid => $gradeitem) {
            // The grade item's scale is what bounded_grade() clamps against, so it is the
            // one the form must describe, even if the outcome itself was re-scaled since.
            $scale = $gradeitem->load_scale();
            if (!$scale || empty($scale->scale_items)) {
                continue;
            }
            $outcome = \grade_outcome::fetch(['id' => $outcomeid]);
            $result[$outcomeid] = [
                'id' => $outcomeid,
                'name' => $outcome ? $outcome->get_name() : $gradeitem->get_name(),
                'shortname' => $outcome ? $outcome->get_shortname() : '',
                'scaleitems' => array_values($scale->scale_items),
                'levels' => count($scale->scale_items),
                'gradeitem' => $gradeitem,
            ];
        }
        return $result;
    }

    /**
     * The current ratings of an activity's outcomes for one learner.
     *
     * Read in one query rather than per outcome, so a screen showing a dozen outcomes still
     * costs a single round trip.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param int $userid The learner.
     * @return array Outcome id => stored level, or null where the learner has no rating.
     */
    public static function get_user_ratings(string $modname, int $instanceid, int $userid): array {
        global $DB;

        $items = self::get_outcome_grade_items($modname, $instanceid);
        if (empty($items)) {
            return [];
        }

        $itemids = [];
        foreach ($items as $outcomeid => $item) {
            $itemids[(int) $item->id] = $outcomeid;
        }

        $ratings = array_fill_keys(array_keys($items), null);
        [$insql, $params] = $DB->get_in_or_equal(array_keys($itemids), SQL_PARAMS_NAMED, 'gitem');
        $params['userid'] = $userid;
        $grades = $DB->get_records_select(
            'grade_grades',
            "itemid {$insql} AND userid = :userid",
            $params,
            '',
            'id, itemid, finalgrade'
        );
        foreach ($grades as $grade) {
            $outcomeid = $itemids[(int) $grade->itemid];
            $ratings[$outcomeid] = $grade->finalgrade === null ? null : (float) $grade->finalgrade;
        }

        return $ratings;
    }

    /**
     * The activity's outcomes and the learner's standing on each, ready for a template.
     *
     * Every outcome attached to the activity is listed, whether or not an interaction feeds
     * it, so the list reads as what the activity is about. The stored grade is used rather
     * than a fresh computation, so the screen agrees with the gradebook and with any rating
     * a teacher set by hand.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param int $userid The learner.
     * @param \context|null $context Context to format names in.
     * @return array One row per outcome: name, shortname, rating, notrated. Empty when there
     *      is nothing to show.
     */
    public static function screen_rows(string $modname, int $instanceid, int $userid, ?\context $context = null): array {
        if (!self::is_enabled()) {
            return [];
        }
        $outcomes = self::get_activity_outcomes($modname, $instanceid);
        if (empty($outcomes)) {
            return [];
        }
        $ratings = self::get_user_ratings($modname, $instanceid, $userid);
        $options = $context ? ['context' => $context] : [];

        $rows = [];
        foreach ($outcomes as $outcomeid => $outcome) {
            $level = isset($ratings[$outcomeid]) ? (int) $ratings[$outcomeid] : 0;
            $label = null;
            if ($level >= 1 && isset($outcome['scaleitems'][$level - 1])) {
                $label = format_string($outcome['scaleitems'][$level - 1], true, $options);
            }
            $rows[] = [
                'name' => format_string($outcome['name'], true, $options),
                'shortname' => format_string($outcome['shortname'], true, $options),
                'rating' => $label === null ? get_string('nooutcome', 'grades') : $label,
                'notrated' => $label === null,
            ];
        }

        return $rows;
    }

    /**
     * The activity's outcomes as the report needs to describe them.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param \context|null $context Context to format names in.
     * @return array One entry per outcome: id, name, shortname, levels (labels, lowest first)
     *      and the interactions feeding it.
     */
    public static function report_definitions(string $modname, int $instanceid, ?\context $context = null): array {
        if (!self::is_enabled()) {
            return [];
        }
        $outcomes = self::get_activity_outcomes($modname, $instanceid);
        if (empty($outcomes)) {
            return [];
        }

        $options = $context ? ['context' => $context] : [];
        $linked = self::linked_items($modname, $instanceid, $options);

        $definitions = [];
        foreach ($outcomes as $outcomeid => $outcome) {
            $levels = [];
            foreach ($outcome['scaleitems'] as $item) {
                $levels[] = format_string($item, true, $options);
            }
            $definitions[] = [
                'id' => $outcomeid,
                'name' => format_string($outcome['name'], true, $options),
                'shortname' => format_string($outcome['shortname'], true, $options),
                'levels' => $levels,
                'items' => $linked[$outcomeid] ?? [],
            ];
        }
        return $definitions;
    }

    /**
     * The interactions feeding each of an activity's outcomes.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param array $options Options for format_string().
     * @return array Outcome id => list of ['id' => interaction id, 'title' => its title].
     */
    protected static function linked_items(string $modname, int $instanceid, array $options): array {
        $source = self::source_for($modname, $instanceid);
        if (!$source) {
            return [];
        }

        $linked = [];
        foreach ($source->get_gradable_items() as $item) {
            $item = (array) $item;
            foreach (array_keys(self::parse_mapping($item)) as $outcomeid) {
                $linked[$outcomeid][] = [
                    'id' => (int) $item['id'],
                    'title' => format_string($item['title'] ?? '', true, $options),
                ];
            }
        }
        return $linked;
    }

    /**
     * Every learner's ratings on an activity's outcomes.
     *
     * One query for the whole report: the reports load every user at once, so reading this
     * per row would be a query per learner. Outcomes a learner has no rating on are left out
     * rather than stored as null, so the count of ratings is the size of their entry.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return array User id => [outcome id => level].
     */
    public static function report_ratings(string $modname, int $instanceid): array {
        global $DB;

        $items = self::get_outcome_grade_items($modname, $instanceid);
        if (empty($items)) {
            return [];
        }

        $itemids = [];
        foreach ($items as $outcomeid => $item) {
            $itemids[(int) $item->id] = $outcomeid;
        }

        [$insql, $params] = $DB->get_in_or_equal(array_keys($itemids), SQL_PARAMS_NAMED, 'gitem');
        $ratings = [];
        $rs = $DB->get_recordset_select(
            'grade_grades',
            "itemid {$insql} AND finalgrade IS NOT NULL",
            $params,
            '',
            'id, itemid, userid, finalgrade'
        );
        foreach ($rs as $grade) {
            $level = (int) $grade->finalgrade;
            if ($level < 1) {
                continue;
            }
            $ratings[(int) $grade->userid][$itemids[(int) $grade->itemid]] = $level;
        }
        $rs->close();

        return $ratings;
    }

    /**
     * One learner's cell in the report's outcome column.
     *
     * @param array $userratings That learner's ratings, keyed by outcome id.
     * @param int $total How many outcomes the activity has.
     * @return array rated, total and the levels themselves, for the summary.
     */
    public static function report_row(array $userratings, int $total): array {
        return [
            'rated' => count($userratings),
            'total' => $total,
            'levels' => (object) $userratings,
        ];
    }

    /**
     * The outcome mapping stored on an interaction.
     *
     * @param \stdClass|array $item An interaction record with its advanced column.
     * @return array Keyed by outcome id, each ['mode' => 'score', 'thresholds' => int[]]
     *      or ['mode' => 'fixed', 'level' => int]. Malformed entries are dropped.
     */
    public static function parse_mapping($item): array {
        $item = (array) $item;
        return self::parse_advanced($item['advanced'] ?? null);
    }

    /**
     * The outcome mapping held in an advanced JSON string.
     *
     * @param string|null $advanced The advanced column.
     * @return array As {@see parse_mapping()}.
     */
    public static function parse_advanced(?string $advanced): array {
        if ($advanced === null || $advanced === '') {
            return [];
        }
        $decoded = json_decode($advanced);
        if (!is_object($decoded) || !isset($decoded->{self::ADVANCED_KEY})) {
            return [];
        }
        return self::parse_structure($decoded->{self::ADVANCED_KEY});
    }

    /**
     * Normalises a decoded "outcomes" structure.
     *
     * Accepts the stored object form and, for robustness, a bare threshold list per outcome
     * (treated as score mode).
     *
     * @param mixed $raw The decoded value of the "outcomes" key.
     * @return array As {@see parse_mapping()}.
     */
    public static function parse_structure($raw): array {
        if (!is_object($raw) && !is_array($raw)) {
            return [];
        }
        $mapping = [];
        foreach ((array) $raw as $key => $value) {
            $outcomeid = (int) $key;
            if ($outcomeid <= 0) {
                continue;
            }
            if (is_object($value)) {
                $value = (array) $value;
            }
            if (!is_array($value)) {
                continue;
            }
            if (array_keys($value) === range(0, count($value) - 1)) {
                // A bare list of thresholds.
                $value = ['mode' => self::MODE_SCORE, 'thresholds' => $value];
            }
            $mode = $value['mode'] ?? null;
            if ($mode === self::MODE_FIXED) {
                $level = (int) ($value['level'] ?? 0);
                if ($level < 1) {
                    continue;
                }
                $mapping[$outcomeid] = ['mode' => self::MODE_FIXED, 'level' => $level];
            } else if ($mode === self::MODE_SCORE) {
                $thresholds = $value['thresholds'] ?? null;
                if (!is_array($thresholds) || empty($thresholds)) {
                    continue;
                }
                $thresholds = array_values(array_map('intval', $thresholds));
                if ($thresholds[0] !== 0) {
                    continue;
                }
                $mapping[$outcomeid] = ['mode' => self::MODE_SCORE, 'thresholds' => $thresholds];
            }
        }
        ksort($mapping);
        return $mapping;
    }

    /**
     * Every outcome id any of the given interactions is linked to.
     *
     * @param array $items Interaction records.
     * @return int[]
     */
    public static function mapped_outcome_ids(array $items): array {
        $ids = [];
        foreach ($items as $item) {
            foreach (array_keys(self::parse_mapping($item)) as $outcomeid) {
                $ids[$outcomeid] = $outcomeid;
            }
        }
        return array_values($ids);
    }

    /**
     * The evenly spaced default lower bound for a level.
     *
     * @param int $level The level, 2 or more.
     * @param int $levels Number of levels on the scale.
     * @return int
     */
    protected static function default_threshold(int $level, int $levels): int {
        return intdiv(100 * ($level - 1), max($levels, 1));
    }

    /**
     * Reads threshold values keyed by level from either accepted shape.
     *
     * @param mixed $raw ['lvl2' => v, 'lvl3' => v, ...] from the form, or a full list where
     *      index 0 is level 1.
     * @return array Keyed by level number.
     */
    protected static function thresholds_by_level($raw): array {
        $values = [];
        if (!is_array($raw)) {
            return $values;
        }
        foreach ($raw as $key => $value) {
            if (is_string($key) && preg_match('/^lvl(\d+)$/', $key, $matches)) {
                $values[(int) $matches[1]] = $value;
            } else if (is_int($key)) {
                $values[$key + 1] = $value;
            }
        }
        return $values;
    }

    /**
     * Turns whatever the teacher typed into a valid threshold list.
     *
     * Values are clamped to 1..100 and forced strictly increasing; missing or non-numeric
     * ones fall back to an even split. The result always has one entry per level, starting
     * with 0, so a stored mapping can be trusted without further checks.
     *
     * @param mixed $raw See {@see thresholds_by_level()}.
     * @param int $levels Number of levels on the scale.
     * @return int[]
     */
    public static function normalise_thresholds($raw, int $levels): array {
        $values = self::thresholds_by_level($raw);
        $result = [0];
        $prev = 0;
        for ($level = 2; $level <= $levels; $level++) {
            $value = $values[$level] ?? null;
            if ($value === null || $value === '' || !is_numeric($value)) {
                $value = self::default_threshold($level, $levels);
            }
            $value = (int) round((float) $value);
            $value = max(1, min(100, $value));
            if ($value <= $prev) {
                $value = min(100, $prev + 1);
            }
            $result[] = $value;
            $prev = $value;
        }
        return $result;
    }

    /**
     * Clamps a fixed level to the scale.
     *
     * @param mixed $raw The submitted level.
     * @param int $levels Number of levels on the scale.
     * @return int 1..$levels, the top level when nothing usable was given.
     */
    public static function normalise_level($raw, int $levels): int {
        $levels = max($levels, 1);
        $value = is_numeric($raw) ? (int) $raw : $levels;
        return max(1, min($levels, $value));
    }

    /**
     * Strict check of typed thresholds, for form validation only.
     *
     * @param mixed $raw See {@see thresholds_by_level()}.
     * @param int $levels Number of levels on the scale.
     * @return array Level number => error message, empty when valid.
     */
    public static function thresholds_errors($raw, int $levels): array {
        $values = self::thresholds_by_level($raw);
        $errors = [];
        $prev = 0;
        for ($level = 2; $level <= $levels; $level++) {
            $value = $values[$level] ?? null;
            $valid = $value !== null && $value !== '' && is_numeric($value)
                && (float) $value == (int) $value
                && (int) $value >= 1 && (int) $value <= 100 && (int) $value > $prev;
            if (!$valid) {
                $errors[$level] = get_string('outcomethresholdinvalid', 'mod_interactivevideo');
                // Keep checking against the last good bound so one bad value reports once.
                continue;
            }
            $prev = (int) $value;
        }
        return $errors;
    }

    /**
     * Name of a form element for an outcome.
     *
     * @param int $outcomeid The outcome id.
     * @param string $suffix enabled, mode, level or lvlN.
     * @return string
     */
    public static function field_name(int $outcomeid, string $suffix): string {
        return 'outcome_' . $outcomeid . '_' . $suffix;
    }

    /**
     * Wraps descriptive text the way the interaction forms style it.
     *
     * @param string $text The already translated text.
     * @return string
     */
    protected static function muted(string $text): string {
        return '<span class="text-muted small w-100 d-block">' . $text . '</span>';
    }

    /**
     * Adds the "Outcomes" section to an interaction form.
     *
     * Nothing is added when the site has outcomes disabled. When the activity has no outcome
     * attached yet the section only points the teacher at the activity settings.
     *
     * @param \MoodleQuickForm $mform The form.
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param int $cmid The course module id, for the activity settings link.
     * @param string $defaultmode Rating method preselected for a newly ticked outcome.
     * @param bool $expanded Whether the section starts expanded.
     */
    public static function add_form_fields(
        \MoodleQuickForm $mform,
        string $modname,
        int $instanceid,
        int $cmid,
        string $defaultmode = self::MODE_SCORE,
        bool $expanded = false
    ): void {
        if (!self::is_enabled()) {
            return;
        }
        $mform->addElement('header', 'outcomes', get_string('outcomes', 'grades'));
        $mform->setExpanded('outcomes', $expanded);

        $outcomes = self::get_activity_outcomes($modname, $instanceid);
        if (empty($outcomes)) {
            $link = \html_writer::link(
                new \moodle_url('/course/modedit.php', ['update' => $cmid]),
                get_string('outcomesnone_link', 'mod_interactivevideo'),
                ['target' => '_blank']
            );
            $mform->addElement(
                'static',
                'outcomesnone',
                '',
                self::muted(get_string('outcomesnone', 'mod_interactivevideo', $link))
            );
            return;
        }

        $mform->addElement(
            'static',
            'outcomerating_desc',
            '',
            self::muted(get_string('outcomerating_desc', 'mod_interactivevideo'))
        );

        $hastracking = $mform->elementExists('completiontracking');
        $modes = [
            self::MODE_SCORE => get_string('outcomemode_score', 'mod_interactivevideo'),
            self::MODE_FIXED => get_string('outcomemode_fixed', 'mod_interactivevideo'),
        ];
        if (!array_key_exists($defaultmode, $modes)) {
            $defaultmode = self::MODE_SCORE;
        }

        foreach ($outcomes as $outcomeid => $outcome) {
            $enabled = self::field_name($outcomeid, 'enabled');
            $mode = self::field_name($outcomeid, 'mode');
            $level = self::field_name($outcomeid, 'level');
            $scaleitems = $outcome['scaleitems'];
            $levels = $outcome['levels'];

            $mform->addElement('advcheckbox', $enabled, '', $outcome['name'], null, [0, 1]);
            $mform->setType($enabled, PARAM_INT);
            $mform->setDefault($enabled, 0);
            if ($hastracking) {
                $mform->hideIf($enabled, 'completiontracking', 'eq', 'none');
            }

            // Everything below only matters once the outcome is ticked.
            $dependents = [];

            $mform->addElement('select', $mode, get_string('outcomemode', 'mod_interactivevideo'), $modes);
            $mform->setType($mode, PARAM_ALPHA);
            $mform->setDefault($mode, $defaultmode);
            $dependents[] = $mode;

            if ($levels > 1) {
                $lowest = self::field_name($outcomeid, 'lvl1');
                $mform->addElement(
                    'static',
                    $lowest,
                    format_string($scaleitems[0]),
                    self::muted(get_string('outcomethresholdlowest', 'mod_interactivevideo'))
                );
                $mform->hideIf($lowest, $mode, 'neq', self::MODE_SCORE);
                $dependents[] = $lowest;

                for ($n = 2; $n <= $levels; $n++) {
                    $name = self::field_name($outcomeid, 'lvl' . $n);
                    $mform->addElement(
                        'text',
                        $name,
                        get_string('outcomethresholdfrom', 'mod_interactivevideo', format_string($scaleitems[$n - 1])),
                        ['size' => 4, 'inputmode' => 'numeric']
                    );
                    $mform->setType($name, PARAM_RAW_TRIMMED);
                    $mform->setDefault($name, self::default_threshold($n, $levels));
                    $mform->hideIf($name, $mode, 'neq', self::MODE_SCORE);
                    $dependents[] = $name;
                }

                $desc = self::field_name($outcomeid, 'thresholdsdesc');
                $mform->addElement(
                    'static',
                    $desc,
                    '',
                    self::muted(get_string('outcomethresholds_desc', 'mod_interactivevideo'))
                );
                $mform->hideIf($desc, $mode, 'neq', self::MODE_SCORE);
                $dependents[] = $desc;
            }

            $options = [];
            foreach ($scaleitems as $index => $item) {
                $options[$index + 1] = format_string($item);
            }
            $mform->addElement('select', $level, get_string('outcomelevel', 'mod_interactivevideo'), $options);
            $mform->setType($level, PARAM_INT);
            $mform->setDefault($level, $levels);
            $mform->hideIf($level, $mode, 'neq', self::MODE_FIXED);
            $dependents[] = $level;

            foreach ($dependents as $name) {
                $mform->hideIf($name, $enabled, 'notchecked');
                if ($hastracking) {
                    $mform->hideIf($name, 'completiontracking', 'eq', 'none');
                }
            }
        }
    }

    /**
     * The rating method to preselect for a form, from its completion tracking options.
     *
     * Only tracking modes that carry a score make thresholds meaningful; every other mode
     * (manual, on view, interact, watch, scroll...) completes without one, where a fixed
     * level is the sensible choice.
     *
     * @param string[] $trackingoptions Keys of the completion tracking options offered.
     * @return string MODE_SCORE or MODE_FIXED.
     */
    public static function default_mode_for_tracking(array $trackingoptions): string {
        $scored = ['complete', 'completepass', 'completefull', 'completemin', 'answer', 'answercorrect'];
        return array_intersect($trackingoptions, $scored) ? self::MODE_SCORE : self::MODE_FIXED;
    }

    /**
     * Whether an advanced JSON string carries an outcome mapping.
     *
     * @param string|null $advanced The advanced column.
     * @return bool
     */
    public static function has_mapping(?string $advanced): bool {
        return !empty(self::parse_advanced($advanced));
    }

    /**
     * Spreads a stored mapping into the flat field names the form uses.
     *
     * Called from the forms' set_data_default() after the advanced JSON has been exploded
     * into $data, where the mapping arrives as $data->outcomes. Only outcomes currently
     * attached to the activity are prefilled; anything else is silently dropped.
     *
     * @param \stdClass $data The form data being assembled.
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return \stdClass The same object.
     */
    public static function flatten_for_form(\stdClass $data, string $modname, int $instanceid): \stdClass {
        $raw = $data->{self::ADVANCED_KEY} ?? null;
        unset($data->{self::ADVANCED_KEY});
        if (empty($raw) || !self::is_enabled()) {
            return $data;
        }
        $mapping = self::parse_structure($raw);
        if (empty($mapping)) {
            return $data;
        }
        $outcomes = self::get_activity_outcomes($modname, $instanceid);
        foreach ($mapping as $outcomeid => $entry) {
            if (!isset($outcomes[$outcomeid])) {
                continue;
            }
            $data->{self::field_name($outcomeid, 'enabled')} = 1;
            $data->{self::field_name($outcomeid, 'mode')} = $entry['mode'];
            if ($entry['mode'] === self::MODE_FIXED) {
                $data->{self::field_name($outcomeid, 'level')} = $entry['level'];
            } else {
                foreach ($entry['thresholds'] as $index => $value) {
                    if ($index === 0) {
                        continue;
                    }
                    $data->{self::field_name($outcomeid, 'lvl' . ($index + 1))} = $value;
                }
            }
        }
        return $data;
    }

    /**
     * Reads the mapping back out of submitted form data.
     *
     * @param \stdClass $data The submitted data, after pre_processing_data().
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param string|null $existingadvanced The item's stored advanced JSON, kept intact when
     *      the site has outcomes disabled and the form therefore showed no section.
     * @return array As {@see parse_mapping()}.
     */
    public static function collect_from_form(
        \stdClass $data,
        string $modname,
        int $instanceid,
        ?string $existingadvanced = null
    ): array {
        if (!self::is_enabled()) {
            return self::parse_advanced($existingadvanced);
        }
        if (isset($data->hascompletion) && empty($data->hascompletion)) {
            return [];
        }
        if (isset($data->completiontracking) && $data->completiontracking === 'none') {
            return [];
        }
        $mapping = [];
        foreach (self::get_activity_outcomes($modname, $instanceid) as $outcomeid => $outcome) {
            if (empty($data->{self::field_name($outcomeid, 'enabled')})) {
                continue;
            }
            $mode = $data->{self::field_name($outcomeid, 'mode')} ?? self::MODE_SCORE;
            if ($mode === self::MODE_FIXED) {
                $mapping[$outcomeid] = [
                    'mode' => self::MODE_FIXED,
                    'level' => self::normalise_level($data->{self::field_name($outcomeid, 'level')} ?? null, $outcome['levels']),
                ];
            } else {
                $raw = [];
                for ($n = 2; $n <= $outcome['levels']; $n++) {
                    $raw['lvl' . $n] = $data->{self::field_name($outcomeid, 'lvl' . $n)} ?? null;
                }
                $mapping[$outcomeid] = [
                    'mode' => self::MODE_SCORE,
                    'thresholds' => self::normalise_thresholds($raw, $outcome['levels']),
                ];
            }
        }
        ksort($mapping);
        return $mapping;
    }

    /**
     * Form validation for the outcome section.
     *
     * @param array $data The submitted data.
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return array Element name => error message.
     */
    public static function validate_form(array $data, string $modname, int $instanceid): array {
        if (!self::is_enabled()) {
            return [];
        }
        if (($data['completiontracking'] ?? '') === 'none') {
            return [];
        }
        $errors = [];
        foreach (self::get_activity_outcomes($modname, $instanceid) as $outcomeid => $outcome) {
            if (empty($data[self::field_name($outcomeid, 'enabled')])) {
                continue;
            }
            if (($data[self::field_name($outcomeid, 'mode')] ?? self::MODE_SCORE) !== self::MODE_SCORE) {
                continue;
            }
            $raw = [];
            for ($n = 2; $n <= $outcome['levels']; $n++) {
                $raw['lvl' . $n] = $data[self::field_name($outcomeid, 'lvl' . $n)] ?? null;
            }
            foreach (self::thresholds_errors($raw, $outcome['levels']) as $level => $message) {
                $errors[self::field_name($outcomeid, 'lvl' . $level)] = $message;
            }
        }
        return $errors;
    }

    /**
     * Writes a mapping into an advanced settings object about to be JSON encoded.
     *
     * @param \stdClass $advanced The advanced settings.
     * @param array $mapping As {@see parse_mapping()}; empty removes the key.
     * @return \stdClass The same object.
     */
    public static function encode(\stdClass $advanced, array $mapping): \stdClass {
        if (empty($mapping)) {
            unset($advanced->{self::ADVANCED_KEY});
        } else {
            $advanced->{self::ADVANCED_KEY} = (object) $mapping;
        }
        return $advanced;
    }

    /**
     * Decodes a completion record's progress.
     *
     * @param \stdClass|array $row A completion record with completiondetails and completeditems.
     * @return array [details keyed by interaction id (deleted ones excluded), completed ids as strings].
     */
    public static function decode_progress($row): array {
        $row = (object) $row;
        $details = [];
        $raw = json_decode((string) ($row->completiondetails ?? '[]'));
        if (is_array($raw)) {
            foreach ($raw as $entry) {
                $detail = is_string($entry) ? json_decode($entry) : $entry;
                if (is_object($detail) && isset($detail->id) && empty($detail->deleted)) {
                    $details[(string) $detail->id] = $detail;
                }
            }
        }
        $completed = json_decode((string) ($row->completeditems ?? '[]'));
        $completed = is_array($completed) ? array_map('strval', $completed) : [];
        return [$details, $completed];
    }

    /**
     * The learner's score on an interaction, as a fraction.
     *
     * This is the detail's percent: the share of the interaction's XP the learner earned,
     * which the player and the report already treat as the result and which a teacher's XP
     * override rewrites. For content that only awards full XP on completion (H5P with partial
     * points off, view and manual tracking) it is 1, so completing counts as a full score.
     *
     * @param \stdClass|null $detail The completion detail, null when none was recorded.
     * @param float $itemmax The interaction's XP.
     * @return float 0..1
     */
    public static function score_from_detail(?\stdClass $detail, float $itemmax): float {
        if ($detail === null) {
            return 1.0;
        }
        $score = null;
        if (isset($detail->percent) && is_numeric($detail->percent)) {
            $score = (float) $detail->percent;
        } else if ($itemmax > 0 && isset($detail->xp) && is_numeric($detail->xp)) {
            $score = (float) $detail->xp / $itemmax;
        }
        if ($score === null || is_nan($score)) {
            $score = 1.0;
        }
        return max(0.0, min(1.0, $score));
    }

    /**
     * The level a score reaches.
     *
     * @param float $score 0..1
     * @param int[] $thresholds Lower bound in percent per level, the first being 0.
     * @return int 1-based level.
     */
    public static function level_for_score(float $score, array $thresholds): int {
        $pct = round($score * 100, 4);
        $level = 1;
        foreach (array_values($thresholds) as $index => $bound) {
            if ($pct >= $bound) {
                $level = $index + 1;
            }
        }
        return $level;
    }

    /**
     * The level one completed interaction earns for one outcome.
     *
     * @param array $entry The outcome's mapping entry on the interaction.
     * @param \stdClass|null $detail The completion detail.
     * @param float $itemmax The interaction's XP.
     * @return int 1-based level.
     */
    public static function level_for_item(array $entry, ?\stdClass $detail, float $itemmax): int {
        if (($entry['mode'] ?? '') === self::MODE_FIXED) {
            return max(1, (int) ($entry['level'] ?? 1));
        }
        return self::level_for_score(self::score_from_detail($detail, $itemmax), $entry['thresholds'] ?? [0]);
    }

    /**
     * Computes a learner's level on every outcome the given interactions are linked to.
     *
     * Only linked interactions the learner has completed contribute, each weighted by its XP
     * (weight 1 when it has none, so completion-only interactions still count). An outcome
     * with no completed linked interaction maps to null, meaning "no outcome".
     *
     * @param array $items The activity's gradable interactions.
     * @param array $details Completion details, decoded; deleted ones are ignored.
     * @param array $completeditems Completed interaction ids.
     * @return array Outcome id => level or null. Empty when nothing is linked.
     */
    public static function compute_ratings(array $items, array $details, array $completeditems): array {
        $completed = array_flip(array_map('strval', $completeditems));
        $byid = [];
        foreach ($details as $detail) {
            if (is_object($detail) && isset($detail->id) && empty($detail->deleted)) {
                $byid[(string) $detail->id] = $detail;
            }
        }

        $ratings = [];
        $sums = [];
        foreach ($items as $item) {
            $item = (array) $item;
            if (isset($item['hascompletion']) && (int) $item['hascompletion'] !== 1) {
                continue;
            }
            $mapping = self::parse_mapping($item);
            if (empty($mapping)) {
                continue;
            }
            $itemid = (string) ($item['id'] ?? '');
            $xp = (float) ($item['xp'] ?? 0);
            $weight = $xp > 0 ? $xp : 1.0;
            foreach ($mapping as $outcomeid => $entry) {
                if (!array_key_exists($outcomeid, $ratings)) {
                    $ratings[$outcomeid] = null;
                }
                if (!isset($completed[$itemid]) || !isset($byid[$itemid])) {
                    continue;
                }
                $level = self::level_for_item($entry, $byid[$itemid], $xp);
                if (!isset($sums[$outcomeid])) {
                    $sums[$outcomeid] = ['num' => 0.0, 'den' => 0.0];
                }
                $sums[$outcomeid]['num'] += $level * $weight;
                $sums[$outcomeid]['den'] += $weight;
            }
        }

        foreach ($sums as $outcomeid => $sum) {
            if ($sum['den'] > 0) {
                $ratings[$outcomeid] = max(1, (int) floor($sum['num'] / $sum['den'] + 0.5));
            }
        }
        ksort($ratings);
        return $ratings;
    }

    /**
     * Writes computed levels to the activity's outcome grade items.
     *
     * Outcome items are not overridable, so this simply replaces whatever is there,
     * including a teacher's manual rating. Items the mapping does not mention are left alone.
     *
     * @param \grade_item[] $outcomeitems Keyed by outcome id, see {@see get_outcome_grade_items()}.
     * @param int $userid The learner.
     * @param array $ratings Outcome id => level or null.
     * @param string $source Source recorded in the grade history, e.g. 'mod/interactivevideo'.
     * @param bool $isbulkupdate Passed through to update_final_grade().
     * @return array Outcome id => whether the write succeeded.
     */
    public static function write_ratings(
        array $outcomeitems,
        int $userid,
        array $ratings,
        string $source,
        bool $isbulkupdate = false
    ): array {
        $result = [];
        foreach ($ratings as $outcomeid => $level) {
            if (!isset($outcomeitems[$outcomeid])) {
                continue;
            }
            $item = $outcomeitems[$outcomeid];
            if ($level === null) {
                // Nothing to clear when the learner never had a rating on this item.
                $existing = \grade_grade::fetch(['itemid' => $item->id, 'userid' => $userid]);
                if (!$existing || $existing->finalgrade === null) {
                    $result[$outcomeid] = true;
                    continue;
                }
            }
            $value = $level === null ? null : (int) $level;
            $ok = $item->update_final_grade($userid, $value, $source, false, FORMAT_MOODLE, null, null, $isbulkupdate);
            if (!$ok) {
                debugging("Outcome item {$item->id} could not be rated for user {$userid} (locked?)", DEBUG_DEVELOPER);
            }
            $result[$outcomeid] = (bool) $ok;
        }
        return $result;
    }

    /**
     * Rates one learner from their current progress.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param int $userid The learner.
     * @param array $items The activity's gradable interactions.
     * @param array $details Completion details, decoded.
     * @param array $completeditems Completed interaction ids.
     * @param bool $isbulkupdate Passed through to update_final_grade().
     * @return array Outcome id => whether the write succeeded.
     */
    public static function rate_user(
        string $modname,
        int $instanceid,
        int $userid,
        array $items,
        array $details,
        array $completeditems,
        bool $isbulkupdate = false
    ): array {
        if (!self::is_enabled()) {
            return [];
        }
        $ratings = self::compute_ratings($items, $details, $completeditems);
        if (empty($ratings)) {
            return [];
        }
        $outcomeitems = self::get_outcome_grade_items($modname, $instanceid);
        if (empty($outcomeitems)) {
            return [];
        }
        return self::write_ratings($outcomeitems, $userid, $ratings, 'mod/' . $modname, $isbulkupdate);
    }

    /**
     * Clears a learner's ratings on every mapped outcome, e.g. after their progress was deleted.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param int $userid The learner.
     * @param array $items The activity's gradable interactions.
     * @return array Outcome id => whether the write succeeded.
     */
    public static function clear_user(string $modname, int $instanceid, int $userid, array $items): array {
        return self::rate_user($modname, $instanceid, $userid, $items, [], []);
    }

    /**
     * Rates every learner with progress on an activity.
     *
     * Run out of band after a mapping changes, so learners get their ratings without having
     * to attempt the activity again.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     */
    public static function rate_all(string $modname, int $instanceid): void {
        if (!self::is_enabled()) {
            return;
        }
        $source = self::source_for($modname, $instanceid);
        if (!$source) {
            return;
        }
        $source->invalidate_items_cache();
        $items = $source->get_gradable_items();
        if (empty(self::mapped_outcome_ids($items))) {
            return;
        }
        $outcomeitems = self::get_outcome_grade_items($modname, $instanceid, false);
        if (empty($outcomeitems)) {
            return;
        }
        $rs = $source->get_completion_recordset();
        foreach ($rs as $row) {
            [$details, $completed] = self::decode_progress($row);
            $ratings = self::compute_ratings($items, $details, $completed);
            self::write_ratings($outcomeitems, (int) $row->userid, $ratings, 'mod/' . $modname, true);
        }
        $rs->close();
    }

    /**
     * Removes every rating on the activity's mapped outcome items, for a course reset.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     */
    public static function reset_ratings(string $modname, int $instanceid): void {
        $source = self::source_for($modname, $instanceid);
        if (!$source) {
            return;
        }
        $mapped = self::mapped_outcome_ids($source->get_gradable_items());
        if (empty($mapped)) {
            return;
        }
        foreach (self::get_outcome_grade_items($modname, $instanceid, false) as $outcomeid => $item) {
            if (in_array($outcomeid, $mapped, true)) {
                $item->delete_all_grades('reset');
            }
        }
    }

    /**
     * Queues a rating pass over the whole activity.
     *
     * Deduplicated, so repeated edits before cron runs cost one pass.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     */
    public static function queue_backfill(string $modname, int $instanceid): void {
        if ($instanceid <= 0 || !self::is_enabled()) {
            return;
        }
        $task = new \mod_interactivevideo\task\rate_outcomes();
        $task->set_custom_data(['modname' => $modname, 'instanceid' => $instanceid]);
        $task->set_component('mod_interactivevideo');
        // The interaction row is written moments after this is queued; give it a head start.
        $task->set_next_run_time(time() + 60);
        \core\task\manager::queue_adhoc_task($task, true);
    }

    /**
     * Queues a rating pass when an interaction's mapping or weight changed.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @param string|null $oldadvanced The stored advanced JSON, null for a new interaction.
     * @param array $newmapping The mapping about to be stored.
     * @param mixed $oldxp The stored XP.
     * @param mixed $newxp The XP about to be stored.
     * @return bool Whether a pass was queued.
     */
    public static function queue_backfill_if_changed(
        string $modname,
        int $instanceid,
        ?string $oldadvanced,
        array $newmapping,
        $oldxp = null,
        $newxp = null
    ): bool {
        $oldmapping = $oldadvanced === null ? [] : self::parse_advanced($oldadvanced);
        ksort($newmapping);
        $changed = $oldmapping != $newmapping;
        if (!$changed && !empty($newmapping) && $oldxp !== null && $newxp !== null) {
            $changed = (float) $oldxp != (float) $newxp;
        }
        if (!$changed) {
            return false;
        }
        self::queue_backfill($modname, $instanceid);
        return true;
    }

    /**
     * Drops outcome links a course cannot honour, from an interaction copied into it.
     *
     * Outcome ids are local to the site, so an interaction copied in from another site
     * carries ids that mean nothing here, and could in principle collide with a real
     * outcome of this course. Links to outcomes the course cannot use are therefore
     * dropped. Links to outcomes it can use are kept even when the target activity has not
     * attached them yet: the teacher may tick them afterwards, and the link is then ready.
     *
     * Restores do not come through here; they remap ids properly, see
     * {@see remap_for_restore()}.
     *
     * @param string|null $advanced The advanced column as copied.
     * @param int $courseid The course the interaction has been copied into.
     * @return string|null The advanced column to store.
     */
    public static function restrict_to_course(?string $advanced, int $courseid): ?string {
        if ($advanced === null || $advanced === '') {
            return $advanced;
        }
        $decoded = json_decode($advanced);
        if (!is_object($decoded) || !isset($decoded->{self::ADVANCED_KEY})) {
            return $advanced;
        }

        $mapping = self::parse_structure($decoded->{self::ADVANCED_KEY});
        if (!empty($mapping)) {
            $available = self::is_enabled() ? \grade_outcome::fetch_all_available($courseid) : [];
            $mapping = array_intersect_key($mapping, $available ? $available : []);
        }

        self::encode($decoded, $mapping);
        return json_encode($decoded);
    }

    /**
     * Queues a rating pass when an activity's settings have outcomes ticked.
     *
     * Core creates the outcome grade items after the module's update function runs, so the
     * pass is queued blind and finds them by the time it executes. Without it, learners who
     * already have progress would wait until their next attempt to be rated on an outcome
     * the teacher just attached.
     *
     * @param \stdClass $moduleinfo The submitted activity form data.
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return bool Whether a pass was queued.
     */
    public static function queue_backfill_for_activity($moduleinfo, string $modname, int $instanceid): bool {
        if (!self::is_enabled() || $instanceid <= 0) {
            return false;
        }
        foreach ((array) $moduleinfo as $key => $value) {
            if (!empty($value) && preg_match('/^outcome_\d+$/', $key)) {
                self::queue_backfill($modname, $instanceid);
                return true;
            }
        }
        return false;
    }

    /**
     * Rewrites the outcome ids in a restored interaction's advanced JSON.
     *
     * @param string|null $advanced The advanced column as restored.
     * @param callable $mapoutcomeid Old outcome id => new id, falsy when unknown.
     * @return string|null
     */
    public static function remap_for_restore(?string $advanced, callable $mapoutcomeid): ?string {
        if ($advanced === null || $advanced === '') {
            return $advanced;
        }
        $decoded = json_decode($advanced);
        if (!is_object($decoded) || !isset($decoded->{self::ADVANCED_KEY})) {
            return $advanced;
        }
        $remapped = [];
        foreach (self::parse_structure($decoded->{self::ADVANCED_KEY}) as $oldid => $entry) {
            $newid = (int) $mapoutcomeid($oldid);
            if ($newid > 0) {
                $remapped[$newid] = $entry;
            }
        }
        self::encode($decoded, $remapped);
        return json_encode($decoded);
    }

    /**
     * The module adapter for an activity, if the module provides one.
     *
     * @param string $modname Module name.
     * @param int $instanceid The activity instance id.
     * @return outcome_source_base|null Null when the module has no adapter or the activity is gone.
     */
    public static function source_for(string $modname, int $instanceid): ?outcome_source_base {
        $modname = clean_param($modname, PARAM_ALPHANUMEXT);
        $class = '\\mod_' . $modname . '\\local\\outcome_source';
        if (!class_exists($class) || !is_subclass_of($class, outcome_source_base::class)) {
            return null;
        }
        $source = new $class($instanceid);
        return $source->get_cm() ? $source : null;
    }
}
