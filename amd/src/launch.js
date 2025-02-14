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

define(['jquery', 'core/str', 'core/templates'], function($, str, Templates) {
    return {
        init: async function() {
            // Launch the interactive video in modal
            $(document).on('click', '.launch-interactivevideo', async function(e) {
                // Save the current document title.
                let title = document.title;
                // Get showcontrols from cache.
                let showcontrols = localStorage.getItem('showcontrols') ? true : false;
                e.preventDefault();
                const id = $(this).data('id');
                const instance = $(this).data('instance');
                const course = $(this).data('course');
                const contextid = $(this).data('contextid');
                const $card = $(this).closest('#interactivevideo-' + instance);
                $card.find('.image-container').addClass('hovered');
                let dataForTemplate = {
                    id: id,
                    showcontrols: showcontrols,
                    root: M.cfg.wwwroot,
                };

                const modal = await Templates.render('mod_interactivevideo/playermodal', dataForTemplate);

                $('#playermodal').remove(); // Important:: Remove the previous modal ONLY after the new one is created.
                $('body').append(modal);
                $('#playermodal').modal('show');

                const headerFunction = function() {
                    let $header = $('#playermodal .modal-header');
                    if ($header.hasClass('show')) {
                        return;
                    }

                    $header.addClass('show');
                    $header.fadeIn();
                    if (!$('#playermodal').hasClass('locked')) {
                        setTimeout(function() {
                            $header.removeClass('show');
                            $header.fadeOut();
                        }, 5000);
                    }
                };

                let iframeDoc, iframeAnnos, details, player;
                $('#playermodal').on('shown.bs.modal', function() {
                    $('body').addClass('overflow-hidden');
                    $(this).find('.modal-header').addClass('show');
                    if (localStorage.getItem('lock-bar')) {
                        $(this).find('.lock-bar').trigger('click');
                    }
                    // Copy the activity information to the modal header.
                    let $completion = $card.find('[data-region=activity-information]');
                    $completion = $completion.clone();
                    $(this).find('[data-region="activity-completion"]').html($completion);
                    // Listen the player timeupdate event in the iframe.
                    let checkIframeDoc = function() {
                        try {
                            iframeDoc = document.getElementById('ivplayer').contentDocument;
                        } catch (e) {
                            cancelAnimationFrame(checkIframeDoc);
                            return;
                        }
                        iframeAnnos = document.getElementById('ivplayer').contentWindow.IVANNO;
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

                        player = document.getElementById('ivplayer').contentWindow.IVPLAYER;

                        if (iframeDoc.getElementById('player')) {
                            $('#playermodal .modal-header').removeClass('show');
                            $('#playermodal .toggle-controls').removeClass('d-none');

                            if (!showcontrols) {
                                setTimeout(function() {
                                    $('#playermodal .modal-content').removeClass('show-control');
                                }, 1000);
                            }

                            $('#playermodal .toggle-controls').on('click', function() {
                                $('#playermodal .modal-content').toggleClass('show-control');
                                showcontrols = $('#playermodal .modal-content').hasClass('show-control');
                                if (showcontrols) {
                                    localStorage.setItem('showcontrols', '1');
                                } else {
                                    localStorage.removeItem('showcontrols');
                                }
                            });

                            iframeDoc.addEventListener('annotationitemsrendered', function(e) {
                                details = e.detail;
                            });

                            $(iframeDoc).on('mousemove', '#video-wrapper', function() {
                                if ($('#playermodal').hasClass('locked')) {
                                    return;
                                }
                                let $message = iframeDoc.querySelector('#message:not(.sticky)');
                                let $activestart = iframeDoc.querySelector('#start-screen:not(.d-none) .hasintro');
                                if ($message || $activestart) {
                                    $('#playermodal .modal-header').removeClass('show');
                                } else {
                                    headerFunction();
                                }
                            });

                            iframeDoc.addEventListener('videoPaused', function() {
                                if ($('#playermodal').hasClass('locked')) {
                                    return;
                                }
                                let $message = iframeDoc.querySelector('#message:not(.sticky)');
                                let $activestart = iframeDoc.querySelector('#start-screen:not(.d-none) .hasintro');
                                if ($message || $activestart) {
                                    $('#playermodal .modal-header').removeClass('show');
                                } else {
                                    headerFunction();
                                }
                                $('#playermodal .toggle-controls').fadeOut(300);
                            });

                            iframeDoc.addEventListener('iv:playerPlaying', function() {
                                $('#playermodal .toggle-controls').fadeIn(300);
                            });

                            // Analytics progress bar.
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
                            });
                        } else {
                            requestAnimationFrame(checkIframeDoc);
                        }
                    };
                    requestAnimationFrame(checkIframeDoc);

                    $(this).off('hidden.bs.modal').on('hidden.bs.modal', function() {
                        cancelAnimationFrame(checkIframeDoc);
                    });

                    $(document).off('click', '#playermodal [data-action="toggle-manual-completion"]')
                        .on('click', '#playermodal [data-action="toggle-manual-completion"]', function() {
                            $(this).parent().addClass('updated');
                            if ($(this).data('withavailability') == 1) {
                                history.pushState(null, null, M.cfg.wwwroot + '/course/view.php?id=' + course + '#module-' + id);
                            }
                        });

                    // Update the browser url to the current activity.
                    history.pushState(null, null, M.cfg.wwwroot + '/mod/interactivevideo/view.php?id=' + id);
                    // Update the title of tab to the activity name.
                    let activitytitle = $card.data('title');
                    document.title = activitytitle;
                });

                $('#playermodal').on('hide.bs.modal', async function() {
                    $('body').removeClass('overflow-hidden');
                    // Trigger hover on .image-container for 2 seconds.
                    setTimeout(function() {
                        $card.find('.image-container').removeClass('hovered');
                    }, 1000);

                    if (player) { // Must check this in case user close modal before the player is ready.
                        await player.pause();
                    } else {
                        $(this).remove();
                        return;
                    }
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
                        if (progressbar.length > 0) {
                            progressbar.css('width', Math.round(details.completed / details.total * 100) + '%');
                            if (details.completed == details.total) {
                                progressbar.addClass('bg-success').removeClass('bg-primary');
                            } else {
                                progressbar.removeClass('bg-success').addClass('bg-primary');
                            }
                            $card.find('.percentage')
                                .text(Math.round(details.completed / details.total * 100));
                            $card.find('.items').text(`(${details.completed}/${details.total})`);
                            $card.find('.xp').text(details.xp);
                        }
                    }

                    // Update the browser url to the current course.
                    history.pushState(null, null, M.cfg.wwwroot + '/course/view.php?id=' + course);
                    document.title = title;

                    if (iframeAnnos) {
                        // Remove the new-bagde from the poster.
                        $card.find('.new-badge').remove();
                    }

                    $card.closest('.modtype_interactivevideo')[0]
                        .scrollIntoView({behavior: "smooth", block: "center", inline: "center"});

                    if (iframeDoc) {
                        $(iframeDoc).off();
                    }
                });

                // Close modal when the browser back button is clicked.
                window.onpopstate = function(e) {
                    if (e.target.location.pathname == '/course/view.php') {
                        $('#playermodal').modal('hide');
                    }
                };

                $(document).off('click', '.lock-bar').on('click', '.lock-bar', async function(e) {
                    e.preventDefault();
                    $(this).toggleClass('locked');
                    $('#playermodal').toggleClass('locked');
                    if ($(this).hasClass('locked')) {
                        $(this).attr('title', await str.get_string('unlock', 'mod_interactivevideo'));
                        $(this).find('i').removeClass('fa-unlock').addClass('fa-lock');
                        $('#playermodal .modal-header').addClass('show');
                        // Save to local storage.
                        localStorage.setItem('lock-bar', '1');
                        headerFunction();
                    } else {
                        $(this).attr('title', await str.get_string('lock', 'mod_interactivevideo'));
                        $(this).find('i').removeClass('fa-lock').addClass('fa-unlock');
                        // Remove from local storage.
                        localStorage.removeItem('lock-bar');
                        setTimeout(function() {
                            $('#playermodal .modal-header').removeClass('show');
                        }, 5000);
                    }

                });
            });

            $(document).on('click', '.open-external-link', function() {
                $('#playermodal').modal('hide');
                window.open($(this).data('href'), '_blank');
            });

            $(document).on('click', '.interactivevideo-card .description-show', function() {
                const $description = $(this).closest('.top-section').find('.description');
                $description.slideToggle('fast', 'swing');
                $(this).toggleClass('rotate');
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

                const data = {
                    id: 'reportModal',
                    title: await str.get_string('reportfor', 'mod_interactivevideo', $(this).data('title')),
                    body: `<iframe src="${href}&embed=1"
                                        style="width: 100%; height: 100%; border: 0; z-index:1050; position:absolute;"></iframe>`,
                };
                let Modal = await Templates.render('mod_interactivevideo/fullscreenmodal', data);

                $('body').append(Modal);
                $('#reportModal').modal('show');
                $('#reportModal').on('shown.bs.modal', function() {
                    $(this).focus();
                });
                $('#reportModal').on('hidden.bs.modal', function() {
                    $(this).remove();
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
                        $('.modal-dialog').removeClass('modal-lg').addClass('modal-xl path-mod-interactivevideo');
                    }, 1000);
                    setTimeout(async() => {
                        let strings = await str.get_strings([
                            {key: 'moresettings', component: 'mod_interactivevideo'},
                            {key: 'resettodefaults', component: 'mod_interactivevideo'},
                        ]);
                        $('[data-region="footer"]').css('align-items', 'unset')
                            .prepend(`<span class="btn btn-secondary mr-1 default" title="${strings[1]}">
                        <i class="fa fa-refresh"></i></span>
                        <a type="button" class="btn btn-secondary mr-auto" target="_blank" data-dismiss="modal"
                            title="${strings[0]}"
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