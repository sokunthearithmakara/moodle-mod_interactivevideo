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

/**
 * The pure parts of outcome rating: parsing, normalising, scoring and averaging.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\outcome_mapping
 */
final class outcome_mapping_test extends \advanced_testcase {
    /**
     * An interaction record carrying a mapping.
     *
     * @param int $id
     * @param float $xp
     * @param array $outcomes The "outcomes" structure.
     * @param int $hascompletion
     * @return \stdClass
     */
    private function item(int $id, float $xp, array $outcomes, int $hascompletion = 1): \stdClass {
        return (object) [
            'id' => $id,
            'xp' => $xp,
            'hascompletion' => $hascompletion,
            'advanced' => json_encode(['outcomes' => $outcomes]),
        ];
    }

    /**
     * A completion detail.
     *
     * @param int $id
     * @param array $fields
     * @return \stdClass
     */
    private function detail(int $id, array $fields = []): \stdClass {
        return (object) ($fields + ['id' => $id, 'xp' => 10, 'percent' => 1]);
    }

    /**
     * Typed thresholds are cleaned into a valid list; garbage falls back to an even split.
     */
    public function test_normalise_thresholds(): void {
        $this->assertSame([0, 51, 86], outcome_mapping::normalise_thresholds(['lvl2' => '51', 'lvl3' => '86'], 3));
        $this->assertSame([0, 33, 66], outcome_mapping::normalise_thresholds(['lvl2' => '', 'lvl3' => 'abc'], 3));
        $this->assertSame([0, 90, 91], outcome_mapping::normalise_thresholds(['lvl2' => '90', 'lvl3' => '50'], 3));
        $this->assertSame([0, 100], outcome_mapping::normalise_thresholds(['lvl2' => '150'], 2));
        $this->assertSame([0, 51, 86], outcome_mapping::normalise_thresholds([0, 51, 86], 3));
        $this->assertSame([0], outcome_mapping::normalise_thresholds([], 1));
        $this->assertSame([0, 25, 50, 75], outcome_mapping::normalise_thresholds(null, 4));
    }

    /**
     * A fixed level is clamped to the scale and defaults to the top.
     */
    public function test_normalise_level(): void {
        $this->assertSame(3, outcome_mapping::normalise_level(null, 3));
        $this->assertSame(2, outcome_mapping::normalise_level('2', 3));
        $this->assertSame(3, outcome_mapping::normalise_level(9, 3));
        $this->assertSame(1, outcome_mapping::normalise_level(0, 3));
        $this->assertSame(1, outcome_mapping::normalise_level(5, 1));
    }

    /**
     * Strict validation reports the offending level only.
     */
    public function test_thresholds_errors(): void {
        $this->assertSame([], outcome_mapping::thresholds_errors(['lvl2' => '51', 'lvl3' => '86'], 3));
        $this->assertSame([3], array_keys(outcome_mapping::thresholds_errors(['lvl2' => '51', 'lvl3' => '40'], 3)));
        $this->assertSame([2], array_keys(outcome_mapping::thresholds_errors(['lvl3' => '86'], 3)));
        $this->assertSame([2], array_keys(outcome_mapping::thresholds_errors(['lvl2' => '50.5'], 2)));
        $this->assertSame([2], array_keys(outcome_mapping::thresholds_errors(['lvl2' => '0'], 2)));
        $this->assertSame([], outcome_mapping::thresholds_errors([], 1));
    }

    /**
     * A score reaches the highest level whose lower bound it meets.
     */
    public function test_level_for_score(): void {
        $thresholds = [0, 51, 86];
        $this->assertSame(1, outcome_mapping::level_for_score(0.0, $thresholds));
        $this->assertSame(1, outcome_mapping::level_for_score(0.5, $thresholds));
        $this->assertSame(2, outcome_mapping::level_for_score(0.51, $thresholds));
        $this->assertSame(2, outcome_mapping::level_for_score(0.859, $thresholds));
        $this->assertSame(3, outcome_mapping::level_for_score(0.86, $thresholds));
        $this->assertSame(3, outcome_mapping::level_for_score(1.0, $thresholds));
        $this->assertSame(1, outcome_mapping::level_for_score(1.0, [0]));
    }

    /**
     * The score is the detail's percent, with the XP fraction standing in when it is missing.
     */
    public function test_score_from_detail(): void {
        $this->assertSame(0.5, outcome_mapping::score_from_detail($this->detail(1, ['percent' => 0.5]), 10));
        $overridden = $this->detail(1, ['percent' => 0.6, 'xpOverridden' => true]);
        $this->assertSame(0.6, outcome_mapping::score_from_detail($overridden, 10));
        $this->assertSame(0.3, outcome_mapping::score_from_detail((object) ['id' => 1, 'xp' => 3], 10));
        $this->assertSame(1.0, outcome_mapping::score_from_detail((object) ['id' => 1, 'xp' => 3], 0));
        $this->assertSame(1.0, outcome_mapping::score_from_detail(null, 10));
        $this->assertSame(1.0, outcome_mapping::score_from_detail($this->detail(1, ['percent' => 1.5]), 10));
        $this->assertSame(0.0, outcome_mapping::score_from_detail($this->detail(1, ['percent' => -1]), 10));
        $this->assertSame(1.0, outcome_mapping::score_from_detail($this->detail(1, ['percent' => 'abc']), 0));
    }

