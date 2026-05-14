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
 * Class fbmain
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class main extends \ivplugin_richtext\main {
    /**
     * Get the property.
     */
    public function get_property() {
        return [
            'name' => 'interactivevideo',
            'icon' => 'bi bi-play-btn',
            'title' => get_string('video', 'mod_interactivevideo'),
            'amdmodule' => 'mod_interactivevideo/fbmain',
            'class' => 'mod_interactivevideo\\main',
            'form' => 'mod_interactivevideo\\fbform',
            'hascompletion' => true,
            'hastimestamp' => false,
            'hasreport' => true,
            'description' => get_string('modulename_help', 'mod_interactivevideo'),
            'author' => 'tsmakara',
            'preloadstrings' => false,
            'flexbook' => true,
            'fbdescription' => get_string('fbdescription', 'mod_interactivevideo'),
            'fbamdmodule' => 'mod_interactivevideo/fbmain',
            'fbform' => 'mod_interactivevideo\\fbform',
            'dndextensions' => ['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav', 'fmp4', 'm4v', 'mov', 'mp4', 'ogv', 'webm'],
            'component' => 'mod_interactivevideo',
        ];
    }

    /**
     * Get the content.
     *
     * @param array $arg The arguments.
     * @return string The content.
     */
    public function get_content($arg) {
        global $CFG;

        require_once($CFG->libdir . '/filelib.php');

        $url = file_rewrite_pluginfile_urls(
            $arg['content'],
            'pluginfile.php',
            $arg['contextid'],
            'mod_flexbook',
            'content',
            $arg['id']
        );

        return json_encode([
            'url' => $url,
        ]);
    }

    /**
     * Create a new interaction instance.
     *
     * @param array $data The data for the new instance.
     * @return \stdClass The newly created interaction record.
     */
    public function create_instance($data) {
        global $DB, $USER;
        $data = (object) $data;
        if (!isset($data->advanced)) {
            $data->advanced = json_encode($this->flexbook_advanced());
        }
        $data->completiontracking = 'complete';
        $data->hascompletion = 1;
        $data->char2 = 0;
        $data->char3 = 0;
        $data->intg1 = 0;
        $data->char1 = 'html5video';
        $draftitemid = isset($data->draftitemid) ? $data->draftitemid : 0;
        unset($data->draftitemid);

        // Save file url into content.
        $fs = \get_file_storage();
        $usercontext = \context_user::instance($USER->id);
        $files = $fs->get_area_files(
            $usercontext->id,
            'user',
            'draft',
            $draftitemid,
            null,
            false
        );
        $file = reset($files);
        $data->content = '@@PLUGINFILE@@/' . $file->get_filename();

        $data->id = $DB->insert_record('flexbook_items', $data);

        if ($draftitemid) {
            file_save_draft_area_files(
                $draftitemid,
                $data->contextid,
                'mod_flexbook',
                'content',
                $data->id,
                ['maxfiles' => -1, 'maxbytes' => 0]
            );
        }

        return \mod_flexbook\util::get_item($data->id, $data->contextid);
    }
}
