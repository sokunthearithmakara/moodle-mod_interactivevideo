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
 * Fetches video provider metadata over HTTP on behalf of the player.
 *
 * The endpoints that relay provider metadata back to the browser must never act as a
 * general purpose HTTP proxy, so every request made here is constrained twice: the
 * target host must appear on a caller-supplied allow list, and the request itself goes
 * through Moodle's \curl wrapper with curl_security_helper left enabled, which re-checks
 * the site blocked-hosts and allowed-ports policy on the initial URL and on every
 * redirect hop.
 *
 * @package    mod_interactivevideo
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class remote_fetcher {
    /** @var int Request and connection timeout in seconds. */
    private const TIMEOUT = 10;

    /** @var int Maximum number of redirects to follow. */
    private const MAXREDIRS = 3;

    /** @var array|null Memoised oEmbed provider host list. */
    private static $oembedhosts = null;

    /**
     * Hosts the plugin is allowed to fetch video metadata from.
     *
     * Every entry corresponds to a provider the plugin supports, either through the
     * player modules (ajax.php's get_from_url action) or through the drag and drop
     * importer in interactivevideo_dndupload_handle(). Entries beginning with '*.' match
     * any subdomain of the remainder; all other entries must match the host exactly.
     *
     * PeerTube is deliberately absent: it is a federated network with no fixed host set,
     * so its fetches go through {@see self::fetch_federated()} instead.
     *
     * @return array List of allowed host patterns.
     */
    public static function get_provider_hosts(): array {
        $hosts = [
            'www.youtube.com',
            'vimeo.com',
            'api.dailymotion.com',
            'fast.wistia.com',
            'sproutvideo.com',
            'rumble.com',
            'kinescope.io',
            'rutube.ru',
            'soundcloud.com',
            'open.spotify.com',
            'video.bunnycdn.com',
            'videos.dyntube.com',
            'www.vdocipher.com',
            'share.vidyard.com',
            'share.viostream.com',
            'api.spotlightr.com',
            'api.gumlet.com',
            // Spotlightr watch/CDN hosts are per-account, e.g. acme.cdn.spotlightr.com.
            '*.cdn.spotlightr.com',
            // Panopto is deployed per institution, e.g. myorg.hosted.panopto.com.
            '*.panopto.com',
            '*.panopto.eu',
        ];
        return array_merge($hosts, self::get_extra_hosts());
    }

    /**
     * Additional hosts an administrator has allowed.
     *
     * Sites running a self-hosted provider on a custom domain (most commonly Panopto)
     * need to name it explicitly rather than have the plugin fetch arbitrary URLs.
     *
     * @return array List of allowed host patterns.
     */
    public static function get_extra_hosts(): array {
        $config = trim((string) get_config('mod_interactivevideo', 'allowedfetchhosts'));
        if ($config === '') {
            return [];
        }
        $hosts = preg_split('/[\s,]+/', $config, -1, PREG_SPLIT_NO_EMPTY);
        return array_map(function ($host) {
            return \core_text::strtolower(trim($host));
        }, $hosts);
    }

    /**
     * Hosts named as oEmbed endpoints by the bundled providers list.
     *
     * The iframe plugin builds its request URL from an entry in providers.json, so that
     * file is the natural allow list for the endpoint that performs the fetch.
     *
     * @return array List of allowed host patterns.
     */
    public static function get_oembed_provider_hosts(): array {
        if (self::$oembedhosts !== null) {
            return self::$oembedhosts;
        }

        self::$oembedhosts = [];
        $path = __DIR__ . '/../../plugins/iframe/providers.json';
        if (!is_readable($path)) {
            return self::$oembedhosts;
        }

        $providers = json_decode((string) file_get_contents($path), true);
        if (!is_array($providers)) {
            return self::$oembedhosts;
        }

        $hosts = [];
        foreach ($providers as $provider) {
            foreach ($provider['endpoints'] ?? [] as $endpoint) {
                if (empty($endpoint['url'])) {
                    continue;
                }
                // Endpoint templates may carry a {format} placeholder, which parse_url copes with.
                $host = parse_url($endpoint['url'], PHP_URL_HOST);
                if ($host) {
                    $hosts[\core_text::strtolower($host)] = true;
                }
            }
        }

        self::$oembedhosts = array_keys($hosts);
        return self::$oembedhosts;
    }

    /**
     * Whether a URL may be fetched.
     *
     * @param string $url The URL to test.
     * @param array $allowedhosts Allowed host patterns.
     * @return bool
     */
    public static function url_is_allowed(string $url, array $allowedhosts): bool {
        $parts = parse_url($url);
        if (empty($parts['host']) || empty($parts['scheme'])) {
            return false;
        }
        if (!in_array(\core_text::strtolower($parts['scheme']), ['http', 'https'], true)) {
            return false;
        }
        // A host with credentials attached is never legitimate here and confuses host comparisons.
        if (isset($parts['user']) || isset($parts['pass'])) {
            return false;
        }
        // No provider is served off a non-standard port, so refuse to be pointed at one.
        if (isset($parts['port']) && !in_array((int) $parts['port'], [80, 443], true)) {
            return false;
        }

        $host = \core_text::strtolower($parts['host']);
        // Strip the trailing dot of a fully qualified name so it cannot dodge the comparison.
        $host = rtrim($host, '.');

        foreach ($allowedhosts as $pattern) {
            $pattern = \core_text::strtolower(trim($pattern));
            if ($pattern === '') {
                continue;
            }
            if (strpos($pattern, '*.') === 0) {
                $suffix = substr($pattern, 1);
                if ($host === substr($suffix, 1) || substr($host, -strlen($suffix)) === $suffix) {
                    return true;
                }
            } else if ($host === $pattern) {
                return true;
            }
        }

        return false;
    }

    /**
     * Fetch a provider URL and return its body.
     *
     * @param string $url The URL to fetch.
     * @param array $allowedhosts Allowed host patterns.
     * @return string The response body, or an empty string if the request failed.
     * @throws \moodle_exception If the URL is not on the allow list.
     */
    public static function fetch(string $url, array $allowedhosts): string {
        if (!self::url_is_allowed($url, $allowedhosts)) {
            throw new \moodle_exception('fetchurlnotallowed', 'mod_interactivevideo');
        }

        return self::request($url);
    }

    /**
     * Fetch a provider URL, returning an empty string rather than throwing.
     *
     * Used where the fetch only enriches a record with a title, poster image or duration.
     * A provider that cannot be reached should leave those fields unset rather than abort
     * the whole operation, which is how these paths behaved before the allow list existed.
     *
     * @param string $url The URL to fetch.
     * @param array $allowedhosts Allowed host patterns.
     * @return string The response body, or an empty string if disallowed or unreachable.
     */
    public static function try_fetch(string $url, array $allowedhosts): string {
        if (!self::url_is_allowed($url, $allowedhosts)) {
            debugging(
                'mod_interactivevideo refused to fetch a URL outside the provider allow list: '
                    . (string) parse_url($url, PHP_URL_HOST),
                DEBUG_DEVELOPER
            );
            return '';
        }

        return self::request($url);
    }

    /**
     * Fetch provider metadata from one of the supported provider hosts.
     *
     * Convenience wrapper over {@see self::try_fetch()} for the common case of a fetch
     * aimed at {@see self::get_provider_hosts()}.
     *
     * @param string $url The URL to fetch.
     * @return string The response body, or an empty string if disallowed or unreachable.
     */
    public static function fetch_provider(string $url): string {
        return self::try_fetch($url, self::get_provider_hosts());
    }

    /**
     * Fetch a URL from a federated provider whose host set cannot be enumerated.
     *
     * PeerTube instances are self-hosted across arbitrary domains, so an allow list is not
     * workable. The request still goes through Moodle's \curl wrapper with the security
     * helper active, which is what keeps a supplied host from resolving to a loopback,
     * link-local or private address, or to a non-web port.
     *
     * @param string $url The URL to fetch.
     * @return string The response body, or an empty string if the request failed.
     */
    public static function fetch_federated(string $url): string {
        $parts = parse_url($url);
        if (empty($parts['host']) || empty($parts['scheme'])) {
            return '';
        }
        if (!in_array(\core_text::strtolower($parts['scheme']), ['http', 'https'], true)) {
            return '';
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            return '';
        }
        if (isset($parts['port']) && !in_array((int) $parts['port'], [80, 443], true)) {
            return '';
        }

        return self::request($url);
    }

    /**
     * Perform the HTTP request itself.
     *
     * @param string $url The URL to fetch.
     * @return string The response body, or an empty string if the request failed.
     */
    private static function request(string $url): string {
        global $CFG;
        require_once($CFG->libdir . '/filelib.php');

        // No 'ignoresecurity' here: curl_security_helper must stay active so the site's
        // blocked hosts and allowed ports apply, including across redirects.
        $curl = new \curl();
        // Some providers return oEmbed JSON while others are scraped for their og: meta
        // tags, so the request must not insist on JSON: doing so makes the HTML providers
        // content-negotiate down to a short error document instead of the page.
        $curl->setHeader('Accept: application/json, text/html;q=0.9, */*;q=0.8');
        $response = $curl->get($url, [], [
            'CURLOPT_TIMEOUT' => self::TIMEOUT,
            'CURLOPT_CONNECTTIMEOUT' => self::TIMEOUT,
            'CURLOPT_FOLLOWLOCATION' => 1,
            'CURLOPT_MAXREDIRS' => self::MAXREDIRS,
        ]);

        // A URL rejected by the security helper returns the block message as the body with
        // an empty info array, so require a real 200 before relaying anything to the browser.
        if ($curl->get_errno() || empty($curl->info['http_code']) || $curl->info['http_code'] != 200) {
            return '';
        }

        return (string) $response;
    }
}
