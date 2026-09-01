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
 * Test data generator for mod_interactivevideo.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class mod_interactivevideo_generator extends testing_module_generator {
    /**
     * Create an interactivevideo instance.
     *
     * @param array|stdClass|null $record
     * @param array|null $options
     * @return stdClass
     */
    public function create_instance($record = null, ?array $options = null) {
        $record = (array) $record;

        // Reachability depends on the content type being enabled site-wide, and a freshly
        // installed test site does not enable the bundled types. Enable them so tests
        // exercise the same configuration a real site has.
        $this->enable_bundled_contenttypes();

        $record += [
            'endscreentext' => '',
            'source' => 'url',
            'video' => '',
            'videourl' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'type' => 'yt',
            'grade' => 100,
            'completionpercentage' => 0,
            'starttime' => 0,
            'endtime' => 60,
            'displayasstartscreen' => 0,
        ];

        return parent::create_instance($record, (array) $options);
    }

    /**
     * Add the bundled content types to the site's enabled list.
     *
     * Mirrors a real installation, where the bundled types are enabled.
     */
    public function enable_bundled_contenttypes(): void {
        $bundled = [
            'ivplugin_richtext',
            'ivplugin_chapter',
            'ivplugin_contentbank',
            'ivplugin_iframe',
            'ivplugin_skipsegment',
        ];

        $current = (string) get_config('mod_interactivevideo', 'enablecontenttypes');
        $enabled = array_filter(explode(',', $current));
        $enabled = array_values(array_unique(array_merge($enabled, $bundled)));

        set_config('enablecontenttypes', implode(',', $enabled), 'mod_interactivevideo');
    }

    /**
     * Create an interaction (an interactivevideo_items row) on an instance.
     *
     * Note the column naming: annotationid holds the interactivevideo *instance* id, while
     * cmid holds the course module id.
     *
     * @param stdClass $instance The instance returned by create_instance().
     * @param array $record Field overrides, most usefully xp and completiontracking.
     * @return stdClass The created item.
     */
    public function create_item(stdClass $instance, array $record = []): stdClass {
        global $DB;

        $cm = get_coursemodule_from_instance('interactivevideo', $instance->id, 0, false, MUST_EXIST);

        $record += [
            'courseid' => $instance->course,
            'cmid' => $cm->id,
            'annotationid' => $instance->id,
            'contextid' => context_module::instance($cm->id)->id,
            'timestamp' => 1.0,
            'title' => 'Test interaction',
            'xp' => 10,
            'displayoptions' => 'popup',
            'type' => 'richtext',
            'hascompletion' => 1,
            'completiontracking' => 'manual',
            'timecreated' => time(),
            'timemodified' => time(),
        ];

        $record['id'] = $DB->insert_record('interactivevideo_items', (object) $record);

        // Items are memoised per instance, so a directly inserted row would otherwise be
        // invisible to any code that had already read the item list in this request.
        cache::make('mod_interactivevideo', 'iv_items_by_cmid')->delete($instance->id);

        return (object) $record;
    }
}
