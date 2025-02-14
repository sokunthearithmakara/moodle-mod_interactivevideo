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
 * Main class for skip segment
 *
 * @module     ivplugin_skipsegment/main
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Base from 'mod_interactivevideo/type/base';
import Ajax from 'core/ajax';
export default class SkipSegment extends Base {
    /**
     * Initializes the skip segment plugin.
     * If not in edit mode, sets up an event listener for the 'timeupdate' event.
     * Filters annotations to find those of type 'skipsegment' and runs the interaction
     * when the current time falls within the annotation's timestamp range.
     *
     * @method init
     */
    init() {
        if (!this.isEditMode()) {
            let self = this;
            const skipsegment = this.annotations.filter((annotation) => annotation.type == 'skipsegment');
            $(document).on('timeupdate', async function(e) {
                const t = e.originalEvent.detail.time;
                for (let annotation of skipsegment) {
                    if (annotation.timestamp < t && annotation.title > t) {
                        await self.player.seek(Number(annotation.title));
                        await self.runInteraction(annotation);
                        break;
                    }
                }
            });
        }
    }
    /**
     * Renders the edit item for the skip segment plugin.
     *
     * @param {Object} annotations - The annotations object.
     * @param {jQuery} listItem - The jQuery object representing the list item.
     * @param {Object} item - The item object containing details of the segment.
     * @returns {jQuery} The modified list item with the rendered edit item.
     */
    renderEditItem(annotations, listItem, item) {
        listItem = super.renderEditItem(annotations, listItem, item);
        listItem.find('[data-editable]').removeAttr('data-editable');
        listItem.find('.btn.copy').remove();
        listItem.find('.title').replaceWith(`<span class="skipend timestamp
            bg-light px-2 py-1 rounded-sm text-truncate"
            data-timestamp="${item.title}">${this.convertSecondsToHMS(item.title, this.totaltime < 3600, true)}</span>`);
        if (this.isSkipped(item.timestamp)) {
            listItem.find('.skipend').after(`<span class="badge badge-warning ml-2">
                            ${M.util.get_string('skipped', 'ivplugin_skipsegment')}</span>`);
        }
        return listItem;
    }

    /**
     * Adds an annotation to the interactive video.
     *
     * @param {Array} annotations - The list of current annotations.
     * @param {number} timestamp - The timestamp at which to add the annotation.
     * @param {number} coursemodule - The course module ID.
     * @returns {Promise<void>} A promise that resolves when the annotation is added.
     */
    async addAnnotation(annotations, timestamp, coursemodule) {
        let self = this;
        let data = {
            title: timestamp + 5 > this.end ? this.end : timestamp + 5,
            timestamp: timestamp,
            contextid: M.cfg.contextid,
            type: self.prop.name,
            courseid: self.course,
            cmid: coursemodule,
            annotationid: self.interaction,
            hascompletion: self.prop.hascompletion ? 1 : 0,
            advanced: JSON.stringify({
                "visiblebeforecompleted": "1",
                "visibleaftercompleted": null,
                "clickablebeforecompleted": "1",
                "clickableaftercompleted": null,
                "replaybehavior": "1",
            }),
        };
        let ajax = await Ajax.call([{
            methodname: 'ivplugin_skipsegment_add_skip',
            args: {
                skipdata: JSON.stringify(data),
                contextid: M.cfg.contextid,
            },
            contextid: M.cfg.contextid,
        }])[0];

        let newAnnotation = JSON.parse(ajax.data);
        self.dispatchEvent('annotationupdated', {
            annotation: newAnnotation,
            action: 'add'
        });

        $('#contentmodal').modal('hide');
    }

