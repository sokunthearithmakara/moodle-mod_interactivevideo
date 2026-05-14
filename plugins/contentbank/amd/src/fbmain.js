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
        contentbankutil.setupEditForm(this, form);
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
     * Resizes the iframe within a modal body based on the height of the iframe content.
     *
     * @param {Object} annotation - The annotation object containing the id.
     */
    resizeIframe(annotation) {
        contentbankutil.resizeIframe(annotation);
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
                contentbankutil.initH5PIntegration(
                    self,
                    annotation,
                    $message,
                    log,
                    saveState,
                    state,
                    async(statement, H5PIntegration, id) => {
                    if (!self.isEditMode() && state.isMascotActive
                        && statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered') {
                        // Get the score result
                        let result = statement.result;
                        // Check if the score is greater than or equal to 0.5
                        if (result && result.success === true) {
                            // Dispatch iv:correct
                            self.dispatchEvent('iv:correct');
                        } else if (result && result.success === false) {
                            // Dispatch iv:incorrect
                            self.dispatchEvent('iv:incorrect');
                        }
                    }
                    if (annotation.completed) {
                        return;
                    }
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
                            details.details = saveState == 1 ? H5PIntegration.contents[id]
                                .contentUserData[0].state : '';
                            // Must wait 1.5 seconds or so to let the saveState finish.
                            // Otherwise, the completion will be incomplete.
                            setTimeout(function() {
                                self.toggleCompletion(annoid, 'mark-done', 'automatic', details);
                            }, 1500);
                        }

                        const advancedAction = safeParse(annotation.advanced, {});
                        if (result.score.scaled < 0.5) {
                            if (advancedAction.jumptofail) {
                                setTimeout(function() {
                                    state.navigateToAnnotation(advancedAction.jumptofail, true);
                                }, 1000);
                            }
                        } else {
                            if (advancedAction.jumptopass) {
                                setTimeout(function() {
                                    state.navigateToAnnotation(advancedAction.jumptopass, true);
                                }, 1000);
                            }
                        }
                    }
                });
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
        return contentbankutil.renderReportView(annotation, details, data, super.renderReportView.bind(this));
    }
}