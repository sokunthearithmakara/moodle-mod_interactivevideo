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
 * Spotlightr Player class
 * Doc: https://app.spotlightr.com/docs/api/
 *
 * @module     mod_interactivevideo/player/spotlightr
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';
import fetchOembed from 'mod_interactivevideo/player/oembed';

let player = {};

const URL_REGEX = /(?:https?:\/\/)?((?:[a-z0-9-]+\.)?cdn\.spotlightr\.com)\/watch\/([A-Za-z0-9=]+)/i;

// How long the live getDuration probe gets before the oEmbed value is used instead.
const DURATION_TIMEOUT = 3000;
// How long the whole ready handshake gets before the activity is told it failed.
const READY_TIMEOUT = 20000;

/**
 * Parse Spotlightr watch/embed URL into CDN host and video id.
 *
 * @param {string} url
 * @returns {{cdnHost: string, videoId: string}|null}
 */
const parseUrl = (url) => {
    const match = URL_REGEX.exec(url);
    if (!match) {
        return null;
    }
    return {
        cdnHost: match[1],
        videoId: match[2],
    };
};

/**
 * Build a canonical watch URL.
 *
 * @param {string} cdnHost
 * @param {string} videoId
 * @returns {string}
 */
const watchUrl = (cdnHost, videoId) => `https://${cdnHost}/watch/${videoId}`;

/**
 * Ensure spotlightr.js is loaded from the account CDN.
 *
 * @param {string} cdnHost
 * @returns {Promise<void>}
 */
const loadScript = (cdnHost) => new Promise((resolve, reject) => {
    if (typeof window.spotlightrAPI === 'function') {
        resolve();
        return;
    }
    const existing = document.querySelector('script[data-spotlightr-api]');
    if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Spotlightr API')));
        return;
    }
    const tag = document.createElement('script');
    tag.src = `https://${cdnHost}/assets/spotlightr.js`;
    tag.async = true;
    tag.setAttribute('data-spotlightr-api', '1');
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Spotlightr API'));
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
});

/**
 * Ask Spotlightr's bridge to discover dynamically injected iframes.
 * The stock script only scans on DOMContentLoaded, which has already fired in Moodle.
 */
const registerIframes = () => {
    if (typeof window.loopThroughVooPlayerScripts === 'function') {
        window.loopThroughVooPlayerScripts();
    }
};

class Spotlightr {
    /**
     * Constructs a new Spotlightr player instance.
     */
    constructor() {
        this.type = 'spotlightr';
        this.useAnimationFrame = false;
        this.frequency = 0.25;
        this.support = {
            hideControls: true,
            playbackrate: false,
            quality: false,
            password: false,
        };
        this.currentTime = 0;
        this.rate = 1;
        this.volume = 1;
        this.muted = false;
        this.paused = true;
        this.ended = false;
        this.ready = false;
        this.eventsBound = false;
        this.aspectratio = 16 / 9;
        this._onReady = null;
        this.timers = [];
        this.destroyed = false;
    }

    /**
     * Schedule a timer that destroy() can cancel.
     *
     * Spotlightr's bridge is driven entirely by deferred probes, so an uncancelled timer can
     * fire after teardown and resurrect a destroyed instance.
     *
     * @param {Function} fn
     * @param {number} ms
     */
    defer(fn, ms) {
        const id = window.setTimeout(() => {
            if (this.destroyed) {
                return;
            }
            fn();
        }, ms);
        this.timers.push(id);
    }

    /**
     * Call the Spotlightr JS API for this video.
     *
     * @param {string} method
     * @param {*} [param]
     * @param {Function} [callback]
     */
    api(method, param = null, callback = null) {
        if (typeof window.spotlightrAPI !== 'function' || !this.videoId) {
            return;
        }
        if (callback) {
            window.spotlightrAPI(this.videoId, method, param, callback);
        } else if (param !== null) {
            window.spotlightrAPI(this.videoId, method, param);
        } else {
            window.spotlightrAPI(this.videoId, method);
        }
    }

    /**
     * Inject the advanced-style Spotlightr iframe.
     *
     * @param {string} node
     * @param {string} iframeSrc
     * @param {string} videoId
     */
    injectIframe(node, iframeSrc, videoId) {
        $(`#${node}`).replaceWith(
            `<iframe id="${node}" class="video-player-container spotlightr" data-playerid="${videoId}"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media;" allowtransparency="true"
                allowfullscreen="true" frameborder="0" scrolling="no"
                src="${iframeSrc}"></iframe>`
        );
    }

