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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');

/**
 * The fragment callback must only instantiate declared content type classes.
 *
 * core_get_fragment reaches this callback after only validate_context(), so the class name it
 * carries is effectively chosen by anyone who can view the activity.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_output_fragment_getcontent
 */
final class fragment_getcontent_test extends \advanced_testcase {
    /**
     * Build the argument array core_get_fragment would hand the callback.
     *
     * @param string $class The class name carried in prop.
     * @return array
     */
    private function args(string $class): array {
        return [
            'id' => 1,
            'type' => 'richtext',
            'prop' => json_encode(['class' => $class]),
            // A built content type reads these; omitting them is an undefined index on PHP 7.x,
            // which Moodle's PHPUnit promotes to an error.
            'content' => '<p>Body</p>',
            'contextid' => \context_system::instance()->id,
        ];
    }

    /**
     * A class no content type declares is refused.
     */
    public function test_arbitrary_class_is_not_instantiated(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        // A real, autoloadable core class that is not a content type.
        $this->assertTrue(class_exists(\core\session\manager::class));

        $result = interactivevideo_output_fragment_getcontent($this->args(\core\session\manager::class));

        // Refused: the callback echoes its arguments back rather than building the class.
        $decoded = json_decode($result, true);
        $this->assertIsArray($decoded);
        $this->assertEquals('richtext', $decoded['type']);
    }

    /**
     * A declared content type class is still built and rendered.
     */
    public function test_declared_content_type_is_instantiated(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $declared = array_column(\interactivevideo_util::get_all_activitytypes(), 'class');
        $this->assertNotEmpty($declared, 'At least one content type must be enabled for this test');
        $class = reset($declared);

        $result = interactivevideo_output_fragment_getcontent($this->args($class));

        // A built content type returns its rendered content, not the arguments echoed back.
        $decoded = json_decode($result, true);
        $this->assertFalse(
            is_array($decoded) && isset($decoded['prop']),
            'A declared class should have been instantiated rather than refused'
        );
    }

    /**
     * A malformed or absent prop is refused rather than fatal.
     */
    public function test_malformed_prop_is_refused(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        foreach (['not json', '', 'null', json_encode(['noclass' => 1])] as $prop) {
            $result = interactivevideo_output_fragment_getcontent([
                'id' => 1,
                'type' => 'richtext',
                'prop' => $prop,
            ]);
            $this->assertIsString($result);
        }

        // Missing prop entirely.
        $this->assertIsString(interactivevideo_output_fragment_getcontent(['id' => 1]));
    }
}
