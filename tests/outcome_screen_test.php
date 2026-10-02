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
require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
require_once($CFG->libdir . '/gradelib.php');

/**
 * The outcome list shown on the start and end screens.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\outcome_mapping::screen_rows
 * @covers     \mod_interactivevideo\local\outcome_mapping::get_user_ratings
 * @covers     \interactivevideo_display_options
 */
final class outcome_screen_test extends \advanced_testcase {
    /** @var \stdClass */
    private $course;

    /** @var \stdClass */
    private $instance;

    /** @var \stdClass */
    private $cm;

    /** @var \context_module */
    private $context;

    /** @var \stdClass */
    private $student;

    /**
     * A course, an activity and a student, with outcomes enabled.
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
    }

    /**
     * Attach an outcome to the activity, as ticking its box on the activity form does.
     *
     * @param string $shortname
     * @param string $scale Comma separated scale items.
     * @param int $itemnumber
     * @return \stdClass The grade item record.
     */
    private function attach_outcome(string $shortname, string $scale, int $itemnumber): \stdClass {
        $generator = $this->getDataGenerator();
        $scale = $generator->create_scale(['scale' => $scale, 'courseid' => $this->course->id]);
        $outcome = $generator->create_grade_outcome([
            'courseid' => $this->course->id,
            'shortname' => $shortname,
            'fullname' => 'Outcome ' . $shortname,
            'scaleid' => $scale->id,
        ]);
        return $generator->create_grade_item([
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
     * Rate a learner on an outcome item.
     *
     * @param \stdClass $item The grade item record.
     * @param int $userid
     * @param int|null $level
     */
    private function rate(\stdClass $item, int $userid, ?int $level): void {
        \grade_item::fetch(['id' => $item->id])->update_final_grade($userid, $level, 'test');
    }

    /**
     * The stored advanced column of an interaction.
     *
     * @param int $itemid
     * @return string|null
     */
    private function get_advanced(int $itemid): ?string {
        global $DB;
        $value = $DB->get_field('interactivevideo_items', 'advanced', ['id' => $itemid]);
        return $value === false ? null : $value;
    }

    /**
     * The rows for the current user.
     *
     * @param int|null $userid
     * @return array
     */
    private function rows(?int $userid = null): array {
        return outcome_mapping::screen_rows(
            'interactivevideo',
            (int) $this->instance->id,
            $userid === null ? (int) $this->student->id : $userid,
            $this->context
        );
    }

    /**
     * Every attached outcome is listed, rated or not.
     */
    public function test_rows_cover_every_attached_outcome(): void {
        $rated = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $this->attach_outcome('o2', 'No,Yes', 1001);
        $this->rate($rated, (int) $this->student->id, 2);

        $rows = $this->rows();
        usort($rows, function ($a, $b) {
            return strcmp($a['name'], $b['name']);
        });

        $this->assertCount(2, $rows);
        $this->assertSame('Outcome o1', $rows[0]['name']);
        $this->assertSame('o1', $rows[0]['shortname']);
        $this->assertSame('Mid', $rows[0]['rating']);
        $this->assertFalse($rows[0]['notrated']);
        $this->assertSame('Outcome o2', $rows[1]['name']);
        $this->assertSame(get_string('nooutcome', 'grades'), $rows[1]['rating']);
        $this->assertTrue($rows[1]['notrated']);
    }

    /**
     * Each learner sees their own standing.
     */
    public function test_rows_are_per_user(): void {
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $other = $this->getDataGenerator()->create_and_enrol($this->course, 'student');
        $this->rate($item, (int) $this->student->id, 3);
        $this->rate($item, (int) $other->id, 1);

        $this->assertSame('High', $this->rows()[0]['rating']);
        $this->assertSame('Low', $this->rows((int) $other->id)[0]['rating']);
    }

    /**
     * A grade outside the scale, or none at all, reads as no outcome.
     */
    public function test_rows_without_a_usable_grade(): void {
        global $DB;
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $this->rate($item, (int) $this->student->id, 2);

        // A scale shortened after the rating was given leaves the stored level dangling.
        $DB->set_field('grade_grades', 'finalgrade', 9, ['itemid' => $item->id, 'userid' => $this->student->id]);
        $this->assertSame(get_string('nooutcome', 'grades'), $this->rows()[0]['rating']);
        $this->assertTrue($this->rows()[0]['notrated']);

        $DB->set_field('grade_grades', 'finalgrade', null, ['itemid' => $item->id, 'userid' => $this->student->id]);
        $this->assertSame(get_string('nooutcome', 'grades'), $this->rows()[0]['rating']);
    }

    /**
     * Nothing to show without outcomes attached, or with the feature off site-wide.
     */
    public function test_rows_are_empty_when_there_is_nothing_to_show(): void {
        $this->assertSame([], $this->rows());

        $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        // The attached items are memoised for the request, which a page render never
        // outlives but a test does.
        \cache::make_from_params(\cache_store::MODE_REQUEST, 'mod_interactivevideo', 'outcomeitems')->purge();
        $this->assertCount(1, $this->rows());

        set_config('enableoutcomes', 0);
        $this->assertSame([], $this->rows());
    }

    /**
     * Ratings for a whole screen cost one query.
     */
    public function test_ratings_are_read_in_one_query(): void {
        global $DB;
        $first = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $second = $this->attach_outcome('o2', 'No,Yes', 1001);
        $this->rate($first, (int) $this->student->id, 2);
        $this->rate($second, (int) $this->student->id, 1);

        // Warm the memoised item list, so what is measured is the grade read alone.
        outcome_mapping::get_outcome_grade_items('interactivevideo', (int) $this->instance->id);

        $before = $DB->perf_get_reads();
        $ratings = outcome_mapping::get_user_ratings(
            'interactivevideo',
            (int) $this->instance->id,
            (int) $this->student->id
        );
        $this->assertSame(1, $DB->perf_get_reads() - $before);
        $this->assertSame([2.0, 1.0], array_values($ratings));
    }

    /**
     * The report's outcome data is read in one query, however many learners it covers.
     *
     * Neither report paginates on the server, so a per-row read would be a query per learner.
     */
    public function test_report_ratings_cost_one_query(): void {
        global $DB;
        $first = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $second = $this->attach_outcome('o2', 'No,Yes', 1001);

        $learners = [$this->student];
        for ($i = 0; $i < 4; $i++) {
            $learners[] = $this->getDataGenerator()->create_and_enrol($this->course, 'student');
        }
        foreach ($learners as $index => $learner) {
            $this->rate($first, (int) $learner->id, ($index % 3) + 1);
            if ($index % 2 === 0) {
                $this->rate($second, (int) $learner->id, 2);
            }
        }

        // Warm the memoised item list, so what is measured is the ratings read alone.
        outcome_mapping::get_outcome_grade_items('interactivevideo', (int) $this->instance->id);

        $before = $DB->perf_get_reads();
        $ratings = outcome_mapping::report_ratings('interactivevideo', (int) $this->instance->id);
        // A recordset costs 1 read on MySQL/MariaDB but 3 on Postgres (DECLARE, FETCH, CLOSE).
        $expectedreads = $DB->get_dbfamily() === 'postgres' ? 3 : 1;
        $this->assertSame($expectedreads, $DB->perf_get_reads() - $before);

        $this->assertCount(5, $ratings);
        $this->assertSame(2, count($ratings[$this->student->id]));
        $this->assertSame(1, $ratings[$this->student->id][$first->outcomeid]);
    }

    /**
     * A learner's cell counts the outcomes they have been rated on.
     */
    public function test_report_row(): void {
        $empty = outcome_mapping::report_row([], 2);
        $this->assertSame(0, $empty['rated']);
        $this->assertSame(2, $empty['total']);
        $this->assertSame([], (array) $empty['levels']);

        $row = outcome_mapping::report_row([7 => 2, 8 => 1], 3);
        $this->assertSame(2, $row['rated']);
        $this->assertSame(3, $row['total']);
        $this->assertSame(2, $row['levels']->{7});
    }

    /**
     * The report describes each outcome with its scale and the interactions feeding it.
     */
    public function test_report_definitions(): void {
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $other = $this->attach_outcome('o2', 'No,Yes', 1001);
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo');

        $generator->create_item($this->instance, [
            'title' => 'Opening quiz',
            'advanced' => json_encode(['outcomes' => [
                $item->outcomeid => ['mode' => 'fixed', 'level' => 2],
            ]]),
        ]);
        $generator->create_item($this->instance, [
            'title' => 'Closing quiz',
            'advanced' => json_encode(['outcomes' => [
                $item->outcomeid => ['mode' => 'fixed', 'level' => 3],
            ]]),
        ]);
        // An interaction feeding nothing, and an outcome nothing feeds.
        $generator->create_item($this->instance, ['title' => 'Just a read']);

        $definitions = outcome_mapping::report_definitions(
            'interactivevideo',
            (int) $this->instance->id,
            $this->context
        );
        $this->assertCount(2, $definitions);
        $this->assertSame('Outcome o1', $definitions[0]['name']);
        $this->assertSame('o1', $definitions[0]['shortname']);
        $this->assertSame(['Low', 'Mid', 'High'], $definitions[0]['levels']);
        $this->assertSame(
            ['Opening quiz', 'Closing quiz'],
            array_column($definitions[0]['items'], 'title')
        );

        $this->assertSame((int) $other->outcomeid, $definitions[1]['id']);
        $this->assertSame([], $definitions[1]['items']);

        set_config('enableoutcomes', 0);
        $this->assertSame([], outcome_mapping::report_definitions('interactivevideo', (int) $this->instance->id));
    }

    /**
     * Saving progress hands back the learner's fresh standing for the screens to redraw with.
     */
    public function test_save_progress_returns_fresh_rows(): void {
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $interaction = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')->create_item(
            $this->instance,
            [
                'xp' => 10,
                'completiontracking' => 'complete',
                'advanced' => json_encode(['outcomes' => [
                    $item->outcomeid => ['mode' => 'fixed', 'level' => 3],
                ]]),
            ]
        );

        $this->setUser($this->student);
        $record = \interactivevideo_util::save_progress(
            $this->instance->id,
            $this->student->id,
            json_encode([(string) $interaction->id]),
            json_encode(['id' => $interaction->id, 'xp' => 10, 'percent' => 1, 'hasDetails' => false]),
            true,
            'contentbank',
            '',
            0,
            0,
            0,
            0,
            0,
            false,
            $this->course->id
        );
        $this->setAdminUser();

        $this->assertNotEmpty($record->outcomes);
        $this->assertSame('High', $record->outcomes[0]['rating']);
        $this->assertFalse($record->outcomes[0]['notrated']);
    }

    /**
     * An interaction copied in keeps only the outcome links this course can honour.
     *
     * Outcome ids are local to a site, so a pack from elsewhere carries ids that mean
     * nothing here and could collide with a real outcome of this course.
     */
    public function test_copied_interactions_drop_foreign_outcome_links(): void {
        $mine = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $entry = ['mode' => 'fixed', 'level' => 2];

        // An outcome of this course survives, even though no activity has attached it yet.
        $kept = json_encode(['autolaunch' => 1, 'outcomes' => [$mine->outcomeid => $entry]]);
        $result = outcome_mapping::restrict_to_course($kept, (int) $this->course->id);
        $this->assertSame(
            [(int) $mine->outcomeid => $entry],
            outcome_mapping::parse_advanced($result)
        );
        $this->assertSame(1, json_decode($result)->autolaunch);

        // An id this course cannot use is dropped, and the key goes with the last one.
        $foreign = json_encode(['autolaunch' => 1, 'outcomes' => [($mine->outcomeid + 500) => $entry]]);
        $result = outcome_mapping::restrict_to_course($foreign, (int) $this->course->id);
        $this->assertSame([], outcome_mapping::parse_advanced($result));
        $this->assertFalse(property_exists(json_decode($result), 'outcomes'));

        // Interactions with no links, and empty input, are handled.
        $this->assertSame('{"autolaunch":1}', outcome_mapping::restrict_to_course('{"autolaunch":1}', (int) $this->course->id));
        $this->assertNull(outcome_mapping::restrict_to_course(null, (int) $this->course->id));
    }

    /**
     * Importing an interaction into another course strips links that course cannot honour.
     */
    public function test_import_annotations_strips_foreign_links(): void {
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $source = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')->create_item(
            $this->instance,
            ['advanced' => json_encode(['outcomes' => [$item->outcomeid => ['mode' => 'fixed', 'level' => 2]]])]
        );
        // The importer is fed items as the editor lists them, which carry their content
        // type's properties rather than the bare database row.
        $source->prop = json_encode(['class' => '']);

        // A second course, which knows nothing of that outcome.
        $othercourse = $this->getDataGenerator()->create_course();
        $otherinstance = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')
            ->create_instance(['course' => $othercourse->id]);
        $othercm = get_coursemodule_from_instance('interactivevideo', $otherinstance->id, 0, false, MUST_EXIST);
        $othercontext = \context_module::instance($othercm->id);

        $copied = \interactivevideo_util::import_annotations(
            (int) $this->course->id,
            (int) $othercourse->id,
            (int) $othercm->id,
            (int) $this->instance->id,
            (int) $otherinstance->id,
            [(array) $source],
            $othercontext->id
        );

        $this->assertCount(1, $copied);
        $stored = $this->get_advanced((int) $copied[0]->id);
        $this->assertSame([], outcome_mapping::parse_advanced($stored));
    }

    /**
     * Copied inside its own course, the link survives for the teacher to use.
     */
    public function test_import_annotations_keeps_links_in_the_same_course(): void {
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);
        $source = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')->create_item(
            $this->instance,
            ['advanced' => json_encode(['outcomes' => [$item->outcomeid => ['mode' => 'fixed', 'level' => 2]]])]
        );
        $source->prop = json_encode(['class' => '']);