    /**
     * Fetch oEmbed metadata for a watch URL.
     * Spotlightr requires format=json or the endpoint returns an empty body.
     *
     * @param {string} url
     * @returns {Promise<Object>}
     */
    async fetchMeta(url) {
        try {
            const oembedUrl = 'https://api.spotlightr.com/getOEmbed?format=json&url='
                + encodeURIComponent(url);
            return await fetchOembed(oembedUrl);
        } catch {
            return {error: true};
        }
    }

    /**
     * Apply oEmbed fields onto this player instance.
     *
     * @param {Object} data
     * @returns {boolean} True when metadata was applied.
     */
    applyMeta(data) {
        if (!data || data.error) {
            return false;
        }
        if (data.title) {
            this.title = String(data.title).trim();
        }
        if (data.thumbnail_url) {
            this.posterImage = data.thumbnail_url;
        }
        if (data.width && data.height) {
            this.aspectratio = data.width / data.height;
        }
        if (data.duration) {
            // Recorded only as a fallback for finishReady. Deliberately not written to
            // this.totaltime: finishReady is the single writer of that field, and it publishes
            // duration minus frequency, so setting a raw value here made getDuration() return
            // one number before the player was ready and a different one after.
            this.oembedDuration = Number(data.duration);
        }
        return true;
    }

    /**
     * Show or hide Spotlightr's native control bar (exact doc signatures).
     *
     * @param {boolean} show
     */
    applyControls(show) {
        this.showControls = Boolean(show);
        if (this.showControls) {
            this.api('showControls', [1]);
        } else {
            this.api('hideControls', [0]);
        }
    }

