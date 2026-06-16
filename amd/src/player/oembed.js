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
 * Server-side oEmbed fetch helper.
 *
 * @module     mod_interactivevideo/player/oembed
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';

/**
 * Fetch JSON from an oEmbed URL through Moodle.
 *
 * @param {string} url The provider oEmbed URL.
 * @return {Promise<Object>}
 */
const fetchOembed = async(url) => {
    const response = await $.ajax({
        url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
        type: 'POST',
        dataType: 'text',
        data: {
            action: 'get_from_url',
            contextid: M.cfg.contextid,
            url,
            sesskey: M.cfg.sesskey,
        }
    });

    if (typeof response === 'string') {
        return JSON.parse(response);
    }

    return response;
};

export default fetchOembed;
