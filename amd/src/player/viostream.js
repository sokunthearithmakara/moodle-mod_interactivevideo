
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
 * Viostream Player class
 * Documented at https://help.viostream.com/media-players/using-the-player-api#include-the-javascript
 *
 * @module     mod_interactivevideo/player/viostream
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

var player = {};
class Viostream {
    /**
     * Constructor of the viostream player.
     */
    constructor() {
        this.useAnimationFrame = false;
        this.type = 'viostream';
        this.frequency = 0.25;
        this.support = {
            playbackrate: false,
            quality: false,
        };
    }

    async getInfo(url, node) {
        let self = this;
        self.node = node;
        let regex = /(?:https?:\/\/)?(?:share\.viostream\.com)\/([a-zA-Z0-9]+)/i;
        let match = regex.exec(url);
        let videoId = match ? match[1] : null;
        self.videoId = videoId;
        self.aspectratio = 16 / 9;

        await new Promise((resolve, reject) => {
            $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                type: 'POST',
                dataType: 'text',
                data: {
                    action: 'get_from_url',
                    contextid: M.cfg.contextid,
                    url: url,
                    sesskey: M.cfg.sesskey,
                },
                complete: function(res) {
                    let text = res.responseText;

                    // Use regex to extract <meta name="twitter:title" content="...">
                    let titleMatch = text.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
                    let title = titleMatch ? titleMatch[1] : '';

                    // Use regex to extract <meta property="og:image" content="...">
                    let posterMatch = text.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
                    let poster = posterMatch ? posterMatch[1] : '';

                    // Use regex to extract <meta property="twitter:player:width" content="...">
                    let widthMatch = text.match(
                        /<meta\s+(?:property|name)=["']twitter:player:width["']\s+content=["']([^"']+)["']/i);
                    let width = widthMatch ? widthMatch[1] : '';

                    // Use regex to extract <meta property="twitter:player:height" content="...">
                    let heightMatch = text.match(
                        /<meta\s+(?:property|name)=["']twitter:player:height["']\s+content=["']([^"']+)["']/i);
                    let height = heightMatch ? heightMatch[1] : '';
                    self.title = title;
                    self.posterImage = poster;
                    self.aspectratio = width / height;
                    resolve(title);
                },
                error: function(xhr, status, error) {
                    reject(error);
                }
            });
        });

        let iframe = `<iframe src="https://play.viostream.com/iframe/${videoId}" id="${node}"
        referrerpolicy="strict-origin-when-cross-origin" webkitallowfullscreen mozallowfullscreen allowfullscreen
         frameborder="0" ></iframe>`;

        $(`#${node}`)
            .replaceWith(iframe);

        player[node] = new window.playerjs.Player(document.getElementById(node));

        return new Promise((resolve) => {
            player[node].on('ready', () => {
                player[node].play(); // We need to play the video to get the duration.

                let interval = setInterval(() => {
                    player[node].getDuration(duration => {
                        if (!duration) {
                            return;
                        }
                        clearInterval(interval);
                        resolve({
                            duration: duration,
                            title: self.title,
                            posterImage: self.posterImage,
                        });
                    });
                }, 500);
            });
        });
    }
    /**
     * Creates an instance of the viostream player.
     *
     * @constructor
     * @param {string} url - The URL of the viostream video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        const node = opts.node || 'player';
        this.node = node;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            });
        }

        let self = this;

        // URL: https://share.viostream.com/ritie6zritioc1
        let regex = /(?:https?:\/\/)?(?:share\.viostream\.com)\/([a-zA-Z0-9]+)/i;
        var match = regex.exec(url);
        var videoId = match ? match[1] : null;
        this.videoId = videoId;

        self.aspectratio = 16 / 9;

        if (opts.editform) { // Get title and poster image from the video if it's in edit form.
            await new Promise((resolve, reject) => {
                $.ajax({
                    url: M.cfg.wwwroot + '/mod/interactivevideo/ajax.php',
                    type: 'POST',
                    dataType: 'text',
                    data: {
                        action: 'get_from_url',
                        contextid: M.cfg.contextid,
                        url: url,
                        sesskey: M.cfg.sesskey,
                    },
                    complete: function(res) {
                        let text = res.responseText;

                        // Use regex to extract <meta name="twitter:title" content="...">
                        let titleMatch = text.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
                        let title = titleMatch ? titleMatch[1] : '';

                        // Use regex to extract <meta property="og:image" content="...">
                        let posterMatch = text.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
                        let poster = posterMatch ? posterMatch[1] : '';

                        // Use regex to extract <meta property="twitter:player:width" content="...">
                        let widthMatch = text.match(
                            /<meta\s+(?:property|name)=["']twitter:player:width["']\s+content=["']([^"']+)["']/i);
                        let width = widthMatch ? widthMatch[1] : '';

                        // Use regex to extract <meta property="twitter:player:height" content="...">
                        let heightMatch = text.match(
                            /<meta\s+(?:property|name)=["']twitter:player:height["']\s+content=["']([^"']+)["']/i);
                        let height = heightMatch ? heightMatch[1] : '';
                        self.title = title;
                        self.posterImage = poster;
                        self.aspectratio = width / height;
                        resolve(title);
                    },
                    error: function(xhr, status, error) {
                        reject(error);
                    }
                });
            });
        }

        let iframe = `<iframe src="https://play.viostream.com/iframe/${videoId}" id="${node}"
        referrerpolicy="strict-origin-when-cross-origin" webkitallowfullscreen mozallowfullscreen allowfullscreen
         frameborder="0" ></iframe>`;

        let $parent = $(`#${node}`).parent();
        $(`#${node}`)
            .replaceWith(iframe);
        $parent.removeClass('d-none w-0');
        $('.video-block, #video-block').remove();
        player[node] = new window.playerjs.Player(document.getElementById(node));

        player[node].on('ready', () => {
            self.start = start || 0;

            player[node].play(); // We need to play the video to get the duration.

            let interval = setInterval(() => {
                player[node].getDuration(duration => {
                    if (!duration) {
                        return;
                    }
                    let totaltime = Number(duration.toFixed(2)) - self.frequency;
                    end = !end ? totaltime : Math.min(end, totaltime);
                    end = Number(end.toFixed(2));
                    self.end = end;
                    self.totaltime = Number(totaltime.toFixed(2));
                    self.duration = self.end - self.start;
                    dispatchEvent('iv:playerReady', null, document.getElementById(node));
                    clearInterval(interval);
                });
            }, 500);

            player[node].on('play', () => {
                self.paused = false;
                self.ended = false;
                dispatchEvent('iv:playerPlay');
            });

            player[node].on('pause', () => {
                self.paused = true;
                dispatchEvent('iv:playerPaused');
            });

            player[node].on('ended', () => {
                self.ended = true;
                dispatchEvent('iv:playerEnded');
            });

            player[node].on('timeupdate', (data) => {
                dispatchEvent('iv:playerPlaying');
                if (data.seconds >= self.end) {
                    self.ended = true;
                    player[node].pause();
                    dispatchEvent('iv:playerEnded');
                }
                if (data.seconds < self.start) {
                    self.seek(self.start);
                }
            });

            player[node].on('seeked', () => {
                player[node].getCurrentTime(value => {
                    dispatchEvent('iv:playerSeek', {time: value});
                });

            });
        });
    }

    /**
     * Play the video
     * @return {Void}
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].play();
        this.paused = false;
    }
    /**
     * Pause the video
     * @return {Void}
     */
    pause() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].pause();
        this.paused = true;
    }
    /**
     * Stop the video
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        if (!player[this.node]) {
            return;
        }
        player[this.node].setCurrentTime(starttime);
        player[this.node].pause();
    }
    /**
     * Seek the video to a specific time
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    seek(time) {
        if (!player[this.node]) {
            return time;
        }

        return new Promise((resolve) => {
            player[this.node].getCurrentTime(value => {
                let currentTime = value;
                dispatchEvent('iv:playerSeekStart', {time: currentTime});
                this.ended = false;
                player[this.node].setCurrentTime(time, true);
                resolve(true);
            });
        });
    }
    /**
     * Get the current time of the video
     * @return {Number}
     */
    getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return new Promise((resolve) => {
            player[this.node].getCurrentTime(value => resolve(value));
        });
    }
    /**
     * Get the duration of the video
     * @return {Number}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        return new Promise(resolve => {
            player[this.node].getDuration(value => resolve(value));
        });
    }
    /**
     * Check if the video is paused
     * @return {Boolean}
     */
    isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return new Promise((resolve) => {
            player[this.node].getPaused(value => resolve(value === true));
        });
    }
    /**
     * Check if the video is playing
     * @return {Boolean}
     */
    isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        return new Promise((resolve) => {
            player[this.node].getPaused(value => resolve(value === false));
        });
    }
    /**
     * Check if the video is ended
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        return this.ended;
    }
    /**
     * Get the aspect ratio of the video
     * @return {Number}
     */
    ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return this.aspectratio;
    }
    /**
     * Destroy the player
     * @return {Void}
     */
    destroy() {
        $(`#${this.node}`).remove();
        player[this.node] = null;
        dispatchEvent('iv:playerDestroyed');
    }
    /**
     * Get the state of the player
     * @return {Number}
     */
    getState() {
        if (!player[this.node]) {
            return 'paused';
        }
        return new Promise((resolve) => {
            player[this.node].getPaused(value => resolve(value ? 'paused' : 'playing'));
        });
    }
    /**
     * Set playback rate of the video
     * @param {Number} rate
     */
    setRate(rate) {
        if (!player[this.node]) {
            return rate;
        }
        return rate;
    }
    /**
     * Mute the video
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].mute();
        player[this.node].setVolume(0);
        this.muted = true;
        dispatchEvent('iv:playerVolumeChange', {volume: 0});
    }
    /**
     * Unmute the video
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unmute();
        player[this.node].setVolume(100);
        this.muted = false;
        dispatchEvent('iv:playerVolumeChange', {volume: 1});
    }

    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return new Promise((resolve) => {
            player[this.node].getMuted(value => resolve(value));
        });
    }
    /**
     * Get the original player object
     */
    originalPlayer() {
        return player[this.node];
    }

    /**
     * Set subtitle
     * @param {string} track language code
     */
    setCaption(track) {
        if (!player[this.node]) {
            return null;
        }
        return track;
    }
}

export default Viostream;