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

use mod_interactivevideo\local\contenttype_activation;

/**
 * Purchase email admin setting with BMC registration validation.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class admin_setting_ivpurchaseemail extends \admin_setting_configtext {
    /** @var string Target plugin component for activation. */
    protected $component;

    /**
     * Constructor.
     *
     * Short form: (name, component, default='', size=null)
     * Legacy form: (name, visiblename, description, default, component, size=null)
     * Legacy form without component: (name, visiblename, description, default) — component inferred from name.
     *
     * @param string $name Setting name, e.g. local_ivform/purchaseemail.
     * @param string $second Plugin component (short form) or visible name (legacy form).
     * @param string $third Default value (short form) or description (legacy form).
     * @param mixed $fourth Field size (short form) or default value (legacy form).
     * @param string|null $fifth Plugin component (legacy form).
     * @param int|null $sixth Field size (legacy form).
     */
    public function __construct(
        $name,
        $second,
        $third = '',
        $fourth = null,
        $fifth = null,
        $sixth = null
    ) {
        $visiblename = get_string('purchaseemail', 'mod_interactivevideo');
        $description = get_string('purchaseemail_desc', 'mod_interactivevideo');
        $defaultsetting = '';
        $size = null;

        if ($fifth !== null && self::looks_like_component($fifth)) {
            $visiblename = (string) $second;
            $description = (string) $third;
            $defaultsetting = (string) $fourth;
            $component = (string) $fifth;
            $size = self::normalize_size($sixth);
        } else if (self::looks_like_component($second)) {
            $component = (string) $second;
            $defaultsetting = (string) $third;
            $size = self::normalize_size($fourth);
        } else {
            $visiblename = (string) $second;
            $description = (string) $third;
            $defaultsetting = (string) $fourth;
            $component = self::component_from_setting_name($name);
        }

        $this->component = clean_param($component, PARAM_COMPONENT);
        parent::__construct(
            $name,
            $visiblename,
            $description,
            $defaultsetting,
            PARAM_EMAIL,
            $size
        );
    }

    /**
     * Whether a value looks like a Moodle plugin component name.
     *
     * @param mixed $value
     * @return bool
     */
    protected static function looks_like_component($value): bool {
        if (!is_string($value) || $value === '') {
            return false;
        }
        return (bool) preg_match('/^(local|ivplugin|block|mod|tiny)_[a-z][a-z0-9_]*$/', $value);
    }

    /**
     * Derive plugin component from a plugin setting name.
     *
     * @param string $name Setting name, e.g. local_ivform/purchaseemail.
     * @return string
     */
    protected static function component_from_setting_name($name): string {
        $parts = explode('/', (string) $name, 2);
        return $parts[0];
    }

    /**
     * Normalize an optional admin text field size.
     *
     * @param mixed $size
     * @return int|null
     */
    protected static function normalize_size($size): ?int {
        if ($size === null || $size === '') {
            return null;
        }
        if (is_int($size)) {
            return $size;
        }
        if (is_numeric($size)) {
            return (int) $size;
        }
        return null;
    }

    /**
     * Validate and register the purchase email with the license server.
     *
     * @param string $data Submitted email.
     * @return bool|string
     */
    public function validate($data) {
        $data = trim((string) $data);
        if ($data === '') {
            return true;
        }

        $parent = parent::validate($data);
        if ($parent !== true) {
            return $parent;
        }

        $result = contenttype_activation::activate($this->component, $data);
        if (!$result['success']) {
            return $result['error'] ?? contenttype_activation::error_message('upstream_error');
        }

        return true;
    }

    /**
     * Save the email and deactivate when cleared.
     *
     * @param string $data Submitted email.
     * @return string Empty string on success, error message otherwise.
     */
    public function write_setting($data) {
        $data = trim((string) $data);

        if ($data === '') {
            $result = contenttype_activation::deactivate($this->component);
            if (!$result['success']) {
                return $result['error'] ?? contenttype_activation::error_message('upstream_error');
            }
        }

        return parent::write_setting($data);
    }
}
