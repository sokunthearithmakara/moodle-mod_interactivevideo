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
            let nameinput = $('input[name=name]');

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
                window.IVPLAYER = player;
                player.unMute();
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
                $("#videototaltime").text(
                    !player.live ? convertSecondsToHMS(totaltime) : await str.get_string('live', 'mod_interactivevideo'));
                if (player.live) {
                    // Read only.
                    startassistinput.prop('readonly', true);
                    endassistinput.prop('readonly', true);
                } else {
                    // Enable.
                    startassistinput.prop('readonly', false);
                    endassistinput.prop('readonly', false);
                }
                posterimage.val(player.posterImage);
            };

            $(document).on('iv:playerReady', '#player', function() {
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
                // Check if URL appears to be an HLS or DASH stream.
                if (url.includes('.m3u8') || url.includes('.mpd')) {
                    // First check if the file is accessible.
                    let video = document.createElement('video');
                    // For HLS (m3u8) and DASH (mpd), use appropriate MIME types.
                    let type = url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
                    // Check if the browser can play the stream type.
                    if (video.canPlayType(type)) {
                        resolve(true);
                    } else {
                        if (url.includes('.m3u8')) {
                            require(['mod_interactivevideo/player/hls'], function(Hls) {
                                if (Hls.isSupported()) {
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            });
                        } else if (url.includes('.mpd')) {
                            require(['mod_interactivevideo/player/dash'], function(dashjs) {
                                if (dashjs.MediaPlayer()) {
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            });
                        } else {
                            resolve(false);
                        }
                    }
                    return;
                }

                // Remove video element if it exists.
                const existingVideo = document.querySelector('video');
                if (existingVideo) {
                    existingVideo.remove();
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

            nameinput.on('contextmenu', function(e) {
                e.preventDefault();
                nameinput.val(player.title);
            });

            videourlinput.on('input', async function() {
                $('.noautoplay').remove();
                videourlinput.removeClass('is-invalid');
                videourlinput.next('.form-control-feedback').remove();
                let currenttype = videotype.val();
                videotype.val('');
                if (player) {
                    player.destroy();
                }
                videowrapper.html('<div id="player" style="width:100%; max-width: 100%"></div>');
                let url = $(this).val().trim();
                if (url == '') {
                    videowrapper.hide();
                    return;
                }

                let defaultLoadFunction = (type) => {
                    require(['mod_interactivevideo/player/' + type], function(VP) {
                        player = new VP();
                        player.load(url, 0, null, {
                            'showControls': true,
                            'preload': true,
                            'editform': true,
                        });
                    });
                };

                // YOUTUBE:: Check if the video is a youtube video.
                // e.g. https://www.youtube.com/watch?v={id}
                // e.g. https://www.youtube.com/embed/{id}
                // e.g. https://youtu.be/{id}
                // e.g. https://www.youtube-nocookie.com/embed/{id}
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
                        defaultLoadFunction('yt');
                        return;
                    }
                }

                // VIMEO:: Check if the video is from vimeo.
                // e.g. https://vimeo.com/*
                if (videotypes.includes('vimeo') || currenttype == 'vimeo') {
                    // VIMEO:: Extract id from the URL.
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com)\/([^/]+)/g;
                    let match = regex.exec(url);
                    let vid = match ? match[1] : null;
                    if (vid) {
                        videowrapper.html('<div id="player" class="w-100"></div>');
                        videotype.val('vimeo');
                        defaultLoadFunction('vimeo');
                        return;
                    }
                }

                // PANOPTO:: Check if the video is from panopto.
                // e.g. https://upenn.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=f4f968b2-eb20-4972-9ec1-ab7e01351489
                if (videotypes.includes('panopto') || currenttype == 'panopto') {
                    // Extract id from the URL.
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:[^\/]*panopto\.[^\/]+)\/Panopto\/.+\?id=([^/]+)/g;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        videotype.val('panopto');
                        defaultLoadFunction('panopto');
                        return;
                    }
                }

                // DAILYMOTION:: Check if the video is from daily motion.
                // e.g. https://www.dailymotion.com/video/x7zv7zv
                // e.g. https://dai.ly/x7zv7zv
                // e.g. https://www.dailymotion.com/embed/video/x7zv7zv
                if (videotypes.includes('dailymotion') || currenttype == 'dailymotion') {
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/]+)/g;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        // Show loader while the video is loading
                        videowrapper.html('<div id="player" class="w-100"></div>');
                        videotype.val('dailymotion');
                        defaultLoadFunction('dailymotion');
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
                        defaultLoadFunction('wistia');
                        return;
                    }
                }

                // RUMBLE:: Check if the video is from rumble.
                if (videotypes.includes('rumble') || currenttype == 'rumble') {
                    // Extract id from the URL https://rumble.com/{id}
                    let regex = /https:\/\/rumble.com\/([a-zA-Z0-9]+)/;
                    let match = regex.exec(url);
                    let videoId = match ? match[1] : null;
                    if (videoId) {
                        videowrapper.show();
                        videotype.val('rumble');
                        defaultLoadFunction('rumble');
                        return;
                    }
                }

                // SPROUTVIDEO:: Check if the video is from sproutvideo.
                if (videotypes.includes('sproutvideo') || currenttype == 'sproutvideo') {
                    // Extract id from the URL https://sproutvideo.com/videos/{id}
                    // or https://*.vids.io/videos/{id} where * is the subdomain.
                    // or https://videos.sproutvideo.com/embed/{id}

                    const regexSproutVideo =
                        /(?:https?:\/\/)?(?:[^.]+\.)*(?:sproutvideo\.com\/(?:videos|embed)|vids\.io\/videos)\/([^/]+)/;
                    let match = regexSproutVideo.exec(url);
                    const videoId = match ? match[1] : null;
                    if (videoId) {
                        videowrapper.show();
                        videotype.val('sproutvideo');
                        defaultLoadFunction('sproutvideo');
                        return;
                    }
                }

                // KINESCOPE:: Check if the video is from kinescope.
                if (videotypes.includes('kinescope') || currenttype == 'kinescope') {
                    // Sample video: https://kinescope.io/tLLFbwam97SS4F7V1rGB2T => https://kinescope.io/{id}
                    // Private video: https://kinescope.io/tLLFbwam97SS4F7V1rGB2T/plrMVe6Z => https://kinescope.io/{id}/{privateId}
                    let regex = /https:\/\/kinescope.io\/(.+)/;
                    let match = regex.exec(url);
                    let videoId = match ? match[1] : null;
                    if (videoId) {
                        videowrapper.show();
                        videotype.val('kinescope');
                        defaultLoadFunction('kinescope');
                        return;
                    }
                }

                // RUTUBE:: Check if the video is from rutube.
                if (videotypes.includes('rutube') || currenttype == 'rutube') {
                    // Extract id from the URL https://rutube.ru/video/{token}
                    // or https://rutube.ru/video/private/{token}
                    let regex = /https:\/\/rutube.ru\/video\/(?:private\/)?(.+)/;
                    let match = regex.exec(url);
                    let videoId = match ? match[1] : null;
                    if (videoId) {
                        videowrapper.show();
                        videotype.val('rutube');
                        defaultLoadFunction('rutube');
                        return;
                    }
                }

                // VIDEO URL:: Check if the link is a direct video link and video is "canplay".
                if (videotypes.includes('videolink') || currenttype == 'html5video') {
                    if (await checkVideo(url)) {
                        // Show loader while the video is loading.
                        videowrapper.html('<video id="player" class="w-100"></video>');
                        videotype.val('html5video');
                        defaultLoadFunction('html5video');
                        return;
                    }
                }

                // PEERTUBE:: Check if the link is a peertube link.
                // e.g. https://video.hardlimit.com/w/hFwjKHQa3ixivePeqGc4KR
                if (videotypes.includes('peertube') || currenttype == 'peertube') {
                    // Extract id from the URL https://video.hardlimit.com/w/{id}
                    let regex = /https:\/\/([^/]+)\/w\/([^/]+)/;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        videotype.val('peertube');
                        defaultLoadFunction('peertube');
                        return;
                    }
                }

                // Spotify:: Check if the link is a spotify link.
                // e.g. https://open.spotify.com/episode/7mmw9e0ecbX3SEjB1fudgL?si=oowc-dqOS8GEBtUAEyO23g
                if (videotypes.includes('spotify') || currenttype == 'spotify') {
                    let regex = /(?:https?:\/\/)?(?:open\.spotify\.com)\/(episode|track)\/([^/]+)/;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        videotype.val('spotify');
                        defaultLoadFunction('spotify');
                        return;
                    }
                }

                // Soundcloud:: Check if the link is a soundcloud link.
                // e.g. https://soundcloud.com/{username}/{trackname}
                if (videotypes.includes('soundcloud') || currenttype == 'soundcloud') {
                    let regex = /(?:https?:\/\/)?(?:www\.)?(?:soundcloud\.com)\/([^/]+)\/([^/]+)/;
                    let match = regex.exec(url);
                    if (match) {
                        videowrapper.show();
                        videotype.val('soundcloud');
                        defaultLoadFunction('soundcloud');
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


            // Ctrl/Command click on the startassistinput to reset the start time to 0.
            startassistinput.on('click', function(e) {
                if (e.ctrlKey || e.metaKey) {
                    startinput.val(0);
                    startassistinput.val('00:00:00.00');
                }
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

            // Ctrl/Command click on the endassistinput to reset the end time to total time.
            endassistinput.on('click', function(e) {
                if (e.ctrlKey || e.metaKey) {
                    endinput.val(totaltime);
                    endassistinput.val(convertSecondsToHMS(totaltime));
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

            // Right click on the assistinput to enter the current time.
            $(document).on('contextmenu', '[data-timestamp]', async function(e) {
                e.preventDefault();
                const currentTime = await player.getCurrentTime();
                $(this).val(convertSecondsToHMS(currentTime));
                $(this).trigger('change');
            });

            $(document).on('click', '.showmore', function(e) {
                e.preventDefault();
                $('#instructions-text .clamp-2').removeClass('clamp-2');
            });

            $(document).on('click', '.showless', function(e) {
                e.preventDefault();
                $('#instructions-text > div').addClass('clamp-2');
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
                        player = new VP();
                        player.load(url, 0, null, {
                            'showControls': true,
                            'editform': true,
                        });
                    });
                    videoinput.val(e.detail.video);
                    videotype.val('html5video');
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
                            player = new VP();
                            player.load(url, 0, null, {
                                'showControls': true,
                                'editform': true,
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

                // Initialize the methods required by other plugins that extend this plugin.
                let $requirejsElements = $('.requirejs');
                if ($requirejsElements.length) {
                    $requirejsElements.each(function() {
                        let $this = $(this);
                        require([$this.data('plugin')], function(Module) {
                            let module = new Module();
                            module.mform();
                        });
                    });
                }
            });

            startassistinput.val(convertSecondsToHMS(startinput.val()));
            endassistinput.val(convertSecondsToHMS(endinput.val()));

        }
    };
});