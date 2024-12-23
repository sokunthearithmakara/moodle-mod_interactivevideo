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
 * Interactive Video module form
 *
 * @module     mod_interactivevideo/mod_form
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery', 'core/notification', 'core_form/modalform', 'core/str'], function($, notification, ModalForm, str) {
    return {
        /**
         * Init function on page loads.
         * @param {Number} id module id
         * @param {Number} usercontextid user context id
         * @param {String} videotypes allowed video types
         */
        'init': function(id, usercontextid, videotypes) {
            let totaltime, player;
            let videowrapper = $('#video-wrapper');
            let endinput = $('input[name=endtime]');
            let startinput = $('input[name=starttime]');
            let startassistinput = $('input[name=startassist]');
            let endassistinput = $('input[name=endassist]');
            let totaltimeinput = $('input[name=totaltime]');
            let videourlinput = $('input[name=videourl]');
            let sourceinput = $('input[name=source]');
            let videoinput = $('input[name=video]');
            let uploadfield = $("#fitem_id_upload");
            let deletefield = $("#fitem_id_delete");
            let videofile = $('input[name=videofile]');
            let videotype = $('input[name=type]');
            let posterimage = $('input[name=posterimage]');

            /**
             * Format seconds to HH:MM:SS.
             * @param {Number} s seconds
             * @returns
             */
            const convertSecondsToHMS = (s) => {
                let hours = Math.floor(s / 3600);
                let minutes = Math.floor((s - (hours * 3600)) / 60);
                let seconds = s - (hours * 3600) - (minutes * 60);
                seconds = seconds.toFixed(2);
                let result = (hours < 10 ? "0" + hours : hours);
                result += ":" + (minutes < 10 ? "0" + minutes : minutes);
                result += ":" + (seconds < 10 ? "0" + seconds : seconds);
                return result;
            };

            /**
             * Scripts to run when the player is ready.
             */
            const whenPlayerReady = async function() {
                if (player.audio) {
                    videowrapper.addClass('audio');
                }
                videowrapper.show();
                // Recalculate the ratio of the video.
                let ratio = player.aspectratio;
                if (ratio < 1) {
                    ratio = 1;
                }
                $("#video-wrapper").css('padding-bottom', (1 / ratio) * 100 + '%');

                if ($(`[name="name"]`).val() == '') {
                    $(`[name="name"]`).val(player.title);
                }

                const duration = player.totaltime;
                totaltime = duration;
                totaltimeinput.val(totaltime);
                if (Number(endinput.val()) > 0 && Number(endinput.val()) > totaltime) {
                    endinput.val(totaltime);
                    endassistinput.val(convertSecondsToHMS(totaltime));
                }

                if (Number(startinput.val()) > 0 && Number(startinput.val()) > totaltime) {
                    startinput.val(0);
                    startassistinput.val('00:00:00.00');
                }

                if (endassistinput.val() == '00:00:00.00' || endassistinput.val() == '') {
                    endassistinput.val(convertSecondsToHMS(totaltime));
                    endinput.val(totaltime);
                }
                $("#videototaltime").text("<= " + convertSecondsToHMS(totaltime));
                posterimage.val(player.posterImage);
            };

            $(document).on('iv:playerReady', function() {
                whenPlayerReady();
            });

            $(document).on('iv:playerError', async function() {
                let strings = await str.get_strings([
                    {key: 'thereisanissueloadingvideo', component: 'mod_interactivevideo'},
                ]);
                videourlinput.addClass('is-invalid');
                videourlinput.after('<div class="form-control-feedback invalid-feedback d-inline">'
                    + strings[0] + '</div>');
            });

            const checkVideo = (url) => new Promise((resolve) => {
                // Remove video element if it exists.
                if (document.querySelector('video')) {
                    document.querySelector('video').remove();
                }
                let video = document.createElement('video');
                video.src = url;
                video.addEventListener('canplay', function() {
                    resolve(true);
                });

                video.addEventListener('error', function() {
                    resolve(false);
                });
            });

            videourlinput.on('input', async function() {
                videourlinput.removeClass('is-invalid');
                videourlinput.next('.form-control-feedback').remove();
                let currenttype = videotype.val();
                videotype.val('');
                if (player) {
                    player.destroy();
                }
                let url = $(this).val().trim();
                if (url == '') {
                    videowrapper.hide();
                    return;
                }

                // YOUTUBE:: Check if the video is a youtube video.
                if (videotypes.includes('yt') || currenttype == 'yt') {
                    let regex = new RegExp(
                        '(?:https?:\\/\\/)?' +
                        '(?:www\\.)?' +
                        '(?:youtube\\.com|youtu\\.be|youtube-nocookie\\.com)' +
                        '(?:\\/embed\\/|\\/watch\\?v=|\\/)([^\\/]+)',
                        'g'
                    );
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        // Show loader while the video is loading.
                        videowrapper.html('<div id="player" class="w-100"></div>');
                        videotype.val('yt');
                        require(['mod_interactivevideo/player/yt'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true,
                                'preload': true
                            });
                        });
                        return;
                    }
                }

                if (videotypes.includes('vimeo') || currenttype == 'vimeo') {
                    // VIMEO:: Extract id from the URL.
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com)\/(?:channels\/[A-Za-z0-9]+\/|)([^/]+)/g;
                    let match = regex.exec(url);
                    let vid = match ? match[1] : null;
                    if (vid) {
                        url = 'https://vimeo.com/' + vid;
                        videourlinput.val(url);
                        videowrapper.html('<div id="player" class="w-100"></div>');
                        videotype.val('vimeo');
                        require(['mod_interactivevideo/player/vimeo'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true,
                            });
                        });
                        return;
                    }
                }

                // DAILYMOTION:: Check if the video is from daily motion.
                if (videotypes.includes('dailymotion') || currenttype == 'dailymotion') {
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/]+)/g;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        // Show loader while the video is loading
                        videowrapper.html('<div id="player" class="w-100"></div>');
                        videotype.val('dailymotion');
                        require(['mod_interactivevideo/player/dailymotion'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true,
                                'preload': true
                            });
                        });
                        return;
                    }
                }

                // WISTIA:: Check if the video is from wistia e.g. https://sokunthearithmakara.wistia.com/medias/kojs3bi9bf.
                if (videotypes.includes('wistia') || currenttype == 'wistia') {
                    const regexWistia = /(?:https?:\/\/)?(?:www\.)?(?:wistia\.com)\/medias\/([^/]+)/g;
                    let match = regexWistia.exec(url);
                    const mediaId = match ? match[1] : null;
                    if (mediaId) {
                        videowrapper.show();
                        videotype.val('wistia');
                        require(['mod_interactivevideo/player/wistia'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true,
                            });
                        });
                        return;
                    }
                }

                // VIDEO URL:: Check if the link is a direct video link and video is "canplay".
                if (videotypes.includes('videolink') || currenttype == 'html5video') {
                    if (await checkVideo(url)) {
                        // Show loader while the video is loading.
                        videowrapper.html('<video id="player" class="w-100"></video>');
                        videotype.val('html5video');
                        require(['mod_interactivevideo/player/html5video'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true
                            });
                        });
                        return;
                    }
                }

                // Invalid video url.
                const strings = await str.get_strings([
                    {key: 'invalidvideourl', component: 'mod_interactivevideo'},
                    {key: 'error', component: 'core'}
                ]);
                notification.alert(strings[1], strings[0]);
                videourlinput.val('').addClass('is-invalid');
                videowrapper.hide();
            });

            startassistinput.on('change blur', async function() {
                startassistinput.removeClass('is-invalid');
                startassistinput.next('.form-control-feedback').remove();
                if (startassistinput.val() == '') {
                    return;
                }
                let strings = await str.get_strings([
                    {key: 'starttimelesstotaltime', component: 'mod_interactivevideo'},
                    {key: 'starttimelessthanendtime', component: 'mod_interactivevideo'},
                    {key: 'invalidtimestampformat', component: 'mod_interactivevideo'},
                ]);
                const parts = startassistinput.val().split(':');
                let time = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                startinput.val(time.toFixed(2));
                if (Number(startinput.val()) > totaltime) {
                    startassistinput.addClass('is-invalid');
                    startassistinput.next('.form-control-feedback').remove();
                    startassistinput.after('<div class="form-control-feedback invalid-feedback d-inline">'
                        + strings[0] + '</div>');
                    startassistinput.val(convertSecondsToHMS(totaltime));
                } else {
                    if (Number(endinput.val()) && Number(endinput.val()) != 0
                        && Number(startinput.val()) > Number(endinput.val())) {
                        startassistinput.addClass('is-invalid');
                        startassistinput.next('.form-control-feedback').remove();
                        startassistinput.after('<div class="form-control-feedback invalid-feedback d-inline">'
                            + strings[1] + '</div>');
                        startassistinput.val(convertSecondsToHMS(endinput.val()));
                    } else if (Number(startinput.val()) >= Number(endinput.val())) {
                        endassistinput.val(convertSecondsToHMS(0));
                    }
                }
            });

            endassistinput.on('change blur', async function() {
                endassistinput.removeClass('is-invalid');
                endassistinput.next('.invalid-feedback').remove();
                if (endassistinput.val() == '') {
                    return;
                }
                const strings = await str.get_strings([
                    {key: 'endtimelesstotaltime', component: 'mod_interactivevideo'},
                    {key: 'endtimegreaterstarttime', component: 'mod_interactivevideo'},
                    {key: 'invalidtimestampformat', component: 'mod_interactivevideo'},
                ]);
                const parts = endassistinput.val().split(':');
                let time = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                endinput.val(time.toFixed(2));
                if (Number(endinput.val()) > totaltime) {
                    endassistinput.addClass('is-invalid');
                    endassistinput.next('.invalid-feedback').remove();
                    endassistinput.after('<div class="form-control-feedback invalid-feedback d-inline">'
                        + strings[0] + '</div>');
                    endassistinput.val(convertSecondsToHMS(totaltime));
                } else {
                    if (Number(startinput.val()) && Number(endinput.val()) < Number(startinput.val())) {
                        endassistinput.addClass('is-invalid');
                        endassistinput.next('.invalid-feedback').remove();
                        endassistinput.after('<div class="form-control-feedback invalid-feedback d-inline">'
                            + strings[1] + '</div>');
                        endassistinput.val(convertSecondsToHMS(startinput.val()));
                    } else if (Number(startinput.val()) >= Number(endinput.val())) {
                        endassistinput.val(convertSecondsToHMS(totaltime));
                    }
                }
            });

            // Upload video to get draft item id.
            $(document).on('click', '#id_upload', async function() {
                const data = {
                    contextid: M.cfg.contextid,
                    id: id,
                    usercontextid: usercontextid,
                };

                let string = await str.get_string('uploadvideo', 'mod_interactivevideo');
                const form = new ModalForm({
                    modalConfig: {
                        title: string,
                    },
                    formClass: "mod_interactivevideo\\form\\video_upload_form",
                    args: data,
                });

                form.show();

                form.addEventListener(form.events.FORM_SUBMITTED, async(e) => {
                    const url = e.detail.url;
                    videofile.val(url);
                    let name = e.detail.name;
                    if ($(`[name="name"]`).val() == '') {
                        $(`[name="name"]`).val(name.split('.').slice(0, -1).join('.'));
                    }
                    videowrapper.html('<video id="player" class="w-100"></video>');
                    require(['mod_interactivevideo/player/html5video'], function(VP) {
                        player = new VP(url, 0, null, {
                            'showControls': true
                        });
                    });
                    videoinput.val(e.detail.video);
                    uploadfield.hide();
                    deletefield.show();
                });
            });

            $(document).on('change', '#id_source', function() {
                if ($(this).val() == 'file') {
                    if (videoinput.val() == '' || videoinput.val() == '0') {
                        uploadfield.show();
                        deletefield.hide();
                    } else {
                        uploadfield.hide();
                        deletefield.show();
                    }
                } else {
                    uploadfield.hide();
                    deletefield.hide();
                }
            });

            $(document).on('click', '#id_delete', async function() {
                const strings = await str.get_strings([
                    {key: 'deletevideo', component: 'mod_interactivevideo'},
                    {key: 'deletevideoconfirm', component: 'mod_interactivevideo'},
                    {key: 'delete', component: 'mod_interactivevideo'},
                ]);
                try {
                    notification.deleteCancelPromise(
                        strings[0],
                        strings[1],
                        strings[2],
                    ).then(() => {
                        videoinput.val('');
                        videofile.val('');
                        videowrapper.empty().hide();
                        uploadfield.show();
                        deletefield.hide();
                        return;
                    }).catch(() => {
                        return;
                    });
                } catch {
                    notification.saveCancel(
                        strings[0],
                        strings[1],
                        strings[2],
                        function() {
                            videoinput.val('');
                            videofile.val('');
                            videowrapper.empty().hide();
                            uploadfield.show();
                            deletefield.hide();
                        }
                    );
                }
            });

            // DOM ready.
            $(function() {
                uploadfield.hide();
                deletefield.hide();
                if (videourlinput.val() != '') {
                    videourlinput.trigger('input');
                }
                if (sourceinput.val() != 'url') {
                    if (videoinput.val() != '' && videoinput.val() != '0') {
                        uploadfield.hide();
                        deletefield.show();
                        const url = videofile.val();
                        videowrapper.html('<video id="player" class="w-100"></video>');
                        require(['mod_interactivevideo/player/html5video'], function(VP) {
                            player = new VP(url, 0, null, {
                                'showControls': true
                            });
                        });
                    } else {
                        uploadfield.show();
                        deletefield.hide();
                    }
                }
                // Display warning message if the completion is not unlocked.
                if ($('[name=completionunlocked]').val() == '0') {
                    $('#warning').removeClass('d-none');
                    $('[name=videourl], [name=startassist], [name=endassist]').prop('readonly', 'true');
                    $('#fitem_id_source, #fitem_id_delete, #fitem_id_upload').hide();
                    $('#id_upload').prop('disabled', 'true');
                    $('#id_delete').prop('disabled', 'true');
                }

                $('#background-loading').fadeOut(300);
            });

            startassistinput.val(convertSecondsToHMS(startinput.val()));
            endassistinput.val(convertSecondsToHMS(endinput.val()));

        }
    };
});