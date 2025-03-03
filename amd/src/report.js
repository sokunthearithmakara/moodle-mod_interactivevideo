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
 * @param {Object} access - The access object.
 */
const init = (cmid, groupid, grademax, itemids, completionpercentage, videourl, videotype, cm, courseid, start, end, access) => {
    window.JSZip = JSZip;
    let DataTable = $.fn.dataTable;
    let player;

    quickform();

    const getContentTypes = $.ajax({
        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
        method: "POST",
        dataType: "text",
        data: {
            action: 'get_all_contenttypes',
            sesskey: M.cfg.sesskey,
            contextid: M.cfg.contextid,
        }
    });

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
    let tabledata;

    $.when(getContentTypes, getReportData).done(async(ct, data) => {
        contentTypes = JSON.parse(ct[0]);
        data = data[0];
        const renderFilterBox = (element) => {
            let input = '';
            switch (element.type) {
                case 'text':
                case 'textarea':
                case 'url':
                case 'email':
                    input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                    break;
                case 'menu':
                    var options = data.map(x => x[element.name]);
                    options = [...new Set(options)];
                    // Don't include empty options.
                    options = options.filter(x => x !== '');
                    if (options.length > 1) {
                    options.sort();
                    input = `<select class="custom-select custom-select-sm w-100" multiple id="filter-${element.index}"
                         data-index="${element.index}">
                            ${options.map(x => `<option value="${x}">${x}</option>`).join('')}
                        </select>`;
                    } else {
                    input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                    }
                    break;
                case 'checkbox':
                    var optionsc = data.map(x => x[element.name]);
                    optionsc = [...new Set(optionsc)];
                    // Don't include empty options.
                    optionsc = optionsc.filter(x => x !== '');
                    if (optionsc.length > 1) {
                    optionsc.sort();
                    input = `<select class="custom-select custom-select-sm w-100" multiple id="filter-${element.index}"
                         data-index="${element.index}">
                            ${optionsc.map(x => `<option value="${x}">${x}</option>`).join('')}
                        </select>`;
                    } else {
                        input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                    }
                    break;
                case 'datetime':
                    // Date range.
                    input = `<div class="input-group input-group-sm">
                            <input type="date" class="form-control custom-field" data-index="${element.index}"
                             id="filter-${element.index}-start"/>
                            <input type="date" class="form-control custom-field" data-index="${element.index}"
                             id="filter-${element.index}-end"/>
                        </div>`;
                    break;
                default:
                    input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                    break;
            }
            return `<div class="col-sm-6 col-md-4 col-lg-3 col-xl-${element.type == 'datetime' ? '4' : '2'} pl-0 pr-2 mb-2">
                                    <div class="form-group mb-1">
                                    <label for="filter-${element.index}">${element.text}</label>
                                        ${input}
                                    </div>
                                </div>`;
        };
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
                index: $("th").index($(this)),
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

        let exportOptions = {
            columns: ['.exportable'],
            format: {
                body: function(data) {
                    // Strip HTML tags to get text only
                    const div = document.createElement("div");
                    div.innerHTML = data;
                    return (div.textContent || div.innerText || "").trim();
                },
                header: function(data) {
                    const div = document.createElement("div");
                    div.innerHTML = data;
                    // Remove .controls from the header.
                    if (div.querySelector('.controls')) {
                        div.querySelector('.controls').remove();
                    }
                    return (div.textContent || div.innerText || "").trim();
                }
            }
        };

        let columns = [
            {
                data: "id",
                visible: false
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
                    ${access.canedit == 1 ? `<input class="mr-3" type="checkbox"
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
                        let fieldtype = row.customfields.find(x => x.shortname === $this.attr('id')
                            .replace('profile_field_', ''));
                        if (!fieldtype) {
                            return data;
                        }
                        if (fieldtype.type === 'datetime' && (type == 'sort' || type == 'filter')) {
                            return fieldtype.value;
                        }
                        return data;
                    },
                });
            });
        }

        window.console.log(itemids);

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

        let datatableOptions = {
            "data": data,
            "deferRender": true,
            "rowId": "id",
            "pageLength": 25,
            // Sort by timecreated in descending order by default and then by fullname in ascending order.
            "order": [[columns.findIndex(c => c.data == 'timecreated'), 'desc'], [1, 'asc']],
            "columns": columns,
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
            "language": {
                "lengthMenu": "_MENU_",
                "zeroRecords": M.util.get_string('nofound', "mod_interactivevideo"),
                "search": `<span class="d-none d-md-inline">${M.util.get_string('search', "mod_interactivevideo")}</span>`,
                "info": M.util.get_string('datatableinfo', "mod_interactivevideo"),
                "infoEmpty": M.util.get_string('datatableinfoempty', "mod_interactivevideo"),
                "infoFiltered": M.util.get_string('datatableinfofiltered', "mod_interactivevideo"),
                "paginate": {
                    "first": '<i class="bi bi-chevron-double-left fs-unset"></i>',
                    "last": '<i class="bi bi-chevron-double-right fs-unset"></i>',
                    "next": '<i class="bi bi-chevron-right fs-unset"></i>',
                    "previous": '<i class="bi bi-chevron-left fs-unset"></i>'
                },
                "select": {
                    rows: {
                        _: M.util.get_string('rowsselected', 'mod_interactivevideo'),
                    }
                }
            },
            select: {
                style: 'multi',
                selector: 'td:first-child input[type="checkbox"]',
            },
            stateSaveParams: function(settings, data) {
                // We only want to save the state of the colvis and length menu
                data.search.search = "";
                data.start = 0;
                data.columns.forEach(function(column) {
                    column.search.search = "";
                });
                // Reset the inv columns.
                data.columns.forEach(function(column) {
                    if (column.visible === false) {
                        column.visible = true;
                    }
                });
                return data;
            },
            stateSave: true,
            "dom": `<'d-flex w-100 justify-content-between`
                + `'<'d-flex align-items-center'Bl>'<''f>>`
                + `<'#filterregion.w-100 row mx-0 my-2 p-3 bg-light rounded border'>t<'row mt-2'<'col-sm-6'i><'col-sm-6'p>>`,
            "buttons": [
                {
                    extend: "copyHtml5",
                    text: '<i class="bi bi-copy fa-fw fs-unset"></i>',
                    className: "btn btn-sm border-0",
                    messageTop: null,
                    title: null,
                    exportOptions: exportOptions
                },
                {
                    extend: "csvHtml5",
                    text: '<i class="bi bi-filetype-csv fa-fw fs-unset"></i>',
                    className: "btn btn-sm border-0",
                    exportOptions: exportOptions
                },
                {
                    extend: "excelHtml5",
                    text: '<i class="bi bi-file-earmark-excel fa-fw fs-unset"></i>',
                    className: "btn btn-sm border-0",
                    exportOptions: exportOptions
                },
                {
                    extend: "colvis",
                    text: '<i class="bi bi-layout-three-columns fa-fw fs-unset"></i>',
                    titleAttr: "",
                    className: "btn btn-sm border-0",
                    columns: '.colvis'
                },
            ],
            // New footerCallback to update footer with summary info
            footerCallback: function() {
                var api = this.api();
                var rowCount = api.rows({filter: 'applied'}).count();
                // Helper: find index of a column by its data property in our original columns array
                /**
                 * Find the index of the column in the original columns array.
                 * @param {string} prop - The data property of the column.
                 * @returns {number} - The index of the column in the original columns array.
                 */
                function findColIndex(prop) {
                    return columns.findIndex(function(col) {
                        return col.data === prop;
                    });
                }
                var timecreatedIdx = findColIndex('timecreated');
                var timecompletedIdx = findColIndex('timecompleted');
                var completionpercentageIdx = findColIndex('completionpercentage');
                var xpIdx = findColIndex('xp');

                // Calculate percentage for timecreated > 0
                var timecreatedData = api.column(timecreatedIdx, {filter: 'applied'}).data();
                var countTimecreated = timecreatedData.reduce(function(acc, val) {
                    return acc + ((val && val > 0) ? 1 : 0);
                }, 0);
                var timecreatedPerc = ((countTimecreated / rowCount) * 100).toFixed(1) + '%';
                if (rowCount === 0) {
                    timecreatedPerc = '0%';
                }

                // Calculate percentage for timecompleted > 0
                var timecompletedData = api.column(timecompletedIdx, {filter: 'applied'}).data();
                var countTimecompleted = timecompletedData.reduce(function(acc, val) {
                    return acc + ((val && val > 0) ? 1 : 0);
                }, 0);
                var timecompletedPerc = ((countTimecompleted / rowCount) * 100).toFixed(1) + '%';
                if (rowCount === 0) {
                    timecompletedPerc = '0%';
                }

                // Average xp
                var xpData = api.column(xpIdx, {filter: 'applied'}).data().toArray();
                xpData = xpData.map(x => parseFloat(x) || 0);
                var minXP = Math.min(...xpData);
                var maxXP = Math.max(...xpData);
                var sumXp = xpData.reduce(function(acc, val) {
                    return acc + val;
                }, 0);
                var avgXp = (sumXp / rowCount).toFixed(1);
                if (rowCount === 0) {
                    avgXp = '0';
                    minXP = '0';
                    maxXP = '0';
                }

                // Average completion percentage
                var cpData = api.column(completionpercentageIdx, {filter: 'applied'}).data().toArray();
                cpData = cpData.map(x => parseFloat(x) || 0);
                var minCp = Math.min(...cpData);
                var maxCp = Math.max(...cpData);
                var sumCp = cpData.reduce(function(acc, val) {
                    return acc + val;
                }, 0);
                var avgCp = (sumCp / rowCount).toFixed(1) + '%';
                if (rowCount === 0) {
                    avgCp = '0%';
                    minCp = '0';
                    maxCp = '0';
                }

                // Update footer for these specific columns
                if (api.column(timecreatedIdx).footer()) {
                    api.column(timecreatedIdx).footer().innerHTML = '<small>' + M.util.get_string('started', 'mod_interactivevideo')
                        + '</small>' + '<br>' + timecreatedPerc + ' (' + countTimecreated + '/' + rowCount + ')';
                }
                if (api.column(timecompletedIdx).footer()) {
                    api.column(timecompletedIdx).footer().innerHTML = '<small>'
                        + M.util.get_string('completed', 'mod_interactivevideo')
                        + '</small>' + '<br>' + timecompletedPerc + ' (' + countTimecompleted + '/' + rowCount + ')';
                }
                if (api.column(xpIdx).footer()) {
                    api.column(xpIdx).footer().innerHTML = '<small>' + M.util.get_string('avg', 'mod_interactivevideo')
                        + ' (' + M.util.get_string('min', 'mod_interactivevideo') + '/' +
                        M.util.get_string('max', 'mod_interactivevideo')
                        + ')</small>' + '<br>' + avgXp + ' (' + minXP + '/' + maxXP + ')';
                }
                if (api.column(completionpercentageIdx).footer()) {
                    api.column(completionpercentageIdx).footer().innerHTML
                        = '<small>' + M.util.get_string('avg', 'mod_interactivevideo')
                        + ' (' + M.util.get_string('min', 'mod_interactivevideo') + '/' +
                        M.util.get_string('max', 'mod_interactivevideo')
                        + ')</small>' + '<br>' + avgCp + ' (' + minCp + '/' + maxCp + ')';
                }

                // For dynamic interaction item columns: check header attribute 'data-item'.
                columns.forEach(function(column) {
                    if (column.itemid) {
                        var itemid = column.itemid;
                        var itemIdx = columns.findIndex(col => col.itemid === itemid);
                        var itemData = api.column(itemIdx, {filter: 'applied'}).data();
                        var countItem = itemData.reduce(function(acc, val) {
                            let completiondetails;
                            try {
                                completiondetails = JSON.parse(val.completiondetails).map(x => JSON.parse(x));
                            } catch (e) {
                                return acc;
                            }
                            let details = completiondetails.find(x => Number(x.id) == Number(itemid));
                            if (details) {
                                if (details.deleted) {
                                    return acc;
                                }
                                return acc + 1;
                            }
                            return acc;
                        }, 0);
                        var itemPerc = ((countItem / rowCount) * 100).toFixed(1) + '%';
                        if (rowCount === 0) {
                            itemPerc = '0%';
                        }
                        if (api.column(itemIdx).footer()) {
                            api.column(itemIdx).footer().innerHTML = itemPerc;
                        }
                    }
                });
            },
            // Modified initComplete to add a tfoot if missing
            "initComplete": function() {
                if (hasCompletion) {
                    $("#completiontable th .controls").removeClass("d-none");
                }
                if (itemids.length == 0) {
                    $("#completiontable th .controls").addClass("d-none");
                }
                $("table#completiontable")
                    .wrap("<div style='overflow:auto;position:relative' class='completiontablewrapper my-2'></div>");
                $("#reporttable .dataTables_length ").addClass("d-inline ml-1");
                $("#reporttable .dataTables_filter").addClass("d-inline float-right");
                $("#reporttable .table-responsive").addClass("p-1");
                $("#reporttable .spinner-grow").remove();
                $("table#completiontable").removeClass("d-none");
                $("#background-loading").fadeOut(300);

                $(`<a class="btn btn-sm btn-secondary font-weight-bold ml-1 d-inline-block"
                    href="javascript:void(0)" id="filters"
                    title="Filter"><i class="bi bi-funnel left fa-fw fs-unset"></i></a>`).insertAfter(".dataTables_filter label");
                $(document).off('click', '#filters').on('click', '#filters', function() {
                    $('#filterregion').slideToggle('fast', 'swing');
                    $(this).find('i').toggleClass('bi-funnel bi-funnel-fill');
                });
                $('#filterregion').css('display', 'none');

                profileFields.forEach((element) => {
                    $(renderFilterBox(element)).appendTo("#filterregion");
                });

                // Init select2
                $('#filterregion .custom-select[multiple]').select2({
                    dropdownParent: $('body'), // Little hack to prevent page overflow when select2 is open
                    width: '100%',
                    placeholder: M.util.get_string('select', 'mod_interactivevideo'),
                    allowClear: true,
                });
                $('.custom-select').on('select2:open', function(e) { // Little hack to prevent page overflow when select2 is open
                    const evt = "scroll.select2";
                    $(e.target).parents().off(evt);
                    $(window).off(evt);
                });

                // Date range for timecreated.
                $("#filterregion").append(`<div class="col-sm-6 col-md-4 col-lg-3 col-xl-4 pl-0 pr-2 mb-2">
                    <div class="form-group mb-1" id="timecreatedrange">
                    <label for="timecreatedrange">${M.util.get_string('timecreatedrange', 'mod_interactivevideo')}</label>
                    <div class="input-group input-group-sm">
                        <input type="date" class="form-control" id="timecreatedstart"/>
                        <input type="date" class="form-control" id="timecreatedend"/>
                    </div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-4 col-lg-3 col-xl-4 pl-0 pr-2 mb-2">
                    <div class="form-group mb-1" id="timecompletedrange">
                    <label for="timecompletedrange">${M.util.get_string('timecompletedrange', 'mod_interactivevideo')}</label>
                    <div class="input-group input-group-sm">
                        <input type="date" class="form-control" id="timecompletedstart"/>
                        <input type="date" class="form-control" id="timecompletedend"/>
                    </div>
                    </div>
                </div>
                `);

                $("#filterregion").append(`<div class="col-12 p-0 mx-0">
                    <span class="text-muted small">${M.util.get_string('separatesearchtermsbyslash', 'mod_interactivevideo')}</span>
                    </div>`);
            }
            // ...existing datatableOptions properties if any
        };

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
                        let res = `<span class="completion-detail ${details.hasDetails ? 'cursor-pointer' : ''}"
                                 data-id="${itemid}" data-userid="${row.id}" data-type="${ctype}">${details.reportView}</span>`;
                        if (access.canedit == 1) {
                            res += `<i class="bi bi-trash3 fs-unset text-danger cursor-pointer position-absolute delete-cell"
                                  title="${M.util.get_string('delete', 'mod_interactivevideo')}"></i>`;
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

        tabledata.on("search", function() {
            // De-select all rows
            tabledata.rows().deselect();
        });

        tabledata.on("select deselect", function(e) {
            e.stopImmediatePropagation();
            // Change the checkbox state
            var selectedRows = tabledata.rows({selected: true});
            // For each selected row, find the checkbox with class "checked" in the first column and check it
            selectedRows.every(function() {
                var row = this.node();
                $(row).find("td:first-child input").prop("checked", true);
            });

            var deselectedRows = tabledata.rows({selected: false});
            // For each deselected row, find the checkbox with class "checked" in the first column and uncheck it
            deselectedRows.every(function() {
                var row = this.node();
                $(row).find("td:first-child input").prop("checked", false);
            });

            // Allow 20 rows to be selected at once.
            $('#bulkactions').remove();

            if (selectedRows.count() > 0 && selectedRows.count() <= 20) {
                // Insert the bulk actions
                $('#completiontable_length').after(`<div class="d-flex align-items-center" id="bulkactions">
                    <button class="btn btn-sm btn-danger ml-1" id="bulkdelete">
                        <i class="bi bi-trash3 mr-1 fs-unset"></i>${M.util.get_string('delete', 'mod_interactivevideo')}
                         (${selectedRows.count()})
                    </button>
                    </div>`);
            }
        });

        $('#filterregion :input:not([type=date])').on('keyup change', function() {
            let index = $(this).data('index');
            let value = $(this).val();
            if (typeof value !== 'string') {
                value = value.join('|');
            }
            // Split the input by '|' and remove any empty terms.
            let regex = value.split('|').map(term => term.trim()).filter(term => term.length > 0).join('|');
            // Use regex mode (true) and disable smart searching (false).
            tabledata.column(index).search(regex, true, false).draw();
        });

        $('#filterregion :input[type=date].custom-field').on('change', function() {
            let index = $(this).data('index');
            $.fn.dataTable.ext.search.push(function(settings, data) {
                if (settings.nTable.id !== 'completiontable') {
                    return true;
                }
                let start = $(`#filter-${index}-start`).val();
                if (start !== '') {
                    // Append the start of the day to the date.
                    start = new Date(start);
                    start.setHours(0, 0, 0);
                }
                let end = $(`#filter-${index}-end`).val();
                if (end !== '') {
                    // Append the end of the day to the date.
                    end = new Date(end);
                    end.setHours(23, 59, 59);
                }
                let value = data[index];
                if (isNaN(value) || value == '') {
                    value = 0;
                }
                value = value * 1000;
                if ((start !== '' || end !== '') && value == 0) {
                    return false;
                }
                if ((start === '' && end === '')
                    || (start === '' && value <= new Date(end).getTime())
                    || (end === '' && value >= new Date(start).getTime())
                    || (value >= new Date(start).getTime() && value <= new Date(end).getTime())) {
                    return true;
                }
                return false;
            });
            tabledata.draw();
        });

        $('#reporttable th#timecreated input').on('click', function(e) {
            e.stopPropagation();
            let index = columns.findIndex(x => x.data === 'timecreated');
            let started = $('th#timecreated input[data-start=true]').is(':checked');
            let notstarted = $('th#timecreated input[data-start=false]').is(':checked');
            if (started && notstarted) {
                tabledata.column(index).search('', true, false).draw();
            } else if (started) {
                // Filter by timecreated that is not 0.
                tabledata.column(index).search('^(?!0$)', true, false).draw();
            } else if (notstarted) {
                // Filter by timecreated that is 0.
                tabledata.column(index).search('^0$', true, false).draw();
            } else {
                tabledata.column(index).search('-', true, false).draw();
            }
        });

        $('#reporttable th#timecompleted input').on('click', function(e) {
            e.stopPropagation();
            let index = columns.findIndex(x => x.data === 'timecompleted');
            let inprogress = $('th#timecompleted input[data-completed=false]').is(':checked');
            let completed = $('th#timecompleted input[data-completed=true]').is(':checked');
            if (inprogress && completed) {
                tabledata.column(index).search('', true, false).draw();
            } else if (inprogress) {
                // Filter by timecompleted that is 0.
                tabledata.column(index).search('^0$', true, false).draw();
            } else if (completed) {
                // Filter by timecompleted that is not 0.
                tabledata.column(index).search('^(?!0$)', true, false).draw();
            } else {
                tabledata.column(index).search('-', true, false).draw();
            }
        });

        $('#reporttable th[data-type] input').on('click', function(e) {
            e.stopPropagation();
            let index = columns.findIndex(x => x.itemid == $(this).data('item'));
            if ($(this).is(':checked')) {
                // Filter this column by not equal to -.
                tabledata.column(index).search('^(?!-$)', true, false).draw();
            } else {
                tabledata.column(index).search('', true, false).draw();
            }
        });

        $('#reporttable th#completionpercentage input').on('click', function(e) {
            e.stopPropagation();
            let $this = $(this);
            $.fn.dataTable.ext.search.push(function(settings, data) {
                if (settings.nTable.id !== 'completiontable') {
                    return true;
                }
                let index = columns.findIndex(x => x.data === 'completionpercentage');
                let percent = $this.data('percentage');
                let showless = $('th#completionpercentage input.less').is(':checked');
                let showmore = $('th#completionpercentage input.more').is(':checked');
                let value = data[index];
                value = parseInt(value.replace('%', ''));
                if (showless && showmore) {
                    return true;
                } else if (showless) {
                    return value < percent;
                } else if (showmore) {
                    return value >= percent;
                } else {
                    return false;
                }
            });
            tabledata.draw();
        });

        // Filter by timecreated range.
        $('#filterregion #timecreatedrange input').on('change', function() {
            $.fn.dataTable.ext.search.push(function(settings, data) {
                if (settings.nTable.id !== 'completiontable') {
                    return true;
                }
                let start = $('#timecreatedstart').val();
                if (start !== '') {
                    // Append the start of the day to the date.
                    start = new Date(start);
                    start.setHours(0, 0, 0);
                }
                let end = $('#timecreatedend').val();
                if (end !== '') {
                    // Append the end of the day to the date.
                    end = new Date(end);
                    end.setHours(23, 59, 59);
                }
                let index = columns.findIndex(x => x.data === 'timecreated');
                let value = data[index];
                if ((start !== '' || end !== '') && value == 0) {
                    return false;
                }
                if ((start === '' && end === '')
                    || (start === '' && value <= new Date(end).getTime())
                    || (end === '' && value >= new Date(start).getTime())
                    || (value >= new Date(start).getTime() && value <= new Date(end).getTime())) {
                    return true;
                }
                return false;
            }
            );
            tabledata.draw();
        });

        // Filter by timecompleted range.
        $('#filterregion #timecompletedrange input').on('change', function() {
            $.fn.dataTable.ext.search.push(function(settings, data) {
                if (settings.nTable.id !== 'completiontable') {
                    return true;
                }
                let start = $('#timecompletedstart').val();
                if (start !== '') {
                    // Append the start of the day to the date.
                    start = new Date(start);
                    start.setHours(0, 0, 0);
                }
                let end = $('#timecompletedend').val();
                if (end !== '') {
                    // Append the end of the day to the date.
                    end = new Date(end);
                    end.setHours(23, 59, 59);
                }
                let index = columns.findIndex(x => x.data === 'timecompleted');
                let value = data[index];
                if ((start !== '' || end !== '') && value == 0) {
                    return false;
                }
                if ((start === '' && end === '')
                    || (start === '' && value <= new Date(end).getTime())
                    || (end === '' && value >= new Date(start).getTime())
                    || (value >= new Date(start).getTime() && value <= new Date(end).getTime())) {
                    return true;
                }
                return false;
            }
            );
            tabledata.draw();
        });

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
            let userfullname = $this.closest('tr').find('td').eq(0).text();
            let recordid = $this.closest('tr').find('td').eq(0).find('button').data('record');
            let cellIndex = $this.index();
            let title = $this.closest('table').find('th').eq(cellIndex).text();

            const deleteCompletionData = async() => {
                let type = $this.data('type');
                let matchingContentTypes = contentTypes.find(x => x.name === type);
                let amdmodule = matchingContentTypes.amdmodule;
                let theAnnotation = itemsdata.find(x => x.id == itemid);
                require([amdmodule], function(Module) {
                    const module = new Module(player, itemsdata, cmid, courseid, null,
                        completionpercentage, null, grademax, videotype, null,
                        end - start, start, end, theAnnotation.prop, cm);
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
                });
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
            let matchingContentTypes = contentTypes.find(x => x.name === type);
            let amdmodule = matchingContentTypes.amdmodule;
            require([amdmodule], function(Module) {
                new Module(player, itemsdata, cmid, courseid, null,
                    completionpercentage, null, grademax, videotype, null,
                    end - start, start, end, null, cm).init();
            });
        });
    });

    $(document).on('click', '[data-item] a', function() {
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
        const modal = `<div class="modal fade" id="annotation-modal" role="dialog"
            aria-labelledby="annotation-modal"
         aria-hidden="true" data-backdrop="static" data-keyboard="false">
         <div id="message" data-id="${theAnnotation.id}" data-placement="popup"
          class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable ${theAnnotation.type}" role="document">
            <div class="modal-content rounded-lg">
                <div class="modal-header d-flex align-items-center shadow-sm" id="title">
                    <h5 class="modal-title text-truncate mb-0">${title}</h5>
                    <div class="btns d-flex align-items-center">
                        <button class="btn close-modal p-0 border-0" aria-label="Close" data-dismiss="modal">
                        <i class="bi bi-x-lg fa-fw fs-25px"></i>
                        </button>
                    </div>
                </div>
                <div class="modal-body" id="content">
                <div class="loader w-100 mt-5"></div>
                </div>
                </div>
            </div>
            </div>`;
        $('body').append(modal);
        $('#annotation-modal').modal('show');
        $('#annotation-modal').on('hide.bs.modal', function() {
            $('#annotation-modal').remove();
        });

        $('#annotation-modal').on('shown.bs.modal', function() {
            $('#annotation-modal .modal-body').fadeIn(300);
            let matchingContentTypes = contentTypes.find(x => x.name === theAnnotation.type);
            let amdmodule = matchingContentTypes.amdmodule;
            require([amdmodule], function(Module) {
                theAnnotation.completed = true;
                new Module(player, itemsdata, cmid, courseid, null,
                    completionpercentage, null, grademax, videotype, null,
                    end - start, start, end, theAnnotation.prop, cm).displayReportView(theAnnotation, tabledatajson, DataTable);
            });
            $(this).find('.close-modal').focus();
        });
    });

    // Delete single completion record.
    $(document).on('click', 'td .reset', function(e) {
        e.preventDefault();
        const recordid = $(this).data('record');
        let $this = $(this);
        const deleteSingle = async() => {
            return $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                method: 'POST',
                dataType: "text",
                data: {
                    action: 'delete_progress_by_id',
                    recordid,
                    courseid: courseid,
                    cmid: cmid,
                    contextid: M.cfg.contextid,
                    sesskey: M.cfg.sesskey,
                },
                success: function(response) {
                    if (response == 'deleted') {
                        let targetdata = tabledata.row($this.closest('tr')).data();
                        targetdata.completionpercentage = 0;
                        targetdata.timecompleted = 0;
                        targetdata.xp = 0;
                        targetdata.timecreated = 0;
                        targetdata.completeditems = null;
                        targetdata.completiondetails = null;
                        targetdata.completionid = null;
                        tabledata.row($this.closest('tr')).data(targetdata).draw();
                        addToast(M.util.get_string('completionresetsuccess', 'mod_interactivevideo'), {
                            type: 'success'
                        });
                    }
                },
                error: function() {
                    addToast(M.util.get_string('completionreseterror', 'mod_interactivevideo'), {
                        type: 'error'
                    });
                }
            });
        };
        try {
            Notification.deleteCancelPromise(
                M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                M.util.get_string('areyousureyouwanttoresetthecompletiondata', 'mod_interactivevideo'),
                M.util.get_string('delete', 'mod_interactivevideo')
            ).then(() => {
                return deleteSingle();
            }).catch(() => {
                return;
            });
        } catch { // Fallback for older versions of Moodle.
            Notification.saveCancel(
                M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                M.util.get_string('areyousureyouwanttoresetthecompletiondata', 'mod_interactivevideo'),
                M.util.get_string('delete', 'mod_interactivevideo'),
                function() {
                    return deleteSingle();
                }
            );
        }
    });

    // Delete multiple completion records.
    $(document).on('click', '#bulkdelete', function() {
        let selectedRows = tabledata.rows({selected: true});
        let selectedData = selectedRows.data().toArray();
        let selectedIds = selectedData.map(x => x.completionid);
        let selectedUsers = selectedData.map(x => x.id);
        const bulkDeleteCompletionData = async() => {
            return $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                method: 'POST',
                dataType: "text",
                data: {
                    action: 'delete_progress_by_ids',
                    completionids: selectedIds.join(','),
                    courseid: courseid,
                    cmid: cmid,
                    contextid: M.cfg.contextid,
                    sesskey: M.cfg.sesskey,
                },
                success: function(response) {
                    if (response == 'deleted') {
                        selectedRows.every(function() {
                            let targetdata = this.data();
                            targetdata.completionpercentage = 0;
                            targetdata.timecompleted = 0;
                            targetdata.xp = 0;
                            targetdata.timecreated = 0;
                            targetdata.completeditems = null;
                            targetdata.completiondetails = null;
                            targetdata.completionid = null;
                            tabledata.row(this.node()).data(targetdata);
                        });
                        tabledata.draw();
                        addToast(M.util.get_string('completionresetsuccess', 'mod_interactivevideo'), {
                            type: 'success'
                        });
                    }
                },
                error: function() {
                    addToast(M.util.get_string('completionreseterror', 'mod_interactivevideo'), {
                        type: 'error'
                    });
                }
            });
        };
        try {
            Notification.deleteCancelPromise(
                M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                M.util.get_string('deleterecordforselectedusers', 'mod_interactivevideo', selectedUsers.length),
                M.util.get_string('delete', 'mod_interactivevideo')
            ).then(async() => {
                return bulkDeleteCompletionData();
            }).catch(() => {
                return;
            });
        } catch { // Fallback for older versions of Moodle.
            Notification.saveCancel(
                M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                M.util.get_string('deleterecordforselectedusers', 'mod_interactivevideo', selectedUsers.length),
                M.util.get_string('delete', 'mod_interactivevideo'),
                function() {
                    return bulkDeleteCompletionData();
                }
            );
        }
    });

    $(document).on('click', 'td .completion-detail', function() {
        let id = $(this).data('id');
        let userid = $(this).data('userid');
        let type = $(this).data('type');
        let matchingContentTypes = contentTypes.find(x => x.name === type);
        let amdmodule = matchingContentTypes.amdmodule;
        // Get column header with the item id.
        let theAnnotation = itemsdata.find(x => x.id == id);
        require([amdmodule], function(Module) {
            new Module(player, itemsdata, cmid, courseid, null,
                completionpercentage, null, grademax, videotype, null,
                end - start, start, end, theAnnotation.prop, cm).getCompletionData(theAnnotation, userid);
        });
    });
};


