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
 * Content bank utility functions
 *
 * @module     ivplugin_contentbank/util
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Ajax from 'core/ajax';
/**
 * Fetches content from the content bank and updates the target element if provided.
 *
 * @param {number} id - The ID of the content item to fetch.
 * @param {number} contextid - The context ID where the content item resides.
 * @param {string} [target] - The optional target element selector to update with the fetched content.
 * @returns {Promise} A promise that resolves with the response or updates the target element with the fetched content.
 */
const getcontent = (id, contextid, target) => {
    Ajax.call([{
        args: {
            id: id,
            contextid: contextid,
        },
        contextid: contextid,
        methodname: 'ivplugin_contentbank_getitem',
    }])[0].then((response) => {
        if (target) {
            return $(target).html(response.item);
        } else {
            return response;
        }
    }).catch(() => {
        // Do nothing.
    });
};

/**
 * Initializes event listeners for content bank interactions.
 *
 * @param {number} contextid - The context ID for the content bank.
 *
 * This function sets up click event handlers for elements within the content bank container.
 * It handles the selection of content items, updates the preview area, and manages xAPI event detection.
 *
 * Event Listeners:
 * - Click on content item details: Selects the item and updates the hidden input with the content ID.
 * - Click on content item view: Selects the item, updates the preview area, and sets up xAPI event detection.
 *
 * xAPI Event Detection:
 * - Monitors for xAPI events (completed, answered) emitted by the content.
 * - Displays a notification if such events are detected.
 */
const init = (contextid) => {
    $(document).off('click', '.contentbank-container .contentbank-item .contentbank-item-details')
        .on('click', '.contentbank-container .contentbank-item .contentbank-item-details', function(e) {
            e.preventDefault();
            $('.contentbank-container .contentbank-item').removeClass('selected');
            $(this).closest('.contentbank-item').addClass('selected');
            $('#contentbank-preview').empty();
            const id = $(this).closest('.contentbank-item').data('contentid');
            $('[name=contentid]').val(id);
        });

    $(document).off('click', '.contentbank-container .contentbank-item .contentbankview')
        .on('click', '.contentbank-container .contentbank-item .contentbankview', function(e) {
            e.preventDefault();
            $('.contentbank-container .contentbank-item').removeClass('selected');
            let targetContentbank = $(this).closest('.contentbank-item');
            targetContentbank.addClass('selected');
            const id = targetContentbank.data('contentid');
            $('#contentbank-preview').empty();
            $('#contentbank-preview').attr('data-contentid', id);
            $('[name=contentid]').val(id);
            // Preview selected content.
            getcontent(id, contextid, '#contentbank-preview');

            // Handle xAPI event. We want user to be able to check if the content emits xAPI events (completed, answered)
            // because some content types may not emit these events. Then user can decide
            // if they want students to mark it complete manually or automatically.
            const xapicheck = M.util.get_string('xapicheck', 'ivplugin_contentbank');
            let H5P;

            const checkH5P = () => {
                try { // Try to get the H5P object.
                    H5P = document.querySelector('#contentbank-preview iframe.h5p-player').contentWindow.H5P;
                } catch (e) {
                    H5P = null;
                }

                if (typeof H5P !== 'undefined' && H5P !== null) {
                    if (H5P.externalDispatcher === undefined) {
                        requestAnimationFrame(checkH5P);
                        return;
                    }
                    $("#contentbank-preview .xapi").remove();
                    $(`#contentbank-preview[data-contentid=${id}]`)
                        .prepend(`<div class="xapi iv-float-right alert-secondary d-inline px-2 text-center iv-rounded-pill mb-2">
                ${xapicheck}</div>`);
                    H5P.externalDispatcher.on('xAPI', function(event) {
                        if ((event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                            || event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered')
                            && event.data.statement.object.id.indexOf('subContentId') < 0) {
                            $("#contentbank-preview .xapi").remove();
                            $("#contentbank-preview")
                                .prepend(`<div class="xapi iv-float-right alert-success d-inline
                                     px-2 text-center iv-rounded-pill mb-2"><i class="fa fa-check iv-mr-2"></i>
                                     ${M.util.get_string('xapieventdetected', 'ivplugin_contentbank')}</div>`);
                            const audio = new Audio(M.cfg.wwwroot + '/mod/interactivevideo/sounds/pop.mp3');
                            audio.play();
                        }
                    });
                } else {
                    requestAnimationFrame(checkH5P);
                }
            };

            requestAnimationFrame(checkH5P);
        });
};

/**
 * Refreshes the content bank by fetching and displaying content items.
 *
 * @param {number} id - The ID of the content to be highlighted.
 * @param {number} coursecontextid - The context ID of the course.
 * @param {boolean} [edit=true] - Whether to show edit options for the content items.
 * @param {Function} [callback] - Optional callback function to be executed after refreshing the content bank.
 * @returns {Promise<void>} - A promise that resolves when the content bank is refreshed.
 */
const refreshContentBank = async(id, coursecontextid, edit = true, callback) => {
    const isBS5 = $('body').hasClass('bs-5');
    $('#contentbank-preview').empty();
    let contentbankitems = await Ajax.call([{
        args: {
            contextid: coursecontextid
        },
        contextid: coursecontextid,
        methodname: 'ivplugin_contentbank_getitems',
    }])[0];

    let contents = JSON.parse(contentbankitems.contents);
    let contentbank = $('.modal-body form .contentbank-container');
    contentbank.empty();
    contents.forEach(function(content) {
        const editurl = M.cfg.wwwroot + '/contentbank/edit.php?contextid='
            + coursecontextid + '&id=' + content.id + '&plugin=' + content.type;
        let html = '<div class="contentbank-item d-flex align-items-center p-1 '
            + (content.id == id ? "selected" : "") + ' " data-contentid="' + content.id
            + '"><div class="contentbank-item-details d-flex align-items-center">';
        if (content.icon) {
            html += '<img class="contentbank-item-icon iv-mr-2" src="' + content.icon + '"/>';
        } else {
            html += '<div class="contentbank-item-icon iv-mr-2"></div>';
        }

        html += '<div class="contentbank-item-name w-100">' + content.name + '</div></div>';
        html += `<div class="btn btn-sm iv-ml-auto contentbankview" data${isBS5 ? '-bs' : ''}-toggle="tooltip"
         data${isBS5 ? '-bs' : ''}-container="#wrapper"
                 data${isBS5 ? '-bs' : ''}-trigger="hover"
                 data${isBS5 ? '-bs' : ''}-title="${M.util.get_string('preview', 'ivplugin_contentbank')}">
                 <i class="bi bi-eye-fill"></i></div>`;
        if (edit) {
            html += `<a class="btn btn-sm iv-ml-2" target="_blank" href="${editurl}"
                     data${isBS5 ? '-bs' : ''}-toggle="tooltip" data${isBS5 ? '-bs' : ''}-container="#wrapper"
                      data${isBS5 ? '-bs' : ''}-trigger="hover"
                      data${isBS5 ? '-bs' : ''}-title="${M.util.get_string('edit', 'ivplugin_contentbank')}">
                     <i class="bi bi-pencil-square"></i></a>`;
        }

        html += `</div>`;


        contentbank.append(html);
    });

    if (callback) {
        callback();
    }
};

export default {init, getcontent, refreshContentBank};