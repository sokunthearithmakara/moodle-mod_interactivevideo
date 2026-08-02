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
 * Activate and deactivate Interactive Video content type plugins.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class contenttype_activation {
    /** @var string Config key for the stored activation hashkey. */
    public const CONFIG_HASHKEY = 'validationhash';

    /**
     * Register a content type plugin activation.
     *
     * @param string $component Plugin component.
     * @param string $email Purchase email.
     * @return array{success: bool, hashkey?: string, error?: string, errorcode?: string}
     */
    public static function activate(string $component, string $email): array {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return [
                'success' => false,
                'error' => self::error_message('invalid_payload'),
                'errorcode' => 'invalid_payload',
            ];
        }

        $result = registration_client::register($component, $email);
        if (!$result['success']) {
            return $result;
        }

        $hashkey = (string) ($result['hashkey'] ?? '');
        if ($hashkey === '') {
            return [
                'success' => false,
                'error' => self::error_message('upstream_error'),
                'errorcode' => 'upstream_error',
            ];
        }

        set_config(self::CONFIG_HASHKEY, $hashkey, $component);

        $normalizedemail = registration_client::normalize_email($email) ?? '';
        self::set_cache($component, $hashkey, $normalizedemail);

        return [
            'success' => true,
            'hashkey' => $hashkey,
        ];
    }

    /**
     * Remove a content type plugin activation.
     *
     * @param string $component Plugin component.
     * @return array{success: bool, error?: string, errorcode?: string}
     */
    public static function deactivate(string $component): array {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return [
                'success' => false,
                'error' => self::error_message('invalid_payload'),
                'errorcode' => 'invalid_payload',
            ];
        }

        $hashkey = (string) get_config($component, self::CONFIG_HASHKEY);
        $email = self::find_purchase_email($component);

        if ($hashkey !== '' && $email !== null) {
            $result = registration_client::unregister($component, $email, $hashkey);
            if (!$result['success']) {
                return $result;
            }
        } else if ($hashkey !== '') {
            return [
                'success' => false,
                'error' => self::error_message('invalid_payload'),
                'errorcode' => 'invalid_payload',
            ];
        }

        unset_config(self::CONFIG_HASHKEY, $component);
        self::purge_cache($component);

        return ['success' => true];
    }

    /**
     * Whether a content type plugin is activated (read-only, no license-server repair).
     *
     * @param string $component Plugin component.
     * @return bool
     */
    public static function is_active(string $component): bool {
        $status = self::ensure_activation($component, false);
        return !empty($status['active']);
    }

    /**
     * Resolve activation status and optionally repair missing iv_activation cache entries.
     *
     * Use this from modal UI, admin settings, or anywhere activation state may need rebuilding
     * after cache purges.
     *
     * @param string $component Plugin component.
     * @param bool $repair When true, re-register with BMC to repopulate cache and config hash.
     * @return array{active: bool, cacheactive: bool, configactive: bool, repaired: bool}
     */
    public static function ensure_activation(string $component, bool $repair = true): array {
        $status = self::get_activation_status($component, $repair);

        return [
            'active' => !empty($status['active']),
            'cacheactive' => !empty($status['cacheactive']),
            'configactive' => !empty($status['configactive']),
            'repaired' => !empty($status['repaired']),
        ];
    }

    /**
     * Re-register activation with the license server using the stored purchase email.
     *
     * @param string $component Plugin component.
     * @return array{success: bool, hashkey?: string, error?: string, errorcode?: string}
     */
    public static function reregister(string $component): array {
        $email = self::find_purchase_email($component);
        if ($email === null) {
            return [
                'success' => false,
                'error' => self::error_message('invalid_payload'),
                'errorcode' => 'invalid_payload',
            ];
        }

        return self::activate($component, $email);
    }

    /**
     * Resolve activation status from iv_activation cache and component validationhash.
     *
     * Active only when the stored validationhash matches the purchase email locally AND the
     * iv_activation cache holds the same hash from a prior successful BMC registration.
     * Missing or stale cache entries are never rebuilt from config alone; use repair to recall BMC.
     *
     * @param string $component Plugin component.
     * @param bool $attemptrepair When true, re-register with BMC to repopulate cache and config hash.
     * @return array{cacheactive: bool, configactive: bool, active: bool, repaired: bool}
     */
    public static function get_activation_status(string $component, bool $attemptrepair = false): array {
        $component = clean_param($component, PARAM_COMPONENT);
        $inactive = [
            'cacheactive' => false,
            'configactive' => false,
            'active' => false,
            'repaired' => false,
        ];

        if ($component === '') {
            return $inactive;
        }

        $confighash = strtolower(trim((string) get_config($component, self::CONFIG_HASHKEY)));
        $email = self::find_purchase_email($component);

        if ($confighash === '') {
            self::purge_cache($component);
            if ($attemptrepair && $email !== null) {
                return self::repair_activation_from_bmc($component, $email);
            }
            return $inactive;
        }

        if ($email === null) {
            self::purge_cache($component);
            return $inactive;
        }

        $configactive = self::is_config_active($component, $confighash, $email);
        if (self::get_cache($component) !== null && !self::is_cache_active($component, $confighash)) {
            self::purge_cache($component);
        }
        $cacheactive = self::is_cache_active($component, $confighash);

        if ($configactive && $cacheactive) {
            return [
                'cacheactive' => true,
                'configactive' => true,
                'active' => true,
                'repaired' => false,
            ];
        }

        if ($cacheactive && !$configactive) {
            self::purge_cache($component);
        }

        if ($attemptrepair) {
            return self::repair_activation_from_bmc($component, $email);
        }

        return [
            'cacheactive' => false,
            'configactive' => $configactive,
            'active' => false,
            'repaired' => false,
        ];
    }

    /**
     * Re-register with BMC and rebuild iv_activation cache from the server response.
     *
     * @param string $component Plugin component.
     * @param string $email Normalized purchase email.
     * @return array{cacheactive: bool, configactive: bool, active: bool, repaired: bool}
     */
    private static function repair_activation_from_bmc(string $component, string $email): array {
        $inactive = [
            'cacheactive' => false,
            'configactive' => false,
            'active' => false,
            'repaired' => false,
        ];

        $result = self::activate($component, $email);
        if (empty($result['success'])) {
            return $inactive;
        }

        $confighash = strtolower(trim((string) get_config($component, self::CONFIG_HASHKEY)));
        $configactive = self::is_config_active($component, $confighash, $email);
        $cacheactive = self::is_cache_active($component, $confighash);

        if (!$configactive || !$cacheactive) {
            return $inactive;
        }

        return [
            'cacheactive' => true,
            'configactive' => true,
            'active' => true,
            'repaired' => true,
        ];
    }

    /**
     * Whether the iv_activation cache entry is valid for the component.
     *
     * @param string $component Plugin component.
     * @param string $confighash Normalized validationhash from config.
     * @return bool
     */
    private static function is_cache_active(string $component, string $confighash): bool {
        $cached = self::get_cache($component);
        if ($cached === null || empty($cached->active) || empty($cached->hashkey)) {
            return false;
        }

        return hash_equals($confighash, strtolower((string) $cached->hashkey));
    }

    /**
     * Whether validationhash in config matches the purchase email locally.
     *
     * @param string $component Plugin component.
     * @param string $confighash Normalized validationhash from config.
     * @param string|null $email Normalized purchase email.
     * @return bool
     */
    private static function is_config_active(string $component, string $confighash, ?string $email): bool {
        if ($email === null) {
            return false;
        }

        $expected = registration_client::build_activation_hashkey($component, $email);
        if ($expected === '') {
            return false;
        }

        return hash_equals($expected, $confighash);
    }

    /**
     * Map a license server error code to a lang string.
     *
     * @param string $code Error code.
     * @return string
     */
    public static function error_message(string $code): string {
        $stringid = 'activationerror_' . $code;
        if (get_string_manager()->string_exists($stringid, 'mod_interactivevideo')) {
            return get_string($stringid, 'mod_interactivevideo');
        }

        return get_string('activationerror_generic', 'mod_interactivevideo');
    }

    /**
     * Find the purchase email stored for a component.
     *
     * @param string $component Plugin component.
     * @return string|null
     */
    protected static function find_purchase_email(string $component): ?string {
        $email = (string) get_config($component, 'purchaseemail');
        return registration_client::normalize_email($email);
    }

    /**
     * Store activation data in the iv_activation cache.
     *
     * @param string $component Plugin component.
     * @param string $hashkey Activation hashkey.
     * @param string $email Normalized purchase email.
     */
    protected static function set_cache(string $component, string $hashkey, string $email): void {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cache->set($component, (object) [
            'component' => $component,
            'hashkey' => $hashkey,
            'email' => $email,
            'active' => true,
            'timemodified' => time(),
        ]);
    }

    /**
     * Read activation data from the iv_activation cache.
     *
     * @param string $component Plugin component.
     * @return \stdClass|null
     */
    protected static function get_cache(string $component): ?\stdClass {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cached = $cache->get($component);
        return $cached ?: null;
    }

    /**
     * Remove activation data from the iv_activation cache.
     *
     * @param string $component Plugin component.
     */
    protected static function purge_cache(string $component): void {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cache->delete($component);
    }
}
