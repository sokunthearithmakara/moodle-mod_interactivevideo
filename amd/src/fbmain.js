/**
 * Main AMD module for interactivevideo flexbook content type.
 *
 * @module     mod_interactivevideo/fbmain
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import Base from 'mod_flexbook/type/base';
import state from 'mod_flexbook/state';
import $ from 'jquery';
import ModalForm from 'core_form/modalform';
import {get_string as getString} from 'core/str';

/**
 * Show or hide the restart (end) screen; only one of d-flex / d-none is applied.
 *
 * @param {jQuery} $screen
 * @param {boolean} show
 */
const toggleRestartScreen = ($screen, show) => {
    if (show) {
        $screen.removeClass('d-none').addClass('d-flex');
    } else {
        $screen.removeClass('d-flex').addClass('d-none');
    }
};

export default class InteractiveVideo extends Base {

    /**
     * Apply content to the message container.
     *
     * @param {Object} annotation
     * @param {jQuery} $message
     * @param {boolean} isViewReport
     */
    async applyContent(annotation, $message = null, isViewReport = false) {
        const self = this;
        let data;

        if (!self.cache[annotation.id] || self.isEditMode()) {
            data = await self.render(annotation, 'json');
            self.cache[annotation.id] = data;
        } else {
            data = self.cache[annotation.id];
        }

        if ($message) {
            const $body = $message.find('.modal-body');

            // Clean up previous player.
            if (this['player_' + annotation.id]) {
                try {
                    this['player_' + annotation.id].destroy();
                } catch (e) {
                    // Ignore.
                }
            }

            const hideControls = annotation.intg1 == 1;
            const startTime = parseInt(annotation.char2 || 0);
            // Default to 10 hours if no end time is set or 0 (from the dnd).
            const endTime = (parseInt(annotation.char3 || 0) > 0) ? parseInt(annotation.char3 || 0) : 10 * 60 * 60;

            let url = data.url;
            let type = annotation.char1;

            $body.html(`<div id="video-wrapper" class="fb-interaction w-100 h-100 position-absolute p-0 bg-black">
                <div id="fbvideo-${annotation.id}" class="video-player w-100 h-100 position-absolute left-0 top-0"></div>
                <div class="video-block position-absolute top-0 left-0 w-100 h-100" data-annotation="${annotation.id}"
                    id="${annotation.id}"></div>
                <div id="restart-screen-${annotation.id}"
                    class="restart-screen position-absolute top-0 left-0 w-100 h-100 bg-black
                        align-items-center justify-content-center d-none"
                    style="z-index: 100;">
                    <button class="btn btn-lg btn-rounded btn-danger restart-video text-uppercase"
                     data-annotation="${annotation.id}">
                        <i class="bi bi-arrow-counterclockwise iv-mr-2 fs-25px"></i>
                        ${await getString('replay', 'mod_interactivevideo')}
                    </button>
                </div>
            </div>`);
            if (!hideControls) {
                $body.find('.video-block').hide();
            }
            $body.attr('id', 'content');
            $body.addClass('bg-black');

            $message.addClass('hasiframe');

            if (type == 'html5video') {
                // Replace the div with video.
                $body.find(`#fbvideo-${annotation.id}`)
                    .replaceWith(`<video id="fbvideo-${annotation.id}"
                        class="video-player w-100 h-100 position-absolute left-0 top-0"></video>`);
            }
            require(['mod_interactivevideo/player/' + type], (VP) => {
                const player = new VP();
                this['player_' + annotation.id] = player;
                player.load(url, startTime, endTime, {
                    node: `fbvideo-${annotation.id}`,
                    showControls: !hideControls,
                    autoplay: false,
                    preload: true,
                });
            });

            let timeInterval = null;
            const startTimeInterval = () => {
                if (timeInterval) {
                    clearInterval(timeInterval);
                }
                const id = self.isEditMode() || isViewReport ? annotation.id : state.currentanno.id;
                const player = self['player_' + id];
                if (!player) {
                    return;
                }
                timeInterval = setInterval(async() => {
                    try {
                        const currentTime = await player.getCurrentTime();

                        // Sync the current timestamp to interaction data for reliable saving on navigation.
                        if (state.interactionData && state.interactionData[id]) {
                            state.interactionData[id].timestamp = currentTime;
                        }

                        if (currentTime >= player.end) {
                            player.pause();
                            player.seek(player.start);
                            clearInterval(timeInterval);
                            toggleRestartScreen($body.find(`#restart-screen-${annotation.id}`), true);
                            $(document).trigger('iv:playerEnded.' + annotation.id);
                        }
                    } catch (err) {
                        window.console.log(err);
                    }
                }, 1000);
            };

            // Start timeInterval when playerPlay.
            $(document).off('iv:playerPlay.timeinterval').on('iv:playerPlay.timeinterval', () => {
                startTimeInterval();
            });

            // Stop timeInterval when playerPause.
            $(document).off('iv:playerPaused.timeinterval').on('iv:playerPaused.timeinterval', () => {
                clearInterval(timeInterval);
                timeInterval = null;
            });

            $(document).off('click', '.restart-video').on('click', '.restart-video', function(e) {
                e.preventDefault();
                const id = $(this).attr('data-annotation');
                const player = self['player_' + id];
                if (player) {
                    player.seek(startTime);
                    player.play();
                    toggleRestartScreen($(this).closest('.restart-screen'), false);
                }
            });

            $(document).off('click', '.video-block')
                .on('click', '.video-block', async function() {
                    const id = $(this).attr('data-annotation');
                    const player = self['player_' + id];
                    if (!player) {
                        return;
                    }
                    let isPaused = await player.isPaused();

                    if (isPaused == true || isPaused == undefined) {
                        player.play();
                    } else {
                        player.pause();
                    }
                });

            $(document).off('iv:playerReady.fbinteractivevideo').on('iv:playerReady.fbinteractivevideo', async(e) => {
                let id;
                if (self.isEditMode() || isViewReport) {
                    id = annotation.id;
                } else {
                    id = state.currentanno.id;
                }
                if (e.target.id != `fbvideo-${id}`) {
                    return;
                }
                const player = this['player_' + id];
                if (!player) {
                    return;
                }
                player.unMute();
                // Initialize the player visualizer for html5 audio.
                if (player.audio) {
                    $(`#fbvideo-${id}`).closest('#video-wrapper').addClass('audio');
                    player.visualizer();
                }

                if (self.isEditMode() || isViewReport) {
                    return;
                }

                // Interaction data for resumable state.
                let savedTime = 0;
                if (!state.interactionData) {
                    state.interactionData = {};
                }
                if (!state.interactionData[annotation.id]) {
                    state.interactionData[annotation.id] = {t: 0, v: 0, timestamp: 0};
                }
                savedTime = state.interactionData[annotation.id].timestamp || 0;
                if (savedTime > 0) {
                    try {
                        const duration = await player.getDuration();
                        if (duration > 0 && savedTime < (duration - 2)) {
                            player.seek(savedTime);
                        }
                    } catch (err) {
                        player.seek(savedTime);
                    }
                }
            });

            if (self.isEditMode() || isViewReport) {
                $(document).off('iv:playerEnded.fbinteractivevideo').on('iv:playerEnded.fbinteractivevideo', () => {
                    const id = annotation.id;
                    const player = this['player_' + id];
                    if (!player) {
                        return;
                    }
                    player.pause();
                    clearInterval(timeInterval);
                    toggleRestartScreen($body.find(`#restart-screen-${id}`), true);
                });
                return;
            }

            $(document).off('iv:playerEnded.fbinteractivevideo').on('iv:playerEnded.fbinteractivevideo', async(e) => {
                if (state.currentanno && e.target.id != `fbvideo-${state.currentanno.id}`) {
                    return;
                }
                e.stopImmediatePropagation();
                if (this._firingEnded === state.currentanno.id) {
                    return;
                }
                this._firingEnded = state.currentanno.id;
                const player = this['player_' + state.currentanno.id];
                if (!player) {
                    return;
                }

                clearInterval(timeInterval);
                timeInterval = null;
                if (state.interactionData && state.interactionData[state.currentanno.id]) {
                    try {
                        state.interactionData[state.currentanno.id].timestamp = player.start;
                    } catch (e) {
                        // Ignore.
                    }
                }
                annotation = state.currentanno;
                this.dispatchEvent('iv:complete');

                this.triggerCompletion(annotation);

                toggleRestartScreen($body.find(`#restart-screen-${state.currentanno.id}`), true);

                // Reset the guard after a short delay to allow future completions if the video is replayed.
                setTimeout(() => {
                    this._firingEnded = null;
                }, 2000);
            });

            // Event listeners for the player.
            $(document).off('iv:playerPaused.data').on('iv:playerPaused.data', async(e) => {
                if (state.currentanno && e.target.id != `fbvideo-${state.currentanno.id}`) {
                    return;
                }
                e.stopImmediatePropagation();
                const player = this['player_' + state.currentanno.id];
                if (!player) {
                    return;
                }
                if (state.interactionData && state.interactionData[state.currentanno.id]) {
                    try {
                        state.interactionData[state.currentanno.id].timestamp = await player.getCurrentTime();
                    } catch (e) {
                        // Ignore.
                    }
                }
            });

            // Pause video on interactionclose event.
            $(document).off('interactionclose.fbreplay-' + annotation.id)
                .on('interactionclose.fbreplay-' + annotation.id, async(e) => {
                    clearInterval(timeInterval);
                    if (e.detail.annotation.id != state.currentanno.id) {
                        return;
                    }
                    e.stopImmediatePropagation();
                    const player = this['player_' + state.currentanno.id];
                    if (player) {
                        try {
                            player.pause();
                        } catch (err) {
                            // Ignore.
                        }
                    }
                });

            $(document).off('interactionrun.fbreplay-' + annotation.id)
                .on('interactionrun.fbreplay-' + annotation.id, async() => {
                    clearInterval(timeInterval);
                    try {
                    this['player_' + state.currentanno.id]?.unMute();
                    } catch {
                        // Do nothing.
                    }
                });

            // Tab visibility change.
            const visibilityEvent = 'visibilitychange.fbvideo-' + annotation.id;
            $(document).off(visibilityEvent).on(visibilityEvent, async() => {
                const player = this['player_' + state.currentanno.id];
                if (document.hidden && player) {
                    try {
                        let isPaused = await player.isPaused();
                        if (!isPaused) {
                            player.pause();
                            if (state.interactionData && state.interactionData[state.currentanno.id]) {
                                state.interactionData[state.currentanno.id].timestamp = await player.getCurrentTime();
                            }
                        }
                    } catch (e) {
                        // Ignore.
                    }
                }
            });

            // Standard view completion.
            if (!annotation.completed) {
                if (annotation.completiontracking === 'view' || annotation.completiontracking === 'manual') {
                    this.completiononview(annotation);
                }
            }
        }
    }

