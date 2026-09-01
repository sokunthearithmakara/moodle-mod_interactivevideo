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
 * Gumlet Player class
 * Doc: https://docs.gumlet.com/developers/video-player/playerjs
 * Embed parameters: https://docs.gumlet.com/docs/embed-stream
 *
 * Driven through Gumlet's own @gumlet/player.js fork rather than the embed.ly player.js
 * bridge used by bunnystream/viostream. The embed.ly build implements only the base
 * Player.js spec, which has no setPlaybackRate; Gumlet's fork adds
 * setPlaybackRate/getPlaybackRate and the playbackRateChange event, which is what lets this
 * player advertise support.playbackrate. Its methods are promise-based, not callback-based.
 *
 * Quality stays unsupported: Gumlet exposes resolution only as the read-only qualityChange
 * notification, with no setQuality or rendition list, and the plugin's quality menu needs
 * both getQualities() and setQuality().
 *
 * @module     mod_interactivevideo/player/gumlet
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';
import fetchOembed from 'mod_interactivevideo/player/oembed';

let player = {};

// Gumlet's player.js build, held module-locally so it never competes with the embed.ly
// bridge that bunnystream/viostream put on window.playerjs.
let gumletjs = null;

const URL_REGEX = /(?:https?:\/\/)?(?:play\.gumlet\.io\/embed|gumlet\.tv\/watch)\/([A-Za-z0-9]+)/i;
const SDK_SRC = 'https://cdn.jsdelivr.net/npm/@gumlet/player.js@3.0/dist/main.global.js';

// Embed parameters that are safe to carry over from the pasted URL. Signed playback uses
// token + expires; the rest are cosmetic or language choices the teacher already made.
const PASSTHROUGH = [
    'token',
    'expires',
    'player_color',
    'start_high_res',
    'audio_track_language',
    'caption_language',
    'disabled_player_control',
    'thumbnail',
];

/**
 * Parse a Gumlet embed/watch URL into the asset id and its carried parameters.
 *
 * @param {string} url
 * @returns {{assetId: string, params: object}|null}
 */
const parseUrl = (url) => {
    const match = URL_REGEX.exec(url);
    if (!match) {
        return null;
    }
    const params = {};
    try {
        const parsed = new URL(url.indexOf('http') === 0 ? url : `https://${url}`);
        parsed.searchParams.forEach((value, key) => {
            if (PASSTHROUGH.indexOf(key.toLowerCase()) !== -1) {
                params[key.toLowerCase()] = value;
            }
        });
    } catch (e) {
        // A URL without a parsable query string is still perfectly playable.
        window.console.warn('Could not parse Gumlet URL parameters', e);
    }
    return {
        assetId: match[1],
        params: params,
    };
};

/**
 * Load Gumlet's player.js build once per page.
 *
 * The global build assigns window.playerjs, the same name the embed.ly bridge uses, so the
 * fork is captured into a module-local reference and whatever was there before is put back.
 *
 * @returns {Promise<object>}
 */
const loadSdk = () => new Promise((resolve, reject) => {
    if (gumletjs) {
        resolve(gumletjs);
        return;
    }
    const previous = window.playerjs;
    const capture = () => {
        gumletjs = window.playerjs;
        if (previous) {
            // Hand window.playerjs back to the embed.ly bridge.
            window.playerjs = previous;
        }
        if (!gumletjs) {
            reject(new Error('Gumlet player.js did not register'));
            return;
        }
        resolve(gumletjs);
    };
    const existing = document.querySelector('script[data-gumlet-playerjs]');
    if (existing) {
        existing.addEventListener('load', capture);
        existing.addEventListener('error', () => reject(new Error('Failed to load Gumlet player.js')));
        return;
    }
    const tag = document.createElement('script');
    tag.src = SDK_SRC;
    tag.async = true;
    tag.setAttribute('data-gumlet-playerjs', '1');
    tag.onload = capture;
    tag.onerror = () => reject(new Error('Failed to load Gumlet player.js'));
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
});

/**
 * Build the canonical Gumlet embed URL.
 *
 * @param {string} assetId
 * @returns {string}
 */
const canonicalUrl = (assetId) => `https://play.gumlet.io/embed/${assetId}`;

/**
 * Build the iframe src for the player.
 *
 * @param {string} assetId
 * @param {object} params - Parameters carried over from the pasted URL.
 * @param {boolean} showControls
 * @returns {string}
 */
const embedUrl = (assetId, params, showControls) => {
    const search = new URLSearchParams(params);
    search.set('preload', 'true');
    search.set('autoplay', 'false');
    if (!showControls) {
        search.set('disable_player_controls', 'true');
    }
    return `${canonicalUrl(assetId)}?${search.toString()}`;
};

