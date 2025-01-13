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

namespace ivplugin_chapter;

/**
 * Class chapter
 *
 * @package    ivplugin_chapter
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class main extends \ivplugin_richtext\main {
    /**
     * Get the property.
     */
    public function get_property() {
        return [
            'name' => 'chapter',
            'title' => get_string('chaptercontent', 'ivplugin_chapter'),
            'icon' => 'bi bi-bookmark-plus-fill',
            'amdmodule' => 'ivplugin_chapter/main',
            'class' => 'ivplugin_chapter\\main',
            'form' => 'ivplugin_chapter\\form',
            'hascompletion' => false,
            'hastimestamp' => true,
            'hasreport' => false,
            'description' => get_string('chapterdescription', 'ivplugin_chapter'),
            'author' => 'tsmakara',
            'tutorial' => get_string('tutorialurl', 'ivplugin_chapter'),
        ];
    }

    /**
     * Get the content.
     *
     * @param array $arg The arguments.
     * @return string The content.
     */
    public function get_content($arg) {
        return null;
    }
}
