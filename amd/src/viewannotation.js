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
 * View page module
 *
 * @module     mod_interactivevideo/viewannotation
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([
    'jquery', 'core/event_dispatcher', 'core/toast', 'mod_interactivevideo/quickform', 'mod_interactivevideo/libraries/jquery-ui'
], function($, eventDispatcher, Toast, quickform) {
    const {dispatchEvent} = eventDispatcher;
    const ctRenderer = {};
    let annotations, // Array of annotations.
        totaltime, // Video total time.
        activityType, // Current activityType.
        viewedAnno = [], // Array of viewed annotations.
        contentTypes, // Array of available content types.
        displayoptions, // Display options.
        releventAnnotations, // Array of annotations that are not skipped.
        completionid, // Id of the completion record.
        player, // Video player instance.
        lastrun; // Last run annotation.

    const $videoNav = $('#video-nav');
    const $interactionNav = $('#interactions-nav');
    const $loader = $('#background-loading');
    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        let string = '';
        if (hours > 0) {
            string += hours + 'h ';
        }
        if (minutes > 0) {
            string += minutes + 'm ';
        }
        if (remainingSeconds > 0) {
            string += remainingSeconds + 's';
        }
        return string;
    };

    const renderAnnotationItems = async(annos, start, totaltime) => {
        releventAnnotations = annos;
        window.IVANNO = annos;
        let actualduration = totaltime;

        const skipsegments = annos.filter(x => x.type == 'skipsegment');

        if (skipsegments.length > 0) {
            skipsegments.forEach(x => {
                const length = (Number(x.title) - Number(x.timestamp));
                actualduration -= length;
            });
        }

        const completableAnno = releventAnnotations.filter(x => x.hascompletion == 1);
        const actualAnnotationCounts = completableAnno.length;

        const xp = completableAnno.map(x => Number(x.xp)).reduce((a, b) => a + b, 0);

        const completedAnnos = completableAnno
            .filter(x => x.completed);

        const xpEarned = completedAnnos.map(x => Number(x.earned)).reduce((a, b) => a + b, 0);

        $(".metadata").empty();
        if (actualAnnotationCounts > 0) {
            $(".metadata").append(`<span class="d-inline-block mr-3">
            <i class="bi bi-stopwatch mr-2"></i>${formatTime(Math.ceil(actualduration))}</span>
            <span class="d-inline-block mr-3">
        <i class="bi bi-bullseye mr-2"></i>${completedAnnos.length} / ${actualAnnotationCounts}</span>
        <span class="d-inline-block"><i class="bi bi-star mr-2"></i>${xpEarned} / ${xp}</span>`);
        }

        $("#interactions-nav ul").empty();

        if (displayoptions.preventseeking == 1) {
            $videoNav.addClass('no-pointer-events');
        }

        if (displayoptions.hidemainvideocontrols == 1 || displayoptions.hideinteractions == 1) {
            if (displayoptions.hidemainvideocontrols == 1) {
                $('#wrapper').addClass('no-videonav');
            }
            dispatchEvent('annotationitemsrendered', {
                'annotations': annos,
                'completed': completedAnnos.length,
                'total': actualAnnotationCounts,
                'xp': xpEarned,
                'totalxp': xp,
            });
            return;
        }
        for (const x of annos) {
            const renderer = ctRenderer[x.type];
            await renderer.renderItemOnVideoNavigation(x);
        }
        dispatchEvent('annotationitemsrendered', {
            'annotations': annos,
            'completed': completedAnnos.length,
            'total': actualAnnotationCounts,
            'xp': xpEarned,
            'totalxp': xp,
        });

        // Handle the chapter list.
        $('.annolistinchapter').empty();
        const chapteritems = releventAnnotations.filter(x => x.type != 'skipsegment'
            && x.hascompletion == 1);
        chapteritems.sort((a, b) => a.timestamp - b.timestamp);
        chapteritems.forEach((x) => {
            const advanced = JSON.parse(x.advanced);
            if ((advanced.visiblebeforecompleted == "1" && !x.completed)
                || (advanced.visibleaftercompleted == "1" && x.completed)) {
                $('[data-region="chapterlists"] li').each(function() {
                    const cstart = $(this).data('start');
                    const cend = $(this).data('end');
                    if (x.timestamp >= cstart && x.timestamp < cend) {
                        $(this).find('.annolistinchapter')
                            .append(`<li class="border-bottom anno d-flex align-items-center justify-content-between
                         px-3 py-2 ${x.completed ? "completed" : ""}" data-id="${x.id}" data-timestamp="${x.timestamp}">
                         <span class="text-nowrap">
                         <i class="small bi ${x.completed ? "bi-check-circle-fill text-success" : 'bi-circle'} mr-2"></i>
                         <i class="${JSON.parse(x.prop).icon} mr-2"></i></span>
                         <span class="flex-grow-1 text-truncate">${x.formattedtitle}</span>
                         <span class="text-nowrap">${x.xp}<i class="bi bi-star ml-1"></i></span></li>`);
                    }
                });
            }
        });
        dispatchEvent('chapterrendered', {'annotations': releventAnnotations});
    };

    return {
        /**
         * Render annotation items on the video navigation and chapter list.
         */
        renderAnnotationItems: renderAnnotationItems,
        /**
         * Initialize the view annotation on page loads.
         * @param {string} url - The video url.
         * @param {number} cmid - The course module id.
         * @param {number} interaction - Interactive video instance.
         * @param {number} course - The course id.
         * @param {number} userid - The user id.
         * @param {number} start - The start time of the video.
         * @param {number} end - The end time of the video.
         * @param {number} completionpercentage - The completion percentage.
         * @param {number} gradeiteminstance - The grade item instance.
         * @param {number} grademax - The grade max.
         * @param {string} vtype - The video type.
         * @param {boolean} preventskip - Prevent user from skipping the video.
         * @param {number} moment - The moment to share.
         * @param {object} doptions - The display options.
         * @param {string} token - The token.
         * @param {string} extendedcompletion - The extended completion requirements.
         * @param {boolean} isPreviewMode - The preview mode flag.
         * @return {void}
         */
        init: function(
            url, cmid, interaction, course, userid, start = 0, end,
            completionpercentage, gradeiteminstance, grademax, vtype,
            preventskip = true, moment = null, doptions = {}, token = null, extendedcompletion = null, isPreviewMode = false) {

            quickform({
                contextid: M.cfg.contextid,
                courseid: course,
                cmid,
                interaction,
            });

            // Convert start to number if string
            start = Number(start);
            if (isNaN(start)) {
                start = 0;
            }

            // Convert end to number if string
            end = Number(end);
            if (isNaN(end)) {
                end = null;
            }

            displayoptions = doptions;

            let playerReady = false;
            let uprogress = null;

            if (localStorage.getItem('limitedwidth') == 'true' && displayoptions.hidemainvideocontrols == 0) {
                $('body').addClass('limited-width');
                $('#controller #expand i').removeClass('bi-file').addClass('bi-square');
            }

            if (vtype == 'spotify') { // Spotify player.
                $('body').addClass('limited-width');
            }

            /**
             * Function to convert seconds to HH:MM:SS format.
             * @param {number} seconds
             * @returns {string}
             */
            const convertSecondsToHMS = (seconds) => {
                if (seconds < 0) {
                    return '00:00';
                }
                const h = Math.floor(seconds / 3600);
                const m = Math.floor(seconds % 3600 / 60);
                const s = Math.floor(seconds % 3600 % 60);
                return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            };

            /**
             * Function to replace the progress bars on the video navigation.
             * @param {number} percentage
             * @returns {Promise<boolean>}
             */
            const replaceProgressBars = (percentage) => {
                return new Promise((resolve) => {
                    percentage = percentage > 100 ? 100 : percentage;
                    let time = percentage / 100 * totaltime;
                    $('#currenttime').text(convertSecondsToHMS(time));
                    $('#remainingtime').text(convertSecondsToHMS(totaltime - time));
                    $videoNav.find('#progress').css('width', percentage + '%');
                    $videoNav.find('#seekhead').css('left', percentage + '%');
                    resolve(true);
                });
            };

            /**
             * Function to get all annotations from the database and render them.
             * @returns {Promise}
             */
            const getAnnotations = () => {
                // Get all interaction items.
                const annnoitems = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_items',
                        sesskey: M.cfg.sesskey,
                        id: interaction,
                        contextid: M.cfg.courseContextId,
                        token: token,
                        cmid: cmid
                    }
                });

                // Get current user progress.
                const userprogress = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_progress',
                        sesskey: M.cfg.sesskey,
                        id: interaction,
                        uid: userid,
                        token: token,
                        cmid: cmid,
                        contextid: M.cfg.contextid,
                        previewmode: isPreviewMode ? 1 : 0
                    }
                });

                // Get all content types.
                const getContentTypes = $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'get_all_contenttypes',
                        sesskey: M.cfg.sesskey,
                        token: token,
                        cmid: cmid,
                        contextid: M.cfg.contextid
                    }
                });

                $.when(annnoitems, userprogress, getContentTypes).done(async function(annos, progress, ct) {
                    annotations = JSON.parse(annos[0]);
                    if (player.live) { // Live video does not have end time.
                        annotations = [];
                    }
                    progress = JSON.parse(progress[0]);
                    uprogress = progress;
                    contentTypes = JSON.parse(ct[0]);
                    completionid = progress.id;
                    let completiondetails = JSON.parse(progress.completiondetails || '[]');
                    if (typeof completiondetails == 'object') {
                        completiondetails = Object.values(completiondetails);
                    }
                    annotations = filterAnnotations(annotations, contentTypes, start, end);
                    annotations = processAnnotations(annotations, contentTypes, progress, start, end, completiondetails);
                    annotations.sort((a, b) => a.timestamp - b.timestamp);

                    releventAnnotations = getRelevantAnnotations(annotations, start, end, contentTypes);
                    window.ANNOS = releventAnnotations;
                    if (releventAnnotations.length > 0 && !releventAnnotations.find(x => x.type == 'chapter')) {
                        prependDummyChapter(releventAnnotations, start, contentTypes);
                    }

                    await initializeContentTypeRenderers(contentTypes, releventAnnotations, player, interaction, course, userid,
                        completionpercentage, gradeiteminstance, grademax, vtype, preventskip,
                        totaltime, start, end, cmid, token, completionid);

                    await renderAnnotationItems(releventAnnotations, start, end - start);
                    $("#play").removeClass('d-none');
                    $("#spinner").remove();
                    $("#video-info").toggleClass('d-none d-flex');
                    return new Promise((resolve) => {
                        resolve();
                    });
                });

                /**
                 * Filters annotations based on content types and a time range.
                 *
                 * @param {Array} annotations - The list of annotations to filter.
                 * @param {Array} contentTypes - The list of content types to include.
                 * @param {number} start - The start time of the range.
                 * @param {number} end - The end time of the range.
                 * @returns {Array} - The filtered list of annotations.
                 */
                function filterAnnotations(annotations, contentTypes, start, end) {
                    return annotations.filter(annotation => {
                        const inContentType = contentTypes.some(y => y.name === annotation.type);
                        if (!inContentType) {
                            return false;
                        }

                        if (annotation.type === 'skipsegment') {
                            return !(annotation.timestamp > end || annotation.title < start);
                        }

                        return (annotation.timestamp >= start && annotation.timestamp <= end) || annotation.timestamp < 0;
                    });
                }

                /**
                 * Maps and processes annotations based on provided content types, progress, and time range.
                 *
                 * @param {Array} annotations - The list of annotations to be processed.
                 * @param {Array} contentTypes - The list of content types to match with annotations.
                 * @param {Object} progress - The progress object containing completed items.
                 * @param {number} start - The start time of the segment.
                 * @param {number} end - The end time of the segment.
                 * @param {Object} completiondetails - The completion details object.
                 * @returns {Array} - The processed list of annotations.
                 */
                function processAnnotations(annotations, contentTypes, progress, start, end, completiondetails) {
                    const completedItems = progress.completeditems == '' ? [] : JSON.parse(progress.completeditems);
                    const contentTypeMap = new Map(contentTypes.map(ct => [ct.name, ct]));
                    return annotations.map(annotation => {
                        annotation.timestamp = Number(annotation.timestamp);
                        annotation.xp = Number(annotation.xp);
                        const completionitem = completiondetails.find(x => JSON.parse(x).id == annotation.id);
                        if (completionitem) {
                            annotation.earned = Number(JSON.parse(completionitem).xp);
                        } else {
                            annotation.earned = 0;
                        }
                        if (annotation.type == 'skipsegment') {
                            annotation.title = Number(annotation.title);
                            if (annotation.timestamp < start && annotation.title > start) {
                                annotation.timestamp = start;
                            }
                            if (annotation.title > end && annotation.timestamp < end) {
                                annotation.title = end;
                            }
                        }
                        annotation.prop = JSON.stringify(contentTypeMap.get(annotation.type));
                        annotation.completed = completedItems.indexOf(annotation.id) > -1;

                        let advanced;
                        try {
                            advanced = JSON.parse(annotation.advanced);
                        } catch (e) {
                            advanced = null;
                        }
                        annotation.rerunnable = advanced && advanced.replaybehavior === '1';

                        return annotation;
                    });
                }

                /**
                 * Filters and returns relevant annotations within a specified time range,
                 * excluding those that fall within skip segments.
                 *
                 * @param {Array} annotations - The list of annotations to filter.
                 * @returns {Array} - The filtered list of relevant annotations.
                 */
                function getRelevantAnnotations(annotations) {
                    const skipsegments = annotations.filter(annotation => annotation.type == 'skipsegment');
                    let releventAnnotations = [];
                    annotations.forEach(annotation => {
                        let shouldAdd = true;
                        skipsegments.forEach(skipsegment => {
                            if (Number(annotation.timestamp) > Number(skipsegment.timestamp)
                                && Number(annotation.timestamp) < Number(skipsegment.title)) {
                                shouldAdd = false;
                            }
                        });
                        if (shouldAdd) {
                            releventAnnotations.push(annotation);
                            if (isPreviewMode) {
                                annotation.completed = true;
                                annotation.previewMode = true;
                            }
                        }
                    });
                    return releventAnnotations;
                }

                /**
                 * Adds a dummy chapter annotation to the beginning of the relevant annotations array.
                 *
                 * @param {Array} releventAnnotations - The array of relevant annotations to which the dummy chapter will be added.
                 * @param {number} start - The timestamp at which the dummy chapter starts.
                 * @param {Array} contentTypes - The array of content types to find the chapter type from.
                 */
                function prependDummyChapter(releventAnnotations, start, contentTypes) {
                    releventAnnotations.unshift({
                        id: 0,
                        title: M.util.get_string('startchapter', 'mod_interactivevideo'),
                        formattedtitle: M.util.get_string('startchapter', 'mod_interactivevideo'),
                        timestamp: start,
                        type: 'chapter',
                        prop: JSON.stringify(contentTypes.find(x => x.name == 'chapter')),
                        xp: 0,
                        completed: true,
                        hide: true
                    });
                }

                /**
                 * Asynchronously loads and initializes content type renderers for interactive video annotations.
                 *
                 * @param {Array} contentTypes - Array of content type objects.
                 * @param {Array} releventAnnotations - Array of relevant annotation objects.
                 * @param {Object} player - The video player instance.
                 * @param {Object} interaction - The interaction object.
                 * @param {Object} course - The course object.
                 * @param {number} userid - The user ID.
                 * @param {number} completionpercentage - The completion percentage.
                 * @param {number} gradeiteminstance - The grade item instance.
                 * @param {number} grademax - The maximum grade.
                 * @param {string} vtype - The video type.
                 * @param {boolean} preventskip - Flag to prevent skipping.
                 * @param {number} totaltime - The total time of the video.
                 * @param {number} start - The start time of the video.
                 * @param {number} end - The end time of the video.
                 * @param {number} cmid - The course module ID.
                 * @param {string} token - The authentication token.
                 * @param {number} completionid - Completion record id.
                 */
                async function initializeContentTypeRenderers(contentTypes, releventAnnotations,
                    player, interaction, course, userid, completionpercentage, gradeiteminstance,
                    grademax, vtype, preventskip, totaltime, start, end, cmid, token, completionid) {
                    const chapterContentType = contentTypes.find(x => x.name == 'chapter');
                    contentTypes = contentTypes.filter(x => releventAnnotations.map(y => y.type).includes(x.name));
                    if (contentTypes.length == 0) {
                        $('#chaptertoggle, #chapter-container-left, #chapter-container-right').remove();
                        return;
                    } else {
                        $('#chaptertoggle, #chapter-container-left, #chapter-container-right').removeClass('d-none');
                    }
                    if (!contentTypes.find(x => x.name == 'chapter')) {
                        contentTypes.push(chapterContentType);
                    }
                    await Promise.all(contentTypes.map(contentType => {
                        return new Promise((resolve) => {
                            require([contentType.amdmodule], function(Type) {
                                ctRenderer[contentType.name] = new Type(player, releventAnnotations, interaction, course, userid,
                                    completionpercentage, gradeiteminstance, grademax, vtype, preventskip, totaltime, start,
                                    end, contentType, cmid, token, displayoptions, completionid, extendedcompletion, {
                                    isPreviewMode: isPreviewMode
                                });
                                try {
                                    ctRenderer[contentType.name].init();
                                } catch (error) {
                                    // Do nothing.
                                }
                                resolve();
                            });
                        });
                    }));
                }
            };

            /**
             * Run the interaction.
             * @param {object} annotation annotation object
             * @param {boolean} force force run the interaction
             * @returns {void}
             */
            const runInteraction = async(annotation, force = false) => {
                // First making sure the player is paused.
                player.pause();
                let isPaused = await player.isPaused();
                if (!isPaused) {
                    runInteraction(annotation);
                    return;
                }
                // Continue with the interaction. Take notes of the earlier interactions to avoid accidental re-runs.
                lastrun = annotation.id;
                viewedAnno = [];
                // Put all annotations with timestamp < annotation.timestamp in the viewedAnno.
                releventAnnotations.forEach(x => {
                    if (Number(x.timestamp) <= Number(annotation.timestamp)) {
                        viewedAnno.push(Number(x.id));
                    }
                });
                viewedAnno.push(Number(annotation.id));
                viewedAnno = [...new Set(viewedAnno)];

                // Remove the previous message but keep the one below the video.
                $('#annotation-modal').modal('hide');
                $('#message').not('[data-placement=bottom]').not('.sticky').not(`[data-id=${annotation.id}]`).remove();
                $('#end-screen, #start-screen').fadeOut(300);

                if (preventskip) {
                    const theAnnotations = releventAnnotations
                        .filter(x => Number(x.timestamp) < Number(annotation.timestamp)
                            && x.completed == false && x.hascompletion == 1);
                    if (theAnnotations.length > 0) {
                        const theAnnotation = theAnnotations[0];
                        await player.pause();
                        await player.seek(theAnnotation.timestamp);
                        runInteraction(theAnnotation);
                        Toast.add(M.util.get_string('youmustcompletethistaskfirst', 'mod_interactivevideo'), {
                            type: 'danger'
                        });
                        return;
                    }
                }

                // If the annotation has displayoptions == 'side' and it is already run, then we don't need to run it again.
                // But we need to show the message.
                if (annotation.displayoptions == 'side' && $(`.sidebar-nav-item[data-id=${annotation.id}]`).length > 0 && !force) {
                    if (!$('body').hasClass('hassidebar')) {
                        // Toggle the drawer.
                        $('#annotation-toggle').trigger('click');
                    }
                    $(`.sidebar-nav-item[data-id=${annotation.id}]`).trigger('click');
                } else {
                    activityType = ctRenderer[annotation.type];
                    setTimeout(() => {
                        activityType.runInteraction(annotation);
                        // In case there is an active interaction, trigger the interactionclose event.
                        if ($('#message.active').length > 0) {
                            $('#message.active').each(function() {
                                const id = $(this).data('id');
                                if (id != annotation.id) {
                                    $(this).removeClass('active');
                                    dispatchEvent('interactionclose', {'annotation': {'id': id}});
                                }
                            });
                        }
                        dispatchEvent('interactionrun', {'annotation': annotation});
                    }, 100);
                }

            };

            /**
             * Shares a specific moment in the video by seeking to the given timestamp and playing the video.
             * If the timestamp is within the valid range, it hides the start screen, seeks to the timestamp,
             * plays the video, runs the relevant annotation interaction, and updates the progress bars.
             * Finally, it removes the timestamp parameter from the URL.
             *
             * @async
             * @function shareMoment
             * @returns {Promise<void>} A promise that resolves when the video has been successfully sought and played.
             */
            const shareMoment = async() => {
                if (!moment) {
                    return;
                }
                // Check if the url has a timestamp using url params.
                const urlParams = new URLSearchParams(window.location.search);
                urlParams.delete('t');
                const newurl = window.location.protocol
                    + '//' + window.location.host + window.location.pathname + '?' + urlParams.toString();
                window.history.replaceState(null, null, newurl);
            };

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
                            id: interaction,
                            cmid: cmid,
                            courseid: course,
                            start: start,
                            end: !end || end == 0 ? duration : end,
                            contextid: M.cfg.contextid
                        }
                    });
                }
                end = !end || end == 0 || end > duration ? duration : end;
                return {start, end};
            };

            let loaded = false;
            let lookbacktime = 0;

            const onLoaded = async() => {
                if (loaded) {
                    return;
                }
                if (displayoptions.passwordprotected == 1 && player.support.password) {
                    // Remove start screen, set .video-block to d-none, #annotation-canvas remove d-none.
                    $('#start-screen').removeClass('d-none');
                    $('.video-block').removeClass('no-pointer bg-transparent');
                }
                loaded = true;
                // Add player to Window object.
                window.IVPLAYER = player;
                lookbacktime = Math.max(0.5, player.frequency); // How far back to look for annotations.
                // Check if the player supports playback rate and quality adjustments.
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

                const duration = player.totaltime;
                ({start, end} = await updateTime(duration));
                totaltime = end - start;

                $('#duration').text(convertSecondsToHMS(totaltime));

                // Recalculate the ratio of the video
                let ratio = 16 / 9;
                if (!displayoptions.usefixedratio || displayoptions.usefixedratio == 0) {
                    ratio = player.aspectratio;
                }
                $("#video-wrapper").css('padding-bottom', (1 / ratio) * 100 + '%');
                let gap = '125px';
                if ($("body").hasClass('embed-mode')) {
                    if (displayoptions.hidemainvideocontrols == 1) {
                        $("#wrapper").css({
                            'width': 'calc(100dvh * ' + ratio + ')'
                        });
                    } else {
                        $("#wrapper").css({
                            'width': 'calc((100dvh - 55px) * ' + ratio + ')'
                        });
                    }
                } else {
                    if (displayoptions.hidemainvideocontrols == 1) {
                        gap = '55px';
                    }
                    $("#wrapper").css({
                        'width': 'calc((100dvh - ' + gap + ' - 2rem) * ' + ratio + ')'
                    });
                }

                $('#wrapper').attr('data-ratio', ratio);
                $('#wrapper').attr('data-gap', gap);

                $('#start-screen #start').focus();

                // Resize observer
                let vwrapper = document.querySelector('#video-wrapper');
                const resizeObserver = new ResizeObserver(() => {
                    // If vwrapper is larger than 1050px, show #expand; otherwise, hide it.
                    if (vwrapper.clientWidth > 1050) {
                        $('#controller #expand').removeClass('d-none');
                    } else {
                        $('#controller #expand').addClass('d-none');
                    }
                });

                resizeObserver.observe(vwrapper);

                // Scroll into view #video-wrapper
                if ($('body').hasClass('embed-mode')) {
                    return;
                }
                vwrapper.scrollIntoView({behavior: "smooth", block: "end", inline: "nearest"});

                if (player.live) {
                    // Remove the slash.
                    $('#currenttime').next().remove();
                    $('#currenttime').remove();
                    $('#duration').text(M.util.get_string('live', 'mod_interactivevideo'));
                    $('#remainingtime').text(M.util.get_string('live', 'mod_interactivevideo'));
                    $('#taskinfo').addClass('no-pointer-events');
                    end = Number.MAX_SAFE_INTEGER;
                    // Progress 100%.
                    replaceProgressBars(100);
                    return;
                }
            };

            /**
             * Initializes the video player and its controls when the player is ready.
             *
             * This function performs the following tasks:
             * - Checks if the player supports playback rate and quality adjustments, and updates the UI accordingly.
             * - Sets the background image of the start screen if a poster image is available.
             * - Adjusts the background of the video block to be transparent.
             * - Retrieves the video duration and updates the end time if necessary.
             * - Calculates the total playback time and updates the duration display.
             * - Recalculates the aspect ratio of the video and updates the video wrapper's padding.
             * - Sets the player as ready and focuses on the start button.
             * - Initializes the seek head draggable functionality, allowing users to seek through the video.
             *
             * @async
             * @function onReady
             * @returns {Promise<void>} A promise that resolves when the player is fully initialized and ready.
             */
            const onReady = async() => {
                if ((window.braveEthereum || window.braveSolana) && !player.allowAutoplay) {
                    player.destroy();
                    Toast.add(M.util.get_string('braveautoplay', 'mod_interactivevideo'), {
                        type: 'danger',
                        autohide: false,
                    });
                    setTimeout(() => {
                        $('#toast-0').css('margin-top', '70px');
                        $('#interactivevideo-container').addClass('no-pointer-events');
                        $('#autoplay-error').tooltip('hide');
                        $('#autoplay-error').remove();
                    }, 500);
                    return;
                }

                player.pause();
                const isPaused = await player.isPaused();
                if (!isPaused) {
                    if (!player.live) {
                        await player.seek(start);
                    }
                    onReady();
                    return;
                }

                if (!loaded) {
                    await onLoaded();
                }

                if (player.audio) {
                    $('#annotation-canvas').addClass('bg-black');
                }

                // Explanation: YT shows annoying related videos if the player is large enough when the script is loading.
                // So we're tricking it by hiding the canvas which also hides the #player first
                // and only shows it when player is ready.
                $(".video-block").css('background', 'transparent');
                $("#annotation-canvas").removeClass('d-none');


                await getAnnotations();

                if (player.live) {
                    return;
                }

                $('#seekhead').draggable({
                    'containment': '#video-nav',
                    'axis': 'x',
                    'cursor': 'col-resize',
                    'start': async function(event, ui) {
                        const isPaused = await player.isPaused();
                        if (!isPaused) {
                            player.pause();
                        }
                        $(this).addClass('active');
                        $('#taskinfo').addClass('no-pointer-events');
                        $('#message').not('[data-placement=bottom]').not('.sticky').remove();
                        $("#end-screen").fadeOut(300);
                        $("#seek").append('<div id="position"><div id="timelabel"></div></div>');
                        let $position = $('#position');
                        const relX = ui.position.left;
                        $position.css('left', (relX) + 'px');
                        const percentage = relX / $(this).width();
                        const time = percentage * totaltime;
                        const formattedTime = convertSecondsToHMS(time);
                        $position.find('#timelabel').text(formattedTime);
                    },
                    'drag': async function(event, ui) {
                        let timestamp = ((ui.position.left) / $('#video-nav').width()) * totaltime + start;
                        let percentage = ui.position.left / $('#video-nav').width();
                        await replaceProgressBars(percentage * 100);
                        $('#seek #position').css('left', ui.position.left + 'px');
                        $('#seek #position #timelabel').text(convertSecondsToHMS(timestamp - start));
                        await player.seek(timestamp);
                    },
                    'stop': async function() {
                        // Reset the launched annotation.
                        lastrun = null;
                        viewedAnno = [];
                        setTimeout(function() {
                            $('#taskinfo').removeClass('no-pointer-events');
                        }, 200);
                        setTimeout(function() {
                            $('#seekhead').removeClass('active');
                            $('#seek #position').remove();
                        }, 1000);
                        player.play();
                    }
                });

                dispatchEvent('timeupdate', {'time': start}); // Dispatch the timeupdate event with the start time.
            };

            /**
             * Handles the event when the video player is paused.
             *
             * This function performs the following actions:
             * - Checks if the player is ready. If not, it exits early.
             * - Clears the interval timer.
             * - Updates the play/pause button icon to indicate 'play'.
             * - Sets the tooltip of the play/pause button to 'play'.
             */
            let lastSaved;
            const onPaused = async() => {
                if (!playerReady) {
                    return;
                }
                $('#playpause').find('i').removeClass('bi-pause-fill').addClass('bi-play-fill');
                $('#playpause').attr('data-original-title', M.util.get_string('play', 'mod_interactivevideo'));
                if (player.live) {
                    return;
                }
                cancelAnimationFrame(playingInterval);
                // Save watched progress to database.
                let t = await player.getCurrentTime();
                let watchedpoint = Math.round(t);
                // Make sure the watchedpoint is not the same as the last saved point or so close to it.
                if ((Math.abs(watchedpoint - lastSaved) < 5 && watchedpoint != Math.round(end)) || watchedpoint < start + 5) {
                    return;
                }
                lastSaved = watchedpoint;
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    method: "POST",
                    dataType: "text",
                    data: {
                        action: 'update_watchedpoint',
                        sesskey: M.cfg.sesskey,
                        completionid: completionid,
                        watchedpoint: watchedpoint,
                        contextid: M.cfg.contextid
                    }
                });
            };

            let videoEnded = false;
            /**
             * Handles the end of the video playback.
             *
             *
             * @returns {void}
             *
             * This function performs the following actions:
             * - Checks if the player is ready.
             * - Updates the UI to show the end screen and restart button.
             * - Clears the interval and pauses the player.
             * - Updates the play/pause button to show the play icon.
             */
            const onEnded = async() => {
                if (!playerReady) {
                    return;
                }
                if (videoEnded || player.live) {
                    return;
                }

                let isPlaying = await player.isPlaying();
                if (isPlaying) {
                    player.pause();
                    onEnded(); // Repeat until player is paused.
                    return;
                }

                onPaused(); // Run the onPaused function to save the last watched point.

                dispatchEvent('timeupdate', {'time': end});
                $('#restart').removeClass('d-none').fadeIn(300);
                $('#end-screen').removeClass('d-none').fadeIn(300);
                dispatchEvent('ended', {'time': end});
                replaceProgressBars(100);
                videoEnded = true;
                viewedAnno = [];
            };

            /**
             * Handles the seek event for the video player.
             *
             * @param {number} t - The time to seek to. If not provided, the current time of the player will be used.
             * @returns {Promise<void>} - A promise that resolves when the seek operation is complete.
             */
            const onSeek = async(t) => {
                if (!playerReady) {
                    return;
                }
                if (player.live) {
                    return;
                }
                if (t) {
                    t = Number(t);
                } else {
                    t = await player.getCurrentTime();
                }
                if (!firstPlay) {
                    // If seeking before the first play, then we need to set the resumetime to the current time.
                    window.resumetime = t;
                }
                if (t > start && t < end) {
                    $('#end-screen, #start-screen').addClass('d-none');
                }
                const percentage = (t - start) / (totaltime) * 100;
                replaceProgressBars(percentage);
                dispatchEvent('timeupdate', {'time': t});
                // Reset the launched annotation to include only the ones that are before the current time.
                viewedAnno = [];
                releventAnnotations.forEach(x => {
                    if (Number(x.timestamp) < t) {
                        viewedAnno.push(Number(x.id));
                    }
                });
                // If lastrun timestamp is greater than t, then we need to reset it.
                if (lastrun && releventAnnotations.find(x => x.id == lastrun).timestamp > t) {
                    lastrun = null;
                }
            };

            let visualized = false;
            let playingInterval = null;
            let firstPlay = false;
            /**
             * Handles the 'playing' event of the video player.
             * This function is triggered when the video is playing and performs various actions such as:
             * - Resetting the annotation content.
             * - Handling fullscreen mode for mobile themes.
             * - Hiding modals and messages.
             * - Updating the play/pause button state.
             * - Managing the video progress and annotations.
             *
             * @async
             * @function onPlaying
             * @returns {Promise<void>} A promise that resolves when the function completes.
             */
            const onPlaying = async() => {
                // Reset the annotation content.
                if (!playerReady) {
                    return;
                }
                // Initialize the player visualizer for html5 audio.
                if (player.audio && !visualized) {
                    player.visualizer();
                    visualized = true;
                }
                // Force fullscreen for mobile themes and mobile devices.
                if ($('body').hasClass('mobiletheme') && !$('#wrapper').hasClass('fullscreen')) {
                    $("#fullscreen").trigger('click');
                }

                $('#playpause').find('i').removeClass('bi-play-fill').addClass('bi-pause-fill');
                $('#playpause').attr('data-original-title', M.util.get_string('pause', 'mod_interactivevideo'));

                if (player.live) {
                    return;
                }

                if ($('#message.active').length > 0) {
                    $('#message.active').each(function() {
                        const mid = $(this).data('id');
                        if (mid) {
                            $(this).removeClass('active');
                            dispatchEvent('interactionclose', {'annotation': {'id': mid}});
                        }
                    });
                }

                $('#annotation-modal').modal('hide');
                $('#message').not('[data-placement=bottom]').not('.sticky').remove();

                if (!videoEnded) {
                    $('#end-screen, #start-screen').fadeOut(300);
                    $('#restart').addClass('d-none');
                } else {
                    viewedAnno = [];
                }
                if (!firstPlay) {
                    $('#autoplay-error').tooltip('hide');
                    $('#autoplay-error').remove();
                    replaceProgressBars(window.resumetime ? (window.resumetime - start) / totaltime * 100 : 0);
                    viewedAnno = [];
                    firstPlay = true;
                    if (window.resumetime && window.resumetime > start && window.resumetime < end) {
                        if (player.allowAutoplay) {
                            await player.seek(window.resumetime);
                        } else {
                            await player.pause();
                            await player.seek(window.resumetime);
                            player.play();
                        }
                    }
                    player.unMute();
                }

                const intervalFunction = async function() {
                    const isPlaying = await player.isPlaying();
                    const isEnded = await player.isEnded();
                    const isPaused = await player.isPaused();
                    if (isEnded) {
                        onEnded(end);
                        return;
                    }
                    if (isPaused) {
                        onPaused();
                        return;
                    }
                    if (!isPlaying) {
                        if (player.type == 'spotify' || player.type == 'rutube' || player.type == 'yt') {
                            player.pause();
                            cancelAnimationFrame(playingInterval);
                        }
                        return;
                    }

                    let t = await player.getCurrentTime();
                    t = Number(t);

                    if (t > end) {
                        onEnded(end);
                        return;
                    }

                    videoEnded = false;

                    dispatchEvent('timeupdate', {'time': t});

                    const time = Number(t.toFixed(2));
                    // If it is the same annotation we just run, then we don't need to run it again.
                    let percentagePlayed = (t - start) / totaltime;
                    percentagePlayed = percentagePlayed > 1 ? 1 : percentagePlayed;
                    replaceProgressBars(percentagePlayed * 100);
                    const theAnnotation = releventAnnotations.find(x => (((t - lookbacktime).toFixed(2) <= x.timestamp
                        && (t + player.frequency).toFixed(2) >= x.timestamp) || time == x.timestamp) &&
                        x.id != 0 && !viewedAnno.includes(Number(x.id)));

                    if (theAnnotation) {
                        viewedAnno = [];
                        releventAnnotations.forEach(x => {
                            if (Number(x.timestamp) < t) {
                                viewedAnno.push(Number(x.id));
                            }
                        });

                        $('#interactions-nav .annotation[data-id="' + theAnnotation.id + '"] .item').trigger('mouseover')
                            .addClass('active');
                        setTimeout(function() {
                            $('#interactions-nav .annotation[data-id="' + theAnnotation.id + '"] .item')
                                .trigger('mouseout').removeClass('active');
                        }, 2000);

                        if (lastrun && theAnnotation.id == lastrun) {
                            return;
                        }
                        // If in preview mode, don't run the interaction.
                        if (isPreviewMode) {
                            return;
                        }
                        // Run the interaction if it isn't complete or rerunnable.
                        if (!theAnnotation.completed || theAnnotation.rerunnable) {
                            replaceProgressBars((theAnnotation.timestamp - start) / totaltime * 100);
                            if (time < theAnnotation.timestamp - player.frequency) {
                                await player.seek(theAnnotation.timestamp);
                            }
                            runInteraction(theAnnotation);
                        } else {
                            if (theAnnotation.completed) {
                                if (time < theAnnotation.timestamp - player.frequency) {
                                    await player.seek(theAnnotation.timestamp);
                                }
                                viewedAnno.push(Number(theAnnotation.id));
                            }
                            // Player.play();
                        }
                    }
                };

                if (player.useAnimationFrame) {
                    const animate = async() => {
                        const isPlaying = await player.isPlaying();
                        if (isPlaying) {
                            intervalFunction();
                            playingInterval = requestAnimationFrame(animate);
                        }
                    };
                    playingInterval = requestAnimationFrame(animate);
                } else {
                    const isPlaying = await player.isPlaying();
                    if (isPlaying) {
                        intervalFunction();
                    }
                }
            };

            // Implement the player
            require(['mod_interactivevideo/player/' + vtype], function(VideoPlayer) {
                player = new VideoPlayer();
                if (displayoptions.passwordprotected == 1 && player.support.password) {
                    // Remove start screen, set .video-block to d-none, #annotation-canvas remove d-none.
                    $('#start-screen').addClass('d-none');
                    $('.video-block').addClass('no-pointer bg-transparent');
                    $('#annotation-canvas').removeClass('d-none');
                }
                player.load(url,
                    start,
                    end,
                    {
                        'showControls': displayoptions.useoriginalvideocontrols == 1,
                        'customStart': true,
                        'preload': false,
                        'autoplay': displayoptions.autoplay == 1,
                        'passwordprotected': displayoptions.passwordprotected == 1 && player.support.password,
                    });
            });

            // Move toast-wrapper to the #wrapper element so it can be displayed on top of the video in fullscreen mode.
            let $toast = $('.toast-wrapper').detach();
            $('#wrapper').append($toast);

            $(document).on('click', '.completion-required', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                Toast.add(M.util.get_string('youmustcompletethistaskfirst', 'mod_interactivevideo'), {
                    type: 'danger'
                });
                return;
            });

            const handleUnskippable = async(t) => {
                // Handle unskippable interactions.
                if (!t) {
                    t = await player.getCurrentTime();
                }

                if (releventAnnotations) {
                    const theAnnotation = releventAnnotations.find(x => Number(x.timestamp) < Number(t.toFixed(2))
                        && x.completed == false && JSON.parse(x.advanced).advskippable == 0 && x.hascompletion == 1);
                    if (theAnnotation) {
                        await player.pause();
                        await player.seek(theAnnotation.timestamp);
                        runInteraction(theAnnotation);
                        Toast.add(M.util.get_string('youmustcompletethistaskfirst', 'mod_interactivevideo'), {
                            type: 'danger'
                        });
                        replaceProgressBars((theAnnotation.timestamp - start) / totaltime * 100);
                        return true;
                    }
                }
                return false;
            };

            $(document).on('timeupdate', async function(e) {
                if (!playerReady || isPreviewMode || player.live) {
                    return;
                }
                const t = e.originalEvent.detail.time;
                if (preventskip && releventAnnotations) {
                    // Check if there is any uncompleted activity before the current time.
                    const theAnnotations = releventAnnotations.filter(x => Number(x.timestamp) < Number(t.toFixed(2))
                        && x.completed == false && x.hascompletion == 1);
                    if (theAnnotations.length > 0) {
                        const theAnnotation = theAnnotations[0];
                        await player.pause();
                        await player.seek(theAnnotation.timestamp);
                        runInteraction(theAnnotation);
                        Toast.add(M.util.get_string('youmustcompletethistaskfirst', 'mod_interactivevideo'), {
                            type: 'danger'
                        });
                        replaceProgressBars((theAnnotation.timestamp - start) / totaltime * 100);
                    }
                }
                handleUnskippable(t);
            });

            // Handle the refresh button:: allowing user to refresh the content
            $(document).on('click', '#message #refresh', function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = $(this).data('id');
                const annotation = releventAnnotations.find(x => x.id == id);
                $(this).closest('#message').remove();
                dispatchEvent('interactionrefresh', {'annotation': annotation});
                runInteraction(annotation, true);
            });

            // Handle video control events:: fullscreen toggle
            $(document).on('click', '#fullscreen', function(e) {
                e.preventDefault();
                if (!playerReady) {
                    return;
                }

                // Put the wrapper in fullscreen mode
                let elem = document.getElementById('wrapper');
                $('#fullscreen').toggleClass('active');
                if (!$('#wrapper').hasClass('fullscreen')) {
                    if (elem.requestFullscreen) {
                        elem.requestFullscreen();
                    } else if (elem.mozRequestFullScreen) { /* Firefox */
                        elem.mozRequestFullScreen();
                    } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
                        elem.webkitRequestFullscreen();
                    } else if (elem.msRequestFullscreen) { /* IE/Edge */
                        elem.msRequestFullscreen();
                    } else if (elem.webkitEnterFullscreen) { /* IOS Safari */
                        elem.webkitEnterFullscreen();
                    } else {
                        Toast.add(M.util.get_string('fullscreenisnotsupported', 'mod_interactivevideo'), {
                            type: 'danger'
                        });
                        // Remove the fullscreen button.
                        $('#fullscreen').remove();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.mozCancelFullScreen) { /* Firefox */
                        document.mozCancelFullScreen();
                    } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) { /* IE/Edge */
                        document.msExitFullscreen();
                    }
                }
            });

            $(document).on('fullscreenchange', async function() {
                if (document.fullscreenElement) {
                    $('#wrapper, #interactivevideo-container').addClass('fullscreen');
                    $("#video-wrapper").css('padding-bottom', '0');
                    $('#wrapper [data-toggle="tooltip"]').tooltip({
                        container: '#wrapper',
                        boundary: 'window',
                    });
                    $('#controller').addClass('bg-black').removeClass('bg-dark');
                } else {
                    $('#wrapper, #interactivevideo-container').removeClass('fullscreen');
                    let ratio = 16 / 9;
                    if (!displayoptions.usefixedratio || displayoptions.usefixedratio == 0) {
                        ratio = player.aspectratio;
                    }
                    $("#video-wrapper").css('padding-bottom', (1 / ratio) * 100 + '%');
                    $('#controller').addClass('bg-dark').removeClass('bg-black');
                }
                $('#wrapper #fullscreen i').toggleClass('bi-fullscreen bi-fullscreen-exit');
            });

            let idleInterval = null;
            $(document).on('visibilitychange', async function() {
                // Pause video when the tab is not visible and the pauseonblur option is enabled.
                if (displayoptions.pauseonblur && displayoptions.pauseonblur == 1) {
                    if (!playerReady) {
                        return;
                    }
                    if (document.visibilityState == 'hidden') {
                        player.pause();
                    }
                }

                if (document.visibilityState == 'hidden') {
                    // Destroy the player if the tab is hidden and the video isn't playing for more than 30/5 minutes.
                    // Check if the player is paused and the user is not interacting with the player.
                    idleInterval = setInterval(async() => {
                        const isPaused = await player.isPaused();
                        if (isPaused || videoEnded || !playerReady || !player || !firstPlay) {
                            // Destroy the player.
                            try {
                                player.destroy();
                            } catch (error) {
                                // Do nothing.
                            }
                            cancelAnimationFrame(playingInterval);
                            clearInterval(idleInterval);
                            $(document).off();
                            if (!videoEnded) {
                                $('#start-screen').show().removeClass('d-none').addClass('idled');
                                $('#start-screen #play').removeClass('d-none');
                            }
                            $(document).on('click', '#start-screen #play, #endscreen #restart', function(e) {
                                e.preventDefault();
                                location.reload();
                            });
                            $('#controller').addClass('no-pointer-events');
                            Toast.add(M.util.get_string('idlealert', 'mod_interactivevideo'), {
                                type: 'danger',
                                autohide: false,
                                closeButton: true,
                            });
                        }
                    }, 60 * 1000 * (videoEnded ? 5 : 30)); // 30 minutes if the video is playing, 5 minutes if the video has ended.
                } else {
                    // Cancel the destroy player timeout.
                    clearInterval(idleInterval);
                }
            });

            // Handle player size change event.
            $(document).on('click', '#controller #expand', function(e) {
                e.preventDefault();
                $('body').toggleClass('limited-width');
                localStorage.setItem('limitedwidth', $('body').hasClass('limited-width'));
                $(this).find('i').toggleClass('bi-square bi-file');
            });

            // Handle share this moment event.
            $(document).on('click', '#controller #share', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const $this = $(this);
                $this.find('i').toggleClass('bi-share-fill bi-share');
                let time = await player.getCurrentTime();
                const url = window.location.href;
                let shareurl = url + (url.indexOf('?') > 0 ? '&' : '?') + 't=' + Math.round(time);
                // Remove the embed parameter if it exists.
                shareurl = shareurl.replace(/&embed=1/g, '');
                // Add shareurl to clipboard.
                await navigator.clipboard.writeText(shareurl);
                $this.attr('data-original-title', M.util.get_string("copied", "mod_interactivevideo")).tooltip('show');
                setTimeout(function() {
                    // Change tooltip back to share.
                    $this
                        .attr('data-original-title', M.util.get_string("sharethismoment", "mod_interactivevideo"))
                        .tooltip('hide');
                    $this.find('i').toggleClass('bi-share-fill bi-share');
                }, 2000);
            });

            // Display time when user hover on the progress bar.
            $(document).on('mouseenter', '#video-nav #seek', function(e) {
                if (!playerReady) {
                    return;
                }
                $(this).append('<div id="position"><div id="timelabel"></div></div>');
                let $position = $('#position');
                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;

                $position.css('left', (relX) + 'px');
                const percentage = relX / $(this).width();
                const time = percentage * totaltime;
                const formattedTime = convertSecondsToHMS(time);
                $position.find('#timelabel').text(formattedTime);
            });

            $(document).on('mousemove', '#video-nav #seek', function(e) {
                if (!playerReady) {
                    return;
                }
                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;
                const percentage = relX / $(this).width();
                const time = percentage * totaltime;
                const formattedTime = convertSecondsToHMS(time);
                $('#position').css('left', (relX) + 'px');
                $('#position #timelabel').text(formattedTime);
            });

            $(document).on('mouseleave', '#video-nav #seek', function() {
                $('#position').remove();
            });

            // Handle annotation click event:: when user click on the annotation on the progress bar
            $(document).on('click', '#interactions-nav .annotation, #video-nav .annotation', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const timestamp = $(this).data('timestamp');

                let hasSkippable = await handleUnskippable(timestamp);
                if (hasSkippable) {
                    return;
                }

                $loader.fadeIn(300);
                if ($(this).hasClass('no-click')) {
                    // Add a tooltip that seeking is disabled.
                    Toast.add(M.util.get_string('youcannotviewthisannotationyet', 'mod_interactivevideo'), {
                        type: 'danger'
                    });
                    return;
                }
                const currenttime = await player.getCurrentTime();
                if (currenttime == timestamp && lastrun) {
                    $loader.fadeOut(300);
                    return;
                }
                lastrun = null;
                const isPaused = await player.isPaused();
                if (!isPaused) {
                    player.pause();
                }
                await replaceProgressBars((timestamp - start) / totaltime * 100);
                await player.seek(Number(timestamp));
                const id = $(this).data('id');
                const theAnnotation = releventAnnotations.find(x => x.id == id);
                runInteraction(theAnnotation);
                $loader.fadeOut(300);
                // Clear the viewed annotations that are after this timestamp.
                const preceedingAnno = releventAnnotations.filter(x => x.timestamp < timestamp).map(x => Number(x.id));
                viewedAnno = preceedingAnno;
                viewedAnno.push(id);
                // Concatenate the preceeding annotations.
                viewedAnno = [...new Set(viewedAnno)];
            });

            // Handle seeking event:: when user click on the progress bar
            $(document).on('click', '#seek', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                if ($('#video-nav').hasClass('no-click')) {
                    // Add a tooltip that seeking is disabled.
                    Toast.add(M.util.get_string('seekingdisabled', 'mod_interactivevideo'), {
                        type: 'danger'
                    });
                    return;
                }
                $('#start-screen').fadeOut(300);
                $('#end-screen').fadeOut(300);
                const parentOffset = $(this).offset();
                const relX = e.pageX - parentOffset.left;
                const percentage = relX / $(this).width();
                await replaceProgressBars(percentage * 100);
                $loader.fadeIn(300);
                await player.seek((percentage * totaltime) + start);
                const isPlaying = await player.isPlaying();
                if (!isPlaying || videoEnded) {
                    await player.play();
                }
                viewedAnno = [];
                setTimeout(() => {
                    // Remove the position.
                    $('#position').remove();
                    $loader.fadeOut(300);
                }, 300);
            });

            // Handle video control events:: play
            $(document).on('click', '#start-screen #play', async function(e) {
                e.preventDefault();
                if ($(this).hasClass('reload')) {
                    location.reload();
                    return;
                }
                $('#start-screen').fadeOut(300);
                $(this).addClass('d-none');
                $videoNav.removeClass('d-none');
                player.play();
            });

            // Handle video control events:: restart
            $(document).on('click', '#end-screen #restart', async function(e) {
                e.preventDefault();
                dispatchEvent('iv:playerRestart');
                $('#message').remove();
                // Remove sidebar/drawer.
                if ($('body').hasClass('hassidebar')) {
                    $('#annotation-toggle').trigger('click');
                    $('#annotation-sidebar, #annotation-toggle').remove();
                    $('body').removeClass('hassidebar');
                }

                viewedAnno = [];
                lastrun = null;
                $loader.fadeIn(300);
                await player.seek(start);
                replaceProgressBars(0);
                $('#end-screen').fadeOut(300);
                $(this).addClass('d-none');
                $videoNav.removeClass('d-none');
                player.play();
                $loader.fadeOut(300);
            });

            // Handle video control events:: pause/resume when user click on the video
            $(document).on('click', '#video-wrapper .video-block', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                if (player.live) {
                    firstPlay = true;
                }
                if (!firstPlay) {
                    player.play();
                    return;
                }
                // Pause or resume the video.
                const playing = await player.isPlaying();
                if (playing) {
                    await player.pause();
                } else {
                    player.play();
                }

            });

            $(document).on('click', '#playpause', async function(e) {
                if (!playerReady) {
                    return;
                }
                e.preventDefault();
                $(this).tooltip('hide');
                // Pause or resume the video.
                const playing = await player.isPlaying();
                if (playing) {
                    await player.pause();
                } else {
                    let t = await player.getCurrentTime();
                    if (t >= end) {
                        $('#end-screen #restart').trigger('click');
                    } else {
                        player.play();
                    }
                }
            });

            $(document).on('click', 'li.anno', async function(e) {
                e.preventDefault();
                const id = $(this).data('id');
                $(`li.annotation[data-id=${id}]`).trigger('click');
                if ($(this).closest('#chapter-container-left').length > 0) {
                    $('#chaptertoggle .btn').trigger('click');
                }
            });

            $(document).on('click', '#toolbar #annotation-toggle', function(e) {
                e.preventDefault();
                $('body').addClass('hassidebar');
                $('#annotation-sidebar').removeClass('hide');
                // Get the active annotation.
                const current = $(`#sidebar-nav .sidebar-nav-item.active`).data('id');
                if (current) {
                    // Dispatch the interaction run event.
                    dispatchEvent('interactionrun', {'annotation': releventAnnotations.find(x => x.id == current)});
                }
            });

            // Handle video control events:: mute/unmute
            $(document).on('click', '#mute', function(e) {
                e.preventDefault();
                $(this).tooltip('hide');
                $(this).toggleClass('active');
                if ($(this).hasClass('active')) {
                    player.mute();
                    $(this).attr('data-original-title', M.util.get_string('unmute', 'mod_interactivevideo'));
                } else {
                    player.unMute();
                    $(this).attr('data-original-title', M.util.get_string('mute', 'mod_interactivevideo'));
                }
                $(this).find('i').toggleClass('bi-volume-mute bi-volume-up');
                $(this).tooltip('show');
            });

            // Handle video control events:: playrate change
            $(document).on('click', '.changerate', function(e) {
                e.preventDefault();
                const rate = $(this).data('rate');
                player.setRate(rate);
                $('.changerate').find('i').removeClass('bi-check');
                $(this).find('i').addClass('bi-check');
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
                    $('#qualitieslist').append(`<a class="dropdown-item changequality text-white" data-quality="${q}"
                         href="#"><i class="bi ${q == currentQuality ? 'bi-check' : ''} fa-fw ml-n3"></i>${qualitiesLabel[i]}</a>`);
                });
                $(this).find('[data-toggle=dropdown]').dropdown('update');
            });

            $(document).on('click', '.changequality', function(e) {
                e.preventDefault();
                const quality = $(this).data('quality');
                player.setQuality(quality);
                $('.changequality').find('i').removeClass('bi-check');
                $(this).find('i').addClass('bi-check');
            });

            $(document).on('click', '#changecaption .changecaption', function(e) {
                e.preventDefault();
                const lang = $(this).data('lang');
                player.setCaption(lang);
                $('#changecaption .changecaption').find('i').removeClass('bi-check');
                $(this).find('i').addClass('bi-check');
                if (lang == '') {
                    $('#changecaption .btn i').removeClass('bi-badge-cc-fill').addClass('bi-badge-cc');
                } else {
                    $('#changecaption .btn i').removeClass('bi-badge-cc').addClass('bi-badge-cc-fill');
                }
                // Save the caption language to local storage.
                localStorage.setItem(`caption-${userid}`, lang);
            });

            $(document).on('iv:playerReady', function() {
                onReady();
            });

            $(document).on('iv:playerPaused', async function() {
                // Remove the tooltip.
                $('.tooltip').remove();
                dispatchEvent('videoPaused');
                onPaused();
            });

            $(document).on('iv:playerPlaying', function() {
                onPlaying();
                $loader.fadeOut(300);
            });

            $(document).on('iv:playerEnded', function() {
                onEnded();
            });

            $(document).on('iv:playerSeek', function(e) {
                if (player.live) {
                    return;
                }
                onSeek(e.detail.time);
            });

            $(document).on('iv:playerLoaded', function(e) {
                onLoaded(e.detail);
                const captions = e.detail.tracks;
                if (!captions || captions.length == 0) {
                    return;
                }
                $('#changecaption').removeClass('d-none');
                $('#changecaption .dropdown-menu')
                    .html(`<a class="dropdown-item changecaption"
                     data-lang="" href="#">
                     <i class="bi fa-fw bi-check ml-n3"></i>${M.util.get_string('off', 'mod_interactivevideo')}</a>`);
                captions.forEach(caption => {
                    $('#changecaption .dropdown-menu')
                        .append(`<a class="dropdown-item changecaption text-white"
                         data-lang="${caption.code}" href="#"><i class="bi fa-fw ml-n3"></i>${caption.label}</a>`);
                });

                const lang = localStorage.getItem(`caption-${userid}`);
                if (lang && lang.length) {
                    $('#changecaption .changecaption[data-lang="' + lang + '"]').trigger('click');
                }
            });

            $(document).on('iv:playerError', function() {
                Toast.add(M.util.get_string('thereisanissueloadingvideo', 'mod_interactivevideo'), {
                    type: 'danger'
                });
                $('#annotation-canvas').removeClass('d-none');
                $('#start-screen').addClass('d-none');
                $('.video-block').addClass('no-pointer bg-transparent');
                $('#spinner').remove();
            });

            $(document).on('iv:playerRateChange', function(e) {
                $('.changerate').find('i').removeClass('bi-check');
                $(`.changerate[data-rate="${e.originalEvent.detail.rate}"]`).find('i').addClass('bi-check');
            });

            $(document).on('iv:playerQualityChange', function(e) {
                $('#changequality').attr('data-current', e.originalEvent.detail.quality);
                $('.changequality').find('i').removeClass('bi-check');
                $(`.changequality[data-quality="${e.originalEvent.detail.quality}"]`).find('i').addClass('bi-check');
            });

            $(document).on('annotationitemsrendered', function() {
                try {
                    $('#wrapper [data-toggle="tooltip"]').tooltip({
                        container: '#wrapper',
                        boundary: 'window',
                    });
                } catch (error) {
                    // Do nothing.
                }
                if (displayoptions.disableinteractionclickuntilcompleted == 1) {
                    $interactionNav.find('li:not(.completed)').addClass('no-click');
                }
                if (displayoptions.disableinteractionclick == 1) {
                    $interactionNav.find('li').addClass('no-click');
                }
                if (displayoptions.preventseeking == 1) {
                    $interactionNav.find('li').addClass('no-click');
                    $videoNav.addClass('no-click');
                }
                if ($interactionNav.find('li').length > 0) {
                    $('#taskinfo').removeClass('border-0');
                }

                if (!playerReady) {
                    playerReady = true;
                }

                // Autoplay if enabled and in right conditions.
                if (!isPreviewMode && !firstPlay) {
                    let autoplay = displayoptions.autoplay == 1;
                    let time = start;
                    if ($('.intro-content').hasClass('hasintro')) {
                        autoplay = false;
                    }
                    if ((uprogress.lastviewed > start && uprogress.lastviewed < end - 5) || moment) {
                        autoplay = true;
                        time = moment ? Number(moment) : uprogress.lastviewed;
                        time = time >= end || time < start ? start : time;
                    }
                    window.resumetime = time;
                    replaceProgressBars(((time - start) / totaltime) * 100);
                    if (player.live) {
                        replaceProgressBars(100);
                    }
                    if (autoplay && player.allowAutoplay) {
                        setTimeout(async() => {
                            // Make sure to unmute.
                            player.unMute();
                            if (!moment) {
                                $('#play').trigger('click');
                            }
                        }, 1000);
                    }
                    shareMoment();
                }
            });

            if ($("body").hasClass('mobiletheme')) {
                $('[data-toggle="tooltip"]').on('click', function() {
                    const $this = $(this);
                    setTimeout(function() {
                        $this.tooltip('hide');
                    }, 2000); // Hide after 3 seconds
                });
            }

            if ($("body").hasClass('mobiletheme')) {
                $('[data-toggle="tooltip"]').on('click', function() {
                    const $this = $(this);
                    setTimeout(function() {
                        $this.tooltip('hide');
                    }, 2000); // Hide after 3 seconds
                });
            }

            window.addEventListener('beforeunload', function() {
                player.pause();
                onPaused();
                // Remove all event listeners before unload.
                $(document).off();
                cancelAnimationFrame(playingInterval);
            });

            $(document).on('interactionrun', function(e) {
                const annotation = e.originalEvent.detail.annotation;
                // Update start time to the window.IVANNO item.
                let windowAnnos = window.ANNOS;
                let windowAnno = windowAnnos.find(x => x.id == annotation.id);

                if (windowAnno) {
                    windowAnno.starttime = windowAnno.starttime ? windowAnno.starttime : new Date().getTime();
                    windowAnno.newstarttime = new Date().getTime();
                    windowAnno.completedtime = windowAnno.completedtime ? windowAnno.completedtime : null;
                    windowAnno.duration = windowAnno.duration > 0 ? windowAnno.duration : 0;
                }
                // Put it back in the window.
                windowAnnos = windowAnnos.filter(x => x.id != annotation.id);
                windowAnnos.push(windowAnno);
                window.ANNOS = windowAnnos;
            });

            $(document).on('interactionclose interactionrefresh', function(e) {
                const annotation = e.originalEvent.detail.annotation;
                // Update start time to the window.IVANNO item.
                let windowAnnos = window.ANNOS;
                let windowAnno = windowAnnos.find(x => x.id == annotation.id);

                if (windowAnno) {
                    windowAnno.duration = windowAnno.duration + (new Date().getTime() - windowAnno.newstarttime);
                }
                // Put it back in the window.
                windowAnnos = windowAnnos.filter(x => x.id != annotation.id);
                windowAnnos.push(windowAnno);
                window.ANNOS = windowAnnos;
            });

            $(document).on('completionupdated', function(e) {
                const annotation = e.originalEvent.detail.target;
                let windowAnnos = window.ANNOS;
                let windowAnno = windowAnnos.find(x => x.id == annotation.id);
                if (windowAnno) {
                    if (e.originalEvent.detail.action == 'mark-done') {
                        windowAnno.completedtime = new Date().getTime();
                    } else {
                        windowAnno.completedtime = null;
                    }
                }
                // Put it back in the window.
                windowAnnos = windowAnnos.filter(x => x.id != annotation.id);
                windowAnnos.push(windowAnno);
                window.ANNOS = windowAnnos;

                // Handle the dismissible setting.
                $('#message[data-id=' + annotation.id + ']').addClass('active'); // Make sure the message is active.
                let anno = releventAnnotations.find(x => x.id == annotation.id);
                let advanced = anno.advanced;
                advanced = advanced ? JSON.parse(advanced) : {};
                if (advanced.advdismissible == 0 && anno.completed) {
                    $('#controller, #video-wrapper, .sidebar-nav-item')
                        .removeClass('completion-required');
                } else if (advanced.advdismissible == 0 && !anno.completed) {
                    $('#controller').addClass('completion-required');
                    if ($('#message.active').data('placement') == 'bottom' || $('#message.active').data('placement') == 'side') {
                        $('#video-wrapper').addClass('completion-required');
                    }
                    if ($('#message.active').data('placement') == 'side') {
                        $('.sidebar-nav-item').addClass('completion-required');
                    }
                }
                if (anno.completed) {
                    $('.sidebar-nav-item[data-id=' + annotation.id + ']').addClass('completed');
                } else {
                    $('.sidebar-nav-item[data-id=' + annotation.id + ']').removeClass('completed');
                }
            });

            $(document).on('iv:autoplayBlocked', function(e) {
                e.preventDefault();
                if (e.originalEvent.detail.requireVideoBlock === false) {
                    $('.video-block').remove();
                }
                // Append a error button.
                $('body').append(`<button id="autoplay-error" data-toggle="tooltip"
                     title="${M.util.get_string('autoplayblocked', 'mod_interactivevideo')}"
                    class="btn btn-danger p-2 rounded-circle pulse"><i class="bi bi-x-lg"></i></button>`);
                $('#autoplay-error').tooltip('show');
                $(document).on('click', '#autoplay-error', function() {
                    $('#autoplay-error').tooltip('hide');
                    $(this).fadeOut(300, 'swing', function() {
                        $(this).remove();
                    });
                });
            });

            $(document).on('click', '#message[data-placement]:not(.active)', function(e) {
                e.preventDefault();
                $(this).addClass('active');
                // Dispatch the interaction run event.
                dispatchEvent('interactionrun', {'annotation': releventAnnotations.find(x => x.id == $(this).data('id'))});
            });
        }
    };
});