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

namespace mod_interactivevideo;

use mod_interactivevideo\local\outcome_mapping;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
require_once($CFG->libdir . '/gradelib.php');

/**
 * Outcome ratings are written to the gradebook as learners' progress changes.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\outcome_mapping
 * @covers     \interactivevideo_util::save_progress
 * @covers     \interactivevideo_util::override_completion_xp
 * @covers     \interactivevideo_util::delete_completion_data
 * @covers     \interactivevideo_util::delete_progress_by_id
 */
final class outcome_rating_test extends \advanced_testcase {
    /** @var array A three level threshold mapping. */
    private const SCORE = ['mode' => 'score', 'thresholds' => [0, 51, 86]];

    /** @var \stdClass */
    private $course;

    /** @var \stdClass */
    private $instance;

    /** @var \stdClass */
    private $cm;

    /** @var \context_module */
    private $context;

    /** @var \stdClass The outcome. */
    private $outcome;

    /** @var \stdClass The outcome grade item record. */
    private $outcomeitem;

    /** @var \stdClass */
    private $student;

    /**
     * A course, an activity with one outcome attached, and a student.
     */
    protected function setUp(): void {
        parent::setUp();
        $this->resetAfterTest();
        $this->setAdminUser();
        set_config('enableoutcomes', 1);

        $generator = $this->getDataGenerator();
        $this->course = $generator->create_course();
        $this->instance = $generator->get_plugin_generator('mod_interactivevideo')
            ->create_instance(['course' => $this->course->id]);
        $this->cm = get_coursemodule_from_instance('interactivevideo', $this->instance->id, 0, false, MUST_EXIST);
        $this->context = \context_module::instance($this->cm->id);
        $this->student = $generator->create_and_enrol($this->course, 'student');

        $this->outcome = $this->create_outcome('o1', 'Incompetent,Competent,Highly competent');
        $this->outcomeitem = $this->attach_outcome($this->outcome, 1000);
    }

    /**
     * Create a course outcome on a fresh scale.
     *
     * @param string $shortname
     * @param string $scale Comma separated scale items.
     * @return \stdClass
     */
    private function create_outcome(string $shortname, string $scale): \stdClass {
        $generator = $this->getDataGenerator();
        $scale = $generator->create_scale(['scale' => $scale, 'courseid' => $this->course->id]);
        return $generator->create_grade_outcome([
            'courseid' => $this->course->id,
            'shortname' => $shortname,
            'fullname' => 'Outcome ' . $shortname,
            'scaleid' => $scale->id,
        ]);
    }

    /**
     * Attach an outcome to the activity the way the activity form does.
     *
     * @param \stdClass $outcome
     * @param int $itemnumber
     * @return \stdClass The grade item record.
     */
    private function attach_outcome(\stdClass $outcome, int $itemnumber): \stdClass {
        return $this->getDataGenerator()->create_grade_item([
            'courseid' => $this->course->id,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'iteminstance' => $this->instance->id,
            'itemnumber' => $itemnumber,
            'itemname' => $outcome->fullname,
            'outcomeid' => $outcome->id,
        ]);
    }

