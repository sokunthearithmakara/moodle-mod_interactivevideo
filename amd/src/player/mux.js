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
 * Mux Player class
 * Doc: https://www.mux.com/docs/guides/mux-player-web
 * API: https://www.mux.com/docs/guides/player-api-reference/html
 *
 * Accepts the Mux watch/embed URL (https://player.mux.com/{playbackId}) only.
 * A raw https://stream.mux.com/{playbackId}.m3u8 URL is intentionally left to the
 * html5video player, which already handles HLS through hls.js.
 *
 * @module     mod_interactivevideo/player/mux
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';

let players = {};

const URL_REGEX = /(?:https?:\/\/)?player\.mux\.com\/([A-Za-z0-9]+)(?:[/?#]|$)/i;
const SDK_SRC = 'https://cdn.jsdelivr.net/npm/@mux/mux-player@3';
const RESOLUTIONS = ['720p', '1080p', '1440p', '2160p'];

// Query parameters on the watch URL are Mux Player attribute names, so they can be copied
// straight onto the element. Allowlisted so a crafted URL cannot inject arbitrary attributes.
const PASSTHROUGH = [
    'playback-token',
    'thumbnail-token',
    'storyboard-token',
    'drm-token',
    'custom-domain',
    'accent-color',
    'primary-color',
    'secondary-color',
    'default-hidden-captions',
    'default-show-remaining-time',
    'max-resolution',
    'min-resolution',
    'thumbnail-time',
    'stream-type',
    'audio',
    'poster',
    'title',
    'video-title',
    'env-key',
    'beacon-collection-domain',
];

/**
 * Parse a Mux watch URL into the playback id and the attributes it carries.
 *
 * @param {string} url
 * @returns {{playbackId: string, attributes: object}|null}
 */
const parseUrl = (url) => {
    const match = URL_REGEX.exec(url);
    if (!match) {
        return null;
    }
    const attributes = {};
    try {
        const parsed = new URL(url.indexOf('http') === 0 ? url : `https://${url}`);
        parsed.searchParams.forEach((value, key) => {
            const name = key.toLowerCase();
            if (name === 'token') {
                // A bare token on a Mux URL is the playback (video) token.
                attributes['playback-token'] = value;
            } else if (name.indexOf('metadata-') === 0 || PASSTHROUGH.indexOf(name) !== -1) {
                attributes[name] = value;
            }
        });
    } catch (e) {
        // A URL without a parsable query string is still perfectly playable.
        window.console.warn('Could not parse Mux URL parameters', e);
    }
    return {
        playbackId: match[1],
        attributes: attributes,
    };
};

/**
 * Load the Mux Player custom element definition once per page.
 *
 * @returns {Promise<void>}
 */
const loadSdk = () => new Promise((resolve, reject) => {
    if (window.customElements && window.customElements.get('mux-player')) {
        resolve();
        return;
    }
    const existing = document.querySelector('script[data-mux-player]');
    if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Mux Player')));
        return;
    }
    const tag = document.createElement('script');
    tag.src = SDK_SRC;
    tag.async = true;
    tag.setAttribute('data-mux-player', '1');
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Mux Player'));
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
});

/**
 * Replace the placeholder node with a configured mux-player element.
 *
 * @param {string} node
 * @param {string} playbackId
 * @param {object} attributes
 * @returns {HTMLElement}
 */
const injectPlayer = (node, playbackId, attributes) => {
    const el = document.createElement('mux-player');
    el.id = node;
    el.setAttribute('playback-id', playbackId);
    el.setAttribute('playsinline', '');
    // Moodle has no consent flow for the player, so keep Mux Data cookie-free.
    el.setAttribute('disable-cookies', '');
    el.style.width = '100%';
    el.style.maxWidth = '100%';
    el.style.display = 'block';
    Object.keys(attributes).forEach((name) => {
        el.setAttribute(name, attributes[name]);
    });
    $(`#${node}`).replaceWith(el);
    return el;
};

/**
 * Work out the best available title for a Mux asset.
 *
 * Mux publishes no per-asset title: there is no oEmbed endpoint, and the watch page's
 * og:title is the constant string "Mux Player" for every video, so the real asset name is
 * only reachable through the authenticated Video API. Use whatever the teacher put on the
 * URL, and otherwise the playback id, so the activity name field has something to prefill.
 *
 * @param {object} parsed - The result of parseUrl().
 * @returns {string}
 */
const muxTitle = (parsed) => parsed.attributes.title
    || parsed.attributes['video-title']
    || parsed.playbackId;

/**
 * Build the caption list from the element's text tracks.
 *
 * @param {HTMLElement} el
 * @returns {Array|null}
 */
const getCaptions = (el) => {
    if (!el.textTracks || el.textTracks.length === 0) {
        return null;
    }
    const tracks = [];
    for (let i = 0; i < el.textTracks.length; i++) {
        const track = el.textTracks[i];
        if (track.kind !== 'subtitles' && track.kind !== 'captions') {
            continue;
        }
        // Turn every track off; the plugin drives caption selection itself.
        track.mode = 'disabled';
        tracks.push({
            label: track.label || (track.language || '').toUpperCase(),
            code: track.language,
        });
    }
    return tracks.length > 0 ? tracks : null;
};

class Mux {
    /**
     * Constructor of the Mux player.
     */
    constructor() {
        this.type = 'mux';
        this.frequency = 0.4;
        this.useAnimationFrame = false;
        this.support = {
            hideControls: true,
            playbackrate: true,
            quality: true,
            password: false,
        };
        this.aspectratio = 16 / 9;
    }

    /**
     * Get the video information without loading a full player.
     *
     * @param {string} url - The Mux watch URL.
     * @param {string} node - The id of the placeholder element.
     * @returns {Promise<object>}
     */
    async getInfo(url, node) {
        this.node = node;
        const parsed = parseUrl(url);
        if (!parsed) {
            this.sendEvent('iv:playerError', {message: 'Invalid Mux URL'}, this.node);
            return null;
        }
        this.playbackId = parsed.playbackId;
        this.videoId = parsed.playbackId;
        this.title = muxTitle(parsed);

        try {
            await loadSdk();
        } catch (e) {
            this.sendEvent('iv:playerError', {message: e.message}, this.node);
            return null;
        }

        const el = injectPlayer(node, parsed.playbackId, parsed.attributes);
        el.setAttribute('preload', 'metadata');
        el.muted = true;
        players[node] = el;
        this.player = el;

        const self = this;
        return new Promise((resolve) => {
            el.addEventListener('loadedmetadata', function() {
                resolve({
                    duration: el.duration,
                    title: self.title,
                    posterImage: self.thumbnailUrl(parsed.attributes),
                });
            }, {once: true});
        });
    }

    /**
     * Build the Mux thumbnail URL for the current playback id.
     *
     * @param {object} attributes
     * @returns {string}
     */
    thumbnailUrl(attributes = {}) {
        let poster = `https://image.mux.com/${this.playbackId}/thumbnail.jpg`;
        if (attributes['thumbnail-token']) {
            poster += `?token=${encodeURIComponent(attributes['thumbnail-token'])}`;
        }
        return poster;
    }

    /**
     * Creates an instance of the Mux player.
     *
     * @param {string} url - The Mux watch URL.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     * @param {boolean} reloaded - Whether the player is being reloaded.
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        const autoplay = opts.autoplay || false;
        this.node = node;
        this.start = start || 0;
        this.end = end;
        this.paused = true;
        this.ended = false;

        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            this.sendEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            }, this.node);
        }

        const parsed = parseUrl(url);
        if (!parsed) {
            this.sendEvent('iv:playerError', {message: 'Invalid Mux URL'}, this.node);
            return;
        }
        this.playbackId = parsed.playbackId;
        this.videoId = parsed.playbackId;
        this.posterImage = this.thumbnailUrl(parsed.attributes);
        this.title = muxTitle(parsed);

        try {
            await loadSdk();
        } catch (e) {
            this.sendEvent('iv:playerError', {message: e.message}, this.node);
            return;
        }

        const el = injectPlayer(node, parsed.playbackId, parsed.attributes);
        el.setAttribute('preload', 'auto');
        el.setAttribute('metadata-video-id', parsed.playbackId);
        el.setAttribute('metadata-video-title', this.title);
        if (this.start > 0) {
            el.setAttribute('start-time', this.start);
        }
        // Muted until the host code decides otherwise, so autoplay policies do not block us.
        el.muted = true;
        if (autoplay) {
            el.setAttribute('autoplay', 'muted');
        }
        if (!showControls) {
            // The only way to hide Mux Player chrome is the --controls custom property.
            el.style.setProperty('--controls', 'none');
            el.setAttribute('nohotkeys', '');
            document.body.classList.add('no-original-controls');
        }
        // The plugin owns keyboard handling.
        el.tabIndex = -1;

        players[node] = el;
        this.player = el;

        // Deliberately leave .video-block and #annotation-canvas alone, exactly as html5video
        // does. The iframe providers remove .video-block because the iframe swallows clicks
        // anyway, but mux-player is a real element in the page: .video-block is the transparent
        // overlay that gives click-to-pause/resume (bound in viewannotation.js), and
        // viewannotation reveals the canvas itself once the player is ready.

        const self = this;

        el.addEventListener('loadedmetadata', function() {
            self.aspectratio = self.ratio();
            let totaltime = Number((el.duration).toFixed(2)) - self.frequency;
            if (el.duration === Infinity || isNaN(el.duration) || (el.streamType || '').indexOf('live') === 0) {
                totaltime = 0.1;
                self.live = true;
            }
            if (end == 0.1 && !self.live) {
                end = totaltime;
            }
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = Number(totaltime.toFixed(2));
            self.duration = self.end - self.start;
            self.captions = getCaptions(el);
            el.pause();
            self.sendEvent('iv:playerLoaded', {
                tracks: self.captions,
                qualities: self.getQualities(),
                reloaded: reloaded,
            }, self.node);
            self.sendEvent('iv:playerReady', null, self.node);
        }, {once: true});

        el.addEventListener('play', function() {
            self.paused = false;
            self.ended = false;
            self.sendEvent('iv:playerPlay', null, self.node);
        });

        el.addEventListener('pause', function() {
            self.paused = true;
            self.sendEvent('iv:playerPaused', null, self.node);
        });

        el.addEventListener('timeupdate', function() {
            if (self.paused) {
                return;
            }
            if (el.currentTime < self.start) {
                el.currentTime = self.start;
            }
            if (el.currentTime >= self.end + self.frequency && !self.live) {
                el.currentTime = self.end - self.frequency;
            }
            self.sendEvent('iv:playerPlaying', {
                time: el.currentTime,
                rate: el.playbackRate,
            }, self.node);
            if (self.live) {
                return;
            }
            if (self.ended) {
                self.ended = false;
            } else if (el.currentTime >= self.end) {
                self.ended = true;
                self.paused = true;
                el.pause();
                self.sendEvent('iv:playerEnded', null, self.node);
            }
        });

        el.addEventListener('ended', function() {
            if (self.ended) {
                // The timeupdate clamp already ended the clip; do not report it twice.
                return;
            }
            self.ended = true;
            self.paused = true;
            self.sendEvent('iv:playerEnded', null, self.node);
        });

        el.addEventListener('seeked', function() {
            self.sendEvent('iv:playerSeek', {time: el.currentTime}, self.node);
        });

        el.addEventListener('ratechange', function() {
            self.sendEvent('iv:playerRateChange', {rate: el.playbackRate}, self.node);
        });

        el.addEventListener('volumechange', function() {
            self.sendEvent('iv:playerVolumeChange', {volume: el.volume}, self.node);
        });

        el.addEventListener('waiting', function() {
            self.sendEvent('iv:playerBuffering', null, self.node);
        });

        el.addEventListener('error', function(e) {
            self.sendEvent('iv:playerError', {error: e}, self.node);
        });
    }

    /**
     * Play the video.
     * @return {Void}
     */
    play() {
        if (!players[this.node]) {
            return;
        }
        players[this.node].play();
        this.paused = false;
    }

    /**
     * Pause the video.
     * @return {Boolean}
     */
    pause() {
        if (!players[this.node]) {
            return false;
        }
        players[this.node].pause();
        this.paused = true;
        return true;
    }

    /**
     * Stop the video and rewind to the given time.
     * @param {Number} starttime
     * @return {Void}
     */
    stop(starttime) {
        if (!players[this.node]) {
            return;
        }
        players[this.node].pause();
        players[this.node].currentTime = starttime;
    }

    /**
     * Seek the video to a specific time.
     * @param {Number} time
     * @return {Boolean}
     */
    seek(time) {
        if (!players[this.node]) {
            return time;
        }
        this.sendEvent('iv:playerSeekStart', {time: this.getCurrentTime()}, this.node);
        this.ended = false;
        players[this.node].currentTime = time;
        return true;
    }

    /**
     * Get the current time of the video.
     * @return {Number}
     */
    getCurrentTime() {
        if (!players[this.node]) {
            return 0;
        }
        return players[this.node].currentTime;
    }

    /**
     * Get the duration of the video.
     * @return {Number}
     */
    getDuration() {
        if (!players[this.node]) {
            return 0;
        }
        const totaltime = Number(this.totaltime);
        if (Number.isFinite(totaltime)) {
            return totaltime;
        }
        return players[this.node].duration;
    }

    /**
     * Check if the video is paused.
     * @return {Boolean}
     */
    isPaused() {
        if (!players[this.node]) {
            return true;
        }
        if (this.paused) {
            return true;
        }
        return players[this.node].paused;
    }

    /**
     * Check if the video is playing.
     * @return {Boolean}
     */
    isPlaying() {
        if (!players[this.node]) {
            return false;
        }
        if (this.paused) {
            return false;
        }
        return !players[this.node].paused;
    }

    /**
     * Check if the video has ended.
     * @return {Boolean}
     */
    isEnded() {
        if (!players[this.node]) {
            return false;
        }
        return players[this.node].ended || players[this.node].currentTime >= this.end;
    }

    /**
     * Get the aspect ratio of the video.
     * @return {Number}
     */
    ratio() {
        if (!players[this.node]) {
            return 16 / 9;
        }
        const el = players[this.node];
        if (!el.videoWidth || !el.videoHeight) {
            return 16 / 9;
        }
        return el.videoWidth / el.videoHeight;
    }

    /**
     * Destroy the player.
     * @return {Void}
     */
    destroy() {
        if (players[this.node]) {
            players[this.node].pause();
        }
        $(`#${this.node}`).replaceWith(`<div id="${this.node}" style="width:100%; max-width: 100%"></div>`);
        players[this.node] = null;
        this.player = null;
        this.sendEvent('iv:playerDestroyed', null, this.node);
    }

    /**
     * Get the state of the player.
     * @return {String}
     */
    getState() {
        if (!players[this.node]) {
            return 'paused';
        }
        return players[this.node].paused ? 'paused' : 'playing';
    }

    /**
     * Set the playback rate of the video.
     * @param {Number} rate
     * @return {Void}
     */
    setRate(rate) {
        if (!players[this.node]) {
            return;
        }
        players[this.node].playbackRate = rate;
    }

    /**
     * Get the playback rate of the video.
     * @return {Number}
     */
    getRate() {
        if (!players[this.node]) {
            return 1;
        }
        return players[this.node].playbackRate || 1;
    }

    /**
     * Mute the video.
     * @return {Void}
     */
    mute() {
        if (!players[this.node]) {
            return;
        }
        players[this.node].muted = true;
        players[this.node].volume = 0;
        this.muted = true;
        this.sendEvent('iv:playerVolumeChange', {volume: 0}, this.node);
    }

    /**
     * Unmute the video.
     * @return {Void}
     */
    unMute() {
        if (!players[this.node]) {
            return;
        }
        const el = players[this.node];
        if (el.getAttribute('autoplay') === 'muted') {
            el.setAttribute('autoplay', 'any');
        }
        el.muted = false;
        el.volume = 1;
        this.muted = false;
        this.sendEvent('iv:playerVolumeChange', {volume: 1}, this.node);
    }

    /**
     * Check if the video is muted.
     * @return {Boolean}
     */
    isMuted() {
        if (!players[this.node]) {
            return false;
        }
        return players[this.node].muted;
    }

    /**
     * Get the original player object.
     * @return {Object}
     */
    originalPlayer() {
        if (!players[this.node]) {
            return null;
        }
        return players[this.node];
    }

    /**
     * Set the maximum rendition Mux is allowed to serve.
     * @param {String} quality
     * @return {String}
     */
    setQuality(quality) {
        if (!players[this.node]) {
            return quality;
        }
        if (quality) {
            players[this.node].setAttribute('max-resolution', quality);
        } else {
            players[this.node].removeAttribute('max-resolution');
        }
        this.sendEvent('iv:playerQualityChange', {quality: quality}, this.node);
        return quality;
    }

    /**
     * Get the rendition ceilings Mux Player accepts.
     * @return {Object}
     */
    getQualities() {
        if (!players[this.node]) {
            return null;
        }
        return {
            qualities: ['', ...RESOLUTIONS],
            qualitiesLabel: ['Auto', ...RESOLUTIONS],
            currentQuality: players[this.node].getAttribute('max-resolution') || '',
        };
    }

    /**
     * Set subtitle.
     * @param {string} track language code
     * @return {String}
     */
    setCaption(track) {
        if (!players[this.node]) {
            return null;
        }
        const tracks = players[this.node].textTracks;
        if (!tracks) {
            return track;
        }
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].kind !== 'subtitles' && tracks[i].kind !== 'captions') {
                continue;
            }
            if (track && track !== 'off' && tracks[i].language === track) {
                tracks[i].mode = 'showing';
            } else {
                tracks[i].mode = 'disabled';
            }
        }
        return track;
    }

    /**
     * Helper to dispatch events safely.
     * @param {string} name
     * @param {object} details
     * @param {string} elementid
     */
    sendEvent(name, details = null, elementid = null) {
        // eslint-disable-next-line no-nested-ternary
        let el = elementid ? document.getElementById(elementid) : (this.node ? document.getElementById(this.node) : null);
        if (el) {
            dispatchEvent(name, details, el);
        } else {
            dispatchEvent(name, details);
        }
    }

}

export default Mux;
