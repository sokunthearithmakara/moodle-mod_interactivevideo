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
 * Report for interactivevideo module
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/locallib.php');

$id = required_param('id', PARAM_INT); // Course_module ID.
$cm = get_coursemodule_from_id('interactivevideo', $id, 0, false, MUST_EXIST);
$course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);

require_login($course, false, $cm);

$group = optional_param('group', 0, PARAM_INT);
$moduleinstance = $DB->get_record('interactivevideo', ['id' => $cm->instance], '*', MUST_EXIST);
$context = \context_module::instance($cm->id);

// 1. Access and Page Setup.
\mod_interactivevideo\report_helper::validate_access('mod_interactivevideo', $context, $course, $cm);

// Get content types for requirements setup.
$contenttypes = \interactivevideo_util::get_all_activitytypes();
\mod_interactivevideo\report_helper::setup_page_requirements(
    $moduleinstance,
    'mod_interactivevideo',
    $cm,
    $course,
    $context,
    $contenttypes
);

// 2. Data Preparation.
$reportdata = \mod_interactivevideo\report_helper::get_standard_report_items(
    'mod_interactivevideo',
    $moduleinstance,
    '\\interactivevideo_util',
    $context,
    $cm
);
$items = $reportdata['items'];
$allitems = $reportdata['allitems'];
$data = \mod_interactivevideo\report_helper::prepare_template_data(
    'mod_interactivevideo',
    $cm,
    $moduleinstance,
    $course,
    $context,
    $items
);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_interactivevideo/pagenav', $data['pagenav']);
echo $OUTPUT->render_from_template('mod_interactivevideo/blocksettingshack', []);

echo '<textarea class="d-none" id="itemsdata">' . json_encode($allitems) . '</textarea>';

echo $OUTPUT->render_from_template('mod_interactivevideo/reporttable', $data['reporttable']);

// Module specific video URL logic.
$url = '';
if ($moduleinstance->source == 'url') {
    $url = $moduleinstance->videourl;
} else {
    $fs = get_file_storage();
    $files = $fs->get_area_files($context->id, 'mod_interactivevideo', 'video', 0, 'filesize DESC', false);
    $file = reset($files);
    if ($file) {
        $url = \moodle_url::make_pluginfile_url(
            $file->get_contextid(),
            $file->get_component(),
            $file->get_filearea(),
            $file->get_itemid(),
            $file->get_filepath(),
            $file->get_filename()
        )->out();
    }
    $moduleinstance->type = 'html5video';
}

echo '<div id="iv-m-version" data-value="' . $CFG->branch . '"></div>';

$PAGE->requires->js_call_amd('mod_interactivevideo/report', "init", [
    $cm->instance,
    $group,
    $moduleinstance->grade,
    array_column($items, 'id'),
    $moduleinstance->completionpercentage,
    $url,
    $moduleinstance->type,
    $cm->id,
    $course->id,
    $moduleinstance->starttime,
    $moduleinstance->endtime,
    $moduleinstance->posterimage,
    format_string($moduleinstance->name),
    [
        'canedit' => has_capability('mod/interactivevideo:editreport', $context),
        'canview' => has_capability('mod/interactivevideo:viewreport', $context),
    ],
]);

echo $OUTPUT->footer();
