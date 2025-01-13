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

namespace ivplugin_richtext;

/**
 * Class richtext
 *
 * @package    ivplugin_richtext
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class main {

    /**
     * Constructor.
     */
    public function __construct() {
    }

    /**
     * Check if the richtext can be used.
     * @return bool True if the richtext can be used, false otherwise.
     */
    public function can_used() {
        return true;
    }

    /**
     * Returns the property of the richtext type
     * name - name of the type
     * title - title of the type
     * icon - icon of the type
     * amdmodule - javascript module of the type
     * class - php class of the type
     * form - php form class of the type
     * hascompletion - whether the type has completion status
     * hastimestamp - whether the type depends on timestamp
     * allowmultiple - whether the type allows multiple instances in a single interactive video
     * description - description of the type
     * @return array
     */
    public function get_property() {
        return [
            'name' => 'richtext',
            'title' => get_string('richtextcontent', 'ivplugin_richtext'),
            'icon' => 'bi bi-file-earmark-richtext',
            'amdmodule' => 'ivplugin_richtext/main',
            'class' => 'ivplugin_richtext\\main',
            'form' => 'ivplugin_richtext\\form',
            'hascompletion' => true,
            'hastimestamp' => true,
            'allowmultiple' => true,
            'hasreport' => true,
            'description' => get_string('richtextdescription', 'ivplugin_richtext'),
            'author' => 'tsmakara',
            'tutorial' => get_string('tutorialurl', 'ivplugin_richtext'),
        ];
    }

    /**
     * Get the content.
     * @param array $arg The arguments.
     * @return string The content.
     */
    public function get_content($arg) {
        global $CFG;
        $content = $arg["content"];
        $id = $arg["id"];
        $contextid = $arg["contextid"];
        $format = FORMAT_HTML;
        // Process the content from editor for displaying.
        require_once($CFG->libdir . '/filelib.php');
        $content = file_rewrite_pluginfile_urls($content, 'pluginfile.php', $contextid, 'mod_interactivevideo', 'content', $id);
        $options = new \stdClass();
        $options->para = false;
        $options->overflowdiv = true;
        $content = format_text($content, $format, $options);
        return $content;
    }

    /**
     * Copies interactive video data from one course module to another.
     *
     * @param int $fromcourse The ID of the source course.
     * @param int $tocourse The ID of the destination course.
     * @param int $fromcm The ID of the source course module.
     * @param int $tocm The ID of the destination course module.
     * @param mixed $annotation Additional annotation or metadata for the copy process.
     * @param int $oldcontextid The ID of the old context.
     * @return mixed
     */
    public function copy($fromcourse, $tocourse, $fromcm, $tocm, $annotation, $oldcontextid) {
        global $CFG;
        $annotation = (object) $annotation;
        // Handle related files "content" field.
        require_once($CFG->libdir . '/filelib.php');
        $fs = get_file_storage();
        $files = $fs->get_area_files($oldcontextid, 'mod_interactivevideo', 'content', (int) $annotation->oldid, 'id ASC', false);
        foreach ($files as $file) {
            $filerecord = [
                'itemid' => $annotation->id,
                'contextid' => $annotation->contextid,
            ];
            $fs->create_file_from_storedfile($filerecord, $file);
        }
        return $annotation;
    }

    /**
     * Get the content type.
     * @return string The content type.
     */
    public function get_content_type() {
        return $this->get_property()['name'];
    }

    /**
     * Get the icon.
     * @return string The icon.
     */
    public function get_icon() {
        return $this->get_property()['icon'] ?? '';
    }

    /**
     * Get the title.
     * @return string The title.
     */
    public function get_title() {
        return $this->get_property()['title'] ?? '';
    }
}
