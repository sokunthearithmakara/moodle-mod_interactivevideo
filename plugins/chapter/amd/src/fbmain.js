
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
 * Interactive video chapter type script
 *
 * @module     ivplugin_chapter/fbmain
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Base from 'mod_flexbook/type/base';
import {get_string as getString} from 'core/str';
import state from 'mod_flexbook/state';

export default class Chapter extends Base {
    /**
     * Initialize the interaction type
     * @returns {void}
     */
    async init() {
        if (this.isEditMode()) {
            return;
        }

        if (this.annotations.length == 0) {
            return;
        }

        const self = this;

        $("#chaptertoggle").removeClass('d-none');

        // Render the chapters.
        const $chapterlists = $('[data-region=chapterlists]');
        $chapterlists.on('click', '.chapter .chapter-title', function(e) {
            e.preventDefault();
            // Hide the start, end screen.
            $('#start-screen').fadeOut(300);
            $('#end-screen').fadeOut(300);

            // If the .chapter is in the left container, hide it.
            if ($(this).closest('#chapter-container-left').length > 0) {
                $('#chaptertoggle .btn').trigger('click');
            }
        });

        // Chapter toggle.
        $(document).on('click', '#chaptertoggle .btn', function(e) {
            e.preventDefault();
            $('#interactivevideo-container').toggleClass('chapter-open');
            $(this).find('i').toggleClass('bi-collection bi-collection-fill');
        });

        $(document).on('click', '#closechapter', function(e) {
            e.preventDefault();
            $('#chaptertoggle .btn').trigger('click');
        });

        // Collapse/Expand the chapters on click of the chevron.
        $(document).on('click', '.chapter i.toggle.bi', function(e) {
            e.preventDefault();
            $(this).closest('.chapter').find('.annolistinchapter').slideToggle(300);
            $(this).toggleClass('bi-chevron-down bi-chevron-right');
        });

        $(document).on('annotationsrendered', function(e) {
            self.renderChapters(e.detail.annotations);
        });

        $chapterlists.on('click', 'li.anno, span.chapter-title', function(e) {
            e.preventDefault();
            const annotationid = $(this).data('id');
            state.navigateToAnnotation(annotationid);
        });

        // Add active class when interactionrun.
        $(document).on('interactionrun', function() {
            const id = state.currentanno.id;
            setTimeout(() => {
                $chapterlists.find(`li.anno[data-id="${id}"]`).addClass('active');
            }, 200);
        });
    }

    async renderChapters(annotations) {
        let self = this;
        let chapters = annotations.filter((annotation) => annotation.type == 'chapter');

        // Chapter 0.
        if (chapters.length == 0 || chapters[0]?.order != 1) {
            chapters.unshift({
                id: 0,
                title: await getString('startchapter', 'ivplugin_chapter'),
                formattedtitle: await getString('startchapter', 'ivplugin_chapter'),
                order: 0,
            });
        }

        const $chapterlists = $('[data-region=chapterlists]');
        $chapterlists.empty();
        chapters.forEach((chapter, index, arr) => {
            // Get annotations within this chapter based on order.
            let nextchapter = arr[index + 1];
            let chapteritems = [];
            if (nextchapter) {
                chapteritems = annotations.filter((a) => a.order > chapter.order && a.order < nextchapter.order);
            } else {
                chapteritems = annotations.filter((a) => a.order > chapter.order);
            }

            const gradableitems = chapteritems.filter((item) => item.hascompletion == '1');
            const completeditems = gradableitems.filter((item) => item.completed);
            const progress = gradableitems.length > 0 ? (completeditems.length / gradableitems.length) * 100 : 0;
            const chapterprogress = chapter.locked ? '<i class="fa fa-lock"></i>'
                : (gradableitems.length > 0 ? completeditems.length + '/' + gradableitems.length : '');
            const chapterprogressbar = gradableitems.length > 0
                ? `<span class="chapter-progressbar" aria-hidden="true"><span style="width: ${progress}%"></span></span>`
                : '';
            let chapteritemshtml = '';
            chapteritems.forEach((item) => {
                chapteritemshtml += state.ctRenderer[item.type].renderChapterItem(item);
            });
            $chapterlists.append(`<li class="p-0 flex-column border-${self.isBS5 ? 'start' : 'left'}-0
                 border-${self.isBS5 ? 'end' : 'start'}-0 chapter
            list-group-item bg-transparent d-flex justify-content-between align-items-center cursor-pointer"
            data-id="${chapter.id}" data-completed="${completeditems.length}" data-total="${gradableitems.length}">
            <div class="chapter-heading w-100 d-flex align-items-center justify-content-between p-2">
            <span class="chapter-heading-title flex-grow-1 text-truncate iv-font-weight-bold">
            <i class="bi bi-chevron-down iv-mr-2 toggle"></i>
            <span class="chapter-title" data-id="${chapter.id}">${chapter.formattedtitle}</span></span>
            ${chapterprogress ? '<span class="chapter-progress small iv-badge-primary iv-badge-pill">' +
                chapterprogress + '</span>' : ''}
            ${chapterprogressbar}</div>
            <ul class="annolistinchapter w-100 p-0">
            ${!chapter.locked || state.config.iseditor ? chapteritemshtml : ''}
            </ul></li>`);
        });

        if (state.currentanno) {
            setTimeout(() => {
                $chapterlists.find(`li.anno[data-id="${state.currentanno.id}"]`).addClass('active');
            }, 200);
        }
    }