/**
 * Replace the placeholder node with the Gumlet iframe.
 *
 * @param {string} node
 * @param {string} src
 * @returns {HTMLElement}
 */
const injectIframe = (node, src) => {
    const iframe = document.createElement('iframe');
    iframe.id = node;
    iframe.src = src;
    iframe.title = 'Gumlet video player';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
    );
    // Sizing and positioning come from the #player rules in styles.css, as with the
    // other iframe-based providers.
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    $(`#${node}`).replaceWith(iframe);
    return iframe;
};

/**
 * Fetch oEmbed metadata for a Gumlet asset.
 *
 * @param {string} assetId
 * @returns {Promise<object|null>}
 */
const fetchMeta = async(assetId) => {
    const oembedUrl = 'https://api.gumlet.com/v1/oembed?format=json&url='
        + encodeURIComponent(canonicalUrl(assetId));
    try {
        return await fetchOembed(oembedUrl);
    } catch (e) {
        // Metadata is best effort; playback does not depend on it.
        window.console.warn('Could not fetch Gumlet oEmbed metadata', e);
        return null;
    }
};

// Player.js getters resolve only when the iframe answers the postMessage round trip. If the
// embed never replies the returned promise stays pending forever - it does not reject and it
// does not time out - so every getter must be raced or a single lost message deadlocks the
// player. Setters (play/pause/mute/setCurrentTime) resolve immediately and need no guard.
const CALL_TIMEOUT = 2000;
const READY_TIMEOUT = 20000;

/**
 * Race a Player.js getter against a timeout so a silent embed cannot hang the caller.
 *
 * @param {Promise} promise
 * @param {*} fallback - Value to resolve with if the call fails or never answers.
 * @param {number} [ms]
 * @returns {Promise<*>}
 */
const withTimeout = (promise, fallback, ms = CALL_TIMEOUT) => Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
]);

/**
 * Read the duration, tolerating an embed that is not ready to report it yet.
 *
 * @param {object} instance
 * @returns {Promise<number>}
 */
const readDuration = async(instance) => {
    const duration = await withTimeout(instance.getDuration(), 0);
    return Number(duration) || 0;
};

class Gumlet {
    /**
     * Constructor of the Gumlet player.
     */
    constructor() {
        this.type = 'gumlet';
        this.useAnimationFrame = false;
        this.frequency = 0.25;
        this.support = {
            hideControls: true,
            playbackrate: true,
            // Gumlet reports resolution changes but offers no setter or rendition list.
            quality: false,
            password: false,
        };
        this.aspectratio = 16 / 9;
        this.rate = 1;
        this.eventsBound = false;
    }

    /**
     * Apply oEmbed metadata to this instance.
     *
     * @param {object} data
     * @returns {boolean}
     */
    applyMeta(data) {
        if (!data) {
            return false;
        }
        this.title = data.title || '';
        this.posterImage = data.thumbnail_url || '';
        if (data.duration) {
            this.oembedDuration = Number(data.duration) || 0;
        }
        if (data.width && data.height) {
            this.aspectratio = data.width / data.height;
        }
        return Boolean(data.title);
    }

    /**
     * Get the video information without loading a full player.
     *
     * @param {string} url - The Gumlet embed URL.
     * @param {string} node - The id of the placeholder element.
     * @returns {Promise<object>}
     */
    async getInfo(url, node) {
        this.node = node;
        const parsed = parseUrl(url);
        if (!parsed) {
            this.sendEvent('iv:playerError', {message: 'Invalid Gumlet URL'}, this.node);
            return null;
        }
        this.assetId = parsed.assetId;
        this.videoId = parsed.assetId;

        let playerjs;
        try {
            playerjs = await loadSdk();
        } catch (e) {
            this.sendEvent('iv:playerError', {message: e.message}, this.node);
            return null;
        }

        const data = await fetchMeta(parsed.assetId);
        this.applyMeta(data);

        injectIframe(node, embedUrl(parsed.assetId, parsed.params, true));
        player[node] = new playerjs.Player(document.getElementById(node));

        const self = this;
        return new Promise((resolve) => {
            player[node].on('ready', async() => {
                resolve({
                    duration: await readDuration(player[node]),
                    title: self.title,
                    posterImage: self.posterImage,
                });
            });
        });
    }

