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

/**
 * Display information about all the Interactivevideo modules in the requested course
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');

$id = required_param('id', PARAM_INT);

$course = $DB->get_record('course', ['id' => $id], '*', MUST_EXIST);
require_course_login($course);

\mod_interactivevideo\event\course_module_instance_list_viewed::create_from_course($course)->trigger();

$PAGE->set_url('/mod/interactivevideo/index.php', ['id' => $id]);
$PAGE->set_title(format_string($course->fullname));
$PAGE->set_heading(format_string($course->fullname));

echo $OUTPUT->header();

$modulenameplural = get_string('modulenameplural', 'mod_interactivevideo');
echo $OUTPUT->heading($modulenameplural);

$instances = get_all_instances_in_course('interactivevideo', $course);

if (empty($instances)) {
    notice(
        get_string('thereareno', 'moodle', $modulenameplural),
        new moodle_url('/course/view.php', ['id' => $course->id])
    );
}

$table = new html_table();
$table->attributes['class'] = 'generaltable mod_index';

$usesections = course_format_uses_sections($course->format);

$table = new html_table();
$table->attributes['class'] = 'generaltable mod_index';

if ($usesections) {
    $strsectionname = get_string('sectionname', 'format_' . $course->format);
    $table->head  = [$strsectionname, get_string('name')];
    $table->align = ['left', 'left'];
} else {
    $table->head  = [get_string('name')];
    $table->align = ['left'];
}

foreach ($instances as $instance) {
    $attrs = $instance->visible ? [] : ['class' => 'dimmed']; // Hidden modules are dimmed.
    $link = html_writer::link(
        new moodle_url('/mod/interactivevideo/view.php', ['id' => $instance->coursemodule]),
        format_string($instance->name, true),
        $attrs
    );

    if ($usesections) {
        $table->data[] = [$instance->section, $link];
    } else {
        $table->data[] = [$link];
    }
}

echo html_writer::table($table);
echo $OUTPUT->footer();
