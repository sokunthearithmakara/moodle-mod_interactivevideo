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
 * Content bank utility functions
 *
 * @module     ivplugin_contentbank/util
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Ajax from 'core/ajax';
const getcontent = (id, contextid, target) => {
    Ajax.call([{
        args: {
            id: id,
            contextid: contextid,
        },
        contextid: contextid,
        methodname: 'ivplugin_contentbank_getitem',
    }])[0].then((response) => {
        if (target) {
            return $(target).html(response.item);
        } else {
            return response;
        }
    }).catch(() => {
        // Do nothing.
    });
};

const init = (contextid) => {
    $(document).on('click', '.contentbank-container .contentbank-item .contentbank-item-details', function (e) {
        e.preventDefault();
        $('.contentbank-container .contentbank-item').removeClass('selected');
        $(this).closest('.contentbank-item').addClass('selected');
        $('#contentbank-preview').empty();
        var id = $(this).closest('.contentbank-item').data('contentid');
        $('[name=contentid]').val(id);
    });

    $(document).on('click', '.contentbank-container .contentbank-item .contentbankview', function (e) {
        e.preventDefault();
        $('.contentbank-container .contentbank-item').removeClass('selected');
        var targetContentbank = $(this).closest('.contentbank-item');
        targetContentbank.addClass('selected');
        var id = targetContentbank.data('contentid');
        $('#contentbank-preview').empty();
        $('#contentbank-preview').attr('data-contentid', id);
        $('[name=contentid]').val(id);
        // Preview selected content
        getcontent(id, contextid, '#contentbank-preview');

        // Handle xAPI event. We want user to be able to check if the content emits xAPI events (completed, answered)
        // because some content types may not emit these events. Then user can decide
        // if they want students to mark it complete manually or automatically.
        var xapicheck = M.util.get_string('xapicheck', 'ivplugin_contentbank');
        var H5P;
        var iframeinterval = setInterval(function () {

            try { // Try to get the H5P object.
                H5P = document.querySelector('#contentbank-preview iframe.h5p-player').contentWindow.H5P;
            } catch (e) {
                H5P = null;
            }

            if (typeof H5P !== 'undefined' && H5P !== null) {
                $("#contentbank-preview .xapi").remove();
                $(`#contentbank-preview[data-contentid=${id}]`)
                .prepend(`<div class="xapi float-right alert-secondary d-inline px-2 text-center rounded-pill mb-2">
                ${xapicheck}</div>`);
                H5P.externalDispatcher.on('xAPI', function (event) {
                    if ((event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/completed'
                    || event.data.statement.verb.id == 'http://adlnet.gov/expapi/verbs/answered')
                    && event.data.statement.object.id.indexOf('subContentId') < 0) {
                        $("#contentbank-preview .xapi").remove();
                        $("#contentbank-preview")
                        .prepend(`<div class="xapi float-right alert-success d-inline px-2 text-center rounded-pill mb-2">
                        <i class="fa fa-check mr-2"></i>${M.util.get_string('xapieventdetected', 'ivplugin_contentbank')}</div>`);
                        var audio = new Audio(M.cfg.wwwroot + '/mod/interactivevideo/sounds/pop.mp3');
                        audio.play();
                    }
                });

                clearInterval(iframeinterval);
            }

        }, 1000);
    });
};

const refreshContentBank = (id, coursecontextid, edit = true, callback) => {
    $('#contentbank-preview').empty();
    let contentbankitems = Ajax.call([{
        args: {
            contextid: coursecontextid
        },
        contextid: coursecontextid,
        methodname: 'ivplugin_contentbank_getitems',
    }])[0];

    contentbankitems.then((response) => {
        var contents = JSON.parse(response['contents']);
            var contentbank = $('.modal-body form .contentbank-container');
            contentbank.empty();
            contents.forEach(function (content) {
                var editurl = M.cfg.wwwroot + '/contentbank/edit.php?contextid='
                + coursecontextid + '&id=' + content['id'] + '&plugin=' + content['type'];
                var html = '<div class="contentbank-item d-flex align-items-center p-1 '
                + (content['id'] == id ? "selected" : "") + ' " data-contentid="' + content['id']
                + '"><div class="contentbank-item-details d-flex align-items-center">';
                if (content['icon']) {
                    html += '<img class="contentbank-item-icon mr-2" src="' + content['icon'] + '"/>';
                } else {
                    html += '<div class="contentbank-item-icon mr-2"></div>';
                }

                html += '<div class="contentbank-item-name w-100">' + content['name'] + '</div></div>';
                html += `<div class="btn btn-sm ml-auto contentbankview" data-toggle="tooltip" data-container="#wrapper"
                 data-trigger="hover" data-title="${M.util.get_string('preview', 'ivplugin_contentbank')}">
                 <i class="bi bi-eye-fill"></i></div>`;
                if (edit) {
                    html += `<a class="btn btn-sm ml-2" target="_blank" href="${editurl}"
                     data-toggle="tooltip" data-container="#wrapper" data-trigger="hover"
                      data-title="${M.util.get_string('edit', 'ivplugin_contentbank')}">
                     <i class="bi bi-pencil-square"></i></a>`;
                }

                html += `</div>`;


                contentbank.append(html);
            });

            if (callback) {
                callback();
            }
    }).catch(() => {
        // Do nothing.
    });
};

export default {init, getcontent, refreshContentBank};