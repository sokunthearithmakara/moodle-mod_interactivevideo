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
 * Display content module
 *
 * @module     mod_interactivevideo/displaycontent
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Fragment from 'core/fragment';
import {dispatchEvent} from 'core/event_dispatcher';
import ModalEvents from 'core/modal_events';
import Templates from 'core/templates';
import {get_string as getString} from 'core/str';

let ModalFactory;
/**
 * Return main formatted content of the annotation
 * @param {Object} annotation - The annotation object
 * @param {String} [format='html'] - The format of the content, either 'html' or 'json'
 * @returns {Promise<String|Object>} - The formatted content as a string or parsed JSON object
 */
const renderContent = async function(annotation, format = 'html') {
    const annotationArgs = {
        ...annotation,
        contextid: annotation.contextid
    };
    let fragment;
    try {
        fragment = await Fragment.loadFragment('mod_interactivevideo', 'getcontent', annotation.contextid, annotationArgs);
    } catch (error) {
        throw new Error(JSON.stringify(error));
    }
    if (format === 'html') {
        return fragment;
    } else {
        return JSON.parse(fragment);
    }
};

/**
 * Format content text
 * @param {String} text unformatted text
 * @param {Boolean} shorttext short string or text
 * @returns formatted text
 */
const formatText = async function(text, shorttext = false) {
    try {
        const response = await $.ajax({
            url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
            type: 'POST',
            dataType: "text",
            data: {
                text: text,
                contextid: M.cfg.contextid,
                action: 'format_text',
                sesskey: M.cfg.sesskey,
                shorttext: shorttext,
            }
        });
        return response;
    } catch (error) {
        throw new Error('Failed to format text');
    }
};

/**
 * Displays the content of an annotation based on the specified display options.
 *
 * @async
 * @function defaultDisplayContent
 * @param {Object} annotation - The annotation object containing details to be displayed.
 * @param {Object} player - The video player instance.
 * @returns {Promise<void>}
 *
 * @example
 * const annotation = {
 *   id: 1,
 *   displayoptions: 'popup',
 *   hascompletion: 1,
 *   xp: 10,
 *   completed: false,
 *   formattedtitle: 'Sample Annotation',
 *   prop: '{"icon": "bi bi-info-circle"}'
 * };
 * const player = videojs('my-video');
 * defaultDisplayContent(annotation, player);
 */
