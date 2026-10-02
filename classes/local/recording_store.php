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
 * Recordings learners make in H5P content, such as a spoken answer a teacher grades.
 *
 * A recording is stored as a file of the learner's log for the interaction, never in the
 * database. It goes in the log's "text1" file area, because the content's saved state,
 * which refers to it, is kept in the log's text1 field: there the address is kept
 * as @@PLUGINFILE@@, like other files of the field. So backup and restore, deleting the
 * learner's completion, and showing the log in the report handle it as they do any file of
 * the field. Shared by Interactive Video and FlexBook, whose logs have the same shape.
 *
 * @package    mod_interactivevideo
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class recording_store {
    /** @var string The file area: the log field that keeps the saved state. */
    const FILEAREA = 'text1';

    /** @var string Recordings are the files of the area named like this. */
    const PREFIX = 'recording-';

    /** @var int Largest recording accepted, in bytes. Three minutes of speech is about 0.6 MB. */
    const MAX_BYTES = 10485760;

    /** @var array File extensions of the audio formats browsers record, and how their files start. */
    const FORMATS = [
        'webm' => ["\x1A\x45\xDF\xA3"],
        'ogg' => ['OggS'],
        'm4a' => ['ftyp'],
        'mp4' => ['ftyp'],
        'mp3' => ['ID3', "\xFF\xFB", "\xFF\xF3", "\xFF\xF2"],
        'wav' => ['RIFF'],
    ];

    /**
     * The learner's log for an interaction, created when there's none yet.
     *
     * The log is linked to the learner's completion record, so that saving the progress
     * later updates this log instead of adding another one.
     *
     * @param string $prefix Table prefix: interactivevideo or flexbook
     * @param int $userid
     * @param int $itemid The interaction (annotation) id
     * @param int $cmid The value the plugin keeps in the log's cmid column
     * @return int The log id
     */
    public static function get_log_id(string $prefix, int $userid, int $itemid, int $cmid): int {
        global $DB;

        $existing = $DB->get_records($prefix . '_log', ['userid' => $userid, 'annotationid' => $itemid], 'id DESC', 'id', 0, 1);
        if ($existing) {
            return (int) reset($existing)->id;
        }

        $completion = $DB->get_records($prefix . '_completion', ['cmid' => $cmid, 'userid' => $userid], 'id DESC', 'id', 0, 1);
        $now = time();
        return (int) $DB->insert_record($prefix . '_log', (object) [
            'userid' => $userid,
            'annotationid' => $itemid,
            'cmid' => $cmid,
            'completionid' => $completion ? (int) reset($completion)->id : null,
            'timecreated' => $now,
            'timemodified' => $now,
        ]);
    }

    /**
     * Store a recording, replacing the learner's earlier one for the same log. Other files
     * of the area are left alone.
     *
     * @param \context $context The module context
     * @param string $component mod_interactivevideo or mod_flexbook
     * @param int $logid The learner's log for the interaction
     * @param string $extension webm, ogg, m4a, mp4, mp3 or wav
     * @param string $base64 The recording, base64 encoded
     * @return string The address of the stored file, for the content to play it now
     */
    public static function save(\context $context, string $component, int $logid, string $extension, string $base64): string {
        global $USER;

        $extension = strtolower($extension);
        if (!isset(self::FORMATS[$extension])) {
            throw new \invalid_parameter_exception('Unsupported recording format');
        }
        $content = base64_decode($base64, true);
        if ($content === false || $content === '') {
            throw new \invalid_parameter_exception('Invalid recording');
        }
        if (strlen($content) > self::MAX_BYTES) {
            throw new \invalid_parameter_exception('Recording too large');
        }
        if (!self::is_audio($content, $extension)) {
            throw new \invalid_parameter_exception('Not a recording');
        }

        $fs = get_file_storage();
        foreach ($fs->get_area_files($context->id, $component, self::FILEAREA, $logid, 'id', false) as $file) {
            if (strpos($file->get_filename(), self::PREFIX) === 0) {
                $file->delete();
            }
        }
        $filename = self::PREFIX . time() . '.' . $extension;
        $fs->create_file_from_string([
            'contextid' => $context->id,
            'component' => $component,
            'filearea' => self::FILEAREA,
            'itemid' => $logid,
            'filepath' => '/',
            'filename' => $filename,
            'userid' => $USER->id,
        ], $content);

        return \moodle_url::make_pluginfile_url($context->id, $component, self::FILEAREA, $logid, '/', $filename)->out(false);
    }

    /**
     * Keep the addresses of the log's files as @@PLUGINFILE@@ in a text saved in the log's
     * text1 field, such as content's saved state, so they still work after the course is
     * restored elsewhere. Reading the log turns them back into addresses.
     *
     * @param string|null $text
     * @param int $contextid
     * @param string $component
     * @param int $logid
     * @return string|null
     */
    public static function encode_urls($text, int $contextid, string $component, int $logid) {
        if (!is_string($text) || $text === '' || strpos($text, 'pluginfile.php') === false) {
            return $text;
        }
        $base = \moodle_url::make_pluginfile_url($contextid, $component, self::FILEAREA, $logid, '/', '')->out(false);
        // Also as it's written inside JSON, with escaped slashes.
        return str_replace([$base, str_replace('/', '\\/', $base)], ['@@PLUGINFILE@@/', '@@PLUGINFILE@@\\/'], $text);
    }

    /**
     * Whether the file starts the way files of its format do, so only recordings are stored.
     *
     * @param string $content
     * @param string $extension
     * @return bool
     */
    private static function is_audio(string $content, string $extension): bool {
        foreach (self::FORMATS[$extension] as $signature) {
            // MP4 and M4A files name their type after a 4-byte size.
            $offset = $signature === 'ftyp' ? 4 : 0;
            if (substr($content, $offset, strlen($signature)) === $signature) {
                return true;
            }
        }
        return false;
    }
}
