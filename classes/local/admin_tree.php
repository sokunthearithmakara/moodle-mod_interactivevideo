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

namespace mod_interactivevideo\local;

/**
 * Admin tree helpers for Interactive Video and its content type plugins.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class admin_tree {
    /**
     * Ensure the Interactive Video admin folder and content types category exist.
     *
     * Local content type plugins attach settings under modivcontenttype. That
     * category is normally created from mod/interactivevideo/settings.php, but
     * that file is skipped while Interactive Video has a pending upgrade.
     *
     * @param \admin_root $admin Admin tree root.
     */
    public static function ensure_contenttype_category(\admin_root $admin): void {
        if ($admin->locate('modivcontenttype') !== null) {
            return;
        }

        $pluginman = \core_plugin_manager::instance();
        $iv = $pluginman->get_plugin_info('mod_interactivevideo');
        if ($iv === null) {
            return;
        }

        $hidden = ($iv->is_enabled() === false);

        if ($admin->locate('modivfolder') === null) {
            $admin->add('modsettings', new \admin_category(
                'modivfolder',
                get_string('pluginname', 'mod_interactivevideo'),
                $hidden
            ));
        }

        $admin->add('modivfolder', new \admin_category(
            'modivcontenttype',
            get_string('contenttype', 'mod_interactivevideo'),
            $hidden
        ));
    }
}
