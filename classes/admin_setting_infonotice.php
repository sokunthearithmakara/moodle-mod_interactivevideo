<?php
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

namespace mod_interactivevideo;

/**
 * Full-width admin info notice (Bootstrap alert).
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class admin_setting_infonotice extends \admin_setting_description {
    /**
     * Render a full-width info alert across the settings page.
     *
     * @param mixed $data Unused.
     * @param string $query Search query for highlighting.
     * @return string HTML fragment.
     */
    public function output_html($data, $query = '') {
        $notice = $this->description;
        if ($query !== '') {
            $notice = highlight($query, $notice);
        }

        $heading = trim((string) $this->visiblename);
        $headerhtml = '';
        if ($heading !== '') {
            $headerhtml = '<div class="alert-heading h6 mb-2 fw-bold">'
                . '<i class="fa fa-bell fa-fw me-2" aria-hidden="true"></i>'
                . $heading
                . '</div>';
        }

        return '<div class="form-item row iv-admin-infonotice mb-3">'
            . '<div class="col-12">'
            . '<div class="alert alert-info mb-0">' . $headerhtml . $notice . '</div>'
            . '</div>'
            . '</div>';
    }
}
