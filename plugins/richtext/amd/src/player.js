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
 * Sticky audio player for Rich Text interaction.
 *
 * @module     ivplugin_richtext/player
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import $ from 'jquery';
import {get_strings as getStrings} from 'core/str';
import ModalEvents from 'core/modal_events';

const RATES = [1, 1.25, 1.5, 0.75];

const words = {
    play: 'Play', pause: 'Pause', stop: 'Stop', speed: 'Playback speed', audioprogress: 'Audio progress',
};
let wordsPromise = null;
let activeCleanup = null;
let initToken = 0;

/**
 * Load localised strings for player controls.
 *
 * @returns {Promise<Object>}
 */
const loadWords = () => {
    if (!wordsPromise) {
        const keys = Object.keys(words);
        wordsPromise = getStrings(keys.map(key => ({key, component: 'ivplugin_richtext'})))
            .then(list => {
                keys.forEach((key, i) => {
                    words[key] = list[i];
                });
                return words;
            })
            .catch(() => words);
    }
    return wordsPromise;
};

/**
 * Format seconds as M:SS.
 *
 * @param {number} seconds
 * @returns {string}
 */
const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/**
 * Stop any active player.
 */
export const stop = () => {
    initToken++;
    if (typeof activeCleanup === 'function') {
        const fn = activeCleanup;
        activeCleanup = null;
        fn();
    }
};

/**
 * Build the sticky audio bar DOM and wire it to a controller source.
 *
 * @param {HTMLElement} wrap The `.iv-richtext-audio-wrap` container.
 * @param {Object} source Controller `{play, pause, stop, seek, time, duration, paused, atStart, setRate}`.
 * @returns {{update: Function}}
 */
const renderStickyBar = (wrap, source) => {
    wrap.textContent = '';
    const bar = document.createElement('div');
    bar.className = 'iv-rt-audio-bar';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'iv-rt-audio-btn iv-rt-audio-play';
    playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'iv-rt-audio-btn iv-rt-audio-stop';
    stopBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
    stopBtn.title = words.stop;
    stopBtn.setAttribute('aria-label', words.stop);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'iv-rt-audio-progress-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'iv-rt-audio-slider';
    slider.min = '0';
    slider.max = '100';
    slider.step = 'any';
    slider.value = '0';
    slider.setAttribute('aria-label', words.audioprogress);
    progressWrap.appendChild(slider);

    const timeEl = document.createElement('span');
    timeEl.className = 'iv-rt-audio-time';
    timeEl.textContent = '0:00 / 0:00';

    let rateIndex = 0;
    const speedBtn = document.createElement('button');
    speedBtn.type = 'button';
    speedBtn.className = 'iv-rt-audio-speed';
    speedBtn.textContent = '1×';
    speedBtn.title = words.speed;
    speedBtn.setAttribute('aria-label', `${words.speed} 1×`);

    bar.append(playBtn, stopBtn, progressWrap, timeEl, speedBtn);
    wrap.appendChild(bar);
    wrap.classList.remove('d-none');

    let lastPaused = null;
    const update = () => {
        const duration = source.duration() || 0;
        const position = Math.min(source.time() || 0, duration || Infinity);
        const pct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
        slider.max = String(duration > 0 ? duration : 100);
        slider.value = String(duration > 0 ? position : 0);
        slider.style.setProperty('--iv-rt-progress', `${pct}%`);
        timeEl.textContent = `${formatTime(position)} / ${formatTime(duration)}`;

        const paused = !!source.paused();
        stopBtn.disabled = paused && !!source.atStart();
        if (lastPaused !== paused) {
            lastPaused = paused;
            const label = paused ? words.play : words.pause;
            playBtn.title = label;
            playBtn.setAttribute('aria-label', label);
            playBtn.innerHTML = paused ? '<i class="bi bi-play-fill"></i>' : '<i class="bi bi-pause-fill"></i>';
            bar.classList.toggle('is-playing', !paused);
        }
    };

    playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (source.paused()) {
            source.play();
        } else {
            source.pause();
        }
        update();
    });

    stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        source.stop();
        update();
    });

    slider.addEventListener('input', () => {
        source.seek(Number(slider.value) || 0);
        update();
    });

    speedBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rateIndex = (rateIndex + 1) % RATES.length;
        const nextRate = RATES[rateIndex];
        source.setRate(nextRate);
        speedBtn.textContent = `${nextRate}×`;
        speedBtn.setAttribute('aria-label', `${words.speed} ${nextRate}×`);
        update();
    });

    update();
    return {update};
};

/**
 * Create an audio file controller source.
 *
 * @param {string} url Audio file URL.
 * @param {Function} onChange Callback when state/time changes.
 * @returns {Object}
 */
