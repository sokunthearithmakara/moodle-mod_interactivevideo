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
 * Main class for the iframe plugin
 *
 * @module     ivplugin_iframe/main
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Base from 'mod_interactivevideo/type/base';
import {setupEditForm, initIframeCleanup} from 'ivplugin_iframe/utils';


export default class Iframe extends Base {
    /**
     * Called when the edit form is loaded.
     * @return {void}
     */
    onEditFormLoaded() {
        setupEditForm();
    }

    /**
     * Override the renderContainer method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    renderContainer(annotation) {
        $(`#message[data-id='${annotation.id}']`).addClass('hasiframe');
        super.renderContainer(annotation);
    }

    /**
     * Override the postContentRender method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    postContentRender(annotation) {
        initIframeCleanup(annotation, $(`#message[data-id='${annotation.id}']`));
    }


    /**
     * Override the displayReportView method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    async displayReportView(annotation) {
        const data = await this.render(annotation, 'html');
        let $message = $(`#message[data-id='${annotation.id}']`);
        $message.addClass('hasiframe');
        $message.find(`.modal-body`).html(data);
        $message.find(`.modal-body`).attr('id', 'content');
        this.postContentRender(annotation);
    }
}