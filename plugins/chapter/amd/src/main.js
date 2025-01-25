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
 * @module     ivplugin_chapter/main
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Base from 'mod_interactivevideo/type/base';

export default class Chapter extends Base {
    /**
     * Initialize the interaction type
     * @returns {void}
     */
    init() {
        if (this.isEditMode()) {
            return;
        }
        let self = this;
        let chapters = this.annotations.filter((annotation) => annotation.type == 'chapter');

        $("#chaptertoggle").removeClass('d-none');
        // Order the chapters by timestamp.
        chapters.sort((a, b) => a.timestamp - b.timestamp);
        // If the first chapter doesn't start at the beginning, add a chapter at the beginning.
        if (chapters[0].timestamp > this.start) {
            chapters.unshift({
                id: 0,
                title: M.util.get_string('startchapter', 'ivplugin_chapter'),
                formattedtitle: M.util.get_string('startchapter', 'ivplugin_chapter'),
                timestamp: this.start
            });
        }
        // Calculate start and end time of each chapter.
        chapters.forEach((chapter, index) => {
            chapter.start = chapter.timestamp;
            if (index < chapters.length - 1) {
                chapter.end = chapters[index + 1].timestamp;
            } else {
                chapter.end = this.end;
            }
        });

        const convertSecondsToHMS = (seconds) => {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor(seconds % 3600 / 60);
            const s = Math.floor(seconds % 3600 % 60);
            return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        };

        // Render the chapters.
        const $chapterlists = $('[data-region=chapterlists]');
        $chapterlists.empty();
        chapters.forEach((chapter) => {
            $chapterlists.append(`<li class="p-0 flex-column border-left-0 border-right-0 chapter
            list-group-item bg-transparent d-flex justify-content-between align-items-center cursor-pointer"
            data-id="${chapter.id}" data-start="${chapter.start}" data-end="${chapter.end}">
            <div class="w-100 d-flex align-items-center justify-content-between p-2">
            <span class="flex-grow-1 text-truncate font-weight-bold"><i class="bi bi-chevron-down mr-2 toggle"></i>
            <span class="chapter-title">${chapter.formattedtitle}</span></span><span class="badge badge-primary badge-pill">
            ${convertSecondsToHMS(chapter.start - this.start)}</span></div>
            <ul class="annolistinchapter w-100 p-0"></ul></li>`);
        });

        $(document).on('timeupdate', async(e) => {
            const currenttime = e.originalEvent.detail.time;
            const currentchapter = chapters.find((chapter) => currenttime >= chapter.start && currenttime < chapter.end);
            if (currentchapter) {
                $chapterlists.find('.chapter').removeClass('active-chapter');
                $chapterlists.find(`.chapter[data-id=${currentchapter.id}]`).addClass('active-chapter');
                if (currentchapter.id != 0) {
                    $('#controller #chaptertitle').text(currentchapter.formattedtitle);
                } else {
                    $('#controller #chaptertitle').text('');
                }
            }
        });

        $chapterlists.on('click', '.chapter .chapter-title', function(e) {
            e.preventDefault();
            // Hide the start, end screen.
            $('#start-screen').fadeOut(300);
            $('#end-screen').fadeOut(300);

            let starttime = $(this).closest('li').data('start');
            self.player.seek(starttime);

            self.player.play();

            // Replace the progress bar.
            const percentage = (starttime - self.start) / self.totaltime * 100;
            $('#video-nav #progress').replaceWith(`<div id="progress"
             style="width: ${percentage > 100 ? 100 : percentage}%;"></div>`);
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
        if (Number(item.timestamp) > this.end || Number(item.timestamp) < this.start || this.isSkipped(item.timestamp)) {
            listItem.find('.title').addClass('text-muted');
        }
        return listItem;
    }

    /**
     * Render the annotation on the video navigation
     * @param {object} annotation The annotation object
     * @returns {void}
     */
    renderItemOnVideoNavigation(annotation) {
        if (annotation.hide) {
            return;
        }
        if (annotation.timestamp < this.start || annotation.timestamp > this.end) {
            return;
        }
        this.totaltime = this.totaltime || this.end - this.start;
        const percentage = ((Number(annotation.timestamp) - this.start) / this.totaltime) * 100;
        if (this.isVisible(annotation)) {
            let classes = annotation.type + ' annotation li-draggable ';
            if (annotation.completed) {
                classes += 'completed ';
            }
            if (!this.isClickable(annotation)) {
                classes += 'no-pointer-events ';
            }
            if (this.isSkipped(annotation.timestamp)) {
                classes += 'skipped ';
            }
            $("#video-nav ul").append(`<li class="${classes}" data-timestamp="${annotation.timestamp}"
              data-id="${annotation.id}" style="left: calc(${percentage}% - 5px)">
        <div class="item" data-toggle="tooltip" data-container="#wrapper" data-trigger="hover" data-html="true"
        data-original-title='<i class="${this.prop.icon} mr-1"></i>${annotation.formattedtitle}'></div></li>`);
        }
    }

    /**
     * Run the interaction
     * @param {object} annotation The annotation object
     */
    async runInteraction(annotation) {
        if (annotation.char1 != '1') {
            this.player.play();
            // Show the tooltip for 2 seconds.
            $('#video-nav ul li[data-id=' + annotation.id + '] .item').tooltip('show');
            setTimeout(() => {
                $('#video-nav ul li[data-id=' + annotation.id + '] .item').tooltip('hide');
            }, 2000);
            return;
        }

        await this.player.pause();
        $('#controler').addClass('no-pointer-events');
        $('#video-wrapper').append(`<h2 id="message" style="z-index:105" class="chapter position-absolute w-100 py-4
        px-3 m-0 justify-content-start no-pointer"><span class="text-truncate">${annotation.formattedtitle}</span></h2>`);
        // Add a progress bar and load it for 3 seconds.
        $('#video-wrapper #message').append(`<div id="chapterprogress" class="position-absolute w-100">
        <div class="progress-bar"></div></div>`);
        $('#message span').animate({
            'top': '1em',
        }, 300, 'swing');
        $('#chapterprogress .progress-bar').animate({'width': '100%'}, 3000, 'linear', () => {
            $('h2#message').remove();
            if (!this.isEditMode()) {
                $('#message span').css('top', '0');
                this.player.play();
                $('#controler').removeClass('no-pointer-events');
            }
        });
    }
}