    /**
     * Create an interaction linked to outcomes.
     *
     * @param array $outcomes Outcome id => mapping entry.
     * @param array $overrides Further item fields.
     * @return \stdClass
     */
    private function create_item(array $outcomes, array $overrides = []): \stdClass {
        $advanced = ['autolaunch' => 1];
        if ($outcomes) {
            $advanced['outcomes'] = $outcomes;
        }
        return $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')->create_item(
            $this->instance,
            $overrides + [
                'xp' => 10,
                'completiontracking' => 'complete',
                'advanced' => json_encode($advanced),
            ]
        );
    }

    /**
     * Save progress for the student on one interaction, as the player does after an attempt.
     *
     * @param \stdClass $item The interaction.
     * @param array $detail Detail fields; xp is the interesting one.
     * @param array $alsocompleted Other interaction ids already completed.
     * @return \stdClass The completion record.
     */
    private function complete(\stdClass $item, array $detail = [], array $alsocompleted = []): \stdClass {
        $completed = array_map('strval', array_merge($alsocompleted, [$item->id]));
        $detail += ['id' => $item->id, 'xp' => $item->xp, 'percent' => 1, 'hasDetails' => false];

        // Progress is only ever materialised for the current user.
        $this->setUser($this->student);
        try {
            return \interactivevideo_util::save_progress(
                $this->instance->id,
                $this->student->id,
                json_encode($completed),
                json_encode($detail),
                true,
                $item->completiontracking === 'view' ? 'richtext' : 'contentbank',
                '',
                0,
                0,
                0,
                0,
                0,
                false,
                $this->course->id
            );
        } finally {
            $this->setAdminUser();
        }
    }

    /**
     * The student's stored rating on an outcome item, null for "no outcome".
     *
     * @param \stdClass|null $item The outcome grade item record; the default one if null.
     * @return int|null
     */
    private function rating(?\stdClass $item = null): ?int {
        global $DB;
        $item = $item ?? $this->outcomeitem;
        $final = $DB->get_field('grade_grades', 'finalgrade', ['itemid' => $item->id, 'userid' => $this->student->id]);
        return ($final === false || $final === null) ? null : (int) $final;
    }

    /**
     * A score is mapped through the thresholds and rewritten on every attempt.
     */
    public function test_score_mode_rates_on_save(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);

        $this->complete($item, ['xp' => 6]);
        $this->assertSame(2, $this->rating());

        $this->complete($item, ['xp' => 9]);
        $this->assertSame(3, $this->rating());

        $this->complete($item, ['xp' => 2]);
        $this->assertSame(1, $this->rating());
    }

    /**
     * Content that awards its full XP on completion, such as H5P with partial points off, scores 100 %.
     */
    public function test_full_xp_on_completion_is_full_score(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);

        $this->complete($item, ['xp' => 10, 'percent' => 1]);
        $this->assertSame(3, $this->rating());
    }

    /**
     * The XP fraction stands in when the detail carries no percent.
     */
    public function test_xp_fraction_when_no_percent(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);

        $this->complete($item, ['xp' => 7]);
        $this->assertSame(2, $this->rating());
    }

    /**
     * Several interactions feeding one outcome are averaged by XP.
     */
    public function test_two_items_weighted_mean(): void {
        $big = $this->create_item([$this->outcome->id => self::SCORE], ['xp' => 10]);
        $small = $this->create_item([$this->outcome->id => self::SCORE], ['xp' => 5]);

        $this->complete($big, ['xp' => 6]);
        $this->assertSame(2, $this->rating());

        // Weighted: (10 * 2 + 5 * 3) / 15 = 2.33.
        $this->complete($small, ['xp' => 5], [$big->id]);
        $this->assertSame(2, $this->rating());
    }

    /**
     * A completion-only interaction awards its fixed level, and mixes with scored ones.
     */
    public function test_fixed_mode(): void {
        $viewed = $this->create_item(
            [$this->outcome->id => ['mode' => 'fixed', 'level' => 2]],
            ['completiontracking' => 'view']
        );
        $this->complete($viewed);
        $this->assertSame(2, $this->rating());

        // Equal weight, levels 2 and 3: 2.5 rounds up.
        $scored = $this->create_item([$this->outcome->id => self::SCORE]);
        $this->complete($scored, ['xp' => 10], [$viewed->id]);
        $this->assertSame(3, $this->rating());
    }

    /**
     * One interaction may feed several outcomes, each with its own rule.
     */
    public function test_multiple_outcomes_per_item(): void {
        $other = $this->create_outcome('o2', 'No,Yes');
        $otheritem = $this->attach_outcome($other, 1001);
        $item = $this->create_item([
            $this->outcome->id => self::SCORE,
            $other->id => ['mode' => 'fixed', 'level' => 2],
        ]);

        $this->complete($item, ['xp' => 6]);
        $this->assertSame(2, $this->rating());
        $this->assertSame(2, $this->rating($otheritem));
    }

    /**
     * A teacher's XP override is the score from then on.
     */
    public function test_override_rerates(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);
        $record = $this->complete($item, ['xp' => 9]);
        $this->assertSame(3, $this->rating());

        \interactivevideo_util::override_completion_xp(
            $record->id,
            $item->id,
            $this->student->id,
            $this->context->id,
            3,
            $this->course->id
        );
        $this->assertSame(1, $this->rating());
    }

    /**
     * Deleting the learner's attempt on the only linked interaction leaves no outcome.
     */
    public function test_delete_completion_data_clears(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);
        $record = $this->complete($item, ['xp' => 9]);
        $this->assertSame(3, $this->rating());

        \interactivevideo_util::delete_completion_data($record->id, $item->id, $this->student->id, $this->context->id);
        $this->assertNull($this->rating());
    }

    /**
     * Deleting the learner's whole progress record clears their ratings too.
     */
    public function test_delete_progress_clears(): void {
        $item = $this->create_item([$this->outcome->id => self::SCORE]);
        $record = $this->complete($item, ['xp' => 9]);
        $this->assertSame(3, $this->rating());

        \interactivevideo_util::delete_progress_by_id($this->context->id, $record->id, $this->course->id, $this->cm->id);
        $this->assertNull($this->rating());
    }

    /**
     * With outcomes disabled site-wide nothing is written, mapping or not.
     */
    public function test_disabled_outcomes_write_nothing(): void {
        set_config('enableoutcomes', 0);
        $item = $this->create_item([$this->outcome->id => self::SCORE]);

        $this->complete($item, ['xp' => 9]);
        $this->assertNull($this->rating());
    }

    /**
     * A locked outcome item is left alone.
     */
    public function test_locked_item_left_alone(): void {
        $gradeitem = \grade_item::fetch(['id' => $this->outcomeitem->id]);
        $gradeitem->needsupdate = 0;
        $gradeitem->set_locked(true);
        $gradeitem->locked = time();
        $gradeitem->update();

        \cache::make_from_params(\cache_store::MODE_REQUEST, 'mod_interactivevideo', 'outcomeitems')->purge();

        $item = $this->create_item([$this->outcome->id => self::SCORE]);
        $this->complete($item, ['xp' => 9]);
        $this->assertDebuggingCalled();
        $this->assertNull($this->rating());
    }

    /**
     * A manual rating on a mapped outcome is replaced; one on an unmapped outcome is kept.
     */
    public function test_manual_rating_replaced_only_when_mapped(): void {
        $other = $this->create_outcome('o2', 'No,Yes');
        $otheritem = $this->attach_outcome($other, 1001);
        $item = $this->create_item([$this->outcome->id => self::SCORE]);

        \grade_item::fetch(['id' => $this->outcomeitem->id])->update_final_grade($this->student->id, 3, 'manual');
        \grade_item::fetch(['id' => $otheritem->id])->update_final_grade($this->student->id, 2, 'manual');

        $this->complete($item, ['xp' => 6]);
        $this->assertSame(2, $this->rating());
        $this->assertSame(2, $this->rating($otheritem));
    }

    /**
     * An interaction without a mapping leaves the outcome untouched.
     */
    public function test_unmapped_item_writes_nothing(): void {
        $item = $this->create_item([]);

        $this->complete($item, ['xp' => 9]);
        $this->assertNull($this->rating());
    }

    /**
     * Course reset with completion clears the ratings on mapped outcomes.
     */
    public function test_reset_userdata_clears_ratings(): void {
        global $CFG, $DB;
        require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');

        $item = $this->create_item([$this->outcome->id => self::SCORE]);
        $this->complete($item, ['xp' => 9]);
        $this->assertSame(3, $this->rating());

        interactivevideo_reset_userdata((object) [
            'courseid' => $this->course->id,
            'reset_completion' => 1,
            'reset_gradebook_grades' => 0,
        ]);
        $this->assertNull($this->rating());
        $this->assertSame(0, $DB->count_records('interactivevideo_completion', ['cmid' => $this->instance->id]));
    }
}
