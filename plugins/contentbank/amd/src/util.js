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
import ModalForm from 'core_form/modalform';
import {get_string as getString} from 'core/str';

/**
 * Fetches content from the content bank and updates the target element if provided.
 *
 * @param {number} id - The ID of the content item to fetch.
 * @param {number} contextid - The context ID where the content item resides.
 * @param {string} [target] - The optional target element selector to update with the fetched content.
 * @returns {Promise} A promise that resolves with the response or updates the target element with the fetched content.
 */
export const getcontent = (id, contextid, target) => {
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
 */
export const init = (contextid) => {
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
        .on('click', '.contentbank-container .contentbank-item .contentbankview', async function(e) {
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

            // Handle xAPI event detect for preview.
            const xapicheck = await getString('xapicheck', 'ivplugin_contentbank');
            let H5P;

            const checkH5P = () => {
                try {
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
                    const initializedAt = Date.now();
                    H5P.externalDispatcher.on('xAPI', async function(event) {
                        if (Date.now() - initializedAt < 1500) {
                            return;
                        }
                        if ((event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                            || event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered')
                            && event.data.statement.object.id.indexOf('subContentId') < 0) {
                            $("#contentbank-preview .xapi").remove();
                            $("#contentbank-preview")
                                .prepend(`<div class="xapi iv-float-right alert-success d-inline
                                     px-2 text-center iv-rounded-pill mb-2"><i class="fa fa-check iv-mr-2"></i>
                                     ${await getString('xapieventdetected', 'ivplugin_contentbank')}</div>`);
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
 * @param {Function} [callback] - Optional callback function.
 */
export const refreshContentBank = async(id, coursecontextid, edit = true, callback) => {
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
    for (const content of contents) {
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
                 data${isBS5 ? '-bs' : ''}-title="${await getString('preview', 'ivplugin_contentbank')}">
                 <i class="bi bi-eye-fill"></i></div>`;
        if (edit) {
            html += `<a class="btn btn-sm iv-ml-2" target="_blank" href="${editurl}"
                     data${isBS5 ? '-bs' : ''}-toggle="tooltip" data${isBS5 ? '-bs' : ''}-container="#wrapper"
                      data${isBS5 ? '-bs' : ''}-trigger="hover"
                      data${isBS5 ? '-bs' : ''}-title="${await getString('edit', 'ivplugin_contentbank')}">
                     <i class="bi bi-pencil-square"></i></a>`;
        }

        html += `</div>`;

        contentbank.append(html);
    }

    if (callback) {
        callback();
    }
};

/**
 * Sets up the edit form for the content bank plugin.
 *
 * @param {Object} instance - The calling class instance.
 * @param {Object} form - The form object.
 */
export const setupEditForm = (instance, form) => {
    let body = form.modal.modal.find('.modal-body');
    init(M.cfg.courseContextId);
    // Refresh the content from the content bank.
    body.off('click', '#refreshcontentbank').on('click', '#refreshcontentbank', function(e) {
        e.preventDefault();
        $(this).find('i').addClass('fa-spin');
        const currentid = $('[name=contentid]').val();
        $('.contentbank-container').html(`<div class="d-flex justify-content-center align-items-center"
        style="height: 150px;"><div class="spinner-grow text-secondary" role="status">
        <span class="sr-only">Loading...</span></div></div>`);
        refreshContentBank(currentid, M.cfg.courseContextId, $(this).data('editable'), function() {
            $('#refreshcontentbank i').removeClass('fa-spin');
        });
    });

    // Upload a new content.
    body.off('click', '#uploadcontentbank').on('click', '#uploadcontentbank', async function(e) {
        e.preventDefault();
        const uploadForm = new ModalForm({
            formClass: "core_contentbank\\form\\upload_files",
            args: {
                contextid: M.cfg.courseContextId,
            },
            modalConfig: {
                title: await getString('uploadcontent', 'ivplugin_contentbank')
            }
        });

        uploadForm.addEventListener(uploadForm.events.FORM_SUBMITTED, async(ev) => {
            instance.addNotification(await getString('contentuploaded', 'ivplugin_contentbank'), 'success');
            const returnurl = ev.detail.returnurl;
            const contentid = returnurl.match(/id=(\d+)/)[1];
            $('[name=contentid]').val(contentid);
            setTimeout(function() {
                $('#refreshcontentbank').trigger('click');
            }, 1000);
        });

        uploadForm.addEventListener(uploadForm.events.ERROR, async() => {
            instance.addNotification(await getString('contentuploaderror', 'ivplugin_contentbank'));
        });

        uploadForm.show();
    });
};

/**
 * Handles H5P integration and xAPI event detection.
 *
 * @param {Object} instance - The calling class instance.
 * @param {Object} annotation - The annotation object.
 * @param {jQuery} $message - The message element.
 * @param {string|Object} log - The existing state log.
 * @param {number} saveState - Whether to save the state.
 * @param {Object} state - The application state.
 * @param {Function} onStatement - Callback for handling xAPI statements.
 */
export const initH5PIntegration = (instance, annotation, $message, log, saveState, state, onStatement) => {
    const annoid = annotation.id;
    const detectH5P = async() => {
        let H5P;
        const iframe = document.querySelector(`#message[data-id='${annoid}'] iframe`);
        try {
            H5P = iframe.contentWindow.H5P;
        } catch (e) {
            H5P = null;
        }

        if (typeof H5P !== 'undefined' && H5P !== null) {
            if (H5P.externalDispatcher === undefined || iframe.contentWindow.H5PIntegration === undefined) {
                requestAnimationFrame(detectH5P);
                return;
            }

            if (instance.isEditMode()) {
                $message.find(`#title .btns .xapi`).remove();
                $message.find(`#title .btns`)
                    .prepend(`<div class="xapi alert-secondary px-2
             iv-rounded-pill">${await getString('xapicheck', 'ivplugin_contentbank')}</div>`);
            }

            const H5PIntegration = iframe.contentWindow.H5PIntegration;
            H5PIntegration.saveFreq = 1;
            const content = H5PIntegration.contents;
            const id = Object.keys(content)[0];

            if (H5PIntegration.contents[id]) {
                if (!H5PIntegration.contents[id].contentUserData) {
                    H5PIntegration.contents[id].contentUserData = [{}];
                } else if (typeof H5PIntegration.contents[id].contentUserData === 'string') {
                    H5PIntegration.contents[id].contentUserData = [{}];
                } else if (!H5PIntegration.contents[id].contentUserData[0]) {
                    H5PIntegration.contents[id].contentUserData[0] = {};
                }
                H5PIntegration.contents[id].contentUserData[0].state = log;
            }
            window.H5P = H5P;

            try {
                const initializedAt = Date.now();
                H5P.externalDispatcher.off('xAPI');
                H5P.externalDispatcher.on('xAPI', async function(event) {
                    const statement = event.data.statement;
                    if (instance.isEditMode() && (Date.now() - initializedAt < 1500)) {
                        return;
                    }

                    // Call the provided statement handler.
                    if (onStatement) {
                        onStatement(statement, H5PIntegration, id);
                    }
                });
            } catch (e) {
                requestAnimationFrame(detectH5P);
            }
        } else {
            requestAnimationFrame(detectH5P);
        }
    };
    requestAnimationFrame(detectH5P);
};

/**
 * Resizes the iframe within a modal body based on the height of the iframe content.
 *
 * @param {Object} annotation - The annotation object containing the id.
 */
export const resizeIframe = (annotation) => {
    const modalbody = document.querySelector(`#message[data-id='${annotation.id}'] .modal-body`);
    if (!modalbody) {
        return;
    }
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const iframe = modalbody.querySelector('iframe.h5p-player');
            if (iframe) {
                const height = iframe.scrollHeight;
                modalbody.style.height = `${height + 2000}px`;
            }
        }, 100);
    });

    resizeObserver.observe(modalbody);
};

/**
 * Common logic for rendering the report view summary.
 *
 * @param {Object} annotation
 * @param {Object} details
 * @param {Object} data
 * @param {Function} superMethod
 * @returns {string}
 */
export const renderReportView = (annotation, details, data, superMethod) => {
    if (!details.reportView.startsWith('##')) {
        return superMethod(annotation, details, data);
    }
    let rdata = details.reportView.split('|');
    rdata[0] = rdata[0].replace('##', '');
    let bsAffix = window.M && window.M.version > 405 ? '-bs' : '';
    let reportview = `<span data${bsAffix}-toggle="tooltip" data${bsAffix}-html="true"
                    data${bsAffix}-title='<span class="d-flex flex-column align-items-start">
                    <span><i class="bi bi-calendar iv-mr-2"></i>${rdata[0]}</span>
                    <span><i class="bi bi-stopwatch iv-mr-2"></i>${rdata[1]}</span>
                    <span><i class="bi bi-list-check iv-mr-2"></i>${rdata[2]}</span>
                    </span>'>
                    <i class="${rdata[3]}"></i>
                    <br><span>${rdata[4]}</span>
                    </span>`;
    let res = `<span class="completion-detail ${details.hasDetails ? 'cursor-pointer' : ''}"` +
        ` data-id="${data.itemid}" data-userid="${data.row.id}" data-type="${data.ctype}">${reportview}</span>`;
    if (data.access.canedit == 1) {
        res += `<i class="bi bi-trash3 fs-unset text-danger cursor-pointer position-absolute delete-cell"
                                title="${M.util.get_string('delete', 'mod_interactivevideo')}"></i>`;
    }
    return res;
};

export default {
    init,
    getcontent,
    refreshContentBank,
    setupEditForm,
    initH5PIntegration,
    resizeIframe,
    renderReportView
};