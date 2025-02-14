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
 * TODO describe module quickform
 *
 * @module     mod_interactivevideo/quickform
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import $ from 'jquery';
import {dispatchEvent} from 'core/event_dispatcher';

const quickform = async() => {
    let ModalForm, str;
    $(document).on('click', '.iv_quickform', async function(e) {
        let data = {
            contextid: $(this).data('contextid'),
            cmid: $(this).data('cmid'),
            courseid: $(this).data('courseid'),
            interaction: $(this).data('interaction'),
            origin: $(this).data('origin'),
        };
        e.preventDefault();
        // Hold control/cmd to go to data-href.
        if (!e.ctrlKey && !e.metaKey) {
            window.location.href = $(this).data('href');
            return;
        }

        if (!ModalForm) {
            ModalForm = await import('core_form/modalform');
        }

        if (!str) {
            str = await import('core/str');
        }

        let form = new ModalForm({
            formClass: 'mod_interactivevideo\\form\\quicksettings_form',
            args: data,
            modalConfig: {
                title: await str.get_string('quicksettings', 'mod_interactivevideo'),
                removeOnClose: true,
            }
        });

        form.show();

        form.addEventListener(form.events.LOADED, (e) => {
            e.stopImmediatePropagation();
            if (window.IVPLAYER) {
                window.IVPLAYER.pause();
            }
            // Replace the .modal-lg class with .modal-xl.
            setTimeout(() => {
                $('.modal-dialog').removeClass('modal-lg').addClass('modal-xl');
            }, 1000);
            setTimeout(async() => {
                let strings = await str.get_strings([
                    {key: 'moresettings', component: 'mod_interactivevideo'},
                    {key: 'resettodefaults', component: 'mod_interactivevideo'},
                ]);
                $('[data-region="footer"]').css('align-items', 'unset')
                    .prepend(`<span class="btn btn-secondary mr-1 default" title="${strings[1]}"><i class="fa fa-refresh"></i>
                        </span>
                        <a type="button" class="btn btn-secondary mr-auto" data-dismiss="modal" title="${strings[0]}"
                 href="${M.cfg.wwwroot}/course/modedit.php?update=${data.cmid}"><i class="fa fa-cog"></i>
                 </a>`);
            }, 2000);
        });

        form.addEventListener(form.events.FORM_SUBMITTED, (e) => {
            e.stopImmediatePropagation();
            data.detail = e.detail;
            if (data.origin === 'navbar') {
                $('#background-loading').show();
                window.location.reload();
            } else {
                dispatchEvent('quickformsubmitted', data);
            }
        });

        let DynamicForm;
        $(document).off('click', '.default').on('click', '.default', async function(e) {
            e.preventDefault();
            data.action = 'reset';
            if (!DynamicForm) {
                DynamicForm = await import('core_form/dynamicform');
            }
            let form = new DynamicForm(document.querySelector('[data-region="body"]'),
                'mod_interactivevideo\\form\\quicksettings_form');
            form.load(data);
        });
    });
};

export default quickform;