    /**
     * Fixed mode ignores the score entirely.
     */
    public function test_level_for_item(): void {
        $detail = $this->detail(1, ['percent' => 0.1]);
        $this->assertSame(2, outcome_mapping::level_for_item(['mode' => 'fixed', 'level' => 2], $detail, 10));
        $this->assertSame(
            1,
            outcome_mapping::level_for_item(['mode' => 'score', 'thresholds' => [0, 51, 86]], $detail, 10)
        );
    }

    /**
     * Only well-formed entries survive parsing.
     */
    public function test_parse_mapping_drops_malformed_entries(): void {
        $item = (object) ['advanced' => json_encode(['outcomes' => [
            '12' => ['mode' => 'bogus'],
            '0' => ['mode' => 'fixed', 'level' => 2],
            '15' => ['mode' => 'fixed', 'level' => 0],
            '16' => [0, 50],
            '17' => ['mode' => 'score', 'thresholds' => [10, 50]],
            '18' => ['mode' => 'score', 'thresholds' => []],
            '19' => 'nope',
            '20' => ['mode' => 'fixed', 'level' => '2'],
        ]])];
        $this->assertSame([
            16 => ['mode' => 'score', 'thresholds' => [0, 50]],
            20 => ['mode' => 'fixed', 'level' => 2],
        ], outcome_mapping::parse_mapping($item));

        $this->assertSame([], outcome_mapping::parse_mapping(['advanced' => null]));
        $this->assertSame([], outcome_mapping::parse_mapping(['advanced' => 'not json']));
        $this->assertSame([], outcome_mapping::parse_mapping(['advanced' => '{"autolaunch":1}']));
        $this->assertSame([], outcome_mapping::parse_mapping([]));
    }

    /**
     * The union of outcome ids across interactions.
     */
    public function test_mapped_outcome_ids(): void {
        $items = [
            $this->item(1, 10, [5 => ['mode' => 'fixed', 'level' => 1], 7 => ['mode' => 'fixed', 'level' => 1]]),
            $this->item(2, 10, [7 => ['mode' => 'fixed', 'level' => 1]]),
            (object) ['id' => 3, 'advanced' => '{}'],
        ];
        $this->assertSame([5, 7], outcome_mapping::mapped_outcome_ids($items));
    }

    /**
     * Levels are averaged with XP as weight over completed, linked interactions.
     */
    public function test_compute_ratings_weighted_mean(): void {
        $score = [7 => ['mode' => 'score', 'thresholds' => [0, 51, 86]]];
        $items = [
            $this->item(1, 10, $score),
            $this->item(2, 5, $score),
            $this->item(3, 5, $score),
        ];
        $details = [
            $this->detail(1, ['percent' => 0.6]),
            $this->detail(2, ['percent' => 0.95]),
            $this->detail(3, ['percent' => 0.6]),
        ];

        // Weighted: (10 * 2 + 5 * 3) / 15 = 2.33. The third item is not completed and does not count.
        $this->assertSame([7 => 2], outcome_mapping::compute_ratings($items, $details, ['1', '2']));
        // Two completed at equal weight, levels 2 and 3, round half up to 3.
        $this->assertSame([7 => 3], outcome_mapping::compute_ratings($items, $details, ['2', '3']));
    }

    /**
     * An outcome with nothing completed is null; unlinked interactions do not appear at all.
     */
    public function test_compute_ratings_no_evidence(): void {
        $items = [
            $this->item(1, 10, [7 => ['mode' => 'fixed', 'level' => 2]]),
            $this->item(2, 10, [8 => ['mode' => 'fixed', 'level' => 3]]),
            (object) ['id' => 3, 'xp' => 10, 'hascompletion' => 1, 'advanced' => '{}'],
        ];
        $details = [$this->detail(1), $this->detail(3)];

        $this->assertSame([7 => 2, 8 => null], outcome_mapping::compute_ratings($items, $details, ['1', '3']));
        $this->assertSame([7 => null, 8 => null], outcome_mapping::compute_ratings($items, [], []));
    }