    /**
     * Creates an instance of the Gumlet player.
     *
     * @param {string} url - The Gumlet embed URL.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     * @param {boolean} reloaded - Whether the player is being reloaded.
     */
    async load(url, start, end, opts = {}, reloaded = false) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.start = start || 0;
        this.end = end;
        this.paused = true;
        this.ended = false;
        this.eventsBound = false;

        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            this.sendEvent('iv:autoplayBlocked', {
                requireVideoBlock: true,
            }, this.node);
        }

        const parsed = parseUrl(url);
        if (!parsed) {
            this.sendEvent('iv:playerError', {message: 'Invalid Gumlet URL'}, this.node);
            return;
        }
        this.assetId = parsed.assetId;
        this.videoId = parsed.assetId;

        let playerjs;
        try {
            playerjs = await loadSdk();
        } catch (e) {
            this.sendEvent('iv:playerError', {message: e.message}, this.node);
            return;
        }

        // In view/player mode title is already set from the activity record; oEmbed is
        // only needed on the mod form (getInfo) and when metadata was not saved yet.
        if (!this.title) {
            const data = await fetchMeta(parsed.assetId);
            this.applyMeta(data);
        }

        const $parent = $(`#${node}`).parent();
        injectIframe(node, embedUrl(parsed.assetId, parsed.params, showControls));
        $parent.removeClass('d-none w-0');
        $('#annotation-canvas').removeClass('d-none w-0');

        player[node] = new playerjs.Player(document.getElementById(node));

        const self = this;
        const instance = player[node];

        /**
         * Bind the playback events and announce readiness. Everything is bound here rather
         * than on the ready event so the duration nudge below cannot emit a spurious
         * iv:playerPlay before the clip bounds are known.
         *
         * @param {number} duration
         */
        const finishReady = async(duration) => {
            if (self.eventsBound) {
                return;
            }
            self.eventsBound = true;
            window.clearTimeout(self.readyWatchdog);

            // Setters, so no round trip to wait on.
            instance.setCurrentTime(self.start);
            instance.pause();
            self.currentTime = self.start;

            let totaltime = Number(duration.toFixed(2)) - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = Number(totaltime.toFixed(2));
            self.duration = self.end - self.start;

            if (instance.supports('method', 'unmute')) {
                instance.unmute();
            }

            instance.off('play');
            instance.on('play', () => {
                self.paused = false;
                self.ended = false;
                self.sendEvent('iv:playerPlay', null, self.node);
            });

            instance.on('pause', () => {
                self.paused = true;
                self.sendEvent('iv:playerPaused', null, self.node);
            });

            instance.on('ended', () => {
                if (self.ended) {
                    // The timeupdate clamp already ended the clip; do not report it twice.
                    return;
                }
                self.ended = true;
                self.paused = true;
                self.sendEvent('iv:playerEnded', null, self.node);
            });

            instance.on('timeupdate', (data) => {
                // Cached so the guarded getters have a sane value to fall back on.
                self.currentTime = data.seconds;
                self.sendEvent('iv:playerPlaying', {time: data.seconds, rate: self.rate}, self.node);
                if (data.seconds >= self.end) {
                    self.ended = true;
                    instance.pause();
                    self.sendEvent('iv:playerEnded', null, self.node);
                }
                if (data.seconds < self.start) {
                    self.seek(self.start);
                }
            });

            instance.on('seeked', (data) => {
                self.sendEvent('iv:playerSeek', {time: data ? data.seconds : self.start}, self.node);
            });

            instance.on('playbackRateChange', (data) => {
                self.rate = (data && data.playbackRate) || self.rate;
                self.sendEvent('iv:playerRateChange', {rate: self.rate}, self.node);
            });

            instance.on('error', (e) => {
                self.sendEvent('iv:playerError', {error: e}, self.node);
            });

            self.sendEvent('iv:playerLoaded', {
                tracks: null,
                qualities: null,
                reloaded: reloaded,
            }, self.node);
            self.sendEvent('iv:playerReady', null, self.node);
        };

        // Never leave the activity on an endless spinner: if the embed goes quiet, say so.
        this.readyWatchdog = window.setTimeout(() => {
            if (self.eventsBound) {
                return;
            }
            self.sendEvent('iv:playerError', {
                message: 'Gumlet player did not become ready. Check that the video is published '
                    + 'and that the embed URL is correct.',
            }, self.node);
        }, READY_TIMEOUT);

        instance.on('ready', async() => {
            if (self.eventsBound) {
                return;
            }
            if (instance.supports('method', 'mute')) {
                instance.mute();
            }

            let duration = await readDuration(instance);
            if (!duration) {
                // Some embeds only surface the duration once playback has been nudged.
                instance.play();
                await new Promise(resolve => setTimeout(resolve, 1000));
                duration = await readDuration(instance);
            }
            if (!duration && self.oembedDuration) {
                duration = self.oembedDuration;
            }
            if (!duration) {
                window.clearTimeout(self.readyWatchdog);
                self.sendEvent('iv:playerError', {message: 'Could not determine Gumlet duration'}, self.node);
                return;
            }
            await finishReady(duration);
        });
    }

    /**
     * Play the video.
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
     * Pause the video.
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
     * Stop the video and rewind to the given time.
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
     * Seek the video to a specific time.
     * @param {Number} time
     * @return {Promise<Boolean>}
     */
    async seek(time) {
        if (!player[this.node]) {
            return time;
        }
        const current = await withTimeout(
            player[this.node].getCurrentTime(),
            this.currentTime || this.start || 0
        );
        this.sendEvent('iv:playerSeekStart', {time: current}, this.node);
        this.ended = false;
        // Setter, so nothing to wait on.
        player[this.node].setCurrentTime(time);
        this.currentTime = time;
        return true;
    }

    /**
     * Get the current time of the video.
     * @return {Promise<Number>}
     */
    getCurrentTime() {
        if (!player[this.node]) {
            return 0;
        }
        return withTimeout(player[this.node].getCurrentTime(), this.currentTime || this.start || 0);
    }

    /**
     * Get the duration of the video.
     * @return {Number|Promise<Number>}
     */
    getDuration() {
        if (!player[this.node]) {
            return 0;
        }
        const totaltime = Number(this.totaltime);
        if (Number.isFinite(totaltime)) {
            return totaltime;
        }
        return withTimeout(player[this.node].getDuration(), 0);
    }

    /**
     * Check if the video is paused.
     * @return {Promise<Boolean>}
     */
    async isPaused() {
        if (!player[this.node]) {
            return true;
        }
        return (await withTimeout(player[this.node].getPaused(), this.paused)) === true;
    }

    /**
     * Check if the video is playing.
     * @return {Promise<Boolean>}
     */
    async isPlaying() {
        if (!player[this.node]) {
            return false;
        }
        return (await withTimeout(player[this.node].getPaused(), this.paused)) === false;
    }

    /**
     * Check if the video has ended.
     * @return {Boolean}
     */
    isEnded() {
        if (!player[this.node]) {
            return false;
        }
        return this.ended;
    }

    /**
     * Get the aspect ratio of the video.
     * @return {Number}
     */
    ratio() {
        if (!player[this.node]) {
            return 16 / 9;
        }
        return this.aspectratio;
    }

    /**
     * Destroy the player.
     * @return {Void}
     */
    destroy() {
        $(`#${this.node}`).replaceWith(`<div id="${this.node}" style="width:100%; max-width: 100%"></div>`);
        player[this.node] = null;
        this.eventsBound = false;
        window.clearTimeout(this.readyWatchdog);
        this.sendEvent('iv:playerDestroyed', null, this.node);
    }

    /**
     * Get the state of the player.
     * @return {Promise<String>}
     */
    async getState() {
        if (!player[this.node]) {
            return 'paused';
        }
        return (await withTimeout(player[this.node].getPaused(), this.paused)) ? 'paused' : 'playing';
    }

    /**
     * Set playback rate of the video.
     * @param {Number} rate
     * @return {Number}
     */
    setRate(rate) {
        if (!player[this.node]) {
            return rate;
        }
        this.rate = rate;
        player[this.node].setPlaybackRate(rate);
        this.sendEvent('iv:playerRateChange', {rate: rate}, this.node);
        return rate;
    }

    /**
     * Get playback rate of the video.
     *
     * Returned synchronously from the cached value so callers that do not await still get a
     * usable number; the cache is kept fresh by setRate and the playbackRateChange event.
     *
     * @return {Number}
     */
    getRate() {
        return this.rate || 1;
    }

    /**
     * Mute the video.
     * @return {Void}
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].mute();
        player[this.node].setVolume(0);
        this.muted = true;
        this.sendEvent('iv:playerVolumeChange', {volume: 0}, this.node);
    }

    /**
     * Unmute the video.
     * @return {Void}
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        player[this.node].unmute();
        player[this.node].setVolume(100);
        this.muted = false;
        this.sendEvent('iv:playerVolumeChange', {volume: 1}, this.node);
    }

    /**
     * Check if the video is muted.
     * @return {Promise<Boolean>}
     */
    isMuted() {
        if (!player[this.node]) {
            return false;
        }
        return withTimeout(player[this.node].getMuted(), Boolean(this.muted));
    }

    /**
     * Get the original player object.
     * @return {Object}
     */
    originalPlayer() {
        return player[this.node];
    }

    /**
     * Set subtitle. Gumlet selects captions through the embed's caption_language parameter,
     * not through the Player.js API, so there is nothing to switch at runtime.
     * @param {string} track language code
     * @return {String}
     */
    setCaption(track) {
        if (!player[this.node]) {
            return null;
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

export default Gumlet;