/**
 * Renders annotation logs in a DataTable with specified options.
 *
 * @param {Object} data - The data to be displayed in the table.
 * @param {Array} data.rows - The rows of data to be displayed.
 * @param {string} node - The DOM node selector where the table will be rendered.
 * @param {string} title - The title used for export options.
 */
const renderAnnotationLogs = (data, node, title) => {
    let tableOptions = {
        "data": data.rows,
        "deferRender": true,
        "pageLength": 25,
        "order": [[0, "asc"]],
        "columnDefs": [
            {
                "targets": 'not-sortable',
                "sortable": false,
            },
        ],
        "pagingType": "full",
        "language": {
            "lengthMenu": "_MENU_",
            "zeroRecords": M.util.get_string('nofound', "mod_interactivevideo"),
            "search": `<span class="d-none d-md-inline">${M.util.get_string('search', "mod_interactivevideo")}</span>`,
            "info": M.util.get_string('datatableinfo', "mod_interactivevideo"),
            "infoEmpty": M.util.get_string('datatableinfoempty', "mod_interactivevideo"),
            "infoFiltered": M.util.get_string('datatableinfofiltered', "mod_interactivevideo"),
            "paginate": {
                "first": '<i class="bi bi-chevron-double-left fs-unset"></i>',
                "last": '<i class="bi bi-chevron-double-right fs-unset"></i>',
                "next": '<i class="bi bi-chevron-right fs-unset"></i>',
                "previous": '<i class="bi bi-chevron-left fs-unset"></i>'
            },
            "select": {
                rows: {
                    _: M.util.get_string('rowsselected', 'mod_interactivevideo'),
                }
            }
        },
        stateSaveParams: function(settings, data) {
            // We only want to save the state of the colvis and length menu
            data.search.search = "";
            data.start = 0;
            data.columns.forEach(function(column) {
                column.search.search = "";
            });
            return data;
        },
        stateSave: true,
        "dom": `Blft<'row'<'col-sm-6'i><'col-sm-6'p>>`,
        "buttons": [
            {
                extend: "copyHtml5",
                text: '<i class="bi bi-copy fa-fw fs-unset"></i>',
                className: "btn btn-sm border-0",
                messageTop: null,
                title: null,
                exportOptions: {
                    columns: ['.exportable'],
                    format: {
                        body: function(data) {
                            // Remove any HTML tags from the data.
                            const text = document.createElement("div");
                            text.innerHTML = data;
                            return text.textContent.replace(/\n/g, ' ').replace(/\t/g, ' ').replace(/\r/g, ' ');
                        }
                    }
                }
            },
            {
                extend: "csvHtml5",
                text: '<i class="bi bi-filetype-csv fa-fw fs-unset"></i>',
                title: title,
                className: "btn btn-sm border-0",
                exportOptions: {
                    columns: ['.exportable']
                }
            },
            {
                extend: "excelHtml5",
                text: '<i class="bi bi-file-earmark-excel fa-fw fs-unset"></i>',
                className: "btn btn-sm border-0",
                title: title,
                exportOptions: {
                    columns: ['.exportable']
                }
            }
        ],
        "initComplete": function() {
            $(`${node} table`)
                .wrap("<div style='overflow:auto;position:relative;width:100%' class='completiontablewrapper'></div>");
            $(`${node} .dataTables_length`).addClass("d-inline ml-1");
            $(`${node} .dataTables_filter`).addClass("d-inline float-right");
            $(`${node} .table-responsive`).addClass("p-1");
        }
    };

    $(`${node} table`).DataTable(tableOptions);
};

export {
    init,
    renderAnnotationLogs
};