# Third-party notices

Flip Buddies' original code, documentation, game artwork, and supplied songs use
the [MIT license](LICENSE). Dependencies keep their own licenses. Retain their
notices when you distribute the website or source.

The following notices are copied from the installed packages. They are also
included in `dist/licenses/` by the website build.

| Package | Installed version | License | Included notice |
| --- | --- | --- | --- |
| React | 19.2.8 | MIT | [react.txt](public/licenses/react.txt) |
| React DOM | 19.2.8 | MIT | [react-dom.txt](public/licenses/react-dom.txt) |
| Scheduler | 0.27.0 | MIT | [scheduler.txt](public/licenses/scheduler.txt) |
| Three.js | 0.180.0 | MIT | [three.txt](public/licenses/three.txt) |
| Lucide React | 0.468.0 | ISC, with upstream Feather notices | [lucide-react.txt](public/licenses/lucide-react.txt) |
| PartySocket | 1.3.0 | MIT | [partysocket.txt](public/licenses/partysocket.txt) |
| event-target-polyfill | 0.0.4 | MIT | [event-target-polyfill.txt](public/licenses/event-target-polyfill.txt) |
| UI SFX | 0.4.0 | MIT | [uisfx.txt](public/licenses/uisfx.txt) |
| Fredoka, through @fontsource/fredoka | 5.3.0 | SIL Open Font License 1.1 | [fredoka.txt](public/licenses/fredoka.txt) |
| Nunito, through @fontsource/nunito | 5.3.0 | SIL Open Font License 1.1 | [nunito.txt](public/licenses/nunito.txt) |

PartySocket's supplied notice includes its reconnecting-websocket origin.
UI SFX creates this game's sound effects through its Web Audio runtime. The
project does not copy UI SFX's separate downloadable sound files.

The five original background songs have their own
[asset record](public/audio/music/README.md). They are part of this project's
MIT release, separate from UI SFX.

Development and deployment tools are installed through npm. Their licenses are
included in their packages and recorded in `package-lock.json`. If you distribute
a copy of those packages, retain their notices too. When you update a runtime
dependency or font, update this table and its notice from the new package.
