/* eslint-disable complexity */

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
 * Main class for content bank
 *
 * @module     ivplugin_contentbank/fbmain
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import contentbankutil from 'ivplugin_contentbank/util';
import ModalForm from 'core_form/modalform';
import Base from 'mod_flexbook/type/base';
import Notification from 'core/notification';
import {get_string as getString} from 'core/str';
import state from 'mod_flexbook/state';
import {safeParse} from 'mod_flexbook/utils';

export default class ContentBank extends Base {
    /**
     * Creates an instance of the content bank class.
     * @param {Array} annotations The annotations object
     * @param {Object} properties Properties of the interaction type
     */
    constructor(annotations, properties) {
        super(annotations, properties);
        $(document).on('interactionrun', (e) => {
            const annotation = e.originalEvent.detail.annotation;
            if (annotation.type === 'contentbank') {
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                    const iframe = document.querySelector(`#message[data-id='${annotation.id}'] iframe`);
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.dispatchEvent(new Event('resize'));
                    }
                }, 1000);
            }
        });
    }

    /**
     * Called when the edit form is loaded.
     * @param {Object} form The form object
     * @param {Event} event The event object
     * @return {void}
     */
    onEditFormLoaded(form, event) {
        let self = this;
        let body = form.modal.modal.find('.modal-body');
        contentbankutil.init(M.cfg.courseContextId);
        // Refresh the content from the content bank.
        body.off('click', '#refreshcontentbank').on('click', '#refreshcontentbank', function(e) {
            e.preventDefault();
            $(this).find('i').addClass('fa-spin');
            const currentid = $('[name=contentid]').val();
            $('.contentbank-container').html(`<div class="d-flex justify-content-center align-items-center"
            style="height: 150px;"><div class="spinner-grow text-secondary" role="status">
            <span class="sr-only">Loading...</span></div></div>`);
            contentbankutil.refreshContentBank(currentid, M.cfg.courseContextId, $(this).data('editable'), function() {
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

            uploadForm.addEventListener(uploadForm.events.FORM_SUBMITTED, async(e) => {
                self.addNotification(await getString('contentuploaded', 'ivplugin_contentbank'), 'success');
                const returnurl = e.detail.returnurl;
                const contentid = returnurl.match(/id=(\d+)/)[1];
                $('[name=contentid]').val(contentid);
                setTimeout(function() {
                    $('#refreshcontentbank').trigger('click');
                }, 1000);
            });

            uploadForm.addEventListener(uploadForm.events.ERROR, async() => {
                self.addNotification(await getString('contentuploaderror', 'ivplugin_contentbank'));
            });

            uploadForm.show();
        });

        return {form, event};
    }

    /** @override */
    async postContentRender(annotation, $message, callback) {
        $message.addClass('hascontentbank');
        if (annotation.completiontracking !== 'view') {
            $message.find('#title .info').remove();
            $message.find('#completiontoggle').before(
                `<i class="bi bi-info-circle-fill iv-mr-2 info"
                    title="${await getString("completionon" + annotation.completiontracking, "mod_interactivevideo")}">
                </i>`
            );

            if (!annotation.completed) {
                const $tooltip = $message.find('#title .info');
                $tooltip.tooltip('dispose');
                setTimeout(function() {
                    $tooltip.tooltip({
                        container: $message,
                        html: true,
                        trigger: 'hover',
                        placement: 'auto'
                    });
                    $tooltip.tooltip('show');
                    setTimeout(() => $tooltip.tooltip('hide'), 3000);
                }, 1000);
            }
        }
        if (annotation.hascompletion == 1
            && annotation.completiontracking != 'manual' && !annotation.completed) {
            return callback;
        }
        return true;
    }

    /**
     * Initialize the container to display the annotation
     * @param {Object} annotation The annotation object
     * @returns {void}
     */
    renderContainer(annotation) {
        super.renderContainer(annotation);
        let $message = $(`#message[data-id='${annotation.id}']`);
        $message.find('.modal-body').addClass('p-0');

    }

    /**
     * Resizes the iframe within a modal body based on the height of the iframe content.
     *
     * @param {Object} annotation - The annotation object containing the id.
     */
    resizeIframe(annotation) {
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
    }

    /** @override */
    async applyContent(annotation, $message = null, existingstate = null) {
        let self = this;
        $message.find('.modal-body').addClass('p-0');
        // Remove .modal-dialog-centered class to avoid flickering when H5P content resizes.
        $message.removeClass('modal-dialog-centered');

        let annoid = annotation.id;

        const advanced = safeParse(annotation.advanced, {});
        const saveState = advanced.savecurrentstate == 1 ? 1 : 0;

        const afterLog = async(log) => {
            const xAPICheck = (annotation) => {
                const detectH5P = async() => {
                    let H5P;
                    try { // Try to get the H5P object.
                        H5P = document.querySelector(`#message[data-id='${annoid}'] iframe`).contentWindow.H5P;
                    } catch (e) {
                        H5P = null;
                    }
                    if (typeof H5P !== 'undefined' && H5P !== null) {
                        if (H5P.externalDispatcher === undefined) {
                            requestAnimationFrame(detectH5P);
                            return;
                        }
                        if (document.querySelector(`#message[data-id='${annoid}'] iframe`)
                            .contentWindow.H5PIntegration === undefined) {
                            requestAnimationFrame(detectH5P);
                            return;
                        }

                        if (self.isEditMode()) {
                            $message.find(`#title .btns .xapi`).remove();
                            $message.find(`#title .btns`)
                                .prepend(`<div class="xapi alert-secondary px-2
                         iv-rounded-pill">${await getString('xapicheck', 'ivplugin_contentbank')}</div>`);
                        }

                        window.H5PIntegration = document.querySelector(`#message[data-id='${annoid}'] iframe`)
                            .contentWindow.H5PIntegration || {};
                        window.H5PIntegration.saveFreq = 1;
                        let content = window.H5PIntegration.contents;
                        let id = Object.keys(content)[0];
                        if (existingstate !== null && existingstate !== undefined) {
                            log = existingstate;
                        }
                        window.H5PIntegration.contents[id].contentUserData[0].state = log;
                        window.H5P = H5P;
                        if (annotation.completed) {
                            return;
                        }
                        try {
                            H5P.externalDispatcher.off('xAPI');
                            H5P.externalDispatcher.on('xAPI', async function(event) {
                                let statement = event.data.statement;
                                if ((statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                                    || statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered')
                                    && statement.object.id.indexOf('subContentId') < 0
                                    && !statement.context.contextActivities.parent) {
                                    if (self.isEditMode()) {
                                        $(`#message[data-id='${annotation.id}'] #title .btns .xapi`).remove();
                                        $(`#message[data-id='${annotation.id}'] #title .btns`)
                                            .prepend(`<div class="xapi alert-success d-inline px-2 iv-rounded-pill">
                                                    <i class="fa fa-check iv-mr-2"></i>
                                                    ${await getString('xapieventdetected', 'ivplugin_contentbank')}
                                                    </div>`);
                                        state.audio.pop.play();
                                        return;
                                    }
                                    let complete = false;
                                    let textclass = '';
                                    let result = statement.result;
                                    if (annotation.completiontracking == 'completepass'
                                        && result && result.score.scaled >= 0.5) {
                                        complete = true;
                                    } else if (annotation.completiontracking == 'completefull'
                                        && result && result.score.scaled == 1) {
                                        complete = true;
                                    } else if (annotation.completiontracking == 'complete') {
                                        complete = true;
                                    }
                                    if (result.score.scaled < 0.5) {
                                        textclass = 'fa fa-check text-danger';
                                    } else if (result.score.scaled < 1) {
                                        textclass = 'fa fa-check text-success';
                                    } else {
                                        textclass = 'bi bi-check2-all text-success';
                                    }
                                    if (complete && !annotation.completed) {
                                        let details = {};
                                        const completeTime = new Date();
                                        details.xp = annotation.xp;
                                        if (annotation.char1 == '1') { // Partial points.
                                            details.xp = (result.score.scaled * annotation.xp).toFixed(2);
                                        }
                                        details.percent = details.xp / annotation.xp;
                                        details.duration = state.getTimespent ? await state.getTimespent(annotation.id) : 0;
                                        details.timecompleted = completeTime.getTime();
                                        const completiontime = completeTime.toLocaleString();
                                        let duration = await self.formatTime(details.duration / 1000);
                                        details.reportView = '##' + completiontime + "|"
                                            + duration + "|"
                                            + result.score.raw + "/" + result.score.max + "|"
                                            + textclass + "|"
                                            + Number(details.xp);
                                        details.details = saveState == 1 ? window.H5PIntegration.contents[id]
                                            .contentUserData[0].state : '';
                                        // Must wait 1.5 seconds or so to let the saveState finish.
                                        // Otherwise, the completion will be incomplete.
                                        setTimeout(function() {
                                            self.toggleCompletion(annoid, 'mark-done', 'automatic', details);
                                        }, 1500);
                                    }

                                    const advanced = safeParse(annotation.advanced, {});
                                    if (result.score.scaled < 0.5) {
                                        if (advanced.jumptofail) {
                                            setTimeout(function() {
                                                state.navigateToAnnotation(advanced.jumptofail, true);
                                            }, 1000);
                                        }
                                    } else {
                                        if (advanced.jumptopass) {
                                            setTimeout(function() {
                                                state.navigateToAnnotation(advanced.jumptopass, true);
                                            }, 1000);
                                        }
                                    }
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
            // We don't need to run the render method every time the content is applied. We can cache the content.
            if (!self.cache[annotation.id] || self.isEditMode()) {
                self.cache[annotation.id] = await self.render(annotation);
            }
            const data = self.cache[annotation.id];

            $message.find(`.modal-body`).html(data).attr('id', 'content').fadeIn(300);

            self.postContentRender(annotation, $message, xAPICheck(annotation));

            if (existingstate !== null && existingstate !== undefined) {
                return;
            }

            if (self.isEditMode()) {
                return;
            }

            // If annotation is incomplete, we want to save the state when the interaction is closed.
            if (!annotation.completed && saveState == 1) {
                let namespace = annotation.id;
                let eventName = `interactionclose.${namespace} interactionrefresh.${namespace}`; // Use a unique namespace.
                $(document).off(eventName).on(eventName, async function(e) {
                    if (e.detail.annotation.id == annotation.id) {
                        try {
                            let content = window.H5PIntegration.contents;
                            let id = Object.keys(content)[0];
                            let contentuserData = window.H5PIntegration.contents[id].contentUserData[0];
                            let cstate = contentuserData.state;
                            await self.saveLog(annotation, {
                                text1: JSON.stringify(cstate),
                                char1: annotation.type,
                            }, self.userid, true);
                        } catch (e) {
                            //
                        }
                    }
                });
            }
            if (annotation.hascompletion != 1) {
                return;
            }
            if (!annotation.completed && annotation.completiontracking == 'view') {
                self.completiononview(annotation);
            }
        };

        if (existingstate !== null && existingstate !== undefined) { // Report view.
            afterLog(existingstate);
            return;
        }

        // Get exiting state.
        if (self.isEditMode()) {
            afterLog('');
            return;
        }
        if (saveState !== 1) {
            afterLog('');
            return;
        }
        let logs = await self.getLogs(annotation, [self.userid]);

        let log = '';
        if (logs.length <= 0) {
            afterLog('');
            return;
        }
        if (logs.length > 0) {
            log = JSON.parse(logs[0].text1);

            // Show a confirmation message if the state is not empty.
            if (log !== '' && log !== null) {
                Notification.saveCancel(
                    await getString('resume', 'ivplugin_contentbank'),
                    await getString('resumeconfirm', 'ivplugin_contentbank'),
                    await getString('resume', 'ivplugin_contentbank'),
                    function() {
                        // Do nothing.
                        afterLog(log);
                    },
                    function() {
                        afterLog('');
                    }
                );
            } else {
                afterLog(log);
            }
        }
    }

    /** @override */
    async getCompletionData(annotation, userid) {
        let logs = await this.getLogs(annotation, [userid]);
        let log = '';
        if (logs.length > 0) {
            log = JSON.parse(logs[0].text1);
        }
        annotation.displayoptions = 'popup';
        annotation.hascompletion = 0;
        annotation.completed = true;
        this.previewInteraction(annotation, log);
        return log;
    }

    /** @override */
    renderReportView(annotation, details, data) {
        if (!details.reportView.startsWith('##')) {
            return super.renderReportView(annotation, details, data);
        }
        let rdata = details.reportView.split('|');
        rdata[0] = rdata[0].replace('##', '');
        let bsAffix = window.M.version > 405 ? '-bs' : '';
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
    }
}