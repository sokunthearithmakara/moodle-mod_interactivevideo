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
    protected string $component;

    /**
     * Constructor.
     *
     * @param string $name Setting name, e.g. local_ivform/purchaseemail.
     * @param string $component Plugin component to activate, e.g. local_ivform.
     * @param string $defaultsetting Default value.
     * @param int|null $size Field size.
     */
    public function __construct(
        string $name,
        string $component,
        string $defaultsetting = '',
        ?int $size = null
    ) {
        $this->component = clean_param($component, PARAM_COMPONENT);
        parent::__construct(
            $name,
            get_string('purchaseemail', 'mod_interactivevideo'),
            get_string('purchaseemail_desc', 'mod_interactivevideo'),
            $defaultsetting,
            PARAM_EMAIL,
            $size
        );
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
