# Ember 0.6.1

All editions use a 132% default interface and font scale, a 10% relative increase from 120%. Explicit saved scale preferences take priority. Recommendation card explanations are hidden. Player panels use a translucent blurred surface, animated opening and closing, an accessible close control and keyboard focus containment. Episode thumbnails and row padding are larger without changing episode title typography.

Web additionally retains the earlier compact mobile Home layout. Phone catalog rows show three full cards and a fourth-card preview. The phone density factor is now 0.95, increased from 0.85. Continue Watching cards use wider landscape thumbnails. Phone and foldable player panels fill the viewport. At medium portrait tablet widths panels also fill the viewport, while laptop widths retain side panels.

The compact profile picker uses a carousel. The selected profile is larger and full color; adjacent profiles are smaller and gray. Arrows, swipe and keyboard arrows select profiles. Selecting the centered profile opens it, including its existing PIN flow. Signed-in accounts start at their first profile and can move left to Guest. Signed-out users see Guest and a separate Log in / Sign up link.

Web now records application navigation in browser session history. Browser Back and Forward restore pages, title details, dialogs and playback during the current visit. The player Back control also returns to the preceding application view. Browser history contains opaque entry identifiers; playback provider URLs and profile content stay in the application's memory.

Frontend builds and existing JavaScript tests passed for Web, Linux and Windows (58, 56, 55). Browser UI checks exercised compact Guest selection, an account carousel with synthetic profiles, fullscreen settings panels, animated dismissal, Back from Discover to Home and playback to Home, card density at 280/360/540/800-pixel widths and larger viewport checks. Foldable and tablet checks use simulated viewport sizes. The native RPM and NSIS installers were compiled and their extracted contents checked. Fedora workstation installation/playback and Windows runtime testing require testing on those systems. Windows setup is unsigned.

The Linux 0.5.2 and Windows 0.5.1 native playback backends remain the source baselines. Source recovery archives remain in originals/. History, recommendations and history PIN behavior from 0.6.0 are included. The existing history SQL migration is sufficient; this UI update adds no database schema requirements.
