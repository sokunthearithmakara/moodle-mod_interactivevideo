/* eslint-disable max-len */
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
 * @module     ivplugin_contentbank/main
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import contentbankutil from 'ivplugin_contentbank/util';
import ModalForm from 'core_form/modalform';
import Base from 'mod_interactivevideo/type/base';
import {notifyFilterContentUpdated as notifyFilter} from 'core_filters/events';
import Notification from 'core/notification';

export default class ContentBank extends Base {
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
        body.off('click', '#uploadcontentbank').on('click', '#uploadcontentbank', function(e) {
            e.preventDefault();
            const uploadForm = new ModalForm({
                formClass: "core_contentbank\\form\\upload_files",
                args: {
                    contextid: M.cfg.courseContextId,
                },
                modalConfig: {
                    title: M.util.get_string('uploadcontent', 'ivplugin_contentbank')
                }
            });

            uploadForm.addEventListener(uploadForm.events.FORM_SUBMITTED, (e) => {
                self.addNotification(M.util.get_string('contentuploaded', 'ivplugin_contentbank'), 'success');
                const returnurl = e.detail.returnurl;
                const contentid = returnurl.match(/id=(\d+)/)[1];
                $('[name=contentid]').val(contentid);
                setTimeout(function() {
                    $('#refreshcontentbank').trigger('click');
                }, 1000);
            });

            uploadForm.addEventListener(uploadForm.events.ERROR, () => {
                self.addNotification(M.util.get_string('contentuploaderror', 'ivplugin_contentbank'));
            });

            uploadForm.show();
        });

        self.timepicker({
            modal: true,
            disablelist: true,
            required: true,
        });

