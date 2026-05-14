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
 * Base reporting module for interactivevideo and flexbook.
 *
 * @module     mod_interactivevideo/report_base
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import $ from 'jquery';
import Ajax from 'core/ajax';
import {add as addToast} from 'core/toast';

/**
 * Base Report Class
 */
export default class ReportBase {

    /**
     * Get the standard export options for DataTables buttons.
     *
     * @returns {Object}
     */
    static getExportOptions() {
        return {
            columns: ['.exportable'],
            format: {
                body: function(data) {
                    // Strip HTML tags to get text only.
                    const div = document.createElement("div");
                    div.innerHTML = data;
                    return (div.textContent || div.innerText || "").trim();
                },
                header: function(data) {
                    const div = document.createElement("div");
                    div.innerHTML = data;
                    // Remove .controls from the header if they exist.
                    if (div.querySelector('.controls')) {
                        div.querySelector('.controls').remove();
                    }
                    return (div.textContent || div.innerText || "").trim();
                }
            }
        };
    }

    /**
     * Render a filter input box based on the element type.
     *
     * @param {Object} element The column element metadata.
     * @param {Array} data The raw table data for populating selects.
     * @param {Boolean} isBS5 Whether the theme is Bootstrap 5.
     * @returns {string} HTML string for the filter box.
     */
    static renderFilterBox(element, data, isBS5) {
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
                options = options.filter(x => x !== '');
                if (options.length > 1) {
                    options.sort();
                    input = `<select class="${isBS5 ? 'form' : 'custom'}-select ${isBS5 ? 'form' : 'custom'}-select-sm w-100"
                         multiple id="filter-${element.index}"
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
                optionsc = optionsc.filter(x => x !== '');
                if (optionsc.length > 1) {
                    optionsc.sort();
                    input = `<select class="${isBS5 ? 'form' : 'custom'}-select ${isBS5 ? 'form' : 'custom'}-select-sm w-100"
                         multiple id="filter-${element.index}"
                         data-index="${element.index}">
                            ${optionsc.map(x => {
                                let label = x;
                                if (x == 1) {
                                    label = M.util.get_string('yes', 'mod_interactivevideo');
                                }
                                if (x == 0) {
                                    label = M.util.get_string('no', 'mod_interactivevideo');
                                }
                                return `<option value="${x}">${label}</option>`;
                            }).join('')}
                        </select>`;
                } else {
                    input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                }
                break;
            case 'datetime':
                input = `<div class="input-group input-group-sm">
                            <input type="date" class="form-control custom-field custom-field-start" data-index="${element.index}"
                             id="filter-${element.index}-start"/>
                            <input type="date" class="form-control custom-field custom-field-end" data-index="${element.index}"
                             id="filter-${element.index}-end"/>
                        </div>`;
                break;
            default:
                input = `<input type="text" class="form-control form-control-sm" id="filter-${element.index}"
                         data-index="${element.index}"/>`;
                break;
        }

        const colClass = element.type === 'datetime' ? 'col-xl-4' : 'col-xl-2';
        return `<div class="col-sm-6 col-md-4 col-lg-3 ${colClass} iv-pl-0 iv-pr-2 mb-2">
                    <div class="iv-form-group mb-1">
                        <label for="filter-${element.index}">${element.text}</label>
                        ${input}
                    </div>
                </div>`;
    }

    /**
     * Apply a debounced search to a table column.
     *
     * @param {Object} tabledata The DataTable instance.
     * @param {Object} input The jQuery input element.
     * @param {Event} e The event object.
     * @param {Number} timer The reference to the current timer.
     * @returns {Number} The new timer reference.
     */
    static applyFilter(tabledata, input, e, timer) {
        let index = input.data('index');
        let value = input.val();
        let isSelect = input.is('select');
        let delay = (e.type === 'keyup') ? 1000 : 0;

        if (timer) {
            clearTimeout(timer);
        }

        return setTimeout(() => {
            if (value === null || value === '') {
                tabledata.column(index).search('').draw();
                return;
            }

            if (typeof value !== 'string') {
                value = value.join('|');
            }

            let terms = value.split('|').map(term => term.trim()).filter(term => term.length > 0);
            let regex = '';

            if (isSelect) {
                regex = terms.map(term => `^${$.fn.dataTable.util.escapeRegex(term)}$`).join('|');
            } else {
                regex = terms.join('|');
            }

            tabledata.column(index).search(regex, true, false).draw();
        }, delay);
    }

    /**
     * Register a single filter function for all custom date fields and percentage filters.
     *
     * @param {Object} tabledata The DataTable instance.
     * @param {Array} columns The column definitions.
     */
    static registerSearchFilters(tabledata, columns) {
        // eslint-disable-next-line complexity
        $.fn.dataTable.ext.search.push(function(settings, data) {
            if (settings.nTable.id !== 'completiontable') {
                return true;
            }

            try {
                // Custom Profile Fields (Date range).
                let customFieldsValid = true;
                $('#filterregion .custom-field-start').each(function() {
                    let index = $(this).data('index');
                    if (index === undefined || index === null || !columns[index]) {
                        return;
                    }

                    let start = $(this).val();
                    let end = $(`#filter-${index}-end`).val();

                    if (start === '' && end === '') {
                        return;
                    }

                    let value = data[index]; // Use display/filter value from data array.
                    if (isNaN(value) || value === '' || value === null) {
                        value = 0;
                    }
                    value = parseFloat(value) * 1000; // Convert to milliseconds.

                    if (value === 0) {
                        customFieldsValid = false;
                        return false;
                    }

                    if (start !== '') {
                        let startDate = new Date(start);
                        startDate.setHours(0, 0, 0);
                        if (value < startDate.getTime()) {
                            customFieldsValid = false;
                            return false;
                        }
                    }
                    if (end !== '') {
                        let endDate = new Date(end);
                        endDate.setHours(23, 59, 59);
                        if (value > endDate.getTime()) {
                            customFieldsValid = false;
                            return false;
                        }
                    }
                });
                if (!customFieldsValid) {
                    return false;
                }

