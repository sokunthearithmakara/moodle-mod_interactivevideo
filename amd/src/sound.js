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
 * Sound effects made of short tones, so no audio files are needed.
 *
 * @module     mod_interactivevideo/sound
 * @copyright  2026 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Tones repeated at an even pace.
 *
 * @param {Array} tones The tones of one repeat.
 * @param {number} every Seconds from one repeat to the next.
 * @param {number} times How many repeats.
 * @returns {Array}
 */
const repeat = (tones, every, times) => Array.from({length: times}, (_, i) => i * every)
    .flatMap((offset) => tones.map((tone) => ({...tone, start: tone.start + offset})));

/**
 * Each tone: wave shape, start and end frequency (Hz), start time and length (s), volume.
 *
 * @type {Object<string, Array>}
 */
const SOUNDS = {
    // Something opened or was detected.
    pop: [
        {wave: 'sine', from: 620, to: 880, start: 0, length: 0.07, volume: 0.16},
    ],
    // Marked done.
    point: [
        {wave: 'triangle', from: 523, start: 0, length: 0.12, volume: 0.2},
        {wave: 'triangle', from: 659, start: 0.09, length: 0.12, volume: 0.2},
        {wave: 'triangle', from: 1047, start: 0.18, length: 0.3, volume: 0.2},
    ],
    // Marked undone.
    undo: [
        {wave: 'sine', from: 587, start: 0, length: 0.14, volume: 0.18},
        {wave: 'sine', from: 440, to: 392, start: 0.12, length: 0.24, volume: 0.18},
    ],
    // A timer's interval: single beeps for 3 seconds.
    shortalarm: repeat([
        {wave: 'sine', from: 880, start: 0, length: 0.25, volume: 0.25},
    ], 0.55, 6),
    // A timer's end: two-tone beeps for 10 seconds.
    alarm: repeat([
        {wave: 'sine', from: 880, start: 0, length: 0.16, volume: 0.28},
        {wave: 'sine', from: 660, start: 0.18, length: 0.2, volume: 0.28},
    ], 0.5, 20),
};

/** @type {AudioContext|null} */
let context = null;

/**
 * The oscillators of each effect still to sound, so they can be stopped.
 *
 * @type {Object<string, Set<OscillatorNode>>}
 */
const playing = {};

/**
 * Plays a sound effect. Does nothing where the browser has no Web Audio.
 *
 * @param {string} name pop, point, undo, shortalarm or alarm
 */
export const play = (name) => {
    const tones = SOUNDS[name];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!tones || !AudioContextClass) {
        return;
    }
    try {
        context = context || new AudioContextClass();
        if (context.state === 'suspended') {
            context.resume();
        }
        const now = context.currentTime;
        playing[name] = playing[name] || new Set();
        const sounding = playing[name];
        tones.forEach((tone) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const start = now + tone.start;
            const end = start + tone.length;
            oscillator.type = tone.wave;
            oscillator.frequency.setValueAtTime(tone.from, start);
            if (tone.to) {
                oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
            }
            // A quick attack and a fading release, so the tone doesn't click.
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(start);
            oscillator.stop(end + 0.02);
            sounding.add(oscillator);
            oscillator.onended = () => sounding.delete(oscillator);
        });
    } catch (e) {
        // A sound effect is never worth an error.
    }
};

/**
 * Stops a sound effect that is still sounding, such as a timer's alarm.
 *
 * @param {string} name
 */
export const stop = (name) => {
    (playing[name] || []).forEach((oscillator) => {
        try {
            oscillator.stop();
        } catch (e) {
            // Already stopped.
        }
    });
    delete playing[name];
};

/**
 * How long a sound effect lasts.
 *
 * @param {string} name
 * @returns {number} Milliseconds
 */
export const duration = (name) => Math.round(
    Math.max(0, ...(SOUNDS[name] || []).map((tone) => tone.start + tone.length)) * 1000
);

/**
 * The effects as objects with play(), for code written for HTMLAudioElement
 * such as window.IVAudio.pop.play().
 *
 * @returns {Object<string, {play: function(): Promise}>}
 */
export const effects = () => Object.fromEntries(Object.keys(SOUNDS).map((name) => [name, {
    play: () => {
        play(name);
        return Promise.resolve();
    },
}]));
