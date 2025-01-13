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

namespace ivplugin_iframe;

/**
 * Class main
 *
 * @package    ivplugin_iframe
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class main extends \ivplugin_richtext\main {
    /**
     * Get the property.
     */
    public function get_property() {
        return [
            'name' => 'iframe',
            'icon' => 'bi bi-window-stack',
            'title' => get_string('iframecontent', 'ivplugin_iframe'),
            'amdmodule' => 'ivplugin_iframe/main',
            'class' => 'ivplugin_iframe\\main',
            'form' => 'ivplugin_iframe\\form',
            'hascompletion' => true,
            'hastimestamp' => true,
            'hasreport' => true,
            'description' => get_string('iframedescription', 'ivplugin_iframe'),
            'author' => 'tsmakara',
            'tutorial' => get_string('tutorialurl', 'ivplugin_iframe'),
        ];
    }

    /**
     * Get the content.
     *
     * @param array $arg The arguments.
     * @return string The content.
     */
    public function get_content($arg) {
        $code = $arg["content"];
        $padding = $arg["char1"] && $arg["char1"] != "null" ? $arg["char1"] : "calc(90dvh - 60px)";
        return '<div class="preview-iframe w-100" style="padding-bottom: ' . $padding . ';" >' . $code . '</div>';
    }
}