    /**
     * Bind Spotlightr events once vooPlayerReady confirms the iframe API is live.
     *
     * @param {string} node
     * @param {number} start
     * @param {number} end
     * @param {boolean} showControls
     * @param {Function} [onReady]
     */
    bindEvents(node, start, end, showControls, onReady = null) {
        const self = this;
        this.showControls = showControls;

        const finishReady = (duration) => {
            if (self.eventsBound) {
                return true;
            }
            const rawDuration = Number(duration) || Number(self.oembedDuration) || 0;
            if (!rawDuration) {
                return false;
            }
            self.eventsBound = true;
            let totaltime = Number(rawDuration.toFixed(2)) - self.frequency;
            let clipEnd = !end || end == 0 ? totaltime : Math.min(end, totaltime);
            clipEnd = Number(clipEnd).toFixed(2);
            self.end = Number(clipEnd);
            self.start = start || 0;
            self.totaltime = Number(totaltime);
            self.duration = self.end - self.start;
            self.currentTime = self.start;

            self.api('showLocks', [0]);
            self.api('showOverlays', [0]);

            // spotlightrAPI postMessages are delayed 500ms; apply chrome after the player is live.
            self.applyControls(showControls);
            // Re-apply after the bridge delay so the hide/show message is not dropped.
            self.defer(() => {
                self.applyControls(showControls);
            }, 700);
            self.api('captions', false);
            self.captions = [{label: 'On', code: 'on'}];
            self.sendEvent('iv:playerLoaded', {
                tracks: self.captions,
                qualities: null,
            }, self.node);

            if (self.start > 0) {
                self.api('currentTime', [self.start]);
            }

            self.api('onPlay', null, () => {
                if (self.ended || self.currentTime >= self.end) {
                    self.api('currentTime', [self.start]);
                    self.currentTime = self.start;
                }
                self.applyControls(self.showControls);
                self.paused = false;
                self.ended = false;
                self.sendEvent('iv:playerPlay', null, self.node);
                self.sendEvent('iv:playerPlaying', {
                    time: self.currentTime,
                    rate: self.rate,
                }, self.node);
            });

            self.api('onPause', null, () => {
                self.paused = true;
                if (self.ended) {
                    // Reaching the clip end pauses the player, so this callback fires straight
                    // after iv:playerEnded was sent. Do not report it a second time.
                    return;
                }
                if (self.currentTime >= self.end) {
                    self.ended = true;
                    self.sendEvent('iv:playerEnded', null, self.node);
                } else {
                    self.sendEvent('iv:playerPaused', null, self.node);
                }
            });

            self.api('onEnded', null, () => {
                if (self.ended) {
                    return;
                }
                self.ended = true;
                self.paused = true;
                self.sendEvent('iv:playerEnded', null, self.node);
            });

            self.api('onSeeked', null, (time) => {
                const seekTime = typeof time === 'number' ? time : self.currentTime;
                self.currentTime = seekTime;
                self.ended = false;
                self.sendEvent('iv:playerSeek', {time: seekTime}, self.node);
            });

            self.api('onTimeUpdate', [self.frequency], (data) => {
                const t = data && data.returnValue !== undefined ? Number(data.returnValue) : Number(data);
                if (!Number.isFinite(t)) {
                    return;
                }
                self.currentTime = t;
                if (t < self.start) {
                    self.api('currentTime', [self.start]);
                    self.currentTime = self.start;
                    return;
                }
                if (t >= self.end) {
                    if (!self.ended) {
                        // Pause in place, as every other player does. Rewinding here would
                        // desync self.currentTime (which getCurrentTime returns straight from
                        // cache) from the real head; the onPlay handler below already returns
                        // to the clip start when playback resumes after the end.
                        self.ended = true;
                        self.paused = true;
                        self.api('pause');
                        self.sendEvent('iv:playerEnded', null, self.node);
                    }
                    return;
                }
                if (!self.paused && !self.ended) {
                    self.sendEvent('iv:playerPlaying', {
                        time: t,
                        rate: self.rate,
                    }, self.node);
                }
            });

            self.api('onVolumeChange', null, (data) => {
                const vol = data && data.returnValue !== undefined ? Number(data.returnValue) : Number(data);
                if (Number.isFinite(vol)) {
                    self.volume = vol;
                    self.muted = vol === 0;
                    self.sendEvent('iv:playerVolumeChange', {volume: vol}, self.node);
                }
            });

            self.api('onPlaybackSpeedChange', null, (data) => {
                const rate = data && data.returnValue !== undefined ? Number(data.returnValue) : Number(data);
                if (Number.isFinite(rate)) {
                    self.rate = rate;
                    self.sendEvent('iv:playerRateChange', {rate: rate}, self.node);
                }
            });

            self.sendEvent('iv:playerReady', null, self.node);
            if (typeof onReady === 'function') {
                onReady({
                    duration: self.totaltime,
                    title: self.title,
                    posterImage: self.posterImage,
                });
            }
            return true;
        };

        const handleReady = (event) => {
            if (self.destroyed) {
                return;
            }
            // Ignore ready events for other Spotlightr embeds on the page.
            if (event && event.detail && event.detail.video) {
                const readyId = String(event.detail.video);
                let decoded = '';
                try {
                    decoded = atob(self.videoId);
                } catch (e) {
                    decoded = '';
                }
                if (readyId !== self.videoId && readyId !== decoded) {
                    try {
                        if (btoa(readyId) !== self.videoId) {
                            return;
                        }
                    } catch (e) {
                        return;
                    }
                }
            }
            if (self.ready) {
                return;
            }
            self.ready = true;
            player[node] = {videoId: self.videoId};
            if (self._onReady) {
                document.removeEventListener('vooPlayerReady', self._onReady, false);
            }

            // The live player is authoritative. oEmbed carries Spotlightr's stored metadata,
            // which is typically rounded and can differ from the rendition actually served, so
            // it is a last resort rather than a parallel race: previously whichever answered
            // first won, and the same video could resolve to a different duration from one page
            // load to the next purely on timing.
            let liveAnswered = false;
            self.api('getDuration', null, (duration) => {
                liveAnswered = true;
                if (!finishReady(duration)) {
                    finishReady(self.oembedDuration);
                }
            });
            self.defer(() => {
                if (liveAnswered) {
                    return;
                }
                finishReady(self.oembedDuration);
            }, DURATION_TIMEOUT);
        };

        self._onReady = handleReady;
        document.addEventListener('vooPlayerReady', handleReady, false);

        // The getInfo() path rejects on its own timer, but the view path has nothing else
        // watching, so surface a failure rather than leaving the activity on a spinner.
        if (!onReady) {
            self.defer(() => {
                if (self.eventsBound) {
                    return;
                }
                self.sendEvent('iv:playerError', {
                    message: 'Spotlightr player did not report a duration.',
                }, self.node);
            }, READY_TIMEOUT);
        }

        // Late-loaded Moodle pages never get Spotlightr's DOMContentLoaded scan.
        registerIframes();

        // Safety net: if vooPlayerReady was missed, probe getDuration once the iframe has had time.
        self.defer(() => {
            if (self.ready) {
                return;
            }
            if (typeof window.spotlightrAPI !== 'function') {
                return;
            }
            registerIframes();
            self.api('getDuration', null, (duration) => {
                if (!self.destroyed && !self.ready && duration) {
                    handleReady();
                }
            });
        }, 2500);
    }

