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
 * Edit interactions module
 *
 * @module     mod_interactivevideo/editannotation
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['jquery',
    'core/toast',
    'core/notification',
    'core/event_dispatcher',
    './quickform',
    'core/modal_factory',
    'core/modal_events',
    './libraries/jquery-ui',
], function($, addToast, Notification, {dispatchEvent}, quickform, ModalFactory, ModalEvents) {
    let ctRenderer = {};
    let player;
    let totaltime;
    let currentTime;
    let playerReady = false;
    const isRTL = $('html').attr('dir') == 'rtl';
    const isBS5 = $('body').hasClass('bs-5');
    const bsAffix = isBS5 ? '-bs' : '';
    let $loader = $('#background-loading');
    let $progressbar = $('#video-nav #progress');
    let $scrollbar = $('#scrollbar');
    let $scrollhead = $('#scrollhead-top');
    let $videonav = $('#video-nav');
    /**
     * Replace the progress bar on the video navigation.
     * @param {Number} percentage - Percentage to replace the progress bar.
     * @returns {void}
     * */
    const replaceProgressBars = (percentage) => {
        percentage = percentage < 0 ? 0 : percentage;
        percentage = percentage > 100 ? 100 : percentage;
        $progressbar.css('width', percentage + '%');
        $scrollbar.css('left', percentage + '%');
        $scrollhead.css('left', percentage + '%');
    };
    /**
     * Render the annotations on the video navigation.
     * @param {Array} annos - Annotations to render.
     * @param {Number} start - Start time of the video.
     * @param {Number} totaltime - Total time of the video.
     * @returns {void}
     * */
    const renderVideoNav = async function(annos, start, totaltime) {
        if (annos.length == 0) {
            $videonav.find('ul').empty();
            return;
        }

        $videonav.find('ul').empty();
        $("#video-timeline-wrapper .skipsegment").remove();
        annos.forEach(async(x) => {
            const render = ctRenderer[x.type];
            await render.renderItemOnVideoNavigation(x);
        });

        const time = await player.getCurrentTime();
        // Replace progress bar.
        const percentage = (time - start) / totaltime * 100;
        replaceProgressBars(percentage);
        dispatchEvent('annotationitemsrendered', {'annotations': annos});
    };

    return {
        /**
         * Initialize function on page loads.
         * @param {String} url video url
         * @param {Number} coursemodule cm id
         * @param {Number} interaction cm instance
         * @param {Number} course course id
         * @param {Number} start video start time
         * @param {Number} end video end time
         * @param {Number} coursecontextid course context id
         * @param {String} type video type
         * @param {Object} displayoptions display options
         * @param {Number} userid user id
         * @param {String} posterimage poster image
         * @param {String} extendedcompletion extended completion
         */
        init: function(url, coursemodule, interaction, course, start, end, coursecontextid,
            type = 'yt', displayoptions, userid, posterimage, extendedcompletion) {

            let $videonav = $('#video-nav');
            let $videotimeline = $('#video-timeline');
            let $annotationlist = $('#annotation-list');
            let $annotationcanvas = $('#annotation-canvas');
            let $timelinewrapper = $('#timeline-wrapper');
            let $videowrapper = $('#video-wrapper');
            let $playpause = $('#playpause');
            let $timelineitemswrapper = $('#timeline-items-wrapper');
            let $addcontent = $('#addcontent');

            quickform();

            require(['theme_boost/bootstrap/modal']);
            require(['theme_boost/bootstrap/tooltip']);
            /**
             * Util function to display notification
             * @param {String} msg message text
             * @param {String} type message type
             */
            const addNotification = (msg, type = "info") => {
                addToast.add(msg, {
                    type: type
                });
            };

            start = Number(start);
            if (isNaN(start)) {
                start = 0;
            }

            end = Number(end);
            if (isNaN(end)) {
                end = null;
            }

            let annotations = []; // Annotations.
            let contentTypes; // Content types.

            /**
             * Convert seconds to HH:MM:SS format
             * @param {Number} s second
             * @param {Boolean} dynamic if true, only show minutes and seconds if less than one hour
             * @param {Boolean} rounded if true, second is rounded
             * @returns formatted timestamp
             */
            const convertSecondsToHMS = (s, dynamic = false, rounded = true) => {
                if (rounded) {
                    s = Math.round(s);
                }
                let hours = Math.floor(s / 3600);
                let minutes = Math.floor((s - hours * 3600) / 60);
                let seconds = s - hours * 3600 - minutes * 60;
                if (rounded && seconds > 59.5) {
                    seconds = 0;
                    minutes++;
                    if (minutes > 59) {
                        minutes = 0;
                        hours++;
                    }
                }
                if (minutes < 10) {
                    minutes = '0' + minutes;
                }

                if (rounded) {
                    seconds = Math.round(seconds);
                } else {
                    seconds = parseFloat(seconds).toFixed(2);
                }

                if (seconds < 10) {
                    seconds = '0' + seconds;
                }

                if (dynamic && hours == 0) {
                    return minutes + ':' + seconds;
                }

                return (hours < 10 ? '0' + hours : hours) + ':' + minutes + ':' + seconds;
            };

            let activeid = null; // Current active annotation id. Mainly used when editing to relaunch the interaction afte editing.

            /**
             * Handle rendering of annotation items on the list
             * @param {Array} annotations array of annotation objects
             * @returns
             */
            const renderAnnotationItems = (annotations) => {
                $('#annotationwrapper .loader').remove();
                $annotationlist.empty().removeClass("d-flex align-items-center justify-content-center");
                if (player.live) {
                    $timelinewrapper.addClass('no-pointer-events');
                    $annotationlist.html(
                        `${M.util.get_string('interactionsnotsupportedonlivevideo', 'mod_interactivevideo')}`)
                        .addClass("d-flex align-items-center justify-content-center");
                    return;
                }
                renderVideoNav(annotations, start, totaltime);
                if (annotations.length == 0) {
                    $annotationlist.html(`${M.util.get_string('clickaddtoaddinteraction', 'mod_interactivevideo')}`)
                        .addClass("d-flex align-items-center justify-content-center");
                    return;
                }
                annotations.sort(function(a, b) {
                    // First sort by timestamp, then by type.
                    if (Number(a.timestamp) === Number(b.timestamp)) {
                        return String(a.type).localeCompare(String(b.type));
                    }
                    // Sort by timestamp.
                    return Number(a.timestamp) - Number(b.timestamp);
                });

                annotations.forEach(function(item) {
                    let listItem = $('#annotation-template').clone();
                    ctRenderer[item.type].renderEditItem(annotations, listItem, item);
                });

                let xp = annotations.filter(x => x.xp).map(x => Number(x.xp)).reduce((a, b) => a + b, 0);
                $("#xp span").text(xp);

                if (activeid) {
                    const activeAnno = annotations.find(x => x.id == activeid);
                    if (activeAnno) {
                        ctRenderer[activeAnno.type].postEditCallback(activeAnno);
                    }
                }
            };

            /**
             * Get annotations from the server and execute the rendering function
             * @returns
             */
            const getAnnotations = () => {
                const getItems = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_items',
                        sesskey: M.cfg.sesskey,
                        id: interaction,
                        contextid: M.cfg.contextid,
                        coursecontextid: M.cfg.courseContextId
                    }
                });

                const getContentTypes = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_all_contenttypes',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        coursecontextid: M.cfg.courseContextId
                    }
                });

                $.when(getItems, getContentTypes).done(async function(items, contenttypes) {
                    annotations = JSON.parse(items[0]);
                    if (player.live) {
                        annotations = [];
                    }
                    contentTypes = JSON.parse(contenttypes[0]);
                    // Remove all annotations that are not in the enabled content types.
                    annotations = annotations.filter(x => contentTypes.find(y => y.name === x.type));
                    const getRenderers = new Promise((resolve) => {
                        let count = 0;
                        contentTypes.forEach(x => {
                            require(['' + x.amdmodule], function(Type) {
                                ctRenderer[x.name] = new Type(player, annotations, interaction,
                                    course, 0, 0, 0, 0, type, 0, totaltime, start, end, x, coursemodule,
                                    null, displayoptions, null, extendedcompletion, {
                                    isEditMode: true,
                                });
                                count++;
                                ctRenderer[x.name].init();
                                if (count == contentTypes.length) {
                                    resolve(ctRenderer);
                                }
                            });
                        });
                    });
                    annotations.map(x => {
                        let prop = contentTypes.find(y => y.name === x.type);
                        // Clean up the prop by removing author, authorlink, description;
                        delete prop.author;
                        delete prop.authorlink;
                        delete prop.description;
                        x.prop = JSON.stringify(prop);
                        x.editMode = true;
                        return x;
                    });
                    ctRenderer = await getRenderers;
                    renderAnnotationItems(annotations);
                });
            };

            /**
             * Validate given timestamp against format
             * @param {String} timestamp formatted timestamp hh:mm:ss
             * @param {String} fld field selector
             * @param {String} existing existing value
             * @returns
             */
            const validateTimestampFormat = (timestamp, fld, existing) => {
                const regex = /^([0-9]{2}):([0-5][0-9]):([0-5][0-9])(\.\d{2})?$/;
                if (!regex.test(timestamp)) {
                    addNotification(M.util.get_string('invalidtimestampformat', 'mod_interactivevideo'), 'danger');
                    if (existing) {
                        $(fld).val(existing);
                    } else {
                        $(fld).val(convertSecondsToHMS(start, false, false));
                    }
                    return false;
                }
                return true;
            };

            /**
             * Validate timestamp against start and end time of the video, existing timestamp and skip segments
             * @param {String} timestamp formatted timestamp
             * @param {String} fld field selector
             * @param {String} existing existing value
             * @param {Number} seconds
             * @param {Boolean} checkduration if true, check against start and end time
             * @param {Boolean} checkexisting if true, check against existing annotations
             * @param {Boolean} checkskipsegment if true, check against skip segments
             * @returns
             */
            const validateTimeStartEnd = (timestamp, fld, existing, seconds, checkduration,
                checkexisting, checkskipsegment) => {
                // Convert the timestamp to seconds.
                const parts = timestamp.split(':');
                timestamp = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                // Make sure the timestamp is between start and end.
                if (checkduration) {
                    if (timestamp > end || timestamp < start) {
                        const message = M.util.get_string('timemustbebetweenstartandendtime', 'mod_interactivevideo', {
                            "start": convertSecondsToHMS(start, true, false),
                            "end": convertSecondsToHMS(end, true, false)
                        });
                        addNotification(message, 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start, false, false));
                        }
                        return -1;
                    }
                }

                // Make sure the timestamp is not already in the list.
                if (checkexisting) {
                    if (annotations.find(x => x.timestamp == timestamp) && timestamp != seconds) {
                        addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start, false, false));
                        }
                        return -1;
                    }
                }

                // Make sure timestamp is not in a skip segment.
                if (checkskipsegment) {
                    const skipsegments = annotations.filter((annotation) => annotation.type == 'skipsegment');
                    const skip = skipsegments.find(x => Number(x.timestamp) < Number(timestamp)
                        && Number(x.title) > Number(timestamp));
                    if (skip) {
                        addNotification(M.util.get_string('interactionisbetweentheskipsegment', 'mod_interactivevideo', {
                            "start": convertSecondsToHMS(skip.timestamp, true, false),
                            "end": convertSecondsToHMS(skip.title, true, false)
                        }), 'danger');
                        if (existing) {
                            $(fld).val(existing);
                        } else {
                            $(fld).val(convertSecondsToHMS(start, false, false));
                        }
                        return -1;
                    }
                }

                return timestamp;
            };

            /**
             * Run interaction
             * @param {Object} annotation annotation object
             */
            const runInteraction = (annotation) => {
                // Remove the previous message but keep the one below the video.
                $('#annotation-modal').modal('hide');
                $('#message').not('[data-placement=bottom]').not('.sticky').remove();
                $('#end-screen').remove();
                player.pause();
                const activityType = ctRenderer[annotation.type];
                activityType.runInteraction(annotation);
            };

            /**
             * Correct the start and end time.
             * @param {Number} duration Total duration of the video.
             * @returns {Object} Object containing start and end time.
             */
            const updateTime = async(duration) => {
                duration = Number(duration);
                let toUpdatetime = false;
                if (!end || end == 0) {
                    toUpdatetime = true;
                }
                if (!start || start >= duration || start < 0 || start >= duration) {
                    toUpdatetime = true;
                }
                start = start > duration ? 0 : start;
                if (toUpdatetime) {
                    await $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'update_videotime',
                            sesskey: M.cfg.sesskey,
                            cmid: coursemodule,
                            courseid: course,
                            id: interaction,
                            start: start,
                            end: !end || end == 0 ? duration : end,
                            contextid: M.cfg.contextid
                        }
                    });
                }
                end = !end || end == 0 || end > duration ? duration : end;
                return {start, end};
            };

            /**
             * Set of events to run after the video player is ready.
             */
            const onReady = async() => {
                if (player.live) {
                    end = Number.MAX_SAFE_INTEGER;
                }
                if (player.type != 'yt') {
                    player.pause();
                }
                const isPaused = await player.isPaused();
                if (!isPaused) {
                    if (!player.live) {
                        await player.seek(start);
                    }
                    player.pause();
                    onReady();
                    return;
                }
                player.unMute();
                if (player.audio) {
                    $annotationcanvas.addClass('bg-black');
                }
                if (displayoptions.passwordprotected == 1) {
                    // Remove start screen, set .video-block to d-none, #annotation-canvas remove d-none.
                    $('#start-screen').removeClass('d-none');
                    $('#video-block').removeClass('no-pointer bg-transparent');
                }
                if (player.type != 'vimeo'
                    && player.type != 'html5video'
                    && player.type != 'panopto'
                    && player.type != "peertube"
                    && player.type != "rutube") { // Vimeo/HTML5 does not pause/play on click.
                    $('#video-block').addClass('no-pointer');
                }

                if (player.support.playbackrate == false) {
                    $('#changerate').remove();
                } else {
                    $('#changerate').removeClass('d-none');
                }

                if (player.support.quality == false) {
                    $('#changequality').remove();
                } else {
                    $('#changequality').removeClass('d-none');
                }

                let t = player.totaltime;

                ({start, end} = await updateTime(t));

                totaltime = end - start;
                // Recalculate the ratio of the video.
                let ratio = 16 / 9;
                if (!displayoptions.usefixedratio || displayoptions.usefixedratio == 0) {
                    ratio = player.aspectratio;
                }
                $videowrapper.css('padding-bottom', (1 / ratio) * 100 + '%');

                playerReady = true;
                $annotationcanvas.removeClass('d-none w-0');

                // Handle timeline block.
                $videotimeline.css({
                    'background-image': 'url(' + posterimage + ')',
                    'background-size': 'contain',
                    'background-repeat': 'no-repeat',
                });
                $timelinewrapper.find('#duration').text(convertSecondsToHMS(end, true));
                $timelinewrapper.find('#currenttime').text(convertSecondsToHMS(start, true));

                // Render minute markers.
                const minutes = Math.floor(totaltime / 60);
                $timelineitemswrapper.css('width', (minutes * 300) + 'px'); // 300px per minute as default.
                const relWidth = $('#timeline-items').width();
                $('#minute-markers, #minute-markers-bg, #vseek').css('width', relWidth + 'px');
                let startPercentage = 0;
                let newStart = start;
                if (start % 60 != 0) {
                    startPercentage = (60 - (start % 60)) / totaltime * 100;
                    newStart = start + (60 - (start % 60));
                    $('#minute-markers, #minute-markers-bg').append(`<div class="minute-marker position-absolute"
                        style="left: 0%;"><div class="text-white minute-label"></div></div>`);
                }
                for (let i = newStart; i <= end; i += 60) {
                    let percentage = ((i - newStart) / totaltime * 100) + startPercentage;
                    let marker = '';
                    // Format h:m (e.g 3h1m).
                    if (i >= 3600) {
                        marker = Math.floor(i / 3600) + 'h' + Math.floor((i % 3600) / 60) + 'm';
                    } else {
                        marker = Math.floor(i / 60) + 'm';
                    }
                    $('#minute-markers').append(`<div class="minute-marker position-absolute"
                         style="left: ${percentage}%;"><div class="text-white minute-label">${marker}</div></div>`);
                    $('#minute-markers-bg').append(`<div class="minute-marker position-absolute"
                            style="left: ${percentage}%;"></div>`);
                }

                if (end % 60 != 0) {
                    $('#minute-markers, #minute-markers-bg').append(`<div class="minute-marker position-absolute"
                        style="left: 100%;"><div class="text-white minute-label"></div></div>`);
                }

                // Set caption to null.
                try {
                    player.setCaption('');
                } catch (e) {
                    // Do nothing.
                }

                $scrollbar.css('left', 0);
                $scrollhead.css('left', 0);

                getAnnotations();
            };

            /**
             * Run when video ended (i.e. arrives at 'end' time)
             */
            const onEnded = () => {
                player.pause();
                $playpause.find('i').removeClass('bi-pause-fill').addClass('bi-play-fill').toggleClass('rotate-360');
                // Cover the video with a message on a white background div.
                $videowrapper.append(`<div id="end-screen" class="border position-absolute w-100 h-100 bg-white d-flex
                     justify-content-center align-items-center" style="top: 0; left: 0;">
                     <button class="btn btn-danger border-0 iv-rounded-circle" style="font-size: 1.5rem;" id="restart">
                    <i class="bi bi-arrow-repeat" style="font-size: x-large;"></i></button></div>`);
                $progressbar.css('width', '100%');
                $scrollbar.css('left', '100%');
                $scrollhead.css('left', '100%');
                // Focus on the restart button.
                $('#message #restart').focus();

                // If the current time matches the timestamp of an annotation, highlight the annotation.
                const currentAnnotation = annotations.find((annotation) => annotation.timestamp == end);
                if (currentAnnotation) {
                    $annotationlist.find('tr').removeClass('active');
                    $annotationlist.find('tr[data-id="' + currentAnnotation.id + '"]').addClass('active');
                    // Show tooltip for two seconds.
                    $videonav.find('.annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('show');
                    setTimeout(function() {
                        $videonav.find('.annotation[data-id="' + currentAnnotation.id + '"] .item').tooltip('hide');
                    }, 2000);
                }
            };

            /**
             * Execute when video is sought
             * @param {Number} t seconds
             * @returns
             */
            const onSeek = async function(t) {
                if (!playerReady) {
                    return;
                }
                if (t) {
                    t = Number(t);
                } else {
                    t = await player.getCurrentTime();
                }
                if (t > start && t < end) {
                    $('#end-screen').remove();
                }
                const percentage = (t - start) / (totaltime) * 100;
                $scrollbar.css('left', percentage + '%');
                $scrollhead.css('left', percentage + '%');
                $timelinewrapper.find('#currenttime').text(convertSecondsToHMS(t, true));
                dispatchEvent('timeupdate', {'time': t});
            };

            let onPlayingInterval;
            let visualized = false;
            /**
             * Excute when video plays (i.e. start or resume)
             */
            const onPlaying = async() => {
                if (player.live) {
                    return;
                }
                const intervalFunction = async function() {
                    let thisTime = await player.getCurrentTime();
                    const isPlaying = await player.isPlaying();
                    const isEnded = await player.isEnded();
                    if (!isPlaying) {
                        cancelAnimationFrame(onPlayingInterval);
                        return;
                    }

                    if (thisTime < start) {
                        await player.seek(start);
                        thisTime = start;
                    }

                    if (thisTime >= end || isEnded) {
                        player.stop(end);
                        cancelAnimationFrame(onPlayingInterval);
                        onEnded();
                        return;
                    }
                    dispatchEvent('timeupdate', {'time': thisTime});
                    let percentage = (thisTime - start) / (totaltime) * 100;
                    // Scroll the timeline so that the current time is in the middle of the timeline.
                    const scrollBar = document.getElementById('scrollbar');
                    // Check if the scrollbar is in view.
                    const rect = scrollBar.getBoundingClientRect();
                    if (rect.left < 0 || rect.right > window.innerWidth) {
                        scrollBar.scrollIntoView({behavior: "instant", block: "center", inline: "center"});
                    }

                    // If the current time matches the timestamp of an annotation, highlight the annotation
                    const currentAnnotation = annotations.find(x => (thisTime - player.frequency) <= x.timestamp
                        && (thisTime + player.frequency) >= x.timestamp);
                    if (currentAnnotation) {
                        $annotationlist.find(`tr:not([data-id="${currentAnnotation.id}"])`).removeClass('active');
                        if (!$annotationlist.find(`tr[data-id="${currentAnnotation.id}"]`).hasClass('active')) {
                            $annotationlist.find(`tr[data-id="${currentAnnotation.id}"]`)
                            .addClass('active')
                            .trigger('mouseenter');
                            setTimeout(function() {
                                $annotationlist.find(`tr[data-id="${currentAnnotation.id}"]`).trigger('mouseleave');
                            }, 2000);
                        }
                    }

                    // If current time is within the skipsegment, seek to the end of the segment.
                    let skipsegments = annotations.filter((annotation) => annotation.type == 'skipsegment');
                    let skip = skipsegments.find(x => Number(x.timestamp) < Number(thisTime)
                        && Number(x.title) > Number(thisTime));
                    if (skip) {
                        await player.seek(Number(skip.title));
                        // Replace the progress bar.
                        percentage = (skip.title - start) / totaltime * 100;
                        replaceProgressBars(percentage);
                    }
                };
                if (player.useAnimationFrame) {
                    const animate = async() => {
                        const isPlaying = await player.isPlaying();
                        if (isPlaying) {
                            intervalFunction();
                            onPlayingInterval = requestAnimationFrame(animate);
                        }
                    };
                    onPlayingInterval = requestAnimationFrame(animate);
                } else {
                    const isPlaying = await player.isPlaying();
                    if (isPlaying) {
                        intervalFunction();
                    }
                }
            };

            const onplay = async() => {
                $('#message, #end-screen').not('.sticky').remove();
                $playpause.find('i').removeClass('bi-play-fill').addClass('bi-pause-fill').removeClass('rotate-360');
                if (player.audio && !visualized) {
                    player.visualizer();
                    visualized = true;
                }
            };

            /**
             * Excute when video is paused.
             */
            const onPause = () => {
                cancelAnimationFrame(onPlayingInterval);
                $playpause.find('i').removeClass('bi-pause-fill').addClass('bi-play-fill').toggleClass('rotate-360');
            };

            // Implement the player
            require(['mod_interactivevideo/player/' + type], function(VideoPlayer) {
                if (displayoptions.passwordprotected == 1) {
                    // Remove start screen, set .video-block to d-none, #annotation-canvas remove d-none.
                    $('#video-block').addClass('no-pointer bg-transparent');
                    $annotationcanvas.removeClass('d-none w-0');
                }
                player = new VideoPlayer();
                player.load(
                    url,
                    start,
                    end,
                    {
                        'customStart': true,
                        'passwordprotected': displayoptions.passwordprotected == 1,
                        'showControls': false,
                        'keyboard': true,
                    }
                );
                window.IVPLAYER = player;
            });

            $(document).one('iv:playerReady', function() {
                onReady();
            });

            $(document).on('iv:playerPaused', function() {
                onPause();
            });

            $(document).on('iv:playerPlaying', function() {
                onPlaying();
            });

            $(document).on('iv:playerPlay', function() {
                onplay();
            });

            $(document).on('iv:playerEnded', function() {
                onEnded();
            });

            $(document).on('iv:playerSeek', function(e) {
                onSeek(e.detail.time);
            });

            $(document).on('iv:playerError', function() {
                $annotationcanvas.removeClass('d-none w-0');
                $('#start-screen').addClass('d-none');
                $('#video-block').addClass('no-pointer bg-transparent');
                $('#spinner').remove();
                $('.loader').removeClass('loader');
                if ($('#player').is(':empty')) {
                    $('#player').html(`<div class="alert alert-danger d-flex text-center h-100 rounded-0
                         align-items-center justify-content-center">
                        <img src="${M.cfg.wwwroot}/mod/interactivevideo/pix/404-error.png" alt="Error" class="w-25">
                        </div>`);
                } else {
                    addNotification(M.util.get_string('thereisanissueloadingvideo', 'mod_interactivevideo'), 'danger');
                }
            });

            $(document).on('timeupdate', function(e) {
                if (!playerReady) {
                    player.pause();
                    return;
                }
                const thisTime = e.detail.time;
                $timelinewrapper.find('#currenttime').text(convertSecondsToHMS(thisTime, true));
                let percentage = (thisTime - start) / (totaltime) * 100;
                replaceProgressBars(percentage);
            });

            // Post annotation update (add, edit, clone).
            $(document).on('annotationupdated', function(e) {
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'update_ivitems_cache',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        cmid: interaction,
                    },
                });
                if ($('#annotation-list-bulk-edit').hasClass('active')) {
                    $('#annotation-list-bulk-edit').trigger('click');
                }
                const action = e.originalEvent.detail.action;
                if (action == 'import') {
                    annotations = e.originalEvent.detail.annotations;
                    renderAnnotationItems(annotations);
                    addNotification(M.util.get_string('interactionimported', 'mod_interactivevideo'), 'success');
                    return;
                }
                let updated = e.originalEvent.detail.annotation;
                if (action == 'edit' || action == 'draft' || action == 'savedraft') {
                    annotations = annotations.filter(function(item) {
                        return item.id != updated.id;
                    });
                }
                updated.prop = JSON.stringify(contentTypes.find(x => x.name === updated.type));
                annotations.push(updated);
                if (action == 'add') {
                    activeid = updated.id;
                } else {
                    activeid = null;
                }
                annotations.map(x => {
                    x.editMode = true;
                    return x;
                });
                renderAnnotationItems(annotations);
                if (action == 'add' || action == 'clone') {
                    addNotification(M.util.get_string('interactionadded', 'mod_interactivevideo'), 'success');
                    $annotationlist.find(`tr[data-id="${updated.id}"]`).addClass('active');
                } else if (action == 'edit') {
                    addNotification(M.util.get_string('interactionupdated', 'mod_interactivevideo'), 'success');
                    $annotationlist.find(`tr[data-id="${updated.id}"]`).addClass('active');
                    setTimeout(function() {
                        $annotationlist.find(`tr[data-id="${updated.id}"]`).removeClass('active');
                    }, 1500);
                }

                // If draft exists, activate the save button.
                if (annotations.find(x => x.status == 'draft')) {
                    $timelinewrapper.find('#savedraft').removeAttr('disabled').addClass('pulse');
                } else {
                    $timelinewrapper.find('#savedraft').attr('disabled', 'disabled').removeClass('pulse');
                }

            });

            // Re-render annotation list and timeline after an annotation is deleted.
            $(document).on('annotationdeleted', function(e) {
                const annotation = e.originalEvent.detail.annotation;
                activeid = null;
                $annotationlist.find(`tr[data-id="${annotation.id}"]`).addClass('deleted');
                setTimeout(function() {
                    annotations = annotations.filter(function(item) {
                        return item.id != annotation.id;
                    });
                    renderAnnotationItems(annotations);
                    addNotification(M.util.get_string('interactiondeleted', 'mod_interactivevideo'), 'success');
                }, 1000);
                if ($($('#annotation-list-bulk-edit')).hasClass('active')) {
                    $('#annotation-list-bulk-edit').trigger('click');
                }
            });

            // Implement create annotation
            $(document).on('click', '#addcontentdropdown .dropdown-item', async function(e) {
                if (!playerReady) {
                    return;
                }
                $('#addcontentdropdown .dropdown-item').removeClass('active');
                // Check if the target item is a link.
                if ($(e.target).is('a')) {
                    return;
                }

                const ctype = $(this).data('type');
                player.pause();
                let timestamp = currentTime || await player.getCurrentTime();
                timestamp = Number(timestamp.toFixed(2));
                const contenttype = contentTypes.find(x => x.name == ctype);
                if (contenttype.hastimestamp) {
                    if (annotations.find(x => x.timestamp == timestamp)) {
                        addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                        return;
                    }
                    // Check skip segments
                    const skipsegments = annotations.filter(x => x.type == 'skipsegment');
                    const skip = skipsegments.find(x => Number(x.timestamp) < Number(currentTime)
                        && Number(x.title) > Number(currentTime));
                    if (skip) {
                        addNotification(M.util.get_string('interactionisbetweentheskipsegment', 'mod_interactivevideo'), 'danger');
                        return;
                    }
                }
                if (!contenttype.allowmultiple && annotations.find(x => x.type == ctype)) {
                    addNotification(M.util.get_string(
                        'thisinteractionalreadyexists', 'mod_interactivevideo', contenttype.title), 'danger');
                    return;
                }
                currentTime = null;
                ctRenderer[ctype].addAnnotation(annotations, contenttype.hastimestamp ? timestamp : -1, coursemodule);
            });

            // Implement edit annotation
            $(document).on('click', 'tr.annotation .edit', async function(e) {
                e.preventDefault();
                const timestamp = $(this).closest('.annotation').data('timestamp');
                const id = $(this).closest('.annotation').data('id');
                const contenttype = $(this).closest('.annotation').data('type');
                ctRenderer[contenttype].editAnnotation(annotations, id, coursemodule);
                const t = await player.getCurrentTime();
                if (timestamp && t != timestamp) {
                    await player.seek(timestamp, true);
                }
                const isPlaying = await player.isPlaying();
                if (isPlaying) {
                    player.pause();
                }
            });

            // Implement copy annotation
            $(document).on('click', 'tr.annotation .copy', async function(e) {
                e.preventDefault();
                const id = $(this).closest('.annotation').data('id');
                const contenttype = $(this).closest('.annotation').data('type');
                const time = await player.getCurrentTime();
                ctRenderer[contenttype].cloneAnnotation(id, time);
            });

            // Implement delete annotation.
            $(document).on('click', 'tr.annotation .delete', async function(e) {
                e.preventDefault();
                const isPaused = await player.isPaused();
                if (!isPaused) {
                    player.pause();
                }
                const id = $(this).closest('.annotation').data('id');
                const annotation = annotations.find(annotation => annotation.id == id);
                try {
                    Notification.deleteCancelPromise(
                        M.util.get_string('deleteinteraction', 'mod_interactivevideo'),
                        M.util.get_string('deleteinteractionconfirm', 'mod_interactivevideo'),
                        M.util.get_string('delete', 'mod_interactivevideo'),
                    ).then(() => {
                        return ctRenderer[annotation.type].deleteAnnotation(annotations, id);
                    }).catch(() => {
                        return;
                    });
                } catch {
                    Notification.saveCancel(
                        M.util.get_string('deleteinteraction', 'mod_interactivevideo'),
                        M.util.get_string('deleteinteractionconfirm', 'mod_interactivevideo'),
                        M.util.get_string('delete', 'mod_interactivevideo'),
                        function() {
                            return ctRenderer[annotation.type].deleteAnnotation(annotations, id);
                        }
                    );
                }
            });

            // Implement view annotation.
            $(document).on('click', 'tr.annotation .title', async function(e) {
                e.preventDefault();
                const timestamp = $(this).closest('.annotation').data('timestamp');
                // Update the progress bar.
                const percentage = (timestamp - start) / totaltime * 100;
                replaceProgressBars(percentage);
                let currentTime = await player.getCurrentTime();
                if (currentTime != timestamp) {
                    await player.seek(timestamp, true);
                }
                player.pause();
                const id = $(this).closest('.annotation').data('id');
                const theAnnotation = annotations.find(annotation => annotation.id == id);
                setTimeout(() => {
                    runInteraction(theAnnotation);
                }, 500);
            });

            // Implement go to timestamp.
            $(document).on('click', 'tr.annotation .timestamp', async function(e) {
                e.preventDefault();
                const timestamp = $(this).data('timestamp');
                await player.seek(timestamp);
                player.play();
            });

            // Right click on the video nav or video timeline to add a new interaction.
            $(document).on('contextmenu', '#vseek, #video-timeline', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                const percentage = e.offsetX / $(this).width();
                replaceProgressBars(percentage * 100);
                currentTime = (percentage * totaltime) + start;
                let t = await player.getCurrentTime();
                if (t != currentTime) {
                    await player.seek(currentTime);
                }
                player.pause();
                $addcontent.trigger('click');
            });

            // Right click on the scrollbar to add a new interaction.
            $(document).on('contextmenu', '#scrollbar, #scrollhead-top', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                currentTime = await player.getCurrentTime();
                $addcontent.trigger('click');
            });

            // Click the play/pause button on the timeline region to pause/play video.
            $(document).on('click', '#playpause', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                // Pause or resume the video.
                let isPlaying = await player.isPlaying();
                if (isPlaying) {
                    player.pause();
                } else {
                    let t = await player.getCurrentTime();
                    if (t >= end) {
                        $('#end-screen #restart').trigger('click');
                    } else {
                        player.play();
                    }
                }
            });

            $(document).on('click', '#video-block', function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                $playpause.trigger('click');
            });

            // Right click on the annotation indicator to edit the annotation.
            $(document).on('contextmenu', '#video-nav .annotation', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = $(this).data('id');
                // Trigger click on the edit button.
                $annotationlist.find(`tr.annotation[data-id="${id}"] .edit`).trigger('click');
            });

            // Quick edit.
            $(document).on('contextmenu', '[data-editable]', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if ($('[data-field].editing').length > 0) {
                    return;
                }
                const fld = $(this).data('editable');
                $(this).hide();
                $(this).siblings('[data-field="' + fld + '"]').removeClass('d-none').focus().addClass('editing');
                if (fld == 'timestamp') {
                    $(this).closest('tr')
                        .append(`<div class="timestamp-info position-absolute">
                        ${M.util.get_string('rightclicktosetcurrenttime', 'mod_interactivevideo')}</div>`);
                }
            });

            $(document).on('contextmenu', '[data-field="timestamp"]', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const time = await player.getCurrentTime();
                $(this).val(convertSecondsToHMS(time, false, false));
            });

            $(document).on('keyup', '[data-field].editing', function(e) {
                $(this).removeClass('is-invalid');
                const initialValue = $(this).data('initial-value');
                const val = $(this).val();
                const fld = $(this).data('field');
                if (val == '') {
                    $(this).addClass('is-invalid');
                }

                // If escape key is pressed, revert the value.
                if (e.key == 'Escape') {
                    $(this).val(initialValue);
                    $(this).removeClass('editing');
                    $(this).addClass('d-none');
                    $(this).siblings('[data-editable]').show();
                    $('.timestamp-info').remove();
                    return;
                }
                // If enter key is pressed, save the value.
                if (e.key == 'Enter') {

                    let seconds;
                    if (fld == 'timestamp') {
                        const parts = initialValue.split(':');
                        seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                        if (!validateTimestampFormat(val, '[data-field].editing', initialValue)) {
                            $(this).addClass('is-invalid');
                            return;
                        }
                        const timestamp = validateTimeStartEnd(val, '[data-field].editing', initialValue, seconds,
                            true, true, true);
                        if (timestamp == -1) {
                            $(this).addClass('is-invalid');
                            return;
                        }
                        seconds = timestamp;
                    }

                    if ($(this).hasClass('is-invalid')) {
                        return;
                    }
                    if (val == initialValue) {
                        $(this).removeClass('editing');
                        $(this).addClass('d-none');
                        $(this).siblings('[data-editable]').show();
                        return;
                    }
                    const id = $(this).data('id');
                    $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'quick_edit_field',
                            sesskey: M.cfg.sesskey,
                            id: id,
                            field: fld,
                            contextid: M.cfg.contextid,
                            value: fld == 'timestamp' ? seconds : val,
                        },
                        success: function(data) {
                            $('.timestamp-info').remove();
                            const updated = JSON.parse(data);
                            dispatchEvent('annotationupdated', {
                                annotation: updated,
                                action: 'edit'
                            });
                        }
                    });
                    return;
                }
            });

            $(document).on('blur', '[data-field].editing', function() {
                const initialValue = $(this).data('initial-value');
                $(this).val(initialValue);
                $(this).removeClass('editing');
                $(this).addClass('d-none');
                $(this).siblings('[data-editable]').show();
                $('.timestamp-info').remove();
            });
            // End quick edit.

            $(document).on('click', '#end-screen #restart', async function(e) {
                e.preventDefault();
                $('#end-screen').remove();
                await player.seek(start);
                player.play();
            });

            // Display tooltip on anntation indicator when annotation on the list is hovered.
            $(document).on('mouseenter', 'tr.annotation', function() {
                const id = $(this).data('id');
                $videonav.find(`ul li[data-id="${id}"] .item`).tooltip('show');
            });

            // Remove tooltip when annotation on the list is not hovered.
            $(document).on('mouseleave', 'tr.annotation', function() {
                const id = $(this).data('id');
                $videonav.find(`ul li[data-id="${id}"] .item`).tooltip('hide');
                if (!isBS5) {
                    $('.tooltip').remove();
                }
            });

            // Highlight annotation on the list when annotation indicator is hovered.
            $(document).on('mouseover', '#video-nav ul li', function() {
                const id = $(this).data('id');
                $annotationlist.find(`tr.annotation[data-id="${id}"]`).addClass('active');
            });

            // Remove highlight when annotation indicator is not hovered.
            $(document).on('mouseout', '#video-nav ul li', function() {
                const id = $(this).data('id');
                $annotationlist.find(`tr.annotation[data-id="${id}"]`).removeClass('active');
            });

            // Validate timestamp when the timestamp field is changed.
            $(document).on('change', '.timestamp-input, .timestamp-field input', function() {
                $(this).removeClass('is-invalid');
                const parts = $(this).val().split(':');
                const seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                if (!validateTimestampFormat($(this).val(), this)) {
                    $(this).addClass('is-invalid');
                    return;
                }

                const timestamp = validateTimeStartEnd($(this).val(), this, "00:00:00", seconds, true, false, true);

                if (timestamp == -1) {
                    $(this).addClass('is-invalid');
                    return;
                }
            });

            let $vseekbar = $('#vseek #bar');

            const appendTimestampMarker = (seconds, rounded) => {
                const formattedTime = convertSecondsToHMS(seconds, true, rounded);
                $vseekbar.append(`<div id="position-marker">
                    <div id="position" class="py-0 px-1" style="top:-25px;">${formattedTime}</div></div>`);
            };

            $(document).on('annotationitemsrendered', function() {
                $timelinewrapper.find(`[data${bsAffix}-toggle="tooltip"]`).tooltip({
                    'boundary': 'window',
                    'container': '#timeline',
                });
                // Put the minute markers on the timeline;
                let targetAnnotation = null;
                // Destroy draggable and resizable if already initialized.
                try {
                    $('#timeline-items .annotation, #video-timeline-wrapper .skipsegment').draggable('destroy');
                    $('#timeline-items .annotation, #video-timeline-wrapper .skipsegment').resizable('destroy');
                } catch (e) {
                    // Do nothing.
                }
                $('#timeline-items .annotation.li-draggable').draggable({
                    'axis': 'x',
                    'start': async function() {
                        const isPaused = await player.isPaused();
                        if (!isPaused) {
                            player.pause();
                        }
                        appendTimestampMarker($(this).data('timestamp'));
                        $('.tooltip, #message').remove();
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'drag': async function(event, ui) {
                        $('.tooltip').remove();
                        let timestamp = ((ui.position.left + 5) / $('#timeline-items').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                            ui.position.left = -5;
                        }
                        if (timestamp > end) {
                            timestamp = end;
                            ui.position.left = $('#timeline-items').width() - 5;
                        }
                        let percentage = (timestamp - start) / totaltime * 100;
                        if (percentage < 0) {
                            percentage = 0;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                        $(this).css('left', percentage + '%');
                        await player.seek(timestamp);
                        $('#vseek #position').text(convertSecondsToHMS(timestamp, true, false));
                    },
                    'stop': async function(event, ui) {
                        $('.tooltip').remove();
                        $('#vseek #position-marker').remove();
                        setTimeout(function() {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        let timestamp = ((ui.position.left + 5) / $('#timeline-items').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                            $(this).css('left', '-5px');
                        }
                        if (timestamp > end) {
                            timestamp = end;
                            $(this).css('left', 'calc(100% - 5px)');
                        }
                        let percentage = (timestamp - start) / totaltime * 100;
                        if (percentage < 0) {
                            percentage = 0;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        const existingAnnotation = annotations.find(x => x.timestamp == timestamp && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == timestamp) {
                            return;
                        }
                        targetAnnotation.timestamp = timestamp;
                        targetAnnotation.status = "draft";
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').draggable({
                    'axis': 'x',
                    'start': async function() {
                        const isPaused = await player.isPaused();
                        if (!isPaused) {
                            player.pause();
                        }
                        $('#message').remove();
                        appendTimestampMarker($(this).data('timestamp'));
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'drag': async function(event, ui) {
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        if (timestamp < start) {
                            timestamp = start;
                        }

                        if (timestamp > end) {
                            timestamp = end;
                        }

                        let percentage = (timestamp - start) / totaltime * 100;
                        if (percentage < 0) {
                            percentage = 0;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                        await player.seek(timestamp);
                        $('#vseek #position').text(convertSecondsToHMS(timestamp, true, false));
                    },
                    'stop': async function(event, ui) {
                        $('#vseek #position-marker').remove();
                        setTimeout(function() {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        let timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let skipduration = Number(targetAnnotation.title) - Number(targetAnnotation.timestamp);
                        if (timestamp < 0 && timestamp + skipduration < start) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (timestamp > end) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (timestamp < start) {
                            skipduration = skipduration - Math.abs(start - timestamp);
                            timestamp = start;
                        }
                        if (timestamp + skipduration > end) {
                            skipduration = Math.abs(end - timestamp);
                            timestamp = end - skipduration;
                        }
                        if (skipduration <= 0) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        const existingAnnotation = annotations.find(x => x.timestamp == timestamp && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == timestamp) {
                            renderAnnotationItems(annotations);
                            return;
                        }
                        targetAnnotation.timestamp = timestamp;
                        targetAnnotation.title = timestamp + skipduration;
                        if (targetAnnotation.title > end) {
                            targetAnnotation.title = end;
                        }
                        targetAnnotation.status = "draft";
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });
                        let percentage = (timestamp - start) / totaltime * 100;
                        if (percentage < 0) {
                            percentage = 0;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').resizable({
                    'containment': '#video-timeline-wrapper',
                    'handles': 'e, w',
                    'start': async function() {
                        const isPaused = await player.isPaused();
                        if (!isPaused) {
                            player.pause();
                        }
                        $('#message').remove();
                        appendTimestampMarker($(this).data('timestamp'));
                        $('#timeline-items').addClass('no-pointer-events');
                    },
                    'resize': async function(event, ui) {
                        let timestamp;
                        if (ui.originalPosition.left != ui.position.left || ui.originalSize.width == ui.size.width) {
                            if (ui.position.left < 0) {
                                ui.position.left = 0;
                            }
                            timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                        } else {
                            timestamp = ((ui.position.left + ui.size.width) / $('#video-timeline').width()) * totaltime + start;
                        }
                        let percentage = (timestamp - start) / totaltime * 100;
                        if (isNaN(percentage) || percentage < 0) {
                            percentage = 0;
                        }
                        if (percentage > 100) {
                            percentage = 100;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                        await player.seek(timestamp);
                        $('#vseek #position').text(convertSecondsToHMS(timestamp, true, false));
                    },
                    'stop': async function(event, ui) {
                        $('#vseek #position-marker').remove();
                        setTimeout(function() {
                            $('#timeline-items').removeClass('no-pointer-events');
                        }, 200);
                        const id = $(this).data('id');
                        targetAnnotation = annotations.find(x => x.id == id);
                        let timestamp, direction;
                        if (ui.originalPosition.left != ui.position.left) {
                            if (ui.position.left < 0) {
                                ui.position.left = 0;
                            }
                            timestamp = ((ui.position.left) / $('#video-timeline').width()) * totaltime + start;
                            direction = "left";
                        } else {
                            timestamp = ((ui.position.left + ui.size.width) / $('#video-timeline').width()) * totaltime + start;
                            direction = "right";
                        }
                        const existingAnnotation = annotations.find(x => x.timestamp == timestamp && x.id != id);
                        if (existingAnnotation) {
                            addNotification(M.util.get_string('interactionalreadyexists', 'mod_interactivevideo'), 'danger');
                            renderAnnotationItems(annotations);
                            return;
                        }
                        if (targetAnnotation.timestamp == timestamp) {
                            return;
                        }
                        if (direction == "left") {
                            targetAnnotation.timestamp = timestamp;
                        } else {
                            targetAnnotation.title = timestamp;
                            if (targetAnnotation.title > end) {
                                targetAnnotation.title = end;
                            }
                        }
                        targetAnnotation.status = 'draft';
                        dispatchEvent('annotationupdated', {
                            annotation: targetAnnotation,
                            action: 'draft'
                        });

                        let percentage = (timestamp - start) / totaltime * 100;
                        if (isNaN(percentage) || percentage < 0) {
                            percentage = 0;
                        }
                        if (percentage > 100) {
                            percentage = 100;
                        }
                        $('#scrollbar, #position-marker, #scrollhead-top').css('left', percentage + '%');
                    }
                });

                $('#video-timeline-wrapper .skipsegment').off('contextmenu').on('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const id = $(this).data('id');
                    $(`tr.annotation[data-id="${id}"] .edit`).trigger('click');
                });

                $('#video-timeline-wrapper .skipsegment').off('click').on('click', async function(e) {
                    e.preventDefault();
                    const timestamp = $(this).data('timestamp');
                    await player.seek(timestamp);
                    const isPaused = await player.isPaused();
                    if (!isPaused) {
                        player.pause();
                    }
                });

                $('#video-timeline-wrapper .skipsegment .delete-skipsegment').off('click').on('click', function(e) {
                    e.preventDefault();
                    const id = $(this).closest('.skipsegment').data('id');
                    $(`tr.annotation[data-id="${id}"] .delete`).trigger('click');
                });
            });

            $('#scrollbar').draggable({
                'containment': '#timeline-items',
                'axis': 'x',
                'cursor': 'col-resize',
                'start': async function(event, ui) {
                    const isPaused = await player.isPaused();
                    if (!isPaused) {
                        player.pause();
                    }
                    $('#timeline-items').addClass('no-pointer-events');
                    $("#message").remove();
                    appendTimestampMarker(((ui.position.left) / $('#timeline-items').width()) * totaltime + start, false);
                },
                'drag': async function(event, ui) {
                    let timestamp = ((ui.position.left) / $('#timeline-items').width()) * totaltime + start;
                    let percentage = (timestamp - start) / totaltime * 100;
                    $('#vseek #position').text(convertSecondsToHMS(timestamp, true, false));
                    $('#vseek #position-marker, #scrollhead-top, #scrollbar')
                        .css('left', percentage + '%');
                    await player.seek(timestamp);
                },
                'stop': async function(event, ui) {
                    $('#vseek #position-marker').remove();
                    setTimeout(function() {
                        $('#timeline-items').removeClass('no-pointer-events');
                    }, 200);
                    // Convert the position to percentage
                    let timestamp = ((ui.position.left) / $('#timeline-items').width()) * totaltime + start;
                    let percentage = (timestamp - start) / totaltime * 100;
                    if (isNaN(percentage) || percentage < 0) {
                        percentage = 0;
                    }
                    if (percentage > 100) {
                        percentage = 100;
                    }
                    $('#scrollbar, #scrollhead-top').css('left', percentage + '%');
                    const isPaused = await player.isPaused();
                    if (!isPaused) {
                        player.pause();
                    }
                }
            });

            $('#scrollhead-top').draggable({
                'axis': 'x',
                'cursor': 'col-resize',
                'start': async function(event, ui) {
                    const isPaused = await player.isPaused();
                    if (!isPaused) {
                        player.pause();
                    }
                    $('#vseek').addClass('no-pointer-events');
                    $("#message").remove();
                    appendTimestampMarker(((ui.position.left) / $('#vseek').width()) * totaltime + start, false);
                },
                'drag': async function(event, ui) {
                    let timestamp = ((ui.position.left) / $('#vseek').width()) * totaltime + start;
                    let percentage = (timestamp - start) / totaltime * 100;
                    if (isNaN(percentage) || percentage < 0) {
                        percentage = 0;
                    }
                    if (percentage > 100) {
                        percentage = 100;
                    }
                    if (timestamp < start) {
                        timestamp = start;
                    }
                    $('#vseek #position').text(convertSecondsToHMS(timestamp, true, false));
                    $('#vseek #position-marker, #scrollhead-top, #scrollbar')
                        .css('left', percentage + '%');
                    await player.seek(timestamp);
                },
                'stop': async function(event, ui) {
                    $('#vseek #position-marker').remove();
                    setTimeout(function() {
                        $('#vseek').removeClass('no-pointer-events');
                    }, 200);
                    // Convert the position to percentage
                    let timestamp = ((ui.position.left) / $('#vseek').width()) * totaltime + start;
                    if (timestamp < start) {
                        timestamp = start;
                    }
                    let percentage = (timestamp - start) / totaltime * 100;
                    if (isNaN(percentage) || percentage < 0) {
                        percentage = 0;
                    }
                    if (percentage > 100) {
                        percentage = 100;
                    }
                    $('#scrollbar, #scrollhead-top').css('left', percentage + '%');
                    let t = await player.getCurrentTime();
                    if (t === timestamp) {
                        return;
                    }
                    const isPaused = await player.isPaused();
                    if (!isPaused) {
                        player.pause();
                    }
                }
            });

            // Resize timeline.
            $('#timeline-wrapper').resizable({
                'handles': 'n',
                'minHeight': 125,
                'maxHeight': 500,
                'start': function() {
                    $('#top-region, #timeline-wrapper').addClass('no-pointer-events');
                },
                'resize': function(event, ui) {
                    $('#top-region').css('height', `calc(100dvh - ${ui.size.height + 70}px)`);
                },
                'stop': function() {
                    $('#top-region, #timeline-wrapper').removeClass('no-pointer-events');
                    localStorage.setItem('timeline-height', $('#timeline-wrapper').height());
                }
            });

            // Resize player region.
            $('#separator').draggable({
                'axis': 'x',
                'containment': '#wrapper',
                'grid': [1, 0],
                'start': function() {
                    $('#wrapper').addClass('no-pointer-events');
                },
                drag: function() {
                    const parentOffset = $(this).offset();
                    const width = parentOffset.left;
                    if (!isRTL) {
                        $('#player-region').css('width', width + 'px');
                        $('#content-region').css('width', 'calc(100% - ' + width + 'px)');
                    } else {
                        $('#player-region').css('width', 'calc(100% - ' + width + 'px)');
                        $('#content-region').css('width', width + 'px');
                    }
                },
                stop: function() {
                    const width = $(this).offset().left;
                    // Save this to local storage
                    localStorage.setItem('player-width', width);
                    $('#wrapper').removeClass('no-pointer-events');
                }
            });

            // Set player region width from the saved width in local storage.
            const playerWidth = localStorage.getItem('player-width');
            if (playerWidth > 0 && window.innerWidth > 992) {
                $('#separator').css('left', playerWidth + 'px');
                if (!isRTL) {
                    $('#player-region').css('width', playerWidth + 'px');
                    $('#content-region').css('width', 'calc(100% - ' + playerWidth + 'px)');
                } else {
                    $('#player-region').css('width', 'calc(100% - ' + playerWidth + 'px)');
                    $('#content-region').css('width', playerWidth + 'px');
                }
            } else {
                $('#separator').css('left', `50%`);
                $('#player-region').css('width', `50%`);
                $('#content-region').css('width', `50%`);
            }

            // Set timeline height from saved height in local storage.
            const timelineHeight = localStorage.getItem('timeline-height');
            if (timelineHeight) {
                $('#timeline-wrapper').css('height', timelineHeight + 'px');
                $('#top-region').css('height', `calc(100dvh - ${Number(timelineHeight) + 70}px)`);
            }

            // Seek bar functionalities
            $('#vseek #bar, #video-timeline').on('mouseenter', function(e) {
                $('#cursorbar, #position-marker').remove();
                e.preventDefault();
                e.stopImmediatePropagation();
                // First clone the #scrollbar and place it where the cursor is.
                let $scrollbar = $('#scrollbar').clone();
                $scrollbar.attr('id', 'cursorbar');
                $scrollbar.addClass('no-pointer-events');

                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;

                $scrollbar.css('left', (relX + 5) + 'px');
                $scrollbar.find('#scrollhead').remove();
                const percentage = relX / $(this).width();
                const time = percentage * (totaltime) + start;
                const formattedTime = convertSecondsToHMS(time, true, false);
                $('#vseek #bar').append(`<div id="position-marker">
                    <div id="position" class="py-0 px-1" style="top:-25px;">${formattedTime}</div></div>`);
                $('#vseek #position-marker').css('left', relX + 'px');
                $('#timeline-items').append($scrollbar);
            });

            $('#vseek #bar, #video-timeline').on('mouseleave', function(e) {
                e.stopImmediatePropagation();
                $('#vseek #position-marker, #cursorbar').remove();
                // Remove highlight.
                $('tr.annotation.active').removeClass('active');
            });

            $('#vseek #bar, #video-timeline').on('mousemove', function(e) {
                e.stopImmediatePropagation();
                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;
                const percentage = relX / $(this).width();
                let time = percentage * (totaltime) + start;
                if (time < start) {
                    time = start;
                }
                const formattedTime = convertSecondsToHMS(time, true, false);
                // Move the cursorbar
                $('#cursorbar').css('left', (relX + 5) + 'px');
                $('#vseek #position').text(formattedTime);
                $('#vseek #position-marker').css('left', relX + 'px');
            });

            // Run interaction when annotation indicator is clicked.
            $(document).on('click', '#video-nav .annotation', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = $(this).data('id');
                const annotation = annotations.find(x => x.id == id);
                $loader.fadeIn(300);
                if (await player.getCurrentTime() != annotation.timestamp) {
                    await player.seek(annotation.timestamp);
                }
                $loader.fadeOut(300);
                runInteraction(annotation);
            });

            // Seek video on click on timeline or video nav.
            $(document).on('click', '#vseek #bar, #video-timeline', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const percentage = e.offsetX / $(this).width();
                const time = percentage * (totaltime) + start;
                const t = await player.getCurrentTime();
                if (t === time) {
                    return;
                }
                replaceProgressBars(percentage * 100);
                $loader.fadeIn(300);
                const isPaused = await player.isPaused();
                if (!isPaused) {
                    player.pause();
                }
                await player.seek(time);
                $loader.fadeOut(300);
                $("#message, #end-screen").remove();
            });

            // Implement timeline zoom out.
            $('#zoomout').on('click', function() {
                const currentLevel = $timelineitemswrapper.css('width'); // In px.
                const newLevel = parseInt(currentLevel) - 300;
                $timelineitemswrapper.css('width', newLevel + 'px');
                const relWidth = $('#timeline-items').width();
                $('#minute-markers, #minute-markers-bg, #vseek').css('width', relWidth + 'px');
                let timelineElement = document.getElementById('timeline');
                if (timelineElement.scrollWidth <= timelineElement.clientWidth) {
                    $(this).attr('disabled', 'disabled');
                }
                dispatchEvent('annotationitemsrendered', {'annotations': annotations});
            });

            // Implement timeline zoom in.
            $('#zoomin').on('click', function() {
                const currentLevel = $timelineitemswrapper.css('width'); // In px.
                const newLevel = parseInt(currentLevel) + 300;
                $timelineitemswrapper.css('width', newLevel + 'px');
                const relWidth = $('#timeline-items').width();
                $('#minute-markers, #minute-markers-bg, #vseek').css('width', relWidth + 'px');
                $('#zoomout').removeAttr('disabled');
                dispatchEvent('annotationitemsrendered', {'annotations': annotations});
            });

            // Implement zoom in and zoom out on mouse scroll on timeline.
            $("#timeline").on('wheel', function(e) {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.originalEvent.deltaY < 0) {
                        $('#zoomin').trigger('click');
                    } else {
                        $('#zoomout').trigger('click');
                    }
                }
            });

            document.getElementById('timeline').addEventListener('scroll', function() {
                document.getElementById('minute-markers-wrapper').scrollLeft = this.scrollLeft;
                document.getElementById('vseek').style.left = -this.scrollLeft + 'px';
                document.getElementById('minute-markers-bg-wrapper').style.left = -this.scrollLeft + 'px';
                document.getElementById('scrollbar').scrollHeight = this.scrollHeight;
            });

            // Save timeline changes.
            $('#savedraft').on('click', function(e) {
                e.stopImmediatePropagation();
                let draftAnnotations = annotations.filter(x => x.status == 'draft');
                let count = 0;
                draftAnnotations.forEach(function(a) {
                    $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'quick_edit_field',
                            sesskey: M.cfg.sesskey,
                            id: a.id,
                            field: 'timestamp',
                            contextid: M.cfg.contextid,
                            value: a.timestamp,
                        },
                        success: function(data) {
                            const updated = JSON.parse(data);
                            dispatchEvent('annotationupdated', {
                                annotation: updated,
                                action: 'savedraft'
                            });
                        }
                    });
                    if (a.type == 'skipsegment') {
                        $.ajax({
                            url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                            method: "POST",
                            dataType: "text",
                            data: {
                                action: 'quick_edit_field',
                                sesskey: M.cfg.sesskey,
                                id: a.id,
                                field: 'title',
                                contextid: M.cfg.contextid,
                                value: a.title,
                            },
                            success: function(data) {
                                const updated = JSON.parse(data);
                                dispatchEvent('annotationupdated', {
                                    annotation: updated,
                                    action: 'savedraft'
                                });
                            }
                        });
                    }
                    count++;
                    if (count == draftAnnotations.length) {
                        addNotification(M.util.get_string('draftsaved', 'mod_interactivevideo'), 'success');
                    }
                });

            });


            // Launch content selection modal.
            let contentTypeModal;
            $addcontent.on('click', async function(e) {
                e.preventDefault();
                if (!playerReady) {
                    return;
                }
                if (contentTypeModal) {
                    contentTypeModal.show();
                    return;
                }
                contentTypeModal = await ModalFactory.create({
                    title: '',
                    body: '',
                    backdrop: 'static',
                    removeOnHide: false,
                });
                let root = contentTypeModal.getRoot();
                let $body = $('#contentmodal-original .modal-content').html();
                root.attr('id', 'contentmodal');
                root.find('.modal-dialog .modal-content').html($body);
                contentTypeModal.show();

                root.on(ModalEvents.hidden, function() {
                    $('#addcontentdropdown .dropdown-item').removeClass('active');
                });

                root.on(ModalEvents.shown, function() {
                    player.pause();
                    // Apply jelly animation after DOM is ready
                    setTimeout(() => {
                        root.addClass('jelly-anim');
                    }, 10);

                    // Make the modal draggable.
                    root.find('.modal-dialog').draggable({
                        handle: ".modal-header"
                    });
                });

                root.on('click', '.modal-header .close', function() {
                    contentTypeModal.hide();
                });

                root.on('click', '.dropdown-item', function() {
                    root.removeClass('jelly-anim');
                    contentTypeModal.hide();
                });
            });

            // Inform user to save changes before close or unload the current page.
            window.addEventListener('beforeunload', (e) => {
                if (annotations.find(x => x.status == 'draft')) {
                    const confirmationMessage = M.util.get_string('unsavedchanges', 'mod_interactivevideo');
                    e.returnValue = confirmationMessage;
                    return confirmationMessage;
                }
                return true;
            });

            // Implement the rate change.
            $(document).on('click', '.changerate', function(e) {
                e.preventDefault();
                const rate = $(this).data('rate');
                player.setRate(rate);
                $('.changerate').find('i').removeClass('bi-check');
                $(this).find('i').addClass('bi-check');
            });

            $(document).on('iv:playerRateChange', function(e) {
                $('.changerate').find('i').removeClass('bi-check');
                $(`.changerate[data-rate="${e.originalEvent.detail.rate}"]`).find('i').addClass('bi-check');
            });

            // Handle video control:: Quality change
            $("#changequality").on('shown.bs.dropdown', async function() {
                let quality = await player.getQualities();
                $('#qualitieslist').empty();
                let currentQuality = quality.currentQuality;
                if (currentQuality === null) {
                    currentQuality = $(this).data('current');
                }
                let qualities = quality.qualities;
                let qualitiesLabel = quality.qualitiesLabel;
                qualities.forEach((q, i) => {
                    $('#qualitieslist').append(`<a class="dropdown-item changequality px-3" data-quality="${q}"
                         href="#"><i class="bi ${q == currentQuality ? 'bi-check' : ''} fa-fw"></i>${qualitiesLabel[i]}</a>`);
                });
                $(this).find(`[data${bsAffix}-toggle=dropdown]`).dropdown('update');
            });

            $(document).on('click', '.changequality', function(e) {
                e.preventDefault();
                const quality = $(this).data('quality');
                player.setQuality(quality);
                $('.changequality').find('i').removeClass('bi-check');
                $(this).find('i').addClass('bi-check');
            });

            // Observe timeline-wrapper width change.
            let timelineWrapper = document.getElementById('timeline-wrapper');
            let resizeTimeout;
            let resizeObserver = new ResizeObserver(() => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const relWidth = $('#timeline-items').width();
                    $('#minute-markers, #minute-markers-bg, #vseek').css('width', relWidth + 'px');
                }, 100);
            });

            resizeObserver.observe(timelineWrapper);

            // Implement import content
            $(document).on('click', '#importcontent', function(e) {
                e.preventDefault();
                const importmodal = `<div class="modal fade" id="importmodal" tabindex="-1" aria-labelledby="importmodalLabel"
                 aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title flex-grow-1" id="importmodalLabel">
                                ${M.util.get_string('importcontent', 'mod_interactivevideo')}</h5>
                                <button type="button" class="btn p-0 border-0" data${bsAffix}-dismiss="modal" aria-label="Close">
                                    <i class="bi bi-x-lg fa-fw fs-25px"></i>
                                </button>
                            </div>
                            <div class="modal-body">
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary border-0" data${bsAffix}-dismiss="modal">
                                ${M.util.get_string('cancel', 'mod_interactivevideo')}</button>
                                <button type="button" class="btn btn-primary border-0" id="importcontentbutton">
                                ${M.util.get_string('import', 'mod_interactivevideo')}</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                $('body').append(importmodal);
                $('#importmodal').modal('show');

                $('#importmodal').on('hidden.bs.modal', function() {
                    $('#importmodal').remove();
                });

                $('#importmodal').off('shown.bs.modal').on('shown.bs.modal', function() {
                    // Make the modal draggable.
                    $('#importmodal .modal-dialog').draggable({
                        handle: ".modal-header"
                    });
                    // Render the course select dropdown.
                    $.ajax({
                        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                        method: "POST",
                        dataType: "text",
                        data: {
                            action: 'get_taught_courses',
                            sesskey: M.cfg.sesskey,
                            contextid: M.cfg.contextid,
                            userid: userid
                        },
                        success: function(data) {
                            let courses = JSON.parse(data);
                            // Sort courses by name.
                            courses.sort((a, b) => a.fullname.localeCompare(b.fullname));
                            let courseSelect = `<select class="${isBS5 ? 'form' : 'custom'}-select w-100" id="importcourse">`;
                            courses.forEach(course => {
                                courseSelect += `<option value="${course.id}">${course.fullname} (${course.shortname})</option>`;
                            });
                            courseSelect += `</select>`;
                            let selectfield = `<div class="iv-form-group selectcourse">
                            <label class="iv-font-weight-bold form-label" for="importcourse">
                            ${M.util.get_string('selectcourse', 'mod_interactivevideo')}</label>
                            ${courseSelect}</div>`;
                            $('#importmodal .modal-body').append(selectfield);
                            // Default current course.
                            $('#importmodal #importcourse').val(course);
                            $('#importmodal #importcourse').trigger('change');
                        }
                    });
                });
            });

            $(document).on('change', '#importmodal #importcourse', function() {
                $(`#importmodal .selectcm, #importmodal .select-interaction`).remove();
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_cm_by_courseid',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        courseid: $(this).val()
                    },
                    success: function(data) {
                        let cms = JSON.parse(data);
                        cms.sort((a, b) => a.name.localeCompare(b.name));
                        let cmSelect = `<select class="${isBS5 ? 'form' : 'custom'}-select w-100" id="importcm">
                        <option value="">${M.util.get_string('select', 'mod_interactivevideo')}</option>`;
                        cms.forEach(cm => {
                            cmSelect += `<option value="${cm.id}" ${cm.id == interaction ? 'disabled' : ''}>${cm.name}</option>`;
                        });
                        cmSelect += `</select>`;
                        let selectfield = `<div class="iv-form-group selectcm">
                        <label for="importcm" class="iv-font-weight-bold form-label">
                        ${M.util.get_string('selectactivity', 'mod_interactivevideo')}</label>
                        ${cmSelect}</div>`;
                        $(`#importmodal .selectcourse`).after(selectfield);
                    }
                });
            });

            $(document).on('change', '#importmodal #importcm', async function() {
                $(`#importmodal .select-interaction`).remove();
                $(`#importmodal #importcm`).after(`<div class="select-interaction py-3">
                    <iframe src="${M.cfg.wwwroot + '/mod/interactivevideo/view.php?i=' + $(this).val()}&embed=1&preview=1"
                    frameborder=0 width="100%" height="500" class="loader"></iframe></div>`);
                let interactions = await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_items',
                        sesskey: M.cfg.sesskey,
                        id: $(this).val(),
                        contextid: M.cfg.contextid,
                        coursecontextid: M.cfg.courseContextId
                    }
                });
                interactions = JSON.parse(interactions);
                interactions = interactions.filter(x => x.type != 'skipsegment');
                if (interactions.length == 0) {
                    $(`#importmodal .select-interaction`).append(`<div class="alert alert-warning mt-3">
                        ${M.util.get_string('nocontent', 'mod_interactivevideo')}</div>`);
                    return;
                }

                $(`#importmodal .select-interaction`).append(`<div class="input-group mb-1 w-100 flex-nowrap align-items-center
                     no-pointer">
                     <div class="input-group-prepend border-0 invisible">
                            <label class="input-group-text bg-white">
                                <input type="checkbox"/>
                                <i class="bi bi-plus iv-ml-3 fs-unset"></i>
                            </label>
                        </div>
                <input type="text" class="form-control border-0 iv-font-weight-bold"
                 value="${M.util.get_string('title', 'mod_interactivevideo')}">
                <input type="text" class="form-control border-0 iv-font-weight-bold" style="max-width: 50px;"
                value="XP">
                <input type="text" style="max-width: 150px;" value="${M.util.get_string('timestamp', 'mod_interactivevideo')}"
                 class="form-control border-0 iv-font-weight-bold"></div>`);

                interactions = interactions.map(int => {
                    // Get the icon and check if the interaction is out of range (start, end time);
                    const ctype = contentTypes.find(y => y.name === int.type);
                    int.prop = JSON.stringify(ctype);
                    int.icon = ctype.icon;
                    if ((int.timestamp > end || int.timestamp < start) && int.timestamp > 0) {
                        int.outside = true;
                    } else {
                        int.outside = false;
                    }
                    // Check if the interaction can be added (e.g. annotation content type can only be added once per activity);
                    if (!ctype.allowmultiple && annotations.find(x => x.type == int.type)) {
                        int.disabled = true;
                    }
                    return int;
                });

                interactions.sort((a, b) => a.timestamp - b.timestamp);
                interactions.forEach(int => {
                    const inputgroup = `<div class="input-group mb-1 w-100 flex-nowrap align-items-center"
                     data-id="${int.id}">
                        <div class="input-group-prepend">
                            <label class="input-group-text">
                                <input type="checkbox" ${int.disabled ? 'disabled' : ''}/>
                                <i class="${int.icon} iv-ml-3 fs-unset"></i>
                            </label>
                        </div>
                <input type="text" class="form-control name" ${int.timestamp < 0 ? 'readonly' : ''}
                 value="${int.title}">
                <input type="text" style="max-width: 50px;" ${int.timestamp < 0 || int.hascompletion == 0 ? 'readonly' : ''}
                 class="form-control xp" value="${int.xp}">
                <input type="text" placeholder="00:00:00" style="max-width: 150px;" ${int.timestamp < 0 ? 'readonly' : ''}
                 class="form-control timestamp-input ${int.outside ? 'is-invalid' : ''}"
                value="${int.timestamp < 0 ? int.timestamp :
                            convertSecondsToHMS(int.timestamp, false, false)}"></div>`;
                    $(`#importmodal .select-interaction`).append(inputgroup);
                });

                $(document).off('click', '#importmodal #importcontentbutton').on('click', '#importmodal #importcontentbutton',
                    async function(e) {
                        e.preventDefault();
                        let $selected = $(`#importmodal .select-interaction input[type="checkbox"]:checked`);
                        let selectedInt = [];
                        $selected.each(function() {
                            let $row = $(this).closest('.input-group');
                            const name = $row.find('.name').val();
                            if (name.trim() == '') {
                                return;
                            }
                            let timestamp = $row.find('.timestamp-input').val();
                            if (timestamp == '') {
                                return;
                            }

                            if (Number(timestamp) < 0) {
                                timestamp = Number(timestamp);
                            } else {
                                const parts = timestamp.split(':');
                                timestamp = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
                                if (annotations.find(x => x.timestamp == timestamp)) {
                                    return;
                                }
                            }
                            let id = $row.data('id');
                            let int = interactions.find(x => x.id == id);
                            int.title = name;
                            int.timestamp = timestamp;
                            let xp = Number($row.find('.xp').val());
                            if (isNaN(xp) || xp == '') {
                                xp = 0;
                            }
                            int.xp = xp;
                            selectedInt.push(int);
                        });
                        if (selectedInt.length == 0) {
                            addNotification(M.util.get_string('selectinteraction', 'mod_interactivevideo'), 'danger');
                            return;
                        } else {
                            let interactions = await $.ajax({
                                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                                method: "POST",
                                dataType: "text",
                                data: {
                                    action: 'import_annotations',
                                    sesskey: M.cfg.sesskey,
                                    contextid: M.cfg.contextid,
                                    annotations: JSON.stringify(selectedInt),
                                    tocourse: M.cfg.courseId,
                                    fromcourse: $('#importcourse').val(),
                                    tocm: interaction,
                                    fromcm: $('#importcm').val(),
                                    module: coursemodule
                                }
                            });
                            interactions = JSON.parse(interactions);

                            // Dismiss modal.
                            $('#importmodal').modal('hide');

                            // Add the imported annotations to the current annotations.
                            annotations = annotations.concat(interactions);
                            dispatchEvent('annotationupdated', {
                                annotations: annotations,
                                action: 'import'
                            });

                            // Get interaction that allowmultiple false and init each one.
                            interactions.forEach(int => {
                                if (!int.allowmultiple) {
                                    ctRenderer[int.type].init();
                                }
                            });
                        }
                    });
            });

            // Implement content type filter.
            $(document).on('keyup', '#contentmodal #contentsearch', function() {
                let search = $(this).val().toLowerCase();

                $('#addcontentdropdown .dropdown-item').removeClass('d-none').addClass('d-flex');

                if (search == '') {
                    return;
                }

                $('#contentmodal #addcontentdropdown .dropdown-item').each(function() {
                    let text = $(this).find('.contenttype-title').text().toLowerCase();
                    if (text.includes(search)) {
                        $(this).addClass('d-flex').removeClass('d-none');
                    } else {
                        $(this).addClass('d-none').removeClass('d-flex');
                    }
                });
            });

            // Implement fast forward and rewind.
            const fastforward = async(e) => {
                let time = await player.getCurrentTime();
                if (time >= end) {
                    return;
                }
                if (e.ctrlKey || e.metaKey) {
                    time += 1;
                } else {
                    time += 0.2;
                }
                if (time > end) {
                    time = end;
                }
                await player.seek(time);
            };
            $(document).on('click', '#fast-forward', async function(e) {
                e.preventDefault();
                fastforward(e);
            });

            let fastForwardInterval;
            $(document).on('mousedown', '#fast-forward', async function(e) {
                e.preventDefault();
                fastForwardInterval = setInterval(async() => {
                    fastforward(e);
                    if (await player.getCurrentTime() >= end) {
                        clearInterval(fastForwardInterval);
                    }
                }, 200);
            });

            $(document).on('mouseup mouseleave', '#fast-forward', function() {
                clearInterval(fastForwardInterval);
            });

            const rewind = async(e) => {
                let time = await player.getCurrentTime();
                if (time <= start) {
                    return;
                }
                if (e.ctrlKey || e.metaKey) {
                    time -= 1;
                } else {
                    time -= 0.2;
                }
                if (time < start) {
                    time = start;
                }
                await player.seek(time);
            };
            $(document).on('click', '#rewind', async function(e) {
                e.preventDefault();
                rewind(e);
            });

            let rewindInterval;
            $(document).on('mousedown', '#rewind', async function(e) {
                e.preventDefault();
                rewindInterval = setInterval(async() => {
                    rewind(e);
                    if (await player.getCurrentTime() <= start) {
                        clearInterval(rewindInterval);
                    }
                }, 200);
            });

            $(document).on('mouseup mouseleave', '#rewind', function() {
                clearInterval(rewindInterval);
            });

            // Remove all event listeners before leaving the page.
            window.addEventListener('beforeunload', function() {
                $(document).off();
                cancelAnimationFrame(onPlayingInterval);
            });

            // Event lister for bulk action.
            $(document).on('click', '#annotation-list-bulk-edit', async function(e) {
                e.preventDefault();
                document.body.focus();
                if ($(this).hasClass('active')) {
                    // Remove all checkboxes.
                    $('#annotation-list').find('.form-check').remove();
                    $(this).removeClass('active');
                    $('#annotation-list').find('tr').each(function() {
                        $(this).removeClass('b-active');
                    });
                    $('body').removeClass('iv-bulk-edit');
                    $('#annotation-list-bulk-checkall').addClass('d-none');
                    return;
                }
                $(this).addClass('active');
                $('#annotation-list-bulk-checkall').removeClass('d-none active');
                $('body').addClass('iv-bulk-edit');
                let li = $('#annotation-list').find('tr');
                li.each(function() {
                    let id = $(this).data('id');
                    let type = $(this).data('type');
                    // Find first td.
                    let td = $(this).find('td').first().find('div');
                    td.prepend(`<div class="form-check form-check-inline iv-mr-0">
                        <input class="form-check-input" type="checkbox" data-type="${type}" id="annotation-${id}" value="${id}">
                        <label class="form-check-label" for="annotation-${id}"></label></div>`);
                });
            });

            // Event lister for bulk check all.
            $(document).on('click', '#annotation-list-bulk-checkall', function(e) {
                e.preventDefault();
                let check = !$(this).hasClass('active');

                // Uncheck all checkboxes.
                $('tr.annotation .form-check-input').each(function() {
                    if ((!$(this).is(':checked') && check) || ($(this).is(':checked') && !check)) {
                        $(this).trigger('click');
                    }
                });

                $(this).toggleClass('active');

            });

            $(document).on('click', 'tr.annotation .form-check-input', function(e) {
                e.stopImmediatePropagation();
                if ($(this).is(':checked')) {
                    $(this).closest('tr').addClass('b-active');
                } else {
                    $(this).closest('tr').removeClass('b-active');
                }

                let checked = $('#annotation-list').find('tr .form-check-input:checked');

                if (checked.length == 0) {
                    $('#annotation-list-bulk .bulk-actions').hide();
                } else {
                    $('#annotation-list-bulk .bulk-actions').show();
                }
            });

            $(document).on('click', '#annotation-list-bulk-delete', async function(e) {
                e.preventDefault();
                let ids = [];
                let types = [];
                let checked = $('#annotation-list').find('tr .form-check-input:checked');
                checked.each(function() {
                    ids.push($(this).val());
                    types.push($(this).data('type'));
                });
                if (ids.length == 0) {
                    return;
                }
                const promises = ids.map((id, index) => {
                    return new Promise((resolve) => {
                        let type = types[index];
                        ctRenderer[type].deleteAnnotation(annotations, id, true);
                        resolve();
                    });
                });

                await Promise.all(promises);
                dispatchEvent('annotationsdeleted', {
                    annotations: this.annotations,
                    ids: ids,
                });
            });

            $(document).on('click', '#annotation-list-bulk-copy', async function(e) {
                e.preventDefault();
                let copiedIds = $('#annotation-list').find('tr .form-check-input:checked')
                    .map(function() {
                        return $(this).val();
                    }).get();
                if (copiedIds.length == 0) {
                    return;
                }
                let copiedAnnotations = annotations.filter(x => copiedIds.includes(x.id));
                copiedAnnotations = copiedAnnotations.map(function(item) {
                    item.wwwroot = M.cfg.wwwroot;
                    return item;
                });
                copiedAnnotations = JSON.stringify(copiedAnnotations);
                // Copy to storage.
                window.localStorage.setItem('copiedAnnotations', copiedAnnotations);
                $('#annotation-list-bulk-paste').removeAttr('disabled');
                $('#annotation-list-bulk-paste').addClass('btn-primary');
                $('#annotation-list-bulk-paste').find('i').removeClass('bi-clipboard').addClass('bi-clipboard-fill');
                addNotification(M.util.get_string('annotationscopied', 'mod_interactivevideo'), 'success');
            });

            $(document).on('click', '#annotation-list-bulk-download', async function(e) {
                e.preventDefault();
                $(this).attr('disabled', 'disabled');
                $(this).find('i').addClass('fa-spin fa-circle-o-notch fa').removeClass('bi bi-download');
                let downloadIds = $('#annotation-list').find('tr .form-check-input:checked')
                    .map(function() {
                        return $(this).val();
                    }).get();

                if (downloadIds.length == 0) {
                    return;
                }

                let copiedAnnotations = annotations.filter(x => downloadIds.includes(x.id));
                copiedAnnotations = copiedAnnotations.map(function(item) {
                    item.wwwroot = M.cfg.wwwroot;
                    return item;
                });

                const downloadTask = await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'download_annotations',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        courseid: course,
                        annotations: JSON.stringify(copiedAnnotations).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                        cmid: coursemodule
                    }
                });

                window.open(downloadTask, '_blank');

                $(this).removeAttr('disabled');
                $(this).find('i').removeClass('fa-spin fa-circle-o-notch fa').addClass('bi bi-download');
            });

            // Bulk set as defaults.
            $(document).on('click', '#annotation-list-bulk-setdefault', async function(e) {
                e.preventDefault();
                let selectedIds = $('#annotation-list').find('tr .form-check-input:checked')
                    .map(function() {
                        return $(this).val();
                    }).get();
                if (selectedIds.length == 0) {
                    return;
                }
                let selectedAnnotations = annotations.filter(x => selectedIds.includes(x.id));
                // Make sure the annotations are unique based on type.
                selectedAnnotations = selectedAnnotations.filter((item, index, self) =>
                    index === self.findIndex((t) => (
                        t.type === item.type
                    ))
                );

                await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'set_defaults',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        courseid: course,
                        defaults: JSON.stringify(selectedAnnotations),
                    }
                });
                // Trigger the -edit button to reset the view.
                $('#annotation-list-bulk-edit').trigger('click');
                addNotification(M.util.get_string('annotationssavedasdefaults', 'mod_interactivevideo'), 'success');
            });

            // Bulk upload.
            let ModalForm;
            $(document).on('click', '#annotation-list-bulk-upload', async function(e) {
                e.preventDefault();
                if (!ModalForm) {
                    ModalForm = await import('core_form/modalform');
                }

                const data = {
                    contextid: M.cfg.contextid,
                    id: coursemodule,
                    courseid: course,
                    annotationid: interaction,
                    prevent: annotations.filter(x => JSON.parse(x.prop).allowmultiple == false).map(x => x.type).join(','),
                };

                let title = M.util.get_string('uploadannotations', 'mod_interactivevideo');
                const form = new ModalForm({
                    modalConfig: {
                        title: title,
                    },
                    formClass: "mod_interactivevideo\\form\\bulk_upload_form",
                    args: data,
                });

                form.show();

                form.addEventListener(form.events.FORM_SUBMITTED, async(e) => {
                    let imported = e.detail.new;
                    // Check if the imported annotations are valid.
                    imported = imported.filter(x => contentTypes.find(y => y.name === x.type));
                    annotations = annotations.concat(imported);
                    dispatchEvent('annotationupdated', {
                        annotations: annotations,
                        action: 'import'
                    });
                });
            });

            window.addEventListener('storage', function(e) {
                // Activate paste button on other tabs.
                e.stopImmediatePropagation();
                if (e.key === 'copiedAnnotations') {
                    // Activate paste button.
                    $('#annotation-list-bulk-paste').removeAttr('disabled');
                    $('#annotation-list-bulk-paste').addClass('btn-primary');
                    $('#annotation-list-bulk-paste').find('i').removeClass('bi-clipboard').addClass('bi-clipboard-fill');
                }
            });

            // Activate paste button on page load if there are copied annotations.
            let copiedAnnotations = window.localStorage.getItem('copiedAnnotations');
            if (copiedAnnotations !== null) {
                // Don't activate if the same cm.
                copiedAnnotations = JSON.parse(copiedAnnotations);
                if (copiedAnnotations[0].cmid == coursemodule) {
                    return;
                }
                // Activate paste button.
                $('#annotation-list-bulk-paste').removeAttr('disabled');
                $('#annotation-list-bulk-paste').addClass('btn-primary');
                $('#annotation-list-bulk-paste').find('i').removeClass('bi-clipboard').addClass('bi-clipboard-fill');
            }

            // Paste annotations.
            $(document).on('click', '#annotation-list-bulk-paste', async function(e) {
                e.preventDefault();
                let copiedAnnotations = window.localStorage.getItem('copiedAnnotations');
                if (copiedAnnotations === null) {
                    return;
                }
                copiedAnnotations = JSON.parse(copiedAnnotations);
                // Make sure we don't copy the interaction with allowmultiple false;
                copiedAnnotations = copiedAnnotations.filter(x => {
                    let allowmultiple = JSON.parse(x.prop).allowmultiple;
                    return allowmultiple || (!allowmultiple && !annotations.find(y => y.type == x.type));
                });
                if (copiedAnnotations.length == 0) {
                    addNotification(M.util.get_string('annotationscopied', 'mod_interactivevideo'), 'danger');
                    return;
                }
                const fromCourse = copiedAnnotations[0].courseid;
                const fromCm = copiedAnnotations[0].cmid;
                const toCourse = course;
                // If it is from the same cm, we need to change the title.
                if (fromCm == coursemodule) {
                    copiedAnnotations = copiedAnnotations.filter(a => a.type != 'skipsegment').map(function(item) {
                        if (item.timestamp >= 0) {
                            item.timestamp = Number(item.timestamp) + 0.1;
                            item.title = item.title + ' (' + M.util.get_string('copynoun', 'mod_interactivevideo') + ')';
                        }
                        return item;
                    });
                }

                let interactions = await $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'import_annotations',
                        sesskey: M.cfg.sesskey,
                        contextid: M.cfg.contextid,
                        annotations: JSON.stringify(copiedAnnotations),
                        tocourse: toCourse,
                        fromcourse: fromCourse,
                        tocm: interaction,
                        fromcm: fromCm,
                        module: coursemodule
                    }
                });
                interactions = JSON.parse(interactions);
                // Add the imported annotations to the current annotations.
                annotations = annotations.concat(interactions);
                dispatchEvent('annotationupdated', {
                    annotations: annotations,
                    action: 'import'
                });

                // Get interaction that allowmultiple false and init each one.
                interactions.forEach(int => {
                    if (!int.allowmultiple) {
                        ctRenderer[int.type].init();
                    }
                });

            });

            // Bulk deleted
            $(document).on('annotationsdeleted', function(e) {
                const ids = e.originalEvent.detail.ids;
                ids.forEach(function(id) {
                    $(`tr[data-id="${id}"]`).addClass('deleted');
                });
                $('#annotation-list-bulk-edit').trigger('click');
                setTimeout(function() {
                    annotations = annotations.filter(function(item) {
                        return !ids.includes(item.id);
                    });
                    renderAnnotationItems(annotations);
                    addNotification(M.util.get_string('interactionsdeleted', 'mod_interactivevideo', ids.length), 'success');
                }, 1000);
            });

            // Implement keyboard shortcuts.

            document.addEventListener('keydown', async function(e) {
                // Ignore spacebar when focus is on an input, textarea, or button
                const activeTag = document.activeElement.tagName.toLowerCase();
                if (activeTag !== 'body') {
                    return;
                }

                if ($('body').hasClass('disablekb')) {
                    return;
                }

                if (e.code === 'Space') {
                    e.preventDefault(); // Prevent page scroll.
                    if (await player.isPaused()) {
                        player.play();
                    } else {
                        player.pause();
                    }
                } else if (e.code === 'KeyA' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    // Launch add content modal.
                    $addcontent.trigger('click');
                } else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    // Fast forward.
                    let time = await player.getCurrentTime();
                    if (time >= end || time + 1 > end) {
                        return;
                    }
                    player.seek(time + 1);
                } else if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    // Rewind 10 seconds.
                    let time = await player.getCurrentTime();
                    if (time <= start || time - 1 < start) {
                        return;
                    }
                    player.seek(time - 1);
                } else if (e.code === 'KeyI') {
                    e.preventDefault();
                    // Launch import content modal.
                    $('#importcontent').trigger('click');
                } else if (e.code === 'KeyX') {
                    e.preventDefault();
                    // Launch delete content modal.
                    $('#annotation-list-bulk-delete').trigger('click');
                } else if (e.code === 'KeyD') {
                    e.preventDefault();
                    // Launch download content modal.
                    $('#annotation-list-bulk-download').trigger('click');
                } else if (e.code === 'KeyC') {
                    e.preventDefault();
                    // Launch copy content modal.
                    $('#annotation-list-bulk-copy').trigger('click');
                } else if (e.code === 'KeyP') {
                    e.preventDefault();
                    // Launch paste content modal.
                    $('#annotation-list-bulk-paste').trigger('click');
                } else if (e.code === 'KeyE') {
                    e.preventDefault();
                    // Launch edit content modal.
                    $('#annotation-list-bulk-edit').trigger('click');
                } else if (e.code === 'KeyA' && (e.ctrlKey || e.metaKey) && $('#annotation-list-bulk-edit').hasClass('active')) {
                    e.preventDefault();
                    // Launch add content modal.
                    $('#annotation-list-bulk-checkall').trigger('click');
                } else if (e.code === 'KeyU') {
                    e.preventDefault();
                    // Launch upload content modal.
                    $('#annotation-list-bulk-upload').trigger('click');
                } else if (e.code === 'Equal') {
                    e.preventDefault();
                    // Launch download content modal.
                    $('#zoomin').trigger('click');
                } else if (e.code === 'Minus') {
                    e.preventDefault();
                    // Launch download content modal.
                    $('#zoomout').trigger('click');
                } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    // Save content.
                    $('#savedraft').trigger('click');
                }
            });
        }
    };
});