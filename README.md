# Score to ESC

A static browser app that turns digital sheet music into short, monophonic RTTTL startup melodies for AM32 and Bluejay ESC melody editors. No backend, account, API key, build step, or runtime CDN is required. Your imported score stays in your browser.

## Supported inputs

| Input | Support |
| --- | --- |
| `.musicxml`, `.xml` | Partwise MusicXML, including multiple parts, staffs and voices, rests, chords, duration divisions, backups/forwards, ties and transposing instruments |
| `.mxl` | ZIP-compressed MusicXML; follows `META-INF/container.xml` to the root score |
| `.mid`, `.midi` | Standard MIDI type 0 and 1 with ticks-per-quarter timing; tempo maps, running status and separate track/channel choices |
| `.rtttl`, `.txt` | Single-dot RTTTL with note lengths 1, 2, 4, 8, 16, 32 and 64; also paste RTTTL directly |
| `.mscz`, `.sib`, `.dorico` | Export from the notation editor to MusicXML or MIDI first |
| PDF, scan, photo | Not supported directly. Use optical music recognition, correct the recognized notation in a score editor, and export MusicXML or MIDI |
| Audio / MP3 | Not supported; this is a notation converter, not audio transcription |

MuseScore users: **File → Export**, then select MusicXML or MIDI. The `examples` folder includes the same scale as uncompressed MusicXML, compressed MXL and MIDI, plus the built-in sample as RTTTL. All examples are generated for this project.

## Workflow

1. Import a score and select the part/staff/voice or MIDI track/channel containing the melody.
2. Choose tempo, transpose, and the excerpt's start and length. **Excerpt times follow the output tempo**, before rhythm quantization. Changing tempo changes which source notes fall in a fixed seconds window.
3. Choose highest-note or lowest-note priority for overlaps. Each exported melody has one pitch at a time.
4. Leave octave folding enabled to bring pitches into C4–B6. Disable it to reject out-of-range pitches instead. C4–B6 avoids low pitches that the reference Bluejay encoder cannot represent reliably.
5. Review the piano roll, warnings, final duration, token count and encoded byte count. Playback and WAV export use the **same quantized and trimmed phrase** as RTTTL.
6. Copy RTTTL or save `.rtttl`. Paste the string into your ESC configurator's startup melody field and preview it there before saving.

AM32's official configurator uses a `STARTUP_MELODY` RTTTL field and the `bluejay-rtttl-parse` encoder. This app targets that workflow. It does not require changes to your flight-controller firmware, and it does not connect to or write your ESCs. BLHeli_32's separate music syntax is **not** implemented.

Use a configurator compatible with your exact ESC firmware and settings layout. Remove propellers before configuring powered ESCs. The software preview is synthesized; motor sound and volume will differ. It has not been verified on physical ESC hardware.

## Size limits and musical simplification

- Default excerpt: 8 seconds; adjustable from 0.1 to 60 seconds.
- Default token budget: 50 notes/rests; adjustable up to 62. This is a separate convenience limit, **not** a byte estimate.
- Hardware encoding budget: **128 bytes including the 4-byte header**. The app uses vendored `bluejay-rtttl-parse` 2.0.2, matching the encoder dependency in the AM32 configurator inspected for this project. A long/high note or a long pause may occupy several two-byte entries.
- With trimming enabled, complete tokens are retained up to both budgets. The app reports when it trims the phrase. If the first token alone cannot fit, shorten the excerpt or raise the tempo. With trimming disabled, over-budget melodies are allowed for editing, with a warning; do not assume they will fit on hardware.
- Simultaneous pitches become the highest or lowest active pitch. Separate voices can be selected, but this version does not distribute chords among multiple ESCs.
- Notes are rounded to the closest standard or single-dotted RTTTL duration. Notes longer than a dotted whole note are split and may retrigger on hardware. Quantization can change overall timing; the app reports the sum of absolute segment duration changes.
- Leading silence is optionally removed; trailing silence is always removed. Rests inside the melody remain.
- MusicXML repeat signs and endings are read once in written order; grace notes, articulations, dynamics, fermatas and ornaments are omitted. Tempo changes are flattened to the selected tempo. Export **unfolded MIDI** when repeats and tempo changes are needed.
- MIDI tempo changes are baked into the relative note durations before quantization. Percussion channel 10 is omitted; sustain pedal is ignored, so MIDI note-off events determine duration. SMPTE timing and MIDI format 2 are rejected with an explanatory error.
- Imports are limited to 10 MB, MXL uncompressed content to 40 MB and scores to 50,000 pitched notes.

## Third-party code and references

- `fflate` 0.8.2 (MIT), vendored UMD build for offline ZIP/MXL decompression: https://github.com/101arrowz/fflate
- `bluejay-rtttl-parse` 2.0.2 (MIT), copyright Dinesh Manajipet and Adam Rahwane: https://github.com/saidinesh5/bluejay-rtttl-parse
  - The source is bundled with its license header intact. Only the final export wrapper is adapted to expose `BluejayRTTTL` in a classic browser script and CommonJS in tests.
  - It logs a console warning for nonstandard RTTTL BPM values (for example 120), but retains and encodes the requested numeric tempo. The app uses integer BPM and previews that tempo.
- AM32 configurator RTTTL field/encoder implementation: https://github.com/am32-firmware/am32-configurator/blob/master/components/SettingField.vue

Original project code is MIT licensed; see `LICENSE`.
