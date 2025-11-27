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
 * Launch the interactive video in modal on course page
 *
 * @module     mod_interactivevideo/launch
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery', 'core/str', 'core/templates', 'core/modal_factory', 'core/modal_events', 'core/event_dispatcher'],
    function($, str, Templates, ModalFactory, ModalEvents, eventDispatcher) {
        let playerModal;
        return {
            init: async function() {
                const launchVideo = async($card, course, contextid, id) => {
                    // Save the current document title.
                    let title = document.title;
                    // Get current url.
                    let currentUrl = window.location.href;
                    // Get showcontrols from cache.
                    let showcontrols = localStorage.getItem('showcontrols') ? true : false;

                    // Get fullscreen from cache.
                    let resized = localStorage.getItem('resized') ? true : false;
                    let fullscreen = resized ? false : true;

                    if (playerModal) {
                        playerModal.destroy();
                    }

                    playerModal = await ModalFactory.create({
                        body: await Templates.render('mod_interactivevideo/playermodal', {
                            id,
                            wwwroot: M.cfg.wwwroot,
                            title: title,
                            fullscreen,
                        }),
                        large: true,
                        show: false,
                        removeOnClose: false,
                        isVerticallyCentered: true,
                    });

                    const root = playerModal.getRoot();
                    let rootheader = root.find('#head').html();
                    let rootbody = root.find('#body').html();
                    root.find('.modal-header').addClass(`border-0 text-white align-items-center py-0 h-0 position-absolute w-100
                         z-index-1 iv-rounded-0`)
                        .empty()
                        .append(rootheader);

                    root.find('.modal-body').addClass('p-0').html(rootbody);
                    root.find('#background-loading').show();
                    root.addClass(fullscreen ? 'modal-fullscreen iv-rounded-0' : 'modal-resized');
                    root.attr('id', 'playermodal');
                    root.find('.modal-dialog').addClass('modal-xl ' + (fullscreen ? 'iv-rounded-0' : ''))
                        .removeClass('modal-lg');
                    root.find('.modal-content').addClass('border-0 show-control '
                        + (fullscreen ? 'iv-rounded-0' : ''));

                    playerModal.show();
                    root.find('.toggle-controls').trigger('click');

                    let $header = root.find('.modal-header');
                    let $content = root.find('.modal-content');
                    let $toggle = root.find('.toggle-controls');
                    if (showcontrols && !$content.hasClass('show-control')) {
                        $toggle.trigger('click');
                    }

                    const headerFunction = function() {
                        if ($header.hasClass('show')) {
                            return;
                        }

                        $header.addClass('show');
                        $header.fadeIn();
                        if (!root.hasClass('locked')) {
                            setTimeout(function() {
                                $header.removeClass('show');
                                $header.fadeOut();
                            }, 5000);
                        }
                    };

                    let iframeDoc, iframeAnnos, details, player, iframeWindow;
                    root.off(ModalEvents.shown);
                    root.on(ModalEvents.shown, function() {
                        $('body').addClass('overflow-hidden');
                        $header.addClass('show');
                        if (localStorage.getItem('lock-bar')) {
                            $(this).find('.lock-bar').trigger('click');
                        }
                        // Copy the activity information to the modal header.
                        if ($card) {
                            let $completion = $card.find('[data-region=activity-information]');
                            $completion = $completion.clone();
                            $(this).find('[data-region="activity-completion"]').html($completion);
                        }
                        // Listen the player timeupdate event in the iframe.
                        let checkIframeDoc = function() {
                            try {
                                iframeDoc = document.getElementById('ivplayer').contentDocument;
                            } catch (e) {
                                cancelAnimationFrame(checkIframeDoc);
                                return;
                            }
                            iframeWindow = document.getElementById('ivplayer').contentWindow;
                            iframeAnnos = iframeWindow.IVANNO;
                            if (!iframeDoc.getElementById('player')) {
                                requestAnimationFrame(checkIframeDoc);
                                return;
                            }
                            // Hide the background-loading.
                            $('#background-loading').hide(0);
                            if (!iframeAnnos) {
                                requestAnimationFrame(checkIframeDoc);
                                return;
                            }

                            player = iframeWindow.IVPLAYER;
                            if (player.doptions.hidemainvideocontrols == 1) {
                                showcontrols = true;
                                $toggle.remove();
                            }

                            if (showcontrols) {
                                iframeDoc.querySelector('body').classList.add('showcontrols');
                            } else {
                                iframeDoc.querySelector('body').classList.remove('showcontrols');
                            }

                            let nocontrols = false;
                            if (!iframeDoc.getElementById('controller')) {
                                $content.addClass('show-control');
                                // Remove the toggle button.
                                $toggle.remove();
                                nocontrols = true;
                            }

                            if (iframeDoc.getElementById('player')) {
                                // Focus on the iframe.
                                iframeWindow.focus();
                                $header.removeClass('show');
                                $toggle.removeClass('d-none');

                                if (!showcontrols && !nocontrols) {
                                    setTimeout(function() {
                                        $content.removeClass('show-control');
                                    }, 1000);
                                }

                                $toggle.on('click', function() {
                                    $content.toggleClass('show-control');
                                    showcontrols = $content.hasClass('show-control');
                                    if (showcontrols) {
                                        localStorage.setItem('showcontrols', '1');
                                        iframeDoc.querySelector('body').classList.add('showcontrols');
                                    } else {
                                        localStorage.removeItem('showcontrols');
                                        iframeDoc.querySelector('body').classList.remove('showcontrols');
                                    }
                                });

                                iframeDoc.addEventListener('annotationitemsrendered', function(e) {
                                    details = e.detail;
                                });

                                $(iframeDoc).on('mousemove', '#interactivevideo-container', function() {
                                    if (root.hasClass('locked')) {
                                        return;
                                    }
                                    let $message = iframeDoc.querySelector('#message:not(.sticky)');
                                    let $activestart = iframeDoc.querySelector('#start-screen:not(.d-none) .hasintro');
                                    if ($message || $activestart) {
                                        $header.removeClass('show');
                                    } else {
                                        headerFunction();
                                    }
                                });

                                iframeDoc.addEventListener('videoPaused', function() {
                                    if (root.hasClass('locked')) {
                                        return;
                                    }
                                    let $message = iframeDoc.querySelector('#message:not(.sticky)');
                                    let $activestart = iframeDoc.querySelector('#start-screen:not(.d-none) .hasintro');
                                    if ($message || $activestart) {
                                        $header.removeClass('show');
                                    } else {
                                        headerFunction();
                                    }
                                    $toggle.fadeOut(300);
                                });

                                iframeDoc.addEventListener('iv:playerPlay', function() {
                                    $toggle.fadeIn(300);
                                });

                                iframeDoc.addEventListener('iv:playerReload', function(e) {
                                    player = e.detail.player;
                                });

                                // Analytics progress bar.
                                if ($card === null) {
                                    return;
                                }
                                let $progressbar = $card.find('.analytics.progress .progress-bar');
                                if ($progressbar.length == 0) {
                                    return;
                                }
                                let current = $progressbar.data('current');
                                iframeDoc.addEventListener('analyticsupdated', function(e) {
                                    let percentage = e.detail.percentage;
                                    if (percentage > current) {
                                        $progressbar.css('width', percentage + '%')
                                            .data('current', percentage);
                                        $card.find('.analytics-percentage').text(Math.round(percentage));
                                    }
                                    if (!player) {
                                        // Remove modal.
                                        root.remove();
                                    }
                                });
                            } else {
                                requestAnimationFrame(checkIframeDoc);
                            }
                        };
                        requestAnimationFrame(checkIframeDoc);

                        $(this).off(ModalEvents.hidden).on(ModalEvents.hidden, function() {
                            cancelAnimationFrame(checkIframeDoc);
                        });

                        root.off('click', '[data-action="toggle-manual-completion"]')
                            .on('click', '[data-action="toggle-manual-completion"]', function() {
                                $(this).parent().addClass('updated');
                                if ($(this).data('withavailability') == 1) {
                                    history.pushState(null, null, M.cfg.wwwroot + '/course/view.php?id='
                                        + course + '#module-' + id);
                                }
                            });


                        // Update the browser url to the current activity.
                        history.pushState(null, null, M.cfg.wwwroot + '/mod/interactivevideo/view.php?id=' + id);
                        // Update the title of tab to the activity name.
                        if ($card) {
                            let activitytitle = $card.data('title');
                            document.title = activitytitle;
                        } else {
                            document.title = $('li[data-id="' + id + '"] .activityname').text();
                        }
                    });

                    $(document).off('interactivevideo:closemodal');
                    $(document).on('interactivevideo:closemodal', async function() {
                        $('body').removeClass('overflow-hidden');

                        // Trigger hover on .image-container for 2 seconds.
                        if ($card) {
                            setTimeout(function() {
                                $card.find('.image-container').removeClass('hovered');
                            }, 1000);
                        }

                        if (player) { // Must check this in case user close modal before the player is ready.
                            await player.pause();
                        } else {
                            return;
                        }

                        if ($card) {
                            // If there is automatic completion conditions, we have to update it.
                            let $autocompletion = $card.find('.automatic-completion-conditions');
                            if ($autocompletion.length > 0) {
                                const completion = await $.ajax({
                                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                                    method: 'POST',
                                    dataType: 'text',
                                    data: {
                                        action: 'get_cm_completion',
                                        cmid: id,
                                        sesskey: M.cfg.sesskey,
                                        contextid: contextid,
                                        courseid: course,
                                        userid: M.cfg.userId || 0,
                                    }
                                });

                                if (completion) {
                                    const completiondata = JSON.parse(completion);
                                    // Check if the iframe document has withavailability class. If so, refresh the page.
                                    if (iframeDoc.body.classList.contains('withavailability') && completiondata.overallcompletion) {
                                        // eslint-disable-next-line max-depth
                                        if (currentUrl.indexOf('#module-') > -1) {
                                            currentUrl = currentUrl.replace(/#module-\d+/, '#module-' + id);
                                        } else {
                                            currentUrl = currentUrl + '#module-' + id;
                                        }
                                        window.location.href = currentUrl;
                                        return;
                                    }
                                    $card.find('[data-region=activity-information]')
                                        .html($(completiondata.completion).html());
                                }
                            }

                            // If there is manual completion, we have to copy the button to the course page.
                            let $manualcompletion = $(this).find('.completion-info.updated');
                            if ($manualcompletion.length > 0) {
                                $card.find('.completion-info').html($manualcompletion.html());
                            }

                            if (details) {
                                let progressbar = $card.find('.tasks .progress-bar');
                                if (progressbar.length > 0 && details.total > 0) {
                                    let percentage = Math.round(details.completed / details.total * 100);
                                    progressbar.css('width', percentage + '%');
                                    if (details.completed == details.total) {
                                        progressbar.addClass('bg-success').removeClass('bg-primary');
                                    } else {
                                        progressbar.removeClass('bg-success').addClass('bg-primary');
                                    }
                                    $card.find('.percentage')
                                        .text(percentage);
                                    $card.find('.items').text(`(${details.completed}/${details.total})`);
                                    $card.find('.xp').text(details.xp);
                                }
                            }
                        }

                        // Update the browser url to the current course.
                        history.pushState(null, null, currentUrl);
                        document.title = title;

                        if ($card) {
                            if (iframeAnnos) {
                                // Remove the new-bagde from the poster.
                                $card.find('.new-badge').remove();
                            }

                            $card.closest('.modtype_interactivevideo')[0]
                                .scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
                        }

                        if (iframeDoc) {
                            $(iframeDoc).off();
                            iframeAnnos = null;
                            details = null;
                            player = null;

                            if ($card.find('.analytics.progress .progress-bar').length == 0) {
                                // Remove the iframe.
                                playerModal.hide();
                                iframeDoc = null;
                            }
                        }
                    });

                    root.off(ModalEvents.hidden);
                    root.on(ModalEvents.hidden, function() {
                        if (playerModal) {
                            playerModal.hide();
                        }
                    });

                    $(document).find('iframe#ivplayer').off('load').on('load', function() {
                        if ($(this).closest('.modal').hasClass('hide')) {
                            playerModal.destroy();
                        }
                    });

                    // Close modal when the browser back button is clicked.
                    window.onpopstate = function(e) {
                        if (e.target.location.pathname == '/course/view.php') {
                            if (player) {
                                try {
                                    player.pause();
                                } catch (error) {
                                    // Do nothing.
                                }
                            }
                            playerModal.hide();
                        }
                    };

                    $(document)
                        .off('click', '[data-action="hidemodal"]')
                        .on('click', '[data-action="hidemodal"]', async function(e) {
                            e.preventDefault();

                            iframeWindow.postMessage({
                                event: 'closemodal',
                            }, '*');

                            $(this).find('i').removeClass('fa-arrow-left fa-arrow-right').addClass('fa-circle-o-notch fa-spin');
                            if (player) {
                                try {
                                   await player.pause();
                                } catch (e) {
                                    // Do nothing.
                                }
                            }
                            setTimeout(() => {
                                eventDispatcher.dispatchEvent('interactivevideo:closemodal');
                                root.find('[data-action="hide"]').trigger('click');
                            }, player ? 1500 : 0);
                        });

                    root.find('[data-action="hide"]').on('click', function() {
                        root.attr('data-region', 'modal-container');
                        $('.modal-backdrop.show').remove();
                    });

                    $(document).off('click', '.lock-bar').on('click', '.lock-bar', async function(e) {
                        e.preventDefault();
                        $(this).toggleClass('locked');
                        root.toggleClass('locked');
                        if ($(this).hasClass('locked')) {
                            $(this).attr('title', await str.get_string('unlock', 'mod_interactivevideo'));
                            $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
                            $header.addClass('show');
                            // Save to local storage.
                            localStorage.setItem('lock-bar', '1');
                            headerFunction();
                        } else {
                            $(this).attr('title', await str.get_string('lock', 'mod_interactivevideo'));
                            $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
                            // Remove from local storage.
                            localStorage.removeItem('lock-bar');
                            setTimeout(function() {
                                $header.removeClass('show');
                            }, 5000);
                        }
                    });

                    root.off('click', '.resize').on('click', '.resize', function(e) {
                        e.preventDefault();
                        root.toggleClass('modal-fullscreen iv-rounded-0 modal-resized');
                        root.find('.modal-dialog, .modal-content').toggleClass('iv-rounded-0');
                        $(this).find('i').toggleClass('fa-expand fa-compress');
                        if (root.hasClass('modal-fullscreen')) {
                            localStorage.removeItem('resized');
                            let showcontrols = localStorage.getItem('showcontrols') ? true : false;
                            if (showcontrols) {
                                iframeDoc.querySelector('body').classList.add('showcontrols');
                            } else {
                                iframeDoc.querySelector('body').classList.remove('showcontrols');
                            }
                        } else {
                            localStorage.setItem('resized', '1');
                            iframeDoc.querySelector('body').classList.add('showcontrols');
                        }
                    });
                };

                // Launch the interactive video in modal
                $(document).on('click', '.launch-interactivevideo', async function(e) {
                    e.preventDefault();
                    const id = $(this).data('id');
                    const instance = $(this).data('instance');
                    const course = $(this).data('course');
                    const contextid = $(this).data('contextid');
                    const $card = $(this).closest('#interactivevideo-' + instance);
                    $card.find('.image-container').addClass('hovered');
                    launchVideo($card, course, contextid, id);
                });

                $(document).on('click', '.activityname a[href*="mod/interactivevideo/view.php"]', async function(e) {
                    if ($(this).closest('li').hasClass('launchinpopup')) {
                        e.preventDefault();
                        const id = $(this).closest('li').data('id');
                        launchVideo(null, M.cfg.courseId, null, id);
                    }
                });

                $(document).on('click', '.open-external-link', function() {
                    playerModal.hide();
                    window.open($(this).data('href'), '_blank');
                });

                $(document).on('click', '.interactivevideo-card .description-toggle', function() {
                    const $description = $(this).closest('.top-section').find('.description');
                    $description.slideToggle('fast', 'swing');
                    $(this).find('.description-show').toggleClass('rotate');
                });

                // Get the #hash from the url and scroll to the element and hover it.
                $(document).ready(function() {
                    let hash = window.location.hash;
                    if (hash) {
                        let $element = $(hash);
                        if ($element.length > 0 && $element.hasClass('modtype_interactivevideo')) {
                            $element.addClass('highlighted');
                            setTimeout(() => {
                                $element[0].scrollIntoView({behavior: "smooth", block: "center", inline: "center"});
                                setTimeout(function() {
                                    $element.removeClass('highlighted');
                                    // Remove the hash from the url.
                                    history.pushState(null, null, window.location.href.split('#module')[0]);
                                }, 3000);
                            }, 1000);
                        }
                    }
                });

                // Launch report modal.
                $(document).on('click', '.launch-report', async function(e) {
                    e.preventDefault();
                    const href = $(this).data('href');

                    // If control or command key is pressed, open the modal. Otherwise, follow the link.
                    if (!e.ctrlKey && !e.metaKey) {
                        window.location.href = href;
                        return;
                    }

                    const reportModal = await ModalFactory.create({
                        body: await Templates.render('mod_interactivevideo/backgroundloading', {show: true}) +
                            `<iframe src="${href}&embed=1"
                         class="w-100 position-absolute h-100 border-0"
                         allow="autoplay"
                         style="z-index:1050;"></iframe>`,
                        title: await str.get_string('reportfor', 'mod_interactivevideo', $(this).data('title')),
                        large: true,
                        show: false,
                        removeOnClose: true,
                        isVerticallyCentered: true,
                    });

                    const root = reportModal.getRoot();
                    root.attr('id', 'reportModal').addClass('modal-fullscreen iv-modal');
                    root.find('.modal-body').addClass('p-0');
                    reportModal.show();
                    root.off(ModalEvents.hidden);
                    root.on(ModalEvents.hidden, function() {
                        reportModal.destroy();
                    });
                });

                // Quick form for interactive video settings.
                let ModalForm, addToast;
                $(document).on('click', '.iv_quickform', async function(e) {
                    const $this = $(this);
                    e.preventDefault();
                    const href = $this.data('href');
                    if (!e.ctrlKey && !e.metaKey) {
                        window.location.href = href;
                        return;
                    }

                    let formdata = {
                        contextid: $(this).data('contextid'),
                        cmid: $(this).data('cmid'),
                        courseid: $(this).data('courseid'),
                        interaction: $(this).data('interaction'),
                        origin: 'coursepage',
                    };

                    if (!ModalForm) {
                        ModalForm = await import('core_form/modalform');
                    }

                    if (!addToast) {
                        addToast = await import('core/toast');
                    }

                    let form = new ModalForm({
                        formClass: 'mod_interactivevideo\\form\\quicksettings_form',
                        args: formdata,
                        modalConfig: {
                            title: await str.get_string('quicksettings', 'mod_interactivevideo'),
                            removeOnClose: true,
                        }
                    });

                    form.show();

                    form.addEventListener(form.events.LOADED, (e) => {
                        e.stopImmediatePropagation();
                        // Replace the .modal-lg class with .modal-xl.
                        setTimeout(() => {
                            $('.modal.show').addClass('path-mod-interactivevideo');
                            $('.modal-dialog').removeClass('modal-lg').addClass('modal-xl');
                        }, 1000);
                        setTimeout(async() => {
                            let strings = await str.get_strings([
                                {key: 'moresettings', component: 'mod_interactivevideo'},
                                {key: 'resettodefaults', component: 'mod_interactivevideo'},
                            ]);
                            $('[data-region="footer"]').css('align-items', 'unset')
                                .prepend(`<span class="btn btn-secondary iv-mr-1 default" title="${strings[1]}">
                        <i class="fa fa-refresh"></i></span>
                        <a type="button" class="btn btn-secondary iv-mr-auto" target="_blank" data-dismiss="modal"
                         data-bs-dismiss="modal" title="${strings[0]}"
                            href="${M.cfg.wwwroot}/course/modedit.php?update=${formdata.cmid}"><i class="fa fa-cog"></i>
                            </a>`);
                        }, 2000);
                    });

                    form.addEventListener(form.events.FORM_SUBMITTED, (e) => {
                        e.stopImmediatePropagation();
                        addToast.add(str.get_string('settingssaved', 'mod_interactivevideo'), {
                            type: 'success',
                        });
                        // Replace the activity card with the new one.
                        let $newcard = $(e.detail.html);
                        $this.closest('.modtype_interactivevideo').replaceWith($newcard).trigger('click');
                    });

                    let DynamicForm;
                    $(document).off('click', '.default').on('click', '.default', async function(e) {
                        e.preventDefault();
                        formdata.action = 'reset';
                        if (!DynamicForm) {
                            DynamicForm = await import('core_form/dynamicform');
                        }
                        let form = new DynamicForm(document.querySelector('[data-region="body"]'),
                            'mod_interactivevideo\\form\\quicksettings_form');
                        form.load(formdata);
                        addToast.add(str.get_string('formvaluesarereset', 'mod_interactivevideo'), {
                            type: 'info',
                        });
                    });
                });
            },
        };
    });