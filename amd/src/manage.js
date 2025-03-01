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
 * TODO describe module manage
 *
 * @module     mod_interactivevideo/manage
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([
    'jquery',
], function($) {
    return {
        settings: async function(courseid, coursecontextid, userid) {
            let addToast = await import('core/toast');
            let DynamicForm = await import('core_form/dynamicform');
            let string = await import('core/str');
            $(document).ready(function() {
                const selector = document.querySelector(`#region-main-box #settings`);
                const settingform = new DynamicForm(selector, 'mod_interactivevideo\\form\\settings_form');
                settingform.addEventListener(settingform.events.FORM_SUBMITTED, (e) => {
                    e.preventDefault();
                    addToast.add(string.get_string('settingssaved', 'mod_interactivevideo'), {
                        type: 'success',
                    });
                });
                settingform.addEventListener(settingform.events.CANCEL_BUTTON_PRESSED, (e) => {
                    e.preventDefault();
                    settingform.load({
                        courseid: courseid,
                        contextid: coursecontextid,
                        userid: userid,
                        action: 'reset',
                    });
                    addToast.add(string.get_string('formvaluesarereset', 'mod_interactivevideo'), {
                        type: 'info',
                    });
                });
            });
        },
        list: async function(courseid, coursecontextid) {
            let addToast = await import('core/toast');
            let ModalForm, str;
            let JSZip = await import('mod_interactivevideo/libraries/jszip');
            window.JSZip = JSZip;
            await import('mod_interactivevideo/libraries/jquery.dataTables');
            await import('mod_interactivevideo/libraries/dataTables.bootstrap4');
            await import('mod_interactivevideo/libraries/dataTables.buttons');
            await import('mod_interactivevideo/libraries/buttons.html5');
            await import('mod_interactivevideo/libraries/dataTables.select');
            await import('mod_interactivevideo/libraries/select.bootstrap4');
            await import('mod_interactivevideo/libraries/buttons.bootstrap4');
            await import('mod_interactivevideo/libraries/buttons.colVis');
            await import('mod_interactivevideo/libraries/dataTables.rowGroup');
            await import('mod_interactivevideo/libraries/select2');
            const addSelect2 = function() {
                const tabledata = $('#videolist').DataTable();
                let sectionname = [];
                let videotype = [];
                const sectionnameIndex = $(`#videolist thead th.sectionname`).index();
                sectionname = tabledata.column(sectionnameIndex).data().unique().sort();
                const videotypeIndex = $(`#videolist thead th.type`).index();
                videotype = tabledata.column(videotypeIndex).data().unique().sort();
                $(`<a class="btn rounded-sm btn-secondary font-weight-bold ml-1" href="javascript:void(0)"
                     id="filters" title="${M.util.get_string('filters', "mod_interactivevideo")}">
                     <i class="fa fa-filter"></i></a>`)
                    .insertAfter("#videolist_filter");
                $(`.btn#filters`).on('click', function() {
                    $('.search-container').slideToggle('fast', 'swing');
                });
                $(`<div class="bg-light rounded hide mb-0 search-container w-100 p-3" id="video-filters">
                    <div class="px-0 form-group form-group-sm font-size-sm form-row pt-1 w-100 mb-0">
                    <div class="col-4 mb-1 title">
                        <label class="small text-muted d-block">${M.util.get_string('title', "mod_interactivevideo")}</label>
                        <input type="text" class="form-control form-control-sm mb-1 w-100" data-col="title">
                    </div>
                    <div class="col-4 mb-1 sectionname">
                        <label class="small text-muted d-block">${M.util.get_string('section', "mod_interactivevideo")}</label>
                        <select class="custom-select custom-select-sm mb-1 w-100" data-col="sectionname" multiple>
                        ${sectionname.map((section) => `<option value="${section}">${section}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-4 mb-1 type">
                        <label class="small text-muted d-block">${M.util.get_string('type', "mod_interactivevideo")}</label>
                        <select class="custom-select custom-select-sm mb-1 w-100" data-col="type" multiple>
                        ${videotype.map((type) => `<option value="${type}">${type}</option>`).join('')}
                        </select>
                        </div>
                    </div>
                </div>`).insertBefore('.row.top');

                $('#video-filters .custom-select[multiple]').select2({
                    dropdownParent: $('body') // Little hack to prevent page overflow when select2 is open
                });
                $('.custom-select').on('select2:open', function(e) { // Little hack to prevent page overflow when select2 is open
                    const evt = "scroll.select2";
                    $(e.target).parents().off(evt);
                    $(window).off(evt);
                });
            };
            let data = $('#listdata').text();
            let columns = [
                {
                    data: 'id',
                    className: 'w-0 exportable checkbox',
                    render: function(data, type, row) {
                        return `<input type="checkbox" class="checked" value="${row.id}">`;
                    },
                    "createdCell": function(td, cellData) {
                        $(td).data("id", cellData);
                    },
                    "title": '<span class="sr-only">ID</span><input type="checkbox" id="select-all"/>'
                },
                {
                    data: null,
                    className: 'w-0 actions nosort',
                    render: function(data, type, row) {
                        let retrn = `<div class="actions-wrapper d-flex flex-column">`;
                        if (row.edit) {
                            retrn += `<a href="javascript:void(0)" data-href="${M.cfg.wwwroot}/course/modedit.php?update=${row.id}"
                             class="p-1 iv_quickform" data-contextid="${row.contextid}" data-cmid="${row.id}"
                              data-interaction="${row.instance}" data-courseid="${row.courseid}"
                              data-toggle="tooltip" data-placement="right" data-html="true"
                              title="${M.util.get_string('edit', 'mod_interactivevideo')}">
                             <i class="fa fa-edit" aria-hidden="true"></i></a>`;
                        }
                        if (row.editinteraction) {
                            retrn += `<a href="${M.cfg.wwwroot}/mod/interactivevideo/interactions.php?id=${row.id}" target="_blank"
                            class="p-1" data-toggle="tooltip" data-placement="right"
                             title="${M.util.get_string('interactions', 'mod_interactivevideo')}">
                             <i class="fa fa-bullseye" aria-hidden="true"></i></a>`;
                        }
                        if (row.report) {
                            retrn += `<a href="${M.cfg.wwwroot}/mod/interactivevideo/report.php?id=${row.id}" target="_blank"
                             data-title="${row.title}"
                             data-href="${M.cfg.wwwroot}/mod/interactivevideo/report.php?id=${row.id}"
                              data-toggle="tooltip" data-placement="right" data-html="true"
                             title="${M.util.get_string('report', 'mod_interactivevideo')}"
                             class="p-1 launch-report"><i class="fa fa-table" aria-hidden="true"></i></a>`;
                        }
                        return retrn + `</div>`;
                    }
                },
                {
                    data: 'instance',
                    className: 'd-none',
                    render: function(data, type, row) {
                        return `<a href="${row.editurl}" title="${row.title}">${row.id}</a>`;
                    }
                },
                {
                    data: null,
                    className: 'poster exportable',
                    render: function(data, type, row) {
                        if (type === 'display') {
                            return `<div class="wrapper d-flex flex-row align-items-start">
                                <div class="cursor-pointer poster-wrapper"
                         data-id="${row.id}" data-instance="${row.instance}">
                                    <img src="${row.posterimage}"
                                        alt="${row.title}"
                                        class="poster-image ${row.squareposter}"
                                        loading="lazy">
                                    <div class="poster-overlay w-100 h-100 position-absolute">
                                        <i class="fa fa-play text-white fa-2x"></i>
                                        </div>
                                </div>
                                <a href="${M.cfg.wwwroot + '/mod/interactivevideo/view.php?id='
                                + row.id}" target="_blank" class="title font-weight-bold py-2 px-3"
                                      title="${row.title}">${row.title}</a>
                                </div>`;
                        }
                        return row.title;
                    }
                },
                {
                    data: 'title',
                    className: 'd-none title exportable',
                    render: function(data) {
                        return data;
                    }
                },
                {
                    data: 'sectionnum',
                    className: 'd-none w-0 exportable',
                },
                {
                    data: 'type',
                    className: 'w-0 type exportable',
                },
                {
                    data: 'view',
                    className: 'w-0 view exportable',
                },
                {
                    data: 'duration',
                    className: 'w-0 exportable',
                    render: function(data, type) {
                        if (type === 'display') {
                            // Convert seconds to HH:MM:SS
                            let seconds = Math.round(data);
                            let hours = Math.floor(seconds / 3600);
                            hours = (hours >= 10) ? hours : '0' + hours;
                            let minutes = Math.floor((seconds - (hours * 3600)) / 60);
                            minutes = (minutes >= 10) ? minutes : '0' + minutes;
                            let remainingSeconds = seconds - (hours * 3600) - (minutes * 60);
                            remainingSeconds = (remainingSeconds >= 10) ? remainingSeconds : '0' + remainingSeconds;
                            return `${hours}:${minutes}:${remainingSeconds}`;
                        }
                        return data;
                    }
                },
                {
                    data: 'xp',
                    className: 'w-0 exportable',
                },
                {
                    data: 'count',
                    className: 'w-0 exportable',
                },
            ];

            // Get the enable activity types for activity columns.
            let activitytypes = JSON.parse(data)[0].activitycount;
            activitytypes = activitytypes.map(x => x.name);
            activitytypes.sort(); // Sort to match the column order.

            // Add activity type to columns.
            activitytypes.forEach(x => {
                columns.push({
                    data: null,
                    className: 'bg-light exportable ' + x,
                    render: function(row) {
                        return row.activitycount.find(a => a.name == x).count;
                    },
                    "createdCell": function(td) {
                        const val = $(td).text();
                        if (val > 0) {
                            $(td).addClass('alert-success');
                        }
                    },
                });
            });

            columns.push({
                data: 'sectionname',
                className: 'd-none sectionname w-0 exportable',
            });
            columns.push({
                data: 'url',
                className: 'exportable',
                render: function(data) {
                    return `<a href="${data}" target="_blank">${data}</a>`;
                }
            });

            let datatable = $('#videolist').DataTable({
                "dom": `<'d-flex w-100 justify-content-between`
                    + `'<'d-flex align-items-start'Bl>'<'d-flex align-items-start'f>>`
                    + `<'row mt-2 top'<'col-sm-6'i><'col-sm-6 d-flex justify-content-end'p>>`
                    + `t`
                    + `<'row mt-2'<'col-sm-6'i><'col-sm-6 d-flex justify-content-end'p>>`,
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
                                    // Strip HTML tags to get text only
                                    const div = document.createElement("div");
                                    div.innerHTML = data;
                                    return (div.textContent || div.innerText || "").trim();
                                }
                            }
                        }
                    },
                    {
                        extend: "csvHtml5",
                        text: '<i class="bi bi-filetype-csv fa-fw fs-unset"></i>',
                        className: "btn btn-sm border-0",
                        exportOptions: {
                            columns: ['.exportable'],
                            format: {
                                body: function(data) {
                                    // Strip HTML tags to get text only
                                    const div = document.createElement("div");
                                    div.innerHTML = data;
                                    return (div.textContent || div.innerText || "").trim();
                                }
                            }
                        }
                    },
                    {
                        extend: "excelHtml5",
                        text: '<i class="bi bi-file-earmark-excel fa-fw fs-unset"></i>',
                        className: "btn btn-sm border-0",
                        exportOptions: {
                            columns: ['.exportable'],
                            format: {
                                body: function(data) {
                                    // Strip HTML tags to get text only
                                    const div = document.createElement("div");
                                    div.innerHTML = data;
                                    return (div.textContent || div.innerText || "").trim();
                                }
                            }
                        }
                    }
                ],
                "initComplete": function() {
                    $("table#videolist").wrap("<div style='overflow:auto;position:relative' class='tablewrapper'></div>");
                    $("#list .dataTables_length").addClass("d-inline ml-1");
                    $("#list .dataTables_filter").addClass("d-inline float-right");
                    $("#list .table-responsive").addClass("p-1");
                    $("#list .spinner-grow").remove();
                    $("table#videolist").removeClass("d-none");
                    $("#background-loading").fadeOut(300);

                    // Add select2 to the search input
                    addSelect2();
                },
                "deferRender": true,
                "rowId": "id",
                "pageLength": 10,
                "order": [[5, "asc"]],
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
                data: JSON.parse(data),
                rowGroup: {
                    dataSrc: 'sectionname',
                },
                columnDefs: [
                    {
                        "orderable": false,
                        "targets": [0, 1],
                    },
                ],
                orderFixed: [5, "asc"],
                columns: columns,
            });

            $('#video-filters input, #video-filters select').on('keyup change', function() {
                let col = $(this).data('col');
                let val = $(this).val();
                let isArray = Array.isArray(val);
                if (val.length > 0) {
                    if (isArray) {
                        val = val.join('|');
                    }
                    datatable.column(`.${col}`).search(val, true, false);
                } else {
                    datatable.column(`.${col}`).search('', true, false);
                }
                datatable.draw();
            });

            datatable.on("draw", function() {
                $('tr.selected td.checkbox input').prop("checked", true);
                $('tr:not(.selected) td.checkbox input').prop("checked", false);
            });

            datatable.on("search", function() {
                // Reset the select all checkbox
                $("#select-all").prop("checked", false);
                // De-select all rows
                datatable.rows().deselect();
            });

            $(document).on("click", "#select-all", function() {
                if ($(this).prop("checked")) {
                    datatable.rows({
                        search: "applied",
                    }).select();
                    $('td.checkbox input').prop("checked", true);
                } else {
                    datatable.rows({
                        search: "applied",
                    }).deselect();
                    $('td.checkbox input').prop("checked", false);
                }
            });

            datatable.on("select deselect", function(e) {
                e.stopImmediatePropagation();
                // Change the checkbox state
                var selectedRows = datatable.rows({selected: true});
                // For each selected row, find the checkbox with class "checked" in the first column and check it
                selectedRows.every(function() {
                    var row = this.node();
                    $(row).find("td:first-child input").prop("checked", true);
                    return true;
                });

                var deselectedRows = datatable.rows({selected: false});
                // For each deselected row, find the checkbox with class "checked" in the first column and uncheck it
                deselectedRows.every(function() {
                    var row = this.node();
                    $(row).find("td:first-child input").prop("checked", false);
                    return true;
                });

                if (deselectedRows.count() === 0) {
                    $("#select-all").prop("checked", true);
                }

                if (selectedRows.count() === 0 || selectedRows.count() < datatable.rows({search: "applied"}).count()) {
                    $("#select-all").prop("checked", false);
                }

                if (selectedRows.count() > 0) {
                    // Insert the bulk actions
                    $('#bulkactions').remove();
                    $('#videolist_length').after(`<div class="d-flex align-items-center" id="bulkactions"><button type="button"
                        class="btn btn-sm btn-secondary ml-1" id="bulkreset">
                        ${M.util.get_string('resetsettings', 'mod_interactivevideo')}</button>
                        <button type="button"
                        class="btn btn-sm btn-secondary ml-1" id="bulkappearance">
                        ${M.util.get_string('appearancesettings', 'mod_interactivevideo')}</button>
                        <button type="button"
                        class="btn btn-sm btn-secondary ml-1" id="bulkbehavior">
                        ${M.util.get_string('behaviorsettings', 'mod_interactivevideo')}</button>
                        </div>`);
                } else {
                    $('#bulkactions').remove();
                }
            });

            $(document).on("click", "#bulkreset, #bulkappearance, #bulkbehavior", async function() {
                let $this = $(this);
                if (!ModalForm) {
                    ModalForm = await import('core_form/modalform');
                }
                if (!str) {
                    str = await import('core/str');
                }
                let selectedRows = datatable.rows({selected: true});
                let ids = [];
                selectedRows.every(function() {
                    ids.push(this.data().id);
                    return true;
                });
                let bulkdata = {
                    courseid: courseid,
                    cmids: ids.join(','), // Convert the array to a string
                    contextid: coursecontextid,
                };

                bulkdata.action = $this.attr('id').replaceAll('bulk', '');

                let form = new ModalForm({
                    formClass: 'mod_interactivevideo\\form\\reset_form',
                    args: bulkdata,
                    modalConfig: {
                        title: M.util.get_string('reset', 'mod_interactivevideo'),
                        removeOnClose: true,
                    }
                });

                form.show();

                form.addEventListener(form.events.FORM_SUBMITTED, (e) => {
                    e.stopImmediatePropagation();
                    addToast.add(str.get_string('settingssaved', 'mod_interactivevideo'), {
                        type: 'success',
                    });
                    let results = e.detail;
                    if (bulkdata.action === 'reset' || bulkdata.action === 'appearance') {
                        let page = datatable.page();
                        results.forEach(result => {
                            if (result.displayoptions) {
                                let displayoptions = JSON.parse(result.displayoptions);
                                let newdata = datatable.row(`#${result.id}`).data();
                                newdata.squareposter = displayoptions.squareposterimage == 1 ? 'square' : '';
                                newdata.posterimage = result.posterimage;
                                datatable.row(`#${result.id}`).data(newdata).draw();
                            }
                        });
                        datatable.page(page).draw(false);
                    }
                });
            });

            $(document).on("click", ".checked", function() {
                if ($(this).prop("checked")) {
                    datatable.row($(this).closest("tr")).select();
                } else {
                    datatable.row($(this).closest("tr")).deselect();
                }
            });

            // Launch report modal when clicking on the report icon.
            let Modal, Templates;
            $(document).on('click', '.launch-report', async function(e) {
                e.preventDefault();
                const href = $(this).data('href');
                let $this = $(this);
                if (!Templates) {
                    Templates = await import('core/templates');
                }
                const data = {
                    id: 'reportModal',
                    title: M.util.get_string('reportfor', 'mod_interactivevideo', $this.data('title')),
                    body: `<iframe src="${href}&embed=1"
                                    style="width: 100%; height: 100%; border: 0; z-index:1050; position:absolute;"></iframe>`,
                };
                Modal = await Templates.render('mod_interactivevideo/fullscreenmodal', data);
                $('body').append(Modal);
                $('#reportModal').modal('show');
                $('#reportModal').on('shown.bs.modal', function() {
                    $(this).focus();
                });
                $('#reportModal').on('hidden.bs.modal', function() {
                    $(this).remove();
                });
            });

            // Launch video when clicking on the poster.
            $(document).on('click', '.poster-wrapper', async function(e) {
                e.preventDefault();
                const modal = `<div class="modal fade p-0" id="posterModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog modal-xl modal-dialog-centered" role="document">
                        <div class="modal-content bg-black overflow-hidden border-0">
                            <div class="modal-body position-relative">
                            <div class="position-absolute w-100 h-100 no-pointer bg-transparent"
                                id="background-loading">
                                <div class="d-flex h-100 align-items-center justify-content-center">
                                    <div class="spinner-border text-danger"
                                        style="width: 3rem;
                                                height: 3rem"
                                        role="status">
                                        <span class="sr-only">Loading...</span>
                                    </div>
                                </div>
                            </div>
                            <iframe src="${M.cfg.wwwroot}/mod/interactivevideo/view.php?id=${$(this)
                        .data('id')}&embed=1&dm=1&df=1&preview=1"
                             class="w-100 h-100 border-0 position-absolute" style="z-index:1050"></iframe>
                            </iframe>
                            </div>
                        </div>
                    </div>
                    </div>`;
                $('body').append(modal);
                $('#posterModal').modal('show');

                $('#posterModal').on('hidden.bs.modal', function() {
                    $(this).remove();
                });
            });

            // Quick form for interactive video settings.
            $(document).on('click', '.iv_quickform', async function(e) {
                const $this = $(this);
                e.preventDefault();
                let formdata = {
                    contextid: $(this).data('contextid'),
                    cmid: $(this).data('cmid'),
                    courseid: $(this).data('courseid'),
                    interaction: $(this).data('interaction'),
                };

                if (!ModalForm) {
                    ModalForm = await import('core_form/modalform');
                }

                if (!str) {
                    str = await import('core/str');
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
                        $('.modal-dialog').removeClass('modal-lg').addClass('modal-xl');
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
                    // Replace the row with the new data.
                    let row = datatable.row($this.closest('tr'));
                    let newdata = row.data();
                    let displayoptions = e.detail.displayoptions;
                    displayoptions = JSON.parse(displayoptions);
                    newdata.title = e.detail.name;
                    newdata.squareposter = displayoptions.squareposterimage == 1 ? 'square' : '';
                    newdata.posterimage = e.detail.posterimage;
                    let page = datatable.page();
                    datatable.row($this.closest('tr')).data(newdata).draw();
                    datatable.page(page).draw(false);
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
        }
    };
});