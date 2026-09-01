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
     * @var string Config key holding the time the license server last confirmed this component.
     *
     * Mirrors the iv_activation cache entry into config on purpose. The cache is what a site
     * admin purges, and losing it must not make paid content stop working; config survives.
     */
    public const CONFIG_CONFIRMED = 'activationconfirmed';

    /** @var string Config key on mod_interactivevideo holding the discovered paid components. */
    public const CONFIG_PAIDCOMPONENTS = 'paidcomponents';

    /**
     * @var int Seconds a stored confirmation stays good for.
     *
     * Refreshed by the licensing scheduled task, so this only expires on a site whose cron has
     * been dead for a month.
     */
    private const CONFIRM_MAX_AGE = 2592000;

    /**
     * @var int Seconds a component whose activation has never been confirmed on this site may
     * still be used while the background confirmation is pending.
     */
    private const GRACE_MAX = 1209600;

    /** @var string Cache key suffix marking when grace started for a component. */
    private const GRACE_SUFFIX = '__grace';

    /**
     * @var int Seconds to wait before contacting the license server again for a component
     * whose repair just failed. Repair runs once per installed paid content type while an
     * admin page renders, so without this a down license server costs one timeout per
     * component on every single page load.
     */
    private const REPAIR_BACKOFF = 900;

    /** @var string Cache key marking the license server itself as unreachable. */
    private const UPSTREAM_BACKOFF_KEY = 'ivlicenseupstreamdown';

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

        // An explicit activation attempt always reaches the license server, even if a
        // background repair for this component failed recently.
        self::clear_repair_backoff($component);

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
        // Also drop the mirrored confirmation and any grace, or the component would stay usable
        // until the confirmation aged out.
        unset_config(self::CONFIG_CONFIRMED, $component);
        self::purge_cache($component);
        self::clear_grace($component);
        self::clear_repair_backoff($component);

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
     * Record that a component is a paid content type.
     *
     * Called from {@see \mod_interactivevideo\admin_setting_ivpurchaseemail}, because registering
     * that setting is what a paid plugin does and nothing else does it. Stored in config rather
     * than in the cache so purging caches cannot lose it, and so a plugin that later stops
     * declaring the setting stays known-paid on a site that has already seen it.
     *
     * @param string $component Plugin component.
     */
    public static function note_paid_component(string $component): void {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '' || during_initial_install()) {
            return;
        }

        $known = self::get_paid_components();
        if (in_array($component, $known, true)) {
            // Already recorded; do not write on every admin page render.
            return;
        }

        $known[] = $component;
        sort($known);
        set_config(self::CONFIG_PAIDCOMPONENTS, implode(',', $known), 'mod_interactivevideo');
    }

    /**
     * Paid components discovered on this site.
     *
     * @return array List of component names.
     */
    public static function get_paid_components(): array {
        $stored = (string) get_config('mod_interactivevideo', self::CONFIG_PAIDCOMPONENTS);
        if (trim($stored) === '') {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $stored))));
    }

    /**
     * Whether a component is a paid content type.
     *
     * The union of two independent markers: the plugin declaring a purchase email setting, and the
     * catalog classifying it as paid. Either alone is enough, so a stale, unreachable or locally
     * edited catalog cannot on its own make a paid type look free.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    public static function is_paid(string $component): bool {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return false;
        }

        if (in_array($component, self::get_paid_components(), true)) {
            return true;
        }

        // Local lookup only: the enforcement path must never wait on the catalog being fetched.
        return plugins_catalog::get_component_type_local($component) === 'paid';
    }

    /**
     * Whether a content type may be used on this site right now.
     *
     * This is the enforcement question, as opposed to {@see self::is_active()}, which reports
     * strictly whether the license server's answer is currently held. It never touches the
     * network: it runs on the player, the editor and every course page listing activities.
     *
     * A free content type is always usable. A paid one needs a validationhash that still matches
     * the stored purchase email, plus evidence the license server issued it — either the cache
     * entry, or the confirmation mirrored into config, or an unexpired grace window while the
     * background confirmation is pending.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    public static function is_usable(string $component): bool {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return false;
        }

        if (!self::is_paid($component)) {
            return true;
        }

        $confighash = strtolower(trim((string) get_config($component, self::CONFIG_HASHKEY)));
        $email = self::find_purchase_email($component);
        if ($confighash === '' || $email === null) {
            return false;
        }

        if (!self::is_config_active($component, $confighash, $email)) {
            return false;
        }

        if (self::is_cache_active($component, $confighash) || self::is_confirmed_recently($component)) {
            return true;
        }

        return self::is_in_grace($component);
    }

    /**
     * Whether config still remembers a recent license server confirmation.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    private static function is_confirmed_recently(string $component): bool {
        $confirmed = (int) get_config($component, self::CONFIG_CONFIRMED);

        return $confirmed > 0 && (time() - $confirmed) < self::CONFIRM_MAX_AGE;
    }

    /**
     * Whether a component is inside its grace window, opening one if it has none.
     *
     * Grace can only ever extend an activation the license server already granted, because
     * reaching here requires a validationhash that matches the stored purchase email. It cannot
     * manufacture one.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    private static function is_in_grace(string $component): bool {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $key = $component . self::GRACE_SUFFIX;
        $since = $cache->get($key);

        if (empty($since)) {
            $cache->set($key, time());
            self::queue_confirmation($component);
            return true;
        }

        return (time() - (int) $since) < self::GRACE_MAX;
    }

    /**
     * Error codes that mean the license server positively refused this activation.
     *
     * Anything not listed here — an unreachable server, rate limiting, a malformed request, a
     * clock skew rejection — is treated as inconclusive and must not revoke a working license.
     *
     * @return array
     */
    public static function refusal_error_codes(): array {
        return ['not_registered', 'purchase_not_found', 'purchase_refunded', 'quantity_exceeded'];
    }

    /**
     * Drop a component's activation locally, without contacting the license server.
     *
     * Used when the server has already told us the activation is not valid, so there is nothing
     * to unregister. {@see self::deactivate()} is the interactive path and does call the server.
     *
     * @param string $component Plugin component.
     */
    public static function revoke_locally(string $component): void {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return;
        }

        unset_config(self::CONFIG_HASHKEY, $component);
        unset_config(self::CONFIG_CONFIRMED, $component);
        self::purge_cache($component);
        self::clear_grace($component);
    }

    /**
     * Clear the grace marker for a component.
     *
     * @param string $component Plugin component.
     */
    public static function clear_grace(string $component): void {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cache->delete($component . self::GRACE_SUFFIX);
    }

    /**
     * Queue a background re-confirmation with the license server.
     *
     * @param string $component Plugin component.
     */
    public static function queue_confirmation(string $component): void {
        if (during_initial_install()) {
            return;
        }

        $task = new \mod_interactivevideo\task\confirm_activation();
        $task->set_custom_data(['component' => $component]);
        // Deduplicated, so a burst of requests after a cache purge queues one task per component.
        \core\task\manager::queue_adhoc_task($task, true);
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

        // A repair that just failed is not retried on the next page render.
        if (self::repair_is_backed_off($component)) {
            return $inactive;
        }

        $result = self::activate($component, $email);
        if (empty($result['success'])) {
            self::note_repair_failure($component, (string) ($result['errorcode'] ?? ''));
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

        // Mirror the server's answer into config. The cache is what an admin purges, and losing
        // it must not make activated content stop working.
        set_config(self::CONFIG_CONFIRMED, time(), $component);
        self::clear_grace($component);
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

    /**
     * Cache key holding the time a failed repair may next be retried.
     *
     * Shares the iv_activation cache; the suffix keeps it clear of the component's own
     * activation entry, which purge_cache() removes independently.
     *
     * @param string $component Plugin component.
     * @return string
     */
    private static function repair_backoff_key(string $component): string {
        return $component . '__repairfailed';
    }

    /**
     * Whether a failed repair is still within its backoff window.
     *
     * Two windows apply. A transport failure means the license server itself is
     * unreachable, so every component is suppressed: the caller loops over each installed
     * paid content type, and without this the first unreachable render would pay one
     * connection timeout per component. Any other failure is specific to the component
     * and suppresses only that one.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    private static function repair_is_backed_off(string $component): bool {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');

        $upstream = $cache->get(self::UPSTREAM_BACKOFF_KEY);
        if (!empty($upstream) && (int) $upstream > time()) {
            return true;
        }

        $retryafter = $cache->get(self::repair_backoff_key($component));

        return !empty($retryafter) && (int) $retryafter > time();
    }

    /**
     * Record that a repair failed, suppressing retries until the backoff expires.
     *
     * @param string $component Plugin component.
     * @param string $errorcode Error code returned by the license client.
     */
    private static function note_repair_failure(string $component, string $errorcode = ''): void {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $retryafter = time() + self::REPAIR_BACKOFF;

        $cache->set(self::repair_backoff_key($component), $retryafter);

        if ($errorcode === 'upstream_error') {
            // The license server could not be reached, so stop trying for every component.
            $cache->set(self::UPSTREAM_BACKOFF_KEY, $retryafter);
        }
    }

    /**
     * Clear the repair backoff so the next attempt contacts the license server.
     *
     * @param string $component Plugin component.
     */
    private static function clear_repair_backoff(string $component): void {
        $cache = \cache::make('mod_interactivevideo', 'iv_activation');
        $cache->delete(self::repair_backoff_key($component));
        $cache->delete(self::UPSTREAM_BACKOFF_KEY);
    }
}
