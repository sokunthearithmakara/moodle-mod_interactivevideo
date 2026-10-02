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
 * The outcome column on the report page, shared by interactive video and flexbook.
 *
 * Each row shows how many of the activity's outcomes that learner has been rated on. The
 * column header opens a summary of how the learners in the table are spread across each
 * outcome's scale, computed from the rows already loaded rather than from a fresh request.
 *
 * @module     mod_interactivevideo/report_outcomes
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import {get_string as getString} from 'core/str';

/**
 * An outcome's name, with its short name in brackets.
 *
 * @param {Object} definition One outcome definition.
 * @returns {String} The HTML.
 */
const outcomeName = (definition) => {
    if (!definition.shortname) {
        return definition.name;
    }
    return `${definition.name} <span class="text-muted">(${definition.shortname})</span>`;
};

/**
 * The outcome definitions the page was rendered with.
 *
 * @returns {Array} One entry per outcome: id, name and scale labels. Empty when the column is off.
 */
export const getDefinitions = () => {
    const holder = document.getElementById('outcomesdata');
    if (!holder) {
        return [];
    }
    try {
        const definitions = JSON.parse(holder.value || holder.textContent || '[]');
        return Array.isArray(definitions) ? definitions : [];
    } catch (e) {
        return [];
    }
};

/**
 * The DataTables column definition for the outcome column.
 *
 * @returns {Object} The column definition.
 */
export const column = () => ({
    data: "outcomes",
    className: "text-center exportable outcome-cell",
    render: function(data, type) {
        const rated = data && data.rated ? Number(data.rated) : 0;
        const total = data && data.total ? Number(data.total) : 0;
        if (type === 'sort' || type === 'filter') {
            return rated;
        }
        if (type !== 'display') {
            return rated + '/' + total;
        }
        let klass = '';
        if (rated === 0) {
            klass = 'text-muted';
        } else if (rated === total) {
            klass = 'text-success';
        }
        if (total === 0) {
            return `<span class="${klass}">${rated}/${total}</span>`;
        }
        return `<span class="${klass} cursor-pointer" data-region="outcomecell" role="button" tabindex="0">
                    ${rated}/${total}
                </span>`;
    }
});

/**
 * The interactions feeding an outcome, as a plain list.
 *
 * @param {Object} definition One outcome definition.
 * @param {String} fedbylabel The "Fed by" label.
 * @returns {String} The HTML, empty when nothing feeds the outcome.
 */
const linkedHtml = (definition, fedbylabel) => {
    const items = definition.items || [];
    if (!items.length) {
        return '';
    }
    const titles = items.map((item) => item.title).join(', ');
    return `<p class="text-muted small mb-2">${fedbylabel} ${titles}</p>`;
};

/**
 * One learner's result on each interaction feeding an outcome.
 *
 * @param {Object} definition One outcome definition.
 * @param {Array} completed The interaction ids the learner has completed.
 * @param {Object} details The learner's completion details, keyed by interaction id.
 * @param {String} notattemptedlabel The label for an interaction the learner has not done.
 * @returns {String} The HTML, empty when nothing feeds the outcome.
 */
const linkedLearnerHtml = (definition, completed, details, notattemptedlabel) => {
    const items = definition.items || [];
    if (!items.length) {
        return '';
    }
    const rows = items.map((item) => {
        const done = completed.indexOf(String(item.id)) >= 0;
        const detail = details[String(item.id)];
        let result = notattemptedlabel;
        if (done && detail && detail.percent !== undefined && detail.percent !== null) {
            result = Math.round(Number(detail.percent) * 100) + '%';
        } else if (done) {
            result = '&check;';
        }
        const klass = done ? '' : 'text-muted';
        return `<li class="d-flex flex-wrap align-items-center justify-content-between ${klass}">
                    <span class="iv-mr-2">${item.title}</span>
                    <span class="text-nowrap">${result}</span>
                </li>`;
    }).join('');
    return `<ul class="list-unstyled small text-muted mb-0 mt-2 iv-outcome-linked">${rows}</ul>`;
};

/**
 * A learner's completed interactions and their details, from a table row.
 *
 * @param {Object} row The learner's table row.
 * @returns {Object} completed (ids as strings) and details keyed by interaction id.
 */
const progressFrom = (row) => {
    let completed = [];
    const details = {};
    try {
        const raw = JSON.parse(row.completeditems || '[]');
        completed = Array.isArray(raw) ? raw.map(String) : [];
    } catch (e) {
        completed = [];
    }
    try {
        const raw = JSON.parse(row.completiondetails || '[]');
        if (Array.isArray(raw)) {
            raw.forEach((entry) => {
                const detail = typeof entry === 'string' ? JSON.parse(entry) : entry;
                if (detail && detail.id !== undefined && !detail.deleted) {
                    details[String(detail.id)] = detail;
                }
            });
        }
    } catch (e) {
        return {completed: completed, details: details};
    }
    return {completed: completed, details: details};
};

/**
 * How the given rows are spread across one outcome's scale.
 *
 * @param {Array} rows The table rows.
 * @param {Object} definition One outcome definition.
 * @returns {Object} rated, total and a count per level.
 */
