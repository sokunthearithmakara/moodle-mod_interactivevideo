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
 * Builds the per-viewer VdoCipher OTP request.
 *
 * VdoCipher authorises playback with an OTP that the site's server requests from the VdoCipher
 * API. Everything that identifies the viewer to VdoCipher travels in that request: the dynamic
 * watermark is the `annotate` field, and there is no other place to set it. So the OTP has to be
 * minted for the user who is about to watch, every time the player loads, rather than once at
 * authoring time and shared by everyone.
 *
 * The watermark statement follows VdoCipher's annotation syntax
 * ({@link https://www.vdocipher.com/docs/server/playbackauth/anno/}) and the placeholder
 * vocabulary of the official filter_vdocipher plugin, so a site can paste the same statement
 * into both plugins: `{name}`, `{email}`, `{username}`, `{id}`, `{ip}` and `{date.FORMAT}`,
 * where FORMAT is a PHP date() format.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class vdocipher_otp {
    /**
     * How long a minted OTP stays redeemable, in seconds.
     *
     * The player redeems it as soon as the page loads and only falls back to it again when a
     * later play() call fails, so an hour is generous. VdoCipher's own default is six hours.
     *
     * @var int
     */
    public const TTL = 3600;

    /**
     * The JSON body of the OTP request for one viewer.
     *
     * @param \stdClass $user The viewer, as loaded in $USER.
     * @param string $annotate The watermark statement with placeholders, or '' for no watermark.
     * @param string $ip The viewer's address for the `{ip}` placeholder.
     * @return array Payload ready for json_encode(): `ttl`, plus `annotate` when configured.
     */
    public static function build_payload(\stdClass $user, string $annotate, string $ip = ''): array {
        $payload = ['ttl' => self::TTL];
        if (trim($annotate) !== '') {
            // VdoCipher expects the statement serialised as a string inside the JSON body.
            $payload['annotate'] = self::render_annotate($annotate, $user, $ip);
        }
        return $payload;
    }

    /**
     * Fills the viewer's details into a watermark statement.
     *
     * Values are escaped so a quote or backslash in a user's name cannot end the string literal
     * it is written into. Placeholders this class does not know are left in place, so a typo is
     * visible on screen rather than silently dropped.
     *
     * @param string $template The statement with placeholders.
     * @param \stdClass $user The viewer.
     * @param string $ip The viewer's address.
     * @return string
     */
    public static function render_annotate(string $template, \stdClass $user, string $ip = ''): string {
        $values = [
            '{name}' => fullname($user),
            '{email}' => (string) $user->email,
            '{username}' => (string) $user->username,
            '{id}' => (string) $user->id,
            '{ip}' => $ip,
        ];
        $escaped = array_map(function (string $value): string {
            return addcslashes($value, "\\'\"");
        }, $values);

        $rendered = str_replace(array_keys($escaped), array_values($escaped), $template);

        return preg_replace_callback('/\{date\.([^}]+)\}/', function (array $matches): string {
            return date($matches[1]);
        }, $rendered);
    }
}