    /**
     * Deleted details, a missing detail and non-gradable interactions are ignored.
     */
    public function test_compute_ratings_ignores_deleted_and_ungradable(): void {
        $items = [
            $this->item(1, 10, [7 => ['mode' => 'fixed', 'level' => 3]]),
            $this->item(2, 10, [7 => ['mode' => 'fixed', 'level' => 1]]),
            $this->item(3, 10, [7 => ['mode' => 'fixed', 'level' => 1]], 0),
        ];
        $details = [
            $this->detail(1),
            (object) ['id' => 2, 'deleted' => true],
            $this->detail(3),
        ];
        $this->assertSame([7 => 3], outcome_mapping::compute_ratings($items, $details, ['1', '2', '3']));

        // Completed according to the id list but with no detail behind it: no evidence.
        $this->assertSame([7 => null], outcome_mapping::compute_ratings([$items[1]], [], ['2']));
    }

    /**
     * An interaction worth no XP still counts, with weight 1.
     */
    public function test_compute_ratings_zero_xp_counts(): void {
        $items = [
            $this->item(1, 0, [7 => ['mode' => 'fixed', 'level' => 1]]),
            $this->item(2, 0, [7 => ['mode' => 'fixed', 'level' => 3]]),
        ];
        $details = [$this->detail(1), $this->detail(2)];
        $this->assertSame([7 => 2], outcome_mapping::compute_ratings($items, $details, ['1', '2']));

        // Mixed: (10 * 1 + 1 * 3) / 11 = 1.18.
        $items[0]->xp = 10;
        $this->assertSame([7 => 1], outcome_mapping::compute_ratings($items, $details, ['1', '2']));
    }

    /**
     * Details may arrive keyed by id, as decode_progress() returns them.
     */
    public function test_compute_ratings_accepts_keyed_details(): void {
        $items = [$this->item(4, 10, [7 => ['mode' => 'score', 'thresholds' => [0, 51, 86]]])];
        $row = (object) [
            'completiondetails' => json_encode([json_encode(['id' => 4, 'xp' => 7, 'percent' => 0.7])]),
            'completeditems' => json_encode([4]),
        ];
        [$details, $completed] = outcome_mapping::decode_progress($row);
        $this->assertSame([4], array_keys($details));
        $this->assertSame(['4'], $completed);
        $this->assertSame([7 => 2], outcome_mapping::compute_ratings($items, $details, $completed));
    }

    /**
     * Restored mappings follow the outcome id mapping and drop what did not come across.
     */
    public function test_remap_for_restore(): void {
        $advanced = json_encode([
            'autolaunch' => 1,
            'outcomes' => [
                '12' => ['mode' => 'score', 'thresholds' => [0, 51, 86]],
                '15' => ['mode' => 'fixed', 'level' => 2],
            ],
        ]);
        $map = function ($oldid) {
            return $oldid == 12 ? 99 : 0;
        };
        $remapped = json_decode(outcome_mapping::remap_for_restore($advanced, $map), true);
        $this->assertSame(1, $remapped['autolaunch']);
        $this->assertSame(['99' => ['mode' => 'score', 'thresholds' => [0, 51, 86]]], $remapped['outcomes']);

        // Nothing came across: the key goes away.
        $none = json_decode(outcome_mapping::remap_for_restore($advanced, function () {
            return 0;
        }), true);
        $this->assertArrayNotHasKey('outcomes', $none);

        $this->assertSame('{"autolaunch":1}', outcome_mapping::remap_for_restore('{"autolaunch":1}', $map));
        $this->assertSame('not json', outcome_mapping::remap_for_restore('not json', $map));
        $this->assertNull(outcome_mapping::remap_for_restore(null, $map));
    }

    /**
     * Scored tracking modes default to thresholds; completion-only ones to a fixed level.
     */
    public function test_default_mode_for_tracking(): void {
        $this->assertSame('fixed', outcome_mapping::default_mode_for_tracking(['none', 'manual', 'view']));
        $this->assertSame('fixed', outcome_mapping::default_mode_for_tracking(['none', 'interact', 'watchall']));
        $this->assertSame('fixed', outcome_mapping::default_mode_for_tracking([]));
        $this->assertSame('score', outcome_mapping::default_mode_for_tracking(['none', 'complete', 'completepass']));
        $this->assertSame('score', outcome_mapping::default_mode_for_tracking(['answer', 'answercorrect']));
    }

    /**
     * encode() writes the key only when there is something to store.
     */
    public function test_encode(): void {
        $advanced = (object) ['autolaunch' => 1, 'outcomes' => (object) ['1' => []]];
        outcome_mapping::encode($advanced, []);
        $this->assertSame('{"autolaunch":1}', json_encode($advanced));

        outcome_mapping::encode($advanced, [7 => ['mode' => 'fixed', 'level' => 2]]);
        $this->assertSame('{"autolaunch":1,"outcomes":{"7":{"mode":"fixed","level":2}}}', json_encode($advanced));
    }
}