    triggerCompletion(annotation) {
        if (annotation.completiontracking === 'complete' && !annotation.completed && !this.isEditMode()) {
            this.toggleCompletion(annotation.id, 'mark-done', 'automatic');
        }
    }

    async onEditFormLoaded(form) {
        let self = this;
        let getVideoInfo = await import('mod_interactivevideo/fb_util').then(m => m.getVideoInfo);

        const root = form.modal.getRoot();

        root.find('#video-url').val(root.find('[name="content"]').val());
        if (root.find('#video-url').val() != '') {
            setTimeout(() => {
                root.find('.play-video').trigger('click');
            }, 500);
        }

        let player;
        let totaltime = 0;
        $(document).off('click', '#video-info-form .play-video')
            .on('click', '#video-info-form .play-video', async function(e) {
                e.preventDefault();
                const url = $(this).closest('#video-info-form').find('#video-url').val();
                if (url == '') {
                    self.addNotification(M.util.get_string('videourlempty', 'mod_interactivevideo'));
                    return;
                }
                if (player) {
                    player.destroy();
                }
                let info = await getVideoInfo(url);
                if (info) {
                    root.find('[name="char1"]').val(info.type);
                    root.find('[name="content"]').val(url);
                    if (root.find('[name="char2"]').val() == 0 && root.find('[name="char3"]').val() == 0) {
                        root.find('[name="char2"]').val(0);
                        root.find('[name="char3"]').val(Math.round(info.duration));
                    }
                    player = info.player;
                    totaltime = Math.round(info.duration);
                } else {
                    self.addNotification(M.util.get_string('videourlinvalid', 'mod_interactivevideo'));
                }
            });

        root.find('#video-url').on('paste', function() {
            setTimeout(() => {
                root.find('.play-video').trigger('click');
            }, 500);
        });

        root.find('[name="char2"], [name="char3"]').on('contextmenu', async function(e) {
            if (player) {
                e.preventDefault();
                try {
                    const time = await player.getCurrentTime();
                    $(this).val(Math.round(time));
                } catch (err) {
                    // Ignore.
                }
            }
        });

        root.find('[name="char2"]').on('click', function(e) {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                $(this).val(0);
            }
        });

