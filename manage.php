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
 * TODO describe file manage
 *
 * @package    mod_interactivevideo
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');
require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
$courseid = required_param('courseid', PARAM_INT);
$tab = optional_param('tab', 'list', PARAM_ALPHA);

require_course_login($courseid);
$course = get_course($courseid);
$coursecontext = context_course::instance($courseid);
require_capability('mod/interactivevideo:manage', $coursecontext);
$pageheading = $course->fullname;
$PAGE->set_url(new moodle_url('/mod/interactivevideo/manage.php', ['courseid' => $courseid, 'tab' => $tab]));
$PAGE->set_context($coursecontext);
$PAGE->set_title(get_string('manageivfor', 'mod_interactivevideo', $pageheading));
$PAGE->set_heading($pageheading);

$stringman = get_string_manager();
$strings = $stringman->load_component_strings('mod_interactivevideo', current_language());
$PAGE->requires->strings_for_js(array_keys($strings), 'mod_interactivevideo');

$PAGE->set_pagelayout('incourse');

// Create tabs.
$tabs = [];

// Approved Applications.
$tabs[] = new tabobject(
    'list',
    new moodle_url(
        '/mod/interactivevideo/manage.php',
        ['courseid' => $courseid, 'tab' => 'list']
    ),
    get_string('list', 'mod_interactivevideo')
);

// Settings.
if (get_config('mod_interactivevideo', 'enablecoursesettings')) {
    $tabs[] = new tabobject(
        'settings',
        new moodle_url(
            '/mod/interactivevideo/manage.php',
            ['courseid' => $courseid, 'tab' => 'settings']
        ),
        get_string('settings', 'mod_interactivevideo')
    );
}

ob_start();
print_tabs([$tabs], $tab);
$tabmenu = ob_get_contents();
ob_end_clean();

$PAGE->requires->css(new moodle_url('/mod/interactivevideo/libraries/bootstrap-icons/bootstrap-icons.min.css'));
if ($tab == 'list') {
    $PAGE->requires->css(new moodle_url($CFG->wwwroot . '/mod/interactivevideo/libraries/select2/select2.min.css'));
    $PAGE->requires->css(new moodle_url($CFG->wwwroot . '/mod/interactivevideo/libraries/DataTables/datatables.min.css'));
}