const defaultDisplayContent = async function(annotation, player) {
    let $body = $('body');
    const isBS5 = $body.hasClass('bs-5');
    const isPlayerMode = $body.attr('id') == 'page-mod-interactivevideo-view';
    const isPreviewMode = annotation.previewMode || false;
    const advanced = JSON.parse(annotation.advanced);
    const isDarkMode = $body.hasClass('darkmode');

    let displayoptions = annotation.displayoptions;

    const responsiveDisplay = (displayoptions) => {
        if (displayoptions == 'side') {
            return displayoptions;
        }

        // If the theme is mobile, display the message as a popup.
        if ($body.hasClass('mobiletheme') && displayoptions == 'inline') {
            displayoptions = 'popup';
        }

        if ($body.hasClass('embed-mode')) {
            // Check the size of the body. If it is less than 800px, display the message as inline.
            if ($(window).width() < 1000 || $(window).height() < 500) {
                displayoptions = 'inline';
            } else {
                displayoptions = displayoptions == 'inline' ? 'inline' : 'popup';
            }
        }

        // If the wrapper is in fullscreen mode, display the message inline (on top of the video).
        if ($('#wrapper').hasClass('fullscreen')) {
            displayoptions = 'inline';
        }
        return displayoptions;
    };

    displayoptions = responsiveDisplay(displayoptions);

    if (advanced.advdismissible == 0 && annotation.completed == false && annotation.hascompletion == 1
        && isPlayerMode && !isPreviewMode) {
        $('#controller').addClass('completion-required');
        if (displayoptions == 'side' || displayoptions == 'bottom') {
            $('#video-wrapper').addClass('completion-required');
        }
        if (displayoptions == 'side') {
            $('.sidebar-nav-item').addClass('completion-required');
        }
    }

    // Add completion button if the annotation has completion criteria.
    let completionbutton = "";
    // Display the xp badge conditionally.
    if (annotation.hascompletion == 1 && annotation.xp > 0) {
        const earned = annotation.earned == annotation.xp ? annotation.earned : annotation.earned + '/' + annotation.xp;
        completionbutton += `<span class="badge ${annotation.completed ? 'alert-success' : 'iv-badge-secondary'} iv-mr-2">
        ${annotation.completed ? earned : Number(annotation.xp)} XP</span>`;
    }
    // Display the completion button conditionally.

    completionbutton += await Templates.render('mod_interactivevideo/player/completionbutton', {
        id: annotation.id,
        iscompleted: annotation.completed,
        isPlayerMode: isPlayerMode && !isPreviewMode,
        refreshonly: annotation.hascompletion != 1
    });

    // Append refresh button after the completion button.
    if (!isPlayerMode || isPreviewMode) {
        completionbutton = ``;
    }

    // Message title.
    let prop = JSON.parse(annotation.prop);
    let messageTitle = await Templates.render('mod_interactivevideo/player/messagetitle', {
        icon: prop.icon || 'bi bi-info-circle',
        title: annotation.formattedtitle || '',
        completionbutton: completionbutton,
        id: annotation.id,
    });

    // Hide existing modal if it shows.
    $('#annotation-modal').modal('hide');

    // Handle annotation close event:: when user click on the close button of the annotation.
    let toast;
    $(document).off('click', `#close-${annotation.id}`).on('click', `#close-${annotation.id}`, async function(e) {
        e.preventDefault();
        $('.tooltip').remove();
        // Set active element to body.
        document.body.focus();
        const anno = window.IVANNO ? window.IVANNO.find(anno => anno.id == annotation.id) : null;
        // Check if dimiss allowed.
        if (isPlayerMode && !isPreviewMode) {
            if (advanced.advdismissible == 0 && anno.completed == false && anno.hascompletion == 1) {
                if (!toast) {
                    toast = await import('core/toast');
                }
                toast.add(await getString('dismissnotallowedbeforecompletion', 'mod_interactivevideo'), {
                    type: 'warning',
                    delay: 3000
                });
                return;
            }

            const isEnded = await player.isEnded();
            const currentTime = await player.getCurrentTime();
            if (!isEnded || currentTime < annotation.end) {
                if (anno && (anno.completed == true || advanced.advskippable != 0)) { // Do not auto resume if not skippable.
                    player.play();
                }
            }
        }

        if (displayoptions == 'side') {
            $body.removeClass('hassidebar');
            $('#annotation-sidebar').addClass('hide');
            if (isPlayerMode && !isPreviewMode) {
                $(this).closest("#message").removeClass('active');
                dispatchEvent('interactionclose', {
                    annotation: annotation,
                });
            }
            return;
        }
        // Trigger the close event.
        $('#annotation-modal').fadeOut(300, function() {
            $(this).trigger(ModalEvents.hidden);
        });
        const targetMessage = $(this).closest("#message");
        targetMessage.remove();
        if (isPlayerMode && !isPreviewMode) {
            setTimeout(function() {
                dispatchEvent('interactionclose', {
                    annotation: annotation,
                });
            }, 100);
        }
    });

    const handlePopupDisplay = async(annotation, messageTitle) => {
        $('#annotation-modal').remove();
        if (!ModalFactory) {
            try {
                ModalFactory = await import('core/modal_factory');
            } catch (error) {
                ModalFactory = await import('core/modal');
            }
        }
        // Play pop sound
        window.IVAudio.pop.play();
        return new Promise((resolve, reject) => {
            ModalFactory.create({
                body: `<div class="modal-body loader"></div>`,
                large: true,
                show: false,
                removeOnClose: true,
                isVerticallyCentered: true,
            }).then((modal) => {
                let root = modal.getRoot();
                root.attr({
                    'id': 'annotation-modal',
                    'data-id': annotation.id,
                });

                // eslint-disable-next-line promise/always-return
                if ($body.hasClass('iframe')) {
                    root.addClass('modal-fullscreen');
                }

                root.find('.modal-dialog')
                    .attr({
                        'data-id': annotation.id,
                        'data-placement': 'popup',
                        'id': 'message'
                    })
                    .addClass('active ' + annotation.type);
                root.find('#message').html(`<div class="modal-content iv-rounded-lg">
                        <div class="modal-header d-flex align-items-center shadow-sm" id="title">
                            ${messageTitle}
                        </div>
                        <div class="modal-body" id="content">
                        </div>
                        </div>
                    </div>`);

                root.off(ModalEvents.hidden).on(ModalEvents.hidden, function() {
                    root.attr('data-region', 'modal-container');
                    modal.destroy();
                });

                // If click outside the modal, add jelly animation.
                root.off('click.modal').on('click.modal', function(e) {
                    if ($(e.target).closest('.modal-content').length === 0) {
                        root.addClass('jelly-anim');
                    }
                });

                // When modal is shown, resolve the promise.
                root.off(ModalEvents.shown).on(ModalEvents.shown, function() {
                    root.attr('data-region', 'popup'); // Must set to avoid dismissing the modal when clicking outside.
                    setTimeout(() => {
                        root.addClass('jelly-anim');
                    }, 10);
                    $('#annotation-modal .modal-body').fadeIn(300);
                    // Dispatch 'shown.bs.modal' event.
                    dispatchEvent('shown.bs.modal', {
                        annotation: {
                            id: annotation.id
                        }
                    }, document.querySelector('#annotation-modal'));
                    resolve(true);
                });

                root.on('animationend', function() {
                    root.removeClass('jelly-anim');
                });

                modal.show();

            }).catch(reject);
        });
    };

    const handleInlineDisplay = (annotation, messageTitle) => {
        // Play pop sound
        window.IVAudio.pop.play();
        return new Promise((resolve) => {
            $('#video-wrapper').append(`<div id="message" style="z-index:105;top:100%" data-placement="inline"
         data-id="${annotation.id}" class="${annotation.type} active modal" tabindex="0">
        <div id="title" class="modal-header shadow-sm iv-rounded-0">
        ${messageTitle}</div><div class="modal-body" id="content">
        </div></div>`);
            $(`#message[data-id='${annotation.id}']`).animate({
                top: '0',
            }, 300, 'linear', function() {
                resolve();
            });
        });
    };

    const handleBottomDisplay = (annotation, messageTitle, isDarkMode) => {
        // Play pop sound
        window.IVAudio.pop.play();
        return new Promise((resolve) => {
            $('#annotation-content').html(`<div id="message" class="active fade show mt-3 ${!isDarkMode ? 'border' : ''}
                 iv-rounded-lg bg-white ${annotation.type}" data-placement="bottom" data-id="${annotation.id}" tabindex="0">
                 <div id='title' class='modal-header shadow-sm px-2'>${messageTitle}</div>
                <div class="modal-body" id="content"></div></div>`);
            $('html, body, #page.drawers, .modal-body').animate({
                scrollTop: $("#annotation-content").offset().top
            }, 1000, 'swing', function() {
                resolve();
            });
        });
    };

    const handleSideDisplay = (annotation, messageTitle) => {
        // Play pop sound
        window.IVAudio.pop.play();
        const rtl = $body.hasClass('dir-rtl');
        $body.addClass('hassidebar');
        // Make sure all sidebar are hidden.
        $('#wrapper .iv-sidebar').addClass('hide');
        // Create sidebar if it does not exist.
        let $sidebar;
        if ($('#wrapper #annotation-sidebar').length == 0) {
            $('#wrapper').append(`<div id="annotation-sidebar" class="iv-sidebar p-0 hide">
                <div id="sidebar-nav" class="d-flex w-100"></div>
                <div id="sidebar-content" class="p-0"></div>
                </div>`);
            $sidebar = $('#annotation-sidebar');
            // Initialize resizable.
            $sidebar.resizable({
                handles: rtl ? 'e' : 'w',
                minWidth: 475,
                container: 'body',
                start: function() {
                    if (rtl) {
                        $(this).css('right', 'auto');
                        $(this).find('.ui-resizable-handle.ui-resizable-e').css({
                            'width': '100%',
                            'right': '-50%',
                        });
                    } else {
                        $(this).css('left', 'auto');
                        $(this).find('.ui-resizable-handle.ui-resizable-w').css({
                            'width': '100%',
                            'left': '-50%',
                        });
                    }

                    $(this).addClass('no-pointer-event');
                },
                resize: function(event, ui) {
                    if (ui.position.left < 0) {
                        ui.position.left = 0;
                        ui.position.width = '100%';
                    }
                },
                stop: function() {
                    if (rtl) {
                        $(this).css('right', 'auto');
                        $(this).find('.ui-resizable-handle.ui-resizable-e').css({
                            'width': '7px',
                            'right': '-3px'
                        });
                    } else {
                        $(this).css('left', 'auto');
                        $(this).find('.ui-resizable-handle.ui-resizable-w').css({
                            'width': '7px',
                            'left': '-3px'
                        });
                    }
                    $(this).removeClass('no-pointer-event');
                }
            });
            // Switch between messages.
            $(document).on('click', '#sidebar-nav .sidebar-nav-item', async function() {
                const current = $(`#sidebar-nav .sidebar-nav-item.active`).data('id');
                const $sidebarcontent = $('#sidebar-content');
                if (current) {
                    $sidebarcontent.find(`#message[data-id='${current}']`).removeClass('active');
                    dispatchEvent('interactionclose', {
                        annotation: {
                            id: current
                        }
                    });
                }
                const target = $(this).data('id');
                $(this).addClass('active').siblings().removeClass('active');
                $sidebarcontent.find('#message').fadeOut(300);
                $sidebarcontent.find(`#message[data-id='${target}']`).fadeIn(300).addClass('active');
                const isPaused = await player.isPaused();
                if (isPaused) {
                    dispatchEvent('interactionrun', {
                        annotation: {
                            id: target
                        }
                    });
                }

            });
        }
        $sidebar = $('#annotation-sidebar');
        // Add annotation toggle button if it does not exist.
        if (isPlayerMode || isPreviewMode) {
            if ($('#wrapper #toolbar #annotation-toggle').length == 0) {
                $('#wrapper #toolbar')
                    .append(`<button id="annotation-toggle" class="btn btn-sm border-0">
                    <i class="bi bi-chevron-${rtl ? 'right' : 'left'}"></i></button>`);
            }
        }
        // Show the sidebar.
        $sidebar.removeClass('hide');
        // Replace the navigation item if it exists.
        if ($(`#sidebar-nav .sidebar-nav-item[data-id='${annotation.id}']`).length == 0) {
            // Add a navigation item.
            let clss = '';
            if (annotation.hascompletion == 1 && annotation.completed == true) {
                clss += ' completed';
            }
            if (annotation.hascompletion != 1) {
                clss += ' no-completion';
            }

            $sidebar.find('#sidebar-nav').append(`<div class="sidebar-nav-item active w-100 ${clss}"
                 data${isBS5 ? '-bs' : ''}-toggle="tooltip"
            data${isBS5 ? '-bs' : ''}-html="true" title="<i class='${prop.icon} iv-mr-2'></i>${annotation.formattedtitle}"
            data-id="${annotation.id}" data-timestamp="${annotation.timestamp}"></div>`);

            // Set the tooltip.
            $(`#sidebar-nav .sidebar-nav-item[data-id='${annotation.id}']`).tooltip();

            // Sort the navigation items.
            $sidebar.find('#sidebar-nav .sidebar-nav-item').sort(function(a, b) {
                return $(a).data('timestamp') - $(b).data('timestamp');
            }).appendTo('#annotation-sidebar #sidebar-nav');
        }
        // Hide other messages on the sidebar.
        $sidebar.find('#message').fadeOut(300);
        $sidebar.find('#sidebar-nav .sidebar-nav-item:not([data-id="' + annotation.id + '"])').removeClass('active');
        if ($sidebar.find('#message.active').length > 0) {
            dispatchEvent('interactionclose', {
                annotation: {
                    id: $(`#annotation-sidebar #message.active`).data('id')
                }
            });
        }
        $sidebar.find(`#message:not([data-id='${annotation.id}'])`).removeClass('active');
        // Append the message to the sidebar.
        $sidebar.find('#sidebar-content').append(`<div id="message" data-placement="side"
                    data-id="${annotation.id}" class="${annotation.type} sticky active" tabindex="0">
                    <div id="title" class="modal-header shadow-sm border-bottom">${messageTitle}</div>
                    <div class="modal-body" id="content"></div>
                    </div>`);
        return new Promise((resolve) => {
            $sidebar.find('#message.active').fadeIn(300, function() {
                resolve();
            });
        });
    };

    switch (displayoptions) {
        case 'popup':
            await handlePopupDisplay(annotation, messageTitle);
            break;
        case 'inline':
            await handleInlineDisplay(annotation, messageTitle);
            break;
        case 'bottom':
            await handleBottomDisplay(annotation, messageTitle, isDarkMode);
            break;
        case 'side':
            await handleSideDisplay(annotation, messageTitle, isDarkMode);
            break;
    }

    return true;
};

export {renderContent, defaultDisplayContent, formatText};