    /**
     * Renders the edit item for the annotations list.
     *
     * @param {Array} annotations - The list of annotations.
     * @param {jQuery} listItem - The jQuery object representing the list item.
     * @param {Object} item - The item to be rendered.
     * @param {number} item.timestamp - The timestamp of the item.
     * @returns {jQuery} The modified list item.
     */
    renderEditItem(annotations, listItem, item) {
        listItem = super.renderEditItem(annotations, listItem, item);
        listItem.find('.type-name').addClass('justify-content-center');
        listItem.find('.type-icon i').remove();
        let lock = JSON.parse(item.advanced).lock;
        if (JSON.parse(item.advanced).lock && JSON.parse(item.advanced).lock != '') {
            listItem.find('.handle')
                .after(`<i class="fa fa-lock iv-ml-2" title="${M.util.get_string(lock, 'ivplugin_chapter')}"></i>`);
        }
        return listItem;
    }

    async islocked(chapter, annotations) {
        const chapters = annotations.filter((annotation) => annotation.type == 'chapter');
        const settings = JSON.parse(chapter.advanced || '{}');
        let locked = false;
        if (settings.lock && settings.lock != '') {
            if (settings.lock == 'untilprevious') {
                let previousIndex = chapters.findIndex((c) => c.id == chapter.id) - 1;
                if (previousIndex < 0) {
                    locked = false;
                } else {
                    let previouschapter = chapters[previousIndex];
                    // Check if the annotations in the previous chapter are completed.
                    let previouschapterannotations = annotations.filter((annotation) => {
                        return annotation.order >= previouschapter.order
                            && annotation.order < chapter.order && annotation.hascompletion == '1' && annotation.completed == false;
                    });
                    if (previouschapterannotations.length == 0) {
                        locked = false;
                    } else {
                        locked = true;
                    }
                }
            } else if (settings.lock == 'untilallprevious') {
                let previousAnnotations = annotations.filter((annotation) => {
                    return annotation.order < chapter.order && annotation.hascompletion == '1' && annotation.completed == false;
                });
                if (previousAnnotations.length == 0) {
                    locked = false;
                } else {
                    locked = true;
                }
            } else if (settings.lock == 'untilcomplete') {
                if (this.options.isCompleted == false) {
                    locked = true;
                }
            }
        }
        return locked;
    }

    async applyContent(annotation, $message) {
        const self = this;
        // We don't need to run the render method every time the content is applied. We can cache the content.
        if (!self.cache[annotation.id] || self.isEditMode()) {
            self.cache[annotation.id] = await self.render(annotation);
        }
        const data = self.cache[annotation.id];
        if ($message) {
            const $body = $message.find('.modal-body');
            let html = `<h2 class="iv-pl-2 border-3 border-start border-danger text-dark m-3">${annotation.formattedtitle}</h2>`;
            html += data;
            $body.html(html);
            $body.attr('id', 'content');
            await self.postContentRender(annotation, $message);
        }
    }

    /**
     * Run the interaction
     * @param {object} annotation The annotation object
     * @param {jQuery} $wrapper The wrapper element
     */
    async runInteraction(annotation, $wrapper) {
        if (annotation.intg1 == 1) {
            // Render as cover.
            let $annotationcontent = $wrapper.find('#annotation-canvas');
            const $message = await this.handleInlineDisplay(annotation, '', $annotationcontent);
            await this.applyContent(annotation, $message);
            return;
        }

        const index = state.sequence.indexOf(annotation.id.toString());
        const advanced = JSON.parse(annotation.advanced || '{}');
        if (state.direction == 'next') {
            if (!advanced.jumpto || advanced.jumpto == '') {
                const nextid = state.sequence[index + 1];
                if (nextid) {
                    await state.navigateToInteraction(nextid, false, 'next');
                    return;
                } else {
                    // Show endscreen.
                }
            } else {
                const jumpto = advanced.jumpto;
                const nextid = state.sequence.find(id => id == jumpto);
                if (nextid) {
                    await state.navigateToInteraction(nextid, false, 'next');
                    return;
                } else {
                    // Show endscreen.
                }
            }
        } else if (state.direction == 'prev') {
            if (!advanced.backto || advanced.backto == '') {
                const backto = state.sequence[index - 1];
                if (backto) {
                    await state.navigateToInteraction(backto, false, 'prev');
                    return;
                } else { // No previous annotation.
                    await state.navigateToInteraction(state.sequence[index + 1], false, 'prev');
                    return;
                }
            } else {
                const backto = advanced.backto;
                const nextid = state.sequence.find(id => id == backto);
                if (nextid) {
                    await state.navigateToInteraction(nextid, false, 'prev');
                    return;
                } else {
                    // Show endscreen.
                }
            }
        }
    }

    async previewInteraction() {
        // Do nothing.
        this.addNotification(await getString('nopreview', 'mod_flexbook'), 'default');
    }
}
