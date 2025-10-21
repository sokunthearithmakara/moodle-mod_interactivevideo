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
 * View Interactivevideo instance
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/locallib.php');
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->libdir . '/gradelib.php');

// Course module id.
$id = optional_param('id', 0, PARAM_INT);
$moment = optional_param('t', 0, PARAM_INT);
// Activity instance id.
$i = optional_param('i', 0, PARAM_INT);
$iframe = optional_param('iframe', 0, PARAM_INT);
$embed = optional_param('embed', 0, PARAM_INT);
$preview = optional_param('preview', 0, PARAM_INT);
if ($id) {
    $cm = get_coursemodule_from_id('interactivevideo', $id, 0, false, MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
    $moduleinstance = $DB->get_record('interactivevideo', ['id' => $cm->instance], '*', MUST_EXIST);
} else {
    $moduleinstance = $DB->get_record('interactivevideo', ['id' => $i], '*', MUST_EXIST);
    $course = $DB->get_record('course', ['id' => $moduleinstance->course], '*', MUST_EXIST);
    $cm = get_coursemodule_from_instance('interactivevideo', $moduleinstance->id, $course->id, false, MUST_EXIST);
}

$getcompletion = true;
$modulecontext = context_module::instance($cm->id);
if ($iframe && !isloggedin()) {
    $token = required_param('token', PARAM_TEXT);
    $validated = \mod_interactivevideo\output\mobile::login_after_validate_token($token, $cm->id);
    if (!$validated) {
        throw new moodle_exception('invalidtoken', 'mod_interactivevideo');
    }
}

require_login($course, true, $cm);

// Require capability to view interactive video.
if (!has_capability('mod/interactivevideo:view', $modulecontext)) {
    // Redirect to course view.
    redirect(
        new moodle_url('/course/view.php', ['id' => $course->id]),
        get_string('nopermissiontoview', 'mod_interactivevideo'),
        5,
        \core\output\notification::NOTIFY_ERROR
    );
}

if ($moduleinstance->displayoptions) {
    $moduleinstance->displayoptions = json_decode($moduleinstance->displayoptions, true);
} else {
    $moduleinstance->displayoptions = [];
}

// Get display options from url parameters.
// Dark mode.
$dmode = optional_param('dm', null, PARAM_INT);
$dfmode = optional_param('df', null, PARAM_INT);
if ($dmode !== null) {
    $moduleinstance->displayoptions['darkmode'] = $dmode;
}
if ($dmode === 1) {
    $dfmode = 1;
}
// Distraction free mode.
if ($dfmode !== null) {
    $moduleinstance->displayoptions['distractionfreemode'] = $dfmode;
}

if (!isset($moduleinstance->displayoptions['distractionfreemode'])) {
    $moduleinstance->displayoptions['distractionfreemode'] = 1;
}

if ($iframe) {
    $moduleinstance->displayoptions['darkmode'] = 0;
    $moduleinstance->displayoptions['distractionfreemode'] = 1;
    $PAGE->add_body_class('iframe mobiletheme');
    $getcompletion = false;
}

if ($embed) {
    $PAGE->add_body_class('embed-mode bg-dark showcontrols');
    $moduleinstance->displayoptions['distractionfreemode'] = 1;
}

if ($preview && has_capability('mod/interactivevideo:edit', $modulecontext)) {
    $PAGE->add_body_class('preview-mode');
}

if (optional_param('mobileapp', 0, PARAM_INT)) {
    $PAGE->set_pagelayout('embedded');
    $PAGE->add_body_class('mobiletheme mobileapp');
}

// Prepare strings for js files using string manager.
$subplugins = explode(',', get_config('mod_interactivevideo', 'enablecontenttypes'));
// Add chapter to the list of subplugins.
if (!in_array('ivplugin_chapter', $subplugins)) {
    $subplugins[] = 'ivplugin_chapter';
}
// Get interaction types used in the interactive video.
$interactions = interactivevideo_util::get_items($cm->instance, $modulecontext->id);
$interactions = array_map(function ($interaction) {
    return $interaction->type;
}, $interactions);
$interactions = array_unique($interactions);
$sub = array_map(function ($s) {
    $s = explode('_', $s)[1];
    // Remove 'iv' prefix (prefix only).
    if (substr($s, 0, 2) == 'iv') {
        $s = substr($s, 2);
    }
    return $s;
}, $subplugins);
$stringman = get_string_manager();
foreach ($subplugins as $subplugin) {
    $name = explode('_', $subplugin)[1];
    if (substr($name, 0, 2) == 'iv') {
        $name = substr($name, 2);
    }
    if (!in_array($name, $interactions) && $name != 'chapter') {
        continue;
    }
    $strings = $stringman->load_component_strings($subplugin, current_language());
    $PAGE->requires->strings_for_js(array_keys($strings), $subplugin);
}
$strings = $stringman->load_component_strings('mod_interactivevideo', current_language());
$PAGE->requires->strings_for_js(array_keys($strings), 'mod_interactivevideo');

// Enable jQuery UI.
$PAGE->requires->jquery_plugin('ui-css');

if ($cm->completion != COMPLETION_TRACKING_NONE) {
    $cmcompletion = new completion_info($course);
}

// Log view.
if (!$preview) {
    $event = \mod_interactivevideo\event\course_module_viewed::create([
        'objectid' => $moduleinstance->id,
        'context' => $modulecontext,
    ]);
    $event->add_record_snapshot('course', $course);
    $event->add_record_snapshot('interactivevideo', $moduleinstance);
    $event->trigger();

    // Set view completion.
    if ($cm->completionview == COMPLETION_VIEW_REQUIRED) {
        $cmcompletion = new completion_info($course);
        $cmcompletion->set_module_viewed($cm);
    }
} else {
    $getcompletion = false;
}

if ($cm->completion == COMPLETION_TRACKING_NONE) {
    $getcompletion = false;
}

// Add body class to display editor view vs student view.
if (has_capability('mod/interactivevideo:edit', $modulecontext)) {
    $PAGE->add_body_class('editorview');
}

// Toggle dark-mode.
if ($moduleinstance->displayoptions['darkmode'] && $moduleinstance->displayoptions['distractionfreemode'] != 0) {
    $PAGE->add_body_class('darkmode bg-dark');
}

// Force theme.
$ft = optional_param('forcetheme', null, PARAM_TEXT);
if ((isset($moduleinstance->displayoptions['theme']) && $moduleinstance->displayoptions['theme'] != '') || $ft) {
    $PAGE->force_theme($ft ?? $moduleinstance->displayoptions['theme']);
}

// Get completion information.
$completion = null;
if ($getcompletion) {
    $completionstate = $cmcompletion->internal_get_state($cm, $USER->id, true);
    $completiondetails = \core_completion\cm_completion_details::get_instance($PAGE->cm, $USER->id);
    // If moodle version is 4.4 or below, use new completion information.
    if ($CFG->branch < 404) {
        $completion = $OUTPUT->activity_information($PAGE->cm, $completiondetails, []);
    } else {
        $activitycompletion = new \core_course\output\activity_completion($PAGE->cm, $completiondetails);
        $output = $PAGE->get_renderer('core');
        $activitycompletiondata = (array) $activitycompletion->export_for_template($output);
        if ($activitycompletiondata["hascompletion"]) {
            $completion = $OUTPUT->render_from_template('core_course/activity_info', $activitycompletiondata);
        }
    }
    $completed = $completiondetails->get_overall_completion();
}

// Check if this activity is associated with other activities' availability.
if ($cm->completion != COMPLETION_TRACKING_NONE && (!isset($completed) || !$completed)) {
    $withavailability = !empty($CFG->enableavailability) && core_availability\info::completion_value_used($course, $cm->id);
    if ($withavailability == 1) {
        $PAGE->add_body_class('withavailability');
    }
}

// Toggle distraction-free mode.
if ($moduleinstance->displayoptions['distractionfreemode'] == 1) {
    $PAGE->activityheader->disable(); // Disable activity header.
    $PAGE->set_pagelayout('embedded');
    $PAGE->add_body_class('distraction-free');
} else {
    $PAGE->add_body_class('default-mode');
    if ($moduleinstance->displayasstartscreen == 1 || $moduleinstance->displayoptions['showdescriptiononheader'] == 0) {
        // Don't repeat the description in the header unless it is specifically requested.
        $PAGE->activityheader->set_attrs(['description' => '']);
    }
    $moduleinstance->displayoptions['darkmode'] = 0;
}

$PAGE->set_url('/mod/interactivevideo/view.php', [
    'id' => $cm->id,
    't' => $moment,
    'i' => $moduleinstance->id,
    'iframe' => $iframe,
    'token' => $token ?? '',
    'embed' => $embed,
    'preview' => $preview,
]);

$PAGE->set_title(format_string($moduleinstance->name));
$PAGE->set_heading(format_string($moduleinstance->name));
$PAGE->set_context($modulecontext);

// Get end screen content.
$endcontent = file_rewrite_pluginfile_urls(
    $moduleinstance->endscreentext,
    'pluginfile.php',
    $modulecontext->id,
    'mod_interactivevideo',
    'endscreentext',
    0
);

$endcontent = format_text($endcontent, FORMAT_HTML, [
    'context' => $modulecontext,
    'noclean' => true,
    'overflowdiv' => true,
    'para' => false,
]);

// Fetch grade item.
$gradeitem = grade_item::fetch([
    'iteminstance' => $moduleinstance->id,
    'itemtype' => 'mod',
    'itemmodule' => 'interactivevideo',
    'itemnumber' => 0,
]);

$PAGE->add_body_class($moduleinstance->type . ($CFG->branch >= 500 ? ' bs-5' : ''));

// Use Bootstrap icons instead of fontawesome icons to avoid issues fontawesome icons support in Moodle 4.1.
$PAGE->requires->css(new moodle_url('/mod/interactivevideo/libraries/bootstrap-icons/bootstrap-icons.min.css'));
$PAGE->requires->js(
    new moodle_url('/mod/interactivevideo/libraries/confetti/confetti.browser.min.js'),
    true
);

echo $OUTPUT->header();
if ($moduleinstance->source == 'url') {
    $url = $moduleinstance->videourl;
} else {
    $fs = get_file_storage();
    $files = $fs->get_area_files(
        $modulecontext->id,
        'mod_interactivevideo',
        'video',
        0,
        'filesize DESC',
    );
    $file = reset($files);
    if (!$file) {
        $url = '';
    } else {
        $url = moodle_url::make_pluginfile_url(
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

if (empty($url)) {
    echo $OUTPUT->notification(get_string('novideourl', 'mod_interactivevideo'), 'warning');
    echo $OUTPUT->footer();
    die;
}

// Render primary navigation.
$primary = new core\navigation\output\primary($PAGE);
$renderer = $PAGE->get_renderer('core');
$primarymenu = $primary->export_for_template($renderer);

// Display page navigation.
$courseindex = '';
$rendernav = true;
if (!$moduleinstance->displayoptions['distractionfreemode']) {
    $rendernav = false;
}
if ($iframe || $embed) {
    $rendernav = false;
}
if ($rendernav) {
    $courseindex = isset($moduleinstance->displayoptions['courseindex']) && $moduleinstance->displayoptions['courseindex'] ?
        core_course_drawer() : '';
    // Understanding the course format: singlepage or multiplepages.
    $format = course_get_format($course);
    if (
        $format->get_course_display() == COURSE_DISPLAY_MULTIPAGE &&
        !$format->show_editor()
    ) {
        if ($CFG->branch >= 404) { // Section.php started to exist in Moodle 4.4.
            $returnurl = new moodle_url('/course/section.php', [
                'id' => $cm->section,
            ]);
        } else {
            $modinfo = get_fast_modinfo($course);
            $returnurl = new moodle_url('/course/view.php', [
                'id' => $course->id,
                'section' => $modinfo->get_cm($cm->id)->sectionnum,
            ]);
        }
    } else {
        $returnurl = new moodle_url('/course/view.php', ['id' => $course->id]);
    }
    $datafortemplate = [
        "cmid" => $cm->id,
        "instance" => $cm->instance,
        "contextid" => $modulecontext->id,
        "courseid" => $course->id,
        "darkmode" => $moduleinstance->displayoptions['darkmode'] == '1',
        "returnurl" => $returnurl,
        "completion" => $completion,
        "manualcompletion" => $cm->completion == 1,
        "canedit" => has_capability('mod/interactivevideo:edit', $modulecontext),
        "settingurl" => has_capability('mod/interactivevideo:edit', $modulecontext)
            ? new moodle_url('/course/modedit.php', ['update' => $cm->id]) : '',
        "reporturl" => has_capability('mod/interactivevideo:viewreport', $modulecontext)
            ? new moodle_url('/mod/interactivevideo/report.php', ['id' => $cm->id]) : '',
        "interactionsurl" => has_capability('mod/interactivevideo:edit', $modulecontext)
            ? new moodle_url('/mod/interactivevideo/interactions.php', ['id' => $cm->id]) : '',
        "useravatar" => $primarymenu['user'],
        "completed" => isset($completed) && $completed,
        "completedpass" => isset($completionstate)
            && ($completionstate == COMPLETION_COMPLETE_PASS || $completionstate == COMPLETION_COMPLETE),
        "completedfail" => isset($completionstate) && $completionstate == COMPLETION_COMPLETE_FAIL,
        "viewurl" => '',
        "backupurl" => has_capability('moodle/backup:backupactivity', $modulecontext) ? new moodle_url(
            '/backup/backup.php',
            [
                'cm' => $cm->id,
                'id' => $course->id,
            ]
        ) : '',
        "restoreurl" => has_capability('moodle/restore:restoreactivity', $modulecontext) ? new moodle_url(
            '/backup/restorefile.php',
            ['contextid' => $modulecontext->id]
        ) : '',
        "bs" => $CFG->branch >= 500 ? '-bs' : '',
        "hascourseindex" => !empty($courseindex),
    ];
    echo $OUTPUT->render_from_template('mod_interactivevideo/pagenav', $datafortemplate);
}

// Custom poster image.
if (isset($moduleinstance->displayoptions['usecustomposterimage']) && $moduleinstance->displayoptions['usecustomposterimage']) {
    $fs = get_file_storage();
    $posterfiles = $fs->get_area_files(
        $modulecontext->id,
        'mod_interactivevideo',
        'posterimage',
        0,
        'filesize DESC',
    );
    $posterfiles = reset($posterfiles);
    if ($posterfiles) {
        $moduleinstance->posterimage = moodle_url::make_pluginfile_url(
            $posterfiles->get_contextid(),
            $posterfiles->get_component(),
            $posterfiles->get_filearea(),
            $posterfiles->get_itemid(),
            $posterfiles->get_filepath(),
            $posterfiles->get_filename()
        )->out();
    }
}

// Fallback poster image.
if (empty($moduleinstance->posterimage) && optional_param('mobileapp', 0, PARAM_INT) == 1) { // Mobile app has no poster image.
    $moduleinstance->posterimage = $OUTPUT->get_generated_image_for_id($cm->id);
}

if (!isset($moduleinstance->displayoptions['beforecompletion'])) {
    $defaultappearance = [
        'useoriginalvideocontrols' => $moduleinstance->displayoptions['useoriginalvideocontrols'],
        'hidemainvideocontrols' => $moduleinstance->displayoptions['hidemainvideocontrols'],
        'interactionbar' => $moduleinstance->displayoptions['hideinteractions'] ? 0 : 1,
        'progressbar' => 1,
        'chaptertoggle' => $moduleinstance->displayoptions['disablechapternavigation'] ? 0 : 1,
        'chaptertitle' => 1,
        'timestamp' => 1,
        'rewind' => 0,
        'forward' => 0,
        'captions' => 1,
        'playbackrate' => 1,
        'quality' => 1,
        'mute' => 1,
        'share' => 1,
        'expand' => 1,
        'fullscreen' => 1,
    ];
    $moduleinstance->displayoptions['beforecompletion'] = $defaultappearance;
    $moduleinstance->displayoptions['aftercompletion'] = $defaultappearance;

    $defaultbehavior = [
        'preventskipping' => 0,
        'preventseeking' => 0,
        'disableinteractionclick' => 0,
        'disableinteractionclickuntilcompleted' => 0,
    ];
    $moduleinstance->displayoptions['beforecompletionbehavior'] = $defaultbehavior;
    $moduleinstance->displayoptions['aftercompletionbehavior'] = $defaultbehavior;
}

// Display options based on completion.
if (isset($completed) && $completed) {
    $appearance = $moduleinstance->displayoptions['aftercompletion'];
    $behavior = $moduleinstance->displayoptions['aftercompletionbehavior'];
} else {
    $appearance = $moduleinstance->displayoptions['beforecompletion'];
    $behavior = $moduleinstance->displayoptions['beforecompletionbehavior'];
}

foreach ($appearance as $key => $value) {
    if ($key == 'interactionbar') {
        $moduleinstance->displayoptions['hideinteractions'] = $value ? 0 : 1;
    } else if ($key == 'chaptertoggle') {
        $moduleinstance->displayoptions['disablechapternavigation'] = $value ? 0 : 1;
    }
    $moduleinstance->displayoptions[$key] = $value;
}
foreach ($behavior as $key => $value) {
    $moduleinstance->displayoptions[$key] = $value;
}

unset(
    $moduleinstance->displayoptions['beforecompletion'],
    $moduleinstance->displayoptions['beforecompletionbehavior'],
    $moduleinstance->displayoptions['aftercompletion'],
    $moduleinstance->displayoptions['aftercompletionbehavior']
);

// Display player.
$datafortemplate = [
    "darkmode" => $moduleinstance->displayoptions['darkmode'] == '1',
    "displayasstartscreen" => $moduleinstance->displayasstartscreen,
    "hasintro" => !empty($moduleinstance->intro),
    "intro" => format_module_intro('interactivevideo', $moduleinstance, $cm->id),
    "hasendscreentext" => !empty($moduleinstance->endscreentext),
    "endscreentext" => $endcontent,
    "html5" => $moduleinstance->type == 'html5video' ? true : false,
    "title" => format_string($moduleinstance->name),
    "displayoptions" => $moduleinstance->displayoptions,
    "posterimage" => $moduleinstance->posterimage,
    "completed" => isset($completed) && $completed,
    "bs" => $CFG->branch >= 500 ? '-bs' : '',
    'square' => $moduleinstance->displayoptions['squareposterimage'] ?? false,
    "useembedly" => in_array($moduleinstance->type, ['bunnystream', 'viostream']),
    "courseindex" => $courseindex,
    "hascourseindex" => !empty($courseindex) && $rendernav,
];
echo $OUTPUT->render_from_template('mod_interactivevideo/player/player', $datafortemplate);

$PAGE->requires->js_call_amd('mod_interactivevideo/viewannotation', 'init', [
    $url, // Video URL.
    $cm->id, // Course module id from coursemodule table.
    $cm->instance, // Activity id from interactivevideo table.
    $course->id,
    $preview ? 1 : $USER->id, // User id.
    $moduleinstance->starttime,
    $moduleinstance->endtime,
    $moduleinstance->completionpercentage, // Completion condition percentage.
    $gradeitem ? $gradeitem->iteminstance : 0, // Grade item instance from grade_items table.
    $gradeitem ? $gradeitem->grademax : 0, // Grade item maximum grade, which is set in mod_form.
    $moduleinstance->type, // Interactive video type (e.g. vimeo, wistia, etc.).
    $moduleinstance->displayoptions['preventskipping'] && !has_capability('mod/interactivevideo:edit', $modulecontext)
        ? true : false, // Prevent skipping, applicable to student only.
    $moment, // Current time in seconds.
    null, // Display options array set in mod_form.
    $token ?? '', // Token for mobile app.
    $moduleinstance->extendedcompletion, // Extended completion settings.
    $preview && has_capability('mod/interactivevideo:edit', $modulecontext) ? true : false, // Preview mode.
    $datafortemplate['completed'] ?? false, // Completed status.
    has_capability('mod/interactivevideo:edit', $modulecontext) ? true : false, // Is editor.
]);
echo '<textarea id="doptions" style="display: none;">' . json_encode($moduleinstance->displayoptions) . '</textarea>';
echo '<textarea id="titlehidden" style="display: none;">' . format_string($moduleinstance->name) . '</textarea>';
$posterurl = $moduleinstance->posterimage != "" ? $moduleinstance->posterimage : $OUTPUT->get_generated_image_for_id($cm->id);
echo '<img id="posterimagehidden" style="display: none;" src="' . $posterurl . '">';
echo $OUTPUT->footer();