        $copied = \interactivevideo_util::import_annotations(
            (int) $this->course->id,
            (int) $this->course->id,
            (int) $this->cm->id,
            (int) $this->instance->id,
            (int) $this->instance->id,
            [(array) $source],
            $this->context->id
        );

        $stored = $this->get_advanced((int) $copied[0]->id);
        $this->assertSame(
            [(int) $item->outcomeid => ['mode' => 'fixed', 'level' => 2]],
            outcome_mapping::parse_advanced($stored)
        );
    }

    /**
     * Attaching an outcome to the activity queues a pass over existing progress.
     */
    public function test_attaching_an_outcome_queues_a_backfill(): void {
        global $DB;
        $task = '\mod_interactivevideo\task\rate_outcomes';
        $item = $this->attach_outcome('o1', 'Low,Mid,High', 1000);

        // Settings saved with no outcome ticked: nothing to catch up on.
        $this->assertFalse(outcome_mapping::queue_backfill_for_activity(
            (object) ['name' => 'Something'],
            'interactivevideo',
            (int) $this->instance->id
        ));
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => $task]));

        // An outcome ticked on the activity form queues one.
        $this->assertTrue(outcome_mapping::queue_backfill_for_activity(
            (object) ['outcome_' . $item->outcomeid => 1],
            'interactivevideo',
            (int) $this->instance->id
        ));
        $this->assertSame(1, $DB->count_records('task_adhoc', ['classname' => $task]));

        // Our own screen settings are not outcome checkboxes.
        $DB->delete_records('task_adhoc', ['classname' => $task]);
        $this->assertFalse(outcome_mapping::queue_backfill_for_activity(
            (object) ['showoutcomesonreport' => 1],
            'interactivevideo',
            (int) $this->instance->id
        ));
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => $task]));

        // Nor is an unticked box.
        $this->assertFalse(outcome_mapping::queue_backfill_for_activity(
            (object) ['outcome_' . $item->outcomeid => 0],
            'interactivevideo',
            (int) $this->instance->id
        ));
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => $task]));
    }

    /**
     * A form that does not offer the screen settings must not switch them off.
     *
     * The quick settings form rebuilds the whole display options blob from its own fields,
     * so without this the first quick edit would silently clear both settings.
     */
    public function test_display_options_preserve_the_screen_settings(): void {
        $submitted = (object) ['showoutcomesonstartscreen' => 1, 'showoutcomesonendscreen' => 0];
        $options = interactivevideo_display_options($submitted);
        $this->assertSame(1, $options['showoutcomesonstartscreen']);
        $this->assertSame(0, $options['showoutcomesonendscreen']);

        // A form without the fields keeps whatever is stored.
        $stored = ['showoutcomesonstartscreen' => 1, 'showoutcomesonendscreen' => 1];
        $options = interactivevideo_display_options(new \stdClass(), $stored);
        $this->assertSame(1, $options['showoutcomesonstartscreen']);
        $this->assertSame(1, $options['showoutcomesonendscreen']);

        // And defaults to off when nothing is stored either.
        $options = interactivevideo_display_options(new \stdClass());
        $this->assertSame(0, $options['showoutcomesonstartscreen']);
        $this->assertSame(0, $options['showoutcomesonendscreen']);
    }
}
