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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/interactivevideo/lib.php');

/**
 * A direct media URL resolves to html5video however the link is dressed.
 *
 * Two things used to break this. The accepted-extension list here carried leading dots on its
 * last two entries ('.mpd', '.m3u8') while the copy in interactivevideo_dndupload_handle() did
 * not, so no HLS or DASH link ever matched. And both copies read the extension off the whole
 * URL, so pathinfo() returned "mp4?token=x" for any signed or tokenised link.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \interactivevideo_get_type_from_url
 */
final class url_video_type_test extends \basic_testcase {
    /**
     * URLs that must resolve to the direct-media player.
     *
     * @return array[]
     */
    public static function html5video_url_provider(): array {
        return [
            'hls manifest' => ['https://stream.mux.com/abc123.m3u8'],
            'dash manifest' => ['https://cdn.example.com/video/abc123.mpd'],
            'plain mp4' => ['https://example.com/movie.mp4'],
            'mp4 with a query string' => ['https://example.com/movie.mp4?token=x'],
            'hls with a signed query string' => ['https://stream.mux.com/abc123.m3u8?token=eyJhbGciOi'],
            'mp4 with a fragment' => ['https://example.com/movie.mp4#t=10'],
            'audio file' => ['https://example.com/podcast.mp3'],
        ];
    }

    /**
     * A direct media link is html5video whatever trails the extension.
     *
     * @dataProvider html5video_url_provider
     * @param string $url The URL under test.
     */
    public function test_direct_media_urls_resolve_to_html5video(string $url): void {
        $this->assertSame('html5video', interactivevideo_get_type_from_url($url));
    }

    /**
     * URLs that carry no usable media extension resolve to nothing.
     *
     * @return array[]
     */
    public static function unknown_url_provider(): array {
        return [
            'no extension' => ['https://example.com/watch/abc123'],
            'no path at all' => ['https://example.com'],
            'unsupported extension' => ['https://example.com/notes.pdf'],
            'query string only' => ['https://example.com/?v=abc123'],
            'empty string' => [''],
        ];
    }

    /**
     * Anything that is not a recognised provider or media file returns ''.
     *
     * @dataProvider unknown_url_provider
     * @param string $url The URL under test.
     */
    public function test_unrecognised_urls_resolve_to_nothing(string $url): void {
        $this->assertSame('', interactivevideo_get_type_from_url($url));
    }

    /**
     * A provider pattern still wins over the extension fallback.
     */
    public function test_provider_patterns_take_precedence(): void {
        $this->assertSame('yt', interactivevideo_get_type_from_url('https://www.youtube.com/watch?v=abc123'));
        $this->assertSame('mux', interactivevideo_get_type_from_url('https://player.mux.com/abc123'));
    }

    /**
     * Both copies of the accepted-extension list must stay identical.
     *
     * lib.php holds the list twice — once in interactivevideo_dndupload_handle() and once in
     * interactivevideo_get_type_from_url(). They drifted once already; this pins them together
     * and rejects the leading-dot form that caused the drift.
     */
    public function test_the_two_accepted_extension_lists_agree(): void {
        global $CFG;

        $source = file_get_contents($CFG->dirroot . '/mod/interactivevideo/lib.php');
        preg_match_all('/\$acceptedextensions = \[(.*?)\];/s', $source, $matches);

        $this->assertCount(2, $matches[1], 'Expected exactly two accepted-extension lists in lib.php');
        $this->assertSame($matches[1][0], $matches[1][1], 'The two accepted-extension lists have drifted apart');
        $this->assertStringNotContainsString(
            "'.",
            $matches[1][0],
            "Extensions must not carry a leading dot; pathinfo() reports them without one"
        );
    }
}
