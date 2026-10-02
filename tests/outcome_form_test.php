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

use mod_interactivevideo\fixtures\outcome_form_scored_fixture;
use mod_interactivevideo\fixtures\outcome_form_viewed_fixture;
use mod_interactivevideo\local\outcome_mapping;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
require_once($CFG->libdir . '/gradelib.php');
require_once(__DIR__ . '/fixtures/outcome_form_scored_fixture.php');
require_once(__DIR__ . '/fixtures/outcome_form_viewed_fixture.php');

/**
 * The "Outcomes" section of interaction forms and the mapping it stores.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\form\base_form
 * @covers     \mod_interactivevideo\local\outcome_mapping
 */
final class outcome_form_test extends \advanced_testcase {
    /** @var \stdClass */
    private $course;

    /** @var \stdClass */
    private $instance;

    /** @var \stdClass */
    private $cm;

    /** @var int */
    private $outcomeid;

    /**
     * A course and an activity with a three level outcome attached.
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

        $scale = $generator->create_scale(['scale' => 'Low,Mid,High', 'courseid' => $this->course->id]);
        $outcome = $generator->create_grade_outcome([
            'courseid' => $this->course->id,
            'shortname' => 'o1',
            'fullname' => 'Outcome 1',
            'scaleid' => $scale->id,
        ]);
        $this->outcomeid = (int) $outcome->id;
        $generator->create_grade_item([
            'courseid' => $this->course->id,
            'itemtype' => 'mod',
            'itemmodule' => 'interactivevideo',
            'iteminstance' => $this->instance->id,
            'itemnumber' => 1000,
            'itemname' => $outcome->fullname,
            'outcomeid' => $outcome->id,
        ]);
    }

    /**
     * The arguments the editor passes when opening a form.
     *
     * @param array $extra
     * @return array
     */
    private function args(array $extra = []): array {
        return $extra + [
            'id' => 0,
            'contextid' => \context_module::instance($this->cm->id)->id,
            'courseid' => $this->course->id,
            'cmid' => $this->cm->id,
            'annotationid' => $this->instance->id,
            'type' => 'richtext',
            'hascompletion' => 1,
        ];
    }

    /**
     * Name of an outcome field.
     *
     * @param string $suffix
     * @return string
     */
    private function field(string $suffix): string {
        return outcome_mapping::field_name($this->outcomeid, $suffix);
    }

    /**
     * The selected value of a select element.
     *
     * @param \MoodleQuickForm $mform
     * @param string $name
     * @return string
     */
    private function selected(\MoodleQuickForm $mform, string $name): string {
        $values = (array) $mform->getElement($name)->getValue();
        return (string) reset($values);
    }

    /**
     * A scored type gets the section before "Advanced", defaulting to thresholds.
     */
    public function test_section_for_scored_type(): void {
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());
        $mform = $form->mform();

        $this->assertTrue($mform->elementExists('outcomes'));
        $this->assertTrue($mform->elementExists('advanced'));
        foreach (['enabled', 'mode', 'lvl1', 'lvl2', 'lvl3', 'level'] as $suffix) {
            $this->assertTrue($mform->elementExists($this->field($suffix)), $suffix);
        }
        $this->assertFalse($mform->elementExists($this->field('lvl4')));
        $this->assertSame('score', $this->selected($mform, $this->field('mode')));

