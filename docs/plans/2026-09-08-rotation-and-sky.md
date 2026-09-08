# Rotation and sky

Occasional pointer-initiated rotation animates for spatial consistency. One clockwise button advances 90 degrees over 250 ms using cubic-bezier(0.77, 0, 0.175, 1). The existing Three.js render loop changes the camera transform without an animation dependency. Repeated clicks retarget from the displayed angle; each click adds one quarter turn. Keyboard and reduced-motion activations settle instantly. Entering a room, resizing, or changing framing finishes the pending rotation; reset clears it.

A procedural, static twelve-triangle skybox adds a blue zenith, pale horizon and soft sun. It follows camera position, works in both camera modes, and needs no image downloads. Distant ground fades toward the horizon. Existing lighting and model budgets remain in place.

Watch agents starts closed. Rotation remains distinct from the home-shaped reset-camera control.

Verification: quarter-turn timing, exact endpoints, rapid retargeting, reduced-motion/keyboard behavior, reset, production build, fresh page with Watch closed, and rendered sky in first person.
