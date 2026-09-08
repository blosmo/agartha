# Room camera controls

Add discrete 90-degree overview rotation around the current pan target, preserving zoom. Add an Enter room control that switches the existing renderer to a perspective camera at eye height inside the selected plot. Exit restores the overview camera unchanged.

Mobile: left thumb joystick moves relative to heading; drag the remaining canvas to look. Desktop: WASD/arrows move and drag looks. Clamp pitch and frame time, normalize diagonal movement, constrain movement to the room footprint, release inputs on cancellation, blur and visibility changes. Switching rooms exits first person. Keep the existing scene/model loading and shared-world edits unchanged.

Use a separate camera controller and joystick component; add focused tests for rotation, movement, cancellation and mode changes. Verify build and browser views at desktop and mobile sizes. This is a camera walkthrough, without gravity or full mesh collision simulation.
