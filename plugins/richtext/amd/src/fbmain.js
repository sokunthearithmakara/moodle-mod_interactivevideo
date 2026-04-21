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
 * Main module for the richtext plugin.
 *
 * @module     ivplugin_richtext/fbmain
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import Base from 'mod_flexbook/type/base';
import $ from 'jquery';
import {notifyFilterContentUpdated as notifyFilter} from 'core_filters/events';
export default class RichText extends Base {
    /**
     * Post-processes the content after rendering an annotation.
     *
     * @param {Object} annotation - The annotation object.
     * @param {number} annotation.id - The ID of the annotation.
     */
    postContentRender(annotation) {
        let $body = $(`#message[data-id='${annotation.id}'] .modal-body`);
        notifyFilter($body);
        $body.addClass('bg-white p-0');
    }
}