    /**
     * Handles the event when the edit form is loaded.
     *
     * @param {Object} form - The form object that is being edited.
     * @param {Event} event - The event object associated with the form loading.
     * @returns {Object} - An object containing the form and event.
     *
     */
    onEditFormLoaded(form, event) {
        let self = this;
        const body = super.onEditFormLoaded(form, event);
        body.on('change', '[name=titleassist]', function(e) {
            e.preventDefault();
            const originalValue = $(this).data('initial-value');
            // Make sure the timestamp format is hh:mm:ss.
            if (!self.validateTimestampFormat($(this).val())) {
                self.addNotification(M.util.get_string('invalidtimestampformat', 'ivplugin_skipsegment'));
                $(this).val(originalValue);
                return;
            }

            // Convert the timestamp to seconds.
            const parts = $(this).val().split(':');
            const timestamp = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
            if (!self.isBetweenStartAndEnd(timestamp)) {
                const message = M.util.get_string('interactioncanonlybeaddedbetweenstartandendtime', 'mod_interactivevideo', {
                    "start": self.convertSecondsToHMS(self.start),
                    "end": self.convertSecondsToHMS(self.end),
                });
                self.addNotification(message);
                $(this).val(originalValue);
                return;
            }

            // Make sure the title assist is not the same as the timestamp assist or less than the timestamp assist
            if (timestamp <= Number($('[name=timestamp]').val())) {
                self.addNotification(M.util.get_string('segmentendmustbegreaterthantimestamp', 'mod_interactivevideo'));
                $(this).val(originalValue);
                return;
            }

            $('[name=title]').val(timestamp);
        });
        return {form, event};
    }

    /**
     * Renders an annotation on the video navigation timeline.
     *
     * @param {Object} annotation - The annotation object to be rendered.
     * @param {number} annotation.timestamp - The timestamp of the annotation.
     * @param {string} annotation.title - The title of the annotation.
     * @param {string} annotation.type - The type of the annotation.
     * @param {string} annotation.id - The unique identifier of the annotation.
     */
    renderItemOnVideoNavigation(annotation) {
        if (annotation.timestamp < this.start || annotation.timestamp > this.end) {
            return;
        }
        this.totaltime = this.totaltime || this.end - this.start;
        const percentage = ((Number(annotation.timestamp) - this.start) / this.totaltime) * 100;
        const length = (Number(annotation.title) - Number(annotation.timestamp)) / this.totaltime * 100;
        if (this.isVisible(annotation) && !this.isEditMode()) {
            $("#video-nav ul").append(`<li class="annotation ${annotation.type}
             ${this.isClickable(annotation) ? '' : 'no-pointer-events'} position-absolute bg-dark progress-bar-striped progress-bar"
              data-timestamp="${annotation.timestamp}" data-id="${annotation.id}"
               style="left: ${percentage}%; width: ${length}%;" data-toggle="tooltip"
               data-container="#wrapper" data-trigger="hover"
         data-html="true" data-original-title='<i class="${this.prop.icon}"></i>'></li>`);
        }
        if (this.isEditMode()) {
            $("#video-timeline-wrapper").append(`<div class="position-absolute skipsegment cursor-pointer"
                 data-timestamp="${annotation.timestamp}" data-id="${annotation.id}"
                 style="height: 100%; left: ${percentage}%; width: ${length}%;background: rgba(0,0,0,0.75);">
                 <div class="position-absolute w-100 text-center px-1 delete-skipsegment">
                 <i class="bi bi-trash3 text-muted fs-unset"></i></div></div>`);
        }
    }
    /**
     * Executes the interaction for skipping a segment in the video.
     *
     * This function appends a skip segment icon to the video block, seeks the video player to the specified annotation time,
     * updates the progress bar, and then plays the video.
     * The skip segment icon is displayed for a short duration before being removed.
     *
     * @param {Object} annotation - The annotation object containing the title which represents the time to seek to.
     * @returns {Promise<void>} A promise that resolves when the interaction is complete.
     */
    async runInteraction(annotation) {
        let self = this;
        $('.video-block').append(`<div id="skipsegment" class="text-white position-absolute p-3 hide">
         <i class="${this.prop.icon}"></i></div>`);
        $('#skipsegment').fadeIn(300);
        await this.player.seek(Number(annotation.title) + 0.1);
        this.player.pause();
        if (annotation.title >= this.end) {
            self.dispatchEvent('iv:playerEnded', {});
        }
        if (this.isEditMode()) {
            return;
        }
        setTimeout(() => {
            $('#skipsegment').remove();
            self.player.play();
        }, 300);

    }
}