echo $OUTPUT->header();
echo '<div class="container">' . $tabmenu . '</div>';
if ($tab === 'settings' && get_config('mod_interactivevideo', 'enablecoursesettings')) {
    $form = new \mod_interactivevideo\form\settings_form(
        $action = null,
        $customdata = null,
        $method = 'post',
        $target = '',
        $attributes = null,
        $editable = true,
        $ajaxformdata = [
            'courseid' => $courseid,
            'contextid' => $coursecontext->id,
            'userid' => $USER->id,
        ]
    );
    $form->set_data_for_dynamic_submission();
    echo '<div id="settings">';
    echo $form->render();
    echo '</div>';
    $PAGE->requires->js_call_amd('mod_interactivevideo/manage', $tab, [
        $courseid,
        $coursecontext->id,
        $USER->id,
    ]);
} else if ($tab === 'list') {
    $activitytypes = interactivevideo_util::get_all_activitytypes();
    // Sort the activity types by "name" key.
    usort($activitytypes, function ($a, $b) {
        return strcmp($a['name'], $b['name']);
    });

    $activitytypes = array_map(function ($activitytype) {
        return [
            'name' => $activitytype['name'],
            'icon' => $activitytype['icon'],
            'title' => $activitytype['title'],
        ];
    }, $activitytypes);

    $cache = \cache::make('mod_interactivevideo', 'iv_items_by_cmid');
    $modinfo = get_fast_modinfo($course);
    $format = course_get_format($courseid);
    $cms = $modinfo->get_instances_of('interactivevideo');
    // Remove the deletioninprogress.
    $cms = array_filter($cms, function ($cm) {
        return $cm->deletioninprogress == 0;
    });
    $cminstances = array_map(function ($cm) {
        return $cm->instance;
    }, $cms);

    list($inparams, $inparamsvalues) = $DB->get_in_or_equal($cminstances);
    // Get all interaction_completion in the course.
    $completion = $DB->get_records_sql(
        "SELECT id, cmid FROM {interactivevideo_completion} WHERE cmid $inparams",
        $inparamsvalues
    );
    $fs = get_file_storage();
    $list = [];
    foreach ($cms as $cm) {
        $compl = 0;
        $compls = array_filter($completion, function ($c) use ($cm) {
            return $c->cmid == $cm->instance;
        });
        $compl = count($compls);
        $item = [
            'id' => $cm->id,
            'instance' => $cm->instance,
            'contextid' => $cm->context->id,
            'title' => format_string($cm->name),
            'type' => $cm->customdata['type'] == '' ? get_string('html5video', 'mod_interactivevideo')
                : get_string($cm->customdata['type'], 'mod_interactivevideo'),
            'url' => $cm->customdata['videourl'],
            'sectionnum' => $cm->sectionnum,
            'sectionname' => $cm->sectionnum . '. ' . $format->get_section_name($cm->sectionnum),
            'view' => $compl,
            'courseid' => $courseid,
        ];
        $item['posterimage'] = $cm->customdata['posterimage'];
        $displayoptions = $cm->customdata['displayoptions'];
        $displayoptions = json_decode($displayoptions, true);
        $item['squareposter'] = isset($displayoptions['squareposterimage']) && $displayoptions['squareposterimage'] == 1 ?
            'square' : '';
        if ($displayoptions['usecustomposterimage']) {
            if ($displayoptions['usecustomposterimage']) {
                $file = $fs->get_area_files(
                    $cm->context->id,
                    'mod_interactivevideo',
                    'posterimage',
                    0,
                    'filesize DESC',
                );
                $file = reset($file);
                if ($file) {
                    $posterimage = moodle_url::make_pluginfile_url(
                        $file->get_contextid(),
                        $file->get_component(),
                        $file->get_filearea(),
                        $file->get_itemid(),
                        $file->get_filepath(),
                        $file->get_filename()
                    );
                    $item['posterimage'] = $posterimage->out();
                }
            }
        }
        $item['posterimage'] = $item['posterimage'] == '' ?
            $OUTPUT->get_generated_image_for_id($cm->id) : $item['posterimage']; // Fallback to default image.
        $items = $cache->get($cm->instance);
        if (empty($items)) {
            $items = $DB->get_records(
                'interactivevideo_items',
                ['annotationid' => $cm->instance]
            );
            $cache->set($cm->instance, $items);
        }
        list($starttime, $endtime) = explode('-', $cm->customdata['startendtime']);
        $items = array_values($items);

        $activitycount = $activitytypes;
        $activitycount = array_map(function ($activity) use ($items) {
            $activity = (array) $activity;
            $activity['count'] = count(array_filter($items, function ($item) use ($activity) {
                $item = (array) $item;
                return $item['type'] == $activity['name'];
            }));
            return $activity;
        }, $activitycount);
        $item['activitycount'] = $activitycount;

        $item['items'] = $items;
        $item['xp'] = array_sum(array_column($items, 'xp'));
        $item['count'] = count($items);
        $item['duration'] = $endtime - $starttime;
        $afterlink = '';
        $context = \context_module::instance($cm->id);
        if (has_capability('mod/interactivevideo:edit', $context)) {
            $item['edit'] = true;
            $item['editinteraction'] = true;
        }
        if (has_capability('mod/interactivevideo:viewreport', $context)) {
            $item['report'] = true;
        }

        $list[] = $item;
    }
    echo '<textarea id="listdata" style="display: none;">' . json_encode($list) . '</textarea>';
    echo '<div id="list">';
    echo $OUTPUT->render_from_template('mod_interactivevideo/managelist', ['type' => $activitytypes]);
    echo '</div>';
    $PAGE->requires->js_call_amd('mod_interactivevideo/manage', $tab, [
        $courseid,
        $coursecontext->id,
        $USER->id,
    ]);
}
echo $OUTPUT->footer();
