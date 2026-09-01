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
 * Fetch, cache, and enrich the external content types catalog.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class plugins_catalog {
    /** @var string Remote plugins catalog URL */
    private const REMOTE_URL =
        'https://raw.githubusercontent.com/sokunthearithmakara/moodle-mod_interactivevideo/refs/heads/main/plugins.json';

    /** @var string Moodle cache key for the full catalog payload. */
    private const CACHE_KEY = 'catalog';

    /** @var string Interactive Video target module name */
    public const TARGET_INTERACTIVEVIDEO = 'mod_interactivevideo';

    /** @var string Flexbook target module name */
    public const TARGET_FLEXBOOK = 'mod_flexbook';

    /**
     * Force-refresh the catalog from the remote source and update the cache.
     *
     * @return array<string, mixed> Full catalog payload (unfiltered by target).
     */
    public static function refresh_catalog(): array {
        return self::ensure_catalog(true);
    }

    /**
     * Return the full catalog, fetching and caching when missing or when refresh is requested.
     *
     * Remote catalog entries are the source of truth for paid/free type. Bundled plugins.json is
     * only used to merge support metadata and as a last-resort offline bootstrap when no cache exists.
     *
     * @param bool $refresh When true, refetch from remote and update the cache.
     * @return array<string, mixed> Full catalog payload (unfiltered by target).
     */
    public static function ensure_catalog(bool $refresh = false): array {
        $cache = self::get_catalog_cache();

        if (!$refresh) {
            $cached = $cache->get(self::CACHE_KEY);
            if (is_array($cached) && !empty($cached['subplugins'])) {
                return $cached;
            }
        }

        $remote = self::fetch_remote_catalog();
        if ($remote !== null && !empty($remote['subplugins'])) {
            self::apply_bundled_support_metadata($remote);
            $remote['fetchedat'] = time();
            $remote['source'] = 'remote';
            $cache->set(self::CACHE_KEY, $remote);
            return $remote;
        }

        if (!$refresh) {
            $cached = $cache->get(self::CACHE_KEY);
            if (is_array($cached) && !empty($cached['subplugins'])) {
                return $cached;
            }
        }

        $bundled = self::read_bundled_catalog();
        if (!empty($bundled['subplugins'])) {
            self::apply_bundled_support_metadata($bundled);
            $bundled['fetchedat'] = time();
            $bundled['source'] = 'bundled';
        }

        return $bundled;
    }

    /**
     * Return catalog entries filtered for a target module.
     *
     * @param string $target Target module name in plugins.json support (e.g. mod_interactivevideo).
     * @param bool $refresh When true, refetch the remote catalog before filtering.
     * @return array<string, mixed>
     */
    public static function get_catalog(string $target = self::TARGET_INTERACTIVEVIDEO, bool $refresh = false): array {
        $data = self::ensure_catalog($refresh);
        if (empty($data['subplugins']) || !is_array($data['subplugins'])) {
            return ['subplugins' => []];
        }

        $filtered = $data;
        $filtered['subplugins'] = array_values(array_filter(
            $data['subplugins'],
            static fn(array $plugin): bool => self::supports_target($plugin, $target)
        ));

        return $filtered;
    }

    /**
     * Whether a catalog component is a paid content type.
     *
     * Uses the cached remote catalog as the source of truth.
     *
     * @param string $component Plugin component.
     * @return bool
     */
    public static function is_paid_component(string $component): bool {
        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return false;
        }

        return self::get_component_type($component) === 'paid';
    }

    /**
     * Resolve a component catalog type without ever going to the network.
     *
     * {@see self::get_component_type()} calls ensure_catalog(), which fetches the remote catalog
     * whenever its cache is cold — a 10s connect / 15s total request. That is fine on an admin
     * page and unacceptable on the enforcement path, which runs on every player and course page.
     * This variant reads a warm cache if there is one and otherwise the bundled file, and is
     * memoised for the request.
     *
     * The bundled file is a bootstrap, not an authority; it is editable on disk. Callers treat
     * this as one of two independent paid markers, never as the only one.
     *
     * @param string $component Plugin component.
     * @return string Empty string when unknown.
     */
    public static function get_component_type_local(string $component): string {
        // Only the bundled file is memoised, because it cannot change within a request. The cache
        // is re-read every call: a plain static over the resolved map survives between tests in
        // one process and makes a changed catalog invisible, which is exactly how this went wrong
        // once already. The MUC definition is statically accelerated, so the read is in-process,
        // and rebuilding a map of a couple of dozen entries is not worth caching around.
        static $bundled = null;

        $component = clean_param($component, PARAM_COMPONENT);
        if ($component === '') {
            return '';
        }

        $cached = self::get_catalog_cache()->get(self::CACHE_KEY);
        if (is_array($cached) && !empty($cached['subplugins'])) {
            $data = $cached;
        } else {
            if ($bundled === null) {
                $bundled = self::read_bundled_catalog();
            }
            $data = $bundled;
        }

        foreach ($data['subplugins'] ?? [] as $plugin) {
            if (($plugin['component'] ?? '') === $component) {
                return (string) ($plugin['type'] ?? '');
            }
        }

        return '';
    }

    /**
     * Resolve a component catalog type from the cached catalog.
     *
     * @param string $component Plugin component.
     * @return string Empty string when unknown.
     */
    public static function get_component_type(string $component): string {
        $catalog = self::ensure_catalog(false);
        foreach ($catalog['subplugins'] ?? [] as $plugin) {
            if (($plugin['component'] ?? '') === $component) {
                return (string) ($plugin['type'] ?? '');
            }
        }

        return '';
    }

    /**
     * Catalog with installed status and update information merged in.
     *
     * @param string $target Target module name in plugins.json support.
     * @param array $installedrows Installed plugin metadata rows.
     * @param bool $refresh When true, refetch the remote catalog before enriching.
     * @return array Enriched catalog data.
     */
    public static function get_enriched_catalog(
        string $target,
        array $installedrows,
        bool $refresh = false
    ): array {
        $catalog = self::get_catalog($target, $refresh);
        $installedmap = [];
        foreach ($installedrows as $row) {
            $installedmap[$row['component']] = $row;
        }

        foreach ($catalog['subplugins'] as $index => $plugin) {
            $component = $plugin['component'] ?? '';
            $local = $installedmap[$component] ?? null;
            $catalog['subplugins'][$index]['installed'] = $local !== null;
            $catalog['subplugins'][$index]['localversion'] = $local['version'] ?? '';
            $catalog['subplugins'][$index]['updateavailable'] = false;
            $catalog['subplugins'][$index]['updatelink'] = '';

            if ($local !== null && !empty($plugin['version']) && !empty($local['version'])) {
                if ((int) $plugin['version'] > (int) $local['version']) {
                    $catalog['subplugins'][$index]['updateavailable'] = true;
                    $catalog['subplugins'][$index]['updatelink'] = ($plugin['type'] ?? '') === 'paid'
                        ? ($plugin['download_url'] ?? '')
                        : ($plugin['git'] ?? '');
                }
            }

            if ($local !== null && ($plugin['type'] ?? '') === 'paid') {
                $status = contenttype_activation::ensure_activation($component, true);
                $catalog['subplugins'][$index]['activated'] = !empty($status['active']);
            }
        }

        usort($catalog['subplugins'], static function (array $a, array $b): int {
            return strcasecmp($a['title'] ?? '', $b['title'] ?? '');
        });

        return $catalog;
    }

    /**
     * Decode a plugins catalog JSON payload.
     *
     * @param string $response Raw JSON response.
     * @return array<string, mixed>|null Decoded catalog or null on failure.
     */
    private static function decode_catalog_json(string $response): ?array {
        $attempts = [$response];
        $sanitized = preg_replace('/,\s*([}\]])/', '$1', $response);
        if (is_string($sanitized) && $sanitized !== $response) {
            $attempts[] = $sanitized;
        }

        foreach ($attempts as $payload) {
            $data = json_decode($payload, true);
            if (!empty($data['subplugins']) && is_array($data['subplugins'])) {
                return $data;
            }
        }

        return null;
    }

    /**
     * Fetch the raw catalog from GitHub.
     *
     * @return array<string, mixed>|null Decoded catalog or null on failure.
     */
    private static function fetch_remote_catalog(): ?array {
        global $CFG;

        require_once($CFG->libdir . '/filelib.php');

        $curl = new \curl();
        $curl->setopt([
            'CURLOPT_TIMEOUT' => 15,
            'CURLOPT_CONNECTTIMEOUT' => 10,
            'CURLOPT_USERAGENT' => 'Moodle mod_interactivevideo plugins catalog',
        ]);
        $response = $curl->get(self::REMOTE_URL);

        if ($response === false || $response === '') {
            return null;
        }

        return self::decode_catalog_json($response);
    }

    /**
     * Read the bundled plugins.json shipped with the plugin.
     *
     * @return array<string, mixed>
     */
    private static function read_bundled_catalog(): array {
        global $CFG;

        $bundled = $CFG->dirroot . '/mod/interactivevideo/plugins.json';
        if (!is_readable($bundled)) {
            return ['subplugins' => []];
        }

        $data = self::decode_catalog_json((string) file_get_contents($bundled));
        if ($data === null) {
            return ['subplugins' => []];
        }

        return $data;
    }

    /**
     * Component => support[] map from the bundled plugins.json.
     *
     * Remote catalog entries often omit support; the bundled file supplements that metadata only.
     *
     * @return array<string, array<int, string>>
     */
    private static function get_bundled_support_map(): array {
        $data = self::read_bundled_catalog();
        if (empty($data['subplugins'])) {
            return [];
        }

        $map = [];
        foreach ($data['subplugins'] as $plugin) {
            $component = $plugin['component'] ?? '';
            if ($component === '' || empty($plugin['support']) || !is_array($plugin['support'])) {
                continue;
            }
            $map[$component] = $plugin['support'];
        }

        return $map;
    }

    /**
     * Merge bundled support metadata into catalog entries that lack it.
     *
     * @param array $data Catalog data modified in place.
     */
    private static function apply_bundled_support_metadata(array &$data): void {
        $supportmap = self::get_bundled_support_map();
        if ($supportmap === []) {
            return;
        }

        foreach ($data['subplugins'] as $index => $plugin) {
            $component = $plugin['component'] ?? '';
            if ($component !== '' && empty($plugin['support']) && isset($supportmap[$component])) {
                $data['subplugins'][$index]['support'] = $supportmap[$component];
            }
        }
    }

    /**
     * Whether a catalog entry supports the given target module.
     *
     * @param array $plugin Catalog plugin entry.
     * @param string $target Target module name.
     * @return bool True when the plugin supports the target.
     */
    private static function supports_target(array $plugin, string $target): bool {
        if (empty($plugin['support']) || !is_array($plugin['support'])) {
            // Legacy entries without support metadata are Interactive Video only.
            return $target === self::TARGET_INTERACTIVEVIDEO;
        }

        return in_array($target, $plugin['support'], true);
    }

    /**
     * Return the application cache store for the plugins catalog.
     *
     * @return \cache Application cache store for the plugins catalog.
     */
    private static function get_catalog_cache(): \cache {
        return \cache::make('mod_interactivevideo', 'iv_plugins_catalog');
    }
}