const summarise = (rows, definition) => {
    const counts = definition.levels.map(() => 0);
    let rated = 0;
    rows.forEach((row) => {
        const levels = row.outcomes && row.outcomes.levels ? row.outcomes.levels : {};
        const level = Number(levels[definition.id]);
        if (level >= 1 && level <= counts.length) {
            counts[level - 1]++;
            rated++;
        }
    });
    return {rated: rated, total: rows.length, counts: counts};
};

/**
 * The summary body for every outcome.
 *
 * @param {Array} rows The table rows.
 * @param {Array} definitions The outcome definitions.
 * @param {String} ratedlabel The "Rated" label.
 * @param {String} fedbylabel The "Rated from" label.
 * @returns {String} The HTML.
 */
const summaryHtml = (rows, definitions, ratedlabel, fedbylabel) => {
    const percent = (count, total) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);
    return definitions.map((definition) => {
        const summary = summarise(rows, definition);
        const levels = definition.levels.map((label, index) => {
            const count = summary.counts[index];
            return `<li class="list-group-item d-flex flex-wrap align-items-center justify-content-between">
                        <span class="iv-mr-2">${label}</span>
                        <span class="text-nowrap">${count}/${summary.total}
                            <span class="text-muted">(${percent(count, summary.total)}%)</span>
                        </span>
                    </li>`;
        }).join('');
        return `<div class="iv-outcome-summary mb-4">
                    <h6 class="d-flex flex-wrap align-items-center justify-content-between mb-2">
                        <span class="iv-mr-2">${outcomeName(definition)}</span>
                        <span class="badge iv-rounded-pill bg-secondary text-nowrap">
                            ${ratedlabel} ${summary.rated}/${summary.total}
                        </span>
                    </h6>
                    ${linkedHtml(definition, fedbylabel)}
                    <ul class="list-group">${levels}</ul>
                </div>`;
    }).join('');
};

/**
 * One learner's standing on every outcome.
 *
 * @param {Object} row The learner's table row.
 * @param {Array} definitions The outcome definitions.
 * @param {String} notratedlabel The label for an outcome with no rating.
 * @param {String} notattemptedlabel The label for an interaction the learner has not done.
 * @returns {String} The HTML.
 */
const learnerHtml = (row, definitions, notratedlabel, notattemptedlabel) => {
    const levels = row.outcomes && row.outcomes.levels ? row.outcomes.levels : {};
    const progress = progressFrom(row);
    const items = definitions.map((definition) => {
        const level = Number(levels[definition.id]);
        const rated = level >= 1 && level <= definition.levels.length;
        const label = rated ? definition.levels[level - 1] : notratedlabel;
        const badge = rated ? 'bg-success' : 'bg-secondary';
        return `<li class="list-group-item">
                    <div class="d-flex flex-wrap align-items-center justify-content-between">
                        <span class="iv-mr-2">${outcomeName(definition)}</span>
                        <span class="badge iv-rounded-pill ${badge} text-nowrap">${label}</span>
                    </div>
                    ${linkedLearnerHtml(definition, progress.completed, progress.details, notattemptedlabel)}
                </li>`;
    }).join('');
    return `<ul class="list-group iv-outcome-learner">${items}</ul>`;
};

/**
 * Shows a modal, replacing any previous one from this column.
 *
 * @param {Object} ModalFactory The modal class this page resolved for its Moodle version.
 * @param {String} title The modal title.
 * @param {String} body The modal body.
 * @returns {Promise} Resolves once the modal is shown.
 */
const showModal = async(ModalFactory, title, body) => {
    $('#outcome-summary-modal').remove();
    const modal = await ModalFactory.create({
        title: title,
        body: body,
        large: true,
    });
    if (typeof modal.setRemoveOnClose === 'function') {
        modal.setRemoveOnClose(true);
    }
    modal.getRoot().attr('id', 'outcome-summary-modal');
    await modal.show();
};

/**
 * Wires the column header and its cells to their modals.
 *
 * @param {Object} tabledata The DataTables instance.
 * @param {Object} ModalFactory The modal class this page resolved for its Moodle version.
 * @param {Array} definitions The outcome definitions.
 * @returns {void}
 */
export const init = (tabledata, ModalFactory, definitions) => {
    if (!definitions.length) {
        return;
    }

    $(document).on('click keydown', '[data-region="outcomesummary"]', async function(e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') {
            return;
        }
        e.preventDefault();

        // Whatever is in the table right now: the chosen group and any active filters.
        const rows = tabledata.rows({search: 'applied'}).data().toArray();
        const title = await getString('outcomes', 'grades');
        const ratedlabel = await getString('outcomesreportrated', 'mod_interactivevideo');
        const fedbylabel = await getString('outcomesreportfedby', 'mod_interactivevideo');

        await showModal(ModalFactory, title, summaryHtml(rows, definitions, ratedlabel, fedbylabel));
    });

    $(document).on('click keydown', '[data-region="outcomecell"]', async function(e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') {
            return;
        }
        e.preventDefault();

        const row = tabledata.row($(this).closest('tr')).data();
        if (!row) {
            return;
        }
        const notratedlabel = await getString('nooutcome', 'grades');
        const notattemptedlabel = await getString('outcomesreportnotattempted', 'mod_interactivevideo');
        const title = row.fullname || await getString('outcomes', 'grades');

        await showModal(ModalFactory, title, learnerHtml(row, definitions, notratedlabel, notattemptedlabel));
    });
};