    /**
     * Get information about the video (form preview).
     *
     * @param {string} url
     * @param {string} node
     * @returns {Promise<Object>}
     */
    async getInfo(url, node) {
        this.node = node;
        const parsed = parseUrl(url);
        if (!parsed) {
            return Promise.reject(new Error('Invalid Spotlightr URL'));
        }
        this.cdnHost = parsed.cdnHost;
        this.videoId = parsed.videoId;
        const canonical = watchUrl(this.cdnHost, this.videoId);

        const data = await this.fetchMeta(canonical);
        if (!this.applyMeta(data)) {
            this.title = 'Private Video';
            this.aspectratio = 16 / 9;
        }

        // Always embed the account watch URL so the JS API can attach; oEmbed html may
        // point at a fallback host without advanced API support.
        this.injectIframe(node, canonical, this.videoId);
        await loadScript(this.cdnHost);
        registerIframes();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Spotlightr player ready timeout'));
            }, 20000);

            this.bindEvents(node, 0, 0, true, (info) => {
                clearTimeout(timeout);
                resolve(info);
            });
        });
    }

    /**
     * Load a Spotlightr player instance for the activity view.
     *
     * @param {string} url
     * @param {number} start
     * @param {number} end
     * @param {object} opts
     */
    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        this.node = node;
        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            this.sendEvent('iv:autoplayBlocked', null, this.node);
        }

        const parsed = parseUrl(url);
        if (!parsed) {
            this.sendEvent('iv:playerError', {message: 'Invalid Spotlightr URL'}, this.node);
            return;
        }
        this.cdnHost = parsed.cdnHost;
        this.videoId = parsed.videoId;
        const canonical = watchUrl(this.cdnHost, this.videoId);

        this.start = start || 0;
        this.end = end;
        this.ended = false;
        this.paused = true;
        this.ready = false;
        this.eventsBound = false;
        this.destroyed = false;
        this.timers.forEach(window.clearTimeout);
        this.timers = [];

        const data = await this.fetchMeta(canonical);
        if (!this.applyMeta(data) && opts.editform) {
            // Still attempt embed; metadata is best-effort.
            this.title = this.title || '';
            this.aspectratio = this.aspectratio || 16 / 9;
        }

        let iframeSrc = canonical;
        // Append start time query param when clipping.
        if (this.start > 0) {
            iframeSrc += `?t=${this.start}`;
        }

        $('.video-block, #video-block').remove();
        $('#annotation-canvas').removeClass('d-none w-0');
        // Iframe must exist before spotlightr.js scans / before we call the API bridge.
        this.injectIframe(node, iframeSrc, this.videoId);

        try {
            await loadScript(this.cdnHost);
        } catch (e) {
            this.sendEvent('iv:playerError', {message: e.message}, this.node);
            return;
        }
        registerIframes();
        this.bindEvents(node, this.start, end, showControls);
    }

    /**
     * Play the video.
     */
    play() {
        if (!player[this.node]) {
            return;
        }
        this.api('play');
        this.paused = false;
    }

    /**
     * Pause the video.
     */
    pause() {
        if (!player[this.node]) {
            return;
        }
        this.api('pause');
        this.paused = true;
    }

    /**
     * Stop and reset to start time.
     *
     * @param {number} starttime
     */
    stop(starttime) {
        if (!player[this.node]) {
            return;
        }
        this.api('currentTime', [starttime]);
        this.api('pause');
        this.currentTime = starttime;
        this.paused = true;
    }

    /**
     * Seek to a time in seconds.
     *
     * @param {number} time
     * @returns {boolean}
     */
    seek(time) {
        if (!player[this.node]) {
            return time;
        }
        if (time < 0) {
            time = 0;
        }
        this.ended = false;
        this.sendEvent('iv:playerSeekStart', {time: this.currentTime}, this.node);
        this.api('currentTime', [time]);
        this.currentTime = time;
        // The onSeeked callback dispatches iv:playerSeek once the player confirms the move,
        // matching html5video and bunnystream. Sending it here too would double it.
        return true;
    }

    /**
     * Current playback time (cached from onTimeUpdate).
     *
     * @returns {number}
     */
    getCurrentTime() {
        return this.currentTime || 0;
    }

    /**
     * Video duration (cached totaltime).
     *
     * @returns {number}
     */
    getDuration() {
        const totaltime = Number(this.totaltime);
        if (Number.isFinite(totaltime)) {
            return totaltime;
        }
        return 0;
    }

    /**
     * Whether the player is paused.
     *
     * @returns {boolean}
     */
    isPaused() {
        return this.paused;
    }

    /**
     * Whether the player is playing.
     *
     * @returns {boolean}
     */
    isPlaying() {
        return !this.paused;
    }

    /**
     * Whether playback has ended.
     *
     * @returns {boolean}
     */
    isEnded() {
        return this.ended;
    }

    /**
     * Aspect ratio.
     *
     * @returns {number}
     */
    ratio() {
        return this.aspectratio || 16 / 9;
    }

    /**
     * Tear down the player.
     */
    destroy() {
        // Set first: the deferred probes below check this before doing anything.
        this.destroyed = true;
        this.timers.forEach(window.clearTimeout);
        this.timers = [];
        if (this._onReady) {
            document.removeEventListener('vooPlayerReady', this._onReady, false);
            this._onReady = null;
        }
        // Restore the placeholder rather than removing it, so a subsequent load() has a node
        // to replace. Done unconditionally: a player that never became ready still left an
        // iframe behind.
        $(`#${this.node}`).replaceWith(`<div id="${this.node}" style="width:100%; max-width: 100%"></div>`);
        player[this.node] = null;
        this.ready = false;
        this.eventsBound = false;
        this.sendEvent('iv:playerDestroyed', null, this.node);
    }

    /**
     * Player state string.
     *
     * @returns {string}
     */
    getState() {
        return this.paused ? 'paused' : 'playing';
    }

    /**
     * Playback rate is not settable: Spotlightr documents the onPlaybackSpeedChange event but
     * no matching setter, which is why support.playbackrate is false. The requested rate is
     * echoed back (as bunnystream does) but deliberately not cached, so getRate() keeps
     * reporting the rate the player itself last announced.
     *
     * @param {number} rate
     * @returns {number}
     */
    setRate(rate) {
        return rate;
    }

    /**
     * Current playback rate.
     *
     * @returns {number}
     */
    getRate() {
        return this.rate || 1;
    }

    /**
     * Mute the player.
     */
    mute() {
        if (!player[this.node]) {
            return;
        }
        this.api('volume', [0]);
        this.muted = true;
        this.volume = 0;
    }

    /**
     * Unmute the player.
     */
    unMute() {
        if (!player[this.node]) {
            return;
        }
        this.api('volume', [1]);
        this.muted = false;
        this.volume = 1;
    }

    /**
     * Whether the player is muted.
     *
     * @returns {boolean}
     */
    isMuted() {
        return this.muted;
    }

    /**
     * Quality is not settable via documented Spotlightr API.
     *
     * @param {string} quality
     * @returns {string}
     */
    setQuality(quality) {
        return quality;
    }

    /**
     * Available qualities (unsupported).
     *
     * @returns {null}
     */
    async getQualities() {
        return null;
    }

    /**
     * Toggle captions visibility (Spotlightr has on/off only, no language codes).
     *
     * @param {string|boolean} track
     * @returns {boolean}
     */
    setCaption(track) {
        if (!player[this.node]) {
            return false;
        }
        // Empty string / falsy = Off; any code (e.g. "on") = show captions.
        const on = Boolean(track) && track !== 'off';
        this.api('captions', on);
        return true;
    }

    /**
     * Original player handle (Spotlightr uses a global API).
     *
     * @returns {Object|null}
     */
    originalPlayer() {
        return player[this.node] || null;
    }

    /**
     * Dispatch an IV player event.
     *
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

export default Spotlightr;