const createAudioFileSource = (url, onChange) => {
    const audio = new Audio(url);
    audio.preload = 'metadata';
    let rate = 1;
    let wantPlay = false;

    const handleEvent = (ev) => {
        if ((ev.type === 'play' || ev.type === 'playing') && !wantPlay) {
            audio.pause();
        }
        if (ev.type === 'pause' || ev.type === 'ended' || ev.type === 'error') {
            wantPlay = false;
        }
        onChange();
    };

    const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'playing', 'pause', 'ended', 'error'];
    events.forEach(ev => audio.addEventListener(ev, handleEvent));

    return {
        play: () => {
            wantPlay = true;
            audio.playbackRate = rate;
            const p = audio.play();
            if (p && p.then) {
                p.then(() => {
                    // Paused before playback started: stay where we are.
                    if (!wantPlay) {
                        audio.pause();
                    }
                    onChange();
                    return true;
                }).catch(() => {
                    wantPlay = false;
                    onChange();
                });
            }
        },
        pause: () => {
            wantPlay = false;
            audio.pause();
        },
        stop: () => {
            wantPlay = false;
            audio.pause();
            try {
                audio.currentTime = 0;
            } catch (e) {
                // Ignore if metadata is not ready.
            }
            onChange();
        },
        seek: (seconds) => {
            audio.currentTime = Math.max(0, Math.min(seconds, isFinite(audio.duration) ? audio.duration : seconds));
        },
        time: () => audio.currentTime || 0,
        duration: () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0),
        paused: () => !wantPlay && audio.paused,
        atStart: () => (audio.currentTime || 0) < 0.05,
        setRate: (newRate) => {
            rate = newRate;
            audio.playbackRate = newRate;
        },
        destroy: () => {
            wantPlay = false;
            events.forEach(ev => audio.removeEventListener(ev, handleEvent));
            audio.pause();
            audio.src = '';
            audio.removeAttribute('src');
            audio.load();
        },
    };
};

/**
 * Initialize the sticky audio player for a rendered Rich Text annotation.
 *
 * @param {Object} annotation The annotation record.
 * @param {jQuery} $body The `.modal-body` element containing the rendered content.
 * @param {boolean} [canAutoplay=true] Whether autoplay is permitted in the current view mode.
 */
export const initPlayer = async(annotation, $body, canAutoplay = true) => {
    stop();
    const token = ++initToken;
    if (!$body || !$body.length) {
        return;
    }
    const wrap = $body[0].querySelector('.iv-richtext-audio-wrap');
    if (!wrap) {
        return;
    }

    const audioUrl = wrap.dataset.audioUrl || '';
    if (!audioUrl) {
        return;
    }
    const autoplay = wrap.dataset.autoplay === '1';
    const ns = 'ivrichtextaudio-' + annotation.id;

    let hasBeenVisible = false;

    const isWrapVisible = () => {
        if (!wrap || !wrap.isConnected) {
            return false;
        }
        if (wrap.closest('#annotation-sidebar.hide')) {
            return false;
        }
        if (wrap.closest('#annotation-sidebar') && !document.body.classList.contains('hassidebar')) {
            return false;
        }
        const visibleNow = wrap.getClientRects().length > 0;
        if (visibleNow) {
            hasBeenVisible = true;
        } else if (hasBeenVisible) {
            return false;
        }
        return true;
    };

    await loadWords();
    if (token !== initToken || !wrap.isConnected) {
        return;
    }

    let barCtrl = null;
    const onChange = () => {
        if (barCtrl) {
            barCtrl.update();
        }
    };

    const source = createAudioFileSource(audioUrl, onChange);
    barCtrl = renderStickyBar(wrap, source);

    const haltPlayback = () => {
        source.stop();
        onChange();
    };

    const modalEl = wrap.closest('.modal');
    const checkVisibility = () => {
        if (!wrap.isConnected) {
            stop();
            return;
        }
        // Only measure layout while audio is playing; a paused player has nothing to halt.
        if (!source.paused() && !isWrapVisible()) {
            haltPlayback();
        }
    };

    const watchTimer = setInterval(checkVisibility, 250);

    const cleanup = () => {
        clearInterval(watchTimer);
        $(document).off('.' + ns);
        $(window).off('.' + ns);
        if (modalEl) {
            $(modalEl).off('.' + ns);
        }
        source.destroy();
    };
    activeCleanup = cleanup;

    $(document).on(`interactionclose.${ns} interactionrefresh.${ns}`, (e) => {
        const closed = e.originalEvent?.detail?.annotation || e.detail?.annotation;
        if (closed && closed.id != annotation.id) {
            return;
        }
        haltPlayback();
        if (!wrap.isConnected) {
            stop();
        }
    });

    $(document).on(`interactionrun.${ns}`, (e) => {
        const runAnno = e.originalEvent?.detail?.annotation || e.detail?.annotation;
        if (!runAnno) {
            return;
        }
        if (runAnno.id != annotation.id) {
            haltPlayback();
        } else if (isWrapVisible() && autoplay && canAutoplay) {
            source.play();
            onChange();
        }
    });

    $(document).on(
        `iv:playerPlay.${ns} iv:playerPlaying.${ns} iv:playerSeek.${ns} iv:playerRestart.${ns} fb:refresh_interaction.${ns}`,
        () => {
            haltPlayback();
        }
    );

    const closeSelectors = [
        `#close-${annotation.id}`,
        '#annotation-modal [data-dismiss="modal"]',
        '#annotation-modal [data-bs-dismiss="modal"]',
        '#annotation-modal [data-action="hide"]',
    ].join(', ');
    $(document).on(`click.${ns}`, closeSelectors, function() {
        const blockedByCompletion = document.querySelector('#controller.completion-required')
            && !this.classList.contains('force-dismiss');
        if (!blockedByCompletion) {
            haltPlayback();
        }
        setTimeout(checkVisibility, 50);
        setTimeout(checkVisibility, 350);
    });

    if (modalEl) {
        $(modalEl).on(`hide.bs.modal.${ns} hidden.bs.modal.${ns} ${ModalEvents.hidden}.${ns}`, () => {
            haltPlayback();
            setTimeout(checkVisibility, 50);
        });
    }

    $(window).on(`pagehide.${ns} beforeunload.${ns}`, stop);

    if (autoplay && canAutoplay && isWrapVisible()) {
        source.play();
    }
};

export default {
    initPlayer,
    stop,
};