        return {form, event};
    }

    /**
     * Handles the rendering of content annotations and applies specific classes and conditions.
     *
     * @param {Object} annotation - The annotation object containing details about the content.
     * @param {Function} callback - The callback function to be executed if certain conditions are met.
     * @returns {boolean|Function} - Returns true if the annotation does not meet the conditions for completion tracking,
     *                               otherwise returns the callback function.
     */
    postContentRender(annotation, callback) {
        const $message = $(`#message[data-id='${annotation.id}']`);
        $message.addClass('hascontentbank');
        $message.find('.modal-dialog').addClass('modal-xl');
        if (annotation.completiontracking !== 'view') {
            let $completiontoggle = $message.find('#completiontoggle');
            $message.find('#title .info').remove();
            $completiontoggle.before(`<i class="bi bi-info-circle-fill iv-mr-2 info" data${self.isBS5 ? '-bs' : ''}-toggle="tooltip"
            data${self.isBS5 ? '-bs' : ''}-container="#message" data${self.isBS5 ? '-bs' : ''}-trigger="hover"
            title="${M.util.get_string("completionon" + annotation.completiontracking, "mod_interactivevideo")}"></i>`);
            if (!annotation.completed) {
                setTimeout(function() {
                    $message.find(`[data${self.isBS5 ? '-bs' : ''}-toggle="tooltip"]`).tooltip('show');
                }, 1000);
                setTimeout(function() {
                    $message.find(`[data${self.isBS5 ? '-bs' : ''}-toggle="tooltip"]`).tooltip('hide');
                }, 3000);
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
        const resizeObserver = new ResizeObserver(() => {
            const iframe = modalbody.querySelector('iframe.h5p-player');
            if (iframe) {
                const height = iframe.scrollHeight;
                modalbody.style.height = `${height + 2000}px`;
            }
        });

        resizeObserver.observe(modalbody);
    }

    /**
     * Apply the content to the annotation
     * @param {Object} annotation The annotation object
     * @param {Object} existingstate The existing state of the annotation
     * @returns {Promise<void>} - Returns a promise that resolves when the content is applied.
     * @override
     */
    async applyContent(annotation, existingstate) {
        let self = this;
        let $message = $(`#message[data-id='${annotation.id}']`);
        // Remove .modal-dialog-centered class to avoid flickering when H5P content resizes.
        $message.removeClass('modal-dialog-centered');

        let annoid = annotation.id;

        const onPassFail = async(passed, time) => {
            let label = passed ? 'continue' : 'rewatch';
            $message.find('#content')
                .append(`<button class="btn btn-${passed ? 'success' : 'danger'} mt-2 btn-rounded"
                    id="passfail" data-timestamp="${time}"><i class="fa fa-${passed ? 'play' : 'redo'} iv-mr-2"></i>
                ${M.util.get_string(label, 'ivplugin_contentbank')}
                </button>`);
            $message.find('iframe').addClass('no-pointer-events');
        };

        $(document).off('click', '#passfail').on('click', '#passfail', function(e) {
            e.preventDefault();
            let time = $(this).data('timestamp');
            $message.find('.interaction-dismiss').trigger('click');
            self.player.seek(time);
            self.player.play();
            $(this).remove();
        });

        let saveState = 0;
        let condition = null;
        if (annotation.text1 != '' && annotation.text1 !== null) {
            condition = JSON.parse(annotation.text1);
        }

        if (JSON.parse(annotation.advanced).savecurrentstate == 1) {
            saveState = 1;
        }

        const afterLog = async(log) => {
            const xAPICheck = (annotation) => {
                const detectH5P = () => {
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
                        if (document.querySelector(`#message[data-id='${annoid}'] iframe`).contentWindow.H5PIntegration === undefined) {
                            requestAnimationFrame(detectH5P);
                            return;
                        }

                        if (self.isEditMode()) {
                            $message.find(`#title .btns .xapi`).remove();
                            $message.find(`#title .btns`)
                                .prepend(`<div class="xapi alert-secondary px-2
                         iv-rounded-pill">${M.util.get_string('xapicheck', 'ivplugin_contentbank')}</div>`);
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
                                                    ${M.util.get_string('xapieventdetected', 'ivplugin_contentbank')}
                                                    </div>`);
                                        const audio = new Audio(M.cfg.wwwroot + '/mod/interactivevideo/sounds/pop.mp3');
                                        audio.play();
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
                                        let windowAnno = window.ANNOS.find(x => x.id == annotation.id);
                                        details.xp = annotation.xp;
                                        if (annotation.char1 == '1') { // Partial points.
                                            details.xp = (result.score.scaled * annotation.xp).toFixed(2);
                                        }
                                        details.duration = windowAnno.duration + (completeTime.getTime() - windowAnno.newstarttime);
                                        details.timecompleted = completeTime.getTime();
                                        const completiontime = completeTime.toLocaleString();
                                        let duration = self.formatTime(details.duration / 1000);
                                        details.reportView = `<span data-toggle="tooltip" data-html="true"
                     data-title='<span class="d-flex flex-column align-items-start"><span><i class="bi bi-calendar iv-mr-2"></i>
                     ${completiontime}</span><span><i class="bi bi-stopwatch iv-mr-2"></i>${duration}</span>
                     <span><i class="bi bi-list-check iv-mr-2"></i>
                     ${result.score.raw}/${result.score.max}</span></span>'>
                     <i class="${textclass}"></i><br><span>${Number(details.xp)}</span></span>`;
                                        details.details = saveState == 1 ? window.H5PIntegration.contents[id].contentUserData[0].state : '';
                                        // Must wait 1.5 seconds or so to let the saveState finish.
                                        // Otherwise, the completion will be incomplete.
                                        setTimeout(function() {
                                            self.toggleCompletion(annoid, 'mark-done', 'automatic', details);
                                        }, 1500);
                                    }

                                    if (condition !== null) {
                                        if (result.score.scaled < 0.5) {
                                            if (condition.gotoonfailed == 1 && condition.forceonfailed != 1) {
                                                onPassFail(false, condition.timeonfailed);
                                            } else if (condition.gotoonfailed == 1 && condition.forceonfailed == 1) {
                                                setTimeout(function() {
                                                    // Close the annotation.
                                                    $message.find('.interaction-dismiss').trigger('click');
                                                    self.player.seek(condition.timeonfailed);
                                                    self.player.play();
                                                }, 1000);
                                            }
                                            if (condition.showtextonfailed == 1 && condition.textonfailed.text != '') {
                                                let textonfailed = await self.formatContent(condition.textonfailed.text);
                                                $message.find('.passfail-message').remove();
                                                $message.find(`#content`)
                                                    .prepend(`<div class="alert bg-secondary mt-2 mx-3 passfail-message">
                                            ${textonfailed}</div>`);
                                                notifyFilter($('.passfail-message'));
                                            }
                                        } else {
                                            if (condition.gotoonpassing == 1 && condition.forceonpassing != 1) {
                                                onPassFail(true, condition.timeonpassing);
                                            } else if (condition.gotoonpassing == 1 && condition.forceonpassing == 1) {
                                                setTimeout(function() {
                                                    $message.find('.interaction-dismiss').trigger('click');
                                                    self.player.seek(condition.timeonpassing);
                                                    self.player.play();
                                                }, 1000);
                                            }
                                            if (condition.showtextonpassing == 1 && condition.textonpassing.text != '') {
                                                let textonpassing = await self.formatContent(condition.textonpassing.text);
                                                $message.find('.passfail-message').remove();
                                                $message.find(`#content`)
                                                    .prepend(`<div class="alert bg-secondary mt-2 mx-3 passfail-message">
                                            ${textonpassing}</div>`);
                                                notifyFilter($('.passfail-message'));
                                            }
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
            let firstview = false;
            if (!self.cache[annotation.id] || self.isEditMode()) {
                self.cache[annotation.id] = await self.render(annotation);
                firstview = true;
            }
            const data = self.cache[annotation.id];

            $message.find(`.modal-body`).html(data).attr('id', 'content').fadeIn(300);

            xAPICheck(annotation);

            if (existingstate !== null && existingstate !== undefined) {
                return;
            }

            if (self.isEditMode()) {
                return;
            }

            // If annotation is incomplete, we want to save the state when the interaction is closed.
            if (!annotation.completed && firstview && saveState == 1) {
                $(document).on('interactionclose interactionrefresh', async function(e) {
                    if (e.detail.annotation.id == annotation.id) {
                        try {
                            let content = window.H5PIntegration.contents;
                            let id = Object.keys(content)[0];
                            let contentuserData = window.H5PIntegration.contents[id].contentUserData[0];
                            let state = contentuserData.state;
                            await self.saveLog(annotation, {
                                text1: JSON.stringify(state),
                                char1: annotation.type,
                            }, self.userid, true);
                        } catch (e) {
                            window.console.log('Error: ', e);
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
                    M.util.get_string('resume', 'ivplugin_contentbank'),
                    M.util.get_string('resumeconfirm', 'ivplugin_contentbank'),
                    M.util.get_string('resume', 'ivplugin_contentbank'),
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

    async getCompletionData(annotation, userid) {
        let logs = await this.getLogs(annotation, [userid]);
        let log = '';
        if (logs.length > 0) {
            log = JSON.parse(logs[0].text1);
        }
        annotation.displayoptions = 'popup';
        annotation.hascompletion = 0;
        annotation.completed = true;
        await this.renderViewer(annotation);
        this.renderContainer(annotation);
        this.applyContent(annotation, log);
        return log;
    }
}