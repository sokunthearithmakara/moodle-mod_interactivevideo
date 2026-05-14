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

namespace ivplugin_contentbank;

use moodle_url;
use core_contentbank\contentbank;

/**
 * Helper class for content bank plugin.
 *
 * @package    ivplugin_contentbank
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class helper {
    /**
     * Adds the content bank selector elements to a moodleform.
     *
     * @param \MoodleQuickForm $mform The form to add elements to.
     * @param \context $coursecontext The course context.
     * @param int|null $currentcontentid The currently selected content ID.
     */
    public static function add_contentbank_elements(&$mform, $coursecontext, $currentcontentid = null) {
        global $OUTPUT, $CFG;

        $bsaffix = $CFG->branch >= 500 ? '-bs' : '';
        $cb = new contentbank();

        // Prepare the toolbar.
        $toolbar = '<div class="contentbank-toolbar bg-white p-2 d-flex align-items-center justify-content-between iv-rounded-top">
            <span class="iv-font-weight-bold text-truncate mx-2">'
            . get_string('selectoruploadcontent', 'ivplugin_contentbank') . '</span>';

        $contenttypes = [];

        if (has_capability('moodle/contentbank:useeditor', $coursecontext)) {
            $enabledcontenttypes = $cb->get_enabled_content_types();
            foreach ($enabledcontenttypes as $contenttypename) {
                $contenttypeclass = "\\contenttype_$contenttypename\\contenttype";
                if (!class_exists($contenttypeclass)) {
                    continue;
                }
                $contenttype = new $contenttypeclass($coursecontext);
                if ($contenttype->can_access()) {
                    $contenttypelibraries = $contenttype->get_contenttype_types();
                    if (!empty($contenttypelibraries)) {
                        foreach ($contenttypelibraries as $contenttypelibrary) {
                            $contenttypelibrary->type = $contenttypename;
                            $contenttypes[] = $contenttypelibrary;
                        }
                    }
                }
            }

            if (!empty($contenttypes)) {
                $toolbar .= '<div class="dropdown iv-ml-auto">
                                <button class="btn btn-primary text-uppercase dropdown-toggle" type="button" id="addnewcontent"
                                data' . $bsaffix . '-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                <i class="bi bi-plus-lg iv-mr-2"></i>' . get_string('add', 'ivplugin_contentbank') . '
                                </button>
                                <div class="dropdown-menu dropdown-menu-right dropdown-menu-end" id="addnewcontentdropdown"
                                aria-labelledby="addnewcontent">';
                foreach ($contenttypes as $type) {
                    $icon = $type->typeicon;
                    $url = new moodle_url('/contentbank/edit.php', [
                        'contextid' => $coursecontext->id,
                        'plugin' => $type->type,
                        'library' => $type->key,
                    ]);
                    if (empty($icon)) {
                        $icon = $OUTPUT->pix_icon(
                            'b/' . $type->type . '_library',
                            '',
                            'core',
                            ['class' => 'contentbank-itemlist-icon']
                        );
                    } else {
                        $icon = '<img class="contentbank-itemlist-icon" src="' . $icon . '"/>';
                    }
                    $toolbar .= '<a class="dropdown-item" target="_blank" href="' . $url
                        . '" data-library="' . $type->typeeditorparams .  '">' . $icon . $type->typename . '</a>';
                }
                $toolbar .= '</div></div>';
            }
        }

        // Upload button.
        if (has_capability('moodle/contentbank:upload', $coursecontext)) {
            $toolbar .= '<div class="btn btn-secondary ' . (empty($contenttypes) ? 'iv-ml-auto' : 'iv-ml-2') .
                '" id="uploadcontentbank" data' . $bsaffix . '-toggle="tooltip" data' . $bsaffix . '-trigger="hover"
                data' . $bsaffix . '-title="' . get_string('upload', 'ivplugin_contentbank')
                . '"><i class="bi bi-upload"></i></div>';
        }

        // Refresh button.
        $toolbar .= '<div class="btn btn-secondary iv-ml-2"
            id="refreshcontentbank" data' . $bsaffix . '-toggle="tooltip" data-editable="'
            . has_capability('moodle/contentbank:useeditor', $coursecontext) . '" data' . $bsaffix . '-trigger="hover" data'
            . $bsaffix . '-title="'
            . get_string('resync', 'ivplugin_contentbank')
            . '"><i class="bi bi-arrow-repeat"></i></div></div>';

        // Prepare the content list.
        $foldercontents = $cb->search_contents('', $coursecontext->id);
        $contents = [];
        foreach ($foldercontents as $foldercontent) {
            $contenttype = $foldercontent->get_content_type_instance();
            $contents[] = [
                "id" => $foldercontent->get_id(),
                "name" => $foldercontent->get_name(),
                'icon' => $contenttype->get_icon($foldercontent),
                'type' => $contenttype->get_contenttype_name(),
            ];
        }

        // Sort contents by name.
        usort($contents, function ($a, $b) {
            return strcmp($a['name'], $b['name']);
        });

        $html = '<div class="contentbank-container iv-rounded-bottom bg-white">';

        foreach ($contents as $content) {
            $editurl = new moodle_url(
                '/contentbank/edit.php',
                ['contextid' => $coursecontext->id, 'id' => $content['id'], 'plugin' => $content['type']]
            );

            $html .= '<div class="contentbank-item d-flex align-items-center p-1 '
                . ($content['id'] == $currentcontentid ? "selected" : "")
                . ' " data-contentid="' . $content['id']
                . '"><div class="contentbank-item-details d-flex align-items-center">';

            if ($content['icon']) {
                $html .= '<div class="contentbank-item-icon iv-ml-3 iv-mr-3" style="background-image: url('
                    . $content['icon']
                    . ')"/></div>';
            } else {
                $html .= '<div class="contentbank-item-icon iv-ml-3 iv-mr-3"></div>';
            }

            $html .= '<div class="contentbank-item-name w-100">' . $content['name'] . '</div></div>';
            $html .= '<div class="btn btn-sm iv-ml-auto contentbankview" data' . $bsaffix . '-toggle="tooltip"  data' . $bsaffix
                . '-trigger="hover" data' . $bsaffix . '-title="'
                . get_string('preview', 'ivplugin_contentbank')
                . '"><i class="bi bi-eye-fill"></i></div>';

            if (has_capability('moodle/contentbank:useeditor', $coursecontext)) {
                $html .= '<a class="btn btn-sm iv-ml-2" target="_blank" data' . $bsaffix . '-toggle="tooltip" data' . $bsaffix
                    . '-trigger="hover" data' . $bsaffix . '-title="'
                    . get_string('edit', 'ivplugin_contentbank')
                    . '" href="' . $editurl . '"><i class="bi bi-pencil-square"></i></a>';
            }

            $html .= '</div>';
        }

        if (empty($contents)) {
            $html .= '<div class="contentbank-item text-center p-2">'
                . get_string('nocontentfound', 'ivplugin_contentbank')
                . '</div>';
        }
        $html .= '</div>';

        $mform->addElement('html', '<div class="contentbank contentbank iv-rounded border border-secondary">'
            . $toolbar . $html . '</div><div id="contentbank-preview" class="mt-3"></div>');

        $mform->addElement('static', 'contentvalidation', '');
    }
}
