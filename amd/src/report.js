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
 * Handle report page
 *
 * @module     mod_interactivevideo/report
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import ReportBase from 'mod_interactivevideo/report_base';
import Notification from 'core/notification';
import {add as addToast} from 'core/toast';
import JSZip from './libraries/jszip';
import './libraries/jquery.dataTables';
import './libraries/dataTables.bootstrap4';
import './libraries/dataTables.buttons';
import './libraries/buttons.bootstrap4';
import './libraries/buttons.html5';
import './libraries/buttons.colVis';
import './libraries/dataTables.select';
import './libraries/select.bootstrap4';
import './libraries/select2';
import quickform from './quickform';
import ModalEvents from 'core/modal_events';

/**
 * Initializes the report functionality for the interactive video module.
 *
 * @param {number} cmid - The course module ID.
 * @param {number} groupid - The group ID.
 * @param {number} grademax - The maximum grade.
 * @param {Array} itemids - The annotation IDs.
 * @param {number} completionpercentage - The completion percentage.
 * @param {string} videourl - The video URL.
 * @param {string} videotype - The video type.
 * @param {Object} cm - The course module object.
 * @param {number} courseid - The course ID.
 * @param {number} start - The start time.
 * @param {number} end - The end time.
 * @param {string} posterimage - The poster image.
 * @param {string} name - The name of the activity.
 * @param {Object} access - The access object.
 */
