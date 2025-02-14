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

/**
 * TODO describe module checkautoplay
 *
 * @module     mod_interactivevideo/player/checkautoplay
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

const allowAutoplay = (node) => {
    return new Promise((resolve) => {
        // Create a video element after the node.
        const video = document.createElement('video');
        // Set visibility to hidden.
        video.style.visibility = 'hidden';
        // Set the video source.
        const src = M.cfg.wwwroot + '/mod/interactivevideo/sounds/sample.mp4';
        video.src = src;
        // Mute the video.
        video.setAttribute('muted', true);
        // Set the autoplay attribute.
        video.setAttribute('autoplay', true);
        video.setAttribute('playsinline', true);
        // Place the video element after the node.
        node.after(video);
        // Try to play the video.
        video.play().then(() => {
            // Autoplay is allowed.
            video.remove();
            resolve(true);
        }).catch(() => {
            // Autoplay is not allowed.
            video.remove();
            resolve(false);
        });
    });
};

export default allowAutoplay;