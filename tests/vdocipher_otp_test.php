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

use mod_interactivevideo\local\vdocipher_otp;

/**
 * The VdoCipher OTP request carries the viewer's watermark.
 *
 * VdoCipher burns a dynamic watermark into playback only through the `annotate` field of the
 * OTP request, so the request has to be built per viewer, from the site's watermark statement
 * and the user who is about to watch. These tests pin the payload shape and the placeholder
 * vocabulary, which mirrors the official filter_vdocipher plugin so one statement can serve
 * both plugins.
 *
 * @package    mod_interactivevideo
 * @category   test
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_interactivevideo\local\vdocipher_otp
 */
final class vdocipher_otp_test extends \advanced_testcase {
    /**
     * A viewer with every field the placeholders read.
     *
     * @param array $overrides Field overrides for the generated user.
     * @return \stdClass
     */
    private function viewer(array $overrides = []): \stdClass {
        $this->resetAfterTest();
        return $this->getDataGenerator()->create_user($overrides + [
            'firstname' => 'Ada',
            'lastname' => 'Lovelace',
            'email' => 'ada@example.com',
            'username' => 'ada',
        ]);
    }

    /**
     * Without a watermark statement the request is a short lived OTP and nothing else.
     */
    public function test_payload_without_watermark_has_only_a_ttl(): void {
        $payload = vdocipher_otp::build_payload($this->viewer(), '');

        $this->assertSame(['ttl' => vdocipher_otp::TTL], $payload);
    }

    /**
     * A statement made only of whitespace is the same as no statement.
     */
    public function test_blank_watermark_is_ignored(): void {
        $payload = vdocipher_otp::build_payload($this->viewer(), "  \n\t");

        $this->assertArrayNotHasKey('annotate', $payload);
    }

    /**
     * The statement is sent as the `annotate` field with the viewer's details filled in.
     */
    public function test_watermark_placeholders_are_substituted(): void {
        $user = $this->viewer();
        $template = "[{'type':'rtext','text':'{name} <{email}> {username} #{id} {ip}'}]";

        $payload = vdocipher_otp::build_payload($user, $template, '203.0.113.7');

        $this->assertSame(vdocipher_otp::TTL, $payload['ttl']);
        $this->assertSame(
            "[{'type':'rtext','text':'Ada Lovelace <ada@example.com> ada #{$user->id} 203.0.113.7'}]",
            $payload['annotate']
        );
    }

    /**
     * `{date.FORMAT}` renders the current date in the given PHP date() format.
     */
    public function test_date_placeholder_uses_the_given_format(): void {
        $rendered = vdocipher_otp::render_annotate("{date.Y} {date.d/m}", $this->viewer());

        $this->assertSame(date('Y') . ' ' . date('d/m'), $rendered);
    }

    /**
     * Quotes and backslashes in user data cannot break out of the statement's string literals.
     */
    public function test_quotes_in_user_values_are_escaped(): void {
        $user = $this->viewer(['firstname' => "Conan O'Brien", 'lastname' => 'Back\\slash "Q"']);

        $rendered = vdocipher_otp::render_annotate("{'text':'{name}'}", $user);

        $this->assertSame("{'text':'Conan O\\'Brien Back\\\\slash \\\"Q\\\"'}", $rendered);
    }

    /**
     * Unknown placeholders are left alone so a typo shows up on screen rather than vanishing.
     */
    public function test_unknown_placeholders_are_kept(): void {
        $rendered = vdocipher_otp::render_annotate('{name} {course}', $this->viewer());

        $this->assertSame('Ada Lovelace {course}', $rendered);
    }
}