const init = async(cmid, groupid, grademax, itemids, completionpercentage, videourl, videotype, cm, courseid, start, end,
    posterimage, name, access) => {
    window.JSZip = JSZip;
    let player;
    const isBS5 = $('body').hasClass('bs-5');
    window.M.version = $('#iv-m-version').data('value');
    // Const bsAffix = isBS5 ? '-bs' : '';
    let ModalFactory;

    if (window.M.version < 403) {
        ModalFactory = await import('core/modal_factory');
    } else {
        ModalFactory = await import('core/modal');
    }

    quickform();

    require(['theme_boost/bootstrap/tooltip']);

    $('#background-loading').show();

    const getReportData = $.ajax({
        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
        method: 'POST',
        data: {
            action: 'get_report_data_by_group',
            cmid: cmid,
            sesskey: M.cfg.sesskey,
            contextid: M.cfg.contextid,
            ctxid: M.cfg.courseContextId,
            courseid: courseid,
            groupid: groupid,
        }
    });

    let itemsdata = $('#itemsdata').text();
    itemsdata = JSON.parse(itemsdata);
    // Init the contenttypes that has initonreport.
    let initonreport = itemsdata.filter(x => JSON.parse(x.prop).initonreport);
    initonreport = [...new Set(initonreport.map(x => x.type))];

    let contentTypes;
    let relContentTypeAmd = {};
    let tabledata;

    $.when(getReportData).done(async(data) => {
        contentTypes = itemsdata.map(x => JSON.parse(x.prop));
        // Unique content types based on name.
        contentTypes = contentTypes.filter((value, index, self) =>
            index === self.findIndex((t) => (
                t.name === value.name && t.type === value.type
            ))
        );
        // Require[] all AMD modules that are used in the report.
        const loadPromises = contentTypes.map(contentType => {
            return new Promise((resolve) => {
                require([contentType.amdmodule], (Module) => {
                    relContentTypeAmd[contentType.name] = new Module(player, itemsdata, cmid, courseid, null,
                        completionpercentage, null, grademax, videotype, null,
                        end - start, start, end, contentType, cm, null, {}, null, null, {
                        url: videourl,
                        posterimage,
                        name,
                    });
                    resolve();
                });
            });
        });

        await Promise.all(loadPromises);

        const hasCompletion = data.some(x => x.timecreated > 0);
        let profileFields = [];
        let customProfileFields = data.map(x => x.customfields);
        // Combine all custom profile fields and remove duplicates.
        customProfileFields = customProfileFields.reduce((acc, val) => {
            return acc.concat(val);
        }, []);
        customProfileFields = [...new Set(customProfileFields)];
        // Remove the undefined values.
        customProfileFields = customProfileFields.filter(x => x !== undefined);
        $("#completiontable th.profilefield").each(function() {
            const pr = {
                index: $("#completiontable th").index($(this)),
                text: $(this).text(),
                name: $(this).attr('id'),
                type: 'text'
            };
            if (customProfileFields && customProfileFields.length > 0) {
                const customField = customProfileFields.find(x => x.shortname === pr.name.replace('profile_field_', ''));
                if (customField) {
                    pr.type = customField.type;
                }
            }
            profileFields.push(pr);
        });

        let exportOptions = ReportBase.getExportOptions();

        let columns = [
            {
                data: "id",
                visible: false,
                className: "exportable inv d-none",
            },
            {
                data: "picture",
                render: function(data, type, row) {
                    if (type === 'sort') {
                        return row.fullname;
                    }
                    let deletebutton = '';
                    if (access.canedit == 1) {
                        deletebutton = `<button title="${M.util.get_string('reset', 'mod_interactivevideo')}"
                 class="btn border-0 btn-sm text-danger reset m-1" data-record="${row.completionid}"
                  data-userid="${row.id}">
                 <i class="bi bi-trash3"></i></button>`;
                    }
                    // Put _target=blank to open the user profile in a new tab (use regex)
                    data = data.replace(/<a /g, '<a target="_blank" ');
                    return `<div class="d-flex align-items-center">
                    ${access.canedit == 1 ? `<input class="iv-mr-3 bulk" type="checkbox"
                         data-record="${row.completionid}" ${row.timecreated > 0 ? '' : 'disabled'}
                         data-userid="${row.id}"/>` : ''}
                    <div class="text-truncate d-flex align-items-center justify-content-between flex-grow-1">${data}
                ${row.timecreated > 0 ? deletebutton : ''}</div></div>`;
                },
                className: "bg-white sticky-left-0",
            },
        ];

        let $identitycolumn = $('#reporttable th.profilefield');
        if ($identitycolumn.length > 0) {
            $identitycolumn.each(function() {
                let $this = $(this);
                columns.push({
                    data: $(this).attr('id'),
                    render: function(data, type, row) {
                        if (!row.customfields) {
                            return data;
                        }
                        let field = row.customfields.find(x => x.shortname === $this.attr('id').replace('profile_field_', ''));
                        if (!field) {
                            return data;
                        }
                        if (type === 'display') {
                            return field.formatted !== undefined ? field.formatted : data;
                        }
                        return field.value; // Raw value for filtering/sorting.
                    },
                });
            });
        }

        columns = columns.concat([
            {
                data: "timecreated",
                "render": function(data, type) {
                    if (!data || data == 0) {
                        if (type === 'display') {
                            return '';
                        } else {
                            return 0;
                        }
                    } else {
                        const date = new Date(data * 1000);
                        if (type === 'display') {
                            return date.toLocaleString();
                        } else if (type === 'filter' || type === 'sort') {
                            return date.getTime();
                        }
                        return data;
                    }
                },
                className: "exportable timecreated"
            },
            {
                data: "timecompleted",
                render: function(data, type, row) {
                    if (!data || data == 0) {
                        if (!row.timecreated) {
                            if (type === 'display') {
                                return '';
                            } else {
                                return 0;
                            }
                        } else {
                            if (type === 'display') {
                                return M.util.get_string('inprogress', 'mod_interactivevideo');
                            } else {
                                return 0;
                            }
                        }
                    } else {
                        const date = new Date(data * 1000);
                        if (type === 'display') {
                            return date.toLocaleString();
                        } else if (type === 'filter' || type === 'sort') {
                            return date.getTime();
                        }
                        return data;
                    }
                },
                className: "exportable" + (itemids.length == 0 ? " inv d-none" : "")
            },
            {
                data: "completionpercentage",
                render: function(data, type) {
                    if (data) {
                        return data + "%";
                    } else {
                        if (type === 'display') {
                            return "";
                        }
                        return 0;
                    }
                },
                className: "exportable" + (itemids.length == 0 ? " inv d-none" : "")
            },
            {
                data: "xp",
                render: function(data) {
                    if (data) {
                        return data;
                    } else {
                        return "";
                    }
                },
                className: "exportable" + (itemids.length == 0 ? " inv d-none" : "")
            }
        ]);

        let datatableOptions = ReportBase.getDataTableOptions({
            columns,
            exportOptions,
            hasCompletion,
            itemids,
            profileFields,
            isBS5,
            data
        });

        Object.assign(datatableOptions, {
            "deferRender": true,
            "rowId": "id",
            "pageLength": 25,
            "order": [[columns.findIndex(c => c.data == 'timecreated'), 'desc'], [1, 'asc']],
            "columnDefs": [
                {
                    "targets": 'not-sortable',
                    "sortable": false,
                },
                {
                    "targets": 'inv',
                    "visible": false,
                },
                {
                    "targets": 'colvis',
                    "visible": false,
                }
            ],
            "pagingType": "full",
        });


        $("#reporttable th.rotate").each(function() {
            const itemid = $(this).data("item").toString();
            const ctype = $(this).data("type");
            datatableOptions.columns.push({
                data: null,
                itemid: itemid,
                sortable: false,
                className: "text-center exportable data-cell",
                render: function(data, rtype, row) {
                    let completiondetails;
                    try {
                        completiondetails = JSON.parse(data.completiondetails).map(x => JSON.parse(x));
                    } catch (e) {
                        completiondetails = [];
                    }
                    let details = completiondetails.find(x => Number(x.id) == Number(itemid));
                    if (details) {
                        if (details.deleted) {
                            if (rtype === 'display') {
                                return `<i class="bi bi-trash3 text-muted"
                             title="${M.util.get_string('deletedbyinstructor', 'mod_interactivevideo')}"></i>`;
                            } else {
                                return '-';
                            }
                        }
                        // Convert tooltip bs4 to bs5 for reportView.
                        if (isBS5) {
                            details.reportView = details.reportView.replace(/data-toggle="tooltip"/g, 'data-bs-toggle="tooltip"');
                            details.reportView = details.reportView.replace(/data-original-title/g, 'data-bs-original-title');
                            details.reportView = details.reportView.replace(/data-title/g, 'title');
                            details.reportView = details.reportView.replace(/data-placement/g, 'data-bs-placement');
                            details.reportView = details.reportView.replace(/data-html/g, 'data-bs-html');
                        }
                        let module = relContentTypeAmd[ctype];
                        let reportView = details.reportView;
                        let res = '';
                        if (module) {
                            let theAnnotation = itemsdata.find(x => x.id == itemid);
                            res = module.renderReportView(theAnnotation, details, {
                                access: access,
                                itemid: itemid,
                                ctype: ctype,
                                row: row,
                                data: data,
                            });
                        } else {
                            res = `<span class="completion-detail ${details.hasDetails ? 'cursor-pointer' : ''}"
                                 data-id="${itemid}" data-userid="${row.id}" data-type="${ctype}">${reportView}</span>`;
                            if (access.canedit == 1) {
                                res += `<i class="bi bi-trash3 fs-unset text-danger cursor-pointer position-absolute delete-cell"
                                  title="${M.util.get_string('delete', 'mod_interactivevideo')}"></i>`;
                            }
                        }
                        return res;
                    } else {
                        return '-';
                    }
                },
                "createdCell": function(td) {
                    $(td).attr("data-item", itemid);
                    $(td).attr("data-type", ctype);
                },
            });
        });

        // Create the footer for the table.
        let $tfoot = $('<tfoot></tfoot>');
        let $tr = $('<tr></tr>');
        columns.forEach(function(column) {
            let $td = $('<td></td>');
            if (column.data) {
                $td.attr('id', column.data);
            }
            if (column.itemid) {
                $td.attr('data-item', column.itemid);
            }
            $tr.append($td);
        });
        $tfoot.append($tr);
        $('#completiontable').append($tfoot);

        tabledata = $('#completiontable').DataTable(datatableOptions);

        // Handle select.
        tabledata.on("draw", function() {
            $('tr.selected td.checkbox input').prop("checked", true);
            $('tr:not(.selected) td.checkbox input').prop("checked", false);
        });

        ReportBase.registerBulkActions(tabledata, {
            courseid,
            cmid,
            ajaxUrl: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
            ajaxAction: 'delete_progress_by_ids',
        });

        let filterTimer = null;
        $('#filterregion :input:not([type=date])').on('keyup change', function(e) {
            filterTimer = ReportBase.applyFilter(tabledata, $(this), e, filterTimer);
        });

        ReportBase.registerSearchFilters(tabledata, columns);
        ReportBase.registerClickHandlers(tabledata, columns);

        // Right-click on data-cell to delete completion data for specific user and specific item.
        $(document).on('click', 'td.data-cell .delete-cell', function(e) {
            e.preventDefault();
            if (access.canedit != 1) {
                return;
            }
            let $this = $(this).closest('td');
            let itemid = $this.data('item');
            if ($this.text() === '-' || $this.text() === '') {
                return;
            }
            let userid = $this.closest('tr').attr('id');
            let userfullname = data.find(x => x.id == userid).fullname;
            let recordid = $this.closest('tr').find('td').eq(0).find('button').data('record');
            let cellIndex = $this.index();
            let title = $this.closest('table').find('th').eq(cellIndex).text();

            const deleteCompletionData = async() => {
                let theAnnotation = itemsdata.find(x => x.id == itemid);
                const module = relContentTypeAmd[theAnnotation.type];
                if (module.deleteCompletionData(recordid, itemid, userid)) {
                    let targetdata = tabledata.row($this.closest('tr')).data();
                    targetdata.completeditems = JSON.stringify(
                        JSON.parse(targetdata.completeditems).filter(x => x.id != itemid));
                    let completiondetails = JSON.parse(targetdata.completiondetails);
                    completiondetails = completiondetails.map(x => {
                        x = JSON.parse(x);
                        if (x.id == itemid) {
                            x.hasDetails = true;
                            x.deleted = true;
                            x.reportView = '<i class="bi bi-trash3 text-danger"></i>';
                        }
                        return JSON.stringify(x);
                    });
                    targetdata.completiondetails = JSON.stringify(completiondetails);
                    tabledata.row($this.closest('tr')).data(targetdata).draw();
                    addToast(M.util.get_string('completedeletedforthisitem', 'mod_interactivevideo', {
                        item: title,
                        user: userfullname
                    }), {
                        type: 'success'
                    });
                } else {
                    addToast(M.util.get_string('completionreseterror', 'mod_interactivevideo'), {
                        type: 'error'
                    });
                }
            };

            try {
                Notification.deleteCancelPromise(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('deleterecordforitemforuserconfirm', 'mod_interactivevideo', {
                        item: title,
                        user: userfullname
                    }),
                    M.util.get_string('delete', 'mod_interactivevideo')
                ).then(async() => {
                    return deleteCompletionData();
                }).catch(() => {
                    return;
                });
            } catch { // Fallback for older versions of Moodle.
                Notification.saveCancel(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('deleterecordforitemforuserconfirm', 'mod_interactivevideo', {
                        item: title,
                        user: userfullname
                    }),
                    M.util.get_string('delete', 'mod_interactivevideo'),
                    function() {
                        return deleteCompletionData();
                    }
                );
            }
        });

        initonreport.forEach((type) => {
            let module = relContentTypeAmd[type];
            if (module) {
                module.init();
                return;
            }
            let matchingContentTypes = contentTypes.find(x => x.name === type);
            let amdmodule = matchingContentTypes.amdmodule;
            require([amdmodule], function(Module) {
                new Module(player, itemsdata, cmid, courseid, null,
                    completionpercentage, null, grademax, videotype, null,
                    end - start, start, end, null, cm).init();
            });
        });
        $(document).on('click', '[data-item] a', async function() {
            const convertSecondsToHMS = (seconds) => {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor(seconds % 3600 / 60);
                const s = Math.floor(seconds % 3600 % 60);
                return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            };
            let annotationid = $(this).closest('th').data('item');
            let theAnnotation = itemsdata.find(x => x.id == annotationid);
            let tabledatajson = tabledata.rows().data().toArray();
            let title = theAnnotation.formattedtitle;
            if (theAnnotation.timestamp > 0) {
                title += " @ " + convertSecondsToHMS(theAnnotation.timestamp);
            }

            $('#annotation-modal').remove();
            let modal = await ModalFactory.create({
                body: `<div class="modal-body loader"></div>`,
                large: true,
                show: false,
                removeOnClose: true,
                isVerticallyCentered: true,
            });

            let root = modal.getRoot();
            root.attr({
                'id': 'annotation-modal',
                'data-id': theAnnotation.id,
            });

            if ($('body').hasClass('iframe')) {
                root.addClass('modal-fullscreen');
            }

            root.find('.modal-dialog').attr({
                'data-id': theAnnotation.id,
                'data-placement': 'popup',
                'id': 'message',
            }).addClass('active ' + theAnnotation.type);
            root.find('#message').html(`<div class="modal-content iv-rounded-lg">
                    <div class="modal-header d-flex align-items-center shadow-sm" id="title">
                        <h5 class="modal-title text-truncate mb-0">${title}</h5>
                        <div class="btns d-flex align-items-center">
                            <button id="close-${theAnnotation.id}" class="btn close-modal p-0 border-0"
                             aria-label="Close" data${isBS5 ? '-bs' : ''}-dismiss="modal">
                            <i class="bi bi-x-lg fa-fw fs-25px"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-body" id="content">
                    <div class="loader w-100 mt-5"></div>
                    </div>
                    </div>
                </div>`);

            root.find('#message').on('click', '#close-' + theAnnotation.id, function() {
                root.attr('data-region', 'modal-container');
                root.fadeOut(300, function() {
                    modal.hide();
                });
            });

            root.off(ModalEvents.hidden).on(ModalEvents.hidden, function() {
                $('#annotation-modal').modal('hide');
                $('#annotation-modal').remove();
            });

            // If click outside the modal, add jelly animation.
            root.off('click').on('click', function(e) {
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
                let module = relContentTypeAmd[theAnnotation.type];
                if (module) {
                    module.displayReportView(theAnnotation, tabledatajson, ReportBase, root);
                } else {
                    let matchingContentTypes = contentTypes.find(x => x.name === theAnnotation.type);
                    let amdmodule = matchingContentTypes.amdmodule;
                    require([amdmodule], function(Module) {
                        theAnnotation.completed = true;
                        new Module(player, itemsdata, cmid, courseid, null,
                            completionpercentage, null, grademax, videotype, null,
                            end - start, start, end, theAnnotation.prop, cm)
                            .displayReportView(theAnnotation, tabledatajson, ReportBase, root);
                    });
                }
                $(this).find('.close-modal').focus();
                root.find('.modal-body').removeClass('loader');
            });

            root.on('animationend', function() {
                root.removeClass('jelly-anim');
            });

            modal.show();
        });

        ReportBase.registerSingleReset(tabledata, {
            courseid,
            cmid,
            ajaxUrl: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
            ajaxAction: 'delete_progress_by_id',
        });

        $(document).on('click', 'td .completion-detail', function() {
            let id = $(this).closest('td').data('item');
            let userid = $(this).closest('tr').attr('id');
            let type = $(this).closest('td').data('type');
            let theAnnotation = itemsdata.find(x => x.id == id);
            let module = relContentTypeAmd[type];
            if (module) {
                module.getCompletionData(theAnnotation, userid);
                return;
            }
            let matchingContentTypes = contentTypes.find(x => x.name === type);
            let amdmodule = matchingContentTypes.amdmodule;
            // Get column header with the item id.
            require([amdmodule], function(Module) {
                new Module(player, itemsdata, cmid, courseid, null,
                    completionpercentage, null, grademax, videotype, null,
                    end - start, start, end, theAnnotation.prop, cm).getCompletionData(theAnnotation, userid);
            });
        });
    });
};


export {
    init
};