                // Time Created Range.
                let tcStart = $('#timecreatedstart').val();
                let tcEnd = $('#timecreatedend').val();
                if (tcStart !== '' || tcEnd !== '') {
                    let tcIndex = columns.findIndex(x => x.data === 'timecreated');
                    let tcValue = (tcIndex !== -1) ? data[tcIndex] : 0;
                    if (!tcValue || tcValue == 0) {
                        return false;
                    }
                    tcValue = parseFloat(tcValue) * 1000;
                    if (tcStart !== '') {
                        let d = new Date(tcStart);
                        d.setHours(0, 0, 0);
                        if (tcValue < d.getTime()) {
                            return false;
                        }
                    }
                    if (tcEnd !== '') {
                        let d = new Date(tcEnd);
                        d.setHours(23, 59, 59);
                        if (tcValue > d.getTime()) {
                            return false;
                        }
                    }
                }

                // Time Completed Range.
                let tcompStart = $('#timecompletedstart').val();
                let tcompEnd = $('#timecompletedend').val();
                if (tcompStart !== '' || tcompEnd !== '') {
                    let tcompIndex = columns.findIndex(x => x.data === 'timecompleted');
                    let tcompValue = (tcompIndex !== -1) ? data[tcompIndex] : 0;
                    if (!tcompValue || tcompValue == 0) {
                        return false;
                    }
                    tcompValue = parseFloat(tcompValue) * 1000;
                    if (tcompStart !== '') {
                        let d = new Date(tcompStart);
                        d.setHours(0, 0, 0);
                        if (tcompValue < d.getTime()) {
                            return false;
                        }
                    }
                    if (tcompEnd !== '') {
                        let d = new Date(tcompEnd);
                        d.setHours(23, 59, 59);
                        if (tcompValue > d.getTime()) {
                            return false;
                        }
                    }
                }

