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
 * BMC license proxy client for content type activation.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class registration_client {
    /**
     * Register an activation with the license server.
     *
     * @param string $component Plugin component.
     * @param string $email Normalized purchase email.
     * @return array{success: bool, hashkey?: string, error?: string, errorcode?: string}
     */
    public static function register(string $component, string $email): array {
        self::init();
        if (!defined('IV_LICENSE_PROXY') || IV_LICENSE_PROXY === '') {
            return self::failure('not_configured');
        }
        if (!defined('IV_REGISTRATION_PUBLICKEY') || IV_REGISTRATION_PUBLICKEY === '') {
            return self::failure('not_configured');
        }

        global $CFG;

        $sitename = self::normalize_sitename($CFG->wwwroot);
        $component = clean_param($component, PARAM_COMPONENT);
        $email = self::normalize_email($email);
        if ($sitename === '' || $component === '' || $email === null) {
            return self::failure('invalid_payload');
        }

        $date = time();
        $hash = self::build_request_hmac($sitename, $component, $email, $date, IV_REGISTRATION_PUBLICKEY);

        return self::post_json(IV_LICENSE_PROXY, [
            'sitename' => $sitename,
            'component' => $component,
            'email' => $email,
            'date' => $date,
            'hash' => $hash,
        ]);
    }

    /**
     * Unregister an activation with the license server.
     *
     * @param string $component Plugin component.
     * @param string $email Normalized purchase email.
     * @param string $hashkey Stored activation hashkey.
     * @return array{success: bool, error?: string, errorcode?: string}
     */
    public static function unregister(string $component, string $email, string $hashkey): array {
        self::init();
        if (!defined('IV_LICENSE_PROXY') || IV_LICENSE_PROXY === '') {
            return self::failure('not_configured');
        }

        global $CFG;

        $sitename = self::normalize_sitename($CFG->wwwroot);
        $component = clean_param($component, PARAM_COMPONENT);
        $email = self::normalize_email($email);
        $hashkey = strtolower(trim($hashkey));

        if ($sitename === '' || $component === '' || $email === null || $hashkey === '') {
            return self::failure('invalid_payload');
        }

        $url = IV_LICENSE_PROXY;
        if (str_contains($url, '?')) {
            $url .= '&action=unregister';
        } else {
            $url .= '?action=unregister';
        }

        $result = self::post_json($url, [
            'sitename' => $sitename,
            'component' => $component,
            'email' => $email,
            'hash' => $hashkey,
        ]);

        if (self::unregister_succeeded($result)) {
            return ['success' => true];
        }

        return $result;
    }

    /**
     * Whether unregister succeeded or the activation is already absent on the server.
     *
     * @param array $result Unregister response.
     * @return bool True when unregister succeeded or the activation was already absent.
     */
    protected static function unregister_succeeded(array $result): bool {
        if (!empty($result['success'])) {
            return true;
        }

        return ($result['errorcode'] ?? '') === 'not_registered';
    }

    /**
     * Build the activation hashkey for a site, component, and email.
     *
     * @param string $component Plugin component.
     * @param string $email Normalized purchase email.
     * @return string
     */
    public static function build_activation_hashkey(string $component, string $email): string {
        self::init();
        global $CFG;

        if (!defined('IV_REGISTRATION_PUBLICKEY') || IV_REGISTRATION_PUBLICKEY === '') {
            return '';
        }

        $sitename = self::normalize_sitename($CFG->wwwroot);
        $component = clean_param($component, PARAM_COMPONENT);
        $email = self::normalize_email($email) ?? '';

        return self::hmac(
            self::build_activation_message($sitename, $component, $email),
            IV_REGISTRATION_PUBLICKEY
        );
    }

    /**
     * Normalize a client site URL for signing.
     *
     * @param string $sitename Raw site URL.
     * @return string
     */
    public static function normalize_sitename(string $sitename): string {
        $sitename = trim(strtolower($sitename));
        if ($sitename === '') {
            return '';
        }

        if (!str_contains($sitename, '://')) {
            $sitename = 'https://' . $sitename;
        }

        $parts = parse_url($sitename);
        if ($parts === false || empty($parts['host'])) {
            return rtrim($sitename, '/');
        }

        $scheme = $parts['scheme'] ?? 'https';
        $host = $parts['host'];
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        $path = isset($parts['path']) ? rtrim($parts['path'], '/') : '';

        return $scheme . '://' . $host . $port . $path;
    }

    /**
     * Normalize a purchase email.
     *
     * @param string $email Raw email.
     * @return string|null
     */
    public static function normalize_email(string $email): ?string {
        $email = clean_param(trim($email), PARAM_EMAIL);
        if ($email === '') {
            return null;
        }

        return strtolower($email);
    }

    /**
     * Build the request signing message.
     *
     * @param string $sitename Normalized site URL.
     * @param string $component Plugin component.
     * @param string $email Normalized email.
     * @param int $date Unix timestamp.
     * @return string
     */
    protected static function build_request_message(
        string $sitename,
        string $component,
        string $email,
        int $date
    ): string {
        return implode('|', [$sitename, $component, $email, (string) $date]);
    }

    /**
     * Build the activation hash message.
     *
     * @param string $sitename Normalized site URL.
     * @param string $component Plugin component.
     * @param string $email Normalized email.
     * @return string
     */
    protected static function build_activation_message(string $sitename, string $component, string $email): string {
        return implode('|', [$sitename, $component, $email]);
    }

    /**
     * Build a request HMAC.
     *
     * @param string $sitename Normalized site URL.
     * @param string $component Plugin component.
     * @param string $email Normalized email.
     * @param int $date Unix timestamp.
     * @param string $secret Shared secret.
     * @return string
     */
    protected static function build_request_hmac(
        string $sitename,
        string $component,
        string $email,
        int $date,
        string $secret
    ): string {
        return self::hmac(self::build_request_message($sitename, $component, $email, $date), $secret);
    }

    /**
     * Compute HMAC-SHA256 hex digest.
     *
     * @param string $message Message to sign.
     * @param string $secret Shared secret.
     * @return string
     */
    protected static function hmac(string $message, string $secret): string {
        return hash_hmac('sha256', $message, $secret);
    }

    /**
     * POST JSON to the license proxy and parse the response.
     *
     * @param string $url Request URL.
     * @param array $payload Request body.
     * @return array{success: bool, hashkey?: string, error?: string, errorcode?: string}
     */
    protected static function post_json(string $url, array $payload): array {
        if (!function_exists('curl_init')) {
            return self::failure('upstream_error');
        }

        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);

        $body = curl_exec($curl);
        $errno = curl_errno($curl);
        curl_close($curl);

        if ($errno || $body === false || trim((string) $body) === '') {
            return self::failure('upstream_error');
        }

        $response = json_decode($body, true);
        if (!is_array($response)) {
            return self::failure('upstream_error');
        }

        if (($response['status'] ?? '') === 'ok') {
            return [
                'success' => true,
                'hashkey' => (string) ($response['hashkey'] ?? ''),
            ];
        }

        return self::failure((string) ($response['error'] ?? 'upstream_error'));
    }

    /**
     * Build a failure result array.
     *
     * @param string $code Error code from the license server.
     * @return array{success: bool, error: string, errorcode: string}
     */
    protected static function failure(string $code): array {
        return [
            'success' => false,
            'error' => contenttype_activation::error_message($code),
            'errorcode' => $code,
        ];
    }

    /**
     * Load license constants when needed.
     */
    protected static function init(): void {
        global $CFG;
        if (!defined('IV_LICENSE_PROXY')) {
            require_once($CFG->dirroot . '/mod/interactivevideo/locallib.php');
        }
    }
}
