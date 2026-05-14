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



/**
 * Report helper for interactivevideo and flexbook modules
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class report_helper {
    /**
     * Validate access to the report page.
     *
     * @param string $component The component name.
     * @param \context $context The context object.
     * @param \stdClass $course The course object.
     * @param \stdClass|\cm_info $cm The course module object.
     * @return void
     */
    public static function validate_access($component, $context, $course, $cm) {
        $capabilityprefix = str_replace('_', '/', $component);
        require_capability("$capabilityprefix:viewreport", $context);
        require_login($course, true, $cm);
    }

    /**
     * Setup common page requirements.
     *
     * @param \stdClass $moduleinstance The module instance.
     * @param string $component The component name.
     * @param \stdClass|\cm_info $cm The course module object.
     * @param \stdClass $course The course object.
     * @param \context $context The context object.
     * @param array $contenttypes The content types.
     * @return void
     */
    public static function setup_page_requirements($moduleinstance, $component, $cm, $course, $context, $contenttypes = []) {
        global $CFG, $PAGE;

        $displayoptions = self::get_display_options($moduleinstance);
        if (isset($displayoptions['theme']) && $displayoptions['theme'] != '') {
            $PAGE->force_theme($displayoptions['theme']);
        }

        $embed = optional_param('embed', 0, PARAM_INT);
        $pluginname = str_replace('mod_', '', $component);
        $PAGE->set_url(new \moodle_url("/mod/$pluginname/report.php"), ['id' => $cm->id, 'embed' => $embed]);
        $PAGE->set_context($context);
        $PAGE->set_title(get_string('reportfor', 'mod_interactivevideo', format_string($moduleinstance->name)));
        $PAGE->set_heading(format_string($course->fullname));

        $PAGE->requires->css(new \moodle_url($CFG->wwwroot . '/mod/interactivevideo/libraries/DataTables/datatables.min.css'));
        $PAGE->requires->css(new \moodle_url('/mod/interactivevideo/libraries/bootstrap-icons/bootstrap-icons.min.css'));
        $PAGE->requires->css(new \moodle_url($CFG->wwwroot . '/mod/interactivevideo/libraries/select2/select2.min.css'));

        if ($embed == 1) {
            $PAGE->add_body_class('embed-mode');
        }
        $PAGE->add_body_class($CFG->branch >= 500 ? ' bs-5' : '');
        if ($component === 'mod_flexbook') {
            $PAGE->add_body_class('path-mod-interactivevideo');
        }

        $PAGE->activityheader->disable();
        $PAGE->set_pagelayout('embedded');

        self::setup_js_strings($contenttypes);
    }

    /**
     * Load strings for JS.
     *
     * @param array $contenttypes The content types.
     * @return void
     */
    private static function setup_js_strings($contenttypes = []) {
        global $PAGE;
        $stringman = get_string_manager();
        $strings = $stringman->load_component_strings('mod_interactivevideo', current_language());
        $PAGE->requires->strings_for_js(array_keys($strings), 'mod_interactivevideo');

        foreach ($contenttypes as $subplugin) {
            $stringcomponent = $subplugin['stringcomponent'] ?? '';
            if ($stringcomponent) {
                $strings = $stringman->load_component_strings($stringcomponent, current_language());
                $PAGE->requires->strings_for_js(array_keys($strings), $stringcomponent);
            }
        }
    }

    /**
     * Get and filter items. Returns ['items' => ..., 'allitems' => ...]
     *
     * @param string $component The component name.
     * @param \stdClass $moduleinstance The module instance.
     * @param string $utilclass The utility class name.
     * @param \context $context The context object.
     * @param \stdClass|\cm_info $cm The course module object.
     * @return array
     */
    public static function get_standard_report_items($component, $moduleinstance, $utilclass, $context, $cm) {
        $contenttypes = $utilclass::get_all_activitytypes();
        $items = ($component === 'mod_flexbook') ?
            $utilclass::get_items($cm->id, $context->id) :
            $utilclass::get_items($moduleinstance->id, $context->id, false);

        $items = array_map(fn($item) => (array)$item, (array)$items);
        if ($component === 'mod_interactivevideo') {
            usort($items, fn($a, $b) => $a['timestamp'] - $b['timestamp']);
        }

        $skip = array_filter($items, fn($item) => $item['type'] === 'skipsegment');
        $reportabletypes = array_filter($contenttypes, fn($ct) => !empty($ct["hasreport"]));
        $reportabletnames = array_column($reportabletypes, 'name');

        // Standardize items with properties first.
        $items = array_map(function ($item) use ($contenttypes) {
            $relatedct = array_filter($contenttypes, fn($ct) => $ct["name"] == $item['type']);
            if (!empty($relatedct)) {
                $relatedct = array_values($relatedct)[0];
                $item['prop'] = json_encode($relatedct);
                $item['typetitle'] = $relatedct["title"];
                $item['icon'] = $relatedct["icon"];
            }
            return $item;
        }, $items);

        $allitems = array_values($items);

        // Filter for display in the main table.
        $filtereditems = array_filter($items, function ($item) use ($reportabletnames, $moduleinstance, $component, $skip) {
            if (!in_array($item['type'], $reportabletnames)) {
                return false;
            }
            if ($item['timestamp'] < 0) {
                return true;
            }
            if ($item['hascompletion'] == 0 && ($item['timestamp'] >= 0 || $item['completiontracking'] == 'none')) {
                return false;
            }
            if ($component === 'mod_interactivevideo') {
                if (
                    $item['timestamp'] >= 0 &&
                    ($item['timestamp'] < $moduleinstance->starttime || $item['timestamp'] > $moduleinstance->endtime)
                ) {
                    return false;
                }
                foreach ($skip as $ss) {
                    if ($item['timestamp'] > $ss['timestamp'] && $item['timestamp'] < $ss['title']) {
                        return false;
                    }
                }
            }
            return true;
        });

        return [
            'items' => array_values($filtereditems),
            'allitems' => $allitems,
        ];
    }

    /**
     * Prepare template data.
     *
     * @param string $component The component name.
     * @param \stdClass|\cm_info $cm The course module object.
     * @param \stdClass $moduleinstance The module instance.
     * @param \stdClass $course The course object.
     * @param \context $context The context object.
     * @param array $items The items.
     * @return array
     */
    public static function prepare_template_data($component, $cm, $moduleinstance, $course, $context, $items) {
        global $PAGE, $CFG;

        $renderer = $PAGE->get_renderer('core');
        $primary = new \core\navigation\output\primary($PAGE);
        $primarymenu = $primary->export_for_template($renderer);
        $capabilityprefix = str_replace('_', '/', $component);

        $displayoptions = self::get_display_options($moduleinstance);
        $courseindex = !empty($displayoptions['courseindex']) ? core_course_drawer() : '';

        $pagenavdata = [
            "cmid" => $cm->id,
            "instance" => $cm->instance,
            "contextid" => $context->id,
            "courseid" => $course->id,
            "returnurl" => self::get_return_url($course, $cm),
            "completion" => '<h4 class="mb-0 iv-border-left border-danger iv-pl-3 clamp-1 iv-ml-2">'
                . format_string($moduleinstance->name) . '</h4>',
            "manualcompletion" => 1,
            "settingurl" => has_capability("$capabilityprefix:edit", $context)
                ? new \moodle_url('/course/modedit.php', ['update' => $cm->id]) : '',
            "interactionsurl" => has_capability("$capabilityprefix:edit", $context)
                ? new \moodle_url("/mod/" . str_replace('mod_', '', $component) . "/interactions.php", ['id' => $cm->id]) : '',
            "useravatar" => $primarymenu['user'],
            "viewurl" => new \moodle_url("/mod/" . str_replace('mod_', '', $component) . "/view.php", ['id' => $cm->id]),
            "backupurl" => has_capability('moodle/backup:backupactivity', $context) ? new \moodle_url(
                '/backup/backup.php',
                ['cm' => $cm->id, 'id' => $course->id]
            ) : '',
            "restoreurl" => has_capability('moodle/restore:restoreactivity', $context) ? new \moodle_url(
                '/backup/restorefile.php',
                ['contextid' => $context->id]
            ) : '',
            "bs" => $CFG->branch >= 500 ? '-bs' : '',
            "hascourseindex" => !empty($courseindex),
        ];

        $reporttabledata = [
            'groupselector' => groups_print_activity_menu($cm, $PAGE->url, true),
            'totalxp' => array_sum(array_column($items, 'xp')),
            'identity' => self::get_identity_fields($component),
            'completionpercentage' => $moduleinstance->completionpercentage,
            'completionfilter' => $moduleinstance->completionpercentage > 0,
            'items' => array_map(fn($item) => [
                'id' => $item['id'],
                'type' => $item['type'],
                'title' => format_string($item['title']),
                'icon' => $item['icon'],
                'typetitle' => $item['typetitle'],
            ], $items),
            'bs' => $CFG->branch >= 500 ? '-bs' : '',
            'hascourseindex' => !empty($courseindex),
            'courseindex' => $courseindex,
        ];

        return ['pagenav' => $pagenavdata, 'reporttable' => $reporttabledata];
    }

    /**
     * Get display options.
     *
     * @param \stdClass $instance
     * @return array
     */
    private static function get_display_options($instance) {
        if (!$instance->displayoptions) {
            return [];
        }
        return is_string($instance->displayoptions) ?
            json_decode($instance->displayoptions, true) : (array)$instance->displayoptions;
    }

    /**
     * Get return URL.
     *
     * @param \stdClass $course
     * @param \stdClass $cm
     * @return \moodle_url
     */
    private static function get_return_url($course, $cm) {
        global $CFG;
        $format = course_get_format($course);
        if ($format->get_course_display() == COURSE_DISPLAY_MULTIPAGE && !$format->show_editor()) {
            if ($CFG->branch >= 404) {
                return new \moodle_url('/course/section.php', ['id' => $cm->section]);
            }
            $modinfo = get_fast_modinfo($course);
            return new \moodle_url('/course/view.php', ['id' => $course->id, 'section' => $modinfo->get_cm($cm->id)->sectionnum]);
        }
        return new \moodle_url('/course/view.php', ['id' => $course->id]);
    }

    /**
     * Get identity fields.
     *
     * @param string $component
     * @return array
     */
    private static function get_identity_fields($component) {
        $fields = explode(',', get_config($component, 'reportfields') ?: '');
        return array_map(function ($f) {
            $f = strtolower(trim($f));
            $l = (strpos($f, 'profile_field_') !== false) ? \core_user\fields::get_display_name($f) : get_string($f, 'moodle');
            return ['name' => $f, 'label' => $l];
        }, array_filter($fields));
    }
}