        // The section sits between the general fields and the advanced ones.
        $names = array_map(function ($element) {
            return $element->getName();
        }, $mform->_elements);
        $this->assertLessThan(array_search('outcomes', $names), array_search('xp', $names));
        $this->assertLessThan(array_search('advanced', $names), array_search('outcomes', $names));
    }

    /**
     * Descriptive text is styled the way the rest of the interaction forms style it.
     */
    public function test_description_text_is_muted(): void {
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());
        $mform = $form->mform();

        $muted = 'class="text-muted small w-100 d-block"';
        $this->assertStringContainsString($muted, $mform->getElement('outcomerating_desc')->toHtml());
        $this->assertStringContainsString($muted, $mform->getElement($this->field('thresholdsdesc'))->toHtml());
        $this->assertStringContainsString($muted, $mform->getElement($this->field('lvl1'))->toHtml());
    }

    /**
     * A completion-only type without an advanced section still gets it, defaulting to a fixed level.
     */
    public function test_section_for_completion_only_type(): void {
        $form = new outcome_form_viewed_fixture(null, null, 'post', '', [], true, $this->args());
        $mform = $form->mform();

        $this->assertTrue($mform->elementExists('outcomes'));
        $this->assertFalse($mform->elementExists('advanced'));
        $this->assertSame('fixed', $this->selected($mform, $this->field('mode')));
        $this->assertSame('3', $this->selected($mform, $this->field('level')));
    }

    /**
     * No section at all when the site has outcomes disabled.
     */
    public function test_no_section_when_disabled(): void {
        set_config('enableoutcomes', 0);
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());

        $this->assertFalse($form->mform()->elementExists('outcomes'));
        $this->assertFalse($form->mform()->elementExists($this->field('enabled')));
    }

    /**
     * An activity without outcomes attached only gets a pointer to its settings.
     */
    public function test_section_without_activity_outcomes(): void {
        global $DB;
        $DB->delete_records('grade_items', ['outcomeid' => $this->outcomeid]);

        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());
        $mform = $form->mform();

        $this->assertTrue($mform->elementExists('outcomes'));
        $this->assertTrue($mform->elementExists('outcomesnone'));
        $this->assertFalse($mform->elementExists($this->field('enabled')));
        $this->assertStringContainsString('update=' . $this->cm->id, $mform->getElement('outcomesnone')->toHtml());
    }

    /**
     * A stored mapping is spread into the form fields, and dropped when its outcome is gone.
     */
    public function test_set_data_default_prefills(): void {
        $advanced = json_encode(['autolaunch' => 1, 'outcomes' => [
            $this->outcomeid => ['mode' => 'score', 'thresholds' => [0, 40, 70]],
            $this->outcomeid + 1 => ['mode' => 'fixed', 'level' => 2],
        ]]);
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args([
            'id' => 5, 'advanced' => $advanced,
        ]));
        $data = $form->set_data_default();

        $this->assertSame(1, $data->{$this->field('enabled')});
        $this->assertSame('score', $data->{$this->field('mode')});
        $this->assertSame(40, $data->{$this->field('lvl2')});
        $this->assertSame(70, $data->{$this->field('lvl3')});
        $this->assertFalse(property_exists($data, 'outcomes'));
        $this->assertFalse(property_exists($data, outcome_mapping::field_name($this->outcomeid + 1, 'enabled')));
        $this->assertSame(1, $data->autolaunch);

        $fixed = json_encode(['outcomes' => [$this->outcomeid => ['mode' => 'fixed', 'level' => 2]]]);
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args([
            'id' => 5, 'advanced' => $fixed,
        ]));
        $data = $form->set_data_default();
        $this->assertSame('fixed', $data->{$this->field('mode')});
        $this->assertSame(2, $data->{$this->field('level')});
    }

    /**
     * Submitted fields become a normalised mapping in the advanced JSON, and queue a pass.
     */
    public function test_process_advanced_settings_stores_mapping(): void {
        global $DB;
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());

        $data = (object) $this->args([
            'hascompletion' => 1,
            'completiontracking' => 'complete',
            'xp' => 10,
            $this->field('enabled') => 1,
            $this->field('mode') => 'score',
            $this->field('lvl2') => '51',
            $this->field('lvl3') => '40',
        ]);
        $advanced = json_decode($form->process_advanced_settings($data), true);
        $this->assertSame(
            [$this->outcomeid => ['mode' => 'score', 'thresholds' => [0, 51, 52]]],
            $advanced['outcomes']
        );
        $this->assertSame(1, $advanced['autolaunch']);
        $this->assertSame(1, $DB->count_records('task_adhoc', ['classname' => '\mod_interactivevideo\task\rate_outcomes']));

        // Fixed level.
        $data->{$this->field('mode')} = 'fixed';
        $data->{$this->field('level')} = '2';
        $advanced = json_decode($form->process_advanced_settings($data), true);
        $this->assertSame([$this->outcomeid => ['mode' => 'fixed', 'level' => 2]], $advanced['outcomes']);

        // Not ticked: no key at all.
        $data->{$this->field('enabled')} = 0;
        $advanced = json_decode($form->process_advanced_settings($data), true);
        $this->assertArrayNotHasKey('outcomes', $advanced);

        // Ticked but the interaction has no completion: no key either.
        $data->{$this->field('enabled')} = 1;
        $data->hascompletion = 0;
        $advanced = json_decode($form->process_advanced_settings($data), true);
        $this->assertArrayNotHasKey('outcomes', $advanced);
    }

    /**
     * With outcomes disabled the form shows nothing, and keeps whatever mapping the item had.
     */
    public function test_process_advanced_settings_keeps_mapping_when_disabled(): void {
        global $DB;
        $item = $this->getDataGenerator()->get_plugin_generator('mod_interactivevideo')->create_item($this->instance, [
            'advanced' => json_encode(['outcomes' => [$this->outcomeid => ['mode' => 'fixed', 'level' => 1]]]),
        ]);
        set_config('enableoutcomes', 0);

        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args(['id' => $item->id]));
        $data = (object) $this->args(['id' => $item->id, 'hascompletion' => 1, 'xp' => 10]);
        $advanced = json_decode($form->process_advanced_settings($data), true);

        $this->assertSame([$this->outcomeid => ['mode' => 'fixed', 'level' => 1]], $advanced['outcomes']);
        $this->assertSame(0, $DB->count_records('task_adhoc', ['classname' => '\mod_interactivevideo\task\rate_outcomes']));
    }

    /**
     * Bad thresholds are reported on their own field, only where they apply.
     */
    public function test_validation(): void {
        $form = new outcome_form_scored_fixture(null, null, 'post', '', [], true, $this->args());
        $base = $this->args([
            'completiontracking' => 'complete',
            $this->field('enabled') => 1,
            $this->field('mode') => 'score',
            $this->field('lvl2') => '51',
            $this->field('lvl3') => '40',
        ]);

        $this->assertSame([$this->field('lvl3')], array_keys($form->validation($base, [])));
        $this->assertSame([], $form->validation([$this->field('mode') => 'fixed'] + $base, []));
        $this->assertSame([], $form->validation([$this->field('enabled') => 0] + $base, []));
        $this->assertSame([], $form->validation(['completiontracking' => 'none'] + $base, []));
        $this->assertSame([], $form->validation([$this->field('lvl3') => '86'] + $base, []));
    }
}
