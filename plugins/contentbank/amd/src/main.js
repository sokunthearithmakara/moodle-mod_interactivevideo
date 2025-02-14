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
        $(`#message[data-id='${annotation.id}']`).addClass('hascontentbank');
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
        if (annotation.completiontracking !== 'view') {
            let $completiontoggle = $message.find('#completiontoggle');
            $message.find('#title .info').remove();
            $completiontoggle.before(`<i class="bi bi-info-circle-fill mr-2 info" data-toggle="tooltip"
            data-container="#wrapper" data-trigger="hover"
            data-title="${M.util.get_string("completionon" + annotation.completiontracking, "mod_interactivevideo")}"></i>`);
            if (annotation.completed) {
                return;
            }
            setTimeout(function() {
                $message.find('[data-toggle="tooltip"]').tooltip('show');
            }, 1000);
            setTimeout(function() {
                $message.find('[data-toggle="tooltip"]').tooltip('hide');
            }, 3000);
        }
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
     * @returns {Promise<void>} - Returns a promise that resolves when the content is applied.
     * @override
     */
    async applyContent(annotation) {
        let self = this;
        let $message = $(`#message[data-id='${annotation.id}']`);
        // Remove .modal-dialog-centered class to avoid flickering when H5P content resizes.
        $message.removeClass('modal-dialog-centered');

        let annoid = annotation.id;

        const onPassFail = async(passed, time) => {
            let label = passed ? 'continue' : 'rewatch';
            $message.find('#content')
                .append(`<button class="btn btn-${passed ? 'success' : 'danger'} mt-2 btn-rounded"
                    id="passfail" data-timestamp="${time}"><i class="fa fa-${passed ? 'play' : 'redo'} mr-2"></i>
                ${M.util.get_string(label, 'ivplugin_contentbank')}
                </button>`);
            $message.find('iframe').addClass('no-pointer-events');
        };

        $(document).off('click', '#passfail').on('click', '#passfail', function(e) {
            e.preventDefault();
            let time = $(this).data('timestamp');
            self.dispatchEvent('interactionclose', {
                annotation: annotation,
            });
            self.player.seek(time);
            self.player.play();
            $(this).remove();
        });

        const xAPICheck = (annotation, listenToEvents = true) => {
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
                    if (!listenToEvents) {
                        return;
                    }
                    if (self.isEditMode()) {
                        $message.find(`#title .btns .xapi`).remove();
                        $message.find(`#title .btns`)
                            .prepend(`<div class="xapi alert-secondary px-2
                         rounded-pill">${M.util.get_string('xapicheck', 'ivplugin_contentbank')}</div>`);
                    }
                    let statements = [];
                    try {
                        H5P.externalDispatcher.on('xAPI', async function(event) {
                            if (event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                                || event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered') {
                                statements.push(event.data.statement);
                            }
                            if ((event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                                || event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered')
                                && event.data.statement.object.id.indexOf('subContentId') < 0) {
                                if (self.isEditMode()) {
                                    $(`#message[data-id='${annotation.id}'] #title .btns .xapi`).remove();
                                    $(`#message[data-id='${annotation.id}'] #title .btns`)
                                        .prepend(`<div class="xapi alert-success d-inline px-2 rounded-pill">
                                        <i class="fa fa-check mr-2"></i>
                                        ${M.util.get_string('xapieventdetected', 'ivplugin_h5pupload')}
                                        </div>`);
                                    const audio = new Audio(M.cfg.wwwroot + '/mod/interactivevideo/sounds/pop.mp3');
                                    audio.play();
                                    return;
                                }
                                let complete = false;
                                let textclass = '';
                                if (annotation.completiontracking == 'completepass'
                                    && event.data.statement.result && event.data.statement.result.score.scaled >= 0.5) {
                                    complete = true;
                                } else if (annotation.completiontracking == 'completefull'
                                    && event.data.statement.result && event.data.statement.result.score.scaled == 1) {
                                    complete = true;
                                } else if (annotation.completiontracking == 'complete') {
                                    complete = true;
                                }
                                if (event.data.statement.result.score.scaled < 0.5) {
                                    textclass = 'fa fa-check text-danger';
                                } else if (event.data.statement.result.score.scaled < 1) {
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
                                        details.xp = (event.data.statement.result.score.scaled * annotation.xp).toFixed(2);
                                    }
                                    details.duration = windowAnno.duration + (completeTime.getTime() - windowAnno.newstarttime);
                                    details.timecompleted = completeTime.getTime();
                                    const completiontime = completeTime.toLocaleString();
                                    let duration = self.formatTime(details.duration / 1000);
                                    details.reportView = `<span data-toggle="tooltip" data-html="true"
                     data-title='<span class="d-flex flex-column align-items-start"><span><i class="bi bi-calendar mr-2"></i>
                     ${completiontime}</span><span><i class="bi bi-stopwatch mr-2"></i>${duration}</span>
                     <span><i class="bi bi-list-check mr-2"></i>
                     ${event.data.statement.result.score.raw}/${event.data.statement.result.score.max}</span></span>'>
                     <i class="${textclass}"></i><br><span>${Number(details.xp)}</span></span>`;
                                    details.details = statements;
                                    self.toggleCompletion(annoid, 'mark-done', 'automatic', details);
                                }

                                if (annotation.text1 != '') {
                                    let condition = JSON.parse(annotation.text1);
                                    if (event.data.statement.result.score.scaled < 0.5) {
                                        if (condition.gotoonfailed == 1 && condition.forceonfailed != 1) {
                                            onPassFail(false, condition.timeonfailed);
                                        } else if (condition.gotoonfailed == 1 && condition.forceonfailed == 1) {
                                            setTimeout(function() {
                                                self.dispatchEvent('interactionclose', {
                                                    annotation: annotation,
                                                });
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
                                                self.dispatchEvent('interactionclose', {
                                                    annotation: annotation,
                                                });
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
        if (!self.cache[annotation.id] || self.isEditMode()) {
            self.cache[annotation.id] = await self.render(annotation);
        }
        const data = self.cache[annotation.id];

        $message.find(`.modal-body`).html(data).attr('id', 'content').fadeIn(300);
        if (annotation.hascompletion != 1 || self.isEditMode()) {
            return;
        }
        if (!annotation.completed && annotation.completiontracking == 'view') {
            self.completiononview(annotation);
        }
        xAPICheck(annotation, !annotation.completed && annotation.completiontracking != 'manual');
    }
}