                // Completion Percentage.
                let cpInput = $('th#completionpercentage input.less');
                if (cpInput.length > 0) {
                    let showless = cpInput.is(':checked');
                    let showmore = $('th#completionpercentage input.more').is(':checked');
                    if (!showless || !showmore) {
                        let cpIndex = columns.findIndex(x => x.data === 'completionpercentage');
                        if (cpIndex !== -1) {
                            let cpRawValue = data[cpIndex] || "0";
                            let cpValue = parseInt(cpRawValue.toString().replace('%', '')) || 0;
                            let cpThreshold = cpInput.data('percentage') || 0;
                            // eslint-disable-next-line max-depth
                            if (showless && !showmore && cpValue >= cpThreshold) {
                                return false;
                            }
                            // eslint-disable-next-line max-depth
                            if (!showless && showmore && cpValue < cpThreshold) {
                                return false;
                            }
                            // eslint-disable-next-line max-depth
                            if (!showless && !showmore) {
                                return false;
                            }
                        }
                    }
                }
            } catch (e) {
                // Error in filter should not block the report.
                return true;
            }

            return true;
        });
    }

    /**
     * Register click handlers for toggle filters.
     *
     * @param {Object} tabledata The DataTable instance.
     * @param {Array} columns The column definitions.
     */
    static registerClickHandlers(tabledata, columns) {
        $('#filterregion :input[type=date].custom-field').on('change', function() {
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
                tabledata.column(index).search('^(?!0$)', true, false).draw();
            } else if (notstarted) {
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
                tabledata.column(index).search('^0$', true, false).draw();
            } else if (completed) {
                tabledata.column(index).search('^(?!0$)', true, false).draw();
            } else {
                tabledata.column(index).search('-', true, false).draw();
            }
        });

        $('#reporttable th[data-type] input').on('click', function(e) {
            e.stopPropagation();
            let index = columns.findIndex(x => x.itemid == $(this).data('item'));
            if ($(this).is(':checked')) {
                tabledata.column(index).search('^(?!-$)', true, false).draw();
            } else {
                tabledata.column(index).search('', true, false).draw();
            }
        });

        $('#reporttable th#completionpercentage input').on('click', function(e) {
            e.stopPropagation();
            tabledata.draw();
        });

        $('#filterregion #timecreatedrange input, #filterregion #timecompletedrange input').on('change', function() {
            tabledata.draw();
        });
    }

    /**
     * Get the default DataTable options.
     *
     * @param {Object} params Configuration parameters.
     * @returns {Object}
     */
    static getDataTableOptions(params) {
        const {
            columns,
            exportOptions,
            hasCompletion,
            itemids,
            profileFields,
            isBS5,
            data
        } = params;

        return {
            "data": data,
            "columns": columns,
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
                selector: 'input[type="checkbox"].bulk',
            },
            stateSaveParams: function(settings, data) {
                data.search.search = "";
                data.start = 0;
                data.columns.forEach(function(column) {
                    column.search.search = "";
                });
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
                + `<'#filterregion.w-100 row mx-0 my-2 p-3 bg-light iv-rounded border'>t<'row mt-2'<'col-sm-6'i><'col-sm-6'p>>`,
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
            footerCallback: function() {
                var api = this.api();
                var rowCount = api.rows({filter: 'applied'}).count();

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

                // Started.
                var timecreatedData = api.column(timecreatedIdx, {filter: 'applied'}).data();
                var countTimecreated = timecreatedData.reduce(function(acc, val) {
                    return acc + ((val && val > 0) ? 1 : 0);
                }, 0);
                var timecreatedPerc = ((countTimecreated / rowCount) * 100).toFixed(1) + '%';
                if (rowCount === 0) {
                    timecreatedPerc = '0%';
                }

                // Completed.
                var timecompletedData = api.column(timecompletedIdx, {filter: 'applied'}).data();
                var countTimecompleted = timecompletedData.reduce(function(acc, val) {
                    return acc + ((val && val > 0) ? 1 : 0);
                }, 0);
                var timecompletedPerc = ((countTimecompleted / rowCount) * 100).toFixed(1) + '%';
                if (rowCount === 0) {
                    timecompletedPerc = '0%';
                }

                // XP.
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

                // Completion Percentage.
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
            "initComplete": function() {
                let $reportTable = $('#reporttable');
                if (hasCompletion) {
                    $reportTable.find('th .controls').removeClass("d-none");
                }
                if (itemids.length == 0) {
                    $reportTable.find('th .controls').addClass("d-none");
                }
                $reportTable.find("table#completiontable")
                    .wrap("<div style='overflow:auto;position:relative' class='completiontablewrapper my-2'></div>");
                $reportTable.find('.dataTables_length').addClass("d-inline iv-ml-1");
                $reportTable.find(".dataTables_filter").addClass("d-inline iv-float-right");
                $reportTable.find(".table-responsive").addClass("p-1");
                $reportTable.find(".spinner-grow").remove();
                $reportTable.find("table#completiontable").removeClass("invisible");
                $reportTable.find("#background-loading").fadeOut(300);

                $(`<a class="btn btn-sm btn-secondary iv-font-weight-bold iv-ml-1 d-inline-block"
                    href="javascript:void(0)" id="filters"
                    title="Filter"><i class="bi bi-funnel left fa-fw fs-unset"></i></a>`).insertAfter(".dataTables_filter label");
                $(document).off('click', '#filters').on('click', '#filters', function() {
                    $('#filterregion').slideToggle('fast', 'swing');
                    $(this).find('i').toggleClass('bi-funnel bi-funnel-fill');
                });
                $reportTable.find('#filterregion').hide();

                profileFields.forEach((element) => {
                    $(ReportBase.renderFilterBox(element, data, isBS5)).appendTo("#filterregion");
                });

                // Init select2
                $(`#filterregion .${isBS5 ? 'form' : 'custom'}-select[multiple]`).select2({
                    dropdownParent: $('body'),
                    width: '100%',
                    placeholder: M.util.get_string('select', 'mod_interactivevideo'),
                    allowClear: true,
                });
                $(`.${isBS5 ? 'form' : 'custom'}-select`)
                    .on('select2:open', function(e) {
                        const evt = "scroll.select2";
                        $(e.target).parents().off(evt);
                        $(window).off(evt);
                    });

                $reportTable.find("#filterregion").append(`<div class="col-sm-6 col-md-4 col-lg-3 col-xl-4 iv-pl-0 iv-pr-2 mb-2">
                    <div class="iv-form-group mb-1" id="timecreatedrange">
                    <label for="timecreatedrange">${M.util.get_string('timecreatedrange', 'mod_interactivevideo')}</label>
                    <div class="input-group input-group-sm">
                        <input type="date" class="form-control" id="timecreatedstart"/>
                        <input type="date" class="form-control" id="timecreatedend"/>
                    </div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-4 col-lg-3 col-xl-4 iv-pl-0 iv-pr-2 mb-2">
                    <div class="iv-form-group mb-1" id="timecompletedrange">
                    <label for="timecompletedrange">${M.util.get_string('timecompletedrange', 'mod_interactivevideo')}</label>
                    <div class="input-group input-group-sm">
                        <input type="date" class="form-control" id="timecompletedstart"/>
                        <input type="date" class="form-control" id="timecompletedend"/>
                    </div>
                    </div>
                </div>
                `);

                $reportTable.find("#filterregion").append(`<div class="col-12 p-0 mx-0">
                    <span class="text-muted small">${M.util.get_string('separatesearchtermsbyslash', 'mod_interactivevideo')}</span>
                    </div>`);
                $reportTable.find(`table [data${isBS5 ? '-bs' : ''}-toggle="tooltip"]`).tooltip();
                if (isBS5) {
                    $('.custom-select').toggleClass('custom-select form-select');
                }
            }
        };
    }

    /**
     * Register bulk actions for the DataTable.
     *
     * @param {Object} tabledata The DataTable instance.
     * @param {Object} config Configuration parameters.
     */
    static registerBulkActions(tabledata, config) {
        const {
            courseid,
            cmid,
            ajaxUrl,
            ajaxMethod = 'POST',
            ajaxAction,
            wsMethod,
            sesskey = M.cfg.sesskey,
            contextid = M.cfg.contextid
        } = config;

        tabledata.on("select deselect", function(e) {
            e.stopImmediatePropagation();
            var selectedRows = tabledata.rows({selected: true});

            // Update checkboxes.
            selectedRows.every(function() {
                $(this.node()).find("td:first-child input.bulk").prop("checked", true);
                return true;
            });
            tabledata.rows({selected: false}).every(function() {
                $(this.node()).find("td:first-child input.bulk").prop("checked", false);
                return true;
            });

            $('#bulkactions').remove();

            if (selectedRows.count() > 0 && selectedRows.count() <= 20) {
                $('#completiontable_length').after(`<div class="d-flex align-items-center" id="bulkactions">
                    <button class="btn btn-sm btn-danger iv-ml-1" id="bulkdelete">
                        <i class="bi bi-trash3 iv-mr-1 fs-unset"></i>${M.util.get_string('delete', 'mod_interactivevideo')}
                         (${selectedRows.count()})
                    </button>
                    </div>`);
            }
        });

        $(document).on('click', '#bulkdelete', function() {
            let selectedRows = tabledata.rows({selected: true});
            let selectedData = selectedRows.data().toArray();
            let selectedIds = selectedData.map(x => x.completionid);
            let selectedUsers = selectedData.map(x => x.id);

            const bulkDelete = async() => {
                if (wsMethod) {
                    const Ajax = await import('core/ajax');
                    const res = await Ajax.call([{
                        methodname: wsMethod,
                        args: {
                            contextid: contextid,
                            cmid: cmid,
                            recordids: selectedIds.join(','),
                            courseid: courseid,
                        }
                    }])[0];

                    if (res.status == 'success') {
                        finalizeDelete();
                    } else {
                        showError();
                    }
                } else {
                    $.ajax({
                        url: ajaxUrl,
                        method: ajaxMethod,
                        dataType: "text",
                        data: {
                            action: ajaxAction,
                            completionids: selectedIds.join(','),
                            courseid: courseid,
                            cmid: cmid,
                            contextid: contextid,
                            sesskey: sesskey,
                        },
                        success: function(response) {
                            if (response == 'deleted') {
                                finalizeDelete();
                            } else {
                                showError();
                            }
                        },
                        error: showError
                    });
                }
            };

            const finalizeDelete = () => {
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
                    return true;
                });
                tabledata.draw();
                require(['core/toast'], (Toast) => {
                    Toast.add(M.util.get_string('completionresetsuccess', 'mod_interactivevideo'), {
                        type: 'success'
                    });
                });
            };

            const showError = () => {
                require(['core/toast'], (Toast) => {
                    Toast.add(M.util.get_string('completionreseterror', 'mod_interactivevideo'), {
                        type: 'error'
                    });
                });
            };

            const Notification = require('core/notification');
            try {
                Notification.deleteCancelPromise(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('deleterecordforselectedusers', 'mod_interactivevideo', selectedUsers.length),
                    M.util.get_string('delete', 'mod_interactivevideo')
                ).then(async() => {
                    return bulkDelete();
                }).catch(() => {
                    return;
                });
            } catch {
                Notification.saveCancel(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('deleterecordforselectedusers', 'mod_interactivevideo', selectedUsers.length),
                    M.util.get_string('delete', 'mod_interactivevideo'),
                    function() {
                        return bulkDelete();
                    }
                );
            }
        });
    }

    /**
     * Registers single reset handlers for the DataTable.
     *
     * @param {Object} tabledata - The DataTable instance.
     * @param {Object} config - Configuration options.
     */
    static registerSingleReset(tabledata, config) {
        $(document).on('click', 'td .reset', function(e) {
            e.preventDefault();
            const recordid = $(this).data('record');
            let $this = $(this);

            const performReset = async() => {
                if (config.wsMethod) {
                    const res = await Ajax.call([{
                        methodname: config.wsMethod,
                        args: {
                            contextid: M.cfg.contextid,
                            cmid: config.cmid,
                            recordids: recordid.toString(),
                            courseid: config.courseid,
                        }
                    }])[0];

                    if (res.status == 'success') {
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
                    } else {
                        addToast(M.util.get_string('completionreseterror', 'mod_interactivevideo'), {
                            type: 'error'
                        });
                    }
                } else if (config.ajaxUrl) {
                    return $.ajax({
                        url: config.ajaxUrl,
                        method: 'POST',
                        dataType: "text",
                        data: {
                            action: config.ajaxAction || 'delete_progress_by_id',
                            recordid,
                            courseid: config.courseid,
                            cmid: config.cmid,
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
                }
            };

            const Notification = require('core/notification');
            try {
                Notification.deleteCancelPromise(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('areyousureyouwanttoresetthecompletiondata', 'mod_interactivevideo'),
                    M.util.get_string('delete', 'mod_interactivevideo')
                ).then(() => {
                    return performReset();
                }).catch(() => {
                    return;
                });
            } catch {
                Notification.saveCancel(
                    M.util.get_string('deletecompletion', 'mod_interactivevideo'),
                    M.util.get_string('areyousureyouwanttoresetthecompletiondata', 'mod_interactivevideo'),
                    M.util.get_string('delete', 'mod_interactivevideo'),
                    function() {
                        return performReset();
                    }
                );
            }
        });
    }

    /**
     * Renders annotation logs in a DataTable with specified options.
     *
     * @param {Object} data - The data to be displayed in the table.
     * @param {Array} data.rows - The rows of data to be displayed.
     * @param {string} node - The DOM node selector where the table will be rendered.
     * @param {string} title - The title used for export options.
     */
    static renderAnnotationLogs(data, node, title) {
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
                $(`${node} .dataTables_length`).addClass("d-inline iv-ml-1");
                $(`${node} .dataTables_filter`).addClass("d-inline iv-float-right");
                $(`${node} .table-responsive`).addClass("p-1");
            }
        };

        $(`${node} table`).DataTable(tableOptions);
    }
}
