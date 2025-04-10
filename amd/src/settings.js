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
 * Module for settings page.
 *
 * @module     mod_interactivevideo/settings
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function($) {
    var init = function() {
        $('#ivplugin_checkupdate').off('click').on('click', async function(e) {
            e.preventDefault();
            const modal = `<div class="modal fade" id="ivplugin_checkupdate_modal"
             tabindex="-1" role="dialog" aria-labelledby="ivplugin_checkupdate_modal" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" role="document">
                    <div class="modal-content">
                        <div class="modal-header" style="border-bottom: 0;">
                            <h5 class="modal-title" id="ivplugin_checkupdate_modal">Available interaction types</h5>
                        </div>
                        <div class="modal-body">
                        </div>
                    </div>
                </div>
            </div>`;
            $('body').append(modal);
            $('#ivplugin_checkupdate_modal').modal('show');
            let plugins = $('#ivplugin_updateinfo').val();
            plugins = JSON.parse(plugins);
            let installed = $('#ivplugin_installed').val();
            installed = JSON.parse(installed);
            plugins = plugins.map((plugin) => {
                plugin.installed = installed.find((p) => p.component === plugin.component);
                return plugin;
            });

            // Sort by title.
            plugins.sort((a, b) => {
                if (a.title < b.title) {
                    return -1;
                }
                if (a.title > b.title) {
                    return 1;
                }
                return 0;
            });

            let table = '<table class="table table-striped table-bordered">';
            table += '<tbody>';
            plugins.forEach((plugin) => {
                table += '<tr>';
                const row = `<td>
                <p class="iv-font-weight-bold mb-1 d-flex justify-content-between"><span>${plugin.title}</span>
                <span><a href="${plugin.description_url}" class="iv-mr-2" target="_blank">
                <i class="fa fa-circle-info"></i></a>
                <a href="${plugin.download_url}" class="iv-mr-2" target="_blank">
                <i class="fa fa-cloud-download"></i></a>
                </span></p>
                <p>${plugin.description}</p>
                <div class="d-flex justify-content-between">
                <div class="small iv-font-weight-bold">
                ${plugin.installed ? '<span class="text-success">Installed</span>' : 'Not installed'}
                </div>
                <div>${plugin.type == 'free' ? 'Free' : 'Paid'}</div>
                </div>
                </td>`;
                table += row;
                table += '</tr>';
            });
            table += '</tbody></table>';
            $('#ivplugin_checkupdate_modal .modal-body').html(table);
        });
    };

    return {
        init: init
    };
});