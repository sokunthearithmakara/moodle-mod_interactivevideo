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
 * Shared helpers for report cell reportView strings.
 *
 * @module     mod_interactivevideo/report_view
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Format an XP number the same way the server does.
 *
 * @param {number} xp
 * @returns {string}
 */
export const formatXpNumber = (xp) => {
    const value = Number(xp) || 0;
    if (value % 1 === 0) {
        return String(value);
    }
    return String(Math.round(value * 100) / 100);
};

/**
 * Update the earned XP segment within a stored reportView string (default heuristics).
 *
 * @param {string} reportView
 * @param {number} newXp
 * @returns {string}
 */
export const patchReportViewXp = (reportView, newXp) => {
    if (typeof reportView !== 'string' || reportView === '') {
        return reportView;
    }

    const formatted = formatXpNumber(newXp);

    if (reportView.startsWith('##')) {
        const parts = reportView.split('|');
        const count = parts.length;
        const xpIndex = count >= 5 ? 4 : count - 1;
        parts[xpIndex] = formatted;
        return parts.join('|');
    }

    if (reportView.includes('|')) {
        const parts = reportView.split('|');
        if (parts.length === 6) {
            parts[5] = formatted;
            return parts.join('|');
        }
        if (parts.length >= 2) {
            parts[parts.length - 1] = formatted;
            return parts.join('|');
        }
    }

    return reportView;
};