        root.find('[name="char3"]').on('click', async function(e) {
            if (!(e.ctrlKey || e.metaKey)) {
                return;
            }
            e.preventDefault();
            if (!player) {
                return;
            }
            try {
                let duration = totaltime;
                if (!duration && typeof player.getDuration === 'function') {
                    duration = await player.getDuration();
                }
                if (!duration) {
                    duration = player.totaltime || player.duration || 0;
                }
                $(this).val(Math.round(duration));
            } catch (err) {
                // Ignore.
            }
        });

        $(document).off('click', '.upload-video').on('click', '.upload-video', function(e) {
            e.preventDefault();
            let data = {
                contextid: M.cfg.contextid,
            };
            let form = new ModalForm({
                formClass: "mod_interactivevideo\\form\\flexbook_upload",
                args: data,
                modalConfig: {
                    title: M.util.get_string('uploadvideo', 'mod_interactivevideo'),
                }
            });

            form.show();

            form.addEventListener(form.events.FORM_SUBMITTED, (e) => {
                const response = e.detail;
                window.console.log(response);
                $(`#video-url`).val(response.url);
                $('[data-name="interaction-form"] [name="draftitemid"]').val(response.videofile);
                $('#video-info-form .play-video').trigger('click');
            });
        });
    }

    /**
     * Display the report view.
     *
     * @param {Object} annotation the annotation
     * @param {Array} tabledatajson the table data json
     * @param {Object} DataTable the data table
     * @param {jQuery} root the root element
     */
    async displayReportView(annotation, tabledatajson, DataTable, root) {
        const $message = root.find(`#message[data-id="${annotation.id}"]`);
        await this.applyContent(annotation, $message, true);
    }
}
